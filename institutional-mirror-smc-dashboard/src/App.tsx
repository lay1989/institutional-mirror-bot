import React, { useState, useEffect, useRef } from 'react';
import DashboardTab from './components/DashboardTab';
import CalculatorTab from './components/CalculatorTab';
import ChecklistTab from './components/ChecklistTab';
import JournalTab from './components/JournalTab';
import ReferenceTab from './components/ReferenceTab';
import { Eye, ShieldCheck, Activity, BookOpen, Calculator, ClipboardCheck } from 'lucide-react';

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzjK7wrcMSopxOHL0KC2bBTsdbF-qNYteiAcyhHj-EyLNqY2-nw9yYZUTNuJECsCUXJ/exec';
const BOT_URL = 'https://raw.githubusercontent.com/lay1989/institutional-mirror-bot/main/data/latest.json';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    const val = localStorage.getItem('im_active_tab');
    return val || 'dashboard';
  });

  // State bridge to prefill journal entries from the confluence checklist
  const [prefilledSetup, setPrefilledSetup] = useState<any | null>(null);

  // Sheets Sync indicator state and ref for automatic clear
  const [showSyncedIndicator, setShowSyncedIndicator] = useState(false);
  const syncTimeoutRef = useRef<any>(null);

  // Bot Live Data states
  const [botData, setBotData] = useState<any>(null);
  const [fetchFailed, setFetchFailed] = useState<boolean>(false);
  const [lastUpdatedText, setLastUpdatedText] = useState<string>('');

  const fetchBotData = async () => {
    try {
      const res = await fetch(BOT_URL);
      if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status}`);
      }
      const data = await res.json();
      setBotData(data);
      setFetchFailed(false);
      localStorage.setItem('im_last_bot_data', JSON.stringify(data));
    } catch (err) {
      console.error('Error fetching bot data:', err);
      setFetchFailed(true);
      const cached = localStorage.getItem('im_last_bot_data');
      if (cached) {
        try {
          setBotData(JSON.parse(cached));
        } catch (_) {}
      }
    }
  };

  useEffect(() => {
    fetchBotData();
    const interval = setInterval(fetchBotData, 45000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!botData || !botData.generatedAtUTC) {
      setLastUpdatedText('');
      return;
    }
    const updateText = () => {
      const generatedTime = new Date(botData.generatedAtUTC).getTime();
      if (isNaN(generatedTime)) {
        setLastUpdatedText('');
        return;
      }
      const diffSecs = Math.max(0, Math.floor((Date.now() - generatedTime) / 1000));
      setLastUpdatedText(`Last updated: ${diffSecs}s ago`);
    };

    updateText();
    const interval = setInterval(updateText, 1000);
    return () => clearInterval(interval);
  }, [botData]);

  // Sync function as requested
  const syncToSheets = async (action: string, payload: any) => {
    try {
      setShowSyncedIndicator(true);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        setShowSyncedIndicator(false);
      }, 3000);

      await fetch(SHEETS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
      });
    } catch (err) {
      console.error('Error syncing to Google Sheets:', err);
    }
  };

  // Sync active tab to local storage
  useEffect(() => {
    localStorage.setItem('im_active_tab', activeTab);
  }, [activeTab]);

  // Synchronize state changes across multiple open tabs in the browser
  useEffect(() => {
    const handleSync = (e: StorageEvent) => {
      // If active tab changed in another browser window, sync it (optional but keeps them aligned)
      if (e.key === 'im_active_tab' && e.newValue) {
        setActiveTab(e.newValue);
      }
    };
    window.addEventListener('storage', handleSync);
    return () => window.removeEventListener('storage', handleSync);
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab onSetActiveTab={setActiveTab} syncToSheets={syncToSheets} botData={botData} />;
      case 'calculator':
        return <CalculatorTab />;
      case 'checklist':
        return (
          <ChecklistTab 
            onSetActiveTab={setActiveTab} 
            onSetPrefilledSetup={setPrefilledSetup} 
          />
        );
      case 'journal':
        return (
          <JournalTab 
            prefilledSetup={prefilledSetup} 
            onClearPrefilledSetup={() => setPrefilledSetup(null)} 
            syncToSheets={syncToSheets}
            botData={botData}
          />
        );
      case 'reference':
        return <ReferenceTab />;
      default:
        return <DashboardTab onSetActiveTab={setActiveTab} syncToSheets={syncToSheets} botData={botData} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-sans flex flex-col justify-between" id="im_master_app_root">
      
      {/* FIXED / STICKY HEADER & TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#161b22]/95 border-b border-zinc-800/80 backdrop-blur-md" id="im_master_header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 flex-col md:flex-row py-2 md:py-0">
            
            {/* Branding Logo Block */}
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded bg-gradient-to-tr from-emerald-500 to-[#00ff88] flex items-center justify-center text-zinc-950 font-black tracking-tighter shadow-md shadow-emerald-500/10">
                IM
              </div>
              <div>
                <h1 className="text-sm font-black tracking-widest text-white uppercase flex items-center gap-1.5 leading-none">
                  Institutional Mirror <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-[#00ff88] py-0.5 px-1.5 rounded font-mono font-normal">SMC PROTOCOL</span>
                </h1>
                <span className="text-[10px] font-mono text-zinc-400 tracking-wider">Smart Money Concepts Execution Matrix</span>
              </div>
            </div>

            {/* Top Navbar Tabs */}
            <div className="flex items-center gap-4 mt-2 md:mt-0">
              {showSyncedIndicator && (
                <div 
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-[#00ff88] rounded-full text-[10px] font-mono animate-pulse"
                  id="im_sheets_sync_indicator"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>Synced to Sheets</span>
                </div>
              )}
              {lastUpdatedText && (
                <div className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800" id="im_bot_last_updated">
                  {lastUpdatedText}
                </div>
              )}
              <nav className="flex space-x-1" id="im_top_navbar">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-3.5 h-3.5" /> },
                  { id: 'calculator', label: 'Calculator', icon: <Calculator className="w-3.5 h-3.5" /> },
                  { id: 'checklist', label: 'Checklist', icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
                  { id: 'journal', label: 'Journal', icon: <BookOpen className="w-3.5 h-3.5" /> },
                  { id: 'reference', label: 'Reference', icon: <Eye className="w-3.5 h-3.5" /> }
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 border
                        ${isActive
                          ? 'bg-[#00ff88]/10 border-[#00ff88]/35 text-[#00ff88] shadow-sm'
                          : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                        }`}
                      id={`im_nav_tab_${tab.id}`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

          </div>
        </div>
      </header>

      {fetchFailed && (
        <div className="bg-amber-500/10 border-b border-yellow-500/20 px-4 py-2 text-center text-xs text-yellow-500 flex items-center justify-center gap-2" id="im_fetch_failed_banner">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
          <span>Couldn't reach live data — showing last known state.</span>
        </div>
      )}

      {/* PRIMARY VIEWS CONTENT MAIN BLOCK */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 flex-1">
        {renderActiveTab()}
      </main>

      {/* CENTRAL STRATEGY FOOTER */}
      <footer className="bg-[#161b22] border-t border-zinc-800/80 py-4" id="im_master_footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-[11px] font-mono text-zinc-500 tracking-wide">
          Institutional Mirror &mdash; Personal strategy tool &mdash; Not financial advice &mdash; Manage your risk strictly
        </div>
      </footer>

    </div>
  );
}
