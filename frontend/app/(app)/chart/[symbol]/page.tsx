'use client';

import { use, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AppNav } from '@/components/AppNav';

interface Cond { label: string; pass: boolean; weight: number; critical: boolean; active: boolean; }
interface PivotLevel { label: string; price: number; dist: number; }
interface ChartDetail {
  symbol: string;
  aiTradePlan: {
    bias: string; entry?: number; stopLoss?: number; takeProfit?: number; riskReward?: string;
    reasoning: string; btcTrend?: string; btcAligned?: boolean; verdict?: string;
    structure?: string; adx?: number; volRatio?: number; rsi3?: number; support?: number | null; resistance?: number | null;
  } | null;
  supportResistance: { price: number; supports: { tf: string; price: number }[]; resistances: { tf: string; price: number }[] };
  multiTfBias: Record<string, string>;
  snapshot: {
    price: number; vwap: number; ema8: number; ema20: number; ema50: number; ema200: number | null;
    sma20: number; sma50: number; rsi3: number; rsi14: number;
    macdHist: number; macdLine: number; macdSignal: number; atr: number; atrPct: number; adx: number;
    bbUpper: number; bbMid: number; bbLower: number; volRatio: number; fundingPct: number; distFromVwapPct: number;
  } | null;
  signal: { bias: string; score: number; threshold: number; allPass: boolean; earnedWeight: number; totalWeight: number; conditions: Cond[]; criticalFails: string[]; } | null;
  news: { sentiment: string; fearGreed: number; fearGreedLabel: string; fundingPct: number; btcTrend: string; verdict: string; whaleProxy: string; headlines: string[]; note: string; } | null;
  marketStatus: { btcTrend: string; verdict: string; fearGreed: { value: number; label: string } } | null;
  pivots: { price: number; pivot: number; levels: PivotLevel[]; nearestRes: PivotLevel | null; nearestSup: PivotLevel | null; bandPct: number | null; reasoning: string[]; breakout: string[] } | null;
  multiTf: { rows: { tf: string; trend: string; rsi14: number | null }[]; up: number; down: number; overall: string } | null;
}

export default function ChartPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<ChartDetail>();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const tvRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [d, wl] = await Promise.all([
      api.get<ChartDetail>(`/api/trading/chart-detail?symbol=${symbol}`),
      api.get<string[]>('/api/trading/watchlist'),
    ]);
    setDetail(d); setWatchlist(wl.length ? wl : [symbol]);
  }, [symbol]);

  useEffect(() => {
    api.refresh().then(load).catch(() => { window.location.href = '/login'; });
    const t = setInterval(() => { load().catch(() => {}); }, 30_000); // refresh analysis every 30s
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!tvRef.current) return;
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.onload = () => {
      // @ts-expect-error injected global
      new window.TradingView.widget({
        container_id: 'tv_chart', symbol: `BINANCE:${symbol}`, interval: '15',
        theme: 'dark', style: '1', autosize: true, studies: ['STD;EMA', 'STD;RSI', 'STD;MACD'],
      });
    };
    tvRef.current.id = 'tv_chart';
    document.body.appendChild(s);
    return () => { s.remove(); };
  }, [symbol]);

  const plan = detail?.aiTradePlan;
  const snap = detail?.snapshot;
  const sig = detail?.signal;
  const piv = detail?.pivots;
  const directional = plan && plan.bias !== 'none';

  return (
    <>
      <AppNav active="chart" />
      <main className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto">
        {/* Header: symbol + live price + bias/score + coin switcher */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-accent text-lg sm:text-xl font-bold">📈 {symbol}</h1>
            <LivePrice symbol={symbol} fallback={snap?.price} />
            {sig && (
              <span className={`text-xs px-2 py-0.5 rounded ${sig.bias === 'long' ? 'badge-up' : sig.bias === 'short' ? 'badge-down' : 'text-muted'}`}>
                {sig.bias === 'none' ? 'NEUTRAL' : sig.bias.toUpperCase()} · {sig.score}/{sig.threshold}
              </span>
            )}
          </div>
          <select value={symbol} onChange={(e) => router.push(`/chart/${e.target.value}`)}
            className="bg-bg border border-green-900/40 rounded px-3 py-2 text-sm">
            {watchlist.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </header>

        <div ref={tvRef} className="h-[340px] sm:h-[420px] md:h-[460px] card p-0 overflow-hidden" />

        {/* Trade Plan | AI Trade Plan | Snapshot */}
        <section className="grid md:grid-cols-3 gap-4 md:gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-2"><p className="label">📋 Trade Plan</p>{!directional && <span className="text-muted text-xs">NO SETUP</span>}</div>
            {directional ? (
              <div className="text-sm space-y-1">
                <p>Bias <span className={plan!.bias === 'long' ? 'badge-up' : 'badge-down'}>{plan!.bias.toUpperCase()}</span> · R:R <b className="text-accent">{plan!.riskReward}</b></p>
                <Row k="Entry" v={plan!.entry} /><Row k="Stop Loss" v={plan!.stopLoss} /><Row k="Take Profit" v={plan!.takeProfit} />
              </div>
            ) : <p className="text-muted text-sm">No directional setup right now — the bot is flat on {symbol}. Entry / SL / TP appear once a LONG or SHORT bias forms.</p>}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2"><p className="label">🤖 AI Trade Plan</p>{!directional && <span className="text-muted text-xs">NO SETUP</span>}</div>
            {directional ? (
              <div className="text-sm space-y-1">
                <Row k="Structure" v={plan!.structure} /><Row k="ADX" v={plan!.adx} /><Row k="Vol×" v={plan!.volRatio} />
                <Row k="BTC" v={<span className={plan!.btcAligned ? 'badge-up' : 'badge-down'}>{plan!.btcTrend} {plan!.btcAligned ? '✓' : '✗'}</span>} />
                <p className="text-muted mt-1">{plan!.reasoning}</p>
              </div>
            ) : <p className="text-muted text-sm">{plan?.reasoning ?? `AI has no trade to plan — no directional bias on ${symbol} right now. It activates once a LONG or SHORT setup forms.`}</p>}
          </div>

          <div className="card">
            <p className="label mb-2">📸 Snapshot</p>
            {snap ? (
              <div className="text-sm grid grid-cols-2 gap-x-3 gap-y-0.5">
                <Row k="Price" v={snap.price} /><Row k="Strength" v={<span className={snap.adx > 25 ? 'badge-up' : 'text-warn'}>{snap.adx > 25 ? 'STRONG' : 'WEAK'}</span>} />
                <Row k="Vol×" v={snap.volRatio} /><Row k="ATR%" v={`${snap.atrPct}%`} />
                <Row k="Trend" v={snap.ema8 > snap.ema50 ? 'UP' : snap.ema8 < snap.ema50 ? 'DOWN' : 'SIDEWAYS'} /><Row k="ADX" v={snap.adx} />
                <Row k="Conditions" v={sig ? `${sig.conditions.filter((c) => c.active && c.pass && !c.critical).length}/${sig.conditions.filter((c) => c.active && !c.critical).length}` : '0/0'} />
                <Row k="vs VWAP" v={`${snap.distFromVwapPct}%`} />
                <div className="col-span-2 border-t border-green-900/20 mt-1 pt-1 text-xs text-muted">Confidence {sig?.score ?? 0}/100 · threshold {sig?.threshold ?? 80}</div>
              </div>
            ) : <Empty />}
          </div>
        </section>

        {/* Critical Gate | Multi-TF | Market Structure */}
        <section className="grid md:grid-cols-3 gap-4 md:gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-2"><p className="label">🚪 Critical Gate Status</p>{(!sig || sig.bias === 'none') && <span className="text-muted text-xs">NONE</span>}</div>
            {sig && sig.bias !== 'none' ? (
              sig.criticalFails.length ? (
                <ul className="text-sm space-y-1">{sig.criticalFails.map((c, i) => <li key={i}><span className="badge-down">FAIL</span> {c}</li>)}</ul>
              ) : <p className="badge-up text-sm">All critical gates pass ✅</p>
            ) : <p className="text-muted text-sm">Critical gates come from the bot&apos;s live decision. No directional setup, so no gates are evaluated.</p>}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="label">🕒 Multi-Timeframe</p>
              {detail?.multiTf && <span className={`text-xs ${detail.multiTf.overall === 'BEARISH' ? 'badge-down' : detail.multiTf.overall === 'BULLISH' ? 'badge-up' : 'text-warn'}`}>{detail.multiTf.overall} {detail.multiTf.up}↑/{detail.multiTf.down}↓</span>}
            </div>
            {detail?.multiTf ? (
              <table className="w-full text-sm">
                <thead><tr className="text-muted text-xs"><th className="text-left">TF</th><th className="text-left">Trend</th><th className="text-right">RSI14</th></tr></thead>
                <tbody>{detail.multiTf.rows.map((r) => (
                  <tr key={r.tf} className="border-t border-green-900/20">
                    <td>{r.tf}</td>
                    <td><span className={r.trend === 'BULLISH' ? 'badge-up' : r.trend === 'BEARISH' ? 'badge-down' : 'text-muted'}>{r.trend}</span></td>
                    <td className="text-right text-muted">{r.rsi14 ?? '—'}</td>
                  </tr>))}</tbody>
              </table>
            ) : <Empty />}
          </div>

          <div className="card">
            <p className="label mb-2">🏗️ Market Structure</p>
            {snap ? (
              <ul className="text-sm space-y-1 text-muted">
                <li>{snap.adx >= 25 ? `Trending (ADX ${snap.adx})` : `Ranging / consolidation (ADX ${snap.adx}) — no clear structure`}</li>
                {piv?.nearestRes && <li>Testing resistance {piv.nearestRes.price} ({piv.nearestRes.dist >= 0 ? '+' : ''}{piv.nearestRes.dist}%)</li>}
                {piv?.nearestSup && <li>Sitting above support {piv.nearestSup.price} ({piv.nearestSup.dist}%)</li>}
                <li>{((snap.bbUpper - snap.bbLower) / snap.price) * 100 < 1.2 ? 'Bollinger squeeze — breakout pending' : 'Bollinger bands expanded — volatility on'}</li>
                <li>Price {snap.price > snap.vwap ? 'above' : 'below'} VWAP, {snap.price > snap.ema8 ? 'above' : 'below'} EMA8</li>
              </ul>
            ) : <Empty />}
          </div>
        </section>

        {/* Signal conditions (full width) */}
        <section className="card">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <p className="label">🎯 Signal Conditions ({symbol})</p>
            {sig && <span className="text-sm">Score <b className={sig.allPass ? 'badge-up' : 'text-warn'}>{sig.score}</b>/{sig.threshold} · {sig.allPass ? <span className="badge-up">✅ TRADE</span> : <span className="text-muted">🚫 BLOCKED</span>}</span>}
          </div>
          {sig && sig.conditions.length ? (
            <>
              {sig.bias === 'none' && <p className="text-muted text-xs mb-2">No directional bias yet — the full strategy checklist below scores once price sets a LONG/SHORT bias. ⚪ = not scoring now (no bias, filter off, or no data).</p>}
              <div className="grid sm:grid-cols-2 gap-x-6 text-sm">
                {sig.conditions.map((c, i) => (
                  <div key={i} className={`flex justify-between border-t border-green-900/20 py-1 ${c.active ? '' : 'opacity-50'}`}>
                    <span className={c.critical ? 'text-warn' : ''}>{!c.active ? '⚪' : c.pass ? '✅' : '🚫'} {c.label}{c.critical && ' (gate)'}</span>
                    <span className="text-muted">{!c.active ? 'off' : c.critical ? 'CRIT' : `${c.weight}pt`}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty>Computing the strategy checklist…</Empty>}
        </section>

        {/* Key Technical Indicators | Support & Resistance */}
        <section className="grid md:grid-cols-2 gap-4 md:gap-6">
          <div className="card">
            <p className="label mb-2">📊 Key Technical Indicators <span className="text-muted text-xs font-normal">· base 1m</span></p>
            {snap ? (
              <div className="text-sm grid grid-cols-2 gap-x-6 gap-y-0.5">
                <Ind k="RSI (3)" v={snap.rsi3} /><Ind k="RSI (14)" v={snap.rsi14} />
                <Ind k="EMA 8" v={snap.ema8} m /><Ind k="EMA 20" v={snap.ema20} m />
                <Ind k="EMA 50" v={snap.ema50} m /><Ind k="EMA 200" v={snap.ema200 ?? '—'} m />
                <Ind k="SMA 20" v={snap.sma20} m /><Ind k="SMA 50" v={snap.sma50} m />
                <Ind k="VWAP" v={snap.vwap} m /><Ind k="MACD hist" v={snap.macdHist} />
                <Ind k="MACD line" v={snap.macdLine} /><Ind k="MACD signal" v={snap.macdSignal} />
                <Ind k="ATR %" v={`${snap.atrPct}%`} /><Ind k="ADX" v={snap.adx} />
                <Ind k="BB Upper" v={snap.bbUpper} m /><Ind k="BB Middle" v={snap.bbMid} m />
                <Ind k="BB Lower" v={snap.bbLower} m /><Ind k="Vol vs 20-avg" v={`${snap.volRatio}×`} />
              </div>
            ) : <Empty />}
          </div>

          <div className="card">
            <p className="label mb-2">📐 Support &amp; Resistance</p>
            {piv ? (
              <div className="text-sm space-y-3">
                <div>
                  <p className="text-muted text-xs mb-1">Pivot levels (prev-day H/L/C)</p>
                  <table className="w-full">
                    <tbody>{piv.levels.map((l) => (
                      <tr key={l.label} className="border-t border-green-900/20">
                        <td className={l.label.startsWith('R') ? 'text-danger' : l.label.startsWith('S') ? 'text-accent' : 'text-warn'}>{l.label}</td>
                        <td className="text-center">{l.price}</td>
                        <td className={`text-right text-xs ${l.dist >= 0 ? 'badge-up' : 'badge-down'}`}>{l.dist >= 0 ? '+' : ''}{l.dist}%</td>
                      </tr>))}</tbody>
                  </table>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-bg rounded p-2 border border-green-900/30"><p className="text-muted">Nearest resistance</p><p className="text-danger font-bold">{piv.nearestRes?.price ?? '—'} {piv.nearestRes ? `(${piv.nearestRes.dist >= 0 ? '+' : ''}${piv.nearestRes.dist}%)` : ''}</p></div>
                  <div className="bg-bg rounded p-2 border border-green-900/30"><p className="text-muted">Nearest support</p><p className="text-accent font-bold">{piv.nearestSup?.price ?? '—'} {piv.nearestSup ? `(${piv.nearestSup.dist}%)` : ''}</p></div>
                </div>
                <div>
                  <p className="text-muted text-xs mb-1">Breakout &amp; liquidity-sweep zones</p>
                  <ul className="text-xs space-y-1">{piv.breakout.map((b, i) => <li key={i}>{b}</li>)}</ul>
                </div>
                <div>
                  <p className="text-muted text-xs mb-1">S/R trade reasoning</p>
                  <ul className="text-xs text-muted space-y-1">{piv.reasoning.map((r, i) => <li key={i}>▸ {r}</li>)}</ul>
                </div>
              </div>
            ) : <Empty />}
          </div>
        </section>

        {/* News & Research | AI Trade Reasoning */}
        <section className="grid md:grid-cols-2 gap-4 md:gap-6">
          <div className="card">
            <div className="flex items-center justify-between mb-2"><p className="label">📰 News &amp; Research</p>{detail?.news && <span className={detail.news.sentiment === 'Bullish' ? 'badge-up' : detail.news.sentiment === 'Bearish' ? 'badge-down' : 'text-warn'}>{detail.news.sentiment}</span>}</div>
            {detail?.news ? (
              <div className="text-sm space-y-1">
                <p>Fear &amp; Greed: <b>{detail.news.fearGreed}</b> ({detail.news.fearGreedLabel}).</p>
                <p>BTC trend: <b className={detail.news.btcTrend === 'bullish' ? 'badge-up' : detail.news.btcTrend === 'bearish' ? 'badge-down' : 'text-warn'}>{detail.news.btcTrend}</b> · verdict {detail.news.verdict}.</p>
                <p>Funding: {detail.news.fundingPct}% · whale proxy {detail.news.whaleProxy}.</p>
                <ul className="text-muted text-xs mt-1 space-y-1">{detail.news.headlines.map((h, i) => <li key={i}>• {h}</li>)}</ul>
                <p className="text-muted text-[10px] mt-2 italic">{detail.news.note}</p>
              </div>
            ) : <Empty />}
          </div>
          <div className="card">
            <p className="label mb-2">🧠 AI Trade Reasoning</p>
            <p className="text-sm text-muted">{plan?.reasoning ?? `${symbol} has no directional setup right now — price is not clearly above or below BOTH VWAP and the 8-EMA, so the bot stays flat and waits.`}</p>
          </div>
        </section>
      </main>
    </>
  );
}

/** Self-ticking live last price for the header (1s, isolated re-render). */
function LivePrice({ symbol, fallback }: { symbol: string; fallback?: number }) {
  const [price, setPrice] = useState<number | undefined>(fallback);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const p = await api.get<Record<string, number>>(`/api/trading/ticker?symbols=${symbol}`); if (alive && p[symbol]) setPrice(p[symbol]); } catch { /* keep */ }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [symbol]);
  if (price == null) return null;
  return <span className="text-lg sm:text-xl font-bold">${price.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-xs badge-up animate-pulse align-middle">● LIVE</span></span>;
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between"><span className="text-muted">{k}</span><span>{v ?? '—'}</span></div>;
}
function Ind({ k, v, m }: { k: string; v: React.ReactNode; m?: boolean }) {
  return <div className="flex justify-between border-t border-green-900/10 py-0.5"><span className="text-muted">{k}</span><span className={m ? 'text-green-100' : ''}>{m && typeof v === 'number' ? `$${v}` : v}</span></div>;
}
function Empty({ children }: { children?: React.ReactNode }) {
  return <p className="text-muted text-sm py-4 text-center">{children ?? 'Loading…'}</p>;
}
