/**
 * Strategy engine — faithful TypeScript port of bot.js `runSafetyCheck`.
 *
 * The 19-condition model: 15 weighted conditions summing to 100 + 4-5 critical
 * pass/fail gates. A trade fires only when bias is directional, score ≥ the
 * (per-user) threshold, AND every critical gate passes.
 *
 * This is INTENTIONALLY identical in spirit to the single-user bot — the SaaS
 * change is that `scoreThreshold` and the strategy toggles come from each
 * tenant's BotConfig, not a global env var.
 */

export interface StrategyCtx {
  ema20?: number; ema50?: number; ema200?: number; ema50Slope?: number;
  atrPct?: number; volRatio?: number;
  macd?: { histogram: number };
  adx?: number;
  pattern?: { pattern: string | null; bullish: boolean; bearish: boolean };
  swingLevels?: { support: number | null; resistance: number | null };
  spreadPct?: number;
  marketVerdict?: string;       // SAFE | MODERATE | HIGH_RISK
  btcTrend?: string;            // bullish | bearish | sideways
  funding?: number;
  multiTfAgree?: { dir: 'long' | 'short' | 'none'; passed: number; total: number };
  marketStructure?: { structure: string; uptrend: boolean; downtrend: boolean };
  breakout?: { breakoutUp: boolean; breakoutDown: boolean };
  sweep?: { sweepLow: boolean; sweepHigh: boolean };
  fearGreed?: { value: number };
  // toggles (default on) — let users disable individual filters from the dashboard
  toggles?: { adx?: boolean; ema?: boolean; rsi?: boolean; volume?: boolean; atr?: boolean };
}

export interface ConditionResult {
  label: string; pass: boolean; weight: number; critical: boolean;
}

export interface SafetyResult {
  results: ConditionResult[];
  allPass: boolean;
  bias: 'long' | 'short' | 'none';
  score: number;
  threshold: number;
  earnedWeight: number;
  totalWeight: number;
  criticalFails: ConditionResult[];
}

export function runSafetyCheck(
  price: number, ema8: number, vwap: number, rsi3: number,
  ctx: StrategyCtx, scoreThreshold: number,
): SafetyResult {
  const results: ConditionResult[] = [];
  const check = (label: string, pass: boolean, weight: number, critical = false) =>
    results.push({ label, pass, weight, critical });

  const {
    ema20, ema50, ema200, ema50Slope, atrPct, volRatio, macd, adx, pattern,
    swingLevels, spreadPct, marketVerdict, btcTrend, funding, multiTfAgree,
    marketStructure, breakout, sweep, fearGreed, toggles = {},
  } = ctx;
  const t = { adx: true, ema: true, rsi: true, volume: true, atr: true, ...toggles };

  const bullish = price > vwap && price > ema8;
  const bearish = price < vwap && price < ema8;
  const dir: 'long' | 'short' | 'none' = bullish ? 'long' : bearish ? 'short' : 'none';

  if (dir !== 'none') {
    const up = dir === 'long';
    // Trend / structure (40 pts)
    check('Price vs VWAP', up ? price > vwap : price < vwap, 8);
    if (t.ema) check('EMA(8) alignment', up ? price > ema8 : price < ema8, 5);
    if (ema20 != null && t.ema) check('EMA(20) alignment', up ? price > ema20 : price < ema20, 5);
    if (ema50 != null && t.ema) check('EMA(50) alignment', up ? price > ema50 : price < ema50, 7);
    if (ema200 != null && t.ema) check('EMA(200) major trend', up ? price > ema200 : price < ema200, 8);
    if (ema50Slope != null && t.ema) check('EMA(50) slope', up ? ema50Slope > 0 : ema50Slope < 0, 7);

    // Pullback / momentum (20 pts)
    if (t.rsi) check('RSI(3) pullback', up ? rsi3 < 30 : rsi3 > 70, 10);
    if (macd != null) check('MACD histogram sign', up ? macd.histogram > 0 : macd.histogram < 0, 10);

    // Market regime (20 pts)
    const distFromVWAP = Math.abs((price - vwap) / vwap) * 100;
    check('Not overextended (<1.5% from VWAP)', distFromVWAP < 1.5, 6);
    if (atrPct != null && t.atr) check('ATR ≥ 0.08% (alive)', atrPct >= 0.0008, 4);
    if (volRatio != null && t.volume) check('Volume ≥ 1.2× avg', volRatio >= 1.2, 5);
    if (adx != null && t.adx) check('ADX > 25 (trending)', adx > 25, 5);

    // Pattern / structure (10 pts)
    if (pattern?.pattern) check('Candle pattern', up ? pattern.bullish : pattern.bearish, 5);
    if (swingLevels) {
      const room = up && swingLevels.resistance != null
        ? ((swingLevels.resistance - price) / price) * 100
        : !up && swingLevels.support != null
          ? ((price - swingLevels.support) / price) * 100
          : null;
      if (room != null) check('S/R proximity (≥0.5% room)', room >= 0.5, 5);
    }

    // Higher-confidence layers (25 pts)
    if (multiTfAgree) check('Multi-TF agreement', multiTfAgree.dir === dir && multiTfAgree.passed >= 2, 10);
    if (marketStructure) check('Market structure', up ? marketStructure.uptrend : marketStructure.downtrend, 6);
    if (breakout) check('S/R breakout', up ? breakout.breakoutUp : breakout.breakoutDown, 4);
    if (sweep) check('Liquidity sweep', up ? sweep.sweepLow : sweep.sweepHigh, 3);
    if (fearGreed && typeof fearGreed.value === 'number')
      check('Fear & Greed', up ? fearGreed.value <= 75 : fearGreed.value >= 25, 2);

    // Critical gates
    if (spreadPct != null) check('Spread ≤ 0.1%', spreadPct <= 0.001, 0, true);
    if (marketVerdict) check('Market verdict ≠ HIGH_RISK', marketVerdict !== 'HIGH_RISK', 0, true);
    if (btcTrend) check(up ? 'BTC not bearish (alt-long gate)' : 'BTC not bullish (alt-short gate)',
      up ? btcTrend !== 'bearish' : btcTrend !== 'bullish', 0, true);
    if (funding != null) check('Funding < 0.05%', Math.abs(funding) < 0.0005, 0, true);
    if (adx != null && t.adx) check('ADX > 20 (real trend, not chop)', adx > 20, 0, true);
  }

  const totalWeight = results.filter((r) => !r.critical).reduce((s, r) => s + r.weight, 0);
  const earnedWeight = results.filter((r) => !r.critical && r.pass).reduce((s, r) => s + r.weight, 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const criticalFails = results.filter((r) => r.critical && !r.pass);
  const allPass = dir !== 'none' && criticalFails.length === 0 && score >= scoreThreshold;

  return { results, allPass, bias: dir, score, threshold: scoreThreshold, earnedWeight, totalWeight, criticalFails };
}
