// ============================================================
// INSTITUTIONAL MIRROR — Automated Paper-Trading Signal Bot (v4)
// ============================================================
// Changes from v3:
//  - All detection rules (CONFIG, HTF bias, sweeps, FVG, AMD bias,
//    Order Blocks, kill zones, scoring) now live in logic.js,
//    shared with backtest.js. This file only handles: fetching
//    live data from Kraken, talking to Sheets, and the run loop.
//    Change a threshold in logic.js and both live trading and any
//    backtest use the new value automatically — no drift risk.
//  - Fixed a real bug: EMA(50) warm-up windows were too short
//    (52 weekly candles for a 50-period EMA is ~1x the period,
//    nowhere near enough to converge). Now fetching 200/300/300
//    candles for weekly/daily/4H so the EMA is actually trustworthy
//    before being used to decide HTF bias.
// ============================================================

const {
  CONFIG, htfBias, getKillZoneInfo, isWeekend, evaluateSetup,
} = require('./logic.js');

const SHEETS_URL = process.env.SHEETS_URL;
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const KRAKEN = 'https://api.kraken.com';
const KRAKEN_FUTURES = 'https://futures.kraken.com';

const KRAKEN_SPOT_PAIR = { BTCUSDT: 'XBTUSD', ETHUSDT: 'ETHUSD', SOLUSDT: 'SOLUSD' };
const KRAKEN_FUTURES_SYMBOL = { BTCUSDT: 'PF_XBTUSD', ETHUSDT: 'PF_ETHUSD', SOLUSDT: 'PF_SOLUSD' };
const KRAKEN_INTERVAL_MINUTES = { '15m': 15, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080 };

if (!SHEETS_URL) {
  console.error('Missing SHEETS_URL environment variable. Set it as a GitHub Actions secret.');
  process.exit(1);
}

// ---------------------------------------------------------
// Network helper — every fetch goes through this
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
  return +ticker.c[0];
}

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
    return t.fundingRate * 100;
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
// Sheets I/O
// ---------------------------------------------------------

async function sheetsGet(status) {
  const url = status ? `${SHEETS_URL}?status=${status}` : SHEETS_URL;
  const res = await fetchWithRetry(url, {}, 3, `Sheets GET${status ? ' (' + status + ')' : ''}`);
  return res.json();
}

async function sheetsPost(body) {
  const res = await fetchWithRetry(SHEETS_URL, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body),
  }, 3, `Sheets POST (${body.action})`);
  return res.json();
}

// ---------------------------------------------------------
// Per-pair evaluation — fetches live candles, hands them to the
// shared evaluateSetup() from logic.js
// ---------------------------------------------------------

async function evaluatePair(symbol, fearGreed, newsBlock) {
  // 200+/300+ candles so EMA(50) actually converges (see header note)
  const weekly = await getKlines(symbol, '1w', 200); await sleep(300);
  const daily = await getKlines(symbol, '1d', 300); await sleep(300);
  const h4 = await getKlines(symbol, '4h', 300); await sleep(300);
  const h1 = await getKlines(symbol, '1h', 100); await sleep(300);
  const m15 = await getKlines(symbol, '15m', 150); await sleep(300);
  const price = await getPrice(symbol);
  const funding = await getFundingRate(symbol);

  return evaluateSetup({ symbol, weekly, daily, h4, h1, m15, price, now: new Date(), funding, fearGreed, newsBlock });
}

// ---------------------------------------------------------
// Trade lifecycle management
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
// Live snapshot
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
    open, recentClosed,
    stats: { totalClosed: closed.length, winRate, avgR, winRateByZone: byZone },
    evaluations,
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

    if (result.dailyH4Aligned && result.htf && !result.htf.aligned) {
      try {
        await sheetsPost({
          action: 'logDivergence', pair: symbol, timestamp: new Date().toISOString(),
          weeklyBias: result.htf.weekly, dailyBias: result.htf.daily, h4Bias: result.htf.h4,
        });
      } catch (err) {
        console.warn(`Divergence log failed (non-fatal): ${err.message}`);
      }
    }

    if (!result.skip) {
      const id = `${symbol}-${Date.now()}`;
      const trade = {
        ID: id, Status: 'OPEN', DateTimeUTC: new Date().toISOString(),
        Pair: pairLabel, KillZone: result.killZoneName,
        Direction: result.direction === 'long' ? 'Long' : 'Short',
        SetupType: 'Type A', Score: result.score, AMDBias: result.amdBias, PriceZone: result.zone,
        Entry: result.entry, StopLoss: result.stop, TP1: result.tp1, TP2: result.tp2, TP3: result.tp3,
        RiskPercent: 1, PositionSizeUnits: '', PositionSizeUSD: '',
        TP1Hit: false, TP2Hit: false, Notes: 'Auto-generated by bot.js v4 (Kraken)',
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
