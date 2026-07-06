import React, { useState, useEffect } from 'react';
import { Shield, TrendingUp, TrendingDown, AlertCircle, Info, Check } from 'lucide-react';

export default function CalculatorTab() {
  // Inputs with defaults, loaded from localStorage if exists
  const [accountSize, setAccountSize] = useState<number>(() => {
    const val = localStorage.getItem('im_calc_account_size');
    return val ? parseFloat(val) : 10000;
  });
  const [riskPercent, setRiskPercent] = useState<number>(() => {
    const val = localStorage.getItem('im_calc_risk_percent');
    return val ? parseFloat(val) : 1.0;
  });
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>(() => {
    const val = localStorage.getItem('im_calc_direction');
    return (val === 'LONG' || val === 'SHORT') ? val : 'LONG';
  });
  const [entryPrice, setEntryPrice] = useState<number>(() => {
    const val = localStorage.getItem('im_calc_entry_price');
    return val ? parseFloat(val) : 65000;
  });
  const [stopLoss, setStopLoss] = useState<number>(() => {
    const val = localStorage.getItem('im_calc_stop_loss');
    return val ? parseFloat(val) : 64350; // default stop at ~1% risk for long
  });
  const [leverage, setLeverage] = useState<number>(() => {
    const val = localStorage.getItem('im_calc_leverage');
    return val ? parseInt(val) : 3;
  });

  // Recalculate and save to localStorage on changes
  useEffect(() => {
    localStorage.setItem('im_calc_account_size', accountSize.toString());
    localStorage.setItem('im_calc_risk_percent', riskPercent.toString());
    localStorage.setItem('im_calc_direction', direction);
    localStorage.setItem('im_calc_entry_price', entryPrice.toString());
    localStorage.setItem('im_calc_stop_loss', stopLoss.toString());
    localStorage.setItem('im_calc_leverage', leverage.toString());
  }, [accountSize, riskPercent, direction, entryPrice, stopLoss, leverage]);

  // Validations
  const isStopLossViolated = direction === 'LONG' 
    ? stopLoss >= entryPrice 
    : stopLoss <= entryPrice;

  const isRiskTooHigh = riskPercent > 1.0;
  const isLeverageTooHigh = leverage > 5;

  // Derived outputs
  const dollarRisk = accountSize * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopDistancePercent = entryPrice > 0 ? (stopDistance / entryPrice) * 100 : 0;

  // Calculate position parameters
  const units = stopDistance > 0 ? dollarRisk / stopDistance : 0;
  const positionSizeUsd = units * entryPrice;
  const maxLeverageRequired = positionSizeUsd / accountSize;

  // TPs
  // TP1 = 1:1, TP2 = 1:1.5, TP3 = 1:3.5
  const tp1Price = direction === 'LONG' ? entryPrice + stopDistance * 1.0 : entryPrice - stopDistance * 1.0;
  const tp2Price = direction === 'LONG' ? entryPrice + stopDistance * 1.5 : entryPrice - stopDistance * 1.5;
  const tp3Price = direction === 'LONG' ? entryPrice + stopDistance * 3.5 : entryPrice - stopDistance * 3.5;

  // Profit at each level:
  // TP1 closes 30% of the position at 1.0R
  const tp1Profit = dollarRisk * 1.0 * 0.3;
  // TP2 closes 30% of the position at 1.5R
  const tp2Profit = dollarRisk * 1.5 * 0.3;
  // TP3 closes 40% of the position at 3.5R
  const tp3Profit = dollarRisk * 3.5 * 0.4;
  const totalPotentialProfit = tp1Profit + tp2Profit + tp3Profit;

  // For visual price ladder offsets
  // Total distance is 4.5R (-1.0R to +3.5R)
  // Let's compute positions in percentage from the bottom of the ladder card.
  // For LONG:
  // - Stop Loss is at bottom (0%)
  // - Entry is at 22.2% from bottom
  // - TP1 is at 44.4% from bottom
  // - TP2 is at 55.6% from bottom
  // - TP3 is at 100% from bottom
  // For SHORT, we reverse it
  const getLadderPosition = (level: 'STOP' | 'ENTRY' | 'TP1' | 'TP2' | 'TP3') => {
    if (direction === 'LONG') {
      switch (level) {
        case 'STOP': return 'bottom-[0%]';
        case 'ENTRY': return 'bottom-[22.2%]';
        case 'TP1': return 'bottom-[44.4%]';
        case 'TP2': return 'bottom-[55.6%]';
        case 'TP3': return 'bottom-[100%] translate-y-[-12px]';
      }
    } else {
      switch (level) {
        case 'STOP': return 'top-[0%]';
        case 'ENTRY': return 'top-[22.2%]';
        case 'TP1': return 'top-[44.4%]';
        case 'TP2': return 'top-[55.6%]';
        case 'TP3': return 'top-[100%] translate-y-[-12px]';
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="im_calculator_view">
      {/* Inputs Column */}
      <div className="lg:col-span-7 bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl space-y-5" id="im_calc_inputs_column">
        <div>
          <h2 className="text-lg font-semibold text-[#e6edf3] tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-sky-400" /> Position Risk & Size Calculator
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Perfect position mathematical scaling. Enter parameters to instantly map order flow execution.
          </p>
        </div>

        {/* Direction Switcher */}
        <div className="grid grid-cols-2 gap-2" id="im_calc_direction_toggle">
          <button
            type="button"
            onClick={() => setDirection('LONG')}
            className={`py-2.5 rounded-md font-bold tracking-wider text-xs transition-all flex items-center justify-center gap-1.5 border
              ${direction === 'LONG'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-[#00ff88] shadow-md shadow-emerald-500/5'
                : 'bg-[#0d1117]/60 border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:bg-[#0d1117]'
              }`}
          >
            <TrendingUp className="w-4 h-4" /> LONG SETUP
          </button>
          <button
            type="button"
            onClick={() => setDirection('SHORT')}
            className={`py-2.5 rounded-md font-bold tracking-wider text-xs transition-all flex items-center justify-center gap-1.5 border
              ${direction === 'SHORT'
                ? 'bg-rose-500/10 border-rose-500/40 text-[#ff4444] shadow-md shadow-rose-500/5'
                : 'bg-[#0d1117]/60 border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:bg-[#0d1117]'
              }`}
          >
            <TrendingDown className="w-4 h-4" /> SHORT SETUP
          </button>
        </div>

        {/* Inputs Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Account Size */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400 tracking-wider">Account Size (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs">$</span>
              <input
                type="number"
                value={accountSize || ''}
                onChange={(e) => setAccountSize(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 pl-7 pr-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Risk Percent */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Risk Percent (%)</label>
              {isRiskTooHigh && (
                <span className="text-[10px] text-[#ff4444] font-mono flex items-center gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Exceeds strategy limit (1.0%)
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={riskPercent || ''}
                onChange={(e) => setRiskPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`w-full bg-[#0d1117] border rounded-md py-2 px-3 text-xs font-mono text-[#e6edf3] focus:outline-none 
                  ${isRiskTooHigh ? 'border-rose-500/50 focus:border-rose-500' : 'border-zinc-800 focus:border-sky-500'}`}
              />
              <span className="absolute right-3 top-2 text-zinc-500 font-mono text-xs">%</span>
            </div>
          </div>

          {/* Entry Price */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-400 tracking-wider">Entry Price (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs">$</span>
              <input
                type="number"
                step="any"
                value={entryPrice || ''}
                onChange={(e) => setEntryPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#0d1117] border border-zinc-800 rounded-md py-2 pl-7 pr-3 text-xs font-mono text-[#e6edf3] focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Stop Loss */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Stop Loss (USD)</label>
              {isStopLossViolated && entryPrice > 0 && stopLoss > 0 && (
                <span className="text-[10px] text-[#ff4444] font-mono flex items-center gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Invalid for {direction}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-500 font-mono text-xs">$</span>
              <input
                type="number"
                step="any"
                value={stopLoss || ''}
                onChange={(e) => setStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`w-full bg-[#0d1117] border rounded-md py-2 pl-7 pr-3 text-xs font-mono text-[#e6edf3] focus:outline-none 
                  ${isStopLossViolated ? 'border-rose-500/50 focus:border-rose-500' : 'border-zinc-800 focus:border-sky-500'}`}
              />
            </div>
          </div>

          {/* Leverage */}
          <div className="space-y-1 md:col-span-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-zinc-400 tracking-wider">Leverage (Max 5x)</label>
              {isLeverageTooHigh && (
                <span className="text-[10px] text-[#ffd700] font-mono flex items-center gap-0.5">
                  <AlertCircle className="w-3 h-3" /> Max 5x — use Isolated Margin
                </span>
              )}
            </div>
            <div className="flex items-center space-x-3 bg-[#0d1117] border border-zinc-800 rounded-md p-1.5">
              {[1, 2, 3, 4, 5, 10].map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => setLeverage(lev)}
                  className={`flex-1 py-1 rounded text-xs font-mono font-bold transition-all
                    ${leverage === lev
                      ? lev > 5
                        ? 'bg-yellow-500/25 border border-yellow-500/40 text-[#ffd700]'
                        : 'bg-sky-500/10 border border-sky-500/40 text-sky-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Validation error message box */}
        {isStopLossViolated && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-[#ff4444] rounded text-xs leading-relaxed flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">Execution Error:</strong> Stop Loss must be {direction === 'LONG' ? 'BELOW' : 'ABOVE'} Entry Price for a {direction} trade. Calculation outputs are locked until corrected.
            </div>
          </div>
        )}

        {/* Calculated parameters output panel */}
        {!isStopLossViolated && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[#0d1117] border border-zinc-800/80 rounded-md" id="im_calc_metrics_panel">
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Dollar Risk</div>
              <div className="text-base font-bold font-mono text-[#ffd700]">${dollarRisk.toFixed(2)}</div>
              <div className="text-[10px] text-zinc-500 font-mono">{riskPercent}% of Acct</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Stop Distance</div>
              <div className="text-base font-bold font-mono text-zinc-300">${stopDistance.toFixed(2)}</div>
              <div className="text-[10px] text-zinc-500 font-mono">{stopDistancePercent.toFixed(2)}% distance</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Units to Trade</div>
              <div className="text-base font-bold font-mono text-emerald-400">{units.toFixed(4)}</div>
              <div className="text-[10px] text-zinc-500 font-mono">contracts / tokens</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Position Size</div>
              <div className="text-base font-bold font-mono text-[#00ff88]">${positionSizeUsd.toFixed(2)}</div>
              <div className="text-[10px] text-zinc-500 font-mono">Req. {maxLeverageRequired.toFixed(1)}x Lev</div>
            </div>
          </div>
        )}

        {/* Strategy Note */}
        <div className="bg-zinc-800/25 border border-zinc-800 p-4 rounded-md text-xs leading-relaxed text-zinc-400">
          <div className="font-semibold text-zinc-300 flex items-center gap-1.5 mb-1.5">
            <Info className="w-4 h-4 text-[#ffd700]" /> High-Probability Partial Rules:
          </div>
          <p className="mb-2">
            <strong className="text-zinc-300 font-semibold">TP1 hit</strong> &rarr; close 30% of position, move stop loss to breakeven (entry).
          </p>
          <p className="mb-2">
            <strong className="text-zinc-300 font-semibold">TP2 hit</strong> &rarr; close 30% of position, move stop loss to TP1 level.
          </p>
          <p className="mb-2">
            <strong className="text-zinc-300 font-semibold">TP3 hit</strong> &rarr; close the remaining 40% (accounts for perp trading fees).
          </p>
          <p className="text-rose-400/90 font-mono text-[11px] leading-tight mt-1.5">
            * TIME-LIMIT EXCLUSION: If TP1 is not hit within 4 hours, close the entire trade. Algorithmic delivery speed has failed.
          </p>
        </div>
      </div>

      {/* Price Ladder Column */}
      <div className="lg:col-span-5 bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl flex flex-col justify-between" id="im_calc_ladder_column">
        <div>
          <h3 className="text-sm font-semibold text-[#e6edf3] tracking-tight">Trade Price Ladder Mapping</h3>
          <p className="text-xs text-zinc-400">Scale visualization based on Risk-to-Reward (R) tranches.</p>
        </div>

        {isStopLossViolated ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-zinc-600 border border-dashed border-zinc-800 rounded-md mt-4">
            <AlertCircle className="w-8 h-8 mb-2" />
            <div className="text-xs font-semibold">Price Ladder Locked</div>
            <div className="text-[10px] max-w-[200px] mt-1 text-zinc-500">Provide a valid stop loss relation to render structural target ladder.</div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between mt-5" id="im_price_ladder_render">
            {/* Visual Container */}
            <div className="relative h-[280px] bg-[#0d1117] rounded-md border border-zinc-800 p-4 mb-4 flex">
              
              {/* Dynamic bar background filling segments */}
              <div className="absolute left-8 top-4 bottom-4 w-1.5 bg-zinc-800 rounded-full flex flex-col justify-between overflow-hidden">
                <div className={`w-full ${direction === 'LONG' ? 'h-[77.8%] bg-emerald-500/20' : 'h-[22.2%] bg-rose-500/20'}`}></div>
                <div className={`w-full ${direction === 'LONG' ? 'h-[22.2%] bg-rose-500/20' : 'h-[77.8%] bg-emerald-500/20'}`}></div>
              </div>

              {/* Levels container overlay */}
              <div className="relative flex-1 h-full pl-6">
                
                {/* TP3 Target level */}
                <div className={`absolute left-0 right-0 border-b border-emerald-500/30 flex justify-between items-center pb-0.5 ${getLadderPosition('TP3')}`} id="im_ladder_tp3">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00ff88]"></span>
                    <span className="text-[11px] font-mono font-bold text-[#00ff88]">TP3 (3.5R - Close 40%)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-[#00ff88]">${tp3Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-zinc-400 font-mono">Profit: +${tp3Profit.toFixed(2)}</div>
                  </div>
                </div>

                {/* TP2 Target level */}
                <div className={`absolute left-0 right-0 border-b border-emerald-500/30 flex justify-between items-center pb-0.5 ${getLadderPosition('TP2')}`} id="im_ladder_tp2">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="text-[11px] font-mono font-medium text-emerald-400">TP2 (1.5R - Close 30%)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-emerald-400">${tp2Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-zinc-500 font-mono">Profit: +${tp2Profit.toFixed(2)}</div>
                  </div>
                </div>

                {/* TP1 Target level */}
                <div className={`absolute left-0 right-0 border-b border-emerald-400/30 flex justify-between items-center pb-0.5 ${getLadderPosition('TP1')}`} id="im_ladder_tp1">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
                    <span className="text-[11px] font-mono text-emerald-300">TP1 (1.0R - Close 30%)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-emerald-300">${tp1Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-zinc-500 font-mono">Profit: +${tp1Profit.toFixed(2)}</div>
                  </div>
                </div>

                {/* Entry Target level */}
                <div className={`absolute left-0 right-0 border-b-2 border-dashed border-white flex justify-between items-center pb-1 ${getLadderPosition('ENTRY')}`} id="im_ladder_entry">
                  <div className="flex items-center space-x-1.5 bg-[#0d1117] px-1">
                    <span className="w-2 h-2 bg-white"></span>
                    <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">ENTRY PRICE</span>
                  </div>
                  <div className="text-right bg-[#0d1117] px-1">
                    <div className="text-[11px] font-bold font-mono text-white">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-zinc-400 font-mono">Pivot base line</div>
                  </div>
                </div>

                {/* Stop Loss Target level */}
                <div className={`absolute left-0 right-0 border-b border-rose-500/50 flex justify-between items-center pb-0.5 ${getLadderPosition('STOP')}`} id="im_ladder_stop">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ff4444]"></span>
                    <span className="text-[11px] font-mono font-bold text-[#ff4444]">STOP LOSS (-1.0R)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-[#ff4444]">${stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-rose-400/70 font-mono">Risk: -${dollarRisk.toFixed(2)} (-{stopDistancePercent.toFixed(2)}%)</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Total Math summary bar */}
            <div className="bg-[#0d1117] p-3 rounded border border-zinc-800 text-xs">
              <div className="flex justify-between font-mono font-bold text-[#e6edf3]">
                <span>Total Potential Yield:</span>
                <span className="text-[#00ff88]">+{(2.15).toFixed(2)}R (+${totalPotentialProfit.toFixed(2)})</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-1 flex justify-between">
                <span>R-Multiple expectation</span>
                <span>Combined tranches value</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
