/**
 * Strategy engine — faithful TypeScript port of bot.js `runSafetyCheck`.
 *
 * The model: ~50 weighted confirmations across trend, momentum, oscillators,
 * volume and volatility, plus 6 critical pass/fail gates. A trade fires only
 * when bias is directional, the normalised score ≥ the (per-user) threshold,
 * AND every critical gate passes. Score = earned/available weight × 100, so
 * adding confirmations raises the quality bar (more must agree) without
 * recalibrating the threshold — fewer, higher-conviction entries.
 *
 * `scoreThreshold` and the strategy toggles come from each tenant's BotConfig.
 * Every condition is recorded (even inactive ones) so the chart can render the
 * full professional checklist; only ACTIVE ones count toward the score.
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
  // ── extended professional indicator suite (all optional, populated by buildCandleCtx) ──
  rsi14?: number;
  boll?: { upper: number; mid: number; lower: number; width: number; pctB: number };
  stoch?: { k: number; d: number };
  stochRsi?: { k: number; d: number };
  williamsR?: number;
  cci?: number;
  mfi?: number;
  obvSlope?: number;
  cmf?: number;
  roc?: number;
  momentum?: number;
  ao?: number;
  psar?: { isLong: boolean };
  supertrend?: { dir: 'up' | 'down' };
  ichimoku?: { aboveCloud: boolean; belowCloud: boolean; tkBull: boolean; tkBear: boolean; priceAboveKijun: boolean };
  donchian?: { upper: number; lower: number; mid: number };
  keltner?: { upper: number; mid: number; lower: number };
  di?: { plusDI: number; minusDI: number };
  consec?: { up: number; down: number };
  vwapBands?: { upper: number; lower: number; vwap: number };
  emaCross?: { fastBull: boolean; fastBear: boolean; goldenRecent: boolean; deathRecent: boolean };
  volSpike?: boolean;
  // toggles (default on) — let users disable individual filters from the dashboard
  toggles?: { adx?: boolean; ema?: boolean; rsi?: boolean; volume?: boolean; atr?: boolean };
}

export interface ConditionResult {
  label: string; pass: boolean; weight: number; critical: boolean;
  active: boolean; // true = counted toward the score now (enabled + data present + directional bias)
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
  const {
    ema20, ema50, ema200, ema50Slope, atrPct, volRatio, macd, adx, pattern,
    swingLevels, spreadPct, marketVerdict, btcTrend, funding, multiTfAgree,
    marketStructure, breakout, sweep, fearGreed, toggles = {},
    rsi14, boll, stoch, stochRsi, williamsR, cci, mfi, obvSlope, cmf, roc,
    momentum, ao, psar, supertrend, ichimoku, donchian, keltner, di, consec,
    vwapBands, emaCross, volSpike,
  } = ctx;
  const t = { adx: true, ema: true, rsi: true, volume: true, atr: true, ...toggles };

  const bullish = price > vwap && price > ema8;
  const bearish = price < vwap && price < ema8;
  const dir: 'long' | 'short' | 'none' = bullish ? 'long' : bearish ? 'short' : 'none';
  const up = dir === 'long';
  const directional = dir !== 'none';

  // EVERY condition/strategy is recorded so the chart can show the full checklist.
  // Only ACTIVE ones count toward the score — active = directional bias AND the
  // condition is enabled (toggle) AND its data is present. This keeps the score
  // identical to before (which simply skipped the inactive ones).
  const check = (label: string, pass: boolean, weight: number, critical = false, enabled = true) =>
    results.push({ label, pass, weight, critical, active: directional && enabled });

  const room = swingLevels
    ? (up && swingLevels.resistance != null ? ((swingLevels.resistance - price) / price) * 100
      : !up && swingLevels.support != null ? ((price - swingLevels.support) / price) * 100 : null)
    : null;
  const distFromVWAP = Math.abs((price - vwap) / vwap) * 100;

  // Trend / structure (40 pts)
  check('Price vs VWAP', up ? price > vwap : price < vwap, 8);
  check('EMA(8) alignment', up ? price > ema8 : price < ema8, 5, false, t.ema);
  check('EMA(20) alignment', up ? price > (ema20 ?? 0) : price < (ema20 ?? 0), 5, false, t.ema && ema20 != null);
  check('EMA(50) alignment', up ? price > (ema50 ?? 0) : price < (ema50 ?? 0), 7, false, t.ema && ema50 != null);
  check('EMA(200) major trend', up ? price > (ema200 ?? 0) : price < (ema200 ?? 0), 8, false, t.ema && ema200 != null);
  check('EMA(50) slope', up ? (ema50Slope ?? 0) > 0 : (ema50Slope ?? 0) < 0, 7, false, t.ema && ema50Slope != null);
  // Pullback / momentum (20 pts)
  check('RSI(3) pullback', up ? rsi3 < 30 : rsi3 > 70, 10, false, t.rsi);
  check('MACD histogram sign', up ? (macd?.histogram ?? 0) > 0 : (macd?.histogram ?? 0) < 0, 10, false, macd != null);
  // Market regime (20 pts)
  check('Not overextended (<1.5% from VWAP)', distFromVWAP < 1.5, 6);
  check('ATR ≥ 0.08% (alive)', (atrPct ?? 0) >= 0.0008, 4, false, t.atr && atrPct != null);
  check('Volume ≥ 1.2× avg', (volRatio ?? 0) >= 1.2, 5, false, t.volume && volRatio != null);
  check('ADX > 25 (trending)', (adx ?? 0) > 25, 5, false, t.adx && adx != null);
  // Pattern / structure (10 pts)
  check('Candle pattern', up ? !!pattern?.bullish : !!pattern?.bearish, 5, false, !!pattern?.pattern);
  check('S/R proximity (≥0.5% room)', (room ?? 0) >= 0.5, 5, false, room != null);
  // Higher-confidence layers (25 pts)
  check('Multi-TF agreement', !!multiTfAgree && multiTfAgree.dir === dir && multiTfAgree.passed >= 2, 10, false, !!multiTfAgree);
  check('Market structure', up ? !!marketStructure?.uptrend : !!marketStructure?.downtrend, 6, false, !!marketStructure);
  check('S/R breakout', up ? !!breakout?.breakoutUp : !!breakout?.breakoutDown, 4, false, !!breakout);
  check('Liquidity sweep', up ? !!sweep?.sweepLow : !!sweep?.sweepHigh, 3, false, !!sweep);
  check('Fear & Greed', up ? (fearGreed?.value ?? 50) <= 75 : (fearGreed?.value ?? 50) >= 25, 2, false, !!fearGreed && typeof fearGreed.value === 'number');

  // ═══ Extended professional confirmation suite (oscillators · volume · momentum · trend-follow) ═══
  check('RSI(14) regime (>50 / <50)', up ? (rsi14 ?? 50) > 50 : (rsi14 ?? 50) < 50, 5, false, t.rsi && rsi14 != null);
  check('RSI(14) not exhausted', up ? (rsi14 ?? 50) < 75 : (rsi14 ?? 50) > 25, 3, false, t.rsi && rsi14 != null);
  check('Stochastic %K vs %D', up ? (stoch?.k ?? 50) > (stoch?.d ?? 50) : (stoch?.k ?? 50) < (stoch?.d ?? 50), 4, false, stoch != null);
  check('Stochastic not saturated', up ? (stoch?.k ?? 50) < 85 : (stoch?.k ?? 50) > 15, 2, false, stoch != null);
  check('Stoch-RSI cross', up ? (stochRsi?.k ?? 50) >= (stochRsi?.d ?? 50) : (stochRsi?.k ?? 50) <= (stochRsi?.d ?? 50), 3, false, stochRsi != null);
  check('Williams %R direction', up ? (williamsR ?? -50) > -50 : (williamsR ?? -50) < -50, 3, false, williamsR != null);
  check('CCI direction', up ? (cci ?? 0) > 0 : (cci ?? 0) < 0, 4, false, cci != null);
  check('CCI not extreme (<±200)', up ? (cci ?? 0) < 200 : (cci ?? 0) > -200, 2, false, cci != null);
  check('Money Flow Index', up ? (mfi ?? 50) > 50 : (mfi ?? 50) < 50, 4, false, t.volume && mfi != null);
  check('MFI not extreme', up ? (mfi ?? 50) < 85 : (mfi ?? 50) > 15, 2, false, t.volume && mfi != null);
  check('OBV trend confirms', up ? (obvSlope ?? 0) > 0 : (obvSlope ?? 0) < 0, 5, false, t.volume && obvSlope != null);
  check('Chaikin Money Flow', up ? (cmf ?? 0) > 0 : (cmf ?? 0) < 0, 4, false, t.volume && cmf != null);
  check('Rate of Change sign', up ? (roc ?? 0) > 0 : (roc ?? 0) < 0, 4, false, roc != null);
  check('Momentum(10) sign', up ? (momentum ?? 0) > 0 : (momentum ?? 0) < 0, 3, false, momentum != null);
  check('Awesome Oscillator', up ? (ao ?? 0) > 0 : (ao ?? 0) < 0, 4, false, ao != null);
  check('Parabolic SAR side', up ? !!psar?.isLong : psar != null && !psar.isLong, 5, false, psar != null);
  check('Supertrend direction', up ? supertrend?.dir === 'up' : supertrend?.dir === 'down', 7, false, supertrend != null);
  check('Ichimoku cloud', up ? !!ichimoku?.aboveCloud : !!ichimoku?.belowCloud, 7, false, ichimoku != null);
  check('Ichimoku Tenkan/Kijun', up ? !!ichimoku?.tkBull : !!ichimoku?.tkBear, 4, false, ichimoku != null);
  check('Price vs Kijun-sen', up ? !!ichimoku?.priceAboveKijun : ichimoku != null && !ichimoku.priceAboveKijun, 3, false, ichimoku != null);
  check('+DI vs −DI', up ? (di?.plusDI ?? 0) > (di?.minusDI ?? 0) : (di?.minusDI ?? 0) > (di?.plusDI ?? 0), 5, false, t.adx && di != null);
  check('Bollinger %B side', up ? (boll?.pctB ?? 0.5) > 0.5 : (boll?.pctB ?? 0.5) < 0.5, 4, false, boll != null);
  check('Inside Bollinger bands', (boll?.pctB ?? 0.5) <= 1 && (boll?.pctB ?? 0.5) >= 0, 2, false, boll != null);
  check('Bollinger volatility alive', (boll?.width ?? 0) >= 0.004, 2, false, t.atr && boll != null);
  check('Donchian breakout side', up ? price >= (donchian?.upper ?? Infinity) * 0.999 : price <= (donchian?.lower ?? 0) * 1.001, 4, false, donchian != null);
  check('Keltner channel side', up ? price > (keltner?.mid ?? price) : price < (keltner?.mid ?? price), 3, false, keltner != null);
  check('Within VWAP σ-bands', up ? price < (vwapBands?.upper ?? Infinity) : price > (vwapBands?.lower ?? -Infinity), 3, false, vwapBands != null);
  check('Consecutive candles align', up ? (consec?.up ?? 0) >= 1 : (consec?.down ?? 0) >= 1, 2, false, consec != null);
  check('EMA(8/20) cross', up ? !!emaCross?.fastBull : !!emaCross?.fastBear, 3, false, t.ema && emaCross != null);
  check('EMA(50/200) golden/death', up ? !!emaCross?.goldenRecent : !!emaCross?.deathRecent, 4, false, t.ema && emaCross != null);
  check('Volume spike', !!volSpike, 3, false, t.volume && volSpike != null);

  // Critical gates
  check('Spread ≤ 0.1%', (spreadPct ?? 1) <= 0.001, 0, true, spreadPct != null);
  check('Market verdict ≠ HIGH_RISK', marketVerdict !== 'HIGH_RISK', 0, true, !!marketVerdict);
  check(up ? 'BTC not bearish (alt-long gate)' : 'BTC not bullish (alt-short gate)',
    up ? btcTrend !== 'bearish' : btcTrend !== 'bullish', 0, true, !!btcTrend);
  check('Funding < 0.05%', Math.abs(funding ?? 0) < 0.0005, 0, true, funding != null);
  check('ADX > 20 (real trend, not chop)', (adx ?? 0) > 20, 0, true, t.adx && adx != null);
  check('Not hyper-volatile (ATR < 4%)', (atrPct ?? 0) < 0.04, 0, true, t.atr && atrPct != null);

  const totalWeight = results.filter((r) => !r.critical && r.active).reduce((s, r) => s + r.weight, 0);
  const earnedWeight = results.filter((r) => !r.critical && r.active && r.pass).reduce((s, r) => s + r.weight, 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
  const criticalFails = results.filter((r) => r.critical && r.active && !r.pass);
  const allPass = directional && criticalFails.length === 0 && score >= scoreThreshold;

  return { results, allPass, bias: dir, score, threshold: scoreThreshold, earnedWeight, totalWeight, criticalFails };
}
