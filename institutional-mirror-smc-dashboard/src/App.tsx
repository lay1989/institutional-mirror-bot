import React, { useState, useEffect, useRef } from 'react';
import DashboardTab from './components/DashboardTab';
import CalculatorTab from './components/CalculatorTab';
import ChecklistTab from './components/ChecklistTab';
import JournalTab from './components/JournalTab';
import ReferenceTab from './components/ReferenceTab';
import { Eye, ShieldCheck, Activity, BookOpen, Calculator, ClipboardCheck, AlertTriangle } from 'lucide-react';

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzjK7wrcMSopxOHL0KC2bBTsdbF-qNYteiAcyhHj-EyLNqY2-nw9yYZUTNuJECsCUXJ/exec';
const DATA_URL_PRIMARY = 'https://raw.githubusercontent.com/lay1989/institutional-mirror-bot/main/data/latest.json';
const DATA_URL_FALLBACK: string = ''; // Fallback data source if primary is unreachable

// Helper to perform cache-busting fetch with a timeout
const fetchWithTimeout = async (url: string, timeoutMs: number = 5000): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const separator = url.includes('?') ? '&' : '?';
    const cacheBustedUrl = `${url}${separator}t=${Date.now()}`;
    const res = await fetch(cacheBustedUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

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
  const [isDataStale, setIsDataStale] = useState<boolean>(false);

  const fetchBotData = async () => {
    let data: any = null;
    let fetchedSuccessfully = false;

    // 1. Try Primary Data Source
    try {
      data = await fetchWithTimeout(DATA_URL_PRIMARY, 5000);
      fetchedSuccessfully = true;
    } catch (primaryErr) {
      console.warn('Primary bot data fetch failed or timed out:', primaryErr);
      
      // 2. Try Fallback Data Source if specified
      if (DATA_URL_FALLBACK && DATA_URL_FALLBACK.trim() !== '') {
        try {
          data = await fetchWithTimeout(DATA_URL_FALLBACK.trim(), 5000);
          fetchedSuccessfully = true;
        } catch (fallbackErr) {
          console.error('Fallback bot data fetch also failed:', fallbackErr);
        }
      }
    }

    if (fetchedSuccessfully && data) {
      setBotData(data);
      setFetchFailed(false);
      localStorage.setItem('im_last_bot_data', JSON.stringify(data));
    } else {
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
      setIsDataStale(false);
      return;
    }
    const updateText = () => {
      const generatedTime = new Date(botData.generatedAtUTC).getTime();
      if (isNaN(generatedTime)) {
        setLastUpdatedText('');
        setIsDataStale(false);
        return;
      }
      const diffSecs = Math.max(0, Math.floor((Date.now() - generatedTime) / 1000));
      
      let timeStr = '';
      if (diffSecs < 60) {
        timeStr = `${diffSecs}s ago`;
      } else if (diffSecs < 3600) {
        const mins = Math.floor(diffSecs / 60);
        timeStr = `${mins}m ago`;
      } else {
        const hours = Math.floor(diffSecs / 3600);
        timeStr = `${hours}h ago`;
      }

      setLastUpdatedText(`Last updated: ${timeStr}`);
      // Stale if exceeds 20 minutes (1200 seconds)
      setIsDataStale(diffSecs >= 1200);
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
            botData={botData}
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
    <div className="min-h-screen bg-[#0A0C10] text-[#D7DCE5] font-sans flex flex-col justify-between" id="im_master_app_root">
      
      {/* FIXED / STICKY HEADER & TOP NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#12151B] border-b border-[#1F2430] backdrop-blur-md" id="im_master_header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between py-2 lg:h-14 lg:py-0 gap-2 lg:gap-0">
            
            {/* Branding Logo Block */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start lg:items-center text-center sm:text-left gap-2">
              <div className="w-7 h-7 rounded-[2px] bg-[#1F2430] border border-[#22D3EE]/30 flex items-center justify-center text-[#22D3EE] font-bold text-xs tracking-tighter shrink-0 font-mono">
                IM
              </div>
              <div className="flex flex-col items-center sm:items-start">
                <h1 className="text-xs font-bold tracking-wider text-[#D7DCE5] uppercase flex flex-wrap items-center justify-center sm:justify-start gap-1.5 leading-none">
                  <span>Institutional Mirror</span>
                  <span className="text-[9px] bg-[#22D3EE]/10 border border-[#22D3EE]/30 text-[#22D3EE] py-0.5 px-1.5 rounded-[2px] font-mono font-normal">SMC PROTOCOL</span>
                </h1>
                <span className="text-[9px] font-mono text-[#6B7280] tracking-wider mt-0.5">Smart Money Concepts Execution Matrix</span>
              </div>
            </div>
 
            {/* Top Navbar Tabs */}
            <div className="flex flex-col lg:flex-row items-center justify-center lg:justify-end gap-2.5 w-full lg:w-auto">
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {showSyncedIndicator && (
                  <div 
                    className="flex items-center gap-1 px-2 py-0.5 bg-[#16C784]/10 border border-[#16C784]/20 text-[#16C784] rounded-[2px] text-[9px] font-mono animate-pulse shrink-0"
                    id="im_sheets_sync_indicator"
                  >
                    <span className="w-1 h-1 rounded-full bg-[#16C784]"></span>
                    <span>Synced</span>
                  </div>
                )}
                {lastUpdatedText && (
                  <div 
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-[2px] border shrink-0 flex items-center gap-1.5 transition-colors ${
                      isDataStale 
                        ? 'bg-[#EA3943]/15 border-[#EA3943]/40 text-[#EA3943] font-bold shadow-[0_0_10px_rgba(234,57,67,0.15)]' 
                        : 'bg-[#12151B] border-[#1F2430] text-[#6B7280]'
                    }`} 
                    id="im_bot_last_updated"
                  >
                    {isDataStale && <AlertTriangle className="w-3 h-3 text-[#EA3943] shrink-0 animate-pulse" />}
                    <span>{lastUpdatedText}</span>
                    {isDataStale && (
                      <span className="bg-[#EA3943]/20 border border-[#EA3943]/30 px-1 py-0.2 rounded text-[8px] uppercase tracking-wider text-[#EA3943] font-extrabold">
                        ⚠ Data may be stale
                      </span>
                    )}
                  </div>
                )}
              </div>
              <nav className="flex flex-nowrap items-center space-x-1 overflow-x-auto max-w-full pb-1 lg:pb-0 scrollbar-none snap-x w-full lg:w-auto justify-start lg:justify-end" id="im_top_navbar">
                {[
                  { id: 'dashboard', label: 'DASHBOARD', icon: <Activity className="w-3 h-3" /> },
                  { id: 'calculator', label: 'CALCULATOR', icon: <Calculator className="w-3 h-3" /> },
                  { id: 'checklist', label: 'CHECKLIST', icon: <ClipboardCheck className="w-3 h-3" /> },
                  { id: 'journal', label: 'JOURNAL', icon: <BookOpen className="w-3 h-3" /> },
                  { id: 'reference', label: 'REFERENCE', icon: <Eye className="w-3 h-3" /> }
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-2.5 py-1 rounded-[2px] text-[11px] font-medium tracking-wider transition-all flex items-center gap-1 border shrink-0 snap-start font-mono
                        ${isActive
                          ? 'bg-[#22D3EE]/10 border-[#22D3EE]/30 text-[#22D3EE]'
                          : 'bg-transparent border-transparent text-[#6B7280] hover:text-[#D7DCE5] hover:bg-[#12151B]'
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
        <div className="bg-[#EA3943]/10 border-b border-[#EA3943]/20 px-4 py-1 text-center text-[10px] text-[#EA3943] flex items-center justify-center gap-1.5" id="im_fetch_failed_banner">
          <span className="w-1 h-1 rounded-full bg-[#EA3943] animate-pulse"></span>
          <span>Couldn't reach live data — showing last known state.</span>
        </div>
      )}
 
      {/* PRIMARY VIEWS CONTENT MAIN BLOCK */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 flex-1">
        {renderActiveTab()}
      </main>
 
      {/* CENTRAL STRATEGY FOOTER */}
      <footer className="bg-[#12151B] border-t border-[#1F2430] py-2" id="im_master_footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-[9px] font-mono text-[#4B5563] tracking-wider">
          Institutional Mirror &mdash; Personal strategy tool &mdash; Not financial advice &mdash; Manage your risk strictly
        </div>
      </footer>

    </div>
  );
}
