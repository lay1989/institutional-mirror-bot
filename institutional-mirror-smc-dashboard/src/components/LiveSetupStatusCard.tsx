import React from 'react';
import { Check, X, Minus, HelpCircle } from 'lucide-react';

export interface HTFState {
  weekly: 'bull' | 'bear' | 'range';
  daily: 'bull' | 'bear' | 'range';
  h4: 'bull' | 'bear' | 'range';
  aligned: boolean;
  bias: string;
}

export interface EvaluationChecklist {
  htfAligned: boolean;
  inKillZone: boolean;
  correctZone: boolean;
  sweepConfirmed: boolean;
  mssConfirmed: boolean;
  cleanRunway: boolean | null;
}

export interface PairEvaluation {
  skip: boolean;
  reason?: string;
  score?: number;
  direction?: 'long' | 'short';
  zone?: 'discount' | 'premium' | 'equilibrium';
  killZoneName?: string | null;
  killZoneActive?: boolean;
  weekend?: boolean;
  funding?: number | null;
  fundingOk?: boolean;
  fearGreed?: number | null;
  macroOk?: boolean;
  amdBias?: 'bullish' | 'bearish' | 'undetermined';
  amdContradicts?: boolean;
  price?: number | null;
  entry?: number | null;
  stop?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  pdh?: number | null;
  pdl?: number | null;
  htf?: HTFState;
  checklist?: EvaluationChecklist;
  newsOk?: boolean;
  newsBlock?: {
    event: string;
    minutesAway: number;
  } | null;
}

interface LiveSetupStatusCardProps {
  key?: any;
  pair: string;
  evaluation?: PairEvaluation;
  disabled?: boolean;
  disabledText?: string;
}

export default function LiveSetupStatusCard({ pair, evaluation, disabled, disabledText }: LiveSetupStatusCardProps) {
  // Format pair name (e.g., BTCUSDT -> BTC/USDT)
  const formatPair = (raw: string) => {
    if (raw.endsWith('USDT')) {
      return `${raw.slice(0, raw.length - 4)}/USDT`;
    }
    return raw;
  };

  const formattedPair = formatPair(pair);

  if (disabled) {
    return (
      <div className="bg-[#151B29] border border-[#232B3D] rounded-lg p-5 flex flex-col justify-between h-full opacity-50 select-none">
        <div>
          <div className="flex items-center justify-between border-b border-[#232B3D] pb-2 mb-3">
            <span className="font-display font-bold text-sm text-[#8B93A7]">{formattedPair}</span>
            <span className="text-[10px] font-mono bg-[#0B0E14] border border-[#232B3D] text-[#8B93A7] px-2.5 py-0.5 rounded font-semibold uppercase">
              Disabled
            </span>
          </div>
          <p className="text-xs text-[#8B93A7] leading-relaxed font-mono">
            {disabledText || 'Not automated.'}
          </p>
        </div>
      </div>
    );
  }

  // Handle case where evaluation is missing (e.g. no botData yet)
  if (!evaluation) {
    return (
      <div className="bg-[#151B29] border border-[#232B3D] rounded-lg p-5 flex flex-col justify-between h-full animate-pulse">
        <div>
          <div className="flex items-center justify-between border-b border-[#232B3D] pb-2 mb-3">
            <span className="font-display font-bold text-sm text-[#E7EAF0]">{formattedPair}</span>
            <span className="text-[10px] font-mono bg-[#0B0E14] border border-[#232B3D] text-[#8B93A7] px-2.5 py-0.5 rounded font-semibold uppercase">
              Analyzing...
            </span>
          </div>
          <div className="h-4 bg-[#0B0E14] rounded w-2/3 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-[#0B0E14] rounded w-full"></div>
            <div className="h-3 bg-[#0B0E14] rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  const {
    skip,
    reason,
    score,
    direction,
    zone,
    killZoneName,
    funding,
    fearGreed,
    amdBias,
    htf,
    checklist,
    newsOk,
    newsBlock,
  } = evaluation;

  // Determine if this is a simple "skip-only" evaluation
  const isSimpleSkip = skip && (!checklist || score === undefined);

  // Render check condition status icon
  const renderConditionIcon = (val: boolean | null | undefined) => {
    if (val === true) {
      return (
        <span className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Check className="w-3 h-3 text-emerald-400 stroke-[3] shrink-0" />
        </span>
      );
    }
    if (val === false) {
      return (
        <span className="w-5 h-5 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <X className="w-3 h-3 text-[#FB7185] stroke-[3] shrink-0" />
        </span>
      );
    }
    return (
      <span className="w-5 h-5 rounded-full bg-[#0B0E14] border border-[#232B3D] flex items-center justify-center">
        <Minus className="w-3 h-3 text-[#8B93A7] stroke-[2] shrink-0" />
      </span>
    );
  };

  // Render Timeframe Status
  const formatTimeframe = (tf?: string) => {
    if (!tf) return <span className="text-[#8B93A7]">N/A</span>;
    const lower = tf.toLowerCase();
    if (lower === 'bull') return <span className="text-emerald-400 font-bold uppercase text-[10px]">bull</span>;
    if (lower === 'bear') return <span className="text-[#FB7185] font-bold uppercase text-[10px]">bear</span>;
    return <span className="text-[#8B93A7] uppercase text-[10px]">range</span>;
  };

  return (
    <div 
      className={`bg-[#151B29] border rounded-xl p-5 flex flex-col justify-between h-full transition-all duration-300 hover:shadow-lg
        ${skip 
          ? 'border-[#232B3D] hover:border-[#2d374f]' 
          : 'border-[#2DD4BF]/50 shadow-[0_0_15px_rgba(45,212,191,0.05)] bg-gradient-to-b from-[#151B29] to-[#1c2438]'}`}
      id={`im_live_setup_card_${pair}`}
    >
      <div>
        {/* Top Header: Pair name & Score / State */}
        <div className="flex items-center justify-between border-b border-[#232B3D] pb-3 mb-4">
          <div className="flex flex-col">
            <span className="font-display font-bold text-base text-[#E7EAF0] tracking-wide">{formattedPair}</span>
            {direction && (
              <span className={`text-[10px] font-bold uppercase font-mono mt-0.5 tracking-wider ${direction === 'long' ? 'text-[#2DD4BF]' : 'text-[#FB7185]'}`}>
                {direction === 'long' ? '📈 Long Setup' : '📉 Short Setup'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isSimpleSkip && score !== undefined && (
              <span className="text-xs font-bold font-mono px-2 py-0.5 bg-[#0B0E14] border border-[#232B3D] rounded text-[#E7EAF0]">
                {score}/6 Score
              </span>
            )}
            {skip ? (
              <span className="text-[10px] font-display bg-[#0B0E14] border border-[#232B3D] text-[#8B93A7] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
                Watching
              </span>
            ) : (
              <span className="text-[10px] font-display bg-gradient-to-r from-[#2DD4BF] to-[#22C55E] text-[#0B0E14] px-2.5 py-1 rounded-md font-extrabold uppercase tracking-wider animate-pulse">
                Ready
              </span>
            )}
          </div>
        </div>

        {/* Plain Language Status Headline / Caption */}
        <div className="mb-4">
          {skip ? (
            <div className="space-y-1">
              <h4 className="text-xs font-display font-bold text-[#E7EAF0]">Watching — Waiting for Setup</h4>
              {reason && (
                <p className="text-[11px] text-[#8B93A7] leading-relaxed font-sans border-l-2 border-[#232B3D] pl-2 py-0.5">
                  {reason}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <h4 className="text-xs font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#2DD4BF] to-[#22C55E]">
                Ready — Setup Conditions Active
              </h4>
              <p className="text-[11px] text-[#8B93A7] leading-relaxed font-sans border-l-2 border-[#2DD4BF] pl-2 py-0.5">
                All high-probability execution metrics have successfully aligned for an order trigger.
              </p>
            </div>
          )}
        </div>

        {/* Simplified display for simple skip shape */}
        {isSimpleSkip ? (
          <div className="py-2 text-[11px] text-[#8B93A7] italic font-sans leading-relaxed">
            Detailed checklist and execution breakdown are bypassed because of active filter constraints.
          </div>
        ) : (
          <>
            {/* The 6 Checklist Conditions + News Filter with copy pass */}
            <div className="space-y-3 py-1">
              {[
                { 
                  label: 'HTF Aligned', 
                  caption: 'Multiple timeframes agree on trade direction.', 
                  val: checklist?.htfAligned 
                },
                { 
                  label: 'In Kill Zone', 
                  caption: 'Price is trading within a high-probability liquidity window.', 
                  val: checklist?.inKillZone 
                },
                { 
                  label: 'Correct Zone', 
                  caption: 'Price is in Discount for Longs or Premium for Shorts.', 
                  val: checklist?.correctZone 
                },
                { 
                  label: 'Sweep Confirmed', 
                  caption: 'Opposing liquidity has been swept to trap early traders.', 
                  val: checklist?.sweepConfirmed 
                },
                { 
                  label: 'MSS Confirmed', 
                  caption: 'Market structure shift has broken previous short-term trend.', 
                  val: checklist?.mssConfirmed 
                },
                { 
                  label: 'Clean Runway', 
                  caption: 'Sufficient space exists to targets without major blockades.', 
                  val: checklist?.cleanRunway 
                },
              ].map((item, idx) => (
                <div key={idx} className="flex items-start justify-between gap-4 py-1.5 border-b border-[#232B3D]/30 last:border-0">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#E7EAF0]">{item.label}</span>
                    <span className="text-[10px] text-[#8B93A7] mt-0.5 leading-normal">{item.caption}</span>
                  </div>
                  <div className="mt-0.5">
                    {renderConditionIcon(item.val)}
                  </div>
                </div>
              ))}

              {/* News Status */}
              <div className="flex items-start justify-between gap-4 py-2 border-t border-[#232B3D] pt-2.5 mt-2">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#E7EAF0]">News Status</span>
                  <span className="text-[10px] text-[#8B93A7] mt-0.5 leading-normal">High-impact news event window is currently clear.</span>
                </div>
                <div className="text-[11px] font-mono text-right mt-0.5 shrink-0">
                  {newsOk === undefined ? (
                    <span className="text-[#8B93A7] flex items-center gap-1.5 bg-[#0B0E14] border border-[#232B3D] px-2 py-0.5 rounded text-[10px]">
                      <Minus className="w-2.5 h-2.5 text-[#8B93A7]" /> Pending
                    </span>
                  ) : newsOk ? (
                    <span className="text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Clear
                    </span>
                  ) : (
                    <span 
                      className="text-[#FB7185] flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] max-w-[150px] truncate" 
                      title={newsBlock ? `${newsBlock.event} in ${newsBlock.minutesAway} min` : 'News Blocked'}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FB7185] animate-pulse"></span> Blocked
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Timeframe HTF Breakdown */}
            {htf && (
              <div className="mt-4 bg-[#0B0E14] border border-[#232B3D] rounded-lg p-3 text-[11px] font-mono flex items-center justify-between">
                <span className="text-[#8B93A7] uppercase font-bold text-[9px] tracking-wider font-display">HTF Structure</span>
                <div className="flex gap-3">
                  <span>W: {formatTimeframe(htf.weekly)}</span>
                  <span>D: {formatTimeframe(htf.daily)}</span>
                  <span>4H: {formatTimeframe(htf.h4)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Compact Stat Row with plain language copy updates */}
      {!isSimpleSkip && (
        <div className="mt-4 pt-4 border-t border-[#232B3D] text-[10px] font-mono text-[#8B93A7] flex flex-wrap gap-x-4 gap-y-2 justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] text-[#8B93A7] uppercase tracking-wider">Premium/Discount</span>
            <span className={`font-bold capitalize text-xs mt-0.5 ${
              zone === 'discount' ? 'text-emerald-400' : zone === 'premium' ? 'text-[#FB7185]' : 'text-zinc-400'
            }`}>
              {zone || 'Neutral'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-[#8B93A7] uppercase tracking-wider">Funding Rate</span>
            <span className={`font-bold text-xs mt-0.5 ${evaluation.fundingOk ? 'text-emerald-400' : 'text-[#8B93A7]'}`}>
              {funding !== null && funding !== undefined ? `${funding > 0 ? '+' : ''}${funding.toFixed(3)}%` : 'N/A'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-[#8B93A7] uppercase tracking-wider">Fear & Greed</span>
            <span className="font-bold text-xs mt-0.5 text-[#E7EAF0]">{fearGreed !== null && fearGreed !== undefined ? fearGreed : 'N/A'}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] text-[#8B93A7] uppercase tracking-wider">AMD Bias</span>
            <span className={`font-bold capitalize text-xs mt-0.5 ${
              amdBias === 'bullish' ? 'text-emerald-400' : amdBias === 'bearish' ? 'text-[#FB7185]' : 'text-zinc-400'
            }`}>
              {amdBias || 'N/A'}
            </span>
          </div>

          {killZoneName && (
            <div className="flex items-center justify-between w-full mt-2 pt-2 border-t border-[#232B3D]/50 text-[9px]">
              <span>Active Window:</span>
              <span className="text-amber-400 font-bold">{killZoneName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
