import React, { useState, useEffect } from 'react';
import { Shield, Check, Flame, AlertOctagon, RefreshCw, Clipboard } from 'lucide-react';

interface ChecklistTabProps {
  onSetActiveTab: (tab: string) => void;
  onSetPrefilledSetup: (setup: any) => void;
  botData?: any;
}

export default function ChecklistTab({ onSetActiveTab, onSetPrefilledSetup, botData }: ChecklistTabProps) {
  const [expandedRows, setExpandedRows] = useState<{ [key: string]: boolean }>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Confluence Scorecard (6 elements)
  const [confluences, setConfluences] = useState<boolean[]>(() => {
    const val = localStorage.getItem('im_checklist_confluences');
    return val ? JSON.parse(val) : Array(6).fill(false);
  });

  const [setupType, setSetupType] = useState<'Type A' | 'Type B'>(() => {
    const val = localStorage.getItem('im_checklist_setup_type');
    return (val === 'Type A' || val === 'Type B') ? val : 'Type A';
  });

  // AMD Bias (stored in sessionStorage)
  const [amdBias, setAmdBias] = useState<'BEARISH' | 'BULLISH' | null>(() => {
    const val = sessionStorage.getItem('im_amd_bias');
    return (val === 'BEARISH' || val === 'BULLISH') ? val : null;
  });

  // Pre-execution safety (5 checklists)
  const [safetyChecks, setSafetyChecks] = useState<boolean[]>(() => {
    const val = localStorage.getItem('im_checklist_safety');
    return val ? JSON.parse(val) : Array(5).fill(false);
  });

  // Sync state to localStorage on changes
  useEffect(() => {
    localStorage.setItem('im_checklist_confluences', JSON.stringify(confluences));
  }, [confluences]);

  useEffect(() => {
    localStorage.setItem('im_checklist_setup_type', setupType);
  }, [setupType]);

  useEffect(() => {
    if (amdBias) {
      sessionStorage.setItem('im_amd_bias', amdBias);
    } else {
      sessionStorage.removeItem('im_amd_bias');
    }
  }, [amdBias]);

  useEffect(() => {
    localStorage.setItem('im_checklist_safety', JSON.stringify(safetyChecks));
  }, [safetyChecks]);

  const score = confluences.filter(Boolean).length;

  const handleToggleConfluence = (index: number) => {
    const updated = [...confluences];
    updated[index] = !updated[index];
    setConfluences(updated);
  };

  const handleToggleSafety = (index: number) => {
    const updated = [...safetyChecks];
    updated[index] = !updated[index];
    setSafetyChecks(updated);
  };

  const handleResetScorecard = () => {
    const cleared = Array(6).fill(false);
    setConfluences(cleared);
  };

  // Determine dynamic score metadata
  const getScoreInfo = () => {
    if (score === 6) {
      return {
        label: 'PRIME SETUP — ENTER',
        colorClass: 'text-[#16C784]',
        borderClass: 'border-[#16C784]/30 bg-[#16C784]/[0.02]',
        desc: 'Fully aligned institutional footprint. Statistically high win expectancy setup.'
      };
    } else if (score === 5) {
      return {
        label: 'HIGH QUALITY — Type A only',
        colorClass: 'text-[#22D3EE]',
        borderClass: 'border-[#1F2430] bg-[#12151B]',
        desc: 'Strong confluence. Suitable for trend-following Type A executions.'
      };
    } else if (score === 4) {
      return {
        label: 'BORDERLINE — extreme caution only',
        colorClass: 'text-amber-500',
        borderClass: 'border-amber-500/10 bg-amber-500/[0.01]',
        desc: 'Lower probability. Keep leverage reduced if forcing entry.'
      };
    } else {
      return {
        label: 'DO NOT ENTER',
        colorClass: 'text-[#EA3943]',
        borderClass: 'border-[#EA3943]/20 bg-[#EA3943]/[0.01]',
        desc: 'Negative Expected Value (EV). Re-read rulebook and close charts.'
      };
    }
  };

  const scoreInfo = getScoreInfo();

  // Type B validation: "Type B requires 6/6 — SKIP"
  const isTypeBViolation = setupType === 'Type B' && score < 6;

  // Confluence descriptions with copy pass
  const confluenceCards = [
    {
      title: 'HTF Bias Aligned',
      caption: 'Multiple timeframes agree on trade direction.',
      desc: 'Weekly + Daily + 4H same direction. EMA 20 above 50 for longs, below for shorts.'
    },
    {
      title: 'Inside Kill Zone (20+ min)',
      caption: 'Price is trading within a high-probability liquidity window.',
      desc: 'London 07-10 UTC, NY 12-15 UTC, Silver Bullet 15-16 UTC. Wait 20m for sweeps.'
    },
    {
      title: 'Price in Correct Zone',
      caption: 'Price is in Discount for Longs or Premium for Shorts.',
      desc: 'Long only in Discount (below 50% range). Short only in Premium (above 50%). At 50% = no trade.'
    },
    {
      title: 'Liquidity Sweep Confirmed',
      caption: 'Opposing liquidity has been swept to trap early traders.',
      desc: 'Price spiked through Equal High/Low, PDH/PDL, or PWH/PWL and snapped back violently.'
    },
    {
      title: 'MSS + Displacement (5M/15M)',
      caption: 'Market structure shift has broken previous short-term trend.',
      desc: 'CHoCH (Change of Character) candle closed. Displacement followed, leaving a clean Fair Value Gap (FVG).'
    },
    {
      title: 'Clean Runway to TP3',
      caption: 'Sufficient space exists to targets without major blockades.',
      desc: 'No Order Blocks (OBs), open FVGs, or round numbers present between entry and target TP3.'
    }
  ];

  // Pre-execution safety
  const safetyLabels = [
    { label: 'Funding rate is neutral (-0.1% to +0.1%)', caption: 'Sufficient funding rate gap supports leverage bias.' },
    { label: 'No high-impact news releases within 30 min', caption: 'High-impact news event window is currently clear.' },
    { label: 'Not a weekend (Sat 22:00 – Sun 22:00 UTC)', caption: 'Avoid low-volume spread widening on closed retail streams.' },
    { label: 'Not re-entering same setup this Kill Zone window', caption: 'Preserve psychological discipline; avoid revenge triggers.' },
    { label: 'Daily loss is currently below 3% of account', caption: 'System defense gate enforces standard capital safety.' }
  ];

  // Handle saving this checklist configuration to pre-fill the journal and jump tabs
  const handleLogSetup = () => {
    const prefilled = {
      confluenceScore: score,
      setupType: setupType,
      amdBias: amdBias === 'BULLISH' ? 'Bullish NY' : amdBias === 'BEARISH' ? 'Bearish NY' : 'N/A',
      priceZone: confluences[2] ? (setupType === 'Type A' ? 'Discount' : 'Premium') : 'Neutral',
    };
    onSetPrefilledSetup(prefilled);
    onSetActiveTab('journal');
  };

  return (
    <div className="space-y-4" id="im_checklist_view">
      
      {/* LIVE SCAN CONFLUENCES TABLE */}
      <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px]" id="im_live_score_container">
        <div className="space-y-1 pb-3 border-b border-[#1F2430] flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h2 className="text-xs font-bold font-mono text-[#D7DCE5] tracking-wider uppercase flex items-center gap-1.5">
              <Flame className="text-amber-500 w-3.5 h-3.5" /> Algorithmic Live Scan Confluences
            </h2>
            <p className="text-[10px] text-[#6B7280]">
              Real-time multi-timeframe algorithm matrices computed from active live server scans.
            </p>
          </div>
          <span className="text-[9px] font-mono text-[#22D3EE] bg-[#0A0C10] border border-[#1F2430] px-2 py-0.5 rounded-[2px] self-start sm:self-auto uppercase">
            Scan Interval: 45s
          </span>
        </div>

        {/* Unified Table */}
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1F2430] text-[10px] font-mono text-[#6B7280] bg-[#0A0C10]/50">
                <th className="py-2 px-3">Pair</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Score</th>
                <th className="py-2 px-3">Direction</th>
                <th className="py-2 px-3">Entry Target</th>
                <th className="py-2 px-3">Zone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2430]/50 text-xs">
              
              {/* --- TYPE A SETUPS --- */}
              <tr className="bg-[#0A0C10]/30 font-mono text-[9px] text-[#22D3EE] uppercase tracking-wider">
                <td colSpan={7} className="py-1.5 px-3 font-bold">
                  ● Type A Profiles (With-Trend High-Expectancy)
                </td>
              </tr>
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((p) => {
                const evalItem = botData?.evaluations?.[p];
                const isExpanded = !!expandedRows[`check_setup_A_${p}`];
                
                const formatPairName = (raw: string) => {
                  if (raw.endsWith('USDT')) {
                    return `${raw.slice(0, raw.length - 4)}/USDT`;
                  }
                  return raw;
                };

                if (!evalItem) {
                  return (
                    <tr key={`A_${p}`} className="hover:bg-[#1F2430]/10">
                      <td className="py-2.5 px-3 font-bold font-mono text-[#D7DCE5]">{formatPairName(p)}</td>
                      <td className="py-2.5 px-3 text-[#6B7280]">Type A</td>
                      <td className="py-2.5 px-3 col-span-5 text-[#6B7280] font-mono animate-pulse" colSpan={5}>Scanning...</td>
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
                  checklist,
                  reason,
                  newsOk,
                  newsBlock
                } = evalItem;

                return (
                  <React.Fragment key={`A_${p}`}>
                    <tr 
                      onClick={() => toggleRow(`check_setup_A_${p}`)}
                      className="hover:bg-[#1F2430]/20 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3 font-bold font-mono text-[#D7DCE5] flex items-center gap-1.5">
                        <span className="text-[#6B7280] text-[9px]">{isExpanded ? '▼' : '▶'}</span>
                        {formatPairName(p)}
                      </td>
                      <td className="py-2.5 px-3 text-[#22D3EE] font-mono uppercase text-[10px]">Type A</td>
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
                    </tr>
                    
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="p-0 bg-[#0A0C10]/60">
                          <div className="px-3 py-2 border-t border-b border-[#1F2430] flex flex-col gap-2 text-[11px] font-mono text-[#6B7280]">
                            
                            {/* Checklist criteria inline */}
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                              <span className="text-[#4B5563] uppercase tracking-wider text-[10px] font-bold">Checklist Matrix:</span>
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
                            </div>

                            {/* News Status indicator inside row */}
                            <div className="flex items-center gap-2 text-[10.5px] border-t border-[#1F2430]/40 pt-1.5">
                              <span className="text-[#4B5563] uppercase tracking-wider text-[10px] font-bold">News Filter:</span>
                              {newsOk === undefined ? (
                                <span className="text-[#6B7280]">Checking calendar feeds...</span>
                              ) : newsOk ? (
                                <span className="text-[#16C784]">✅ News Clear — No high-impact releases scheduled inside the 30-minute block.</span>
                              ) : (
                                <span className="text-[#EA3943] font-bold">🔴 News Warning: {newsBlock?.event || 'Macro Event'} scheduled in {newsBlock?.minutesAway || 0} minutes. Trading execution gated.</span>
                              )}
                            </div>

                            {reason && (
                              <div className="text-[#EA3943] border-t border-[#1F2430]/40 pt-1 text-[10px]">
                                Blocker Event: {reason}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {/* --- TYPE B SETUPS (MUTED) --- */}
              <tr className="bg-[#0A0C10]/20 font-mono text-[9px] text-[#4B5563] uppercase tracking-wider">
                <td colSpan={7} className="py-1.5 px-3 font-bold border-t border-[#1F2430]">
                  ● Type B Profiles (Counter-Trend — Visually Muted)
                </td>
              </tr>
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((p) => {
                const isExpanded = !!expandedRows[`check_setup_B_${p}`];
                const formatPairName = (raw: string) => {
                  if (raw.endsWith('USDT')) {
                    return `${raw.slice(0, raw.length - 4)}/USDT`;
                  }
                  return raw;
                };

                return (
                  <React.Fragment key={`B_${p}`}>
                    <tr 
                      onClick={() => toggleRow(`check_setup_B_${p}`)}
                      className="opacity-40 hover:opacity-100 hover:bg-[#1F2430]/25 cursor-pointer transition-all text-[#6B7280]"
                    >
                      <td className="py-2.5 px-3 font-bold font-mono flex items-center gap-1.5">
                        <span className="text-[#4B5563] text-[9px]">{isExpanded ? '▼' : '▶'}</span>
                        {formatPairName(p)}
                      </td>
                      <td className="py-2.5 px-3 text-[#4B5563] font-mono uppercase text-[10px]">Type B</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#4B5563]">Offline</td>
                      <td className="py-2.5 px-3 font-mono text-[#4B5563]">0/6</td>
                      <td className="py-2.5 px-3 font-mono text-[#4B5563]">—</td>
                      <td className="py-2.5 px-3 font-mono text-[#4B5563]">—</td>
                      <td className="py-2.5 px-3 font-mono text-[#4B5563]">—</td>
                    </tr>
                    
                    {isExpanded && (
                      <tr className="bg-[#0A0C10]/40">
                        <td colSpan={7} className="px-3 py-2 border-t border-b border-[#1F2430] text-[10px] font-mono text-[#6B7280] leading-relaxed">
                          <strong className="text-amber-600 uppercase font-bold text-[9px] tracking-wider">Counter-Trend Gating Notice:</strong> Counter-trend automation offline. Execute manually using the discretionary setup planner below, satisfying full 6/6 confluence criteria strictly.
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

            </tbody>
          </table>
        </div>
      </div>
      
      {/* HEADER MANUAL ACTIONS PANEL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] gap-4">
        <div className="space-y-0.5">
          <h2 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider flex items-center gap-2">
            <Clipboard className="w-4 h-4 text-[#22D3EE]" /> Discretionary Setup Planner
          </h2>
          <p className="text-[10px] text-[#6B7280]">
            This scorecard logs manual entries. The bot operates on its own server-side gating independently.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Setup Type switch */}
          <div className="inline-flex bg-[#0A0C10] border border-[#1F2430] rounded-[2px] p-0.5">
            <button
              onClick={() => setSetupType('Type A')}
              className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-[2px] transition-all ${setupType === 'Type A' ? 'bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[#22D3EE]' : 'text-[#6B7280] hover:text-[#D7DCE5]'}`}
              id="im_setup_type_a"
            >
              Type A (With Trend)
            </button>
            <button
              onClick={() => setSetupType('Type B')}
              className={`px-2.5 py-1 text-[10px] font-bold font-mono rounded-[2px] transition-all ${setupType === 'Type B' ? 'bg-amber-500/15 border border-amber-500/30 text-amber-500' : 'text-[#6B7280] hover:text-[#D7DCE5]'}`}
              id="im_setup_type_b"
            >
              Type B (Counter)
            </button>
          </div>

          <button
            onClick={handleResetScorecard}
            className="p-1.5 bg-[#0A0C10] hover:bg-[#1F2430]/30 border border-[#1F2430] rounded-[2px] text-[#6B7280] hover:text-[#D7DCE5] transition-all"
            title="Reset Scorecard"
            id="im_reset_scorecard"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SCORECARD GRID AND GIANT SCORE DISPLAY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Six Cards Grid with Copy Pass */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-3" id="im_confluence_cards_grid">
          {confluenceCards.map((card, idx) => {
            const isActive = confluences[idx];
            return (
              <div
                key={idx}
                onClick={() => handleToggleConfluence(idx)}
                className={`p-4 rounded-[2px] border transition-all duration-200 cursor-pointer select-none relative overflow-hidden flex flex-col justify-between min-h-[140px]
                  ${isActive
                    ? 'bg-[#16C784]/[0.02] border-[#16C784]/60'
                    : 'bg-[#12151B] border-[#1F2430] hover:bg-[#1F2430]/10 hover:border-[#1F2430]/80'
                  }`}
                id={`im_confluence_card_${idx}`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[9px] font-bold font-mono text-[#6B7280]">POINT 0{idx + 1}</span>
                    <div className={`w-4 h-4 rounded-[2px] border flex items-center justify-center transition-all
                      ${isActive ? 'bg-[#16C784] border-[#16C784] text-[#0A0C10]' : 'border-[#1F2430] bg-[#0A0C10]'}`}>
                      {isActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  
                  {/* Primary & Subtitle label copy pass */}
                  <h3 className={`text-xs font-bold font-sans tracking-tight mt-1.5 transition-colors ${isActive ? 'text-[#16C784]' : 'text-[#D7DCE5]'}`}>
                    {card.title}
                  </h3>
                  <p className="text-[9px] text-[#6B7280] font-bold mt-0.5 uppercase tracking-wider font-mono">
                    {card.caption}
                  </p>
                  
                  <p className="text-[11px] text-[#6B7280] leading-relaxed mt-2 font-sans">{card.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Score Panel */}
        <div className="lg:col-span-4 bg-[#12151B] border border-[#1F2430] p-5 rounded-[2px] flex flex-col justify-between" id="im_score_result_panel">
          <div>
            <h3 className="text-[10px] font-mono tracking-widest text-[#6B7280] uppercase pb-2 border-b border-[#1F2430]">Confluence Evaluation</h3>
            <div className="text-center py-5">
              <div className={`text-6xl font-bold font-mono tracking-tighter ${scoreInfo.colorClass}`} id="im_giant_score">
                {score}<span className="text-2xl text-[#6B7280]">/6</span>
              </div>
              <div className={`text-[10px] font-bold font-mono tracking-wider uppercase mt-3 ${scoreInfo.colorClass}`}>
                {scoreInfo.label}
              </div>
              <p className="text-[11px] text-[#6B7280] leading-relaxed max-w-[240px] mx-auto mt-2 font-sans">
                {scoreInfo.desc}
              </p>
            </div>
          </div>

          {/* Validation Warnings */}
          <div className="space-y-3">
            {isTypeBViolation && (
              <div className="p-3 bg-[#EA3943]/10 border border-[#EA3943]/30 rounded-[2px] text-[10px] text-[#EA3943] font-mono leading-relaxed flex gap-2" id="im_type_b_violation_msg">
                <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <strong className="font-bold">CRITICAL DEFENSE GATE:</strong> Type B Counter-Trend profiles demand a clean 6/6 execution score. <strong className="font-bold uppercase text-[#EA3943]">VOID TRADE</strong>.
                </div>
              </div>
            )}

            {/* Action Log Setup */}
            <button
              onClick={handleLogSetup}
              disabled={score === 0}
              className={`w-full py-2.5 rounded-[2px] font-bold tracking-wider text-xs transition-all flex items-center justify-center gap-2 font-mono uppercase
                ${score > 0
                  ? 'bg-[#22D3EE] text-[#0A0C10] hover:bg-[#22D3EE]/90 active:scale-98 cursor-pointer'
                  : 'bg-[#0A0C10] border border-[#1F2430] text-[#6B7280] cursor-not-allowed'
                }`}
              id="im_log_setup_btn"
            >
              <Flame className="w-4 h-4" /> Log Setup To Journal
            </button>
          </div>
        </div>
      </div>

      {/* AMD DIRECTIONAL BIAS SECTION */}
      <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] space-y-3" id="im_amd_bias_panel">
        <div className="pb-2 border-b border-[#1F2430]">
          <h3 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider">
            Today's AMD Bias Matrix
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">Identify liquidity distribution pools to forecast New York session expansion.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="im_amd_bias_toggles">
          <button
            onClick={() => setAmdBias(amdBias === 'BEARISH' ? null : 'BEARISH')}
            className={`p-4 rounded-[2px] border text-left transition-all relative overflow-hidden
              ${amdBias === 'BEARISH'
                ? 'bg-[#EA3943]/[0.02] border-[#EA3943]/60 shadow-none'
                : 'bg-[#0A0C10] border-[#1F2430] hover:border-[#1F2430]/80'
              }`}
            id="im_amd_bias_bearish_btn"
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-mono font-bold text-[#6B7280] uppercase tracking-wider">Model A (Bearish bias)</span>
              {amdBias === 'BEARISH' && <span className="text-[9px] bg-[#EA3943]/10 border border-[#EA3943]/20 px-2 py-0.5 rounded-[2px] text-[#EA3943] font-mono font-bold">BEARISH BIAS</span>}
            </div>
            <div className={`text-xs font-bold font-mono ${amdBias === 'BEARISH' ? 'text-[#EA3943]' : 'text-[#D7DCE5]'}`}>
              London Swept Asian HIGH &rarr; NY Bias = BEARISH
            </div>
            <p className="text-[9px] text-[#6B7280] uppercase font-bold mt-1 tracking-wider font-mono">
              Accumulation-Manipulation-Distribution is aligned
            </p>
            <div className="text-[11px] text-[#6B7280] mt-1.5 leading-relaxed font-sans">
              Early breakout buyers trapped at Asian resistance. The New York algorithm is highly primed to expand downward seeking sell-side liquidity at Asian lows.
            </div>
          </button>

          <button
            onClick={() => setAmdBias(amdBias === 'BULLISH' ? null : 'BULLISH')}
            className={`p-4 rounded-[2px] border text-left transition-all relative overflow-hidden
              ${amdBias === 'BULLISH'
                ? 'bg-[#16C784]/[0.02] border-[#16C784]/60 shadow-none'
                : 'bg-[#0A0C10] border-[#1F2430] hover:border-[#1F2430]/80'
              }`}
            id="im_amd_bias_bullish_btn"
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[9px] font-mono font-bold text-[#6B7280] uppercase tracking-wider">Model B (Bullish bias)</span>
              {amdBias === 'BULLISH' && <span className="text-[9px] bg-[#16C784]/10 border border-[#16C784]/20 px-2 py-0.5 rounded-[2px] text-[#16C784] font-mono font-bold">BULLISH BIAS</span>}
            </div>
            <div className={`text-xs font-bold font-mono ${amdBias === 'BULLISH' ? 'text-[#16C784]' : 'text-[#D7DCE5]'}`}>
              London Swept Asian LOW &rarr; NY Bias = BULLISH
            </div>
            <p className="text-[9px] text-[#6B7280] uppercase font-bold mt-1 tracking-wider font-mono">
              Accumulation-Manipulation-Distribution is aligned
            </p>
            <div className="text-[11px] text-[#6B7280] mt-1.5 leading-relaxed font-sans">
              Early breakdown sellers trapped at Asian support. The New York algorithm is highly primed to expand upward seeking buy-side liquidity at Asian highs.
            </div>
          </button>
        </div>
      </div>

      {/* PRE-EXECUTION SAFETY GATES */}
      <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] space-y-3" id="im_safety_gate_panel">
        <div className="border-b border-[#1F2430] pb-2">
          <h3 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-[#22D3EE]" /> Pre-Execution Final Safety Gates
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">Absolute system defense filters. Ensure every gate is checked before triggering active trades.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="im_safety_checklist_grid">
          {safetyLabels.map((item, idx) => (
            <div
              key={idx}
              onClick={() => handleToggleSafety(idx)}
              className={`p-3 rounded-[2px] border transition-all cursor-pointer select-none flex items-start space-x-3 min-h-[64px] justify-between
                ${safetyChecks[idx]
                  ? 'bg-[#16C784]/[0.01] border-[#16C784]/40'
                  : 'bg-[#0A0C10] border-[#1F2430] hover:bg-[#1F2430]/10'
                }`}
              id={`im_safety_item_${idx}`}
            >
              <div className="flex flex-col flex-1">
                <span className={`text-xs font-bold font-sans ${safetyChecks[idx] ? 'text-[#6B7280] line-through' : 'text-[#D7DCE5]'}`}>{item.label}</span>
                <span className="text-[9.5px] text-[#6B7280] mt-0.5 leading-tight">{item.caption}</span>
              </div>
              <div className={`w-4 h-4 rounded-[2px] border flex items-center justify-center transition-all shrink-0 mt-0.5
                ${safetyChecks[idx] ? 'bg-[#16C784] border-[#16C784] text-[#0A0C10]' : 'border-[#1F2430] bg-[#0A0C10]'}`}>
                {safetyChecks[idx] && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
