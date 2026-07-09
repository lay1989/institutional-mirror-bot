// ============================================================
// INSTITUTIONAL MIRROR — Automated Paper-Trading Signal Bot (v3)
// ============================================================
// Changes from v2:
//  - Market data now comes from Kraken, not Binance/Bybit. Both
//    of those exchanges return HTTP 451 and hard-block requests
//    from US IP ranges — and GitHub Actions runners are hosted
//    on US cloud infrastructure, so every run was being blocked
//    at the network level regardless of where YOU are. Kraken is
//    a US-compliant exchange and does not do this.
//  - Every network call (Kraken, Apps Script, Fear & Greed) now
//    goes through fetchWithRetry: 3 attempts with backoff, and a
//    clear labeled error if all attempts fail. If something does
//    break, the GitHub Actions log will say exactly which call
//    failed and why — no more guessing.
//  - All detection logic (CONFIG, HTF bias, AMD bias, Order
//    Blocks, round numbers, scaled exits, risk guards, snapshot)
//    is unchanged from v2.
// ============================================================

const SHEETS_URL = process.env.SHEETS_URL;
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']; // kept as the internal/Sheet-facing labels
const KRAKEN = 'https://api.kraken.com';
const KRAKEN_FUTURES = 'https://futures.kraken.com';

// Kraken uses its own pair codes (BTC is "XBT"), so map our
// internal symbols to what Kraken's REST API expects.
const KRAKEN_SPOT_PAIR = { BTCUSDT: 'XBTUSD', ETHUSDT: 'ETHUSD', SOLUSDT: 'SOLUSD' };
const KRAKEN_FUTURES_SYMBOL = { BTCUSDT: 'PF_XBTUSD', ETHUSDT: 'PF_ETHUSD', SOLUSDT: 'PF_SOLUSD' };

// English interval names -> Kraken's minutes-based interval values
const KRAKEN_INTERVAL_MINUTES = { '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };

if (!SHEETS_URL) {
  console.error('Missing SHEETS_URL environment variable. Set it as a GitHub Actions secret.');
  process.exit(1);
}

// ============================================================
// CONFIG — unchanged from v2. Every tunable number lives here.
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

// ---------------------------------------------------------
// Network helper — every fetch in this file goes through this.
// Retries transient failures with backoff and always logs a
// clear, labeled message so failures are diagnosable from the
// GitHub Actions log alone.
// ---------------------------------------------------------

async function fetchWithRetry(url, options = {}, retries = 3, label = url) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const body = await res.text().catch(() => '(no body)');
        throw new Error(`HTTP ${res.status} from ${label} — ${body.slice(0, 300)}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`[attempt ${attempt}/${retries}] ${label} failed: ${err.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error(`All ${retries} attempts failed for ${label}: ${lastErr.message}`);
}

// small pause between sequential Kraken calls — stays comfortably
// under Kraken's documented "1 request/sec per pair" public guidance
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------
// Data fetching — Kraken public endpoints (no key needed)
// ---------------------------------------------------------

async function getKlines(symbol, intervalName, minCandles = 100) {
  const pair = KRAKEN_SPOT_PAIR[symbol];
  const interval = KRAKEN_INTERVAL_MINUTES[intervalName];
  const url = `${KRAKEN}/0/public/OHLC?pair=${pair}&interval=${interval}`;
  const res = await fetchWithRetry(url, {}, 3, `Kraken OHLC ${symbol} ${intervalName}`);
  const data = await res.json();
  if (data.error && data.error.length) throw new Error(`Kraken OHLC ${symbol} ${intervalName} returned error: ${data.error.join(', ')}`);
  const series = Object.values(data.result).find(v => Array.isArray(v));
  if (!series) throw new Error(`Kraken OHLC ${symbol} ${intervalName}: no candle series in response`);
  const candles = series.map(c => ({
    openTime: c[0] * 1000, open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[6],
  }));
  if (candles.length < minCandles) {
    console.warn(`${symbol} ${intervalName}: only ${candles.length} candles returned (wanted ${minCandles}) — trend reads may be less reliable until more history accumulates`);
  }
  return candles;
}

async function getPrice(symbol) {
  const pair = KRAKEN_SPOT_PAIR[symbol];
  const url = `${KRAKEN}/0/public/Ticker?pair=${pair}`;
  const res = await fetchWithRetry(url, {}, 3, `Kraken Ticker ${symbol}`);
  const data = await res.json();
  if (data.error && data.error.length) throw new Error(`Kraken Ticker ${symbol} returned error: ${data.error.join(', ')}`);
  const ticker = Object.values(data.result)[0];
  return +ticker.c[0]; // c = [last trade closed price, lot volume]
}

// Kraken Futures public tickers endpoint returns all perpetuals in
// one call, including a live fundingRate field, no auth required.
let _tickersCache = null;
async function getAllFuturesTickers() {
  if (_tickersCache) return _tickersCache;
  const res = await fetchWithRetry(`${KRAKEN_FUTURES}/derivatives/api/v3/tickers`, {}, 3, 'Kraken Futures tickers');
  const data = await res.json();
  _tickersCache = data.tickers || [];
  return _tickersCache;
}

async function getFundingRate(symbol) {
  try {
    const tickers = await getAllFuturesTickers();
    const wanted = KRAKEN_FUTURES_SYMBOL[symbol].toLowerCase();
    const t = tickers.find(x => (x.symbol || '').toLowerCase() === wanted);
    if (!t || typeof t.fundingRate !== 'number') return null;
    return t.fundingRate * 100; // treat as a percent, same convention as before
  } catch (err) {
    console.warn(`Funding rate lookup failed for ${symbol} (non-fatal, gate fails open): ${err.message}`);
    return null;
  }
}

async function getFearGreed() {
  try {
    const res = await fetchWithRetry('https://api.alternative.me/fng/?limit=1', {}, 2, 'Fear & Greed Index');
    const data = await res.json();
    return parseInt(data.data[0].value, 10);
  } catch (err) {
    console.warn(`Fear & Greed lookup failed (non-fatal, gate fails open): ${err.message}`);
    return null;
  }
}

// News calendar — pulls the free, widely-used ForexFactory JSON
// mirror (nfs.faireconomy.media) that many trading bots rely on.
// It's not an official ForexFactory product, so treat it as
// best-effort: if the feed is unreachable or its shape changes,
// this fails open (doesn't block trading) rather than breaking
// the run. First live run is the real test of the exact field
// names below (date / impact / title) — check the log.
let _newsCache = null;
async function getHighImpactNewsBlock(now) {
  try {
    if (!_newsCache) {
      const res = await fetchWithRetry('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {}, 2, 'ForexFactory calendar');
      _newsCache = await res.json();
    }
    const nowMs = now.getTime();
    for (const ev of _newsCache) {
      if (ev.impact !== 'High') continue;
      const evMs = new Date(ev.date).getTime();
      if (isNaN(evMs)) continue;
      const minutesAway = (evMs - nowMs) / 60000;
      // strategy rule: skip 30 min before through 15 min after a high-impact event
      if (minutesAway <= 30 && minutesAway >= -15) {
        return { blocked: true, event: ev.title, minutesAway: Math.round(minutesAway) };
      }
    }
    return { blocked: false };
  } catch (err) {
    console.warn(`News calendar check failed (non-fatal, gate fails open): ${err.message}`);
    return { blocked: false, error: err.message };
  }
}

// ---------------------------------------------------------
// Sheets I/O (the durable database)
// ---------------------------------------------------------

async function sheetsGet(status) {
  const url = status ? `${SHEETS_URL}?status=${status}` : SHEETS_URL;
  const res = await fetchWithRetry(url, {}, 3, `Sheets GET${status ? ' (' + status + ')' : ''}`);
  return res.json();
}

async function sheetsPost(body) {
  const res = await fetchWithRetry(SHEETS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  }, 3, `Sheets POST (${body.action})`);
  return res.json();
}

// ---------------------------------------------------------
// Technical analysis primitives (unchanged from v2)
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

// ---------------------------------------------------------
// AMD bias (unchanged from v2 — see prior explanation of the
// Accumulation / Manipulation / Distribution model in comments)
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

async function evaluatePair(symbol, fearGreed, newsBlock) {
  // Sequential, not Promise.all — stays under Kraken's public
  // rate-limit guidance of ~1 request/sec per pair
  const weekly = await getKlines(symbol, '1w', 52); await sleep(300);
  const daily = await getKlines(symbol, '1d', 100); await sleep(300);
  const h4 = await getKlines(symbol, '4h', 100); await sleep(300);
  const h1 = await getKlines(symbol, '1h', 100); await sleep(300);
  const m15 = await getKlines(symbol, '15m', 150); await sleep(300);
  const price = await getPrice(symbol);

  const htf = htfBias(weekly, daily, h4);
  // Informational only — does NOT gate trades. Logged so that after
  // the trial we can see, with real data, how often requiring the
  // Weekly to agree cost us vs. saved us, instead of guessing.
  const dailyH4Aligned = htf.daily !== 'range' && htf.daily === htf.h4;
  if (!htf.aligned) {
    return {
      symbol, skip: true, score: 0, reason: 'HTF not aligned', htf, dailyH4Aligned,
      checklist: {
        htfAligned: false, inKillZone: null, correctZone: null,
        sweepConfirmed: null, mssConfirmed: null, cleanRunway: null,
      },
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

  const newsOk = !newsBlock.blocked;

  const hardGatesPass = kz.active && kz.tradable && !weekend && fundingOk && macroOk && mss.found && runwayOk && !amdContradicts && newsOk;
  const score = [true, kz.active && kz.tradable, zoneOk, sweepLevel !== null, mss.found, runwayOk].filter(Boolean).length;

  return {
    symbol, skip: !(hardGatesPass && score >= CONFIG.MIN_SCORE_TYPE_A), score, direction, zone,
    killZoneName: kz.name, killZoneActive: kz.active, weekend, funding, fundingOk, fearGreed, macroOk,
    amdBias, amdContradicts, newsOk, newsBlock, entry, stop, tp1, tp2, tp3, price, htf, dailyH4Aligned, pdh, pdl,
    checklist: {
      htfAligned: htf.aligned,
      inKillZone: kz.active && kz.tradable,
      correctZone: zoneOk,
      sweepConfirmed: sweepLevel !== null,
      mssConfirmed: mss.found,
      cleanRunway: mss.found ? runwayOk : null, // null = not evaluated yet (no MSS to check a runway from)
    },
  };
}

// ---------------------------------------------------------
// Trade lifecycle management (unchanged from v2)
// ---------------------------------------------------------

async function manageOpenTrades() {
  const open = await sheetsGet('OPEN');
  for (const trade of open) {
    let price;
    try {
      price = await getPrice(trade.Pair.replace('/', ''));
    } catch (err) {
      console.error(`Skipping update for ${trade.ID} — price fetch failed: ${err.message}`);
      continue;
    }
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
    await sleep(300);
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
// Live snapshot (unchanged from v2)
// ---------------------------------------------------------

async function writeSnapshot(evaluations = {}) {
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
    evaluations, // per-pair live checklist state from this run — see evaluatePair()
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

  try {
    await manageOpenTrades();
  } catch (err) {
    console.error('manageOpenTrades failed (continuing run):', err.message);
  }

  let guards;
  try {
    guards = await checkRiskGuards();
  } catch (err) {
    console.error('checkRiskGuards failed — aborting this run to be safe:', err.message);
    return;
  }

  if (guards.blocked) {
    console.log('Risk guard active — no new signals this run:', guards);
    const evaluations = {};
    for (const symbol of PAIRS) evaluations[symbol] = { skip: true, reason: 'Risk guard active — see guards', guards };
    try { await writeSnapshot(evaluations); } catch (err) { console.error('writeSnapshot failed:', err.message); }
    return;
  }

  const fearGreed = await getFearGreed();
  const newsBlock = await getHighImpactNewsBlock(new Date());
  if (newsBlock.blocked) console.log(`News gate active: "${newsBlock.event}" is ${newsBlock.minutesAway} min away — new signals paused`);
  const evaluations = {};

  for (const symbol of PAIRS) {
    let open;
    try {
      open = await sheetsGet('OPEN');
    } catch (err) {
      console.error(`Could not check open trades for ${symbol}, skipping this pair this run: ${err.message}`);
      evaluations[symbol] = { skip: true, reason: 'Could not reach Sheets this run', error: err.message };
      continue;
    }
    const pairLabel = symbol.replace('USDT', '/USDT');
    if (open.some(t => t.Pair === pairLabel)) {
      console.log(`${symbol}: already has an open paper trade, skipping`);
      evaluations[symbol] = { skip: true, reason: 'Already has an open paper trade — not re-evaluated this run' };
      continue;
    }

    let result;
    try {
      result = await evaluatePair(symbol, fearGreed, newsBlock);
    } catch (err) {
      console.error(`${symbol}: evaluation failed — ${err.message}`);
      evaluations[symbol] = { skip: true, reason: 'Evaluation failed this run', error: err.message };
      continue;
    }
    console.log(`${symbol}:`, JSON.stringify(result));
    evaluations[symbol] = result;

    if (!result.skip) {
      const id = `${symbol}-${Date.now()}`;
      const trade = {
        ID: id, Status: 'OPEN', DateTimeUTC: new Date().toISOString(),
        Pair: pairLabel, KillZone: result.killZoneName,
        Direction: result.direction === 'long' ? 'Long' : 'Short',
        SetupType: 'Type A', Score: result.score, AMDBias: result.amdBias, PriceZone: result.zone,
        Entry: result.entry, StopLoss: result.stop, TP1: result.tp1, TP2: result.tp2, TP3: result.tp3,
        RiskPercent: 1, PositionSizeUnits: '', PositionSizeUSD: '',
        TP1Hit: false, TP2Hit: false, Notes: 'Auto-generated by bot.js v3 (Kraken)',
      };
      try {
        await sheetsPost({ action: 'createSignal', trade });
        console.log(`Signal created: ${id}`);
      } catch (err) {
        console.error(`Failed to save signal for ${symbol} — ${err.message}`);
      }
    }
    await sleep(300);
  }

  try {
    await writeSnapshot(evaluations);
  } catch (err) {
    console.error('writeSnapshot failed:', err.message);
  }
  console.log('Run complete.');
}

main().catch(err => {
  console.error('Bot run failed:', err);
  process.exit(1);
});

// ============================================================
// STILL SIMPLIFIED (unchanged from v2):
// - Type A (with-trend) signals only.
// - Order Blocks use a rule-based proxy, not a hand-drawn read.
// - Kraken Futures funding-rate units are treated as directly
//   comparable to the old Binance-based reading; if that proves
//   off, the funding gate fails open anyway, so it never blocks
//   a run — worst case it's a slightly mis-calibrated soft filter.
// ============================================================
