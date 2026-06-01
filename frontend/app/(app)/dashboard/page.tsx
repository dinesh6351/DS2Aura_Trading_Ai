'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { api, openRealtime, getApiBase } from '@/lib/api';
import { CHANNELS, BILLING, centsToUsd, TradingMode, PROFIT_LADDER, PROFIT_TAKE_CAP } from '@platform/shared';
import { AppNav } from '@/components/AppNav';

interface Account { totalBalance: number; availableBalance: number; marginUsed: number; unrealizedPnl: number; openPositions: number; lastSyncedAt: string | null; live?: boolean; }
interface Stats { winRate: number; realizedPnl: number; todayProfit: number; weeklyProfit: number; monthlyProfit: number; roi: number; totalTrades: number; }
interface BotCfg {
  status: string; mode: string; scoreThreshold: number; leverage: number;
  marginPerTradeUsd: string; slPercent: string; tpRR: string;
  maxConcurrentPositions: number; maxTradesPerDay: number; lossCooldownMin: number; maxConsecutiveLosses?: number;
  dynamicSizing?: boolean; marginGuardPct?: number; consecutiveLosses?: number;
  useAdxFilter: boolean; useEmaTrend: boolean; useRsi: boolean; useVolume: boolean;
  useAtr: boolean; useBreakEven: boolean; useTrailingStop: boolean; pausedReason: string | null;
}
interface Position { id: string; symbol: string; side: string; entryPrice: string; markPrice: string; quantity: string; leverage: number; stopLoss: string | null; takeProfit: string | null; unrealizedPnl: string; entryScore: number | null; }
interface SignalRow {
  symbol: string; bias: 'long' | 'short' | 'none'; score: number; threshold: number; allPass: boolean;
  ema8: number | null; rsi3: number | null; rsi14: number | null; volRatio: number | null;
  vwapDeltaPct: number | null; atrPct: number | null; adx: number | null; macdHist: number | null;
  trend: 'up' | 'down' | 'mixed' | 'n/a'; blocking: string;
}
interface Usage {
  plan: string; status: string; tradesUsed: number; includedTrades: number;
  remainingIncludedTrades: number; overageTrades: number; estimatedInvoiceUsd: number;
  monthlyPriceUsd: number; overagePerTradeUsd: number; nextBillingDate: string | null;
  trialEndsAt: string | null; inTrial: boolean; canTrade: boolean; viewOnly: boolean;
  unlimited?: boolean; billingInterval?: string; planPriceUsd?: number; renewalDate?: string | null;
}
interface Market { btcTrend: string; verdict: string; fearGreed: { value: number; label: string }; btcAtrPct: number; btcPrice?: number; }
interface Trade {
  id: string; symbol: string; side: string; entryPrice: string; exitPrice: string; quantity: string;
  leverage: number; grossPnl: string; feeUsd: string; netPnl: string; rr: string | null;
  exitReason: string | null; openedAt: string; closedAt: string; durationSec: number | null;
}
interface Perf { symbol: string; trades: number; wins: number; winRate: number; netPnl: number; volume: number; riskScore: number; }
interface LogItem { id: string; title: string; body: string; createdAt: string; }
interface Intel {
  strategy: {
    regime: string; regimeLabel: string; confidence: number;
    metrics: { adx: number; atrPct: number; emaTrend: string; fearGreed: number };
    primary: { id: string; name: string; category: string; note: string };
    active: { id: string; name: string; category: string; implemented: boolean }[];
    avoid: string[]; reason: string;
    library: { total: number; implemented: number; byCategory: Record<string, number> };
  };
  fearGreed: { value: number; label: string; history: { value: number; label: string; date: string }[]; recommendation: string };
  learning: {
    totalTrades: number; winRate: number; profitFactor: number;
    byReason: Record<string, { count: number; pnl: number }>;
    best: Perf[]; worst: Perf[];
    recent: { id: string; symbol: string; side: string; reason: string | null; netPnl: number; rr: number | null; win: boolean; worked: string; failed: string; suggestion: string; closedAt: string }[];
    lessons: string[]; topWinning: string[]; topLosing: string[];
  };
  marketIntel: { sentiment: string; btcTrend: string; verdict: string; fundingPct: number; whaleProxy: string; headlines: string[]; note: string };
}
interface Trip { id: string; side: string; entry: number; exit: number; netPnl: number; grossPnl: number; rr: number | null; durationSec: number | null; exitReason: string | null; openedAt: string; closedAt: string; analysis: string; }

const num = (v: unknown) => Number(v ?? 0);
const DAY = 864e5;

export default function Dashboard() {
  const [account, setAccount] = useState<Account>();
  const [stats, setStats] = useState<Stats>();
  const [bot, setBot] = useState<BotCfg>();
  const [positions, setPositions] = useState<Position[]>([]);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [usage, setUsage] = useState<Usage>();
  const [market, setMarket] = useState<Market>();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
  const [log, setLog] = useState<LogItem[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [detail, setDetail] = useState<{ symbol: string; trips: Trip[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoad, setLastLoad] = useState(Date.now());
  const [intel, setIntel] = useState<Intel>();

  const loadSignals = useCallback(async () => {
    setSignals(await api.get<SignalRow[]>('/api/trading/signals').catch(() => []));
  }, []);
  const loadIntel = useCallback(async () => {
    setIntel(await api.get<Intel>('/api/trading/intelligence').catch(() => undefined));
  }, []);

  const load = useCallback(async () => {
    const [a, s, b, p, u, mk, tr, pf, lg, wl] = await Promise.all([
      api.get<Account>('/api/trading/account'),
      api.get<Stats>('/api/trading/stats'),
      api.get<BotCfg>('/api/bot/status'),
      api.get<Position[]>('/api/trading/positions'),
      api.get<Usage>('/api/billing/usage'),
      api.get<Market>('/api/trading/market-status'),
      api.get<Trade[]>('/api/trading/trades'),
      api.get<Perf[]>('/api/trading/performance'),
      api.get<LogItem[]>('/api/bot/log'),
      api.get<string[]>('/api/trading/watchlist'),
    ]);
    setAccount(a); setStats(s); setBot(b); setPositions(p); setUsage(u);
    setMarket(mk); setTrades(tr); setPerf(pf); setLog(lg); setWatchlist(wl);
    setLastLoad(Date.now());
  }, []);

  async function subscribe(plan: 'BASIC' | 'PRO' = 'BASIC') { await api.post('/api/billing/subscribe', { plan }); await load(); }
  async function botAction(action: 'start' | 'pause' | 'stop') { await api.post(`/api/bot/${action}`).catch((e) => alert((e as Error).message)); await load(); }
  async function openDetail(symbol: string) { const trips = await api.get<Trip[]>(`/api/trading/trade-detail?symbol=${symbol}`); setDetail({ symbol, trips }); }
  async function refreshAll() { setRefreshing(true); try { await Promise.all([load(), loadSignals()]); } finally { setRefreshing(false); } }

  useEffect(() => {
    api.refresh().then(() => { load(); loadSignals(); loadIntel(); }).catch(() => { window.location.href = '/login'; });
    api.get<{ id: string }>('/api/me').then(setMe).catch(() => {});
  }, [load, loadSignals, loadIntel]);

  // Steady auto-refresh regardless of bot run state — account/positions are
  // live-synced server-side (15s cache), so a 20s poll keeps the cards live even
  // when the bot is stopped. Signals + intelligence are heavier → 60s.
  useEffect(() => {
    const t = setInterval(load, 20_000);
    const t2 = setInterval(loadSignals, 60_000);
    const t3 = setInterval(loadIntel, 60_000);
    return () => { clearInterval(t); clearInterval(t2); clearInterval(t3); };
  }, [load, loadSignals, loadIntel]);

  useEffect(() => {
    if (!me) return;
    return openRealtime(
      [CHANNELS.userPositions(me.id), CHANNELS.userPnl(me.id), CHANNELS.userSignals(me.id), CHANNELS.userBotLog(me.id)],
      (m) => { if (m.channel.endsWith(':signals')) loadSignals(); else load(); },
    );
  }, [me, load, loadSignals]);

  // ── Derived analytics (all client-side from data we already have) ───────────
  const d = useMemo(() => deriveAnalytics(trades, signals, perf, bot, market, account, stats), [trades, signals, perf, bot, market, account, stats]);

  return (
    <>
      <AppNav active="dashboard" />
      <main className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header + bot controls */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-accent text-xl font-bold">▚ Trading Terminal</h1>
            {market && <span className="text-muted text-sm">BTC <b className={trendColor(market.btcTrend)}>{market.btcTrend}</b>{market.btcPrice ? ` $${market.btcPrice.toLocaleString()}` : ''}</span>}
            <span className="text-xs flex items-center gap-1">
              <span className={account?.live ? 'badge-up animate-pulse' : 'text-warn'}>{account?.live ? '● LIVE' : '○ cached'}</span>
              <span className="text-muted">· auto 20s · updated <Ago at={lastLoad} /></span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn text-xs" disabled={refreshing} onClick={refreshAll}>{refreshing ? '…' : '↻ Refresh'}</button>
            <span className={`label ${bot?.status === 'RUNNING' ? 'text-accent' : 'text-muted'}`}>BOT: {bot?.status ?? '…'} · {bot?.mode}</span>
            <button className="btn" onClick={() => botAction('start')}>Start</button>
            <button className="btn" onClick={() => botAction('pause')}>Pause</button>
            <button className="btn-danger" onClick={() => botAction('stop')}>Stop</button>
          </div>
        </header>
        {bot?.pausedReason && <p className="text-warn text-sm">⏸ {bot.pausedReason}</p>}

        {usage?.viewOnly && (
          <div className="card border-warn/50 bg-warn/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-warn font-bold">⚠ View-Only Mode — subscription {usage.status.toLowerCase()}</p>
              <p className="text-muted text-sm">Bot &amp; AI signals are disabled. Existing positions stay protected. Renew to restore access.</p>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={() => subscribe('BASIC')}>Basic ${centsToUsd(BILLING.basicMonthlyCents)}/mo</button>
              <button className="btn" onClick={() => subscribe('PRO')}>Pro ${centsToUsd(BILLING.proAnnualCents)}/yr</button>
            </div>
          </div>
        )}

        {usage && <UsageMeter u={usage} onSubscribe={subscribe} />}

        {/* Portfolio stat cards */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card label="Portfolio Value" value={fmt(account?.totalBalance)} />
          <Card label="Available" value={fmt(account?.availableBalance)} />
          <Card label="Unrealized P&L" value={fmt(account?.unrealizedPnl)} signed />
          <Card label="Today P&L" value={fmt(stats?.todayProfit)} signed />
          <Card label="ROI" value={`${stats?.roi ?? 0}%`} />
          <Card label="Realized 7D" value={fmt(d.realized7d)} signed />
          <Card label="Profit Factor" value={d.profitFactor} />
          <Card label="Max Drawdown 7D" value={fmt(-d.maxDrawdown)} signed />
          <Card label="Win Rate" value={`${stats?.winRate ?? 0}%`} />
          <Card label="Open Trades" value={String(account?.openPositions ?? 0)} />
        </section>

        {/* Engine activity stat row */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card label="Decisions (now)" value={String(d.decisions)} />
          <Card label="Trades Taken" value={String(stats?.totalTrades ?? 0)} />
          <Card label="Blocked (now)" value={String(d.blocked)} />
          <Card label="Today" value={`${d.todayTrades.length} / ${bot?.maxTradesPerDay ?? '—'}`} />
          <Card label="Volume" value={fmt(d.volume)} />
          <Card label="Est. Fees" value={fmt(d.fees)} />
        </section>

        {/* Top Opportunity */}
        <section className="card">
          <p className="label mb-2">🎯 Top Opportunity — Live</p>
          {!d.top ? <Empty>No directional candidate right now — bot is standing aside.</Empty> : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-2xl font-bold">{d.top.symbol}{' '}
                  <span className={d.top.bias === 'long' ? 'badge-up' : 'badge-down'}>{d.top.bias.toUpperCase()}</span>
                </p>
                <p className="text-muted text-sm mt-1">
                  Score <b className="text-accent">{d.top.score}</b>/100 · threshold {d.top.threshold} ·{' '}
                  {d.top.allPass ? <span className="badge-up">✅ would trade</span> : <span className="text-warn">⏳ {d.top.blocking}</span>}
                </p>
              </div>
              <a href={`/chart/${d.top.symbol}`} className="btn">📈 Preview this trade</a>
            </div>
          )}
        </section>

        {/* AI & Strategy Intelligence (regime, active strategy, F&G, learning, news) */}
        <IntelSection intel={intel} />

        {/* Market status + Next trade + Equity curve */}
        <section className="grid md:grid-cols-3 gap-6">
          <div className="card">
            <p className="label mb-2">Market Status</p>
            {market ? (
              <div className="text-sm space-y-1">
                <Row k="BTC Trend" v={<span className={trendColor(market.btcTrend)}>{market.btcTrend}</span>} />
                <Row k="Verdict" v={<span className={market.verdict === 'HIGH_RISK' ? 'badge-down' : market.verdict === 'SAFE' ? 'badge-up' : 'text-warn'}>{market.verdict}</span>} />
                <Row k="Fear & Greed" v={`${market.fearGreed.value} · ${market.fearGreed.label}`} />
                <Row k="BTC ATR" v={`${(market.btcAtrPct * 100).toFixed(2)}%`} />
                <Row k="Consecutive losses" v={String(bot?.consecutiveLosses ?? 0)} />
              </div>
            ) : <Empty>Loading…</Empty>}
          </div>
          <div className="card">
            <p className="label mb-2">Next Trade Preview</p>
            {!d.top ? <Empty>No candidate yet</Empty> : (
              <div className="text-sm space-y-1">
                <p className="text-lg font-bold">{d.top.symbol} <span className={d.top.bias === 'long' ? 'badge-up' : 'badge-down'}>{d.top.bias.toUpperCase()}</span></p>
                <Row k="Score" v={<b className="text-accent">{d.top.score}/{d.top.threshold}</b>} />
                <Row k="Leverage" v={`${bot?.leverage ?? '—'}×`} />
                <Row k="Margin" v={`$${bot ? num(bot.marginPerTradeUsd).toFixed(2) : '—'}`} />
                <Row k="Status" v={d.top.allPass ? <span className="badge-up">READY</span> : <span className="text-warn">GATED</span>} />
                <a href={`/chart/${d.top.symbol}`} className="btn text-xs inline-block mt-1">📈 Analyze</a>
              </div>
            )}
          </div>
          <div className="card">
            <p className="label mb-2">Equity Curve (cumulative net P&L)</p>
            {d.equity.length === 0 ? <Empty>No closed trades yet</Empty> : (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={d.equity}>
                  <CartesianGrid stroke="#14321420" /><XAxis dataKey="t" hide /><YAxis hide domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#0f160f', border: '1px solid #14321a', fontSize: 12 }} />
                  <Line type="monotone" dataKey="pnl" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Drawdown chart */}
        {d.drawdown.length > 1 && (
          <section className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="label">Drawdown (peak-to-trough, net P&L)</p>
              <span className="badge-down text-sm">Max {fmt(-d.maxDrawdown)}</span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={d.drawdown}>
                <defs><linearGradient id="dd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#14321420" /><XAxis dataKey="t" hide /><YAxis hide domain={['auto', 0]} />
                <Tooltip contentStyle={{ background: '#0f160f', border: '1px solid #14321a', fontSize: 12 }} />
                <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={1.5} fill="url(#dd)" />
              </AreaChart>
            </ResponsiveContainer>
          </section>
        )}

        {/* Daily Trading Summary */}
        <section className="card space-y-3">
          <p className="label">📅 Daily Trading Summary — today&apos;s trades, conditions &amp; why</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <MiniStat label="Trades Today" value={`${d.todayTrades.length}`} sub={`${account?.openPositions ?? 0} open now`} />
            <MiniStat label="Win Rate" value={`${d.todayWinRate}%`} sub={`${d.todayWins}W / ${d.todayLosses}L`} />
            <MiniStat label="Today P&L" value={fmt(d.todayPnl)} signed sub="net" />
            <MiniStat label="Market Bias" value={(market?.btcTrend ?? '—').toUpperCase()} sub="BTC-driven" />
            <MiniStat label="Losses Today" value={`${d.todayLosses}`} sub={`${d.blocked} blocked now`} />
            <MiniStat label="Bot Status" value={bot?.status ?? '—'} sub={bot?.mode ?? ''} />
          </div>
          <p className="text-sm text-muted leading-relaxed border-t border-green-900/20 pt-3">{d.dailyNarrative}</p>
        </section>

        {/* Why the bot trades / held back */}
        <section>
          <p className="label mb-2">🧠 Why the bot trades / held back today</p>
          <div className="grid md:grid-cols-2 gap-3">
            {d.whyCards.map((c, i) => <InfoCard key={i} icon={c.icon} tone={c.tone} text={c.text} />)}
          </div>
        </section>

        {/* Professional read */}
        <section>
          <p className="label mb-2">📈 Professional read &amp; what to do</p>
          <div className="grid md:grid-cols-3 gap-3">
            {d.proRead.map((c, i) => <InfoCard key={i} icon={c.icon} tone={c.tone} text={c.text} />)}
          </div>
        </section>

        {/* Today's trades — per-trade reasoning */}
        <section>
          <p className="label mb-2">📋 Today&apos;s trades — each closed trade with its win/loss reason</p>
          {d.todayTrades.length === 0 ? (
            <div className="card"><Empty>No trades closed today yet. The quality bar (score ≥ {bot?.scoreThreshold ?? 85}) keeps the bot patient.</Empty></div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {d.todayTrades.slice(0, 12).map((t) => <TradeReasonCard key={t.id} t={t} />)}
              </div>
              <p className="text-xs text-muted mt-2">{d.todayTradesFooter}</p>
            </>
          )}
        </section>

        {/* Open positions (live, 1s) + Protection status */}
        <section className="grid md:grid-cols-2 gap-6">
          <LivePositions positions={positions} />
          <div className="card">
            <p className="label mb-2">🛡️ Protection Status — SL/TP per open position</p>
            {positions.length === 0 ? (
              <Empty>No open positions. When you open one, SL/TP planning shows here. Auto-protect: {bot?.useBreakEven || bot?.useTrailingStop ? 'ON' : 'OFF'}</Empty>
            ) : (
              <div className="space-y-2 text-sm">
                {positions.map((p) => {
                  const live = signals.find((s) => s.symbol === p.symbol);
                  const ls = live?.score;
                  const entry = p.entryScore;
                  const arrow = ls != null && entry != null ? (ls > entry ? '↑' : ls < entry ? '↓' : '→') : '';
                  const lsCls = ls == null ? 'text-muted' : ls >= (live?.threshold ?? 80) ? 'badge-up' : entry != null && ls < entry ? 'badge-down' : 'text-warn';
                  return (
                    <div key={p.id} className="border-t border-green-900/30 pt-2">
                      <p className="font-bold">{p.symbol} <span className={p.side === 'LONG' ? 'badge-up' : 'badge-down'}>{p.side}</span></p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-xs text-muted mt-1">
                        <span>SL: <b className="text-danger">{p.stopLoss ? num(p.stopLoss).toFixed(4) : '—'}</b></span>
                        <span>TP: <b className="text-accent">{p.takeProfit ? num(p.takeProfit).toFixed(4) : '—'}</b></span>
                        <span>Entry score: <b>{entry ?? '—'}</b></span>
                        <span>Live score: <b className={lsCls}>{ls ?? '—'} {arrow}</b></span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted pt-1">Break-even: {bot?.useBreakEven ? 'ON' : 'OFF'} · Trailing stop: {bot?.useTrailingStop ? 'ON' : 'OFF'}</p>
              </div>
            )}
          </div>
        </section>

        {/* Dynamic profit protection ladder (live per-second, up to 5 coins) */}
        <section>
          <DynamicProtection positions={positions} signals={signals} slPercent={bot ? num(bot.slPercent) : 1} />
        </section>

        {/* Live Signals — full table */}
        <section className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="label">📡 Live Signals — BTC + altcoin calcs right now</p>
            <span className="text-xs">{signals.filter((s) => s.allPass).length > 0
              ? <span className="badge-up animate-pulse">{signals.filter((s) => s.allPass).length} READY ✅</span>
              : <span className="text-muted">0 ready</span>} <span className="text-muted">· {signals.length} watched · {d.blocked} blocked · ↻ 60s</span></span>
          </div>
          {signals.length === 0 ? <Empty>Computing signals…</Empty> : (
            <table className="w-full text-sm min-w-[820px]">
              <thead><tr className="text-muted text-xs">
                <th className="text-left">Symbol</th><th>Bias</th><th>Score</th><th>Verdict</th>
                <th>Trend</th><th>RSI3</th><th>Vol×</th><th>VWAP Δ</th><th>ADX</th>
                <th className="text-left pl-3">What&apos;s blocking</th><th></th>
              </tr></thead>
              <tbody>{signals.map((s) => (
                <tr key={s.symbol} className={`border-t border-green-900/30 ${s.allPass ? 'bg-accent/10' : ''}`}>
                  <td className="font-bold">{s.symbol}</td>
                  <td className="text-center"><span className={s.bias === 'long' ? 'badge-up' : s.bias === 'short' ? 'badge-down' : 'text-muted'}>{s.bias}</span></td>
                  <td className="text-center"><b className={s.score >= s.threshold ? 'text-accent' : ''}>{s.score}</b></td>
                  <td className={`text-center text-xs ${s.allPass ? 'badge-up' : 'text-muted'}`}>{s.allPass ? '✅ READY' : '🚫'}</td>
                  <td className="text-center text-xs">{s.trend === 'up' ? '↗' : s.trend === 'down' ? '↘' : '→'}</td>
                  <td className="text-center text-xs">{s.rsi3 ?? '—'}</td>
                  <td className="text-center text-xs">{s.volRatio ?? '—'}</td>
                  <td className={`text-center text-xs ${num(s.vwapDeltaPct) >= 0 ? 'badge-up' : 'badge-down'}`}>{s.vwapDeltaPct == null ? '—' : `${s.vwapDeltaPct}%`}</td>
                  <td className="text-center text-xs">{s.adx ?? '—'}</td>
                  <td className="text-left pl-3 text-xs text-muted">{s.blocking}</td>
                  <td className="text-right"><a href={`/chart/${s.symbol}`} className="text-accent text-xs">chart</a></td>
                </tr>))}</tbody>
            </table>
          )}
        </section>

        {/* Trade history + Per-symbol P&L */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="card overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="label">🧾 Trade History — recent closed orders <span className="text-muted text-xs font-normal">· ↻ 20s</span></p>
              <a className="text-accent text-xs" href={`${getApiBase()}/api/trading/export/trades.csv`} target="_blank" rel="noreferrer">⤓ CSV</a>
            </div>
            {trades.length === 0 ? <Empty>No trades yet</Empty> : (
              <table className="w-full text-sm">
                <thead><tr className="text-muted text-xs"><th className="text-left">Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Net P&L</th><th>Reason</th></tr></thead>
                <tbody>{trades.slice(0, 20).map((t) => (
                  <tr key={t.id} className="border-t border-green-900/30">
                    <td className="text-xs text-muted">{new Date(t.closedAt).toLocaleString()}</td>
                    <td>{t.symbol}</td><td className="text-center"><span className={t.side === 'LONG' ? 'badge-up' : 'badge-down'}>{t.side}</span></td>
                    <td className="text-center text-xs">{num(t.quantity)}</td>
                    <td className={`text-center ${num(t.netPnl) >= 0 ? 'badge-up' : 'badge-down'}`}>{num(t.netPnl).toFixed(3)}</td>
                    <td className="text-center text-xs">{t.exitReason}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
          <div className="card overflow-x-auto">
            <p className="label mb-2">💰 Per-Symbol P&L — who&apos;s making money (last 7D)</p>
            {d.perSymbol7d.length === 0 ? <Empty>No closed trades in the last 7 days</Empty> : (
              <table className="w-full text-sm">
                <thead><tr className="text-muted text-xs"><th className="text-left">Symbol</th><th>Net P&L</th><th>Trades</th><th>W</th><th>L</th><th>Last</th></tr></thead>
                <tbody>{d.perSymbol7d.map((c) => (
                  <tr key={c.symbol} className="border-t border-green-900/30 cursor-pointer hover:bg-accent/5" onClick={() => openDetail(c.symbol)}>
                    <td className="text-accent whitespace-nowrap">{c.symbol} <a href={`/chart/${c.symbol}`} onClick={(e) => e.stopPropagation()} className="text-xs hover:underline">📈</a></td>
                    <td className={`text-center ${c.netPnl >= 0 ? 'badge-up' : 'badge-down'}`}>{c.netPnl >= 0 ? '+' : ''}{c.netPnl.toFixed(2)}</td>
                    <td className="text-center">{c.trades}</td><td className="text-center badge-up">{c.wins}</td><td className="text-center badge-down">{c.trades - c.wins}</td>
                    <td className="text-center text-xs text-muted">{ago(c.lastClosedAt)}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
        </section>

        {/* Trader Performance Analysis — AI assisted */}
        <section className="card overflow-x-auto space-y-2">
          <p className="label">🤖 Trader Performance Analysis — AI-assisted · click a coin for full detail</p>
          {d.analysis.length === 0 ? <Empty>No completed trades yet</Empty> : (
            <>
              <p className="text-sm text-muted leading-relaxed">{d.analysisSummary}</p>
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="text-muted text-xs"><th className="text-left">Coin</th><th>Trades</th><th>W/L</th><th>Win%</th><th>P&L</th><th>Risk</th><th>Sentiment</th><th className="text-left pl-3">AI analysis</th></tr></thead>
                <tbody>{d.analysis.map((c) => (
                  <tr key={c.symbol} className="border-t border-green-900/30 cursor-pointer hover:bg-accent/5 align-top" onClick={() => openDetail(c.symbol)}>
                    <td className="text-accent font-bold whitespace-nowrap">{c.symbol} <a href={`/chart/${c.symbol}`} onClick={(e) => e.stopPropagation()} className="text-xs hover:underline">📈</a></td>
                    <td className="text-center">{c.trades}</td>
                    <td className="text-center text-xs">{c.wins}/{c.trades - c.wins}</td>
                    <td className="text-center">{c.winRate}%</td>
                    <td className={`text-center ${c.netPnl >= 0 ? 'badge-up' : 'badge-down'}`}>{c.netPnl >= 0 ? '+' : ''}{c.netPnl.toFixed(2)}</td>
                    <td className="text-center"><span className={c.riskScore > 60 ? 'badge-down' : c.riskScore > 35 ? 'text-warn' : 'badge-up'}>{c.riskLabel}</span></td>
                    <td className="text-center text-xs"><span className={c.sentiment === 'Bullish' ? 'badge-up' : c.sentiment === 'Bearish' ? 'badge-down' : 'text-muted'}>{c.sentiment}</span></td>
                    <td className="text-left pl-3 text-xs text-muted max-w-md">{c.analysis}</td>
                  </tr>))}</tbody>
              </table>
              <div className="grid md:grid-cols-3 gap-2 text-xs pt-1">
                <p><span className="badge-up">STRENGTHS</span> {d.strengths}</p>
                <p><span className="badge-down">WEAKNESSES</span> {d.weaknesses}</p>
                <p><span className="text-warn">RISKS</span> {d.risks}</p>
              </div>
            </>
          )}
        </section>

        {/* Account & Trade Detail */}
        <section className="card">
          <p className="label mb-2">⚙️ Account &amp; Trade Detail — current settings</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 text-sm">
            <Row k="Mode" v={`${bot?.mode ?? '—'} · ${bot?.status ?? '—'}`} />
            <Row k="Watchlist" v={`${watchlist.length} symbols`} />
            <Row k="Trade size" v={`$${bot ? num(bot.marginPerTradeUsd).toFixed(2) : '—'}${bot?.dynamicSizing ? ' (dynamic)' : ''}`} />
            <Row k="Leverage" v={`${bot?.leverage ?? '—'}×`} />
            <Row k="Order type" v="MARKET · FUTURES" />
            <Row k="SL / TP" v={`${bot ? num(bot.slPercent) : '—'}% / 1:${bot ? num(bot.tpRR) : '—'}`} />
            <Row k="Max concurrent" v={String(bot?.maxConcurrentPositions ?? '—')} />
            <Row k="Daily trades cap" v={String(bot?.maxTradesPerDay ?? '—')} />
            <Row k="Score threshold" v={String(bot?.scoreThreshold ?? '—')} />
            <Row k="Loss cooldown" v={`${bot?.lossCooldownMin ?? '—'} min`} />
            <Row k="Max consec. losses" v={String(bot?.maxConsecutiveLosses ?? '—')} />
            <Row k="Margin guard" v={`${bot?.marginGuardPct ?? '—'}%`} />
            <Row k="Total balance" v={fmt(account?.totalBalance)} />
            <Row k="Available" v={fmt(account?.availableBalance)} />
            <Row k="Margin used" v={fmt(account?.marginUsed)} />
            <Row k="Last synced" v={account?.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleTimeString() : '—'} />
          </div>
        </section>

        {/* Bot settings + activity log */}
        <section className="grid md:grid-cols-2 gap-6">
          {bot && <BotSettings bot={bot} watchlist={watchlist} onSaved={load} />}
          <div className="card">
            <p className="label mb-2">📜 Bot Activity Log</p>
            {log.length === 0 ? <Empty>No activity yet</Empty> : (
              <div className="space-y-1 max-h-72 overflow-auto text-sm">
                {log.map((l) => (
                  <div key={l.id} className="border-t border-green-900/20 py-1">
                    <span className="text-accent">{l.title}</span> <span className="text-muted text-xs">· {new Date(l.createdAt).toLocaleTimeString()}</span>
                    <p className="text-muted text-xs">{l.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {detail && <TradeDetailModal symbol={detail.symbol} trips={detail.trips} onClose={() => setDetail(null)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivations + rule-based narrative (the "AI" the original dashboard used —
// deterministic heuristics over free market signals, no LLM).
// ─────────────────────────────────────────────────────────────────────────────
interface TradeReason extends Trade { reason: string }
function deriveAnalytics(
  trades: Trade[], signals: SignalRow[], perf: Perf[], bot?: BotCfg, market?: Market, account?: Account, stats?: Stats,
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

  const within7 = (t: Trade) => +new Date(t.closedAt) >= now - 7 * DAY;
  const trades7d = trades.filter(within7);
  const realized7d = trades7d.reduce((s, t) => s + num(t.netPnl), 0);
  const gains = trades7d.filter((t) => num(t.netPnl) > 0).reduce((s, t) => s + num(t.netPnl), 0);
  const losses = trades7d.filter((t) => num(t.netPnl) < 0).reduce((s, t) => s + Math.abs(num(t.netPnl)), 0);
  const profitFactor = losses > 0 ? (gains / losses).toFixed(2) : gains > 0 ? '∞' : '—';

  // calendar-today
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const todayAll = trades.filter((t) => +new Date(t.closedAt) >= +startToday)
    .sort((a, b) => +new Date(b.closedAt) - +new Date(a.closedAt));
  const todayTrades: TradeReason[] = todayAll.map((t) => ({ ...t, reason: tradeReason(t) }));
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

  const tone = (t: 'info' | 'warn' | 'good' | 'blue'): InfoTone => t;
  const whyCards: { icon: string; tone: InfoTone; text: string }[] = [
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
  const proRead: { icon: string; tone: InfoTone; text: string }[] = [
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
  const analysis = perf.map((c) => ({
    ...c,
    riskLabel: c.riskScore > 60 ? 'HIGH' : c.riskScore > 35 ? 'MOD' : 'LOW',
    sentiment: c.winRate >= 60 && c.netPnl >= 0 ? 'Bullish' : c.winRate <= 40 || c.netPnl < 0 ? 'Bearish' : 'Neutral',
    analysis: coinAnalysis(c),
  }));
  const best = [...perf].sort((a, b) => b.netPnl - a.netPnl)[0];
  const worst = [...perf].sort((a, b) => a.netPnl - b.netPnl)[0];
  const totalTrades = perf.reduce((s, c) => s + c.trades, 0);
  const totalPnl = perf.reduce((s, c) => s + c.netPnl, 0);
  const avgWin = stats?.winRate ?? 0;
  const avgRisk = perf.length ? Math.round(perf.reduce((s, c) => s + c.riskScore, 0) / perf.length) : 0;
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
}

type InfoTone = 'info' | 'warn' | 'good' | 'blue';

function tradeReason(t: Trade): string {
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
}

function coinAnalysis(c: Perf): string {
  const l = c.trades - c.wins;
  if (c.trades === 0) return 'No completed trades.';
  if (c.netPnl > 0 && c.winRate >= 55) return `Strong: ${c.wins}/${c.trades} winners, +$${c.netPnl.toFixed(2)}. Setups here are aligning with the trend — keep trading it as configured.`;
  if (c.netPnl > 0) return `Net positive (+$${c.netPnl.toFixed(2)}) despite a ${c.winRate}% win rate — winners are larger than losers (good R:R). Sustainable if R:R holds.`;
  if (c.netPnl < 0 && c.winRate < 40) return `Weak: ${l}/${c.trades} losses, ${c.netPnl.toFixed(2)}. Low win rate suggests this coin's setups are fighting the trend — tighten its filter or pause it.`;
  return `Roughly break-even (${c.netPnl.toFixed(2)}, ${c.winRate}% win). Needs more samples before judging; the stop is containing the losers.`;
}

/** Self-ticking "Xs/Xm ago" — isolated so it re-renders alone, not the dashboard. */
function Ago({ at }: { at: number }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return <span>{s < 60 ? `${s}s` : `${Math.round(s / 60)}m`} ago</span>;
}

/** Poll the cheap public last-price feed every 1s for the given symbols (cached
 *  server-side). Isolated in components that use it so only they re-render. */
function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const symKey = symbols.join(',');
  useEffect(() => {
    if (!symKey) { setPrices({}); return; }
    let alive = true;
    const tick = async () => {
      try { const p = await api.get<Record<string, number>>(`/api/trading/ticker?symbols=${symKey}`); if (alive) setPrices(p); } catch { /* keep last */ }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [symKey]);
  return prices;
}

/**
 * Open Positions with LIVE per-second PnL. Recomputes mark / PnL% / ROE / PnL$
 * locally from the 1s price feed. Self-contained so the tick re-renders just this
 * card — the rest of the (heavy) dashboard stays still.
 */
function LivePositions({ positions }: { positions: Position[] }) {
  const prices = useLivePrices(positions.map((p) => p.symbol));
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="label">Open Positions</p>
        <span className="text-xs badge-up animate-pulse">● LIVE · 1s</span>
      </div>
      {positions.length === 0 ? <Empty>No open positions</Empty> : (
        <table className="w-full text-sm">
          <thead><tr className="text-muted text-xs"><th className="text-left">Symbol</th><th>Entry → Mark</th><th>PnL %</th><th>ROE</th><th>PnL $</th><th>SL/TP</th></tr></thead>
          <tbody>{positions.map((p) => {
            const long = p.side === 'LONG';
            const entry = num(p.entryPrice);
            const mark = prices[p.symbol] ?? num(p.markPrice);
            const frac = entry > 0 ? (long ? (mark - entry) / entry : (entry - mark) / entry) : 0;
            const pct = frac * 100;
            const roe = pct * (p.leverage || 1);
            const usd = (long ? mark - entry : entry - mark) * num(p.quantity);
            const cls = frac >= 0 ? 'badge-up' : 'badge-down';
            return (
              <tr key={p.id} className="border-t border-green-900/30">
                <td>{p.symbol} <span className={long ? 'badge-up text-xs' : 'badge-down text-xs'}>{p.side}</span> <a href={`/chart/${p.symbol}`} className="text-accent text-xs hover:underline">📈</a></td>
                <td className="text-center text-xs">{entry.toFixed(4)} → <b>{mark.toFixed(4)}</b></td>
                <td className={`text-center ${cls}`}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</td>
                <td className={`text-center text-xs ${cls}`}>{roe >= 0 ? '+' : ''}{roe.toFixed(1)}%</td>
                <td className={`text-right ${cls}`}>{usd >= 0 ? '+' : ''}{usd.toFixed(3)}</td>
                <td className="text-center text-xs text-muted">{p.stopLoss ? num(p.stopLoss).toFixed(2) : '—'}/{p.takeProfit ? num(p.takeProfit).toFixed(2) : '—'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </div>
  );
}

/**
 * 🛡️ Dynamic Profit Protection — the live profit-lock ladder for up to 5 coins.
 * Shows the rungs (stop ratchets up as profit grows, never back; +5% closes),
 * each OPEN position's live progress on the ladder, AND the top candidate coins
 * the bot is watching (filled to ~5 total) — all live (1s), each with an Open
 * Chart button. Uses the SAME ladder constants as the engine.
 */
function DynamicProtection({ positions, signals, slPercent }: { positions: Position[]; signals: SignalRow[]; slPercent: number }) {
  const held = new Set(positions.map((p) => p.symbol));
  const watching = [...signals].filter((s) => !held.has(s.symbol))
    .sort((a, b) => (b.allPass ? 1 : 0) - (a.allPass ? 1 : 0) || b.score - a.score) // ready-to-trade first
    .slice(0, Math.max(0, 5 - positions.length));
  const readyCount = signals.filter((s) => !held.has(s.symbol) && s.allPass).length;
  const prices = useLivePrices([...positions.map((p) => p.symbol), ...watching.map((w) => w.symbol)]);
  const chartBtn = (sym: string) => <a href={`/chart/${sym}`} className="text-accent text-xs hover:underline">📈 chart</a>;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <p className="label">🛡️ Dynamic Profit Protection</p>
        <span className="text-xs badge-up animate-pulse">● LIVE · 1s · up to 5 coins</span>
      </div>
      <p className="text-xs text-muted mb-2">Stop ratchets up as profit grows and never moves back. Initial stop <b className="text-warn">−{slPercent}%</b>.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5 text-xs text-muted">
        {PROFIT_LADDER.map((r) => (
          <span key={r.trigger}>+{(r.trigger * 100).toFixed(1)}% → lock <b className="text-green-100">+{(r.lock * 100).toFixed(1)}%</b></span>
        ))}
        <span className="text-accent">+{(PROFIT_TAKE_CAP * 100).toFixed(0)}% → close ✅</span>
      </div>

      {/* Active positions — live ladder progress */}
      <div className="border-t border-green-900/20 mt-3 pt-2 space-y-3">
        {positions.length === 0 ? <p className="text-muted text-xs">No open positions yet — protection activates the moment a trade opens. Candidates below 👇</p> :
          positions.map((p) => {
            const long = p.side === 'LONG';
            const entry = num(p.entryPrice);
            const mark = prices[p.symbol] ?? num(p.markPrice);
            const frac = entry > 0 ? (long ? (mark - entry) / entry : (entry - mark) / entry) : 0;
            const pct = frac * 100;
            let lock: number | null = null;
            for (const r of PROFIT_LADDER) if (frac >= r.trigger) lock = r.lock;
            const next = PROFIT_LADDER.find((r) => r.trigger > frac);
            const stopLabel = lock != null ? `+${(lock * 100).toFixed(1)}% locked` : `−${slPercent}% (initial)`;
            const nextLabel = frac >= PROFIT_TAKE_CAP ? 'closing at +5%'
              : next ? `next: +${(next.trigger * 100).toFixed(1)}% → lock +${(next.lock * 100).toFixed(1)}%`
              : `+${(PROFIT_TAKE_CAP * 100).toFixed(0)}% → close`;
            const prog = Math.max(0, Math.min(100, (frac / PROFIT_TAKE_CAP) * 100));
            const cls = frac >= 0 ? 'badge-up' : 'badge-down';
            return (
              <div key={p.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">{p.symbol} <span className={long ? 'badge-up' : 'badge-down'}>{p.side}</span> {chartBtn(p.symbol)}</span>
                  <span className={cls}>{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
                </div>
                <div className="h-2 bg-bg rounded overflow-hidden border border-green-900/40 my-1">
                  <div className={`h-full ${frac >= 0 ? 'bg-accent' : 'bg-danger'}`} style={{ width: `${prog}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>stop: <b className={lock != null ? 'text-accent' : 'text-warn'}>{stopLabel}</b></span>
                  <span>{nextLabel}</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Watching — top candidate coins (live), filled to ~5 total */}
      {watching.length > 0 && (
        <div className="border-t border-green-900/20 mt-3 pt-2">
          <p className="text-xs mb-1">
            <span className="text-muted">👀 Watching ({watching.length}) — top candidates, protection arms on entry · </span>
            {readyCount > 0 ? <span className="badge-up animate-pulse">{readyCount} READY to trade ✅</span> : <span className="text-muted">none ready yet</span>}
          </p>
          <div className="space-y-1">
            {watching.map((w) => {
              const live = prices[w.symbol];
              return (
                <div key={w.symbol} className={`flex items-center justify-between text-sm border-t border-green-900/10 py-1 ${w.allPass ? 'bg-accent/10 rounded px-1' : ''}`}>
                  <span className="flex items-center gap-2">
                    {w.symbol}
                    <span className={w.bias === 'long' ? 'badge-up text-xs' : w.bias === 'short' ? 'badge-down text-xs' : 'text-muted text-xs'}>{w.bias === 'none' ? 'neutral' : w.bias}</span>
                    {w.allPass
                      ? <span className="badge-up text-xs animate-pulse">✅ READY</span>
                      : <span className="text-muted text-xs">watching</span>}
                    {chartBtn(w.symbol)}
                  </span>
                  <span className="text-xs text-muted">score <b className={w.score >= w.threshold ? 'text-accent' : ''}>{w.score}</b>/{w.threshold}{live ? ` · $${live.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** AI & Strategy Intelligence: regime + active strategy, strategy performance,
 *  Fear & Greed, trade learning/feedback, and market intelligence (§17-22). */
function IntelSection({ intel }: { intel?: Intel }) {
  if (!intel) return <section className="card"><Empty>Loading AI &amp; strategy intelligence…</Empty></section>;
  const { strategy: st, fearGreed: fg, learning: lr, marketIntel: mi } = intel;
  const regimeCls = st.regime.includes('UP') ? 'badge-up' : st.regime.includes('DOWN') ? 'badge-down' : st.regime === 'VOLATILE' ? 'text-warn' : 'text-muted';
  const fgCls = fg.value <= 25 ? 'badge-down' : fg.value <= 45 ? 'text-warn' : fg.value <= 55 ? 'text-muted' : fg.value <= 75 ? 'text-warn' : 'badge-down';
  return (
    <>
      <section className="grid md:grid-cols-3 gap-4 md:gap-6">
        {/* AI Learning Center */}
        <div className="card">
          <p className="label mb-2">🧠 AI Learning Center</p>
          <div className="text-sm space-y-1">
            <Row k="Market regime" v={<span className={regimeCls}>{st.regimeLabel}</span>} />
            <Row k="Active strategy" v={<b className="text-accent">{st.primary.name}</b>} />
            <Row k="Confidence" v={`${st.confidence}%`} />
            <div className="h-1.5 bg-bg rounded overflow-hidden border border-green-900/40"><div className="h-full bg-accent" style={{ width: `${st.confidence}%` }} /></div>
            <p className="text-muted text-xs pt-1">{st.reason}</p>
            <div className="border-t border-green-900/20 pt-1 mt-1">
              <p className="text-accent text-xs">Top winning conditions</p>
              <ul className="text-muted text-xs">{lr.topWinning.slice(0, 3).map((c, i) => <li key={i}>✅ {c}</li>)}</ul>
              <p className="text-danger text-xs mt-1">Top losing conditions</p>
              <ul className="text-muted text-xs">{lr.topLosing.slice(0, 3).map((c, i) => <li key={i}>🚫 {c}</li>)}</ul>
            </div>
            <p className="text-muted text-[10px] pt-1">Monitoring · {st.library.total} strategies in library ({st.library.implemented} live) · regime gate ADX {st.metrics.adx}, ATR {st.metrics.atrPct}%</p>
          </div>
        </div>

        {/* Strategy Performance */}
        <div className="card">
          <p className="label mb-2">📈 Strategy Performance</p>
          <div className="text-sm space-y-1">
            <Row k="Strategies active (this regime)" v={`${st.active.length} / ${st.library.total}`} />
            <Row k="Win rate" v={`${lr.winRate}%`} /><Row k="Profit factor" v={lr.profitFactor === 999 ? '∞' : lr.profitFactor} />
            <Row k="Best coin" v={lr.best[0] ? <span className="badge-up">{lr.best[0].symbol} +${lr.best[0].netPnl.toFixed(2)}</span> : '—'} />
            <Row k="Worst coin" v={lr.worst[0] && lr.worst[0].netPnl < 0 ? <span className="badge-down">{lr.worst[0].symbol} {lr.worst[0].netPnl.toFixed(2)}</span> : '—'} />
            <div className="border-t border-green-900/20 pt-1 mt-1 text-xs">
              <p className="text-muted">Exits: {Object.entries(lr.byReason).map(([r, v]) => `${r} ${v.count}`).join(' · ') || '—'}</p>
              <p className="text-accent mt-1">Avoid in this regime:</p>
              <p className="text-muted">{st.avoid.length ? st.avoid.join(', ') : 'none — all families fit'}</p>
            </div>
          </div>
        </div>

        {/* Fear & Greed */}
        <div className="card">
          <p className="label mb-2">😱 Fear &amp; Greed</p>
          <div className="text-center">
            <p className={`text-4xl font-bold ${fgCls}`}>{fg.value}</p>
            <p className={`text-sm ${fgCls}`}>{fg.label}</p>
          </div>
          {fg.history.length > 1 && (
            <ResponsiveContainer width="100%" height={56}>
              <LineChart data={fg.history}><XAxis dataKey="date" hide /><YAxis hide domain={[0, 100]} />
                <Tooltip contentStyle={{ background: '#0f160f', border: '1px solid #14321a', fontSize: 11 }} />
                <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="text-muted text-xs mt-1">{fg.recommendation}</p>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4 md:gap-6">
        {/* Trade Learning & Feedback */}
        <div className="card">
          <p className="label mb-2">🎓 Trade Learning &amp; Feedback</p>
          {lr.lessons.length > 0 && <ul className="text-sm text-muted space-y-1 mb-2">{lr.lessons.map((l, i) => <li key={i}>• {l}</li>)}</ul>}
          {lr.recent.length === 0 ? <Empty>No completed trades yet — feedback appears after the first close.</Empty> : (
            <div className="space-y-2 max-h-64 overflow-auto">
              {lr.recent.map((f) => (
                <div key={f.id} className="border-t border-green-900/20 pt-1 text-xs">
                  <p className="flex justify-between"><span>{f.symbol} <span className={f.side === 'LONG' ? 'badge-up' : 'badge-down'}>{f.side}</span> · {f.reason}</span>
                    <span className={f.win ? 'badge-up' : 'badge-down'}>{f.netPnl >= 0 ? '+' : ''}{f.netPnl}</span></p>
                  <p className="text-muted">✅ {f.worked}{!f.win && ` · 🚫 ${f.failed}`}</p>
                  <p className="text-accent">💡 {f.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Market Intelligence */}
        <div className="card">
          <div className="flex items-center justify-between mb-2"><p className="label">📰 Market Intelligence</p><span className={mi.sentiment === 'Bullish' ? 'badge-up' : mi.sentiment === 'Bearish' ? 'badge-down' : 'text-warn'}>{mi.sentiment}</span></div>
          <div className="text-sm space-y-1">
            <Row k="BTC trend" v={<span className={trendColor(mi.btcTrend)}>{mi.btcTrend}</span>} />
            <Row k="Risk verdict" v={<span className={mi.verdict === 'HIGH_RISK' ? 'badge-down' : mi.verdict === 'SAFE' ? 'badge-up' : 'text-warn'}>{mi.verdict}</span>} />
            <Row k="Funding" v={`${mi.fundingPct}%`} /><Row k="Whale proxy" v={mi.whaleProxy} />
            <ul className="text-muted text-xs mt-1 space-y-1">{mi.headlines.map((h, i) => <li key={i}>• {h}</li>)}</ul>
            <p className="text-muted text-[10px] mt-1 italic">{mi.note} Real-time headline feed integration is on the roadmap.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function trendColor(t: string) { return t === 'bullish' ? 'badge-up' : t === 'bearish' ? 'badge-down' : 'text-warn'; }
function ago(iso: string): string {
  const m = Math.round((Date.now() - +new Date(iso)) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ── Small UI pieces ──────────────────────────────────────────────────────────
function Card({ label, value, signed }: { label: string; value?: string; signed?: boolean }) {
  const neg = signed && value?.includes('-');
  return <div className="card"><p className="label">{label}</p><p className={`stat ${signed ? (neg ? 'badge-down' : 'badge-up') : ''}`}>{value ?? '…'}</p></div>;
}
function MiniStat({ label, value, sub, signed }: { label: string; value: string; sub?: string; signed?: boolean }) {
  const neg = signed && value.includes('-');
  return (
    <div className="bg-bg rounded p-2 border border-green-900/30">
      <p className="label">{label}</p>
      <p className={`font-bold ${signed ? (neg ? 'badge-down' : 'badge-up') : 'text-green-100'}`}>{value}</p>
      {sub && <p className="text-muted text-xs">{sub}</p>}
    </div>
  );
}
function InfoCard({ icon, tone, text }: { icon: string; tone: InfoTone; text: string }) {
  const border = tone === 'good' ? 'border-accent/40' : tone === 'warn' ? 'border-warn/40' : tone === 'blue' ? 'border-sky-700/40' : 'border-green-900/30';
  return <div className={`card ${border}`}><p className="text-sm"><span className="mr-1">{icon}</span>{text}</p></div>;
}
function TradeReasonCard({ t }: { t: TradeReason }) {
  const pnl = num(t.netPnl);
  return (
    <div className="card">
      <p className="font-bold flex items-center gap-2">
        {t.symbol} <span className={t.side === 'LONG' ? 'badge-up' : 'badge-down'}>{t.side}</span>
        <span className={`ml-auto ${pnl >= 0 ? 'badge-up' : 'badge-down'}`}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span>
      </p>
      <p className="text-xs text-muted mt-1">{num(t.entryPrice).toFixed(4)} → {num(t.exitPrice).toFixed(4)} · {t.exitReason} · {new Date(t.closedAt).toLocaleTimeString()}</p>
      <p className="text-sm mt-1">{t.reason}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-muted">{k}</span><span>{v}</span></div>;
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="text-muted text-sm py-6 text-center">{children}</p>; }
function fmt(n?: number) { return n == null ? '…' : `$${n.toFixed(2)}`; }

/** Editable bot settings: mode preset + key risk config + watchlist. */
function BotSettings({ bot, watchlist, onSaved }: { bot: BotCfg; watchlist: string[]; onSaved: () => void }) {
  const [cfg, setCfg] = useState({
    scoreThreshold: bot.scoreThreshold, leverage: bot.leverage,
    marginPerTradeUsd: Number(bot.marginPerTradeUsd), slPercent: Number(bot.slPercent), tpRR: Number(bot.tpRR),
    maxConcurrentPositions: bot.maxConcurrentPositions, maxTradesPerDay: bot.maxTradesPerDay,
  });
  const [wl, setWl] = useState(watchlist.join(', '));
  const [note, setNote] = useState('');
  const set = (k: keyof typeof cfg) => (e: React.ChangeEvent<HTMLInputElement>) => setCfg({ ...cfg, [k]: Number(e.target.value) });

  async function setMode(mode: string) { await api.post('/api/bot/mode', { mode }); setNote(`Mode → ${mode}`); onSaved(); }
  async function saveCfg() { await api.patch('/api/bot/config', cfg); setNote('Settings saved'); onSaved(); setTimeout(() => setNote(''), 2000); }
  async function saveWl() {
    const symbols = wl.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    await api.put('/api/trading/watchlist', { symbols }); setNote('Watchlist saved'); onSaved(); setTimeout(() => setNote(''), 2000);
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between"><p className="label">⚙️ Bot Settings</p>{note && <span className="text-accent text-xs">✅ {note}</span>}</div>
      <div className="flex gap-2">
        {Object.values(TradingMode).map((m) => (
          <button key={m} className={`text-xs flex-1 ${bot.mode === m ? 'btn' : 'btn opacity-60'}`} onClick={() => setMode(m)}>{m}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Num label="Score ≥" v={cfg.scoreThreshold} onChange={set('scoreThreshold')} />
        <Num label="Leverage" v={cfg.leverage} onChange={set('leverage')} />
        <Num label="Margin $" v={cfg.marginPerTradeUsd} onChange={set('marginPerTradeUsd')} />
        <Num label="SL %" v={cfg.slPercent} onChange={set('slPercent')} step="0.1" />
        <Num label="TP R:R" v={cfg.tpRR} onChange={set('tpRR')} step="0.1" />
        <Num label="Max Positions" v={cfg.maxConcurrentPositions} onChange={set('maxConcurrentPositions')} />
        <Num label="Max Trades/Day" v={cfg.maxTradesPerDay} onChange={set('maxTradesPerDay')} />
      </div>
      <button className="btn w-full" onClick={saveCfg}>Save settings</button>
      <div>
        <p className="label mb-1">Watchlist (comma-separated)</p>
        <textarea className="w-full bg-bg border border-green-900/40 rounded px-2 py-1 text-sm" rows={2} value={wl} onChange={(e) => setWl(e.target.value)} />
        <button className="btn w-full mt-1" onClick={saveWl}>Save watchlist</button>
      </div>
    </div>
  );
}
function Num({ label, v, onChange, step }: { label: string; v: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; step?: string }) {
  return <label className="block"><span className="label">{label}</span><input type="number" step={step} value={v} onChange={onChange} className="w-full bg-bg border border-green-900/40 rounded px-2 py-1 mt-0.5" /></label>;
}

function TradeDetailModal({ symbol, trips, onClose }: { symbol: string; trips: Trip[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="card max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-accent font-bold">{symbol} — trade detail ({trips.length})</p>
          <button className="btn-danger text-xs" onClick={onClose}>✕ Close</button>
        </div>
        {trips.length === 0 ? <Empty>No round-trips</Empty> : trips.map((t) => (
          <div key={t.id} className="border-t border-green-900/30 py-2 text-sm">
            <p>
              <span className={t.side === 'LONG' ? 'badge-up' : 'badge-down'}>{t.side}</span>{' '}
              {t.entry} → {t.exit} ·{' '}
              <span className={t.netPnl >= 0 ? 'badge-up' : 'badge-down'}>{t.netPnl >= 0 ? '+' : ''}{t.netPnl.toFixed(4)}</span>{' '}
              <span className="text-muted text-xs">{t.exitReason} · {t.durationSec ? `${Math.round(t.durationSec / 60)}m` : ''}</span>
            </p>
            <p className="text-muted text-xs">{t.analysis} · {new Date(t.closedAt).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Usage meter — exactly where the user stands with their plan. */
function UsageMeter({ u, onSubscribe }: { u: Usage; onSubscribe: (plan: 'BASIC' | 'PRO') => void }) {
  if (u.unlimited) {
    return (
      <section className="card flex items-center justify-between">
        <div><p className="label">Usage &amp; Billing · Admin</p><p className="stat">Unlimited · Free</p></div>
        <p className="text-muted text-sm">Admin accounts have full access. Trades this month: {u.tradesUsed}</p>
      </section>
    );
  }
  const pct = Math.min(100, Math.round((u.tradesUsed / Math.max(1, u.includedTrades)) * 100));
  const over = u.overageTrades > 0;
  const date = (dt: string | null) => (dt ? new Date(dt).toLocaleDateString() : '—');
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <p className="label">Usage &amp; Billing · {u.plan} {u.inTrial && '(Free Trial)'}</p>
        <span className={`text-sm font-bold ${u.status === 'EXPIRED' || u.status === 'PAST_DUE' ? 'text-warn' : 'text-accent'}`}>{u.status}</span>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-muted">Trades Used This Month</span>
          <span className={over ? 'text-warn' : 'text-green-100'}>{u.tradesUsed}/{u.includedTrades}{over && ` (+${u.overageTrades} overage)`}</span>
        </div>
        <div className="h-2 bg-bg rounded overflow-hidden border border-green-900/40"><div className={`h-full ${over ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Meter label="Remaining Included" value={`${u.remainingIncludedTrades}`} />
        <Meter label={u.inTrial ? 'Est. Invoice' : 'Est. Next Invoice'} value={u.inTrial ? 'Free (trial)' : `$${u.estimatedInvoiceUsd.toFixed(2)}`} />
        <Meter label={u.inTrial ? 'Trial Ends' : 'Usage Resets'} value={date(u.inTrial ? u.trialEndsAt : u.nextBillingDate)} />
        <Meter label={u.billingInterval === 'YEAR' ? 'Renews (yearly)' : 'Overage Rate'} value={u.billingInterval === 'YEAR' ? date(u.renewalDate ?? null) : `$${u.overagePerTradeUsd.toFixed(2)}/trade`} />
      </div>
      {(u.inTrial || u.viewOnly) && (
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => onSubscribe('BASIC')}>{u.viewOnly ? 'Subscribe' : 'Upgrade'} · Basic ${centsToUsd(BILLING.basicMonthlyCents)}/mo</button>
          <button className="btn" onClick={() => onSubscribe('PRO')}>Go Pro ${centsToUsd(BILLING.proAnnualCents)}/yr · {BILLING.proMonthsFree} mo free</button>
        </div>
      )}
    </section>
  );
}
function Meter({ label, value }: { label: string; value: string }) {
  return <div className="bg-bg rounded p-2 border border-green-900/30"><p className="label">{label}</p><p className="text-green-100 font-bold">{value}</p></div>;
}
