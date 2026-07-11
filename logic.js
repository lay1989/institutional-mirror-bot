// ============================================================
// SHARED DETECTION LOGIC — used by both bot.js (live) and
// backtest.js (historical replay). This is the single source of
// truth for every rule in the strategy. Change a threshold here
// and both the live bot and any future backtest use the new
// value — they can never quietly drift apart from each other.
// ============================================================

const CONFIG = {
  EMA_FAST: 20,
  EMA_SLOW: 50,
  TREND_SLOPE_LOOKBACK: 5,

  EQUAL_LEVEL_TOLERANCE_PCT: 0.0015,
  SWEEP_STOP_BUFFER_PCT: 0.0007,
  DISPLACEMENT_MULTIPLIER: 1.5,
  FVG_LOOKBACK_CANDLES: 6,
  EQUILIBRIUM_BUFFER_PCT: 0.005,
  OB_DISPLACEMENT_MULTIPLIER: 1.5,
  ROUND_NUMBER_STEP: { BTCUSDT: 1000, ETHUSDT: 100, SOLUSDT: 10 },

  TP1_R: 1.0, TP2_R: 1.5, TP3_R: 3.5,
  TP1_CLOSE_PCT: 0.3, TP2_CLOSE_PCT: 0.3, TP3_CLOSE_PCT: 0.4,

  MIN_SCORE_TYPE_A: 5,
  MAX_SCORE: 6,

  // FUNDING_RATE_MAX_ABS_PCT of 0.1 (percent, per 8h) annualizes to
  // ~110%/year — already a euphoria-extreme threshold, not a
  // "no crowd allowed" filter. Ordinary healthy bull-market funding
  // (~0.01-0.03%/8h) passes through untouched.
  FUNDING_RATE_MAX_ABS_PCT: 0.1,
  FEAR_GREED_MIN: 20,
  FEAR_GREED_MAX: 85,

  KILL_ZONES: [
    { name: 'Asian Range', start: 0, end: 240, entryEligible: false },
    { name: 'London KZ', start: 420, end: 600, entryEligible: true },
    { name: 'New York KZ', start: 720, end: 900, entryEligible: true },
    { name: 'Silver Bullet', start: 900, end: 960, entryEligible: true },
  ],
  KILL_ZONE_ENTRY_DELAY_MIN: 20,

  DAILY_PROFIT_CAP_PCT: 0.03,
  DAILY_LOSS_CAP_PCT: 0.03,
  LOSS_STREAK_COUNT: 3,
  LOSS_STREAK_COOLDOWN_HOURS: 24,
  MAX_TRADE_DURATION_HOURS: 4,
};

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function trendDirection(candles) {
  const closes = candles.map(c => c.close);
  const eF = ema(closes, CONFIG.EMA_FAST);
  const eS = ema(closes, CONFIG.EMA_SLOW);
  const last = closes.length - 1;
  const lb = CONFIG.TREND_SLOPE_LOOKBACK;
  if (eF[last] > eS[last] && eF[last] > eF[last - lb]) return 'bull';
  if (eF[last] < eS[last] && eF[last] < eF[last - lb]) return 'bear';
  return 'range';
}

function htfBias(weekly, daily, h4) {
  const wt = trendDirection(weekly), dt = trendDirection(daily), ht = trendDirection(h4);
  const aligned = wt !== 'range' && wt === dt && dt === ht;
  return { aligned, bias: aligned ? dt : 'range', weekly: wt, daily: dt, h4: ht };
}

function findSwingPoints(candles, lookback = 2) {
  const highs = [], lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const wh = candles.slice(i - lookback, i + lookback + 1).map(c => c.high);
    const wl = candles.slice(i - lookback, i + lookback + 1).map(c => c.low);
    if (candles[i].high === Math.max(...wh)) highs.push({ index: i, price: candles[i].high });
    if (candles[i].low === Math.min(...wl)) lows.push({ index: i, price: candles[i].low });
  }
  return { highs, lows };
}

function findEqualLevels(points) {
  const levels = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.abs(points[i].price - points[j].price) / points[i].price <= CONFIG.EQUAL_LEVEL_TOLERANCE_PCT) {
        levels.push((points[i].price + points[j].price) / 2);
      }
    }
  }
  return levels;
}

function detectSweep(candles, level, direction) {
  const last = candles[candles.length - 1], prev = candles[candles.length - 2];
  if (direction === 'above') return (last.high > level || prev.high > level) && last.close < level;
  return (last.low < level || prev.low < level) && last.close > level;
}

function detectDisplacementAndFVG(candles, direction) {
  const recent = candles.slice(-CONFIG.FVG_LOOKBACK_CANDLES);
  const bodies = recent.map(c => Math.abs(c.close - c.open));
  const avgBody = bodies.slice(0, -1).reduce((a, b) => a + b, 0) / (bodies.length - 1);
  for (let i = 2; i < recent.length; i++) {
    const c1 = recent[i - 2], c2 = recent[i - 1], c3 = recent[i];
    const displacement = Math.abs(c2.close - c2.open) >= avgBody * CONFIG.DISPLACEMENT_MULTIPLIER;
    const bullish = c2.close > c2.open;
    if (direction === 'bullish' && displacement && bullish && c1.high < c3.low) {
      return { found: true, mid: (c3.low + c1.high) / 2 };
    }
    if (direction === 'bearish' && displacement && !bullish && c1.low > c3.high) {
      return { found: true, mid: (c1.low + c3.high) / 2 };
    }
  }
  return { found: false };
}

function premiumDiscountZone(candles, currentPrice) {
  const swingHigh = Math.max(...candles.map(c => c.high));
  const swingLow = Math.min(...candles.map(c => c.low));
  const mid = (swingHigh + swingLow) / 2;
  if (currentPrice < mid * (1 - CONFIG.EQUILIBRIUM_BUFFER_PCT)) return 'discount';
  if (currentPrice > mid * (1 + CONFIG.EQUILIBRIUM_BUFFER_PCT)) return 'premium';
  return 'equilibrium';
}

function findUnmitigatedOrderBlocks(candles, direction) {
  const blocks = [];
  for (let i = 2; i < candles.length; i++) {
    const move = candles[i];
    const prevBody = Math.abs(candles[i - 1].close - candles[i - 1].open) || 0.0001;
    if (Math.abs(move.close - move.open) <= prevBody * CONFIG.OB_DISPLACEMENT_MULTIPLIER) continue;
    const bullMove = move.close > move.open;
    const obCandle = candles[i - 1];
    if (direction === 'bullish' && bullMove && obCandle.close < obCandle.open) {
      if (!candles.slice(i + 1).some(c => c.low <= obCandle.high)) blocks.push({ top: obCandle.high, bottom: obCandle.low });
    }
    if (direction === 'bearish' && !bullMove && obCandle.close > obCandle.open) {
      if (!candles.slice(i + 1).some(c => c.high >= obCandle.low)) blocks.push({ top: obCandle.high, bottom: obCandle.low });
    }
  }
  return blocks;
}

function crossesRoundNumber(entry, tp3, symbol) {
  const step = CONFIG.ROUND_NUMBER_STEP[symbol] || 100;
  const lo = Math.min(entry, tp3), hi = Math.max(entry, tp3);
  const first = Math.ceil(lo / step) * step;
  for (let lvl = first; lvl <= hi; lvl += step) {
    if (lvl > lo + (hi - lo) * 0.05 && lvl < hi - (hi - lo) * 0.02) return true;
  }
  return false;
}

function runwayIsClean(entry, tp3, orderBlocks, symbol) {
  const lo = Math.min(entry, tp3), hi = Math.max(entry, tp3);
  const obBlocked = orderBlocks.some(ob => ob.bottom < hi && ob.top > lo);
  return !obBlocked && !crossesRoundNumber(entry, tp3, symbol);
}

function getAsianRange(candles15m, now) {
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  const asianEnd = todayStart + 4 * 3600000;
  const asianCandles = candles15m.filter(c => c.openTime >= todayStart && c.openTime < asianEnd);
  if (asianCandles.length === 0) return null;
  return { high: Math.max(...asianCandles.map(c => c.high)), low: Math.min(...asianCandles.map(c => c.low)) };
}

function getAMDBias(candles15m, now) {
  const minutesIntoDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutesIntoDay < 240) return 'undetermined';
  const asian = getAsianRange(candles15m, now);
  if (!asian) return 'undetermined';
  if (minutesIntoDay < 420) return 'undetermined';

  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0);
  const londonStart = todayStart + 7 * 3600000;
  const sinceLondon = candles15m.filter(c => c.openTime >= londonStart && c.openTime <= now.getTime());

  for (const c of sinceLondon) {
    if (c.high > asian.high && c.close < asian.high) return 'bearish';
    if (c.low < asian.low && c.close > asian.low) return 'bullish';
  }
  return 'undetermined';
}

function getKillZoneInfo(now) {
  const minutesIntoDay = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (const z of CONFIG.KILL_ZONES) {
    if (minutesIntoDay >= z.start && minutesIntoDay < z.end) {
      const pastDelay = (minutesIntoDay - z.start) >= CONFIG.KILL_ZONE_ENTRY_DELAY_MIN;
      return { active: true, name: z.name, tradable: z.entryEligible && pastDelay };
    }
  }
  return { active: false, name: null, tradable: false };
}

function isWeekend(now) {
  const day = now.getUTCDay(), h = now.getUTCHours();
  if (day === 6 && h >= 22) return true;
  if (day === 0 && h < 22) return true;
  return false;
}

// Given fully-formed candle arrays (already sliced to "as of now" by
// the caller — critical for backtesting without lookahead bias),
// run the complete 6-point evaluation. Used identically by the live
// bot (real-time candles) and the backtester (historical candles
// sliced up to the simulated timestamp).
function evaluateSetup({ symbol, weekly, daily, h4, h1, m15, price, now, funding, fearGreed, newsBlock }) {
  const htf = htfBias(weekly, daily, h4);
  const dailyH4Aligned = htf.daily !== 'range' && htf.daily === htf.h4;

  if (!htf.aligned) {
    return {
      symbol, skip: true, score: 0, reason: 'HTF not aligned', htf, dailyH4Aligned,
      checklist: { htfAligned: false, inKillZone: null, correctZone: null, sweepConfirmed: null, mssConfirmed: null, cleanRunway: null },
    };
  }

  const direction = htf.bias === 'bull' ? 'long' : 'short';
  const zone = premiumDiscountZone(h1, price);
  const zoneOk = (direction === 'long' && zone === 'discount') || (direction === 'short' && zone === 'premium');

  const swings = findSwingPoints(h1, 2);
  const eqLevels = findEqualLevels(direction === 'long' ? swings.lows : swings.highs);
  const pdh = daily.length > 1 ? daily[daily.length - 2].high : null;
  const pdl = daily.length > 1 ? daily[daily.length - 2].low : null;
  const candidateLevels = [...eqLevels, direction === 'long' ? pdl : pdh].filter(Boolean);

  let sweepLevel = null;
  for (const lvl of candidateLevels) {
    if (detectSweep(m15, lvl, direction === 'long' ? 'below' : 'above')) { sweepLevel = lvl; break; }
  }

  const mss = sweepLevel !== null
    ? detectDisplacementAndFVG(m15, direction === 'long' ? 'bullish' : 'bearish')
    : { found: false };

  const kz = getKillZoneInfo(now);
  const weekend = isWeekend(now);
  const fundingOk = funding === null || funding === undefined ? true : Math.abs(funding) <= CONFIG.FUNDING_RATE_MAX_ABS_PCT;
  const macroOk = fearGreed === null || fearGreed === undefined ? true : (fearGreed >= CONFIG.FEAR_GREED_MIN && fearGreed <= CONFIG.FEAR_GREED_MAX);
  const newsOk = !newsBlock || !newsBlock.blocked;

  const amdBias = getAMDBias(m15, now);
  const inNYWindow = kz.name === 'New York KZ' || kz.name === 'Silver Bullet';
  const amdContradicts = inNYWindow && amdBias !== 'undetermined' &&
    ((direction === 'long' && amdBias === 'bearish') || (direction === 'short' && amdBias === 'bullish'));

  let entry = null, stop = null, tp1 = null, tp2 = null, tp3 = null, runwayOk = false;

  if (mss.found) {
    entry = mss.mid;
    const buffer = price * CONFIG.SWEEP_STOP_BUFFER_PCT;
    stop = direction === 'long' ? sweepLevel - buffer : sweepLevel + buffer;
    const dist = Math.abs(entry - stop);
    tp1 = direction === 'long' ? entry + dist * CONFIG.TP1_R : entry - dist * CONFIG.TP1_R;
    tp2 = direction === 'long' ? entry + dist * CONFIG.TP2_R : entry - dist * CONFIG.TP2_R;
    tp3 = direction === 'long' ? entry + dist * CONFIG.TP3_R : entry - dist * CONFIG.TP3_R;
    const obs = findUnmitigatedOrderBlocks(h1, direction === 'long' ? 'bullish' : 'bearish');
    runwayOk = runwayIsClean(entry, tp3, obs, symbol);
  }

  const hardGatesPass = kz.active && kz.tradable && !weekend && fundingOk && macroOk && mss.found && runwayOk && !amdContradicts && newsOk;
  const score = [true, kz.active && kz.tradable, zoneOk, sweepLevel !== null, mss.found, runwayOk].filter(Boolean).length;

  return {
    symbol, skip: !(hardGatesPass && score >= CONFIG.MIN_SCORE_TYPE_A), score, direction, zone,
    killZoneName: kz.name, killZoneActive: kz.active, weekend, funding, fundingOk, fearGreed, macroOk,
    amdBias, amdContradicts, newsOk, entry, stop, tp1, tp2, tp3, price, htf, dailyH4Aligned, pdh, pdl,
    checklist: {
      htfAligned: htf.aligned, inKillZone: kz.active && kz.tradable, correctZone: zoneOk,
      sweepConfirmed: sweepLevel !== null, mssConfirmed: mss.found,
      cleanRunway: mss.found ? runwayOk : null,
    },
  };
}

module.exports = {
  CONFIG, ema, trendDirection, htfBias, findSwingPoints, findEqualLevels, detectSweep,
  detectDisplacementAndFVG, premiumDiscountZone, findUnmitigatedOrderBlocks, crossesRoundNumber,
  runwayIsClean, getAsianRange, getAMDBias, getKillZoneInfo, isWeekend, evaluateSetup,
};
