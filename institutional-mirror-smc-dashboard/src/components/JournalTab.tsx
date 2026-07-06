import React, { useState, useEffect, useRef } from 'react';
import { Trade } from '../types';
import { BookOpen, BarChart3, Plus, Calendar, Save, Trash2, Download, AlertOctagon, CheckCircle2, RefreshCw, Star } from 'lucide-react';

interface JournalTabProps {
  prefilledSetup: any | null;
  onClearPrefilledSetup: () => void;
  syncToSheets?: (action: string, payload: any) => void;
  botData?: any;
}

export default function JournalTab({ prefilledSetup, onClearPrefilledSetup, syncToSheets, botData }: JournalTabProps) {
  const [subTab, setSubTab] = useState<'log' | 'history'>('history');
  const [trades, setTrades] = useState<Trade[]>([]);

  const getMergedTrades = (): Trade[] => {
    const local = [...trades];
    if (botData && botData.recentClosed) {
      botData.recentClosed.forEach((botTrade: any) => {
        const exists = local.some(t => t.id === botTrade.ID || t.id === `bot_${botTrade.ID}`);
        if (!exists) {
          let mappedResult: Trade['result'] = 'Loss';
          const rMult = botTrade.RMultiple !== undefined ? parseFloat(botTrade.RMultiple) : 0;
          if (rMult >= 3.0) mappedResult = 'Win-TP3';
          else if (rMult >= 1.2) mappedResult = 'Partial-TP2';
          else if (rMult > 0.0) mappedResult = 'Partial-TP1';
          else if (rMult === 0.0) mappedResult = 'Breakeven';
          else mappedResult = 'Loss';

          const mappedTrade: Trade = {
            id: `bot_${botTrade.ID}`,
            dateTimeUtc: botTrade.ExitTimeUTC || botTrade.DateTimeUTC,
            pair: botTrade.Pair || 'BTC/USDT',
            killZone: botTrade.KillZone || 'Asian Range',
            direction: botTrade.Direction || 'Long',
            setupType: botTrade.SetupType === 'Type B' ? 'Type B' : 'Type A',
            confluenceScore: botTrade.Score !== undefined ? parseInt(botTrade.Score) : 6,
            amdBias: botTrade.AMDBias === 'Bullish NY' ? 'Bullish NY' : botTrade.AMDBias === 'Bearish NY' ? 'Bearish NY' : 'N/A',
            priceZone: botTrade.PriceZone === 'Discount' ? 'Discount' : botTrade.PriceZone === 'Premium' ? 'Premium' : 'Neutral',
            entryPrice: botTrade.Entry !== undefined ? parseFloat(botTrade.Entry) : 0,
            stopLoss: botTrade.StopLoss !== undefined ? parseFloat(botTrade.StopLoss) : 0,
            tp1: botTrade.TP1 !== undefined ? parseFloat(botTrade.TP1) : 0,
            tp2: botTrade.TP2 !== undefined ? parseFloat(botTrade.TP2) : 0,
            tp3: botTrade.TP3 !== undefined ? parseFloat(botTrade.TP3) : 0,
            riskPercent: botTrade.RiskPercent !== undefined ? parseFloat(botTrade.RiskPercent) : 1.0,
            positionSizeUsd: 0,
            preTradeNotes: botTrade.Notes || 'bot.js',
            result: mappedResult,
            rMultiple: rMult,
            whatWentRight: botTrade.ExitReason || 'Algorithm fully executed.',
            whatWentWrong: '',
            wouldTakeAgain: 'Yes'
          };
          local.push(mappedTrade);
        }
      });
    }
    return local.sort((a, b) => new Date(b.dateTimeUtc).getTime() - new Date(a.dateTimeUtc).getTime());
  };

  const mergedTrades = getMergedTrades();

  // Form Fields
  const [dateTimeUtc, setDateTimeUtc] = useState('');
  const [pair, setPair] = useState('BTC/USDT');
  const [killZone, setKillZone] = useState('Asian Range');
  const [direction, setDirection] = useState<'Long' | 'Short'>('Long');
  const [setupType, setSetupType] = useState<'Type A' | 'Type B'>('Type A');
  const [confluenceScore, setConfluenceScore] = useState<number>(6);
  const [amdBias, setAmdBias] = useState<'Bullish NY' | 'Bearish NY' | 'N/A'>('N/A');
  const [priceZone, setPriceZone] = useState<'Discount' | 'Premium' | 'Neutral'>('Neutral');
  const [entryPrice, setEntryPrice] = useState<number | ''>('');
  const [stopLoss, setStopLoss] = useState<number | ''>('');
  const [tp1, setTp1] = useState<number | ''>('');
  const [tp2, setTp2] = useState<number | ''>('');
  const [tp3, setTp3] = useState<number | ''>('');
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [positionSizeUsd, setPositionSizeUsd] = useState<number | ''>('');
  const [preTradeNotes, setPreTradeNotes] = useState('');
  const [result, setResult] = useState<Trade['result']>('Win-TP3');
  const [rMultiple, setRMultiple] = useState<number>(3.5);
  const [whatWentRight, setWhatWentRight] = useState('');
  const [whatWentWrong, setWhatWentWrong] = useState('');
  const [wouldTakeAgain, setWouldTakeAgain] = useState<'Yes' | 'No'>('Yes');

  // Deletion Confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Chart Refs
  const barChartRef = useRef<HTMLCanvasElement | null>(null);
  const lineChartRef = useRef<HTMLCanvasElement | null>(null);
  const barChartInstance = useRef<any>(null);
  const lineChartInstance = useRef<any>(null);

  // Load trades from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('im_journal_trades');
    if (stored) {
      try {
        setTrades(JSON.parse(stored));
      } catch (e) {
        setTrades([]);
      }
    }
    // Set default datetime to now
    resetDateTime();
  }, []);

  // Watch prefilledSetup to seed form
  useEffect(() => {
    if (prefilledSetup) {
      setSubTab('log');
      if (prefilledSetup.confluenceScore !== undefined) setConfluenceScore(prefilledSetup.confluenceScore);
      if (prefilledSetup.setupType) setSetupType(prefilledSetup.setupType);
      if (prefilledSetup.amdBias) setAmdBias(prefilledSetup.amdBias);
      if (prefilledSetup.priceZone) setPriceZone(prefilledSetup.priceZone);
      
      // Auto assign some logical defaults
      if (prefilledSetup.confluenceScore === 6) {
        setRMultiple(3.5);
      } else {
        setRMultiple(1.5);
      }

      // Clear the bridge state
      onClearPrefilledSetup();
    }
  }, [prefilledSetup]);

  // Recalculate Stop, TPs and Position parameters on price changes in form
  useEffect(() => {
    if (entryPrice && stopLoss && typeof entryPrice === 'number' && typeof stopLoss === 'number') {
      const distance = Math.abs(entryPrice - stopLoss);
      if (distance > 0) {
        // TP1 (1R), TP2 (1.5R), TP3 (3.5R)
        if (direction === 'Long') {
          setTp1(parseFloat((entryPrice + distance * 1.0).toFixed(4)));
          setTp2(parseFloat((entryPrice + distance * 1.5).toFixed(4)));
          setTp3(parseFloat((entryPrice + distance * 3.5).toFixed(4)));
        } else {
          setTp1(parseFloat((entryPrice - distance * 1.0).toFixed(4)));
          setTp2(parseFloat((entryPrice - distance * 1.5).toFixed(4)));
          setTp3(parseFloat((entryPrice - distance * 3.5).toFixed(4)));
        }

        // Auto position size if risk% and account size are cached in localStorage
        const accountSize = parseFloat(localStorage.getItem('im_calc_account_size') || '10000');
        const dollarRisk = accountSize * (riskPercent / 100);
        const units = dollarRisk / distance;
        setPositionSizeUsd(parseFloat((units * entryPrice).toFixed(2)));
      }
    }
  }, [entryPrice, stopLoss, direction, riskPercent]);

  // Set R-Multiple automatically based on Result selector
  useEffect(() => {
    switch (result) {
      case 'Win-TP3':
        setRMultiple(3.5);
        break;
      case 'Partial-TP2':
        setRMultiple(1.5);
        break;
      case 'Partial-TP1':
        setRMultiple(1.0);
        break;
      case 'Loss':
        setRMultiple(-1.0);
        break;
      case 'Breakeven':
        setRMultiple(0.0);
        break;
      case 'Closed-Time-Limit':
        setRMultiple(-0.2); // minor loss due to spread/fees or break even
        break;
    }
  }, [result]);

  const resetDateTime = () => {
    const d = new Date();
    // format as YYYY-MM-DDTHH:mm
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    setDateTimeUtc(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const saveTradesToStorage = (updated: Trade[]) => {
    setTrades(updated);
    localStorage.setItem('im_journal_trades', JSON.stringify(updated));
  };

  const handleSaveTrade = (e: React.FormEvent) => {
    e.preventDefault();

    const newTrade: Trade = {
      id: 'im_trade_' + Date.now(),
      dateTimeUtc: dateTimeUtc || new Date().toISOString(),
      pair,
      killZone,
      direction,
      setupType,
      confluenceScore,
      amdBias,
      priceZone,
      entryPrice: Number(entryPrice) || 0,
      stopLoss: Number(stopLoss) || 0,
      tp1: Number(tp1) || 0,
      tp2: Number(tp2) || 0,
      tp3: Number(tp3) || 0,
      riskPercent,
      positionSizeUsd: Number(positionSizeUsd) || 0,
      preTradeNotes,
      result,
      rMultiple,
      whatWentRight,
      whatWentWrong,
      wouldTakeAgain
    };

    const updated = [newTrade, ...trades];
    saveTradesToStorage(updated);

    if (syncToSheets) {
      syncToSheets('saveTrade', { trade: newTrade });
    }

    // Reset Form (except sizing preferences)
    setEntryPrice('');
    setStopLoss('');
    setTp1('');
    setTp2('');
    setTp3('');
    setPositionSizeUsd('');
    setPreTradeNotes('');
    setWhatWentRight('');
    setWhatWentWrong('');
    setResult('Win-TP3');
    setRMultiple(3.5);
    resetDateTime();

    // Switch view to see history & statistics
    setSubTab('history');
  };

  const handleClearForm = () => {
    setEntryPrice('');
    setStopLoss('');
    setTp1('');
    setTp2('');
    setTp3('');
    setPositionSizeUsd('');
    setPreTradeNotes('');
    setWhatWentRight('');
    setWhatWentWrong('');
    setResult('Win-TP3');
    setRMultiple(3.5);
    resetDateTime();
  };

  const handleDeleteTrade = (id: string) => {
    const updated = trades.filter((t) => t.id !== id);
    saveTradesToStorage(updated);
    setDeleteConfirmId(null);
  };

  // CSV Export
  const handleExportCsv = () => {
    if (mergedTrades.length === 0) return;
    
    const headers = [
      'Date (UTC)',
      'Pair',
      'Kill Zone',
      'Direction',
      'Setup Type',
      'Confluence Score',
      'AMD Bias',
      'Price Zone',
      'Entry Price',
      'Stop Loss',
      'TP1',
      'TP2',
      'TP3',
      'Risk %',
      'Position Size (USD)',
      'Result',
      'R-Multiple Achieved',
      'What Went Right',
      'What Went Wrong',
      'Would Take Again'
    ];

    const rows = mergedTrades.map((t) => [
      t.dateTimeUtc,
      t.pair,
      t.killZone,
      t.direction,
      t.setupType,
      t.confluenceScore,
      t.amdBias,
      t.priceZone,
      t.entryPrice,
      t.stopLoss,
      t.tp1,
      t.tp2,
      t.tp3,
      t.riskPercent,
      t.positionSizeUsd,
      t.result,
      t.rMultiple,
      `"${t.whatWentRight.replace(/"/g, '""')}"`,
      `"${t.whatWentWrong.replace(/"/g, '""')}"`,
      t.wouldTakeAgain
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `institutional_mirror_trades_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- STATS CALCULATIONS ---
  const totalTrades = mergedTrades.length;
  
  // Wins count: 'Win-TP3' | 'Partial-TP2' | 'Partial-TP1'
  const winningTrades = mergedTrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1');
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
  
  const sumR = mergedTrades.reduce((acc, t) => acc + t.rMultiple, 0);
  const avgR = totalTrades > 0 ? sumR / totalTrades : 0;

  // Profit Factor = Sum of positive R / absolute Sum of negative R
  const positiveRSum = mergedTrades.filter(t => t.rMultiple > 0).reduce((acc, t) => acc + t.rMultiple, 0);
  const negativeRSum = Math.abs(mergedTrades.filter(t => t.rMultiple < 0).reduce((acc, t) => acc + t.rMultiple, 0));
  const profitFactor = negativeRSum === 0 ? (positiveRSum > 0 ? 'N/A' : '1.00') : (positiveRSum / negativeRSum).toFixed(2);

  // Consecutive losses streak
  let currentLossStreak = 0;
  for (let i = 0; i < mergedTrades.length; i++) {
    if (mergedTrades[i].result === 'Loss') {
      currentLossStreak++;
    } else {
      break; // stop on first non-loss
    }
  }

  // Today's R-sum * riskPercent (limit check)
  const todayUtcString = new Date().toISOString().split('T')[0];
  const todayTrades = mergedTrades.filter(t => t.dateTimeUtc.startsWith(todayUtcString));
  const todayNetRValue = todayTrades.reduce((acc, t) => acc + (t.rMultiple * t.riskPercent), 0);

  // Best Kill Zone by Win Rate
  const zones = ['Asian Range', 'London KZ', 'NY KZ', 'Silver Bullet'];
  let bestZoneName = 'N/A';
  let bestZoneWinRate = -1;
  zones.forEach((zone) => {
    let wr = 0;
    let botZoneKey = zone;
    if (zone === 'NY KZ') botZoneKey = 'New York KZ';

    if (botData && botData.stats && botData.stats.winRateByZone && botData.stats.winRateByZone[botZoneKey] !== undefined && botData.stats.winRateByZone[botZoneKey] !== null) {
      wr = parseFloat(botData.stats.winRateByZone[botZoneKey]);
    } else {
      const zoneTrades = mergedTrades.filter(t => t.killZone === zone);
      if (zoneTrades.length > 0) {
        const wins = zoneTrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length;
        wr = (wins / zoneTrades.length) * 100;
      }
    }

    if (wr > bestZoneWinRate) {
      bestZoneWinRate = wr;
      bestZoneName = zone;
    }
  });

  // Type A vs B win rates
  const typeATrades = mergedTrades.filter(t => t.setupType === 'Type A');
  const typeBTrades = mergedTrades.filter(t => t.setupType === 'Type B');
  const typeAWinRate = typeATrades.length > 0 ? (typeATrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / typeATrades.length) * 100 : 0;
  const typeBWinRate = typeBTrades.length > 0 ? (typeBTrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / typeBTrades.length) * 100 : 0;

  // 6/6 vs 5/6 win rates
  const score6Trades = mergedTrades.filter(t => t.confluenceScore === 6);
  const score5Trades = mergedTrades.filter(t => t.confluenceScore === 5);
  const score6WinRate = score6Trades.length > 0 ? (score6Trades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / score6Trades.length) * 100 : 0;
  const score5WinRate = score5Trades.length > 0 ? (score5Trades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / score5Trades.length) * 100 : 0;

  // --- RENDER CHART.JS LOGIC ---
  useEffect(() => {
    if (subTab !== 'history' || mergedTrades.length === 0) return;

    // 1. BAR CHART: Win Rate by Kill Zone
    const barCtx = barChartRef.current?.getContext('2d');
    if (barCtx) {
      if (barChartInstance.current) {
        barChartInstance.current.destroy();
      }

      const zoneData = zones.map((zone) => {
        let botZoneKey = zone;
        if (zone === 'NY KZ') botZoneKey = 'New York KZ';
        
        if (botData && botData.stats && botData.stats.winRateByZone && botData.stats.winRateByZone[botZoneKey] !== undefined && botData.stats.winRateByZone[botZoneKey] !== null) {
          return Math.round(parseFloat(botData.stats.winRateByZone[botZoneKey]));
        }

        const zoneTrades = mergedTrades.filter(t => t.killZone === zone);
        if (zoneTrades.length === 0) return 0;
        const wins = zoneTrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length;
        return Math.round((wins / zoneTrades.length) * 100);
      });

      barChartInstance.current = new (window as any).Chart(barCtx, {
        type: 'bar',
        data: {
          labels: zones,
          datasets: [{
            label: 'Win Rate %',
            data: zoneData,
            backgroundColor: [
              'rgba(0, 255, 136, 0.15)',
              'rgba(56, 189, 248, 0.15)',
              'rgba(168, 85, 247, 0.15)',
              'rgba(245, 158, 11, 0.15)'
            ],
            borderColor: [
              '#00ff88',
              '#38bdf8',
              '#a855f7',
              '#f59e0b'
            ],
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context: any) => ` Win Rate: ${context.raw}%`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#888', font: { family: 'JetBrains Mono', size: 10 } }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#aaa', font: { family: 'Inter', size: 11 } }
            }
          }
        }
      });
    }

    // 2. LINE CHART: Cumulative R Over Time
    const lineCtx = lineChartRef.current?.getContext('2d');
    if (lineCtx) {
      if (lineChartInstance.current) {
        lineChartInstance.current.destroy();
      }

      // Compute cumulative R chronological order (oldest first)
      const chronTrades = [...mergedTrades].reverse();
      let totalRAccumulator = 0;
      const cumulativeRValues = chronTrades.map((t) => {
        totalRAccumulator += t.rMultiple;
        return parseFloat(totalRAccumulator.toFixed(2));
      });

      const lineLabels = chronTrades.map((t, idx) => `#${idx + 1}`);

      // Glow color based on positive or negative final R balance
      const finalPositive = totalRAccumulator >= 0;
      const colorHex = finalPositive ? '#00ff88' : '#ff4444';
      const fillGradient = lineCtx.createLinearGradient(0, 0, 0, 150);
      fillGradient.addColorStop(0, finalPositive ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 68, 68, 0.12)');
      fillGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lineChartInstance.current = new (window as any).Chart(lineCtx, {
        type: 'line',
        data: {
          labels: lineLabels.length > 0 ? lineLabels : ['#0'],
          datasets: [{
            label: 'Cumulative R',
            data: cumulativeRValues.length > 0 ? cumulativeRValues : [0],
            borderColor: colorHex,
            borderWidth: 2,
            pointBackgroundColor: colorHex,
            pointRadius: 3,
            fill: true,
            backgroundColor: fillGradient,
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: { color: '#888', font: { family: 'JetBrains Mono', size: 10 } }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#aaa', font: { family: 'JetBrains Mono', size: 10 } }
            }
          }
        }
      });
    }
  }, [subTab, trades, botData]);

  return (
    <div className="space-y-6" id="im_journal_view">
      
      {/* SUB-TABS NAVIGATION */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setSubTab('log')}
          className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-semibold text-xs tracking-wider uppercase transition-all
            ${subTab === 'log'
              ? 'border-[#00ff88] text-[#00ff88]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          id="im_subtab_log"
        >
          <Plus className="w-4 h-4" /> Log Trade
        </button>
        <button
          onClick={() => setSubTab('history')}
          className={`flex items-center gap-2 px-6 py-3.5 border-b-2 font-semibold text-xs tracking-wider uppercase transition-all
            ${subTab === 'history'
              ? 'border-[#00ff88] text-[#00ff88]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          id="im_subtab_history"
        >
          <BarChart3 className="w-4 h-4" /> History & Stats {trades.length > 0 && <span className="ml-1 text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded-full text-zinc-300">{trades.length}</span>}
        </button>
      </div>

      {/* VIEW 1: LOG TRADE FORM */}
      {subTab === 'log' && (
        <form onSubmit={handleSaveTrade} className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl space-y-6" id="im_log_trade_form">
          <div className="border-b border-zinc-850 pb-3 flex justify-between items-center">
            <div>
              <h2 className="text-base font-semibold text-[#e6edf3] tracking-tight">Record Live Execution Parameters</h2>
              <p className="text-xs text-zinc-400">Save trade performance statistics to analyze expected value over time.</p>
            </div>
            <button
              type="button"
              onClick={resetDateTime}
              className="text-xs font-mono text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-[#0d1117] px-2 py-1 border border-zinc-800 rounded"
              id="im_form_reset_time"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync UTC Time
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* Datetime */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" /> Date & Time (UTC)
              </label>
              <input
                type="datetime-local"
                value={dateTimeUtc}
                onChange={(e) => setDateTimeUtc(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
                required
              />
            </div>

            {/* Trading Pair */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Asset Pair</label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
              >
                <option value="BTC/USDT">BTC/USDT</option>
                <option value="ETH/USDT">ETH/USDT</option>
                <option value="SOL/USDT">SOL/USDT</option>
                <option value="Other">Other Major / Altcoin</option>
              </select>
            </div>

            {/* Kill Zone */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Kill Zone Window</label>
              <select
                value={killZone}
                onChange={(e) => setKillZone(e.target.value)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
              >
                <option value="Asian Range">Asian Range (00:00 - 04:00)</option>
                <option value="London KZ">London KZ (07:00 - 10:00)</option>
                <option value="NY KZ">NY KZ (12:00 - 15:00)</option>
                <option value="Silver Bullet">Silver Bullet (15:00 - 16:00)</option>
                <option value="Outside Zone">Outside Window / Dead Zone</option>
              </select>
            </div>

            {/* Direction */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('Long')}
                  className={`py-2 rounded text-xs font-bold transition-all border
                    ${direction === 'Long'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                      : 'bg-[#0d1117] border-zinc-800 text-zinc-500'
                    }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('Short')}
                  className={`py-2 rounded text-xs font-bold transition-all border
                    ${direction === 'Short'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                      : 'bg-[#0d1117] border-zinc-800 text-zinc-500'
                    }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            {/* Setup Type */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Setup Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSetupType('Type A')}
                  className={`py-2 rounded text-xs font-bold transition-all border
                    ${setupType === 'Type A'
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                      : 'bg-[#0d1117] border-zinc-800 text-zinc-500'
                    }`}
                >
                  Type A (Trend)
                </button>
                <button
                  type="button"
                  onClick={() => setSetupType('Type B')}
                  className={`py-2 rounded text-xs font-bold transition-all border
                    ${setupType === 'Type B'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                      : 'bg-[#0d1117] border-zinc-800 text-zinc-500'
                    }`}
                >
                  Type B (Counter)
                </button>
              </div>
            </div>

            {/* Confluence Score */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Confluence Score (1-6)</label>
              <select
                value={confluenceScore}
                onChange={(e) => setConfluenceScore(Number(e.target.value))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
              >
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <option key={num} value={num}>{num} / 6 Confluences</option>
                ))}
              </select>
            </div>

            {/* AMD Bias */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">AMD Session Bias</label>
              <select
                value={amdBias}
                onChange={(e) => setAmdBias(e.target.value as any)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-sans text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
              >
                <option value="N/A">N/A / No sweep mapped</option>
                <option value="Bullish NY">Bullish NY (London swept low)</option>
                <option value="Bearish NY">Bearish NY (London swept high)</option>
              </select>
            </div>

            {/* Price Zone location */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Swing Price Zone Location</label>
              <select
                value={priceZone}
                onChange={(e) => setPriceZone(e.target.value as any)}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-sans text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
              >
                <option value="Discount">Discount (Buying low)</option>
                <option value="Premium">Premium (Selling high)</option>
                <option value="Neutral">Neutral (Equilibrium 50%)</option>
              </select>
            </div>

            {/* Risk Percent */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Risk Percent Used (%)</label>
              <input
                type="number"
                step="0.1"
                value={riskPercent}
                onChange={(e) => setRiskPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
                required
              />
            </div>

          </div>

          {/* Pricing parameters details */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-[#0d1117] p-4 border border-zinc-800 rounded-md">
            
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Entry Price (USD)</label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                placeholder="65000"
                className="w-full bg-[#161b22] border border-zinc-850 rounded py-1.5 px-2 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-emerald-400"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Stop Loss (USD)</label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                placeholder="64350"
                className="w-full bg-[#161b22] border border-zinc-850 rounded py-1.5 px-2 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-rose-400"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Target TP1 (1R)</label>
              <input
                type="number"
                step="any"
                value={tp1}
                onChange={(e) => setTp1(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                className="w-full bg-[#161b22] border border-zinc-850 rounded py-1.5 px-2 text-xs font-mono text-emerald-400 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Target TP2 (1.5R)</label>
              <input
                type="number"
                step="any"
                value={tp2}
                onChange={(e) => setTp2(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                className="w-full bg-[#161b22] border border-zinc-850 rounded py-1.5 px-2 text-xs font-mono text-emerald-300 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Target TP3 (3.5R)</label>
              <input
                type="number"
                step="any"
                value={tp3}
                onChange={(e) => setTp3(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                className="w-full bg-[#161b22] border border-zinc-850 rounded py-1.5 px-2 text-xs font-mono text-[#00ff88] focus:outline-none"
              />
            </div>

            <div className="md:col-span-5 pt-2 flex flex-col md:flex-row justify-between text-[11px] text-zinc-500 font-mono">
              <span>* Entry, Stop Loss, and Risk% will auto-calculate standard SMC 1R, 1.5R, 3.5R tranches.</span>
              <div className="mt-1 md:mt-0">
                Position Size estimation: <span className="text-[#00ff88] font-bold">{positionSizeUsd ? `$${positionSizeUsd}` : 'N/A'}</span>
              </div>
            </div>

          </div>

          {/* Trade Execution Outcome & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-3 border-t border-zinc-850">
            
            {/* Notes */}
            <div className="md:col-span-4 space-y-1.5">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Pre-Trade Context / Thesis</label>
              <textarea
                value={preTradeNotes}
                onChange={(e) => setPreTradeNotes(e.target.value)}
                placeholder="Market swept daily lows at 07:20 UTC. Spotted MSS on 5m, entering on FVG retest."
                rows={4}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
              ></textarea>
            </div>

            {/* Results selector and R achievement */}
            <div className="md:col-span-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider">Trade Outcome Result</label>
                <select
                  value={result}
                  onChange={(e) => setResult(e.target.value as any)}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 px-3 text-xs font-semibold text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
                >
                  <option value="Win-TP3">Win - Full TP3 Hit (+3.5R)</option>
                  <option value="Partial-TP2">Partial Win - Closed TP2 (+1.5R)</option>
                  <option value="Partial-TP1">Partial Win - Closed TP1 (+1.0R)</option>
                  <option value="Breakeven">Breakeven - Closed at entry (0R)</option>
                  <option value="Closed-Time-Limit">Closed on 4Hr Time Limit (-0.2R)</option>
                  <option value="Loss">Loss - Hit Stop Loss (-1.0R)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider">R-Multiple Achieved</label>
                <input
                  type="number"
                  step="0.01"
                  value={rMultiple}
                  onChange={(e) => setRMultiple(parseFloat(e.target.value) || 0)}
                  className={`w-full bg-[#0d1117] border rounded-md py-2 px-3 text-xs font-mono focus:outline-none 
                    ${rMultiple > 0 
                      ? 'border-emerald-500/50 text-[#00ff88]' 
                      : rMultiple < 0 
                        ? 'border-rose-500/50 text-[#ff4444]' 
                        : 'border-zinc-800 text-zinc-300'}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider">Would Take Again?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWouldTakeAgain('Yes')}
                    className={`py-1.5 rounded text-xs font-bold transition-all border
                      ${wouldTakeAgain === 'Yes'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-[#0d1117] border-zinc-850 text-zinc-500'
                      }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWouldTakeAgain('No')}
                    className={`py-1.5 rounded text-xs font-bold transition-all border
                      ${wouldTakeAgain === 'No'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        : 'bg-[#0d1117] border-zinc-850 text-zinc-500'
                      }`}
                  >
                    No
                  </button>
                </div>
              </div>
            </div>

            {/* Post-trade self assessments */}
            <div className="md:col-span-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider">What went right?</label>
                <textarea
                  value={whatWentRight}
                  onChange={(e) => setWhatWentRight(e.target.value)}
                  placeholder="Waited exactly 20 minutes for NY open sweeps. Execution was clean."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-1.5 px-3 text-xs text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
                ></textarea>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider">What went wrong / Lesson?</label>
                <textarea
                  value={whatWentWrong}
                  onChange={(e) => setWhatWentWrong(e.target.value)}
                  placeholder="Felt minor FOMO as price hovered near TP2 but followed partial tranches rules."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-1.5 px-3 text-xs text-[#e6edf3] focus:outline-none focus:border-[#00ff88]"
                ></textarea>
              </div>
            </div>

          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-zinc-850">
            <button
              type="button"
              onClick={handleClearForm}
              className="px-5 py-2.5 bg-[#0d1117] border border-zinc-800 hover:bg-[#161b22] text-zinc-400 hover:text-zinc-300 font-bold text-xs rounded transition-all tracking-wider"
              id="im_clear_form_btn"
            >
              CLEAR FORM
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-[#00ff88] text-zinc-950 font-extrabold text-xs rounded shadow-lg shadow-emerald-500/10 hover:opacity-90 transition-all tracking-wider flex items-center gap-1.5"
              id="im_save_trade_btn"
            >
              <Save className="w-4 h-4" /> SAVE JOURNAL ENTRY
            </button>
          </div>
        </form>
      )}

      {/* VIEW 2: HISTORY & STATS DISPLAY */}
      {subTab === 'history' && (
        <div className="space-y-6" id="im_history_stats_view">
          
          {/* WARNING BANNERS */}
          <div className="space-y-3">
            {/* 3 consecutive losses ban */}
            {currentLossStreak >= 3 && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-lg flex items-start space-x-3 text-[#ff4444]" id="im_banner_cooling_off">
                <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
                <div className="text-xs leading-relaxed">
                  <h4 className="font-extrabold tracking-wider text-sm">3 CONSECUTIVE LOSSES — Mandatory 24hr break</h4>
                  <p className="mt-1 text-rose-300">
                    Systemic defense trigger: You have hit the consecutive losses threshold. Stop execution, preserve remaining capital, and step away from live charts for 24 hours. Reset your emotional state and perform model backtesting on the weekend.
                  </p>
                </div>
              </div>
            )}

            {/* Daily profit cap reached */}
            {todayNetRValue > 3.0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-lg flex items-start space-x-3 text-[#ffd700]" id="im_banner_profit_cap">
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-yellow-400" />
                <div className="text-xs leading-relaxed">
                  <h4 className="font-extrabold tracking-wider text-sm">Daily Profit Cap Hit — Stop Trading</h4>
                  <p className="mt-1 text-yellow-200">
                    Congratulations! Your combined intraday yield is <span className="font-mono font-bold">+{todayNetRValue.toFixed(1)}%</span>, exceeding the maximum daily target boundary of 3.0%. Lock in these profits. Over-trading past target milestones leads to expected value degradation.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* STATS BENTO GRID */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4" id="im_stats_bento_grid">
            
            <div className="bg-[#161b22] border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-28">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Total Trades</span>
              <span className="text-3xl font-extrabold font-mono text-[#e6edf3]">{totalTrades}</span>
              <span className="text-[10px] text-zinc-400">Total samples logged</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-28">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Win Rate %</span>
              <span className="text-3xl font-extrabold font-mono text-[#00ff88]">{winRate.toFixed(1)}%</span>
              <span className="text-[10px] text-zinc-400">Wins & part-profits</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-28">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Avg R-Multiple</span>
              <span className={`text-3xl font-extrabold font-mono ${avgR >= 0 ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
                {avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}
              </span>
              <span className="text-[10px] text-zinc-400">Yield expectancy / trade</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-28">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Profit Factor</span>
              <span className="text-3xl font-extrabold font-mono text-[#ffd700]">{profitFactor}</span>
              <span className="text-[10px] text-zinc-400">Gross gain / Gross loss</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-28 lg:col-span-2">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Best Kill Zone</span>
              <span className="text-xl font-extrabold font-mono text-sky-400 truncate">{bestZoneName}</span>
              <span className="text-[10px] text-zinc-400">{bestZoneWinRate >= 0 ? `${bestZoneWinRate.toFixed(0)}% accuracy` : 'No trades logged'}</span>
            </div>

            <div className="bg-[#161b22] border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-28 lg:col-span-2">
              <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest leading-none">Strict Setup Win Rate</span>
              <div className="flex flex-col space-y-0.5 text-xs text-zinc-300 font-mono mt-1">
                <div className="flex justify-between">
                  <span>Type A:</span> <span className="font-bold text-[#00ff88]">{typeAWinRate.toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Type B:</span> <span className="font-bold text-[#ffd700]">{typeBWinRate.toFixed(0)}%</span>
                </div>
              </div>
              <span className="text-[9px] text-zinc-500">6/6 setup: {score6WinRate.toFixed(0)}% | 5/6: {score5WinRate.toFixed(0)}%</span>
            </div>

          </div>

          {/* TWO GRAPH CHARTS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Kill Zone Win rate bar chart */}
            <div className="bg-[#161b22] border border-zinc-800 p-5 rounded-lg shadow-xl">
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-3 tracking-tight">Accuracy Win Rate % by Kill Zone</h3>
              <div className="h-56 relative">
                {trades.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">No trading data available</div>
                ) : (
                  <canvas ref={barChartRef}></canvas>
                )}
              </div>
            </div>

            {/* Cumulative R equity curve */}
            <div className="bg-[#161b22] border border-zinc-800 p-5 rounded-lg shadow-xl">
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-3 tracking-tight">Chronological Cumulative R Performance</h3>
              <div className="h-56 relative">
                {trades.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-600">No trading data available</div>
                ) : (
                  <canvas ref={lineChartRef}></canvas>
                )}
              </div>
            </div>
          </div>

          {/* TRADES LOG HISTORY TABLE */}
          <div className="bg-[#161b22] border border-zinc-800/80 rounded-lg shadow-xl overflow-hidden" id="im_trades_log_history_card">
            <div className="p-5 border-b border-zinc-850 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#e6edf3] tracking-tight">Archived Trade Records Log</h3>
                <p className="text-xs text-zinc-500">Chronological history of trading execution samples.</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportCsv}
                  disabled={mergedTrades.length === 0}
                  className={`px-4 py-1.5 border rounded text-xs font-bold transition-all flex items-center gap-1.5
                    ${mergedTrades.length > 0
                      ? 'bg-[#0d1117] hover:bg-[#161b22] border-zinc-800 text-zinc-300'
                      : 'bg-zinc-800 border-zinc-750 text-zinc-600 cursor-not-allowed'
                    }`}
                  id="im_export_csv_btn"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            {/* Table layout container */}
            <div className="overflow-x-auto w-full">
              {mergedTrades.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 flex flex-col items-center justify-center">
                  <BookOpen className="w-8 h-8 mb-2" />
                  <span className="text-xs font-semibold">No trades recorded in this journal.</span>
                  <span className="text-[10px] mt-1 text-zinc-500">Create entries in the Log Trade form or wait for bot data to populate stats.</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0d1117] text-zinc-400 font-semibold border-b border-zinc-800">
                      <th className="py-3 px-4 text-center">#</th>
                      <th className="py-3 px-3">Date (UTC)</th>
                      <th className="py-3 px-3">Source</th>
                      <th className="py-3 px-3">Pair</th>
                      <th className="py-3 px-3">Zone</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3 text-center">Score</th>
                      <th className="py-3 px-3">Direction</th>
                      <th className="py-3 px-3">Result</th>
                      <th className="py-3 px-3 text-right">R-Multiple</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850">
                    {mergedTrades.map((t, idx) => {
                      const displayIndex = mergedTrades.length - idx;
                      const isWin = t.rMultiple > 0;
                      const isLoss = t.rMultiple < 0;
                      const isBot = t.preTradeNotes.includes('bot.js') || t.id.startsWith('bot_');
                      
                      // Format date nicely
                      const formattedDate = t.dateTimeUtc.replace('T', ' ');

                      return (
                        <tr key={t.id} className="hover:bg-zinc-800/20 transition-colors">
                          <td className="py-2.5 px-4 text-center font-mono text-zinc-500 font-bold">{displayIndex}</td>
                          <td className="py-2.5 px-3 font-mono text-zinc-400">{formattedDate}</td>
                          <td className="py-2.5 px-3">
                            {isBot ? (
                              <span className="px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-[#00ff88] rounded font-semibold text-[9px] font-mono whitespace-nowrap">
                                🤖 Auto
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded font-semibold text-[9px] font-mono whitespace-nowrap">
                                ✍️ Manual
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-zinc-300">{t.pair}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-750 rounded text-zinc-400 text-[10px] font-mono">
                              {t.killZone.replace(' KZ', '')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium">
                            <span className={t.setupType === 'Type A' ? 'text-sky-400' : 'text-amber-400'}>
                              {t.setupType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`font-mono font-bold ${t.confluenceScore === 6 ? 'text-[#00ff88]' : 'text-zinc-400'}`}>
                              {t.confluenceScore}/6
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`font-bold uppercase text-[10px] px-1.5 py-0.5 rounded
                              ${t.direction === 'Long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {t.direction}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`font-medium ${isWin ? 'text-[#00ff88]' : isLoss ? 'text-[#ff4444]' : 'text-zinc-400'}`}>
                              {t.result}
                            </span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${isWin ? 'text-[#00ff88]' : isLoss ? 'text-[#ff4444]' : 'text-zinc-400'}`}>
                            {isWin ? '+' : ''}{t.rMultiple.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {isBot ? (
                              <span className="text-zinc-600 text-[10px] font-mono">System</span>
                            ) : deleteConfirmId === t.id ? (
                              <div className="flex justify-center items-center space-x-1">
                                <button
                                  onClick={() => handleDeleteTrade(t.id)}
                                  className="px-2 py-0.5 bg-rose-500 text-zinc-950 rounded text-[10px] font-bold"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-2 py-0.5 bg-zinc-700 text-zinc-300 rounded text-[10px]"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(t.id)}
                                className="text-zinc-600 hover:text-[#ff4444] transition-colors p-1"
                                title="Delete Trade"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
