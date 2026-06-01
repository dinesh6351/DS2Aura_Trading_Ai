import type { Candle } from '../binance/binance.client.js';

/**
 * Pure technical-indicator math, ported 1:1 from the original bot.js so the
 * SaaS engine produces identical signals. No side effects, no I/O.
 */

export function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) ema = closes[i]! * k + ema * (1 - k);
  return ema;
}

export function emaSeries(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(ema);
  for (let i = period; i < closes.length; i++) { ema = closes[i]! * k + ema * (1 - k); out.push(ema); }
  return out;
}

export function emaSlope(closes: number[], period: number, lookback = 5): number {
  const series = emaSeries(closes, period);
  if (series.length < lookback + 1) return 0;
  const now = series[series.length - 1]!;
  const past = series[series.length - 1 - lookback]!;
  return (now - past) / past;
}

export function calcMACD(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastE = emaSeries(closes, fast);
  const slowE = emaSeries(closes, slow);
  const n = Math.min(fastE.length, slowE.length);
  const macdLine: number[] = [];
  for (let i = 0; i < n; i++) macdLine.push(fastE[fastE.length - n + i]! - slowE[slowE.length - n + i]!);
  const signalLine = emaSeries(macdLine, signalPeriod);
  const macd = macdLine[macdLine.length - 1] ?? 0;
  const signal = signalLine[signalLine.length - 1] ?? 0;
  return { macd, signal, histogram: macd - signal };
}

export function calcRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calcATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!, p = candles[i - 1]!;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function avgVolume(candles: Candle[], n = 20): number {
  const vols = candles.slice(-n).map((c) => c.volume);
  return vols.reduce((a, b) => a + b, 0) / (vols.length || 1);
}

export function calcADX(candles: Candle[], period = 14): number {
  if (candles.length < period * 2) return 0;
  const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!, p = candles[i - 1]!;
    const up = c.high - p.high, down = p.low - c.low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const smooth = (arr: number[]) => arr.slice(-period).reduce((a, b) => a + b, 0);
  const atr = smooth(tr) || 1;
  const pDI = (smooth(plusDM) / atr) * 100;
  const mDI = (smooth(minusDM) / atr) * 100;
  const dx = (Math.abs(pDI - mDI) / (pDI + mDI || 1)) * 100;
  return dx;
}

export function calcVWAP(candles: Candle[]): number {
  let pv = 0, vol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume; vol += c.volume;
  }
  return vol > 0 ? pv / vol : candles[candles.length - 1]?.close ?? 0;
}

export function detectCandlePattern(candles: Candle[]) {
  const c = candles[candles.length - 1], p = candles[candles.length - 2];
  if (!c || !p) return { pattern: null as string | null, bullish: false, bearish: false };
  const body = Math.abs(c.close - c.open), range = c.high - c.low || 1;
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const upperWick = c.high - Math.max(c.open, c.close);
  // Bullish/bearish engulfing
  if (c.close > c.open && p.close < p.open && c.close >= p.open && c.open <= p.close)
    return { pattern: 'bullish_engulfing', bullish: true, bearish: false };
  if (c.close < c.open && p.close > p.open && c.open >= p.close && c.close <= p.open)
    return { pattern: 'bearish_engulfing', bullish: false, bearish: true };
  // Hammer / shooting star
  if (lowerWick > body * 2 && upperWick < body) return { pattern: 'hammer', bullish: true, bearish: false };
  if (upperWick > body * 2 && lowerWick < body) return { pattern: 'shooting_star', bullish: false, bearish: true };
  void range;
  return { pattern: null, bullish: false, bearish: false };
}

export function findSwingLevels(candles: Candle[], lookback = 50) {
  const slice = candles.slice(-lookback);
  if (!slice.length) return { support: null as number | null, resistance: null as number | null };
  const highs = slice.map((c) => c.high), lows = slice.map((c) => c.low);
  return { support: Math.min(...lows), resistance: Math.max(...highs) };
}

export function detectMarketStructure(candles: Candle[]) {
  const s = candles.slice(-20);
  if (s.length < 10) return { structure: 'unknown', uptrend: false, downtrend: false };
  const firstHalf = s.slice(0, s.length / 2), secondHalf = s.slice(s.length / 2);
  const maxA = Math.max(...firstHalf.map((c) => c.high)), maxB = Math.max(...secondHalf.map((c) => c.high));
  const minA = Math.min(...firstHalf.map((c) => c.low)), minB = Math.min(...secondHalf.map((c) => c.low));
  const uptrend = maxB > maxA && minB > minA;
  const downtrend = maxB < maxA && minB < minA;
  return { structure: uptrend ? 'HH-HL' : downtrend ? 'LH-LL' : 'range', uptrend, downtrend };
}

export function computeBiasOnTf(candles: Candle[]): 'long' | 'short' | 'none' {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1]!;
  const ema8 = calcEMA(closes, 8);
  const vwap = calcVWAP(candles);
  if (price > vwap && price > ema8) return 'long';
  if (price < vwap && price < ema8) return 'short';
  return 'none';
}
