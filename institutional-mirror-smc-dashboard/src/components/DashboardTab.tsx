import React, { useState, useEffect } from 'react';
import { getClocks, getMarketStatus, formatDuration } from '../utils';
import { Clock, AlertTriangle, Activity } from 'lucide-react';

interface DashboardTabProps {
  onSetActiveTab: (tab: string) => void;
  syncToSheets?: (action: string, payload: any) => void;
  botData?: any;
}

export default function DashboardTab({ onSetActiveTab, botData }: DashboardTabProps) {
  const [now, setNow] = useState(new Date());
  const [expandedRows, setExpandedRows] = useState<{ [key: string]: boolean }>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getHoursOpen = (dateTimeUtcStr: string) => {
    const t = new Date(dateTimeUtcStr).getTime();
    if (isNaN(t)) return 0;
    const hoursOpen = (Date.now() - t) / (1000 * 60 * 60);
    return Math.max(0, parseFloat(hoursOpen.toFixed(1)));
  };

  const timeAgo = (dateStr: string) => {
    const t = new Date(dateStr).getTime();
    if (isNaN(t)) return 'some time ago';
    const diffMs = Date.now() - t;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const clocks = getClocks(now);
  const marketStatus = getMarketStatus(now);

  // Calculate percentage of day completed in UTC
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  const totalSecondsInDay = 86400;
  const currentSeconds = hours * 3600 + minutes * 60 + seconds;
  const dayPercent = (currentSeconds / totalSecondsInDay) * 100;

  // Timeline segments
  const segments = [
    { name: 'Asian Range', start: '00:00', end: '04:00', width: (4 / 24) * 100, isKillZone: true },
    { name: 'Dead Zone', start: '04:00', end: '07:00', width: (3 / 24) * 100, isKillZone: false },
    { name: 'London KZ', start: '07:00', end: '10:00', width: (3 / 24) * 100, isKillZone: true },
    { name: 'Dead Zone', start: '10:00', end: '12:00', width: (2 / 24) * 100, isKillZone: false },
    { name: 'New York KZ', start: '12:00', end: '15:00', width: (3 / 24) * 100, isKillZone: true },
    { name: 'Silver Bullet', start: '15:00', end: '16:00', width: (1 / 24) * 100, isKillZone: true },
    { name: 'Dead Zone', start: '16:00', end: '24:00', width: (8 / 24) * 100, isKillZone: false },
  ];

  // Dynamic merged trades from local storage + bot activity for calculations
  const getMergedTrades = () => {
    let local: any[] = [];
    const stored = localStorage.getItem('im_journal_trades');
    if (stored) {
      try {
        local = JSON.parse(stored);
      } catch (e) {
        local = [];
      }
    }
    if (botData && botData.recentClosed) {
      botData.recentClosed.forEach((botTrade: any) => {
        const exists = local.some(t => t.id === botTrade.ID || t.id === `bot_${botTrade.ID}`);
        if (!exists) {
          let mappedResult = 'Loss';
          const rMult = botTrade.RMultiple !== undefined ? parseFloat(botTrade.RMultiple) : 0;
          if (rMult >= 3.0) mappedResult = 'Win-TP3';
          else if (rMult >= 1.2) mappedResult = 'Partial-TP2';
          else if (rMult > 0.0) mappedResult = 'Partial-TP1';
          else if (rMult === 0.0) mappedResult = 'Breakeven';
          else mappedResult = 'Loss';

          local.push({
            id: `bot_${botTrade.ID}`,
            dateTimeUtc: botTrade.ExitTimeUTC || botTrade.DateTimeUTC,
            pair: botTrade.Pair || 'BTC/USDT',
            killZone: botTrade.KillZone || 'Asian Range',
            direction: botTrade.Direction || 'Long',
            setupType: botTrade.SetupType === 'Type B' ? 'Type B' : 'Type A',
            rMultiple: rMult,
            result: mappedResult
          });
        }
      });
    }
    return local.sort((a, b) => new Date(b.dateTimeUtc).getTime() - new Date(a.dateTimeUtc).getTime());
  };

  const mergedTrades = getMergedTrades();

  // Compute stats
  const totalTradesCount = mergedTrades.length;
  const wins = mergedTrades.filter(t => t.rMultiple > 0 || (t.result && (t.result.includes('Win') || t.result.includes('Partial')))).length;
  const winRatePercent = totalTradesCount > 0 ? Math.round((wins / totalTradesCount) * 100) : 0;
  
  const totalR = mergedTrades.reduce((acc, t) => acc + (t.rMultiple || 0), 0);
  const avgRMultiple = totalTradesCount > 0 ? parseFloat((totalR / totalTradesCount).toFixed(2)) : 0.0;

  // Streak calculation
  let currentStreakVal = 0;
  const chronological = [...mergedTrades].reverse();
  if (chronological.length > 0) {
    const lastWin = chronological[chronological.length - 1].rMultiple > 0 || (chronological[chronological.length - 1].result && (chronological[chronological.length - 1].result.includes('Win') || chronological[chronological.length - 1].result.includes('Partial')));
    for (let i = chronological.length - 1; i >= 0; i--) {
      const isWin = chronological[i].rMultiple > 0 || (chronological[i].result && (chronological[i].result.includes('Win') || chronological[i].result.includes('Partial')));
      if (isWin === lastWin) {
        currentStreakVal++;
      } else {
        break;
      }
    }
    if (!lastWin) {
      currentStreakVal = -currentStreakVal; // negative indicates losing streak
    }
  }

  // Today's P&L (R multiple sum for current UTC day)
  const getTodaysPnL = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysTrades = mergedTrades.filter(t => t.dateTimeUtc && t.dateTimeUtc.startsWith(todayStr));
    const todaysR = todaysTrades.reduce((acc, t) => acc + (t.rMultiple || 0), 0);
    return todaysR;
  };
  const todaysPnL = getTodaysPnL();

  // Best Kill Zone calculation (by total R expectation)
  const getBestKillZone = () => {
    const kzStats: { [key: string]: { totalR: number; wins: number; total: number } } = {};
    mergedTrades.forEach(t => {
      if (!t.killZone) return;
      if (!kzStats[t.killZone]) {
        kzStats[t.killZone] = { totalR: 0, wins: 0, total: 0 };
      }
      kzStats[t.killZone].totalR += t.rMultiple || 0;
      const isWin = t.rMultiple > 0 || (t.result && (t.result.includes('Win') || t.result.includes('Partial')));
      if (isWin) kzStats[t.killZone].wins += 1;
      kzStats[t.killZone].total += 1;
    });
    let bestKz = 'N/A';
    let maxR = -Infinity;
    Object.entries(kzStats).forEach(([kz, stats]) => {
      if (stats.totalR > maxR && stats.totalR > 0) {
        maxR = stats.totalR;
        bestKz = kz;
      }
    });
    return bestKz;
  };
  const bestKz = getBestKillZone();

  return (
    <div className="space-y-4" id="im_dashboard_view">
      
      {/* 1. THE "VITALS" STATISTICS ROW - 6 small dense tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5" id="im_vitals_row">
        
        {/* Win Rate */}
        <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between" id="im_vital_win_rate">
          <span className="text-[10px] uppercase tracking-wider font-sans text-[#6B7280]">Win Rate</span>
          <div className="text-base font-bold font-mono text-[#16C784] mt-1">
            {winRatePercent}%
          </div>
          <span className="text-[9px] font-mono text-[#4B5563]">
            {wins}/{totalTradesCount} Wins
          </span>
        </div>

        {/* Total Trades */}
        <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between" id="im_vital_total_trades">
          <span className="text-[10px] uppercase tracking-wider font-sans text-[#6B7280]">Total Trades</span>
          <div className="text-base font-bold font-mono text-[#D7DCE5] mt-1">
            {totalTradesCount}
          </div>
          <span className="text-[9px] font-mono text-[#4B5563]">
            Active Ledger
          </span>
        </div>

        {/* Avg R */}
        <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between" id="im_vital_avg_r">
          <span className="text-[10px] uppercase tracking-wider font-sans text-[#6B7280]">Avg R-Multiple</span>
          <div className={`text-base font-bold font-mono mt-1 ${avgRMultiple >= 0 ? 'text-[#16C784]' : 'text-[#EA3943]'}`}>
            {avgRMultiple >= 0 ? '+' : ''}{avgRMultiple}R
          </div>
          <span className="text-[9px] font-mono text-[#4B5563]">
            Expectancy
          </span>
        </div>

        {/* Current Streak */}
        <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between" id="im_vital_streak">
          <span className="text-[10px] uppercase tracking-wider font-sans text-[#6B7280]">Streak</span>
          <div className={`text-base font-bold font-mono mt-1 ${currentStreakVal >= 0 ? 'text-[#16C784]' : 'text-[#EA3943]'}`}>
            {currentStreakVal > 0 ? `+${currentStreakVal}` : currentStreakVal}
          </div>
          <span className="text-[9px] font-mono text-[#4B5563]">
            {currentStreakVal >= 0 ? 'Winning' : 'Losing'}
          </span>
        </div>

        {/* Today's P&L */}
        <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between" id="im_vital_todays_pnl">
          <span className="text-[10px] uppercase tracking-wider font-sans text-[#6B7280]">Today's P&L</span>
          <div className={`text-base font-bold font-mono mt-1 ${todaysPnL >= 0 ? 'text-[#16C784]' : 'text-[#EA3943]'}`}>
            {todaysPnL >= 0 ? '+' : ''}{todaysPnL.toFixed(2)}R
          </div>
          <span className="text-[9px] font-mono text-[#4B5563]">
            Current Session
          </span>
        </div>

        {/* Best Kill Zone */}
        <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px] flex flex-col justify-between" id="im_vital_best_kz">
          <span className="text-[10px] uppercase tracking-wider font-sans text-[#6B7280]">Best Kill Zone</span>
          <div className="text-xs font-bold font-mono text-[#22D3EE] mt-1 truncate" title={bestKz}>
            {bestKz}
          </div>
          <span className="text-[9px] font-mono text-[#4B5563]">
            Highest Expectation
          </span>
        </div>

      </div>

      {/* 2. THE SIGNATURE KILL ZONE TIMELINE TICKER STRIP */}
      <div className="bg-[#12151B] border border-[#1F2430] p-3 rounded-[2px]" id="im_timeline_card">
        <div className="flex items-center justify-between border-b border-[#1F2430] pb-2 mb-2 text-[10px] font-mono tracking-wider text-[#6B7280]">
          <span className="flex items-center gap-1.5 font-sans font-bold uppercase text-[#D7DCE5]"><Clock className="w-3.5 h-3.5 text-[#22D3EE]" /> 24-HOUR INTRADAY LIQUIDITY TIMELINE</span>
          <div className="flex items-center gap-2">
            {marketStatus.type === 'WEEKEND' && (
              <span className="text-[#EA3943] font-bold">● WEEKEND PAUSE</span>
            )}
            {marketStatus.type === 'KILL_ZONE' && (
              <span className="text-[#22D3EE] font-bold animate-pulse">● {marketStatus.zoneName.toUpperCase()} ACTIVE</span>
            )}
            {marketStatus.type === 'DEAD_ZONE' && (
              <span className="text-[#6B7280]">● INACTIVE (DEAD ZONE)</span>
            )}
            <span className="text-[#22D3EE] bg-[#0A0C10] px-1.5 py-0.2 border border-[#1F2430] rounded-[2px]">{clocks.utcTimeOnly} UTC</span>
          </div>
        </div>

        {/* Technical Ticker Strip */}
        <div className="relative py-2 select-none" id="im_24h_timeline_container">
          <div className="relative h-5 bg-[#0A0C10] border border-[#1F2430] flex items-stretch">
            {/* 24 vertical segments, one for each hour */}
            {Array.from({ length: 24 }).map((_, h) => {
              let isKz = false;
              let isSilver = false;
              let name = '';
              if (h >= 0 && h < 4) { isKz = true; name = 'Asian Range'; }
              else if (h >= 7 && h < 10) { isKz = true; name = 'London KZ'; }
              else if (h >= 12 && h < 15) { isKz = true; name = 'New York KZ'; }
              else if (h === 15) { isKz = true; isSilver = true; name = 'Silver Bullet'; }

              const currentHourUTC = now.getUTCHours();
              const isActiveAndCurrent = marketStatus.type === 'KILL_ZONE' && marketStatus.zoneName === name && currentHourUTC === h;
              const isCurrentlyInHour = currentHourUTC === h;

              return (
                <div 
                  key={h} 
                  className={`flex-1 border-r border-[#1F2430]/30 last:border-r-0 relative flex flex-col justify-between items-center py-0.5
                    ${isActiveAndCurrent ? 'bg-[#22D3EE]/20 shadow-[inset_0_0_4px_rgba(34,211,238,0.4)]' : ''}
                    ${isCurrentlyInHour ? 'bg-[#22D3EE]/10' : ''}
                  `}
                  title={`Hour ${String(h).padStart(2, '0')}:00 UTC - ${name || 'Dead Zone'}`}
                >
                  {/* Top tick mark */}
                  <div className={`w-[1px] h-1.5 ${isCurrentlyInHour ? 'bg-[#22D3EE]' : isKz ? 'bg-amber-400/60' : 'bg-[#4B5563]'}`} />
                  
                  {/* Mid Zone color bar */}
                  <div className={`w-full h-1 mt-auto ${
                    isActiveAndCurrent 
                      ? 'bg-[#22D3EE] shadow-[0_0_8px_#22D3EE]' 
                      : isSilver
                        ? 'bg-amber-500/40'
                        : isKz 
                          ? 'bg-amber-400/20' 
                          : 'bg-transparent'
                  }`} />
                </div>
              );
            })}

            {/* Real-time slider line across the whole dayPercent */}
            <div 
              className="absolute top-0 bottom-0 w-[2px] bg-[#22D3EE] z-10 pointer-events-none"
              style={{ left: `${dayPercent}%` }}
            >
              <div className="absolute -top-[3px] -left-1 w-2.5 h-2.5 bg-[#22D3EE] border border-[#0A0C10] rotate-45" />
            </div>
          </div>

          {/* Hourly markers */}
          <div className="flex justify-between text-[9px] font-mono text-[#4B5563] mt-1.5 px-0.5">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* Timeline sub-panels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#1F2430] text-[11px] font-mono">
          {/* Current status countdown */}
          <div className="md:col-span-2 bg-[#0A0C10] p-2.5 border border-[#1F2430] rounded-[2px]">
            {marketStatus.type === 'WEEKEND' && (
              <div>
                <span className="text-[#6B7280] text-[9px] uppercase font-bold">Time Until Weekly Resumption</span>
                <span className="text-base font-bold text-amber-500 block mt-0.5 tracking-wider">
                  {formatDuration(marketStatus.countdownSecs)}
                </span>
                <p className="text-[#6B7280] mt-1 text-[10px] leading-relaxed font-sans">
                  Weekend freeze active. Capital preservation is priority. London session resumes Monday 07:00 UTC.
                </p>
              </div>
            )}

            {marketStatus.type === 'KILL_ZONE' && (
              <div>
                <span className="text-[#6B7280] text-[9px] uppercase font-bold">Time Left In Active Delivery Window</span>
                <span className="text-base font-bold text-[#22D3EE] block mt-0.5 tracking-wider">
                  {formatDuration(marketStatus.countdownSecs)}
                </span>
                <p className="text-[#6B7280] mt-1 text-[10px] leading-relaxed font-sans">
                  <strong className="text-[#22D3EE]">SMC EXECUTION PROTOCOL:</strong> Avoid entry during the first 20 minutes of any zone. Wait for manipulation sweeps to trap early session liquidity!
                </p>
              </div>
            )}

            {marketStatus.type === 'DEAD_ZONE' && (
              <div>
                <span className="text-[#6B7280] text-[9px] uppercase font-bold">Next Algorithmic Window ({marketStatus.nextZoneName})</span>
                <span className="text-base font-bold text-[#D7DCE5] block mt-0.5 tracking-wider">
                  {formatDuration(marketStatus.countdownSecs)}
                </span>
                <p className="text-[#6B7280] mt-1 text-[10px] leading-relaxed font-sans">
                  We are currently in a low-volume dead zone. Delivery algorithms are offline. Preserve capital and let setups mature.
                </p>
              </div>
            )}
          </div>

          {/* Quick timing reference */}
          <div className="bg-[#0A0C10] p-2.5 border border-[#1F2430] rounded-[2px] flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[#6B7280] text-[9px] uppercase font-bold block pb-1 border-b border-[#1F2430]/50">Timing Reference</span>
              <div className="grid grid-cols-2 text-[10px] gap-x-2 gap-y-1 text-[#6B7280]">
                <span>Asian Range:</span><span className="text-[#D7DCE5]">00:00 – 04:00</span>
                <span>London KZ:</span><span className="text-[#D7DCE5]">07:00 – 10:00</span>
                <span>New York KZ:</span><span className="text-[#D7DCE5]">12:00 – 15:00</span>
                <span>Silver Bullet:</span><span className="text-[#22D3EE] font-bold">15:00 – 16:00</span>
              </div>
            </div>
            <button
              onClick={() => onSetActiveTab('reference')}
              className="text-left text-[9px] text-[#22D3EE] hover:underline pt-1 mt-1 block uppercase tracking-wider font-mono font-bold"
            >
              Analyze logic maps &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* 3. LIVE BOT ACTIVITY */}
      <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] space-y-4" id="im_live_bot_activity_section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#1F2430] gap-2">
          <div className="space-y-0.5">
            <h2 className="text-xs font-bold font-mono text-[#D7DCE5] tracking-wider uppercase flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16C784] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#16C784]"></span>
              </span>
              Live Bot Activity Workspace
            </h2>
            <p className="text-[10px] text-[#6B7280]">
              Real-time paper trade execution stream driven by the SMC server agent.
            </p>
          </div>
          {botData?.stats && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#6B7280]">
              <span>WIN RATE: <strong className="text-[#16C784]">{botData.stats.winRate}%</strong></span>
              <span>|</span>
              <span>AVG R: <strong className="text-[#22D3EE]">+{botData.stats.avgR}R</strong></span>
            </div>
          )}
        </div>

        {/* Active Open Positions Table */}
        <div className="space-y-1.5">
          <h3 className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider flex items-center gap-1">
            <span>Active Positions Ledger</span>
            <span className="text-[9px] bg-[#22D3EE]/10 border border-[#22D3EE]/20 text-[#22D3EE] px-1.5 py-0.2 rounded-[2px]">
              {botData?.open?.length || 0} OPEN
            </span>
          </h3>

          {(!botData?.open || botData.open.length === 0) ? (
            <div className="py-4 px-3 bg-[#0A0C10]/40 border border-[#1F2430] text-center text-xs text-[#6B7280] font-mono">
              NO OPEN PAPER POSITIONS AT THIS INTERVAL
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1F2430] text-[10px] font-mono text-[#6B7280] bg-[#0A0C10]/50">
                    <th className="py-2 px-3">Pair</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Score</th>
                    <th className="py-2 px-3">Direction</th>
                    <th className="py-2 px-3">Entry</th>
                    <th className="py-2 px-3">Zone</th>
                    <th className="py-2 px-3">Kill Zone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2430]/50 text-xs">
                  {botData.open.map((trade: any) => {
                    const isExpanded = !!expandedRows[`bot_open_${trade.ID}`];
                    const isLong = trade.Direction === 'Long';
                    return (
                      <React.Fragment key={trade.ID}>
                        <tr 
                          onClick={() => toggleRow(`bot_open_${trade.ID}`)}
                          className="hover:bg-[#1F2430]/20 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-3 font-bold font-mono text-[#D7DCE5] flex items-center gap-1.5">
                            <span className="text-[#6B7280] text-[9px]">{isExpanded ? '▼' : '▶'}</span>
                            {trade.Pair}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#22D3EE]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE] animate-pulse"></span>
                              Open Pos
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono">{trade.Score || '—'}/6</td>
                          <td className="py-2.5 px-3">
                            <span className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span className={`w-1.5 h-1.5 rounded-full ${isLong ? 'bg-[#16C784]' : 'bg-[#EA3943]'}`}></span>
                              <span className={isLong ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                                {trade.Direction?.toUpperCase()}
                              </span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#D7DCE5]">
                            ${parseFloat(trade.Entry || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 font-mono uppercase text-[11px] text-[#6B7280]">
                            {trade.PriceZone || 'Neutral'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#6B7280]">
                            {trade.KillZone}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0 bg-[#0A0C10]/60">
                              <div className="px-3 py-2 border-t border-b border-[#1F2430] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-mono text-[#6B7280]">
                                <span className="text-[#4B5563] uppercase tracking-wider text-[10px] font-bold">Execution Targets:</span>
                                <span>SL: <strong className="text-[#EA3943]">${trade.StopLoss}</strong></span>
                                <span>
                                  TP1: <strong className={trade.TP1Hit ? 'text-[#16C784]' : 'text-[#D7DCE5]'}>${trade.TP1}</strong> 
                                  {trade.TP1Hit && <span className="text-[#16C784] ml-0.5">✓</span>}
                                </span>
                                <span>
                                  TP2: <strong className={trade.TP2Hit ? 'text-[#16C784]' : 'text-[#D7DCE5]'}>${trade.TP2}</strong> 
                                  {trade.TP2Hit && <span className="text-[#16C784] ml-0.5">✓</span>}
                                </span>
                                <span>
                                  TP3: <strong className="text-[#22D3EE]">${trade.TP3}</strong>
                                </span>
                                <span className="text-[10px] text-[#6B7280] ml-auto">
                                  RISK SIZE: <strong className="text-[#D7DCE5]">{trade.RiskPercent}%</strong>
                                </span>
                                <span className="text-amber-400 font-semibold text-[10px]">
                                  {getHoursOpen(trade.DateTimeUTC)}H ELAPSED
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Closed Positions Ledger */}
        {botData?.recentClosed && botData.recentClosed.length > 0 && (
          <div className="pt-2 border-t border-[#1F2430]/60 space-y-2">
            <h3 className="text-[10px] font-bold font-mono text-[#6B7280] uppercase tracking-wider">
              Recent Closed Ledger Records
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-1.5">
              {botData.recentClosed.slice(0, 5).map((trade: any) => {
                const isProfit = trade.RMultiple > 0;
                const isLoss = trade.RMultiple < 0;
                const closedTime = trade.ExitTimeUTC || trade.DateTimeUTC;
                return (
                  <div 
                    key={trade.ID} 
                    className="bg-[#0A0C10]/60 border border-[#1F2430] p-2 flex flex-col justify-between rounded-[2px]"
                    id={`im_bot_closed_${trade.ID}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-xs text-[#D7DCE5]">{trade.Pair}</span>
                      <span className={`text-[10.5px] font-mono font-bold
                        ${isProfit ? 'text-[#16C784]' : isLoss ? 'text-[#EA3943]' : 'text-[#6B7280]'}`}
                      >
                        {trade.RMultiple > 0 ? '+' : ''}{trade.RMultiple}R
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-[#6B7280] font-mono mt-1 pt-1 border-t border-[#1F2430]/30">
                      <span className="truncate max-w-[65px]" title={trade.ExitReason}>{trade.ExitReason || 'Closed'}</span>
                      <span>{timeAgo(closedTime)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. LIVE SETUP STATUS */}
      <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px]" id="im_live_setup_section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#1F2430] gap-2 mb-3">
          <div className="space-y-0.5">
            <h2 className="text-xs font-bold font-mono text-[#D7DCE5] tracking-wider uppercase flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#22D3EE]" /> Algorithmic Live Setup Status
            </h2>
            <p className="text-[10px] text-[#6B7280]">
              Real-time multi-pair sweep checklists and higher-timeframe alignment matrices.
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[9px] font-mono text-[#22D3EE] bg-[#0A0C10] border border-[#1F2430] px-2 py-0.5 rounded-[2px] font-semibold">
              SCAN CYCLE: 45S INTERVAL
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1F2430] text-[10px] font-mono text-[#6B7280] bg-[#0A0C10]/50">
                <th className="py-2 px-3">Pair</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Score</th>
                <th className="py-2 px-3">Direction</th>
                <th className="py-2 px-3">Entry</th>
                <th className="py-2 px-3">Zone</th>
                <th className="py-2 px-3">Kill Zone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2430]/50 text-xs">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((p) => {
                const evalItem = botData?.evaluations?.[p];
                const isExpanded = !!expandedRows[`setup_${p}`];
                
                const formatPairName = (raw: string) => {
                  if (raw.endsWith('USDT')) {
                    return `${raw.slice(0, raw.length - 4)}/USDT`;
                  }
                  return raw;
                };

                if (!evalItem) {
                  return (
                    <tr key={p} className="hover:bg-[#1F2430]/10">
                      <td className="py-2.5 px-3 font-bold font-mono text-[#D7DCE5]">{formatPairName(p)}</td>
                      <td className="py-2.5 px-3 col-span-6 text-[#6B7280] font-mono animate-pulse" colSpan={6}>Scanning matrix...</td>
                    </tr>
                  );
                }

                const {
                  skip,
                  score = 0,
                  direction,
                  entry,
                  price,
                  zone,
                  killZoneName,
                  checklist,
                  reason
                } = evalItem;

                return (
                  <React.Fragment key={p}>
                    <tr 
                      onClick={() => toggleRow(`setup_${p}`)}
                      className="hover:bg-[#1F2430]/20 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold font-mono text-[#D7DCE5] flex items-center gap-1.5">
                        <span className="text-[#6B7280] text-[9px]">{isExpanded ? '▼' : '▶'}</span>
                        {formatPairName(p)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full ${skip ? 'bg-[#6B7280]' : 'bg-[#16C784] animate-pulse'}`}></span>
                          {skip ? 'Watching' : 'Ready'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{score}/6</td>
                      <td className="py-2.5 px-3">
                        {direction ? (
                          <span className="flex items-center gap-1.5 font-mono text-[11px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${direction === 'long' ? 'bg-[#16C784]' : 'bg-[#EA3943]'}`}></span>
                            <span className={direction === 'long' ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                              {direction === 'long' ? 'LONG' : 'SHORT'}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[#6B7280]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#D7DCE5]">
                        {entry ? `$${entry.toLocaleString()}` : price ? `$${price.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono uppercase text-[11px]">
                        <span className={
                          zone === 'discount' ? 'text-[#16C784]' : zone === 'premium' ? 'text-[#EA3943]' : 'text-[#6B7280]'
                        }>
                          {zone || 'Neutral'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#6B7280]">
                        {killZoneName || 'Dead Zone'}
                      </td>
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="p-0 bg-[#0A0C10]/60">
                          <div className="px-3 py-2 border-t border-b border-[#1F2430] flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] font-mono text-[#6B7280]">
                            <span className="text-[#4B5563] uppercase tracking-wider text-[10px] font-bold">6-Point Checklist Matrix:</span>
                            <span className="flex items-center gap-1">
                              <span className={checklist?.htfAligned ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                                {checklist?.htfAligned ? '✓' : '✗'}
                              </span>
                              HTF Aligned
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={checklist?.inKillZone ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                                {checklist?.inKillZone ? '✓' : '✗'}
                              </span>
                              In Kill Zone
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={checklist?.correctZone ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                                {checklist?.correctZone ? '✓' : '✗'}
                              </span>
                              Correct Zone
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={checklist?.sweepConfirmed ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                                {checklist?.sweepConfirmed ? '✓' : '✗'}
                              </span>
                              Sweep Confirmed
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={checklist?.mssConfirmed ? 'text-[#16C784]' : 'text-[#EA3943]'}>
                                {checklist?.mssConfirmed ? '✓' : '✗'}
                              </span>
                              MSS Confirmed
                            </span>
                            <span className="flex items-center gap-1">
                              <span className={checklist?.cleanRunway === true ? 'text-[#16C784]' : checklist?.cleanRunway === false ? 'text-[#EA3943]' : 'text-[#4B5563]'}>
                                {checklist?.cleanRunway === true ? '✓' : checklist?.cleanRunway === false ? '✗' : '—'}
                              </span>
                              Clean Runway
                            </span>
                            <span className="flex items-center gap-1 border-l border-[#1F2430] pl-4 font-bold">
                              {evalItem.newsOk === undefined ? (
                                <span className="text-[#6B7280]">Checking news...</span>
                              ) : evalItem.newsOk ? (
                                <span className="text-[#16C784]">✅ News Clear</span>
                              ) : (
                                <span className="text-[#EA3943]">🔴 News: {evalItem.newsBlock?.event} in {evalItem.newsBlock?.minutesAway} min</span>
                              )}
                            </span>
                            {reason && (
                              <span className="text-[#EA3943] ml-auto truncate max-w-[250px] text-[10px]" title={reason}>
                                BLOCKER: {reason}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Footnote */}
        <div className="mt-3.5 text-[10px] font-mono text-[#6B7280] leading-normal border-t border-[#1F2430]/40 pt-2.5 flex items-start gap-1.5">
          <span className="text-[#22D3EE] font-bold shrink-0">* NOTE:</span>
          <span>Previous Week/Month High-Low checks aren't automated yet — factor those in yourself if you want extra confluence.</span>
        </div>

      </div>
    </div>
  );
}
