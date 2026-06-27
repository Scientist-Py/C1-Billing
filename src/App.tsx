import { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { ActiveCustomers } from './components/ActiveCustomers';
import { CustomerDetails } from './components/CustomerDetails';
import { CheckoutModal } from './components/CheckoutModal';
import { MenuManagement } from './components/MenuManagement';
import { CustomerHistory } from './components/CustomerHistory';
import { Reports } from './components/Reports';
import { Settings } from './components/Settings';
import { NewCustomerModal } from './components/NewCustomerModal';
import { AutoLockScreen } from './components/AutoLockScreen';
import type { User, Customer, CafeSettings, Bill } from './types';
import { initDB, seedDefaultData, getSettings, getActiveCustomers, saveAuditLog, syncToGoogleSheets } from './utils/db';
import { generateWelcomeGreeting, speakText } from './utils/ai';
import { ShieldAlert, Terminal, Play } from 'lucide-react';

const checkIsWindows = (): boolean => {
  if (typeof window === 'undefined') return true;
  const userAgent = window.navigator.userAgent;
  const platform = (window.navigator as any).platform || '';
  return userAgent.includes('Windows') || platform.includes('Win');
};

const IS_WINDOWS_DEVICE = checkIsWindows();

const AccessDeniedScreen = () => {
  const [hasInteracted, setHasInteracted] = useState(false);

  const getDeviceName = (): string => {
    const ua = window.navigator.userAgent;
    if (/Android/i.test(ua)) return 'Android device';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Macintosh/i.test(ua)) return 'Mac computer';
    if (/Linux/i.test(ua)) return 'Linux machine';
    return 'unauthorized device';
  };

  const deviceName = getDeviceName();
  const warningText = `This billing system you are trying to run on ${deviceName} like Android or iPhone or anywhere is prohibited. Please contact the administration for access.`;

  const speakWarning = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(warningText);
      const voices = window.speechSynthesis.getVoices();
      
      const voice = voices.find(v => 
        v.lang.startsWith('en') && 
        (v.name.includes('Neural') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Microsoft'))
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = 0.92;
      utterance.pitch = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  };

  useEffect(() => {
    speakWarning();

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        speakWarning();
      };
    }

    const handleGlobalClick = () => {
      speakWarning();
      setHasInteracted(true);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('touchstart', handleGlobalClick);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('touchstart', handleGlobalClick);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-[#060608] flex flex-col items-center justify-center p-6 text-white font-mono select-none z-50 overflow-hidden">
      {/* Scanning laser line effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%] pointer-events-none z-20" />
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500/20 shadow-[0_0_20px_#ef4444] animate-scanline pointer-events-none z-20" />
      
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-red-950/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-red-900/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md p-8 border border-red-500/25 bg-[#0f0f12]/80 backdrop-blur-2xl rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.15)] relative z-10 space-y-6 flex flex-col items-center">
        
        {/* Hacker Alert Shield Logo */}
        <div className="w-20 h-20 rounded-2xl bg-red-950/50 border border-red-500/40 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse">
          <ShieldAlert className="w-10 h-10" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-red-500 text-lg font-bold tracking-widest uppercase flex items-center justify-center gap-2">
            <span>Security Warning</span>
          </h2>
          <p className="text-[11px] text-[#86868b] font-light leading-relaxed">
            This digital billing console is restricted to authorized Chapter One POS terminals only.
          </p>
        </div>

        {/* Console Terminal Screen */}
        <div className="w-full bg-black/90 rounded-xl p-4.5 border border-red-500/15 space-y-3.5 text-xs text-red-400 font-mono relative overflow-hidden shadow-inner">
          <div className="flex items-center justify-between text-[9px] text-red-500/50 uppercase border-b border-red-500/10 pb-2">
            <div className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>terminal_shield_v1.0.8</span>
            </div>
            <span className="animate-pulse">● online</span>
          </div>

          <div className="space-y-1.5 text-[10px] leading-relaxed">
            <div className="flex justify-between">
              <span className="text-red-500/60">[REQUEST_PLATFORM]</span>
              <span className="font-semibold">{deviceName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-500/60">[ACCESS_STATUS]</span>
              <span className="font-bold text-red-500 animate-pulse">PROHIBITED</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-500/60">[POLICY_ENFORCED]</span>
              <span>WINDOWS_ONLY</span>
            </div>
          </div>
          
          <div className="text-[9px] text-red-500/40 leading-relaxed font-light border-t border-red-500/10 pt-2 text-center">
            EXCEPTION TRIGGERED: UNAUTHORIZED_OS
          </div>
        </div>

        {/* Autoplay / Gesture Fallback Button */}
        {!hasInteracted && (
          <button 
            onClick={() => {
              speakWarning();
              setHasInteracted(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-red-950/60 hover:bg-red-900/60 text-red-400 font-bold border border-red-500/35 rounded-xl transition-all text-xs cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.1)] hover:shadow-[0_0_15px_rgba(239,68,68,0.2)]"
          >
            <Play className="w-3.5 h-3.5 fill-red-400" />
            <span>INITIALIZE SECURITY AUDIBLE</span>
          </button>
        )}

        <div className="text-center text-[10px] text-red-500/60 leading-relaxed font-light mt-2 animate-pulse">
          IP log captured. Administrator has been notified.
        </div>

      </div>
    </div>
  );
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  
  // Navigation tabs
  const [currentTab, setTab] = useState<string>('dashboard');
  
  // State lists
  const [activeCustomers, setActiveCustomers] = useState<Customer[]>([]);
  
  // Sub-views & Modals
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [checkoutCustomer, setCheckoutCustomer] = useState<Customer | null>(null);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  
  // Selected Customer details object
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAutoLocked, setIsAutoLocked] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initDB();
        await seedDefaultData();
        const cafeSettings = await getSettings();
        if (cafeSettings) {
          setSettings(cafeSettings);
        }
        await reloadActiveCustomers();
      } catch (err) {
        console.error('Failed to initialize app', err);
      }
    };
    initializeApp();
  }, []);

  // Inactivity auto-lock timer (2 minutes = 120,000ms of user idle time)
  useEffect(() => {
    if (!currentUser || isAutoLocked) return;

    let timeoutId: number;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setIsAutoLocked(true);
      }, 120000);
    };

    // Listen to all relevant user activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Start timer on mount/active session
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser, isAutoLocked]);

  // Listen to browser window/tab close to automatically trigger Google Sheet logout sync
  useEffect(() => {
    if (!currentUser) return;

    const handleWindowClose = () => {
      const sessionId = localStorage.getItem('pos_session_id');
      const loginTimeStr = localStorage.getItem('pos_session_start');
      if (!sessionId) return;

      let durationMinutes = 0;
      if (loginTimeStr) {
        const loginTime = new Date(loginTimeStr);
        const durationMs = new Date().getTime() - loginTime.getTime();
        durationMinutes = Math.max(0, Math.round(durationMs / 60000));
      }

      const logoutTime = new Date().toISOString();

      saveAuditLog(currentUser.id, currentUser.username, 'LOGOUT_BROWSER_CLOSE', 'User closed the browser/tab');

      // Sync staff logout to Google Sheets using a keepalive request
      if (settings?.googleSheetsUrl) {
        fetch(settings.googleSheetsUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'STAFF_LOGOUT',
            payload: {
              sessionId,
              userId: currentUser.id,
              username: currentUser.username,
              logoutTime,
              durationMinutes
            }
          }),
          keepalive: true
        }).catch((err) => {
          console.warn('Browser close Google Sheets sync failed:', err);
        });
      }

      // Clear session from localStorage
      localStorage.removeItem('pos_session_id');
      localStorage.removeItem('pos_session_start');
    };

    window.addEventListener('beforeunload', handleWindowClose);

    return () => {
      window.removeEventListener('beforeunload', handleWindowClose);
    };
  }, [currentUser, settings]);

  // Update selected customer details live when active customers list reloads
  useEffect(() => {
    if (selectedCustomerId) {
      const match = activeCustomers.find(c => c.id === selectedCustomerId);
      setSelectedCustomer(match || null);
      if (!match) {
        setSelectedCustomerId(null); // customer checked out
      }
    } else {
      setSelectedCustomer(null);
    }
  }, [selectedCustomerId, activeCustomers]);

  const reloadActiveCustomers = async () => {
    try {
      const list = await getActiveCustomers();
      setActiveCustomers(list);
    } catch (err) {
      console.error('Error reloading active seating data', err);
    }
  };

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    await saveAuditLog(user.id, user.username, 'LOGIN', 'Logged into console terminal');
    
    // Generate a unique session ID and capture login time
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const loginTime = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local timezone

    localStorage.setItem('pos_session_id', sessionId);
    localStorage.setItem('pos_session_start', loginTime);

    // Sync staff login event to Google Sheets
    await syncToGoogleSheets('STAFF_LOGIN', {
      sessionId,
      userId: user.id,
      username: user.username,
      date: dateStr,
      loginTime
    });

    // Trigger dynamic AI Voice greeting in background (non-blocking)
    (async () => {
      try {
        const apiKey = settings?.groqApiKey || '';
        const geminiKey = settings?.geminiApiKey || '';
        const greeting = await generateWelcomeGreeting(user.username, user.role, apiKey);
        speakText(greeting, geminiKey);
      } catch (err) {
        console.warn('Voice welcome failed:', err);
      }
    })();
  };

  const handleLogout = async () => {
    if (currentUser) {
      await saveAuditLog(currentUser.id, currentUser.username, 'LOGOUT', 'Logged out of console terminal');
      
      const sessionId = localStorage.getItem('pos_session_id') || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const loginTimeStr = localStorage.getItem('pos_session_start');
      let durationMinutes = 0;
      if (loginTimeStr) {
        const loginTime = new Date(loginTimeStr);
        const durationMs = new Date().getTime() - loginTime.getTime();
        durationMinutes = Math.max(0, Math.round(durationMs / 60000));
      }

      const logoutTime = new Date().toISOString();

      // Sync staff logout event to Google Sheets
      await syncToGoogleSheets('STAFF_LOGOUT', {
        sessionId,
        userId: currentUser.id,
        username: currentUser.username,
        logoutTime,
        durationMinutes
      });

      // Clear session from localStorage
      localStorage.removeItem('pos_session_id');
      localStorage.removeItem('pos_session_start');

      setCurrentUser(null);
      setTab('dashboard');
      setSelectedCustomerId(null);
      setCheckoutCustomer(null);
      setIsNewCustomerOpen(false);
      setIsAutoLocked(false);
    }
  };

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setTab('active'); // Redirect to active tab to see details
  };

  const handleSelectBill = (_bill: Bill) => {
    setTab('history');
    // We can also trigger the history profile of the customer!
    // Since selectedProfilePhone will load, we can set that, but just navigating to history is clean
  };

  const handleCheckoutCustomer = (cust: Customer) => {
    setCheckoutCustomer(cust);
  };

  const handleCheckoutComplete = async () => {
    setCheckoutCustomer(null);
    setSelectedCustomerId(null);
    await reloadActiveCustomers();
  };

  const handleNewCustomerSuccess = async () => {
    setIsNewCustomerOpen(false);
    await reloadActiveCustomers();
    setTab('active'); // Switch to active customer list
  };

  if (!IS_WINDOWS_DEVICE) {
    return <AccessDeniedScreen />;
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center font-medium text-apple-gray-800 text-xs">
        Initializing Chapter One POS database engine...
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      {/* Sidebar navigation */}
      <Sidebar
        currentTab={selectedCustomerId ? 'active' : currentTab}
        setTab={(tab) => {
          setSelectedCustomerId(null); // Clear active customer details selection on tab switch
          setTab(tab);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        activeTimersCount={activeCustomers.length}
      />

      {/* Header bar */}
      <Header
        title={selectedCustomerId ? 'Customer Session Detail' : currentTab}
        onNewCustomerClick={() => setIsNewCustomerOpen(true)}
        onSelectCustomer={handleSelectCustomer}
        onSelectBill={handleSelectBill}
        setTab={setTab}
        currency={settings.currency}
      />

      {/* Main Page Area */}
      <main className="pl-64 pt-20 min-h-screen">
        <div className="p-8 max-w-7xl mx-auto">
          {/* Subview Customer Details Router */}
          {selectedCustomerId && selectedCustomer ? (
            <CustomerDetails
              customer={selectedCustomer}
              onBack={() => setSelectedCustomerId(null)}
              onUpdate={reloadActiveCustomers}
              onCheckout={() => handleCheckoutCustomer(selectedCustomer)}
              settings={settings}
              currentUser={currentUser}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <Dashboard
                  onNewCustomerClick={() => setIsNewCustomerOpen(true)}
                  onViewActiveClick={() => setTab('active')}
                  onSelectCustomer={handleSelectCustomer}
                  settings={settings}
                />
              )}
              {currentTab === 'active' && (
                <ActiveCustomers
                  customers={activeCustomers}
                  onRefresh={reloadActiveCustomers}
                  onSelectCustomer={handleSelectCustomer}
                  onCheckoutCustomer={handleCheckoutCustomer}
                  currentUser={currentUser}
                  settings={settings}
                />
              )}
              {currentTab === 'history' && (
                <CustomerHistory settings={settings} />
              )}
              {currentTab === 'menu' && (
                <MenuManagement currentUser={currentUser} settings={settings} />
              )}
              {currentTab === 'reports' && (
                <Reports settings={settings} />
              )}
              {currentTab === 'settings' && (
                <Settings currentUser={currentUser} onSettingsUpdate={setSettings} />
              )}
            </>
          )}
        </div>
      </main>

      {/* New Customer Check-in Modal */}
      {isNewCustomerOpen && (
        <NewCustomerModal
          onClose={() => setIsNewCustomerOpen(false)}
          onSuccess={handleNewCustomerSuccess}
          currentUser={currentUser}
        />
      )}

      {/* Checkout Terminal Modal */}
      {checkoutCustomer && (
        <CheckoutModal
          customer={checkoutCustomer}
          onClose={() => setCheckoutCustomer(null)}
          onCheckoutComplete={handleCheckoutComplete}
          settings={settings}
          currentUser={currentUser}
        />
      )}

      {isAutoLocked && currentUser && (
        <AutoLockScreen
          currentUser={currentUser}
          onUnlock={() => setIsAutoLocked(false)}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;
