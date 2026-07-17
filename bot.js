// ============================================================
// INSTITUTIONAL MIRROR — Automated Paper-Trading Signal Bot (v5 / V2 logic)
// ============================================================
// This version wires in the V2 strategy changes from logic.js:
// revised partial-close %, structural break-even, HTF-only runway
// to TP2, no weekend gate, thesis-invalidation exit with a 24h
// backstop, wider equilibrium buffer, and News-MSS as a distinct
// setup type. See logic.js header for the full list and reasoning.
//
// What changed here specifically (vs the data-fetching/plumbing):
//  - getHighImpactNewsBlock() replaced with getNearestHighImpactNews()
//    which returns the nearest event as {title, timeMs} instead of
//    a pre-computed blocked/not-blocked flag — logic.js now decides
//    which of the three news phases we're in.
//  - manageOpenTrades() rebuilt: for each open trade it now also
//    fetches Weekly/Daily/4H (thesis-invalidation check) and recent
//    15m candles since the trade opened (structural break-even
//    check), then calls the shared evaluateTradeExit() from logic.js
//    instead of doing the math inline. This means live and backtest
//    can never quietly diverge on how a trade is managed, not just
//    how a signal is found.
//  - New trade fields persisted to Sheets: StructuralBELocked,
//    StructuralStopLevel. apps-script.gs has matching columns —
//    redeploy that too, not just this file.
// ============================================================

const {
  CONFIG, htfBias, evaluateSetup, evaluateTradeExit,
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
// Network helper
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
// Data fetching — Kraken public endpoints
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
    console.warn(`${symbol} ${intervalName}: only ${candles.length} candles returned (wanted ${minCandles})`);
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
async function getNearestHighImpactNews(now) {
  try {
    if (!_newsCache) {
      const res = await fetchWithRetry('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {}, 2, 'ForexFactory calendar');
      _newsCache = await res.json();
    }
    const nowMs = now.getTime();
    let nearest = null, nearestDist = Infinity;
    for (const ev of _newsCache) {
      if (ev.impact !== 'High') continue;
      const evMs = new Date(ev.date).getTime();
      if (isNaN(evMs)) continue;
      const dist = Math.abs(evMs - nowMs);
      if (dist < 2 * 3600000 && dist < nearestDist) {
        nearest = { title: ev.title, timeMs: evMs };
        nearestDist = dist;
      }
    }
    return nearest;
  } catch (err) {
    console.warn(`News calendar check failed (non-fatal, treated as no nearby news): ${err.message}`);
    return null;
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
// Per-pair evaluation
// ---------------------------------------------------------

async function evaluatePair(symbol, fearGreed, newsEvent) {
  const weekly = await getKlines(symbol, '1w', 200); await sleep(300);
  const daily = await getKlines(symbol, '1d', 300); await sleep(300);
  const h4 = await getKlines(symbol, '4h', 300); await sleep(300);
  const h1 = await getKlines(symbol, '1h', 100); await sleep(300);
  const m15 = await getKlines(symbol, '15m', 150); await sleep(300);
  const price = await getPrice(symbol);
  const funding = await getFundingRate(symbol);

  return evaluateSetup({ symbol, weekly, daily, h4, h1, m15, price, now: new Date(), funding, fearGreed, newsEvent });
}

// ---------------------------------------------------------
// Trade lifecycle management (V2: thesis invalidation + structural BE)
// ---------------------------------------------------------

function toBool(v) { return v === true || v === 'true' || v === 'TRUE' || v === 1; }

async function manageOpenTrades() {
  const open = await sheetsGet('OPEN');
  for (const raw of open) {
    const symbol = raw.Pair.replace('/', '');
    const isLong = raw.Direction === 'Long';

    let price;
    try {
      price = await getPrice(symbol);
    } catch (err) {
      console.error(`Skipping update for ${raw.ID} — price fetch failed: ${err.message}`);
      continue;
    }

    const trade = {
      direction: isLong ? 'long' : 'short',
      entry: parseFloat(raw.Entry), stop: parseFloat(raw.StopLoss),
      tp1: parseFloat(raw.TP1), tp2: parseFloat(raw.TP2), tp3: parseFloat(raw.TP3),
      openTime: new Date(raw.DateTimeUTC),
      tp1Hit: toBool(raw.TP1Hit), tp2Hit: toBool(raw.TP2Hit),
      structuralBELocked: toBool(raw.StructuralBELocked),
      structuralStopLevel: raw.StructuralStopLevel ? parseFloat(raw.StructuralStopLevel) : null,
    };
    const before = { ...trade };

    // Thesis invalidation check — re-read HTF bias for this pair
    let htfStillAligned = null;
    try {
      const weekly = await getKlines(symbol, '1w', 200); await sleep(300);
      const daily = await getKlines(symbol, '1d', 300); await sleep(300);
      const h4 = await getKlines(symbol, '4h', 300); await sleep(300);
      const htf = htfBias(weekly, daily, h4);
      htfStillAligned = htf.aligned &&
        ((trade.direction === 'long' && htf.bias === 'bull') || (trade.direction === 'short' && htf.bias === 'bear'));
    } catch (err) {
      console.warn(`Thesis check failed for ${raw.ID} (skipping this check this run): ${err.message}`);
    }

    // Structural BE check — recent 15m candles since the trade opened
    let candlesSinceEntry = [];
    try {
      const m15 = await getKlines(symbol, '15m', 150); await sleep(300);
      candlesSinceEntry = m15.filter(c => c.openTime >= trade.openTime.getTime());
    } catch (err) {
      console.warn(`Structural candle fetch failed for ${raw.ID} (non-fatal): ${err.message}`);
    }

    const outcome = evaluateTradeExit({
      trade, high: price, low: price, close: price, // live only has point-in-time price, not a full candle range
      now: new Date(), candlesSinceEntry, htfStillAligned,
    });

    let update = null;
    if (outcome.closed) {
      update = {
        Status: 'CLOSED', ExitReason: outcome.reason, ExitPrice: price,
        ExitTimeUTC: new Date().toISOString(), RMultiple: +outcome.rMultiple.toFixed(3),
      };
    } else {
      const changed = {};
      if (trade.tp1Hit !== before.tp1Hit) changed.TP1Hit = trade.tp1Hit;
      if (trade.tp2Hit !== before.tp2Hit) changed.TP2Hit = trade.tp2Hit;
      if (trade.structuralBELocked !== before.structuralBELocked) {
        changed.StructuralBELocked = trade.structuralBELocked;
        changed.StructuralStopLevel = trade.structuralStopLevel;
      }
      if (Object.keys(changed).length > 0) update = changed;
    }

    if (update) {
      await sheetsPost({ action: 'updateTrade', id: raw.ID, updates: update });
      console.log(`Updated ${raw.ID}:`, update);
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
  const newsEvent = await getNearestHighImpactNews(new Date());
  if (newsEvent) console.log(`Nearest high-impact news: "${newsEvent.title}" at ${new Date(newsEvent.timeMs).toISOString()}`);
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
      result = await evaluatePair(symbol, fearGreed, newsEvent);
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
        SetupType: result.setupType, Score: result.score, AMDBias: result.amdBias, PriceZone: result.zone,
        Entry: result.entry, StopLoss: result.stop, TP1: result.tp1, TP2: result.tp2, TP3: result.tp3,
        RiskPercent: 1, PositionSizeUnits: '', PositionSizeUSD: '',
        TP1Hit: false, TP2Hit: false, StructuralBELocked: false, StructuralStopLevel: '',
        Notes: `Auto-generated by bot.js V2 (${result.setupType})`,
      };
      try {
        await sheetsPost({ action: 'createSignal', trade });
        console.log(`Signal created: ${id} (${result.setupType})`);
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
