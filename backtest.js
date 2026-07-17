// ============================================================
// INSTITUTIONAL MIRROR — Backtester (V2 logic)
// ============================================================
// Uses the same evaluateSetup() and evaluateTradeExit() from
// logic.js that the live bot uses — including structural
// break-even, thesis invalidation, and the narrowed runway check.
//
// IMPORTANT V2 LIMITATION: newsEvent is always null in the
// backtest (no free historical high-impact-news source), so
// getNewsPhase() always returns 'clear' — meaning News-MSS signals
// CANNOT fire in this backtest. Every trade simulated here is
// Type A. This is a real gap, not a rounding error: if News-MSS
// turns out to be a meaningful share of live signals, the
// backtest's numbers won't reflect that piece of the strategy.
//
// Data source: Binance international (works from India; Kraken
// times out on this network — see prior troubleshooting).
//
// USAGE: node backtest.js   (edit BACKTEST_DAYS below)
// ============================================================

const { CONFIG, evaluateSetup, evaluateTradeExit, htfBias } = require('./logic.js');
const https = require('https');
const fs = require('fs');

const BACKTEST_DAYS = 90;
const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const BINANCE_BASE = 'api.binance.com';
const BINANCE_LIMIT = 1000;
const REQUEST_SLEEP_MS = 400;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpsGet(host, path) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path, timeout: 30000 }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => resolve({
        ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode,
        text: () => Promise.resolve(raw),
        json: () => { try { return Promise.resolve(JSON.parse(raw)); } catch (e) { return Promise.reject(new Error(`JSON parse failed: ${raw.slice(0, 200)}`)); } },
      }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

async function fetchWithRetry(host, path, retries = 3, label = path) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await httpsGet(host, path);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
      return res;
    } catch (err) {
      lastErr = err;
      const wait = attempt === 1 ? 3000 : attempt * 5000;
      console.warn(`  [attempt ${attempt}/${retries}] ${label} failed: ${err.message} — waiting ${wait / 1000}s`);
      if (attempt < retries) await sleep(wait);
    }
  }
  throw new Error(`All ${retries} attempts failed for ${label}: ${lastErr.message}`);
}

async function getKlinesRange(symbol, interval, sinceMs, targetCandles = null) {
  const intervalMs = { '15m': 15 * 60000, '1h': 3600000, '4h': 4 * 3600000, '1d': 86400000, '1w': 7 * 86400000 }[interval];
  const nowMs = Date.now();
  let all = [], startTime = sinceMs, pages = 0;
  const MAX_PAGES = 50;

  while (startTime < nowMs && pages < MAX_PAGES) {
    const path = `/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${BINANCE_LIMIT}`;
    await sleep(REQUEST_SLEEP_MS);
    const res = await fetchWithRetry(BINANCE_BASE, path, 3, `Binance ${symbol} ${interval} p${pages + 1}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error(`Binance error for ${symbol} ${interval}: ${JSON.stringify(data)}`);
    if (data.length === 0) break;
    const candles = data.map(c => ({ openTime: c[0], open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +c[5] }));
    all = all.concat(candles);
    pages++;
    if (targetCandles && all.length >= targetCandles) break;
    startTime = candles[candles.length - 1].openTime + intervalMs;
    if (startTime >= nowMs) break;
  }
  const seen = new Set();
  const deduped = all.filter(c => seen.has(c.openTime) ? false : (seen.add(c.openTime), true));
  deduped.sort((a, b) => a.openTime - b.openTime);
  console.log(`  ${symbol} ${interval}: ${deduped.length} candles (${pages} page(s))`);
  return deduped;
}

async function backtestPair(symbol) {
  const nowMs = Date.now();
  const backtestStartMs = nowMs - BACKTEST_DAYS * 86400000;

  const weeklySince = nowMs - 3 * 365 * 86400000;
  const dailySince  = nowMs - 8 * 30 * 86400000;
  const h4Since     = nowMs - 60 * 86400000;
  const h1Since     = nowMs - 14 * 86400000;
  const m15Since    = backtestStartMs - 10 * 86400000;

  console.log(`\nFetching historical data for ${symbol}...`);
  const weeklyFull = await getKlinesRange(symbol, '1w', weeklySince);
  const dailyFull  = await getKlinesRange(symbol, '1d', dailySince);
  const h4Full     = await getKlinesRange(symbol, '4h', h4Since);
  const h1Full     = await getKlinesRange(symbol, '1h', h1Since);
  const m15Full    = await getKlinesRange(symbol, '15m', m15Since);

  const simCandles = m15Full.filter(c => c.openTime >= backtestStartMs);
  console.log(`  Replaying ${simCandles.length} 15m candles over ${BACKTEST_DAYS} days...`);
  if (simCandles.length < 100) console.warn(`  WARNING: only ${simCandles.length} candles — results won't be meaningful.`);

  const pairResult = { symbol, evaluatedPoints: 0, alignedCount: 0, biasCounts: { bull: 0, bear: 0, range: 0 }, trades: [] };
  let openTrade = null;

  for (const candle of simCandles) {
    const candleCloseTime = new Date(candle.openTime + 15 * 60000);
    const ts = candle.openTime;

    const weekly = weeklyFull.filter(c => c.openTime <= ts);
    const daily  = dailyFull.filter(c => c.openTime <= ts);
    const h4     = h4Full.filter(c => c.openTime <= ts);
    const h1     = h1Full.filter(c => c.openTime <= ts);
    const m15    = m15Full.filter(c => c.openTime <= ts);

    if (openTrade) {
      let htfStillAligned = null;
      if (weekly.length >= 55 && daily.length >= 55 && h4.length >= 55) {
        const htf = htfBias(weekly, daily, h4);
        htfStillAligned = htf.aligned &&
          ((openTrade.direction === 'long' && htf.bias === 'bull') || (openTrade.direction === 'short' && htf.bias === 'bear'));
      }
      const candlesSinceEntry = m15Full.filter(c => c.openTime >= openTrade.openTime.getTime() && c.openTime <= ts);

      const outcome = evaluateTradeExit({
        trade: openTrade, high: candle.high, low: candle.low, close: candle.close,
        now: candleCloseTime, candlesSinceEntry, htfStillAligned,
      });

      if (outcome.closed) {
        pairResult.trades.push({
          symbol, direction: openTrade.direction, setupType: openTrade.setupType,
          openTime: openTrade.openTime.toISOString(), closeTime: candleCloseTime.toISOString(),
          entry: openTrade.entry, stop: openTrade.stop, tp1: openTrade.tp1, tp2: openTrade.tp2, tp3: openTrade.tp3,
          killZone: openTrade.killZone, score: openTrade.score,
          exitReason: outcome.reason, rMultiple: +outcome.rMultiple.toFixed(3),
        });
        openTrade = null;
      }
      continue;
    }

    if (weekly.length < 55 || daily.length < 55 || h4.length < 55 || h1.length < 10 || m15.length < 10) continue;

    const result = evaluateSetup({
      symbol, weekly, daily, h4, h1, m15, price: candle.close, now: candleCloseTime,
      funding: null, fearGreed: null, newsEvent: null, // newsEvent always null — see header note on News-MSS
    });

    pairResult.evaluatedPoints++;
    if (result.htf && result.htf.aligned) pairResult.alignedCount++;
    const bias = (result.htf && result.htf.bias) ? result.htf.bias : 'range';
    pairResult.biasCounts[bias] = (pairResult.biasCounts[bias] || 0) + 1;

    if (!result.skip && result.entry && result.stop) {
      openTrade = {
        direction: result.direction, setupType: result.setupType, entry: result.entry, stop: result.stop,
        tp1: result.tp1, tp2: result.tp2, tp3: result.tp3, openTime: candleCloseTime,
        tp1Hit: false, tp2Hit: false, structuralBELocked: false, structuralStopLevel: null,
        killZone: result.killZoneName, score: result.score,
      };
    }
  }

  return pairResult;
}

async function main() {
  console.log(`Backtest starting — ${BACKTEST_DAYS} days, pairs: ${PAIRS.join(', ')}`);
  console.log('Data source: Binance international | Logic: logic.js (V2, same as live bot)');
  console.log('NOTE: News-MSS setups cannot fire in this backtest (no historical news source) — all trades here are Type A.');
  console.log('Funding rate and Fear & Greed also not simulated.\n');

  const allResults = [];
  for (const symbol of PAIRS) allResults.push(await backtestPair(symbol));
  const allTrades = allResults.flatMap(r => r.trades);

  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST SUMMARY (V2 logic)');
  console.log('='.repeat(60));

  for (const r of allResults) {
    const alignedPct = r.evaluatedPoints ? (r.alignedCount / r.evaluatedPoints * 100).toFixed(1) : 'n/a';
    console.log(`\n${r.symbol}`);
    console.log(`  Evaluated points : ${r.evaluatedPoints}`);
    console.log(`  HTF aligned      : ${r.alignedCount} (${alignedPct}%)`);
    console.log(`  Bias breakdown   : bull=${r.biasCounts.bull || 0}  bear=${r.biasCounts.bear || 0}  range=${r.biasCounts.range || 0}`);
    console.log(`  Trades taken     : ${r.trades.length}`);
    if (r.trades.length > 0) {
      const wins = r.trades.filter(t => t.rMultiple > 0).length;
      const winRate = (wins / r.trades.length * 100).toFixed(1);
      const avgR = (r.trades.reduce((s, t) => s + t.rMultiple, 0) / r.trades.length).toFixed(2);
      const totalR = r.trades.reduce((s, t) => s + t.rMultiple, 0).toFixed(2);
      console.log(`  Win rate         : ${winRate}%  (break-even ≈ 29.4% at the new blended R:R)`);
      console.log(`  Avg R-multiple   : ${avgR}  |  Total R: ${totalR}`);
      const structuralWins = r.trades.filter(t => t.exitReason.includes('Structural') && t.rMultiple > 0).length;
      const structuralFails = r.trades.filter(t => t.exitReason.includes('structure never confirmed')).length;
      console.log(`  Structural BE outcomes: ${structuralWins} locked in extra profit, ${structuralFails} still took a full loss after TP1`);
    } else {
      console.log('  No trades fired in this window.');
    }
  }

  console.log('\n' + '='.repeat(60));
  const totalEval = allResults.reduce((s, r) => s + r.evaluatedPoints, 0);
  const totalAligned = allResults.reduce((s, r) => s + r.alignedCount, 0);
  console.log(`\nOVERALL HTF alignment: ${totalAligned}/${totalEval} (${totalEval ? (totalAligned / totalEval * 100).toFixed(1) : 'n/a'}%)`);

  if (allTrades.length > 0) {
    const wins = allTrades.filter(t => t.rMultiple > 0).length;
    const avgR = allTrades.reduce((s, t) => s + t.rMultiple, 0) / allTrades.length;
    const totalR = allTrades.reduce((s, t) => s + t.rMultiple, 0);
    console.log(`\nAll pairs combined`);
    console.log(`  Trades: ${allTrades.length}  |  Win rate: ${(wins / allTrades.length * 100).toFixed(1)}%  |  Avg R: ${avgR.toFixed(2)}  |  Total R: ${totalR.toFixed(2)}`);
    console.log(`  Strategy has ${totalR > 0 ? 'POSITIVE' : 'NEGATIVE'} expectancy over this window.`);
    if (allTrades.length < 30) console.log(`  NOTE: sample size under 30 — try a longer BACKTEST_DAYS for a firmer read.`);
  }

  const headers = ['symbol', 'direction', 'setupType', 'openTime', 'closeTime', 'entry', 'stop', 'tp1', 'tp2', 'tp3', 'killZone', 'score', 'exitReason', 'rMultiple'];
  const csvRows = [headers.join(',')];
  for (const t of allTrades) csvRows.push(headers.map(h => `"${t[h] ?? ''}"`).join(','));
  fs.writeFileSync('backtest-results.csv', csvRows.join('\n'));
  console.log(`\nWrote ${allTrades.length} simulated trades to backtest-results.csv`);
}

main().catch(err => {
  console.error('\nBacktest failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
