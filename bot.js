// ============================================================
// INSTITUTIONAL MIRROR — Automated Paper-Trading Signal Bot (v2)
// ============================================================
// Changes from v1:
//  - All thresholds pulled into one CONFIG object (see below)
//  - HTF bias is now a true 3-way check: Weekly + Daily + 4H
//  - AMD bias is auto-detected (Asian range sweep -> NY direction)
//    and used as a hard gate specifically for NY KZ / Silver Bullet
//  - Round-number blockade check added to the runway filter
//  - Writes a live snapshot (data/latest.json) back to this repo
//    on every run, so the web app can show what's happening
//    without depending on Apps Script's inconsistent CORS
//    behavior for browser reads (see SETUP.md for why)
// ============================================================

const SHEETS_URL = process.env.SHEETS_URL;
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const BINANCE = 'https://api.binance.com';
const BINANCE_FUTURES = 'https://fapi.binance.com';

if (!SHEETS_URL) {
  console.error('Missing SHEETS_URL environment variable. Set it as a GitHub Actions secret.');
  process.exit(1);
}

// ============================================================
// CONFIG — every tunable number lives here. Nothing below this
// block should need editing; if you want to loosen/tighten the
// system after watching a week of output, change it here.
// ============================================================
const CONFIG = {
  // Trend / regime filter (EMA crossover on each timeframe)
  EMA_FAST: 20,
  EMA_SLOW: 50,
  TREND_SLOPE_LOOKBACK: 5,       // candles back used to confirm the EMA is actually sloping, not flat

  // Equal Highs/Lows clustering
  EQUAL_LEVEL_TOLERANCE_PCT: 0.0015,  // 0.15% — two swing points this close count as "equal"

  // Liquidity sweep -> stop-loss placement
  SWEEP_STOP_BUFFER_PCT: 0.0007,      // 0.07% beyond the swept wick

  // Displacement / Fair Value Gap
  DISPLACEMENT_MULTIPLIER: 1.5,       // candle body must be >= 1.5x recent avg body to count as displacement
  FVG_LOOKBACK_CANDLES: 6,

  // Premium / Discount
  EQUILIBRIUM_BUFFER_PCT: 0.005,      // 0.5% band around the 50% midpoint = "no trade" zone

  // Order Blocks
  OB_DISPLACEMENT_MULTIPLIER: 1.5,

  // Round-number blockade (price step considered "a round number" per symbol)
  ROUND_NUMBER_STEP: { BTCUSDT: 1000, ETHUSDT: 100, SOLUSDT: 10 },

  // Risk / reward ladder
  TP1_R: 1.0, TP2_R: 1.5, TP3_R: 3.5,
  TP1_CLOSE_PCT: 0.3, TP2_CLOSE_PCT: 0.3, TP3_CLOSE_PCT: 0.4,

  // Confluence scorecard
  MIN_SCORE_TYPE_A: 5,   // out of 6 — one point (zone) is allowed to miss
  MAX_SCORE: 6,

  // Macro filters
  FUNDING_RATE_MAX_ABS_PCT: 0.1,      // skip if |funding| > 0.1% per 8h
  FEAR_GREED_MIN: 20,
  FEAR_GREED_MAX: 85,

  // Kill zones (UTC minutes-of-day). Asian Range is intentionally
  // NOT entry-eligible — it's where the range gets built for
  // London/NY to sweep, not a window you trade in yourself.
  KILL_ZONES: [
    { name: 'Asian Range', start: 0, end: 240, entryEligible: false },
    { name: 'London KZ', start: 420, end: 600, entryEligible: true },
    { name: 'New York KZ', start: 720, end: 900, entryEligible: true },
    { name: 'Silver Bullet', start: 900, end: 960, entryEligible: true },
  ],
  KILL_ZONE_ENTRY_DELAY_MIN: 20,       // wait this long into a zone before taking a signal

  // Risk guards
  DAILY_PROFIT_CAP_PCT: 0.03,
  DAILY_LOSS_CAP_PCT: 0.03,
  LOSS_STREAK_COUNT: 3,
  LOSS_STREAK_COOLDOWN_HOURS: 24,
  MAX_TRADE_DURATION_HOURS: 4,
};

// ---------------------------------------------------------
// Data fetching — Binance public endpoints (no key needed)
// ---------------------------------------------------------

async function getKlines(symbol, interval, limit = 150) {
  const url = `${BINANCE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`klines ${symbol} ${interval} failed: HTTP ${res.status}`);
  const raw = await res.json();
  return raw.map(c => ({ openTime: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5], closeTime: c[6] }));
}

async function getPrice(symbol) {
  const res = await fetch(`${BINANCE}/api/v3/ticker/price?symbol=${symbol}`);
  if (!res.ok) throw new Error(`price ${symbol} failed: HTTP ${res.status}`);
  return +(await res.json()).price;
}

async function getFundingRate(symbol) {
  try {
    const res = await fetch(`${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=${symbol}`);
    if (!res.ok) return null;
    return +(await res.json()).lastFundingRate * 100;
  } catch { return null; }
}

async function getFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const data = await res.json();
    return parseInt(data.data[0].value, 10);
  } catch { return null; }
}

// ---------------------------------------------------------
// Sheets I/O (the durable database — unchanged from before)
// ---------------------------------------------------------

async function sheetsGet(status) {
  const url = status ? `${SHEETS_URL}?status=${status}` : SHEETS_URL;
  const res = await fetch(url);
  return res.json();
}

async function sheetsPost(body) {
  const res = await fetch(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---------------------------------------------------------
// Technical analysis primitives
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

// True 3-way HTF bias: Weekly + Daily + 4H must all agree.
// Plain terms: on three different zoom levels of the chart (a
// multi-year weekly view, a months-long daily view, and a
// weeks-long 4-hour view), price has to be trending the same
// direction on all three at once. If the weekly says up but the
// 4H says down, that's not a real trend yet — probably just a
// pullback inside a bigger move, or noise — so we sit out.
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

// Does a "round number" (per-symbol step, e.g. every $1000 for BTC)
// sit meaningfully between entry and TP3? Edges are excluded so we
// don't flag a false positive when entry/target just happen to sit
// near a round level themselves.
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

// ---------------------------------------------------------
// AMD bias — Accumulation / Manipulation / Distribution
//
// Plain-English version: the Asian session (00:00-04:00 UTC)
// usually just chops sideways and "builds a range" — that's the
// Accumulation. Then London opens and very often fakes a move in
// ONE direction just far enough to trigger stops sitting above or
// below that Asian range, before snapping back — that's the
// Manipulation. Whichever side got faked-and-rejected tells you
// which direction New York tends to actually deliver — that's
// the Distribution. So: London wicks above the Asian high and
// closes back under it -> bias flips bearish for NY. London wicks
// below the Asian low and closes back over it -> bias flips
// bullish for NY. If neither has happened yet, bias is
// "undetermined" and we don't force a guess.
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
  if (minutesIntoDay < 240) return 'undetermined'; // Asian range still forming
  const asian = getAsianRange(candles15m, now);
  if (!asian) return 'undetermined';
  if (minutesIntoDay < 420) return 'undetermined'; // London hasn't opened yet

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
// Kill zone / calendar logic (UTC only)
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

function isWeekend(now) {
  const day = now.getUTCDay(), h = now.getUTCHours();
  if (day === 6 && h >= 22) return true;
  if (day === 0 && h < 22) return true;
  return false;
}

// ---------------------------------------------------------
// Setup evaluation — the algorithmic 6-point scorecard
// ---------------------------------------------------------

async function evaluatePair(symbol, fearGreed) {
  const [weekly, daily, h4, h1, m15, price] = await Promise.all([
    getKlines(symbol, '1w', 60),
    getKlines(symbol, '1d', 100),
    getKlines(symbol, '4h', 100),
    getKlines(symbol, '1h', 100),
    getKlines(symbol, '15m', 150),
    getPrice(symbol),
  ]);

  const htf = htfBias(weekly, daily, h4);
  if (!htf.aligned) return { symbol, skip: true, reason: 'HTF not aligned', htf };

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

  const kz = getKillZoneInfo(new Date());
  const weekend = isWeekend(new Date());
  const funding = await getFundingRate(symbol);
  const fundingOk = funding === null ? true : Math.abs(funding) <= CONFIG.FUNDING_RATE_MAX_ABS_PCT;
  const macroOk = fearGreed === null ? true : (fearGreed >= CONFIG.FEAR_GREED_MIN && fearGreed <= CONFIG.FEAR_GREED_MAX);

  const amdBias = getAMDBias(m15, new Date());
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

  const hardGatesPass = kz.active && kz.tradable && !weekend && fundingOk && macroOk && mss.found && runwayOk && !amdContradicts;
  const score = [true, kz.active && kz.tradable, zoneOk, sweepLevel !== null, mss.found, runwayOk].filter(Boolean).length;

  return {
    symbol, skip: !(hardGatesPass && score >= CONFIG.MIN_SCORE_TYPE_A), score, direction, zone,
    killZoneName: kz.name, weekend, funding, fundingOk, fearGreed, macroOk, amdBias, amdContradicts,
    entry, stop, tp1, tp2, tp3, price, htf,
  };
}

// ---------------------------------------------------------
// Trade lifecycle management (unchanged logic from v1)
// ---------------------------------------------------------

async function manageOpenTrades() {
  const open = await sheetsGet('OPEN');
  for (const trade of open) {
    const price = await getPrice(trade.Pair.replace('/', ''));
    const isLong = trade.Direction === 'Long';
    const hoursOpen = (Date.now() - new Date(trade.DateTimeUTC).getTime()) / 3600000;

    const hitTP1 = isLong ? price >= trade.TP1 : price <= trade.TP1;
    const hitTP2 = isLong ? price >= trade.TP2 : price <= trade.TP2;
    const hitTP3 = isLong ? price >= trade.TP3 : price <= trade.TP3;
    const effectiveStop = trade.TP2Hit ? trade.TP1 : (trade.TP1Hit ? trade.Entry : trade.StopLoss);
    const hitEffectiveStop = isLong ? price <= effectiveStop : price >= effectiveStop;

    let update = null;
    if (hitEffectiveStop) {
      let reason, r;
      if (trade.TP2Hit) { reason = 'Partial Win - TP2 then stopped at TP1'; r = CONFIG.TP1_CLOSE_PCT * CONFIG.TP1_R + CONFIG.TP2_CLOSE_PCT * CONFIG.TP2_R; }
      else if (trade.TP1Hit) { reason = 'Breakeven - TP1 then stopped at BE'; r = CONFIG.TP1_CLOSE_PCT * CONFIG.TP1_R; }
      else { reason = 'Loss - Stopped Out'; r = -1; }
      update = { Status: 'CLOSED', ExitReason: reason, ExitPrice: price, ExitTimeUTC: new Date().toISOString(), RMultiple: r };
    } else if (hitTP3) {
      const r = CONFIG.TP1_CLOSE_PCT * CONFIG.TP1_R + CONFIG.TP2_CLOSE_PCT * CONFIG.TP2_R + CONFIG.TP3_CLOSE_PCT * CONFIG.TP3_R;
      update = { Status: 'CLOSED', ExitReason: 'Win - Hit TP3', ExitPrice: price, ExitTimeUTC: new Date().toISOString(), RMultiple: r };
    } else if (hitTP2 && !trade.TP2Hit) {
      update = { TP2Hit: true };
    } else if (hitTP1 && !trade.TP1Hit) {
      update = { TP1Hit: true };
    } else if (hoursOpen >= CONFIG.MAX_TRADE_DURATION_HOURS) {
      const partialR = (isLong ? price - trade.Entry : trade.Entry - price) / Math.abs(trade.Entry - trade.StopLoss);
      update = { Status: 'CLOSED', ExitReason: 'Closed - Time Limit', ExitPrice: price, ExitTimeUTC: new Date().toISOString(), RMultiple: partialR };
    }

    if (update) {
      await sheetsPost({ action: 'updateTrade', id: trade.ID, updates: update });
      console.log(`Updated ${trade.ID}:`, update);
    }
  }
}

async function checkRiskGuards() {
  const all = await sheetsGet();
  const today = new Date().toDateString();
  const closedToday = all.filter(t => t.Status === 'CLOSED' && t.ExitTimeUTC && new Date(t.ExitTimeUTC).toDateString() === today);
  const todaysR = closedToday.reduce((s, t) => s + (parseFloat(t.RMultiple) || 0) * (parseFloat(t.RiskPercent) || 1) / 100, 0);

  const recentClosed = all.filter(t => t.Status === 'CLOSED' && t.ExitTimeUTC)
    .sort((a, b) => new Date(b.ExitTimeUTC) - new Date(a.ExitTimeUTC)).slice(0, CONFIG.LOSS_STREAK_COUNT);
  const streak = recentClosed.length === CONFIG.LOSS_STREAK_COUNT && recentClosed.every(t => parseFloat(t.RMultiple) < 0);
  const coolingDown = streak && (Date.now() - new Date(recentClosed[0].ExitTimeUTC).getTime()) < CONFIG.LOSS_STREAK_COOLDOWN_HOURS * 3600000;

  return {
    blocked: todaysR >= CONFIG.DAILY_PROFIT_CAP_PCT || todaysR <= -CONFIG.DAILY_LOSS_CAP_PCT || coolingDown,
    profitCapHit: todaysR >= CONFIG.DAILY_PROFIT_CAP_PCT, lossCapHit: todaysR <= -CONFIG.DAILY_LOSS_CAP_PCT, coolingDown, todaysR,
  };
}

// ---------------------------------------------------------
// Live snapshot — written back into this repo so the web app
// can read it from raw.githubusercontent.com (see SETUP.md)
// ---------------------------------------------------------

async function writeSnapshot() {
  const fs = await import('node:fs/promises');
  const all = await sheetsGet();
  const open = all.filter(t => t.Status === 'OPEN');
  const closed = all.filter(t => t.Status === 'CLOSED' && t.ExitTimeUTC)
    .sort((a, b) => new Date(b.ExitTimeUTC) - new Date(a.ExitTimeUTC));
  const recentClosed = closed.slice(0, 30);

  const wins = closed.filter(t => parseFloat(t.RMultiple) > 0).length;
  const winRate = closed.length ? +(wins / closed.length * 100).toFixed(1) : null;
  const avgR = closed.length ? +(closed.reduce((s, t) => s + (parseFloat(t.RMultiple) || 0), 0) / closed.length).toFixed(2) : null;

  const byZone = {};
  for (const z of CONFIG.KILL_ZONES) {
    const zTrades = closed.filter(t => t.KillZone === z.name);
    const zWins = zTrades.filter(t => parseFloat(t.RMultiple) > 0).length;
    byZone[z.name] = zTrades.length ? +(zWins / zTrades.length * 100).toFixed(1) : null;
  }

  const snapshot = {
    generatedAtUTC: new Date().toISOString(),
    open,
    recentClosed,
    stats: { totalClosed: closed.length, winRate, avgR, winRateByZone: byZone },
  };

  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/latest.json', JSON.stringify(snapshot, null, 2));
  console.log('Snapshot written: data/latest.json');
}

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------

async function main() {
  console.log(`Run started: ${new Date().toISOString()}`);
  await manageOpenTrades();

  const guards = await checkRiskGuards();
  if (guards.blocked) {
    console.log('Risk guard active — no new signals this run:', guards);
    await writeSnapshot();
    return;
  }

  const fearGreed = await getFearGreed();

  for (const symbol of PAIRS) {
    const open = await sheetsGet('OPEN');
    const pairLabel = symbol.replace('USDT', '/USDT');
    if (open.some(t => t.Pair === pairLabel)) {
      console.log(`${symbol}: already has an open paper trade, skipping`);
      continue;
    }

    let result;
    try {
      result = await evaluatePair(symbol, fearGreed);
    } catch (err) {
      console.error(`${symbol}: evaluation failed —`, err.message);
      continue;
    }
    console.log(`${symbol}:`, JSON.stringify(result));

    if (!result.skip) {
      const id = `${symbol}-${Date.now()}`;
      const trade = {
        ID: id, Status: 'OPEN', DateTimeUTC: new Date().toISOString(),
        Pair: pairLabel, KillZone: result.killZoneName,
        Direction: result.direction === 'long' ? 'Long' : 'Short',
        SetupType: 'Type A', Score: result.score, AMDBias: result.amdBias, PriceZone: result.zone,
        Entry: result.entry, StopLoss: result.stop, TP1: result.tp1, TP2: result.tp2, TP3: result.tp3,
        RiskPercent: 1, PositionSizeUnits: '', PositionSizeUSD: '',
        TP1Hit: false, TP2Hit: false, Notes: 'Auto-generated by bot.js v2',
      };
      await sheetsPost({ action: 'createSignal', trade });
      console.log(`Signal created: ${id}`);
    }
  }

  await writeSnapshot();
  console.log('Run complete.');
}

main().catch(err => {
  console.error('Bot run failed:', err);
  process.exit(1);
});

// ============================================================
// STILL SIMPLIFIED IN v2 (being upfront, same as before):
// - Type A (with-trend) signals only. Type B is a phase-2 project.
// - Order Blocks use a rule-based proxy, not a hand-drawn read.
// - AMD bias gates NY/Silver Bullet trades only, per the original
//   strategy's own framing — it doesn't gate London trades since
//   the model isn't "confirmed" until London has acted.
// ============================================================
