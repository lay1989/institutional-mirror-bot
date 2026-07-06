import React, { useState, useEffect } from 'react';
import { getClocks, getMarketStatus, formatDuration, MarketStatus } from '../utils';
import { Shield, Clock, CheckCircle, AlertTriangle, Moon, Sunrise, Sunset, Flame, Activity } from 'lucide-react';

interface DashboardTabProps {
  onSetActiveTab: (tab: string) => void;
  syncToSheets?: (action: string, payload: any) => void;
  botData?: any;
}

export default function DashboardTab({ onSetActiveTab, syncToSheets, botData }: DashboardTabProps) {
  const [now, setNow] = useState(new Date());
  const [prepChecked, setPrepChecked] = useState<boolean[]>(Array(8).fill(false));

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

  // Update clock and perform auto-reset logic every second
  useEffect(() => {
    const timer = setInterval(() => {
      const currentDate = new Date();
      setNow(currentDate);

      // Perform UTC date check for Daily Prep Checklist auto-reset
      const todayUtcStr = getUtcDateString(currentDate);
      const storedDate = localStorage.getItem('im_daily_prep_date');
      
      if (storedDate !== todayUtcStr) {
        const freshChecks = Array(8).fill(false);
        setPrepChecked(freshChecks);
        localStorage.setItem('im_daily_prep_date', todayUtcStr);
        localStorage.setItem('im_daily_prep_checked', JSON.stringify(freshChecks));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Load daily prep checklist on mount
  useEffect(() => {
    const storedChecks = localStorage.getItem('im_daily_prep_checked');
    const storedDate = localStorage.getItem('im_daily_prep_date');
    const todayUtcStr = getUtcDateString(now);

    if (storedDate === todayUtcStr && storedChecks) {
      try {
        setPrepChecked(JSON.parse(storedChecks));
      } catch (e) {
        // Fallback
        setPrepChecked(Array(8).fill(false));
      }
    } else {
      setPrepChecked(Array(8).fill(false));
      localStorage.setItem('im_daily_prep_date', todayUtcStr);
      localStorage.setItem('im_daily_prep_checked', JSON.stringify(Array(8).fill(false)));
    }
  }, []);

  // Sync state between tabs (if user updates checklist in multiple tabs/views)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'im_daily_prep_checked' && e.newValue) {
        try {
          setPrepChecked(JSON.parse(e.newValue));
        } catch (_) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getUtcDateString = (date: Date): string => {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };

  const handleToggleCheck = (index: number) => {
    const updated = [...prepChecked];
    updated[index] = !updated[index];
    setPrepChecked(updated);
    localStorage.setItem('im_daily_prep_checked', JSON.stringify(updated));
    if (syncToSheets) {
      const todayUtcStr = getUtcDateString(now);
      syncToSheets('saveDailyPrep', {
        date: todayUtcStr,
        checkboxes: updated
      });
    }
  };

  const clocks = getClocks(now);
  const marketStatus = getMarketStatus(now);
  const isMonday = now.getUTCDay() === 1;

  // Calculate percentage of day completed in UTC
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();
  const seconds = now.getUTCSeconds();
  const totalSecondsInDay = 86400;
  const currentSeconds = hours * 3600 + minutes * 60 + seconds;
  const dayPercent = (currentSeconds / totalSecondsInDay) * 100;

  // Checkbox labels and descriptions
  const checklistItems = [
    { title: 'Checked Weekly Chart', desc: 'Identify High-Timeframe (HTF) market structure bias.' },
    { title: 'Checked Daily Chart', desc: 'Mark Previous Daily High (PDH) and Previous Daily Low (PDL).' },
    { 
      title: 'Marked PWH/PWL (Previous Week High/Low)', 
      desc: 'Map key weekly liquidity pools. Essential for Monday sweeps.',
      highlightMonday: true 
    },
    { title: '4H EMA 20/50 Confirms Trend', desc: 'Ensure moving averages are clearly spread, not flat or tangled.' },
    { title: 'Marked Equal Highs/Lows on 1H', desc: 'Identify Draw on Liquidity (DoL) targets for the day.' },
    { title: 'Identified Premium/Discount Zone', desc: 'Define equilibrium (50%) of the recent swing to avoid buying high.' },
    { title: 'Checked News Calendar', desc: 'Identify high-impact red folder events during active Kill Zones.' },
    { title: 'Checked Funding Rate', desc: 'Verify perp rates are neutral (acceptable range: -0.1% to +0.1%).' }
  ];

  const checkedCount = prepChecked.filter(Boolean).length;
  const progressPercent = (checkedCount / 8) * 100;

  // Timeline segments in percentage widths
  const segments = [
    { name: 'Asian Range', start: '00:00', end: '04:00', width: (4 / 24) * 100, isKillZone: true, color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400', icon: <Moon className="w-3 h-3 text-emerald-400" /> },
    { name: 'Dead Zone', start: '04:00', end: '07:00', width: (3 / 24) * 100, isKillZone: false, color: 'bg-zinc-800/30 border-zinc-700/30 text-zinc-500', icon: null },
    { name: 'London KZ', start: '07:00', end: '10:00', width: (3 / 24) * 100, isKillZone: true, color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400', icon: <Sunrise className="w-3 h-3 text-emerald-400" /> },
    { name: 'Dead Zone', start: '10:00', end: '12:00', width: (2 / 24) * 100, isKillZone: false, color: 'bg-zinc-800/30 border-zinc-700/30 text-zinc-500', icon: null },
    { name: 'New York KZ', start: '12:00', end: '15:00', width: (3 / 24) * 100, isKillZone: true, color: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400', icon: <Sunset className="w-3 h-3 text-emerald-400" /> },
    { name: 'Silver Bullet', start: '15:00', end: '16:00', width: (1 / 24) * 100, isKillZone: true, color: 'bg-emerald-400/35 border-emerald-400/50 text-emerald-300', icon: <Flame className="w-3 h-3 text-emerald-300" /> },
    { name: 'Dead Zone', start: '16:00', end: '24:00', width: (8 / 24) * 100, isKillZone: false, color: 'bg-zinc-800/30 border-zinc-700/30 text-zinc-500', icon: null },
  ];

  return (
    <div className="space-y-6" id="im_dashboard_view">
      {/* SECTION A: Live Clocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* UTC Clock */}
        <div className="bg-[#161b22] border border-zinc-800/80 p-5 rounded-lg shadow-xl flex items-center space-x-4 relative overflow-hidden" id="im_utc_clock_card">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-md text-emerald-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-mono tracking-widest text-zinc-500 uppercase">UTC Primary Reference</div>
            <div className="text-2xl font-bold font-mono tracking-wider text-[#00ff88]" id="im_utc_time_display">
              {clocks.utcTimeOnly}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">{clocks.utc.split(',')[1]?.trim()}</div>
          </div>
        </div>

        {/* EST / EDT Clock */}
        <div className="bg-[#161b22] border border-zinc-800/80 p-5 rounded-lg shadow-xl flex items-center space-x-4 relative overflow-hidden" id="im_est_clock_card">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl pointer-events-none"></div>
          <div className="p-3 bg-sky-500/10 border border-sky-500/25 rounded-md text-sky-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
              US Eastern Time ({clocks.isEdt ? 'EDT' : 'EST'})
            </div>
            <div className="text-2xl font-bold font-mono tracking-wider text-sky-400" id="im_est_time_display">
              {clocks.estTimeOnly}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">{clocks.est.split(',')[1]?.trim() || clocks.est}</div>
          </div>
        </div>
      </div>

      {/* SECTION: Live Bot Activity */}
      {botData && (
        <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl space-y-4" id="im_live_bot_activity_section">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
            <div>
              <h2 className="text-sm font-mono uppercase tracking-widest text-[#00ff88] flex items-center gap-1.5 font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Bot Activity
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Real-time paper trade execution stream driven by the SMC server agent.
              </p>
            </div>
            {botData.stats && (
              <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">Win Rate: <strong className="text-[#00ff88] font-bold">{botData.stats.winRate}%</strong></span>
                <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">Avg R: <strong className="text-sky-400 font-bold">+{botData.stats.avgR}R</strong></span>
              </div>
            )}
          </div>

          {/* Open Trades */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <span>Active Position Workspace</span>
              <span className="text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-[#00ff88] px-1.5 py-0.2 rounded font-normal">
                {botData.open && botData.open.length ? botData.open.length : 0} open
              </span>
            </h3>

            {(!botData.open || botData.open.length === 0) ? (
              <div className="py-6 px-4 bg-[#0d1117]/60 border border-zinc-850 rounded-lg text-center text-xs text-zinc-500">
                No open paper trades right now. The bot checks every 5-15 minutes during Kill Zones.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {botData.open.map((trade: any) => {
                  const hoursOpen = getHoursOpen(trade.DateTimeUTC);
                  const isLong = trade.Direction === 'Long';
                  return (
                    <div 
                      key={trade.ID} 
                      className="bg-[#0d1117] border border-zinc-850 rounded-lg p-4 space-y-3 relative hover:border-zinc-800 transition-all flex flex-col justify-between"
                      id={`im_bot_open_${trade.ID}`}
                    >
                      <div>
                        {/* Pair & Direction */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-sm text-[#e6edf3]">{trade.Pair}</span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase font-mono tracking-wider
                            ${isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}
                          >
                            {trade.Direction}
                          </span>
                        </div>

                        {/* Setup details */}
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-1.5">
                          <span className="bg-zinc-900 border border-zinc-850 px-1.5 py-0.5 rounded">{trade.KillZone}</span>
                          <span className="bg-zinc-900 border border-zinc-850 px-1.5 py-0.5 rounded">{trade.SetupType}</span>
                          <span className="bg-zinc-900 border border-zinc-850 px-1.5 py-0.5 rounded">Score: {trade.Score}/6</span>
                        </div>

                        {/* AMD Bias and Price Zone */}
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono mt-1">
                          <span>Bias: <strong className="text-zinc-300">{trade.AMDBias || 'N/A'}</strong></span>
                          <span>•</span>
                          <span>Zone: <strong className="text-zinc-300">{trade.PriceZone || 'N/A'}</strong></span>
                        </div>

                        {/* Entry / SL / TP details */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2.5 mt-2.5 border-t border-zinc-850 text-xs">
                          <div className="font-mono">
                            <span className="text-zinc-500 text-[10px] block uppercase">Entry Price</span>
                            <span className="text-zinc-200 font-semibold">${trade.Entry}</span>
                          </div>
                          <div className="font-mono">
                            <span className="text-zinc-500 text-[10px] block uppercase">Stop Loss</span>
                            <span className="text-rose-400 font-semibold">${trade.StopLoss}</span>
                          </div>
                          <div className="col-span-2 grid grid-cols-3 gap-2 mt-1">
                            <div className="font-mono bg-zinc-900/60 p-1 rounded border border-zinc-850/50">
                              <span className="text-zinc-500 text-[9px] block uppercase leading-none">TP1</span>
                              <span className="text-zinc-300 font-semibold text-[11px]">${trade.TP1}</span>
                            </div>
                            <div className="font-mono bg-zinc-900/60 p-1 rounded border border-zinc-850/50">
                              <span className="text-zinc-500 text-[9px] block uppercase leading-none">TP2</span>
                              <span className="text-zinc-300 font-semibold text-[11px]">${trade.TP2}</span>
                            </div>
                            <div className="font-mono bg-zinc-900/60 p-1 rounded border border-zinc-850/50">
                              <span className="text-zinc-500 text-[9px] block uppercase leading-none">TP3</span>
                              <span className="text-[#00ff88] font-semibold text-[11px]">${trade.TP3}</span>
                            </div>
                          </div>
                        </div>

                        {/* TP Hits indicator */}
                        <div className="flex items-center gap-1.5 text-[10px] font-mono mt-2.5">
                          <span className="text-zinc-500 uppercase text-[9px]">TP Hits:</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] ${trade.TP1Hit ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold' : 'bg-zinc-900 border-zinc-850 text-zinc-500'}`}>TP1</span>
                          <span className={`px-1.5 py-0.5 rounded border text-[9px] ${trade.TP2Hit ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-bold' : 'bg-zinc-900 border-zinc-850 text-zinc-500'}`}>TP2</span>
                        </div>
                      </div>

                      {/* Footer time indicator */}
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500 mt-3 pt-2 border-t border-zinc-850/50">
                        <span>Risk size: {trade.RiskPercent}%</span>
                        <span className="text-sky-400/90">{hoursOpen} hours open</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Closed */}
          {botData.recentClosed && botData.recentClosed.length > 0 && (
            <div className="pt-4 border-t border-zinc-800">
              <h3 className="text-xs font-semibold text-zinc-300 mb-2.5">Recent Closed Paper Trades (Past 5)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {botData.recentClosed.slice(0, 5).map((trade: any) => {
                  const isProfit = trade.RMultiple > 0;
                  const isLoss = trade.RMultiple < 0;
                  const closedTime = trade.ExitTimeUTC || trade.DateTimeUTC;
                  return (
                    <div 
                      key={trade.ID} 
                      className="bg-[#0d1117] border border-zinc-850 rounded p-3 space-y-1.5 hover:border-zinc-800 transition-all flex flex-col justify-between"
                      id={`im_bot_closed_${trade.ID}`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-xs text-zinc-200">{trade.Pair}</span>
                        <span className={`text-[10px] font-mono font-bold px-1 py-0.2 rounded
                          ${isProfit ? 'bg-emerald-500/10 text-emerald-400' : isLoss ? 'bg-rose-500/10 text-rose-400' : 'bg-zinc-800 text-zinc-400'}`}
                        >
                          {trade.RMultiple > 0 ? '+' : ''}{trade.RMultiple}R
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                        <span className="truncate max-w-[70px]">{trade.ExitReason || 'Closed'}</span>
                        <span>{timeAgo(closedTime)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION B: Kill Zone Status Panel */}
      <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl relative overflow-hidden" id="im_kill_zone_panel">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3] tracking-tight flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" /> Algorithmic Timing & Kill Zones
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Intraday order delivery operates strictly within central bank liquidity windows.
            </p>
          </div>
          <div>
            {marketStatus.type === 'WEEKEND' && (
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 text-[#ffd700] rounded-full text-xs font-mono animate-pulse" id="im_status_badge_weekend">
                <span className="w-2 h-2 rounded-full bg-[#ffd700]"></span>
                <span className="font-bold">WEEKEND — No Trading</span>
              </div>
            )}
            {marketStatus.type === 'KILL_ZONE' && (
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-[#00ff88] rounded-full text-xs font-mono animate-soft-pulse" id="im_status_badge_kz">
                <span className="w-2 h-2 rounded-full bg-[#00ff88]"></span>
                <span className="font-bold">{marketStatus.zoneName} ACTIVE</span>
              </div>
            )}
            {marketStatus.type === 'DEAD_ZONE' && (
              <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-full text-xs font-mono" id="im_status_badge_dead">
                <span className="w-2 h-2 rounded-full bg-zinc-500"></span>
                <span className="font-bold">DEAD ZONE</span>
              </div>
            )}
          </div>
        </div>

        {/* Detailed Counter / Warnings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-5">
          <div className="md:col-span-2 space-y-3">
            {marketStatus.type === 'WEEKEND' && (
              <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-4">
                <div className="text-xs text-zinc-400 font-mono">COUNTDOWN TO MARKET OPEN</div>
                <div className="text-4xl font-mono font-bold text-[#ffd700] mt-1 tracking-wider">
                  {formatDuration(marketStatus.countdownSecs)}
                </div>
                <div className="text-xs text-zinc-500 mt-2">
                  Weekend freeze active. Monday liquidity resumes officially on 07:00 UTC (London Open). Avoid early low-volume volatility.
                </div>
              </div>
            )}

            {marketStatus.type === 'KILL_ZONE' && (
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-4">
                <div className="text-xs text-zinc-400 font-mono uppercase">Time Remaining in {marketStatus.zoneName}</div>
                <div className="text-4xl font-mono font-bold text-[#00ff88] mt-1 tracking-wider">
                  {formatDuration(marketStatus.countdownSecs)}
                </div>
                <div className="mt-3 flex items-start space-x-2 text-xs text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                  <span>
                    <strong className="font-bold">SMC RULE:</strong> Wait 20 minutes after zone open before entering. Let the initial manipulation sweep clear out early liquidity pools first!
                  </span>
                </div>
              </div>
            )}

            {marketStatus.type === 'DEAD_ZONE' && (
              <div className="bg-zinc-800/10 border border-zinc-800 rounded-lg p-4">
                <div className="text-xs text-zinc-500 font-mono uppercase">Countdown to Next Session ({marketStatus.nextZoneName})</div>
                <div className="text-4xl font-mono font-bold text-zinc-300 mt-1 tracking-wider">
                  {formatDuration(marketStatus.countdownSecs)}
                </div>
                <div className="text-xs text-zinc-500 mt-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full"></span>
                  Currently in high-risk dead zone. Algorithmic delivery is paused. Preserve capital; do not force trades.
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#0d1117]/80 rounded-lg p-4 border border-zinc-800/50 space-y-3">
            <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-widest border-b border-zinc-800 pb-1.5">Today's Sessions (UTC)</h3>
            <ul className="space-y-2 text-xs">
              <li className="flex justify-between items-center py-0.5">
                <span className="text-zinc-400">Asian Range:</span>
                <span className="font-mono text-emerald-400">00:00 – 04:00</span>
              </li>
              <li className="flex justify-between items-center py-0.5">
                <span className="text-zinc-400">London KZ:</span>
                <span className="font-mono text-emerald-400">07:00 – 10:00</span>
              </li>
              <li className="flex justify-between items-center py-0.5">
                <span className="text-zinc-400">New York KZ:</span>
                <span className="font-mono text-emerald-400">12:00 – 15:00</span>
              </li>
              <li className="flex justify-between items-center py-0.5">
                <span className="text-zinc-400">Silver Bullet:</span>
                <span className="font-mono text-[#00ff88]">15:00 – 16:00</span>
              </li>
            </ul>
            <button
              onClick={() => onSetActiveTab('reference')}
              className="w-full text-center text-[11px] text-sky-400 hover:text-sky-300 transition-colors pt-1 block font-medium"
            >
              Learn algorithmic delivery math →
            </button>
          </div>
        </div>
      </div>

      {/* SECTION C: 24-Hour Timeline Bar */}
      <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl" id="im_timeline_card">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#e6edf3] tracking-tight">24-Hour Intraday Timeline (UTC)</h3>
            <p className="text-xs text-zinc-400">Live visual representation of the current UTC trading day.</p>
          </div>
          <div className="text-xs font-mono text-emerald-400">
            Current: {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')} UTC
          </div>
        </div>

        {/* Timeline container */}
        <div className="relative mt-2 pt-1 pb-6" id="im_24h_timeline_container">
          {/* Main 24h Bar */}
          <div className="h-6 w-full rounded-md overflow-hidden flex border border-zinc-800 relative bg-[#0d1117]">
            {segments.map((seg, idx) => (
              <div
                key={idx}
                className={`h-full border-r last:border-r-0 border-zinc-900/50 flex flex-col justify-center items-center relative transition-all`}
                style={{ width: `${seg.width}%` }}
                title={`${seg.name} (${seg.start} - ${seg.end})`}
              >
                <div className={`w-full h-full ${seg.isKillZone ? 'bg-emerald-500/15' : 'bg-zinc-900/40'} hover:bg-opacity-80 transition-colors`}></div>
              </div>
            ))}

            {/* Current time marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#00ff88] z-10 shadow-[0_0_8px_#00ff88]"
              style={{ left: `${dayPercent}%` }}
              id="im_timeline_current_marker"
            >
              <div className="absolute -top-1.5 -left-1 w-2.5 h-2.5 bg-[#00ff88] rounded-full border border-zinc-900 shadow"></div>
            </div>
          </div>

          {/* Labels under segments */}
          <div className="flex w-full mt-2 text-[10px] select-none relative h-8 overflow-x-auto">
            {segments.map((seg, idx) => (
              <div
                key={idx}
                className="flex flex-col items-center justify-start text-center shrink-0"
                style={{ width: `${seg.width}%`, minWidth: '45px' }}
              >
                <div className="font-mono text-zinc-500 font-semibold">{seg.start}</div>
                <div className={`mt-0.5 font-sans truncate px-0.5 text-center leading-tight ${seg.isKillZone ? 'text-emerald-400 font-semibold' : 'text-zinc-600'}`}>
                  {seg.name.replace(' KZ', '')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION D: Daily Prep Checklist */}
      <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl" id="im_daily_prep_card">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-zinc-800 gap-2 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-[#e6edf3] tracking-tight flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-sky-400" /> Daily Pre-Market Checklist
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              These discipline gates auto-reset daily at 00:00 UTC. Never enter a trade without clearing them.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-zinc-400">Daily Progress:</span>
            <span className="text-sm font-mono font-bold text-sky-400 ml-1">{checkedCount} / 8 Completed</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-[#0d1117] h-2 rounded-full overflow-hidden border border-zinc-800 mb-6">
          <div 
            className="h-full bg-gradient-to-r from-sky-500 to-[#00ff88] transition-all duration-500" 
            style={{ width: `${progressPercent}%` }}
            id="im_daily_prep_progress"
          ></div>
        </div>

        {/* Checklist Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="im_prep_checklist_grid">
          {checklistItems.map((item, idx) => {
            const isHighlighted = item.highlightMonday && isMonday;
            return (
              <div
                key={idx}
                onClick={() => handleToggleCheck(idx)}
                className={`p-3.5 rounded-lg border transition-all cursor-pointer select-none flex items-start space-x-3 
                  ${prepChecked[idx] 
                    ? 'bg-emerald-500/5 border-emerald-500/30' 
                    : isHighlighted 
                      ? 'bg-yellow-500/5 border-[#ffd700] hover:bg-yellow-500/10' 
                      : 'bg-[#0d1117]/60 border-zinc-800 hover:bg-[#161b22]'
                  }`}
                id={`im_prep_item_${idx}`}
              >
                <div className="mt-0.5 shrink-0">
                  <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all
                    ${prepChecked[idx]
                      ? 'bg-emerald-500 border-emerald-400 text-zinc-950'
                      : isHighlighted
                        ? 'border-[#ffd700] bg-zinc-900'
                        : 'border-zinc-700 bg-zinc-900'
                    }`}
                  >
                    {prepChecked[idx] && (
                      <svg className="w-3.5 h-3.5 stroke-[3] text-zinc-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className={`text-xs font-semibold tracking-wide transition-colors
                    ${prepChecked[idx] 
                      ? 'text-emerald-400 line-through' 
                      : isHighlighted 
                        ? 'text-[#ffd700]' 
                        : 'text-[#e6edf3]'
                    }`}
                  >
                    {item.title} {isHighlighted && <span className="text-[10px] bg-yellow-500/20 px-1.5 py-0.5 rounded text-[#ffd700] font-mono ml-1">MONDAY DUTY</span>}
                  </div>
                  <div className={`text-[11px] leading-relaxed ${prepChecked[idx] ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {item.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
