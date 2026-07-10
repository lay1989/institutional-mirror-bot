import React, { useState, useEffect, useRef } from 'react';
import { Trade } from '../types';
import { BookOpen, BarChart3, Plus, Calendar, Save, Trash2, Download, AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react';

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
  const donutChartRef = useRef<HTMLCanvasElement | null>(null);

  const barChartInstance = useRef<any>(null);
  const lineChartInstance = useRef<any>(null);
  const donutChartInstance = useRef<any>(null);

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
      
      if (prefilledSetup.confluenceScore === 6) {
        setRMultiple(3.5);
      } else {
        setRMultiple(1.5);
      }

      onClearPrefilledSetup();
    }
  }, [prefilledSetup]);

  // Recalculate Stop, TPs and Position parameters on price changes in form
  useEffect(() => {
    if (entryPrice && stopLoss && typeof entryPrice === 'number' && typeof stopLoss === 'number') {
      const distance = Math.abs(entryPrice - stopLoss);
      if (distance > 0) {
        if (direction === 'Long') {
          setTp1(parseFloat((entryPrice + distance * 1.0).toFixed(4)));
          setTp2(parseFloat((entryPrice + distance * 1.5).toFixed(4)));
          setTp3(parseFloat((entryPrice + distance * 3.5).toFixed(4)));
        } else {
          setTp1(parseFloat((entryPrice - distance * 1.0).toFixed(4)));
          setTp2(parseFloat((entryPrice - distance * 1.5).toFixed(4)));
          setTp3(parseFloat((entryPrice - distance * 3.5).toFixed(4)));
        }

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
        setRMultiple(-0.2);
        break;
    }
  }, [result]);

  const resetDateTime = () => {
    const d = new Date();
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

  const handleExportCsv = () => {
    if (mergedTrades.length === 0) return;
    
    const headers = [
      'Date (UTC)', 'Pair', 'Kill Zone', 'Direction', 'Setup Type',
      'Confluence Score', 'AMD Bias', 'Price Zone', 'Entry Price',
      'Stop Loss', 'TP1', 'TP2', 'TP3', 'Risk %', 'Position Size (USD)',
      'Result', 'R-Multiple Achieved', 'What Went Right', 'What Went Wrong', 'Would Take Again'
    ];

    const rows = mergedTrades.map((t) => [
      t.dateTimeUtc, t.pair, t.killZone, t.direction, t.setupType,
      t.confluenceScore, t.amdBias, t.priceZone, t.entryPrice,
      t.stopLoss, t.tp1, t.tp2, t.tp3, t.riskPercent, t.positionSizeUsd,
      t.result, t.rMultiple, `"${t.whatWentRight.replace(/"/g, '""')}"`,
      `"${t.whatWentWrong.replace(/"/g, '""')}"`, t.wouldTakeAgain
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
  const winningTrades = mergedTrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1');
  const lossTrades = mergedTrades.filter(t => t.result === 'Loss');
  const breakEvenTrades = mergedTrades.filter(t => t.result === 'Breakeven');
  
  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
  const sumR = mergedTrades.reduce((acc, t) => acc + t.rMultiple, 0);
  const avgR = totalTrades > 0 ? sumR / totalTrades : 0;

  const positiveRSum = mergedTrades.filter(t => t.rMultiple > 0).reduce((acc, t) => acc + t.rMultiple, 0);
  const negativeRSum = Math.abs(mergedTrades.filter(t => t.rMultiple < 0).reduce((acc, t) => acc + t.rMultiple, 0));
  const profitFactor = negativeRSum === 0 ? (positiveRSum > 0 ? 'N/A' : '1.00') : (positiveRSum / negativeRSum).toFixed(2);

  let currentLossStreak = 0;
  for (let i = 0; i < mergedTrades.length; i++) {
    if (mergedTrades[i].result === 'Loss') {
      currentLossStreak++;
    } else {
      break;
    }
  }

  const todayUtcString = new Date().toISOString().split('T')[0];
  const todayTrades = mergedTrades.filter(t => t.dateTimeUtc.startsWith(todayUtcString));
  const todayNetRValue = todayTrades.reduce((acc, t) => acc + (t.rMultiple * t.riskPercent), 0);

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

  const typeATrades = mergedTrades.filter(t => t.setupType === 'Type A');
  const typeBTrades = mergedTrades.filter(t => t.setupType === 'Type B');
  const typeAWinRate = typeATrades.length > 0 ? (typeATrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / typeATrades.length) * 100 : 0;
  const typeBWinRate = typeBTrades.length > 0 ? (typeBTrades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / typeBTrades.length) * 100 : 0;

  const score6Trades = mergedTrades.filter(t => t.confluenceScore === 6);
  const score5Trades = mergedTrades.filter(t => t.confluenceScore === 5);
  const score6WinRate = score6Trades.length > 0 ? (score6Trades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / score6Trades.length) * 100 : 0;
  const score5WinRate = score5Trades.length > 0 ? (score5Trades.filter(t => t.result === 'Win-TP3' || t.result === 'Partial-TP2' || t.result === 'Partial-TP1').length / score5Trades.length) * 100 : 0;

  // --- RENDER DYNAMIC CHARTS WITH EXCHAGE COLORS ---
  useEffect(() => {
    if (subTab !== 'history' || mergedTrades.length === 0 || !(window as any).Chart) return;

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
          labels: zones.map(z => z.replace(' Range', '').replace(' KZ', '')),
          datasets: [{
            label: 'Win Rate %',
            data: zoneData,
            backgroundColor: [
              'rgba(34, 211, 238, 0.15)',
              'rgba(22, 199, 132, 0.15)',
              'rgba(22, 199, 132, 0.15)',
              'rgba(251, 191, 36, 0.15)'
            ],
            borderColor: [
              '#22D3EE',
              '#16C784',
              '#16C784',
              '#FBBF24'
            ],
            borderWidth: 1,
            borderRadius: 2
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
              grid: { color: 'rgba(31, 36, 48, 0.5)' },
              ticks: { color: '#6B7280', font: { family: 'IBM Plex Mono', size: 9 } }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#6B7280', font: { family: 'Inter', size: 9.5, weight: 'bold' } }
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

      const chronTrades = [...mergedTrades].reverse();
      let totalRAccumulator = 0;
      const cumulativeRValues = chronTrades.map((t) => {
        totalRAccumulator += t.rMultiple;
        return parseFloat(totalRAccumulator.toFixed(2));
      });

      const lineLabels = chronTrades.map((t, idx) => `#${idx + 1}`);
      const finalPositive = totalRAccumulator >= 0;
      const colorHex = finalPositive ? '#16C784' : '#EA3943';
      
      const fillGradient = lineCtx.createLinearGradient(0, 0, 0, 200);
      fillGradient.addColorStop(0, finalPositive ? 'rgba(22, 199, 132, 0.12)' : 'rgba(234, 57, 67, 0.12)');
      fillGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      lineChartInstance.current = new (window as any).Chart(lineCtx, {
        type: 'line',
        data: {
          labels: lineLabels.length > 0 ? lineLabels : ['#0'],
          datasets: [{
            label: 'Cumulative R',
            data: cumulativeRValues.length > 0 ? cumulativeRValues : [0],
            borderColor: colorHex,
            borderWidth: 1.5,
            pointBackgroundColor: colorHex,
            pointRadius: 1.5,
            fill: true,
            backgroundColor: fillGradient,
            tension: 0.1
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
              grid: { color: 'rgba(31, 36, 48, 0.5)' },
              ticks: { color: '#6B7280', font: { family: 'IBM Plex Mono', size: 9 } }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#6B7280', font: { family: 'IBM Plex Mono', size: 9 } }
            }
          }
        }
      });
    }

    // 3. DONUT CHART: Win / Loss / Breakeven Ratio
    const donutCtx = donutChartRef.current?.getContext('2d');
    if (donutCtx) {
      if (donutChartInstance.current) {
        donutChartInstance.current.destroy();
      }

      donutChartInstance.current = new (window as any).Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Wins', 'Losses', 'Breakeven'],
          datasets: [{
            data: [winningTrades.length, lossTrades.length, breakEvenTrades.length],
            backgroundColor: ['#16C784', '#EA3943', '#6B7280'],
            borderWidth: 0,
            borderRadius: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: '#6B7280',
                font: { family: 'Inter', size: 10, weight: 'bold' },
                padding: 10,
                boxWidth: 8
              }
            }
          }
        }
      });
    }

  }, [subTab, trades, botData, mergedTrades.length]);

  return (
    <div className="space-y-4" id="im_journal_view">
      
      {/* SUB-TABS NAVIGATION */}
      <div className="flex overflow-x-auto whitespace-nowrap scrollbar-none border-b border-[#1F2430]" id="im_journal_sub_tabs">
        <button
          onClick={() => setSubTab('log')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-mono font-bold text-xs tracking-wider uppercase transition-all
            ${subTab === 'log'
              ? 'border-[#22D3EE] text-[#22D3EE]'
              : 'border-transparent text-[#6B7280] hover:text-[#D7DCE5]'
            }`}
          id="im_subtab_log"
        >
          <Plus className="w-4 h-4" /> Log Trade Entry
        </button>
        <button
          onClick={() => setSubTab('history')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-mono font-bold text-xs tracking-wider uppercase transition-all
            ${subTab === 'history'
              ? 'border-[#22D3EE] text-[#22D3EE]'
              : 'border-transparent text-[#6B7280] hover:text-[#D7DCE5]'
            }`}
          id="im_subtab_history"
        >
          <BarChart3 className="w-4 h-4" /> Performance & Analytics {trades.length > 0 && <span className="ml-1 text-[9px] bg-[#1F2430] px-1.5 py-0.2 rounded-[2px] text-[#D7DCE5]">{trades.length}</span>}
        </button>
      </div>

      {/* VIEW 1: LOG TRADE FORM */}
      {subTab === 'log' && (
        <form onSubmit={handleSaveTrade} className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] space-y-4 animate-fade-in" id="im_log_trade_form">
          <div className="border-b border-[#1F2430] pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-xs font-bold font-mono text-[#D7DCE5] tracking-wider uppercase">Record Paper Execution Parameters</h2>
              <p className="text-[10px] text-[#6B7280]">Store telemetry metrics to backtest system expected value over chronological samples.</p>
            </div>
            <button
              type="button"
              onClick={resetDateTime}
              className="text-[10px] font-mono text-[#22D3EE] bg-[#0A0C10] px-2.5 py-1 border border-[#1F2430] rounded-[2px] font-bold hover:bg-[#1F2430]/30 transition-all flex items-center gap-1"
              id="im_form_reset_time"
            >
              <RefreshCw className="w-3 h-3 text-[#22D3EE]" /> Sync UTC Time
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Datetime */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#6B7280]" /> Date & Time (UTC)
              </label>
              <input
                type="datetime-local"
                value={dateTimeUtc}
                onChange={(e) => setDateTimeUtc(e.target.value)}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
                required
              />
            </div>

            {/* Trading Pair */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Asset Pair</label>
              <select
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
              >
                <option value="BTC/USDT">BTC/USDT</option>
                <option value="ETH/USDT">ETH/USDT</option>
                <option value="SOL/USDT">SOL/USDT</option>
                <option value="Other">Other Major / Altcoin</option>
              </select>
            </div>

            {/* Kill Zone */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Kill Zone Window</label>
              <select
                value={killZone}
                onChange={(e) => setKillZone(e.target.value)}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
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
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Direction</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setDirection('Long')}
                  className={`py-1.5 rounded-[2px] text-xs font-bold transition-all border
                    ${direction === 'Long'
                      ? 'bg-[#16C784]/10 border-[#16C784]/30 text-[#16C784]'
                      : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]'
                    }`}
                >
                  LONG
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('Short')}
                  className={`py-1.5 rounded-[2px] text-xs font-bold transition-all border
                    ${direction === 'Short'
                      ? 'bg-[#EA3943]/10 border-[#EA3943]/30 text-[#EA3943]'
                      : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]'
                    }`}
                >
                  SHORT
                </button>
              </div>
            </div>

            {/* Setup Type */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Setup Type</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSetupType('Type A')}
                  className={`py-1.5 rounded-[2px] text-xs font-bold transition-all border
                    ${setupType === 'Type A'
                      ? 'bg-[#22D3EE]/15 border-[#22D3EE]/30 text-[#22D3EE]'
                      : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]'
                    }`}
                >
                  Type A (Trend)
                </button>
                <button
                  type="button"
                  onClick={() => setSetupType('Type B')}
                  className={`py-1.5 rounded-[2px] text-xs font-bold transition-all border
                    ${setupType === 'Type B'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                      : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]'
                    }`}
                >
                  Type B (Counter)
                </button>
              </div>
            </div>

            {/* Confluence Score */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Confluence Score (1-6)</label>
              <select
                value={confluenceScore}
                onChange={(e) => setConfluenceScore(Number(e.target.value))}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
              >
                {[1, 2, 3, 4, 5, 6].map(num => (
                  <option key={num} value={num}>{num} / 6 Confluences</option>
                ))}
              </select>
            </div>

            {/* AMD Bias */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">AMD Session Bias</label>
              <select
                value={amdBias}
                onChange={(e) => setAmdBias(e.target.value as any)}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
              >
                <option value="N/A">N/A / No sweep mapped</option>
                <option value="Bullish NY">Bullish NY (London swept low)</option>
                <option value="Bearish NY">Bearish NY (London swept high)</option>
              </select>
            </div>

            {/* Price Zone location */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Price Zone Location</label>
              <select
                value={priceZone}
                onChange={(e) => setPriceZone(e.target.value as any)}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
              >
                <option value="Neutral">Neutral Equilibrium (50% block)</option>
                <option value="Discount">Discount Zone (below 50%)</option>
                <option value="Premium">Premium Zone (above 50%)</option>
              </select>
            </div>

            {/* Risk size percent */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Capital Risk Unit</label>
              <select
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
              >
                <option value={0.25}>0.25% (Defensive)</option>
                <option value={0.5}>0.50% (SMC Standard)</option>
                <option value={1.0}>1.00% (Normal Unit)</option>
                <option value={1.5}>1.50% (High Confidence)</option>
                <option value={2.0}>2.00% (Maximum Ceiling)</option>
              </select>
            </div>

          </div>

          {/* Pricing Parameters Panel */}
          <div className="bg-[#0A0C10] border border-[#1F2430] p-3 rounded-[2px] space-y-3">
            <h3 className="text-[10px] font-bold font-mono uppercase tracking-wider text-[#22D3EE]">Execution Coordinates Calculator</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              
              <div className="space-y-1">
                <label className="text-[9px] font-bold font-mono text-[#6B7280] uppercase">Entry Price ($)</label>
                <input
                  type="number"
                  step="any"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(parseFloat(e.target.value) || '')}
                  placeholder="e.g. 64250"
                  className="w-full bg-[#12151B] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold font-mono text-[#6B7280] uppercase">Stop Loss ($)</label>
                <input
                  type="number"
                  step="any"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(parseFloat(e.target.value) || '')}
                  placeholder="e.g. 63980"
                  className="w-full bg-[#12151B] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#EA3943] focus:outline-none focus:border-[#EA3943]/50 transition-all font-bold"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold font-mono text-[#6B7280] uppercase block">Position Value (USD)</label>
                <div className="w-full bg-[#12151B] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs font-mono text-[#6B7280] select-none">
                  {positionSizeUsd ? `$${positionSizeUsd.toLocaleString()}` : '$0.00'}
                </div>
              </div>

              <div className="space-y-1 font-sans">
                <label className="text-[9px] font-bold font-mono text-[#6B7280] uppercase block">Automated Targets</label>
                <span className="text-[9px] text-[#6B7280] leading-tight block">T1 (1R), T2 (1.5R) and T3 (3.5R) derived dynamically.</span>
              </div>

            </div>

            {entryPrice && stopLoss && (
              <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                <div className="bg-[#12151B] p-2 rounded-[2px] border border-[#1F2430] text-center font-mono">
                  <span className="text-[9px] text-[#6B7280] block uppercase font-sans">TP1 TARGET (1.0R)</span>
                  <span className="text-[#D7DCE5] font-bold text-[11px] block mt-0.5">${tp1}</span>
                </div>
                <div className="bg-[#12151B] p-2 rounded-[2px] border border-[#1F2430] text-center font-mono">
                  <span className="text-[9px] text-[#6B7280] block uppercase font-sans">TP2 TARGET (1.5R)</span>
                  <span className="text-[#D7DCE5] font-bold text-[11px] block mt-0.5">${tp2}</span>
                </div>
                <div className="bg-[#12151B] p-2 rounded-[2px] border border-[#1F2430] text-center font-mono">
                  <span className="text-[9px] text-[#6B7280] block uppercase font-sans">TP3 TARGET (3.5R)</span>
                  <span className="text-[#16C784] font-bold text-[11px] block mt-0.5">${tp3}</span>
                </div>
              </div>
            )}
          </div>

          {/* Form results log */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            
            <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-3">
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Strategic Plan</label>
                <textarea
                  value={preTradeNotes}
                  onChange={(e) => setPreTradeNotes(e.target.value)}
                  placeholder="FVG mitigation entry on micro-reversal..."
                  rows={3}
                  className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
                ></textarea>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Outcome Profile</label>
                <select
                  value={result}
                  onChange={(e) => setResult(e.target.value as any)}
                  className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all font-mono"
                >
                  <option value="Win-TP3">Win - TP3 hit fully (3.5R)</option>
                  <option value="Partial-TP2">Partial Win - TP2 hit (1.5R)</option>
                  <option value="Partial-TP1">Partial Win - TP1 hit (1.0R)</option>
                  <option value="Breakeven">Breakeven - stopped at entry (0.0R)</option>
                  <option value="Loss">Loss - full stop hit (-1.0R)</option>
                  <option value="Closed-Time-Limit">Closed - Session end limit (-0.2R)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">R-Multiple Achieved</label>
                <input
                  type="number"
                  step="0.01"
                  value={rMultiple}
                  onChange={(e) => setRMultiple(parseFloat(e.target.value) || 0)}
                  className={`w-full bg-[#0A0C10] border rounded-[2px] py-1.5 px-2.5 text-xs font-mono focus:outline-none transition-all
                    ${rMultiple > 0 
                      ? 'border-[#16C784]/30 text-[#16C784] font-bold' 
                      : rMultiple < 0 
                        ? 'border-[#EA3943]/30 text-[#EA3943] font-bold' 
                        : 'border-[#1F2430] text-[#6B7280]'}`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">Repeat Trade?</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setWouldTakeAgain('Yes')}
                    className={`py-1.5 rounded-[2px] text-xs font-bold transition-all border
                      ${wouldTakeAgain === 'Yes'
                        ? 'bg-[#16C784]/10 border-[#16C784]/30 text-[#16C784]'
                        : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]'
                      }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWouldTakeAgain('No')}
                    className={`py-1.5 rounded-[2px] text-xs font-bold transition-all border
                      ${wouldTakeAgain === 'No'
                        ? 'bg-[#EA3943]/10 border-[#EA3943]/30 text-[#EA3943]'
                        : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]'
                      }`}
                  >
                    No
                  </button>
                </div>
              </div>

            </div>

            {/* Post-trade self assessments */}
            <div className="md:col-span-4 grid grid-cols-2 gap-3 md:block md:space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">What went right?</label>
                <textarea
                  value={whatWentRight}
                  onChange={(e) => setWhatWentRight(e.target.value)}
                  placeholder="Execution was disciplined..."
                  rows={2}
                  className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
                ></textarea>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">What went wrong / Lesson?</label>
                <textarea
                  value={whatWentWrong}
                  onChange={(e) => setWhatWentWrong(e.target.value)}
                  placeholder="Felt slight hesitation..."
                  rows={2}
                  className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-2.5 text-xs text-[#D7DCE5] focus:outline-none focus:border-[#22D3EE] transition-all"
                ></textarea>
              </div>
            </div>

          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-2 pt-3 border-t border-[#1F2430]">
            <button
              type="button"
              onClick={handleClearForm}
              className="px-4 py-2 bg-[#0A0C10] border border-[#1F2430] hover:bg-[#1F2430]/20 text-[#6B7280] hover:text-[#D7DCE5] font-bold text-xs rounded-[2px] transition-all tracking-wider font-mono"
              id="im_clear_form_btn"
            >
              CLEAR FORM
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#22D3EE] text-[#0A0C10] font-bold text-xs rounded-[2px] hover:bg-[#22D3EE]/90 active:scale-98 transition-all tracking-wider flex items-center gap-1.5 font-mono"
              id="im_save_trade_btn"
            >
              <Save className="w-4 h-4" /> SAVE JOURNAL ENTRY
            </button>
          </div>
        </form>
      )}

      {/* VIEW 2: HISTORY & STATS DISPLAY */}
      {subTab === 'history' && (
        <div className="space-y-4 animate-fade-in" id="im_history_stats_view">
          
          {/* WARNING BANNERS */}
          <div className="space-y-3">
            {currentLossStreak >= 3 && (
              <div className="bg-[#12151B] border border-[#EA3943]/30 p-3.5 rounded-[2px] flex items-start space-x-3 text-[#EA3943]" id="im_banner_cooling_off">
                <AlertOctagon className="w-4.5 h-4.5 shrink-0 mt-0.5 animate-pulse" />
                <div className="text-xs leading-relaxed">
                  <h4 className="font-bold font-mono tracking-wider text-[11px] uppercase">3 CONSECUTIVE LOSSES — MANDATORY 24HR COOLING PAUSE</h4>
                  <p className="mt-1 text-[#6B7280] font-sans">
                    Systemic defense trigger: You have hit the consecutive losses threshold. Stop execution, preserve remaining capital, and step away from live charts for 24 hours. Reset your emotional state and perform model backtesting.
                  </p>
                </div>
              </div>
            )}

            {todayNetRValue > 3.0 && (
              <div className="bg-[#12151B] border border-amber-500/20 p-3.5 rounded-[2px] flex items-start space-x-3 text-amber-500" id="im_banner_profit_cap">
                <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed">
                  <h4 className="font-bold font-mono tracking-wider text-[11px] uppercase">DAILY PROFIT TARGET HIT — PAUSE ACTIVE EXECUTION</h4>
                  <p className="mt-1 text-[#6B7280] font-sans">
                    Intraday yield milestone achieved: Combined yield is <span className="font-mono font-bold text-amber-500">+{todayNetRValue.toFixed(1)}%</span>, exceeding the maximum daily target boundary of 3.0%. Lock in these profits. Over-trading past target milestones leads to expected value degradation.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* DYNAMIC EXCHANGE LAYOUT: 2-COLUMN SHRUNKEN CHARTS LEFT, EXPECTANCY MATRIX RIGHT */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4" id="im_journal_analytics_layout">
            
            {/* Left Side: Charts in compact 2-column format */}
            <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3" id="im_journal_charts_grid">
              
              {/* Donut Ratio */}
              <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between min-h-[220px]">
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] border-b border-[#1F2430]/40 pb-1">Win / Loss Ratio</h3>
                <div className="h-44 relative flex flex-col justify-center mt-2">
                  {mergedTrades.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#6B7280] font-mono">No trading logs mapped</div>
                  ) : (
                    <canvas ref={donutChartRef}></canvas>
                  )}
                </div>
              </div>

              {/* Bar Chart: Accuracy by KZ */}
              <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between min-h-[220px]">
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] border-b border-[#1F2430]/40 pb-1">Accuracy by Kill Zone</h3>
                <div className="h-44 relative mt-2">
                  {mergedTrades.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#6B7280] font-mono">No trading logs mapped</div>
                  ) : (
                    <canvas ref={barChartRef}></canvas>
                  )}
                </div>
              </div>

              {/* Line Chart: Cumulative Equity Curve (spans 2 columns) */}
              <div className="sm:col-span-2 bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between min-h-[240px]">
                <h3 className="text-[10px] font-mono uppercase tracking-wider text-[#6B7280] border-b border-[#1F2430]/40 pb-1">Cumulative R Performance Curve</h3>
                <div className="h-48 relative mt-2">
                  {mergedTrades.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[#6B7280] font-mono">No trading logs mapped</div>
                  ) : (
                    <canvas ref={lineChartRef}></canvas>
                  )}
                </div>
              </div>

            </div>

            {/* Right Side: Denseexpectancy matrix */}
            <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] flex flex-col justify-between" id="im_journal_dense_stats_panel">
              <div>
                <h3 className="text-xs font-bold font-mono text-[#D7DCE5] tracking-wider uppercase border-b border-[#1F2430] pb-2 mb-3 flex items-center justify-between">
                  <span>Expectancy Matrix</span>
                  <span className="text-[9px] text-[#6B7280] font-normal font-sans tracking-normal uppercase">Telemetry</span>
                </h3>
                
                <div className="space-y-4">
                  {/* Table 1: Core Metrics */}
                  <table className="w-full text-xs font-mono border-collapse">
                    <tbody>
                      <tr className="border-b border-[#1F2430]/40">
                        <td className="py-2 text-[#6B7280]">Total Sample Size</td>
                        <td className="py-2 text-right text-[#D7DCE5] font-bold">{totalTrades} trades</td>
                      </tr>
                      <tr className="border-b border-[#1F2430]/40">
                        <td className="py-2 text-[#6B7280]">Accuracy Win Rate</td>
                        <td className="py-2 text-right text-[#16C784] font-bold">{winRate.toFixed(1)}%</td>
                      </tr>
                      <tr className="border-b border-[#1F2430]/40">
                        <td className="py-2 text-[#6B7280]">Expectancy (Avg R)</td>
                        <td className={`py-2 text-right font-bold ${avgR >= 0 ? 'text-[#16C784]' : 'text-[#EA3943]'}`}>
                          {avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}R
                        </td>
                      </tr>
                      <tr className="border-b border-[#1F2430]/40">
                        <td className="py-2 text-[#6B7280]">Profit Factor</td>
                        <td className="py-2 text-right text-amber-500 font-bold">{profitFactor}</td>
                      </tr>
                      <tr className="border-b border-[#1F2430]/40">
                        <td className="py-2 text-[#6B7280]">Intraday Yield (Today)</td>
                        <td className={`py-2 text-right font-bold ${todayNetRValue >= 0 ? 'text-[#16C784]' : 'text-[#EA3943]'}`}>
                          {todayNetRValue >= 0 ? '+' : ''}{todayNetRValue.toFixed(1)}%
                        </td>
                      </tr>
                      <tr className="border-b border-[#1F2430]/40">
                        <td className="py-2 text-[#6B7280]">Losing Streak Count</td>
                        <td className="py-2 text-right text-[#EA3943] font-bold">{currentLossStreak} active</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Table 2: Model Splits */}
                  <div className="space-y-1.5 pt-1">
                    <h4 className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280] font-bold">
                      MODEL SPLIT ACCURACY
                    </h4>
                    <table className="w-full text-xs font-mono border-collapse">
                      <tbody>
                        <tr className="border-b border-[#1F2430]/30">
                          <td className="py-1.5 text-[#6B7280]">Type A (Trend Setup)</td>
                          <td className="py-1.5 text-right text-[#22D3EE] font-bold">{typeAWinRate.toFixed(0)}% WR</td>
                        </tr>
                        <tr className="border-b border-[#1F2430]/30">
                          <td className="py-1.5 text-[#6B7280]">Type B (Counter-Trend)</td>
                          <td className="py-1.5 text-right text-amber-500 font-bold">{typeBWinRate.toFixed(0)}% WR</td>
                        </tr>
                        <tr className="border-b border-[#1F2430]/30">
                          <td className="py-1.5 text-[#6B7280]">6/6 Confluence Filter</td>
                          <td className="py-1.5 text-right text-[#16C784] font-bold">{score6WinRate.toFixed(0)}% WR</td>
                        </tr>
                        <tr className="border-b border-[#1F2430]/30">
                          <td className="py-1.5 text-[#6B7280]">5/6 Confluence Filter</td>
                          <td className="py-1.5 text-right text-[#6B7280]">{score5WinRate.toFixed(0)}% WR</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Table 3: Best Execution Zone */}
                  <div className="space-y-1.5 pt-1">
                    <h4 className="text-[10px] uppercase tracking-wider font-mono text-[#6B7280] font-bold">
                      OPTIMAL TRADING ENGINE
                    </h4>
                    <div className="bg-[#0A0C10] p-2 border border-[#1F2430] text-[11px] flex justify-between items-center rounded-[2px]">
                      <span className="text-[#6B7280]">Best Window:</span>
                      <span className="font-bold text-[#22D3EE] uppercase font-mono">{bestZoneName}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* TRADES LOG HISTORY TABLE */}
          <div className="bg-[#12151B] border border-[#1F2430] rounded-[2px]" id="im_trades_log_history_card">
            <div className="p-4 border-b border-[#1F2430] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider">Archived Trade Records Log</h3>
                <p className="text-[10px] text-[#6B7280]">Complete chronological history of model execution samples.</p>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleExportCsv}
                  disabled={mergedTrades.length === 0}
                  className={`px-3 py-1.5 border rounded-[2px] text-[10px] font-bold transition-all flex items-center gap-1.5 font-mono uppercase
                    ${mergedTrades.length > 0
                      ? 'bg-[#0A0C10] hover:bg-[#1F2430]/40 border-[#1F2430] text-[#D7DCE5]'
                      : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280]/50 cursor-not-allowed'
                    }`}
                  id="im_export_csv_btn"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV Ledger
                </button>
              </div>
            </div>

            {/* Table layout container */}
            <div className="overflow-x-auto w-full">
              {mergedTrades.length === 0 ? (
                <div className="py-12 text-center text-[#6B7280] flex flex-col items-center justify-center">
                  <BookOpen className="w-8 h-8 mb-2 text-[#6B7280]/50" />
                  <span className="text-xs font-semibold font-mono">No trades recorded in this journal.</span>
                  <span className="text-[10px] mt-1 text-[#6B7280]/60 font-mono">Create entries in the Log Trade form or wait for bot data.</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0A0C10] text-[#6B7280] font-mono text-[10px] tracking-wider uppercase border-b border-[#1F2430]">
                      <th className="py-2.5 px-3 text-center w-10">#</th>
                      <th className="py-2.5 px-3">Date (UTC)</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Pair</th>
                      <th className="py-2.5 px-3">Zone</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-center">Score</th>
                      <th className="py-2.5 px-3">Direction</th>
                      <th className="py-2.5 px-3">Result</th>
                      <th className="py-2.5 px-3 text-right">R-Multiple</th>
                      <th className="py-2.5 px-3 text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2430]/50 font-mono">
                    {mergedTrades.map((t, idx) => {
                      const displayIndex = mergedTrades.length - idx;
                      const isWin = t.rMultiple > 0;
                      const isLoss = t.rMultiple < 0;
                      const isBot = t.preTradeNotes.includes('bot.js') || t.id.startsWith('bot_');
                      const formattedDate = t.dateTimeUtc.replace('T', ' ');

                      return (
                        <tr key={t.id} className="hover:bg-[#1F2430]/20 transition-colors">
                          <td className="py-2 px-3 text-center text-[#6B7280] font-bold">{displayIndex}</td>
                          <td className="py-2 px-3 text-[#6B7280] whitespace-nowrap text-[11px]">{formattedDate}</td>
                          <td className="py-2 px-3">
                            {isBot ? (
                              <span className="text-[9px] font-bold text-[#16C784]">AUTO</span>
                            ) : (
                              <span className="text-[9px] font-bold text-[#6B7280]">MANUAL</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-bold text-[#D7DCE5]">{t.pair}</td>
                          <td className="py-2 px-3">
                            <span className="text-[11px] text-[#D7DCE5]">
                              {t.killZone.replace(' Range', '').replace(' KZ', '')}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={t.setupType === 'Type A' ? 'text-[#22D3EE]' : 'text-amber-500'}>
                              {t.setupType}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center text-[#D7DCE5]">
                            {t.confluenceScore}/6
                          </td>
                          <td className="py-2 px-3">
                            <span className={t.direction === 'Long' ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                              {t.direction?.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={isWin ? 'text-[#16C784]' : isLoss ? 'text-[#EA3943]' : 'text-[#6B7280]'}>
                              {t.result}
                            </span>
                          </td>
                          <td className={`py-2 px-3 text-right font-bold ${isWin ? 'text-[#16C784]' : isLoss ? 'text-[#EA3943]' : 'text-[#6B7280]'}`}>
                            {isWin ? '+' : ''}{t.rMultiple.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {isBot ? (
                              <span className="text-[#4B5563] text-[9px] uppercase">Bot</span>
                            ) : deleteConfirmId === t.id ? (
                              <div className="flex justify-center items-center space-x-1">
                                <button
                                  onClick={() => handleDeleteTrade(t.id)}
                                  className="px-1.5 py-0.5 bg-[#EA3943] text-[#0A0C10] rounded-[2px] text-[9px] font-bold"
                                >
                                  Del
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-1.5 py-0.5 bg-[#1F2430] text-[#6B7280] rounded-[2px] text-[9px]"
                                >
                                  Esc
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(t.id)}
                                className="text-[#6B7280] hover:text-[#EA3943] transition-colors p-1"
                                title="Delete Trade"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
