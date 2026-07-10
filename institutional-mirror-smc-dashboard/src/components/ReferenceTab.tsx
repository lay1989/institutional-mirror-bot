import React, { useState } from 'react';
import { REFERENCE_SECTIONS } from '../data';
import { ChevronDown, ChevronUp, AlertOctagon, HelpCircle, CheckCircle } from 'lucide-react';

export default function ReferenceTab() {
  const [openSection, setOpenSection] = useState<string | null>('casino-math');
  const [resetInput, setResetInput] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const handleResetPurge = (e: React.FormEvent) => {
    e.preventDefault();
    if (resetInput === 'RESET') {
      localStorage.clear();
      sessionStorage.clear();
      setResetSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  // Simple, high-fidelity custom markdown-like renderer to parse reference text cleanly
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      // Empty line
      if (trimmed === '') return <div key={idx} className="h-1.5"></div>;

      // H3 Headers
      if (trimmed.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#22D3EE] mt-4 mb-1.5 pb-1 border-b border-[#1F2430]">
            {trimmed.substring(4)}
          </h4>
        );
      }

      // H2 Headers
      if (trimmed.startsWith('## ')) {
        return (
          <h3 key={idx} className="text-xs font-bold tracking-wider text-[#D7DCE5] mt-5 mb-2 font-mono uppercase">
            {trimmed.substring(3)}
          </h3>
        );
      }

      // Strong / Bold indicators
      if (trimmed.startsWith('- **') || trimmed.startsWith('* **')) {
        const rest = trimmed.substring(2);
        const boldMatch = rest.match(/^\*\*(.*?)\*\*(.*)$/);
        if (boldMatch) {
          return (
            <div key={idx} className="flex items-start space-x-2 pl-2 py-1 text-xs text-[#6B7280]">
              <span className="text-[#16C784] mt-1.5 shrink-0 w-1 h-1 rounded-full bg-[#16C784]"></span>
              <span>
                <strong className="font-bold text-[#D7DCE5] font-sans">{boldMatch[1]}</strong>
                {boldMatch[2]}
              </span>
            </div>
          );
        }
      }

      // Ordinary bullets
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start space-x-2 pl-2 py-1 text-xs text-[#6B7280]">
            <span className="text-[#4B5563] mt-1.5 shrink-0 w-1 h-1 rounded-full bg-[#4B5563]"></span>
            <span>{trimmed.substring(2)}</span>
          </div>
        );
      }

      // Formulas (EV formula style box)
      if (trimmed.startsWith('**EV =')) {
        return (
          <div key={idx} className="my-3 p-3 bg-[#0A0C10] border border-[#1F2430] text-[#16C784] font-mono rounded-[2px] text-center text-xs font-bold">
            {trimmed.replace(/\*\*/g, '')}
          </div>
        );
      }

      // Table parsing
      if (trimmed.startsWith('|') && lines[idx - 1]?.includes('---')) {
        return null;
      }
      if (trimmed.startsWith('|') && !trimmed.includes('---') && !trimmed.includes('Session / Window')) {
        const cols = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
        return (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-[#0A0C10]/80 p-2.5 border border-[#1F2430] rounded-[2px] text-xs my-2">
            <div className="font-bold text-[#22D3EE] font-mono">{cols[0]}</div>
            <div className="font-mono text-[#6B7280] md:text-center bg-[#12151B] py-0.5 rounded-[2px] px-1.5 border border-[#1F2430]">{cols[1]}</div>
            <div className="font-mono text-[#6B7280] md:text-center">{cols[2]}</div>
            <div className="md:col-span-1 text-[#6B7280] font-sans">{cols[3]}</div>
          </div>
        );
      }
      if (trimmed.startsWith('|') && trimmed.includes('Session / Window')) {
        return null;
      }

      // Rule highlight paragraph
      if (trimmed.startsWith('*Golden Rule:') || trimmed.startsWith('*Tip:') || trimmed.startsWith('*Rule:')) {
        return (
          <div key={idx} className="p-3 bg-[#16C784]/5 border border-[#16C784]/15 text-[#16C784] rounded-[2px] text-xs leading-normal my-3 italic font-sans">
            {trimmed.replace(/\*/g, '')}
          </div>
        );
      }

      // Default paragraph
      return (
        <p key={idx} className="text-xs text-[#6B7280] leading-relaxed py-0.5 font-sans">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="space-y-4 animate-fade-in" id="im_reference_view">
      
      {/* HEADER CARD */}
      <div className="bg-[#12151B] border border-[#1F2430] p-5 rounded-[2px] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <h2 className="text-xs font-bold font-mono text-[#D7DCE5] uppercase tracking-wider flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-500" /> Smart Money Concepts (SMC) Reference Manual
        </h2>
        <p className="text-[10px] text-[#6B7280] mt-1">
          The core model reference protocol for the Institutional Mirror system. Review these directives daily to prevent emotional bias.
        </p>
      </div>

      {/* ACCORDION CONTAINER */}
      <div className="space-y-2" id="im_accordion_container">
        {REFERENCE_SECTIONS.map((section) => {
          const isOpen = openSection === section.id;
          return (
            <div
              key={section.id}
              className={`bg-[#12151B] border rounded-[2px] transition-all overflow-hidden
                ${isOpen ? 'border-[#1F2430]' : 'border-[#1F2430]/60 hover:border-[#1F2430]'}`}
              id={`im_ref_acc_${section.id}`}
            >
              {/* ACCORDION TRIGGER */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-3 text-left select-none focus:outline-none"
              >
                <div className="flex items-center space-x-2.5">
                  <span className="text-[8px] font-bold font-mono tracking-wider bg-[#1F2430] text-[#6B7280] px-1.5 py-0.5 rounded-[1px] uppercase">
                    {section.category}
                  </span>
                  <span className="text-xs font-bold font-mono text-[#D7DCE5] hover:text-[#16C784] transition-colors uppercase">
                    {section.title}
                  </span>
                </div>
                <div className="text-[#6B7280]">
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-amber-500" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </div>
              </button>

              {/* ACCORDION CONTENT */}
              {isOpen && (
                <div className="px-4 pb-4 pt-1.5 border-t border-[#1F2430] bg-[#0A0C10]/20">
                  <div className="space-y-1 font-sans">
                    {renderFormattedContent(section.content)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DATA SYSTEM PURGE ACTUATOR */}
      <div className="bg-[#12151B] border border-[#1F2430] p-5 rounded-[2px] flex flex-col md:flex-row md:items-center justify-between gap-4 mt-6" id="im_data_purge_actuator">
        <div>
          <h3 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#EA3943] flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 animate-pulse" /> SYSTEM RESET GATEWAY
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-1">
            Purges all journal records, backtest checklists, and customized settings cached inside this browser's local sandbox storage.
          </p>
        </div>
        <button
          onClick={() => setShowResetModal(true)}
          className="px-4 py-2 bg-[#EA3943]/10 hover:bg-[#EA3943]/20 border border-[#EA3943]/30 text-[#EA3943] font-bold text-[10px] rounded-[2px] transition-all tracking-wider font-mono shrink-0 uppercase"
          id="im_show_reset_modal_btn"
        >
          RESET ALL LOCAL DATA
        </button>
      </div>

      {/* SYSTEM CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-[#0A0C10]/95 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" id="im_reset_modal_overlay">
          <div className="bg-[#12151B] border border-[#1F2430] p-5 rounded-[2px] max-w-sm w-full shadow-2xl relative">
            
            <h3 className="text-xs font-bold font-mono tracking-wider text-[#EA3943] uppercase flex items-center gap-1.5">
              <AlertOctagon className="w-4 h-4 text-[#EA3943] shrink-0 animate-bounce" /> DESTRUCTIVE PROTOCOL
            </h3>
            <p className="text-[11px] text-[#6B7280] leading-normal mt-2 font-sans">
              You are about to flush all logged trades and local preferences. This action is final and irreversible.
            </p>

            {resetSuccess ? (
              <div className="p-3 bg-[#16C784]/10 border border-[#16C784]/25 rounded-[2px] mt-4 text-center text-[#16C784] text-[10px] font-mono flex flex-col items-center gap-2">
                <CheckCircle className="w-5 h-5 animate-bounce" />
                <span>SANDBOX PURGED — REBOOTING PROTOCOLS</span>
              </div>
            ) : (
              <form onSubmit={handleResetPurge} className="mt-4 space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-[#6B7280] uppercase">TYPE <strong className="text-[#EA3943] font-bold">RESET</strong> TO CONFIRM PROTOCOL</label>
                  <input
                    type="text"
                    value={resetInput}
                    onChange={(e) => setResetInput(e.target.value)}
                    placeholder="RESET"
                    className="w-full bg-[#0A0C10] border border-[#1F2430] rounded-[2px] py-1.5 px-3 text-center text-xs font-mono font-extrabold tracking-widest text-[#EA3943] focus:outline-none focus:border-[#EA3943] transition-all"
                    required
                    autoFocus
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(false);
                      setResetInput('');
                    }}
                    className="py-2 bg-[#0A0C10] border border-[#1F2430] hover:bg-[#1F2430]/30 text-[#6B7280] font-bold text-[10px] rounded-[2px] transition-all tracking-wider font-mono uppercase"
                  >
                    ABORT
                  </button>
                  <button
                    type="submit"
                    disabled={resetInput !== 'RESET'}
                    className={`py-2 text-[10px] font-bold rounded-[2px] transition-all tracking-wider font-mono uppercase
                      ${resetInput === 'RESET'
                        ? 'bg-[#EA3943] text-[#0A0C10] font-extrabold hover:brightness-110 cursor-pointer'
                        : 'bg-[#0A0C10] text-[#6B7280]/40 cursor-not-allowed border border-[#1F2430]'
                      }`}
                  >
                    PURGE ALL
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
