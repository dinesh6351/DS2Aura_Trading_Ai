import type { Candle } from '../binance/binance.client.js';
import type { StrategyCtx } from './strategy.js';
import {
  calcEMA, calcATR, calcADX, calcMACD, calcRSI, avgVolume, emaSlope,
  detectCandlePattern, findSwingLevels, detectMarketStructure,
  bollinger, stochastic, stochRSI, williamsR, cci, mfi, obvSlope, cmf, roc,
  momentum, awesomeOscillator, parabolicSAR, supertrend, ichimoku, donchian,
  keltner, directionalIndex, consecutiveDir, vwapBands, emaCrosses, volumeSpike,
  detectBreakout, detectLiquiditySweep,
} from './indicators.js';

/**
 * Builds the candle-derived portion of the StrategyCtx — the full professional
 * indicator suite scored by runSafetyCheck. SHARED by the live engine and the
 * chart's "Signal Conditions" breakdown so both evaluate the exact same set
 * (no drift). The caller merges in async/market fields: funding, multiTfAgree,
 * btcTrend, marketVerdict, fearGreed and the user's toggles.
 */
export function buildCandleCtx(candles: Candle[]): StrategyCtx {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? 0;
  const atr = calcATR(candles, 14);
  const swing = findSwingLevels(candles, 50);
  const volRatio = (candles[candles.length - 1]?.volume ?? 0) / (avgVolume(candles, 20) || 1);
  return {
    ema20: calcEMA(closes, 20),
    ema50: calcEMA(closes, 50),
    ema200: closes.length >= 200 ? calcEMA(closes, 200) : undefined,
    ema50Slope: emaSlope(closes, 50),
    atrPct: price > 0 ? atr / price : 0,
    volRatio,
    macd: calcMACD(closes),
    adx: calcADX(candles, 14),
    pattern: detectCandlePattern(candles),
    swingLevels: swing,
    marketStructure: detectMarketStructure(candles),
    breakout: detectBreakout(candles, swing, volRatio),
    sweep: detectLiquiditySweep(candles, swing),
    // ── extended professional indicator suite ──
    rsi14: calcRSI(closes, 14),
    boll: bollinger(closes, 20, 2),
    stoch: stochastic(candles, 14, 3),
    stochRsi: stochRSI(closes, 14, 3),
    williamsR: williamsR(candles, 14),
    cci: cci(candles, 20),
    mfi: mfi(candles, 14),
    obvSlope: obvSlope(candles, 20),
    cmf: cmf(candles, 20),
    roc: roc(closes, 12),
    momentum: momentum(closes, 10),
    ao: awesomeOscillator(candles),
    psar: parabolicSAR(candles),
    supertrend: supertrend(candles, 10, 3),
    ichimoku: ichimoku(candles),
    donchian: donchian(candles, 20),
    keltner: keltner(closes, candles, 20, 2),
    di: directionalIndex(candles, 14),
    consec: consecutiveDir(candles),
    vwapBands: vwapBands(candles, 2),
    emaCross: emaCrosses(closes),
    volSpike: volumeSpike(candles, 20, 2),
  };
}
