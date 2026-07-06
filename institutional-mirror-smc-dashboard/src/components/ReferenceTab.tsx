import React, { useState } from 'react';
import { REFERENCE_SECTIONS } from '../data';
import { ChevronDown, ChevronUp, AlertOctagon, HelpCircle, RefreshCw, CheckCircle } from 'lucide-react';

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
      if (trimmed === '') return <div key={idx} className="h-2"></div>;

      // H3 Headers
      if (trimmed.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-xs font-mono font-bold tracking-widest uppercase text-sky-400 mt-4 mb-2 pb-1 border-b border-zinc-800">
            {trimmed.substring(4)}
          </h4>
        );
      }

      // H2 Headers
      if (trimmed.startsWith('## ')) {
        return (
          <h3 key={idx} className="text-sm font-semibold tracking-wide text-zinc-200 mt-5 mb-2.5">
            {trimmed.substring(3)}
          </h3>
        );
      }

      // Strong / Bold indicators
      // Replace **text** with <strong> elements
      if (trimmed.startsWith('- **') || trimmed.startsWith('* **')) {
        // Bullet list item with bold start
        const rest = trimmed.substring(2);
        const boldMatch = rest.match(/^\*\*(.*?)\*\*(.*)$/);
        if (boldMatch) {
          return (
            <div key={idx} className="flex items-start space-x-2 pl-3 py-1 text-xs text-zinc-300">
              <span className="text-emerald-400 mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>
                <strong className="font-semibold text-zinc-100">{boldMatch[1]}</strong>
                {boldMatch[2]}
              </span>
            </div>
          );
        }
      }

      // Ordinary bullets
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start space-x-2 pl-3 py-1 text-xs text-zinc-300">
            <span className="text-zinc-500 mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
            <span>{trimmed.substring(2)}</span>
          </div>
        );
      }

      // Formulas (EV formula style box)
      if (trimmed.startsWith('**EV =')) {
        return (
          <div key={idx} className="my-3 p-3.5 bg-[#0d1117] border border-emerald-500/30 text-[#00ff88] font-mono rounded text-center text-xs font-bold shadow-inner">
            {trimmed.replace(/\*\*/g, '')}
          </div>
        );
      }

      // Table parsing
      if (trimmed.startsWith('|') && lines[idx - 1]?.includes('---')) {
        // Divider row skip
        return null;
      }
      if (trimmed.startsWith('|') && !trimmed.includes('---') && !trimmed.includes('Session / Window')) {
        const cols = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
        return (
          <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-[#0d1117]/80 p-3 border border-zinc-850 rounded-md text-xs my-2 font-sans">
            <div className="font-bold text-[#00ff88] font-mono">{cols[0]}</div>
            <div className="font-mono text-zinc-400 md:text-center bg-zinc-900/50 py-0.5 rounded px-1">{cols[1]}</div>
            <div className="font-mono text-zinc-400 md:text-center">{cols[2]}</div>
            <div className="md:col-span-1 text-zinc-300">{cols[3]}</div>
          </div>
        );
      }
      if (trimmed.startsWith('|') && trimmed.includes('Session / Window')) {
        // Table header: hide or style
        return null;
      }

      // Rule highlight paragraph
      if (trimmed.startsWith('*Golden Rule:') || trimmed.startsWith('*Tip:') || trimmed.startsWith('*Rule:')) {
        return (
          <div key={idx} className="p-3 bg-emerald-500/5 border border-emerald-500/20 text-[#00ff88] rounded text-xs leading-relaxed my-3 italic">
            {trimmed.replace(/\*/g, '')}
          </div>
        );
      }

      // Default paragraph
      return (
        <p key={idx} className="text-xs text-zinc-300 leading-relaxed py-1">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="space-y-6" id="im_reference_view">
      
      {/* HEADER CARD */}
      <div className="bg-[#161b22] border border-zinc-800/80 p-6 rounded-lg shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#ffd700]/5 rounded-full blur-3xl pointer-events-none"></div>
        <h2 className="text-lg font-semibold text-[#e6edf3] tracking-tight flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#ffd700]" /> Smart Money Concepts (SMC) Reference Manual
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          The official algorithm guide for the Institutional Mirror protocol. Consult these chapters daily to maintain precision.
        </p>
      </div>

      {/* ACCORDION CONTAINER */}
      <div className="space-y-3" id="im_accordion_container">
        {REFERENCE_SECTIONS.map((section) => {
          const isOpen = openSection === section.id;
          return (
            <div
              key={section.id}
              className={`bg-[#161b22] border rounded-lg transition-all overflow-hidden shadow-md
                ${isOpen ? 'border-zinc-700/80' : 'border-zinc-850 hover:border-zinc-700/40'}`}
              id={`im_ref_acc_${section.id}`}
            >
              {/* ACCORDION TRIGGER */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-4 text-left select-none focus:outline-none"
              >
                <div className="flex items-center space-x-3">
                  <span className="text-[10px] font-bold font-mono tracking-wider bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded uppercase">
                    {section.category}
                  </span>
                  <span className="text-xs font-bold text-zinc-200 tracking-wide hover:text-white transition-colors">
                    {section.title}
                  </span>
                </div>
                <div className="text-zinc-500">
                  {isOpen ? <ChevronUp className="w-4 h-4 text-[#ffd700]" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* ACCORDION CONTENT */}
              {isOpen && (
                <div className="px-5 pb-5 pt-1 border-t border-zinc-850/80 bg-[#0d1117]/30">
                  <div className="space-y-1.5 font-sans">
                    {renderFormattedContent(section.content)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DATA SYSTEM PURGE ACTUATOR */}
      <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 mt-8" id="im_data_purge_actuator">
        <div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-rose-500 flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 animate-pulse" /> SYSTEM RESET GATEWAY
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Purges all journal histories, checklists, and preferences cached within this browser storage. This action is irreversible.
          </p>
        </div>
        <button
          onClick={() => setShowResetModal(true)}
          className="px-5 py-2.5 bg-[#ff4444]/15 hover:bg-[#ff4444]/25 border border-rose-500/40 text-[#ff4444] font-bold text-xs rounded transition-all tracking-wider font-mono shrink-0"
          id="im_show_reset_modal_btn"
        >
          RESET ALL DATA
        </button>
      </div>

      {/* SYSTEM CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-[#0d1117]/95 flex items-center justify-center p-4 backdrop-blur-sm" id="im_reset_modal_overlay">
          <div className="bg-[#161b22] border border-rose-500/30 p-6 rounded-lg max-w-sm w-full shadow-2xl relative">
            
            <h3 className="text-sm font-bold tracking-wider text-rose-500 uppercase flex items-center gap-1.5">
              <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" /> IRREVERSIBLE ACTION DETECTED
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed mt-2">
              You are about to flush all logged trades and preferences from this app instance.
            </p>

            {resetSuccess ? (
              <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded mt-4 text-center text-[#00ff88] text-xs font-mono flex flex-col items-center gap-2">
                <CheckCircle className="w-6 h-6 animate-bounce" />
                <span>DATA PURGED SUCCESSFUL — RELOADING SYSTEM</span>
              </div>
            ) : (
              <form onSubmit={handleResetPurge} className="mt-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-zinc-500">TYPE <strong className="text-rose-400 font-bold font-mono">RESET</strong> TO CONFIRM DESTRUCTION</label>
                  <input
                    type="text"
                    value={resetInput}
                    onChange={(e) => setResetInput(e.target.value)}
                    placeholder="RESET"
                    className="w-full bg-[#0d1117] border border-zinc-800 rounded py-2 px-3 text-center text-xs font-mono font-extrabold tracking-widest text-[#ff4444] focus:outline-none focus:border-rose-500"
                    required
                    autoFocus
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetModal(false);
                      setResetInput('');
                    }}
                    className="py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded transition-all tracking-wider"
                  >
                    ABORT
                  </button>
                  <button
                    type="submit"
                    disabled={resetInput !== 'RESET'}
                    className={`py-2 text-xs font-bold rounded transition-all tracking-wider font-mono
                      ${resetInput === 'RESET'
                        ? 'bg-rose-600 text-zinc-950 font-extrabold hover:bg-rose-500 cursor-pointer'
                        : 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
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
