import React, { useState, useEffect } from 'react';
import { Shield, TrendingUp, TrendingDown, AlertCircle, Info } from 'lucide-react';

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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-fade-in" id="im_calculator_view">
      {/* Inputs Column */}
      <div className="lg:col-span-7 bg-[#12151B] border border-[#1F2430] p-5 rounded-[2px] space-y-4" id="im_calc_inputs_column">
        <div>
          <h2 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#16C784]" /> Position Risk & Size Calculator
          </h2>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            Mathematical parameters to determine position unit size scaling and risk parameters in live execution.
          </p>
        </div>

        {/* Direction Switcher */}
        <div className="grid grid-cols-2 gap-2" id="im_calc_direction_toggle">
          <button
            type="button"
            onClick={() => setDirection('LONG')}
            className={`py-2 rounded-[2px] font-bold font-mono text-[10px] tracking-wider transition-all flex items-center justify-center gap-1.5 border
              ${direction === 'LONG'
                ? 'bg-[#16C784]/15 border-[#16C784]/30 text-[#16C784]'
                : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280] hover:text-[#D7DCE5]'
              }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> LONG SETUP
          </button>
          <button
            type="button"
            onClick={() => setDirection('SHORT')}
            className={`py-2 rounded-[2px] font-bold font-mono text-[10px] tracking-wider transition-all flex items-center justify-center gap-1.5 border
              ${direction === 'SHORT'
                ? 'bg-[#EA3943]/15 border-[#EA3943]/30 text-[#EA3943]'
                : 'bg-[#0A0C10] border-[#1F2430] text-[#6B7280] hover:text-[#D7DCE5]'
              }`}
          >
            <TrendingDown className="w-3.5 h-3.5" /> SHORT SETUP
          </button>
        </div>

        {/* Inputs Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Account Size */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold font-mono uppercase text-[#6B7280] tracking-wider">Account Size (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-[#6B7280] font-mono text-xs">$</span>
              <input
                type="number"
                value={accountSize || ''}
                onChange={(e) => setAccountSize(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 pl-7 pr-3 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#16C784] transition-all"
              />
            </div>
          </div>

          {/* Risk Percent */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold font-mono uppercase text-[#6B7280] tracking-wider">Risk Percent (%)</label>
              {isRiskTooHigh && (
                <span className="text-[9px] text-[#EA3943] font-mono flex items-center gap-0.5 font-bold">
                  ⚠️ Exceeds cap (1.0%)
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={riskPercent || ''}
                onChange={(e) => setRiskPercent(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`w-full bg-[#0A0C10] border rounded-[2px] py-1.5 px-3 text-xs font-mono text-[#D7DCE5] focus:outline-none transition-all
                  ${isRiskTooHigh ? 'border-[#EA3943]/50 focus:border-[#EA3943]' : 'border-[#1F2430] focus:border-[#16C784]'}`}
              />
              <span className="absolute right-3 top-2 text-[#6B7280] font-mono text-xs">%</span>
            </div>
          </div>

          {/* Entry Price */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold font-mono uppercase text-[#6B7280] tracking-wider">Entry Price (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-[#6B7280] font-mono text-xs">$</span>
              <input
                type="number"
                step="any"
                value={entryPrice || ''}
                onChange={(e) => setEntryPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 pl-7 pr-3 text-xs font-mono text-[#D7DCE5] focus:outline-none focus:border-[#16C784] transition-all"
              />
            </div>
          </div>

          {/* Stop Loss */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold font-mono uppercase text-[#6B7280] tracking-wider">Stop Loss (USD)</label>
              {isStopLossViolated && entryPrice > 0 && stopLoss > 0 && (
                <span className="text-[9px] text-[#EA3943] font-mono flex items-center gap-0.5 font-bold">
                  ⚠️ Invalid for {direction}
                </span>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2 text-[#6B7280] font-mono text-xs">$</span>
              <input
                type="number"
                step="any"
                value={stopLoss || ''}
                onChange={(e) => setStopLoss(Math.max(0, parseFloat(e.target.value) || 0))}
                className={`w-full bg-[#0A0C10] border rounded-[2px] py-1.5 pl-7 pr-3 text-xs font-mono text-[#D7DCE5] focus:outline-none transition-all
                  ${isStopLossViolated ? 'border-[#EA3943]/50 focus:border-[#EA3943] text-[#EA3943]' : 'border-[#1F2430] focus:border-[#16C784]'}`}
              />
            </div>
          </div>

          {/* Leverage */}
          <div className="space-y-1 md:col-span-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold font-mono uppercase text-[#6B7280] tracking-wider">Leverage (Max 5x)</label>
              {isLeverageTooHigh && (
                <span className="text-[9px] text-amber-500 font-mono flex items-center gap-0.5 font-bold">
                  ⚠️ Max 5x — use Isolated Margin
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1.5 bg-[#0A0C10] border border-[#1F2430] rounded-[2px] p-1">
              {[1, 2, 3, 4, 5, 10].map((lev) => (
                <button
                  key={lev}
                  type="button"
                  onClick={() => setLeverage(lev)}
                  className={`flex-1 py-1 rounded-[2px] text-[10px] font-mono font-bold transition-all border border-transparent
                    ${leverage === lev
                      ? lev > 5
                        ? 'bg-amber-500/20 border-amber-500/30 text-amber-500'
                        : 'bg-[#16C784]/15 border-[#16C784]/30 text-[#16C784]'
                      : 'text-[#6B7280] hover:text-[#D7DCE5]'
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
          <div className="p-3 bg-[#EA3943]/10 border border-[#EA3943]/20 text-[#EA3943] rounded-[2px] text-[10px] font-mono leading-normal flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold">EXECUTION GATING ERROR:</strong> Stop Loss must be {direction === 'LONG' ? 'BELOW' : 'ABOVE'} Entry Price. Output fields locked.
            </div>
          </div>
        )}

        {/* Calculated parameters output panel */}
        {!isStopLossViolated && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-[#0A0C10] border border-[#1F2430] rounded-[2px]" id="im_calc_metrics_panel">
            <div className="space-y-0.5">
              <div className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider font-mono">Dollar Risk</div>
              <div className="text-sm font-bold font-mono text-amber-500">${dollarRisk.toFixed(2)}</div>
              <div className="text-[9px] text-[#4B5563] font-mono">{riskPercent}% of Acct</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider font-mono">Stop Distance</div>
              <div className="text-sm font-bold font-mono text-[#D7DCE5]">${stopDistance.toFixed(2)}</div>
              <div className="text-[9px] text-[#4B5563] font-mono">{stopDistancePercent.toFixed(2)}% dist</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider font-mono">Units to Trade</div>
              <div className="text-sm font-bold font-mono text-[#16C784]">{units.toFixed(4)}</div>
              <div className="text-[9px] text-[#4B5563] font-mono">tokens / contracts</div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider font-mono">Position Size</div>
              <div className="text-sm font-bold font-mono text-[#22D3EE]">${positionSizeUsd.toFixed(2)}</div>
              <div className="text-[9px] text-[#4B5563] font-mono">Req. {maxLeverageRequired.toFixed(1)}x Lev</div>
            </div>
          </div>
        )}

        {/* Strategy Note */}
        <div className="bg-[#12151B] border border-[#1F2430] p-4 rounded-[2px] text-[11px] leading-relaxed text-[#6B7280]">
          <div className="font-bold text-[#D7DCE5] flex items-center gap-1.5 mb-2 font-mono uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-[#22D3EE]" /> High-Probability Partial Rules:
          </div>
          <p className="mb-1">
            <strong className="text-[#D7DCE5] font-semibold">TP1 hit</strong> &rarr; close 30% of position, move stop loss to breakeven (entry).
          </p>
          <p className="mb-1">
            <strong className="text-[#D7DCE5] font-semibold">TP2 hit</strong> &rarr; close 30% of position, move stop loss to TP1 level.
          </p>
          <p className="mb-1">
            <strong className="text-[#D7DCE5] font-semibold">TP3 hit</strong> &rarr; close the remaining 40% (accounts for perp trading fees).
          </p>
          <p className="text-[#EA3943] font-mono text-[10px] leading-tight mt-3">
            * TIME-LIMIT EXCLUSION: If TP1 is not hit within 4 hours, close the entire trade. Algorithmic speed metrics failed.
          </p>
        </div>
      </div>

      {/* Price Ladder Column */}
      <div className="lg:col-span-5 bg-[#12151B] border border-[#1F2430] p-5 rounded-[2px] flex flex-col justify-between" id="im_calc_ladder_column">
        <div>
          <h3 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider">Trade Price Ladder Mapping</h3>
          <p className="text-[10px] text-[#6B7280]">Scale visualization based on Risk-to-Reward (R) tranches.</p>
        </div>

        {isStopLossViolated ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-[#6B7280] border border-dashed border-[#1F2430] rounded-[2px] mt-4">
            <AlertCircle className="w-6 h-6 mb-2 text-[#EA3943]/40" />
            <div className="text-xs font-bold font-mono uppercase">Price Ladder Locked</div>
            <div className="text-[10px] max-w-[200px] mt-1 text-[#6B7280]/60">Provide a valid stop loss relation to render structural target ladder.</div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between mt-4" id="im_price_ladder_render">
            {/* Visual Container */}
            <div className="relative h-[270px] bg-[#0A0C10] rounded-[2px] border border-[#1F2430] p-3 mb-3 flex">
              
              {/* Dynamic bar background filling segments */}
              <div className="absolute left-8 top-4 bottom-4 w-[2px] bg-[#1F2430] rounded-full flex flex-col justify-between overflow-hidden">
                <div className={`w-full ${direction === 'LONG' ? 'h-[77.8%] bg-[#16C784]/20' : 'h-[22.2%] bg-[#EA3943]/20'}`}></div>
                <div className={`w-full ${direction === 'LONG' ? 'h-[22.2%] bg-[#EA3943]/20' : 'h-[77.8%] bg-[#16C784]/20'}`}></div>
              </div>

              {/* Levels container overlay */}
              <div className="relative flex-1 h-full pl-6">
                
                {/* TP3 Target level */}
                <div className={`absolute left-0 right-0 border-b border-[#1F2430] flex justify-between items-center pb-0.5 ${getLadderPosition('TP3')}`} id="im_ladder_tp3">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16C784]"></span>
                    <span className="text-[10px] font-mono font-bold text-[#16C784]">TP3 (3.5R - Close 40%)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-[#16C784]">${tp3Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-[#6B7280] font-mono">Profit: +${tp3Profit.toFixed(2)}</div>
                  </div>
                </div>

                {/* TP2 Target level */}
                <div className={`absolute left-0 right-0 border-b border-[#1F2430] flex justify-between items-center pb-0.5 ${getLadderPosition('TP2')}`} id="im_ladder_tp2">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]"></span>
                    <span className="text-[10px] font-mono font-bold text-[#22D3EE]">TP2 (1.5R - Close 30%)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-[#22D3EE]">${tp2Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-[#6B7280] font-mono">Profit: +${tp2Profit.toFixed(2)}</div>
                  </div>
                </div>

                {/* TP1 Target level */}
                <div className={`absolute left-0 right-0 border-b border-[#1F2430] flex justify-between items-center pb-0.5 ${getLadderPosition('TP1')}`} id="im_ladder_tp1">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16C784]/50"></span>
                    <span className="text-[10px] font-mono text-[#16C784]/70">TP1 (1.0R - Close 30%)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-[#6B7280]">${tp1Price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-[#6B7280] font-mono">Profit: +${tp1Profit.toFixed(2)}</div>
                  </div>
                </div>

                {/* Entry Target level */}
                <div className={`absolute left-0 right-0 border-b border-[#D7DCE5]/40 flex justify-between items-center pb-1 ${getLadderPosition('ENTRY')}`} id="im_ladder_entry">
                  <div className="flex items-center space-x-1.5 bg-[#0A0C10] px-1.5">
                    <span className="w-1.5 h-1.5 bg-[#D7DCE5]"></span>
                    <span className="text-[10px] font-mono font-bold text-[#D7DCE5] uppercase tracking-wider">ENTRY PRICE</span>
                  </div>
                  <div className="text-right bg-[#0A0C10] px-1.5">
                    <div className="text-[11px] font-bold font-mono text-[#D7DCE5]">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-[#6B7280] font-mono">Baseline</div>
                  </div>
                </div>

                {/* Stop Loss Target level */}
                <div className={`absolute left-0 right-0 border-b border-[#EA3943]/30 flex justify-between items-center pb-0.5 ${getLadderPosition('STOP')}`} id="im_ladder_stop">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EA3943]"></span>
                    <span className="text-[10px] font-mono font-bold text-[#EA3943]">STOP LOSS (-1.0R)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold font-mono text-[#EA3943]">${stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-[9px] text-[#EA3943]/70 font-mono">Risk: -${dollarRisk.toFixed(2)} (-{stopDistancePercent.toFixed(2)}%)</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Total Math summary bar */}
            <div className="bg-[#0A0C10] p-3 rounded-[2px] border border-[#1F2430] text-xs">
              <div className="flex justify-between font-mono font-bold text-[#D7DCE5]">
                <span>Total Potential Yield:</span>
                <span className="text-[#16C784]">+{(2.15).toFixed(2)}R (+${totalPotentialProfit.toFixed(2)})</span>
              </div>
              <div className="text-[9px] text-[#6B7280] mt-1 flex justify-between">
                <span>R-Multiple expectancy</span>
                <span>Combined tranches value</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
