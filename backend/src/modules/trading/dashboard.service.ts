import { prisma } from '../../lib/prisma.js';
import { getMarketStatus } from '../binance/market.service.js';
import { tradingService } from './trading.service.js';
import { billingService } from '../fees/billing.service.js';
import { signalsOverview } from '../bot/analysis.service.js';

const num = (v: unknown) => Number(v ?? 0);
const DAY = 864e5;

export const dashboardService = {
  async dashboardSync(userId: string) {
    const market = await getMarketStatus();
    
    // Fire all major dashboard queries concurrently
    const [
      account,
      stats,
      bot,
      positions,
      usage,
      trades,
      perf,
      log,
      watchlistData,
      bpnl
    ] = await Promise.all([
      tradingService.account(userId),
      tradingService.stats(userId),
      prisma.botConfig.findUnique({ where: { userId } }),
      tradingService.positions(userId),
      billingService.usageMeter(userId),
      tradingService.trades(userId),
      tradingService.performanceByCoin(userId),
      prisma.auditLog.findMany({ where: { userId, action: { in: ['BOT_START', 'BOT_PAUSE', 'BOT_STOP', 'ERROR'] } }, orderBy: { createdAt: 'desc' }, take: 10 }).then(logs => logs.map(l => ({ id: l.id, title: l.action, body: (l.metadata as any)?.message ?? '', createdAt: l.createdAt.toISOString() }))), // Or actual log logic
      prisma.watchlist.findFirst({ where: { userId, isDefault: true } }),
      tradingService.binancePnl(userId)
    ]);
    
    const symbols = (watchlistData?.symbols ?? ['BTCUSDT']).slice(0, 50);
    const signals = await signalsOverview(symbols, bot, market);
    
    // Compute analytics
    const analytics = this.deriveAnalytics(trades, signals, perf, bot, market, account, stats);
    
    return {
      account,
      stats,
      bot,
      positions,
      usage,
      market,
      trades,
      perf,
      log,
      watchlist: watchlistData?.symbols ?? [],
      bpnl,
      signals,
      analytics
    };
  },

  deriveAnalytics(
    trades: any[], signals: any[], perf: any[], bot: any, market: any, account: any, stats: any
  ) {
    const now = Date.now();
    const sorted = [...trades].sort((a, b) => +new Date(a.closedAt) - +new Date(b.closedAt));

    // cumulative equity + drawdown
    const equity: { t: string; pnl: number }[] = [];
    const drawdown: { t: string; dd: number }[] = [];
    let cum = 0, peak = 0, maxDrawdown = 0;
    for (const tr of sorted) {
      cum += num(tr.netPnl);
      peak = Math.max(peak, cum);
      const dd = cum - peak;
      maxDrawdown = Math.max(maxDrawdown, peak - cum);
      const label = new Date(tr.closedAt).toLocaleDateString();
      equity.push({ t: label, pnl: +cum.toFixed(2) });
      drawdown.push({ t: label, dd: +dd.toFixed(2) });
    }

    const volume = trades.reduce((s, t) => s + num(t.entryPrice) * num(t.quantity), 0);
    const fees = trades.reduce((s, t) => s + num(t.feeUsd), 0);

    const within7 = (t: any) => +new Date(t.closedAt) >= now - 7 * DAY;
    const trades7d = trades.filter(within7);
    const realized7d = trades7d.reduce((s, t) => s + num(t.netPnl), 0);
    const gains = trades7d.filter((t) => num(t.netPnl) > 0).reduce((s, t) => s + num(t.netPnl), 0);
    const losses = trades7d.filter((t) => num(t.netPnl) < 0).reduce((s, t) => s + Math.abs(num(t.netPnl)), 0);
    const profitFactor = losses > 0 ? (gains / losses).toFixed(2) : gains > 0 ? '∞' : '—';

    // calendar-today
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const todayAll = trades.filter((t) => +new Date(t.closedAt) >= +startToday)
      .sort((a, b) => +new Date(b.closedAt) - +new Date(a.closedAt));
    const todayTrades = todayAll.map((t) => ({ ...t, reason: this.tradeReason(t) }));
    const todayWins = todayTrades.filter((t) => num(t.netPnl) > 0).length;
    const todayLosses = todayTrades.filter((t) => num(t.netPnl) < 0).length;
    const todayPnl = todayTrades.reduce((s, t) => s + num(t.netPnl), 0);
    const todayWinRate = todayTrades.length ? Math.round((todayWins / todayTrades.length) * 100) : 0;

    const directional = signals.filter((s) => s.bias !== 'none');
    const top = [...directional].sort((a, b) => b.score - a.score)[0] ?? null;
    const longSetups = signals.filter((s) => s.bias === 'long').length;
    const shortSetups = signals.filter((s) => s.bias === 'short').length;
    const qualifying = signals.filter((s) => s.allPass).length;
    const decisions = signals.length;
    const blocked = signals.filter((s) => !s.allPass).length;
    const threshold = bot?.scoreThreshold ?? 85;
    const btc = market?.btcTrend ?? 'neutral';

    // most common blocking reasons
    const blkTally = new Map<string, number>();
    for (const s of signals) if (!s.allPass && s.bias !== 'none') blkTally.set(s.blocking, (blkTally.get(s.blocking) ?? 0) + 1);
    const topBlocks = [...blkTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    // narrative
    const dailyNarrative = todayTrades.length === 0
      ? `No trades closed today. ${btc === 'bearish' ? 'BTC is bearish so long alt setups are gated' : btc === 'bullish' ? 'BTC is bullish — the bot favours longs' : 'BTC is neutral'}, and the ${threshold}-score quality bar only passes the best setups. Best setups still forming below ${threshold}.`
      : `Today: ${todayTrades.length} trade${todayTrades.length > 1 ? 's' : ''} closed (${todayWins}W/${todayLosses}L, ${todayWinRate}% win rate) for ${todayPnl >= 0 ? '+' : ''}$${todayPnl.toFixed(2)}. ${btc === 'bearish' ? 'Frequency is low because BTC is bearish (longs gated), plus' : 'On top of that,'} the ${threshold}-score quality bar only passes the best setups.`;

    const tone = (t: string) => t;
    const whyCards = [
      { icon: bot?.status === 'RUNNING' ? '🟢' : '📉', tone: tone(bot?.status === 'RUNNING' ? 'good' : 'info'),
        text: bot?.status === 'RUNNING' ? 'The live bot is running and evaluating every watchlist coin each tick.' : `The bot is ${bot?.status?.toLowerCase() ?? 'stopped'} — signals below are computed but no orders fire until you Start it.` },
      { icon: '🟦', tone: tone('blue'),
        text: btc === 'bearish' ? 'BTC is BEARISH — the alt-long critical gate blocks every LONG alt setup. Only shorts can fire.'
          : btc === 'bullish' ? 'BTC is BULLISH — the trend favours longs; short alt setups face the counter-trend gate.'
          : 'BTC is NEUTRAL — both directions are allowed; the score bar does the filtering.' },
      { icon: '🟧', tone: tone('warn'),
        text: topBlocks.length ? `Most common blockers right now: ${topBlocks.map(([b, n]) => `${b} (${n})`).join('; ')}.` : 'No recurring blockers — conditions are clean across the watchlist.' },
      { icon: qualifying > 0 ? '🟩' : '⚪', tone: tone(qualifying > 0 ? 'good' : 'info'),
        text: qualifying > 0 ? `${qualifying} coin${qualifying > 1 ? 's' : ''} clear${qualifying > 1 ? '' : 's'} the ${threshold} score bar and would trade on the next tick.` : `No coin clears the ${threshold} score threshold yet — by design the bot waits for high-quality setups. Quiet days are expected.` },
    ];

    const edge = shortSetups > longSetups ? 'SHORT' : longSetups > shortSetups ? 'LONG' : 'BALANCED';
    const proRead = [
      { icon: '⚪', tone: tone('info'), text: `Limits: concurrency ${bot?.maxConcurrentPositions ?? 1} position(s), score threshold ${threshold}, max ${bot?.maxTradesPerDay ?? '—'} trades/day.` },
      { icon: '🟧', tone: tone('warn'),
        text: edge === 'BALANCED' ? `Edge is balanced (${longSetups} long / ${shortSetups} short setups). No strong directional lean — let the score bar decide.`
          : `Edge today leans ${edge} (${shortSetups} short / ${longSetups} long setups). BTC is ${btc} — ${edge === 'SHORT' && btc === 'bearish' || edge === 'LONG' && btc === 'bullish' ? `${edge} is the trend-aligned, higher-probability side, and the bot is correctly favouring it.` : 'watch for counter-trend risk.'}` },
      { icon: '🟦', tone: tone('blue'),
        text: qualifying > 0 ? `${qualifying} setup(s) qualify — the bot will take them on the next tick if margin and daily caps allow.`
          : `Setups are forming below ${threshold}. Either hold for quality, or lower the score threshold (e.g. ${Math.max(70, threshold - 7)}) to capture trend-aligned ${edge.toLowerCase()}s. Do NOT force counter-trend trades against BTC.` },
    ];

    const todayTradesFooter = todayLosses > todayWins
      ? 'Red today. Losses hitting the stop is the protection working — judge over many trades; the strict score bar + ADX gate aim to reduce those.'
      : todayTrades.length > 0 ? 'Green today — winners came from trend-aligned, high-score entries. Keep the quality bar where it is.' : '';

    // per-symbol 7d
    const bySym = new Map<string, { netPnl: number; trades: number; wins: number; lastClosedAt: string }>();
    for (const t of trades7d) {
      const c = bySym.get(t.symbol) ?? { netPnl: 0, trades: 0, wins: 0, lastClosedAt: t.closedAt };
      c.netPnl += num(t.netPnl); c.trades++; if (num(t.netPnl) > 0) c.wins++;
      if (+new Date(t.closedAt) > +new Date(c.lastClosedAt)) c.lastClosedAt = t.closedAt;
      bySym.set(t.symbol, c);
    }
    const perSymbol7d = [...bySym.entries()].map(([symbol, c]) => ({ symbol, ...c, netPnl: +c.netPnl.toFixed(2) }))
      .sort((a, b) => b.netPnl - a.netPnl);

    // trader analysis (enrich perf with sentiment + text)
    const analysis = perf.map((c: any) => ({
      ...c,
      riskLabel: c.riskScore > 60 ? 'HIGH' : c.riskScore > 35 ? 'MOD' : 'LOW',
      sentiment: c.winRate >= 60 && c.netPnl >= 0 ? 'Bullish' : c.winRate <= 40 || c.netPnl < 0 ? 'Bearish' : 'Neutral',
      analysis: this.coinAnalysis(c),
    }));
    const best = [...perf].sort((a, b) => b.netPnl - a.netPnl)[0];
    const worst = [...perf].sort((a, b) => a.netPnl - b.netPnl)[0];
    const totalTrades = perf.reduce((s: number, c: any) => s + c.trades, 0);
    const totalPnl = perf.reduce((s: number, c: any) => s + c.netPnl, 0);
    const avgWin = stats?.winRate ?? 0;
    const avgRisk = perf.length ? Math.round(perf.reduce((s: number, c: any) => s + c.riskScore, 0) / perf.length) : 0;
    const portfolioRisk = avgRisk > 60 ? 'HIGH' : avgRisk > 35 ? 'MODERATE' : 'LOW';
    const analysisSummary = perf.length
      ? `Over the recent period you took ${totalTrades} trade${totalTrades > 1 ? 's' : ''} across ${perf.length} coin${perf.length > 1 ? 's' : ''} at a ${avgWin}% win rate for ${totalPnl >= 0 ? 'a gain of +' : 'a loss of '}$${Math.abs(totalPnl).toFixed(2)}. Best: ${best?.symbol ?? '—'}. Weakest: ${worst?.symbol ?? '—'}. Current portfolio risk ${portfolioRisk}.`
      : '';
    const strengths = best && best.netPnl > 0 ? `${best.symbol} is your most profitable coin (+$${best.netPnl.toFixed(2)}); trend-aligned entries are working.` : 'Discipline: the quality bar is keeping you out of low-probability trades.';
    const weaknesses = worst && worst.netPnl < 0 ? `${worst.symbol} is dragging the book (${worst.netPnl.toFixed(2)}); consider tightening its filter or pausing it.` : 'No major loser — losses are well-contained by the stop.';
    const risks = `Portfolio risk ${portfolioRisk}. Keep concurrency at ${bot?.maxConcurrentPositions ?? 1} and respect the ${bot?.maxTradesPerDay ?? '—'}-trade daily cap; don't fight a ${btc} BTC.`;

    return {
      equity, drawdown, maxDrawdown, volume, fees, realized7d, profitFactor,
      decisions, blocked, top, todayTrades, todayWins, todayLosses, todayPnl, todayWinRate,
      dailyNarrative, whyCards, proRead, todayTradesFooter, perSymbol7d,
      analysis, analysisSummary, strengths, weaknesses, risks,
    };
  },

  tradeReason(t: any): string {
    const pnl = num(t.netPnl);
    const dur = t.durationSec ? `${Math.round(t.durationSec / 60)}m` : '';
    const r = t.exitReason;
    const dir = t.side === 'LONG' ? 'long' : 'short';
    if (r === 'TP') return `${dir} hit take-profit${dur ? ` after ${dur}` : ''} — full target reached. +$${pnl.toFixed(2)}.`;
    if (r === 'TRAIL') return `${dir} trailing stop locked in profit as the move extended${dur ? ` over ${dur}` : ''}. +$${pnl.toFixed(2)}.`;
    if (r === 'SL') return pnl < 0 ? `${dir} stopped out${dur ? ` after ${dur}` : ''} — trend failed to follow through. $${pnl.toFixed(2)} (protection working).` : `${dir} break-even stop protected the entry. $${pnl.toFixed(2)}.`;
    if (r === 'LIQUIDATION') return `${dir} liquidated — outsized adverse move.`;
    if (r === 'MANUAL' || r === 'EXTERNAL') return `${dir} closed manually/outside the bot. ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}.`;
    return `${dir} closed. ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}.`;
  },

  coinAnalysis(c: any): string {
    const l = c.trades - c.wins;
    if (c.trades === 0) return 'No completed trades.';
    if (c.netPnl > 0 && c.winRate >= 55) return `Strong: ${c.wins}/${c.trades} winners, +$${c.netPnl.toFixed(2)}. Setups here are aligning with the trend — keep trading it as configured.`;
    if (c.netPnl > 0) return `Net positive (+$${c.netPnl.toFixed(2)}) despite a ${c.winRate}% win rate — winners are larger than losers (good R:R). Sustainable if R:R holds.`;
    if (c.netPnl < 0 && c.winRate < 40) return `Weak: ${l}/${c.trades} losses, ${c.netPnl.toFixed(2)}. Low win rate suggests this coin's setups are fighting the trend — tighten its filter or pause it.`;
    return `Roughly break-even (${c.netPnl.toFixed(2)}, ${c.winRate}% win). Needs more samples before judging; the stop is containing the losers.`;
  }
};
