import React, { useState, useEffect } from 'react';
import { Shield, Check, Flame, AlertOctagon, RefreshCw, Clipboard, Info } from 'lucide-react';

interface ChecklistTabProps {
  onSetActiveTab: (tab: string) => void;
  onSetPrefilledSetup: (setup: any) => void;
}

export default function ChecklistTab({ onSetActiveTab, onSetPrefilledSetup }: ChecklistTabProps) {
  // Confluence Scorecard (6 elements)
  const [confluences, setConfluences] = useState<boolean[]>(() => {
    const val = localStorage.getItem('im_checklist_confluences');
    return val ? JSON.parse(val) : Array(6).fill(false);
  });

  const [setupType, setSetupType] = useState<'Type A' | 'Type B'>(() => {
    const val = localStorage.getItem('im_checklist_setup_type');
    return (val === 'Type A' || val === 'Type B') ? val : 'Type A';
  });

  // AMD Bias (stored in sessionStorage as requested)
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
        colorClass: 'text-[#00ff88]',
        borderClass: 'border-emerald-500/40 bg-emerald-500/5',
        desc: 'Fully aligned institutional footprint. Statistically high win expectancy setup.'
      };
    } else if (score === 5) {
      return {
        label: 'HIGH QUALITY — Type A only',
        colorClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/20 bg-zinc-800/20',
        desc: 'Strong confluence. Suitable for trend-following Type A executions.'
      };
    } else if (score === 4) {
      return {
        label: 'BORDERLINE — extreme caution only',
        colorClass: 'text-[#ffd700]',
        borderClass: 'border-yellow-500/20 bg-yellow-500/5',
        desc: 'Lower probability. Keep leverage reduced if forcing entry.'
      };
    } else {
      return {
        label: 'DO NOT ENTER',
        colorClass: 'text-[#ff4444]',
        borderClass: 'border-rose-500/20 bg-rose-500/5',
        desc: 'Negative Expected Value (EV). Re-read rulebook and close charts.'
      };
    }
  };

  const scoreInfo = getScoreInfo();

  // Type B validation: "Type B requires 6/6 — SKIP"
  const isTypeBViolation = setupType === 'Type B' && score < 6;

  // Confluence descriptions
  const confluenceCards = [
    {
      title: 'HTF Bias Aligned',
      desc: 'Weekly + Daily + 4H same direction. EMA 20 above 50 for longs, below for shorts.'
    },
    {
      title: 'Inside Kill Zone (20+ min)',
      desc: 'London 07-10 UTC, NY 12-15 UTC, Silver Bullet 15-16 UTC. Wait 20m for sweeps.'
    },
    {
      title: 'Price in Correct Zone',
      desc: 'Long only in Discount (below 50% range). Short only in Premium (above 50%). At 50% = no trade.'
    },
    {
      title: 'Liquidity Sweep Confirmed',
      desc: 'Price spiked through Equal High/Low, PDH/PDL, or PWH/PWL and snapped back violently.'
    },
    {
      title: 'MSS + Displacement (5M/15M)',
      desc: 'CHoCH (Change of Character) candle closed. Displacement followed, leaving a clean Fair Value Gap (FVG).'
    },
    {
      title: 'Clean Runway to TP3',
      desc: 'No Order Blocks (OBs), open FVGs, or round numbers present between entry and target TP3.'
    }
  ];

  // Pre-execution safety
  const safetyLabels = [
    'Funding rate is neutral (-0.1% to +0.1%)',
    'No high-impact news releases within 30 min',
    'Not a weekend (Sat 22:00 – Sun 22:00 UTC)',
    'Not re-entering same setup this Kill Zone window',
    'Daily loss is currently below 3% of account'
  ];

  // Handle saving this checklist configuration to pre-fill the journal and jump tabs
  const handleLogSetup = () => {
    // Save state to pass to Journal Tab
    const prefilled = {
      confluenceScore: score,
      setupType: setupType,
      amdBias: amdBias === 'BULLISH' ? 'Bullish NY' : amdBias === 'BEARISH' ? 'Bearish NY' : 'N/A',
      priceZone: confluences[2] ? (setupType === 'Type A' ? 'Discount' : 'Premium') : 'Neutral',
    };
    onSetPrefilledSetup(prefilled);
    // Switch to journal tab
    onSetActiveTab('journal');
  };

  return (
    <div className="space-y-6" id="im_checklist_view">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] tracking-tight flex items-center gap-2">
            <Clipboard className="w-5 h-5 text-[#00ff88]" /> 6-Point Confluence Scorecard
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Systematic institutional filter. Discard any setup that lacks adequate market structures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Setup Type switch */}
          <div className="inline-flex bg-[#0d1117] border border-zinc-800 rounded p-1">
            <button
              onClick={() => setSetupType('Type A')}
              className={`px-3 py-1 text-xs font-bold rounded transition-all ${setupType === 'Type A' ? 'bg-sky-500/15 border border-sky-500/30 text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              id="im_setup_type_a"
            >
              Type A (With Trend)
            </button>
            <button
              onClick={() => setSetupType('Type B')}
              className={`px-3 py-1 text-xs font-bold rounded transition-all ${setupType === 'Type B' ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              id="im_setup_type_b"
            >
              Type B (Counter)
            </button>
          </div>

          <button
            onClick={handleResetScorecard}
            className="p-2 bg-[#0d1117] hover:bg-[#161b22] border border-zinc-800 rounded text-zinc-400 hover:text-zinc-300 transition-all"
            title="Reset Scorecard"
            id="im_reset_scorecard"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SCORECARD GRID AND GIANT SCORE DISPLAY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Six Cards Grid */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4" id="im_confluence_cards_grid">
          {confluenceCards.map((card, idx) => {
            const isActive = confluences[idx];
            return (
              <div
                key={idx}
                onClick={() => handleToggleConfluence(idx)}
                className={`p-5 rounded-lg border transition-all cursor-pointer select-none relative overflow-hidden flex flex-col justify-between h-40
                  ${isActive
                    ? 'bg-emerald-500/5 border-[#00ff88]/60 shadow-[0_0_12px_rgba(0,255,136,0.03)]'
                    : 'bg-[#161b22] border-zinc-850 hover:bg-zinc-800/35 hover:border-zinc-700/60'
                  }`}
                id={`im_confluence_card_${idx}`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold font-mono text-zinc-500">POINT 0{idx + 1}</span>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all
                      ${isActive ? 'bg-[#00ff88] border-[#00ff88] text-zinc-950' : 'border-zinc-700 bg-zinc-900'}`}>
                      {isActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </div>
                  <h3 className={`text-sm font-semibold tracking-wide mt-2 transition-colors ${isActive ? 'text-[#00ff88]' : 'text-[#e6edf3]'}`}>
                    {card.title}
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed mt-1.5">{card.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic Score Panel */}
        <div className="lg:col-span-4 bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl flex flex-col justify-between" id="im_score_result_panel">
          <div>
            <h3 className="text-xs font-mono tracking-widest text-zinc-500 uppercase pb-2 border-b border-zinc-800">Confluence Evaluation</h3>
            <div className="text-center py-6">
              <div className={`text-7xl font-extrabold font-mono tracking-tighter ${scoreInfo.colorClass}`} id="im_giant_score">
                {score}/6
              </div>
              <div className={`text-xs font-bold font-mono tracking-widest uppercase mt-2 ${scoreInfo.colorClass}`}>
                {scoreInfo.label}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-[240px] mx-auto mt-3">
                {scoreInfo.desc}
              </p>
            </div>
          </div>

          {/* Validation Warnings */}
          <div className="space-y-4">
            {isTypeBViolation && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded text-xs text-[#ff4444] font-mono leading-relaxed flex gap-2" id="im_type_b_violation_msg">
                <AlertOctagon className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <strong className="font-bold">CRITICAL WARNING:</strong> Type B Counter-Trend trades require a pristine 6/6 score. <strong className="font-bold uppercase text-[#ff4444]">SKIP SETUP</strong>.
                </div>
              </div>
            )}

            {/* Action Log Setup */}
            <button
              onClick={handleLogSetup}
              disabled={score === 0}
              className={`w-full py-3 rounded font-bold tracking-wider text-xs transition-all flex items-center justify-center gap-2
                ${score > 0
                  ? 'bg-[#00ff88]/10 hover:bg-[#00ff88]/15 border border-[#00ff88]/30 text-[#00ff88] cursor-pointer'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
                }`}
              id="im_log_setup_btn"
            >
              <Flame className="w-4 h-4" /> LOG THIS SETUP TO JOURNAL
            </button>
          </div>
        </div>
      </div>

      {/* AMD DIRECTIONAL BIAS SECTION */}
      <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl" id="im_amd_bias_panel">
        <h3 className="text-sm font-semibold text-zinc-300 mb-1">Today's AMD Directional Bias</h3>
        <p className="text-xs text-zinc-400 mb-4">Determine the day's manipulation sweep to forecast New York session expansions.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="im_amd_bias_toggles">
          <button
            onClick={() => setAmdBias(amdBias === 'BEARISH' ? null : 'BEARISH')}
            className={`p-4 rounded-lg border text-left transition-all relative overflow-hidden
              ${amdBias === 'BEARISH'
                ? 'bg-rose-500/5 border-rose-500/40 shadow-md'
                : 'bg-[#0d1117]/60 border-zinc-800 hover:border-zinc-700 hover:bg-[#0d1117]'
              }`}
            id="im_amd_bias_bearish_btn"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">MODEL A</span>
              {amdBias === 'BEARISH' && <span className="text-xs bg-rose-500/20 px-2 py-0.5 rounded text-[#ff4444] font-mono">ACTIVE NY BIAS</span>}
            </div>
            <div className={`text-xs font-bold ${amdBias === 'BEARISH' ? 'text-[#ff4444]' : 'text-zinc-300'}`}>
              London swept Asian HIGH &rarr; NY bias = BEARISH
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">Breakout buyers trapped at local highs. NY algorithm seeks sell-side liquidity at Asian lows.</div>
          </button>

          <button
            onClick={() => setAmdBias(amdBias === 'BULLISH' ? null : 'BULLISH')}
            className={`p-4 rounded-lg border text-left transition-all relative overflow-hidden
              ${amdBias === 'BULLISH'
                ? 'bg-emerald-500/5 border-[#00ff88]/40 shadow-md'
                : 'bg-[#0d1117]/60 border-zinc-800 hover:border-zinc-700 hover:bg-[#0d1117]'
              }`}
            id="im_amd_bias_bullish_btn"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase">MODEL B</span>
              {amdBias === 'BULLISH' && <span className="text-xs bg-emerald-500/20 px-2 py-0.5 rounded text-[#00ff88] font-mono">ACTIVE NY BIAS</span>}
            </div>
            <div className={`text-xs font-bold ${amdBias === 'BULLISH' ? 'text-[#00ff88]' : 'text-zinc-300'}`}>
              London swept Asian LOW &rarr; NY bias = BULLISH
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">Breakout sellers trapped at local lows. NY algorithm seeks buy-side liquidity at Asian highs.</div>
          </button>
        </div>
      </div>

      {/* PRE-EXECUTION SAFETY GATE */}
      <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl" id="im_safety_gate_panel">
        <div className="border-b border-zinc-850 pb-3 mb-4">
          <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-sky-400" /> Pre-Execution Final Safety Gates
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">Check these 5 absolute constraints to confirm systemic defense before dispatching orders.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" id="im_safety_checklist_grid">
          {safetyLabels.map((label, idx) => (
            <div
              key={idx}
              onClick={() => handleToggleSafety(idx)}
              className={`p-3 rounded border transition-all cursor-pointer select-none flex items-center space-x-3
                ${safetyChecks[idx]
                  ? 'bg-[#00ff88]/5 border-[#00ff88]/30'
                  : 'bg-[#0d1117]/60 border-zinc-850 hover:bg-[#161b22]'
                }`}
              id={`im_safety_item_${idx}`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0
                ${safetyChecks[idx] ? 'bg-[#00ff88] border-[#00ff88] text-zinc-950' : 'border-zinc-700 bg-zinc-900'}`}>
                {safetyChecks[idx] && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
              <span className={`text-xs ${safetyChecks[idx] ? 'text-zinc-400 line-through' : 'text-zinc-300'}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
