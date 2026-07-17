// ============================================================
// SHARED DETECTION LOGIC (V2) — used by both bot.js (live) and
// backtest.js (historical replay). Single source of truth for
// every rule in the strategy.
//
// V2 CHANGES (from an external audit, cross-checked and applied
// after zero trades had fired in ~a week of live running):
//
//  1. Partial-close percentages changed 30/30/40 -> 20/30/50 at
//     1R/1.5R/3.5R. Old blended full-win R was 2.15 (breakeven
//     win rate 31.7%). New blended R is 2.40 (breakeven 29.4%).
//     Less banked early, more riding to the real target.
//
//  2. Break-even stop is no longer mechanical at TP1. Real risk
//     change, not just a tweak: after TP1 hits, the ORIGINAL stop
//     stays live until a genuine structural swing point forms in
//     the trade's favor (a higher-low above entry for longs, a
//     lower-high below entry for shorts) — only then does the
//     stop lock in (at that structural level, which can be better
//     than pure breakeven). This means a trade CAN still take a
//     full -1R loss even after TP1 has been hit, if price reverses
//     hard before any structure confirms. That's the accepted
//     trade-off for not getting stopped on a normal retracement.
//
//  3. Runway check narrowed: only checks for HTF (4H + Daily)
//     Order Blocks between entry and TP2 — not the full runway to
//     TP3, and not 1H-level OBs (fractal noise will almost always
//     have SOME 1H OB between entry and a 3.5R target; that's not
//     a meaningful blockade).
//
//  4. Weekend filter removed entirely. Crypto trades 24/7; the
//     restriction assumed forex-style illiquid weekends that don't
//     really apply the same way here.
//
//  5. Trade time-limit is no longer a flat 4 hours. Primary exit
//     is now "daily thesis invalidation" — if HTF bias flips
//     against the open trade's direction, close it immediately,
//     regardless of price level. A flat 24-hour outer ceiling
//     remains as a backstop so a trade can't linger forever
//     unresolved.
//
//  6. Equilibrium (Premium/Discount) no-trade buffer widened from
//     0.5% to 3% around the 50% midpoint — the old buffer was
//     narrow enough that a fair number of legitimate setups sitting
//     near 50% were probably being thrown out on a technicality.
//
//  7. New setup type: News-MSS. High-impact news events now have
//     three phases instead of one blanket block:
//       - 30 min before through 5 min after: full blackout, no
//         entries of ANY type.
//       - 5-15 min after: News-MSS window. A sweep + MSS forming
//         in this window can trigger a distinct News-MSS signal,
//         bypassing the normal kill-zone-timing requirement (news
//         doesn't respect session windows) but still requiring
//         HTF alignment — this stays a with-trend setup, avoiding
//         the same "counter-trend can never hit 6/6" contradiction
//         that Type B has.
//       - 15+ min after: normal Type A rules resume, unaffected.
// ============================================================

const CONFIG = {
  EMA_FAST: 20,
  EMA_SLOW: 50,
  TREND_SLOPE_LOOKBACK: 5,

  EQUAL_LEVEL_TOLERANCE_PCT: 0.0015,
  SWEEP_STOP_BUFFER_PCT: 0.0007,
  DISPLACEMENT_MULTIPLIER: 1.5,
  FVG_LOOKBACK_CANDLES: 6,

  // Widened from 0.005 (0.5%) — the old buffer was narrow enough
  // that setups sitting near 50% were probably being discarded on
  // a technicality rather than a real equilibrium read.
  EQUILIBRIUM_BUFFER_PCT: 0.03,

  OB_DISPLACEMENT_MULTIPLIER: 1.5,
  ROUND_NUMBER_STEP: { BTCUSDT: 1000, ETHUSDT: 100, SOLUSDT: 10 },

  TP1_R: 1.0, TP2_R: 1.5, TP3_R: 3.5,
  // Changed from 0.3/0.3/0.4 — see V2 note #1 above.
  TP1_CLOSE_PCT: 0.2, TP2_CLOSE_PCT: 0.3, TP3_CLOSE_PCT: 0.5,

  MIN_SCORE_TYPE_A: 5,
  MAX_SCORE: 6,

  // FUNDING_RATE_MAX_ABS_PCT of 0.1 (percent, per 8h) annualizes to
  // ~110%/year — already a euphoria-extreme threshold, not a
  // "no crowd allowed" filter. Ordinary healthy bull-market funding
  // (~0.01-0.03%/8h) passes through untouched. Unchanged in V2 —
  // an external audit questioned this but the math already checks out.
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

  // News phases (see V2 note #7)
  NEWS_BLACKOUT_BEFORE_MIN: 30,
  NEWS_BLACKOUT_AFTER_MIN: 5,
  NEWS_WINDOW_AFTER_MIN: 15,

  DAILY_PROFIT_CAP_PCT: 0.03,
  DAILY_LOSS_CAP_PCT: 0.03,
  LOSS_STREAK_COUNT: 3,
  LOSS_STREAK_COOLDOWN_HOURS: 24,

  // Changed from 4 — now an outer backstop only. The real exit
  // trigger is thesis invalidation (see evaluateTradeExit).
  MAX_TRADE_DURATION_HOURS: 24,
};

// ---------------------------------------------------------
// Trend / bias
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// Swing points / structure
// ---------------------------------------------------------

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

function crossesRoundNumber(entry, target, symbol) {
  const step = CONFIG.ROUND_NUMBER_STEP[symbol] || 100;
  const lo = Math.min(entry, target), hi = Math.max(entry, target);
  const first = Math.ceil(lo / step) * step;
  for (let lvl = first; lvl <= hi; lvl += step) {
    if (lvl > lo + (hi - lo) * 0.05 && lvl < hi - (hi - lo) * 0.02) return true;
  }
  return false;
}

// V2: only checks HTF (4H+Daily) Order Blocks between entry and TP2
// — not the full runway to TP3, and not 1H-level OBs (see header).
function runwayIsClean(entry, tp2, htfOrderBlocks, symbol) {
  const lo = Math.min(entry, tp2), hi = Math.max(entry, tp2);
  const obBlocked = htfOrderBlocks.some(ob => ob.bottom < hi && ob.top > lo);
  return !obBlocked && !crossesRoundNumber(entry, tp2, symbol);
}

// ---------------------------------------------------------
// AMD bias
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// Kill zone / calendar
// ---------------------------------------------------------

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

// Kept as a pure info function — no longer used as a hard gate (V2 #4)
function isWeekend(now) {
  const day = now.getUTCDay(), h = now.getUTCHours();
  if (day === 6 && h >= 22) return true;
  if (day === 0 && h < 22) return true;
  return false;
}

// newsEvent: { title, timeMs } for the nearest high-impact event, or
// null if none nearby. Returns which of the three V2 phases we're in.
function getNewsPhase(newsEvent, now) {
  if (!newsEvent) return { phase: 'clear' };
  const minutesAway = (newsEvent.timeMs - now.getTime()) / 60000; // positive = event is upcoming
  if (minutesAway <= CONFIG.NEWS_BLACKOUT_BEFORE_MIN && minutesAway >= -CONFIG.NEWS_BLACKOUT_AFTER_MIN) {
    return { phase: 'blackout', event: newsEvent.title, minutesAway: Math.round(minutesAway) };
  }
  if (minutesAway < -CONFIG.NEWS_BLACKOUT_AFTER_MIN && minutesAway >= -CONFIG.NEWS_WINDOW_AFTER_MIN) {
    return { phase: 'news-window', event: newsEvent.title, minutesAway: Math.round(minutesAway) };
  }
  return { phase: 'clear' };
}

// ---------------------------------------------------------
// Setup evaluation
// ---------------------------------------------------------

function evaluateSetup({ symbol, weekly, daily, h4, h1, m15, price, now, funding, fearGreed, newsEvent }) {
  const htf = htfBias(weekly, daily, h4);
  const dailyH4Aligned = htf.daily !== 'range' && htf.daily === htf.h4;

  if (!htf.aligned) {
    return {
      symbol, skip: true, score: 0, reason: 'HTF not aligned', htf, dailyH4Aligned, setupType: null,
      checklist: { htfAligned: false, inTimingWindow: null, correctZone: null, sweepConfirmed: null, mssConfirmed: null, cleanRunway: null },
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
  const newsPhase = getNewsPhase(newsEvent, now);
  const isNewsWindow = newsPhase.phase === 'news-window';
  const newsBlackout = newsPhase.phase === 'blackout';

  const timingOk = isNewsWindow ? true : (kz.active && kz.tradable);
  const setupType = isNewsWindow ? 'News-MSS' : 'Type A';

  const fundingOk = funding === null || funding === undefined ? true : Math.abs(funding) <= CONFIG.FUNDING_RATE_MAX_ABS_PCT;
  const macroOk = fearGreed === null || fearGreed === undefined ? true : (fearGreed >= CONFIG.FEAR_GREED_MIN && fearGreed <= CONFIG.FEAR_GREED_MAX);

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
    const obsH4 = findUnmitigatedOrderBlocks(h4, direction === 'long' ? 'bullish' : 'bearish');
    const obsDaily = findUnmitigatedOrderBlocks(daily, direction === 'long' ? 'bullish' : 'bearish');
    runwayOk = runwayIsClean(entry, tp2, [...obsH4, ...obsDaily], symbol);
  }

  const hardGatesPass = timingOk && !newsBlackout && fundingOk && macroOk && mss.found && runwayOk && !amdContradicts;
  const score = [true, timingOk, zoneOk, sweepLevel !== null, mss.found, runwayOk].filter(Boolean).length;

  return {
    symbol, skip: !(hardGatesPass && score >= CONFIG.MIN_SCORE_TYPE_A), score, direction, zone, setupType,
    killZoneName: kz.name, killZoneActive: kz.active, newsPhase: newsPhase.phase, newsEvent: newsPhase.event || null,
    fundingOk, funding, fearGreed, macroOk, amdBias, amdContradicts,
    entry, stop, tp1, tp2, tp3, price, htf, dailyH4Aligned, pdh, pdl,
    checklist: {
      htfAligned: htf.aligned, inTimingWindow: timingOk, correctZone: zoneOk,
      sweepConfirmed: sweepLevel !== null, mssConfirmed: mss.found,
      cleanRunway: mss.found ? runwayOk : null,
    },
  };
}

// ---------------------------------------------------------
// Trade exit management (V2 — structural BE + thesis invalidation)
// ---------------------------------------------------------

function evaluateTradeExit({ trade, high, low, close, now, candlesSinceEntry = [], htfStillAligned = null }) {
  const isLong = trade.direction === 'long';

  if (htfStillAligned === false) {
    const partialR = (isLong ? close - trade.entry : trade.entry - close) / Math.abs(trade.entry - trade.stop);
    return { closed: true, reason: 'Closed - Daily Thesis Invalidated', rMultiple: partialR };
  }

  const hitTP3 = isLong ? high >= trade.tp3 : low <= trade.tp3;
  const hitTP2 = isLong ? high >= trade.tp2 : low <= trade.tp2;
  const hitTP1 = isLong ? high >= trade.tp1 : low <= trade.tp1;

  if (trade.tp1Hit && !trade.tp2Hit && !trade.structuralBELocked && candlesSinceEntry.length >= 6) {
    const swings = findSwingPoints(candlesSinceEntry, 2);
    if (isLong) {
      const qualifying = swings.lows.filter(s => s.price >= trade.entry);
      if (qualifying.length > 0) {
        trade.structuralBELocked = true;
        trade.structuralStopLevel = qualifying[qualifying.length - 1].price;
      }
    } else {
      const qualifying = swings.highs.filter(s => s.price <= trade.entry);
      if (qualifying.length > 0) {
        trade.structuralBELocked = true;
        trade.structuralStopLevel = qualifying[qualifying.length - 1].price;
      }
    }
  }

  const effectiveStop = trade.tp2Hit
    ? trade.tp1
    : (trade.structuralBELocked ? trade.structuralStopLevel : trade.stop);
  const hitStop = isLong ? low <= effectiveStop : high >= effectiveStop;

  if (hitStop) {
    let reason, r;
    if (trade.tp2Hit) {
      reason = 'Partial Win - TP2 then stopped at TP1';
      r = CONFIG.TP1_CLOSE_PCT * CONFIG.TP1_R + CONFIG.TP2_CLOSE_PCT * CONFIG.TP2_R;
    } else if (trade.structuralBELocked) {
      const riskDist = Math.abs(trade.entry - trade.stop);
      const remainingR = isLong
        ? (trade.structuralStopLevel - trade.entry) / riskDist
        : (trade.entry - trade.structuralStopLevel) / riskDist;
      reason = remainingR > 0.001 ? 'Win - Structural Stop (better than BE)' : 'Breakeven - Structural Stop';
      r = CONFIG.TP1_CLOSE_PCT * CONFIG.TP1_R + (1 - CONFIG.TP1_CLOSE_PCT) * remainingR;
    } else {
      reason = trade.tp1Hit ? 'Loss - Stopped Out (structure never confirmed)' : 'Loss - Stopped Out';
      r = -1;
    }
    return { closed: true, reason, rMultiple: r };
  }

  if (hitTP3) {
    const r = CONFIG.TP1_CLOSE_PCT * CONFIG.TP1_R + CONFIG.TP2_CLOSE_PCT * CONFIG.TP2_R + CONFIG.TP3_CLOSE_PCT * CONFIG.TP3_R;
    return { closed: true, reason: 'Win - Hit TP3', rMultiple: r };
  }
  if (hitTP2 && !trade.tp2Hit) trade.tp2Hit = true;
  if (hitTP1 && !trade.tp1Hit) trade.tp1Hit = true;

  const hoursOpen = (now.getTime() - trade.openTime.getTime()) / 3600000;
  if (hoursOpen >= CONFIG.MAX_TRADE_DURATION_HOURS) {
    const partialR = (isLong ? close - trade.entry : trade.entry - close) / Math.abs(trade.entry - trade.stop);
    return { closed: true, reason: 'Closed - Time Limit (24h outer ceiling)', rMultiple: partialR };
  }

  return { closed: false };
}

module.exports = {
  CONFIG, ema, trendDirection, htfBias, findSwingPoints, findEqualLevels, detectSweep,
  detectDisplacementAndFVG, premiumDiscountZone, findUnmitigatedOrderBlocks, crossesRoundNumber,
  runwayIsClean, getAsianRange, getAMDBias, getKillZoneInfo, isWeekend, getNewsPhase,
  evaluateSetup, evaluateTradeExit,
};
