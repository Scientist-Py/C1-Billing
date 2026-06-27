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
import { playEntrySound, playPaymentSound } from './utils/audio';
import { ShieldAlert, Play, Laptop } from 'lucide-react';

const checkIsWindows = (): boolean => {
  if (typeof window === 'undefined') return true;
  const userAgent = window.navigator.userAgent;
  const platform = (window.navigator as any).platform || '';
  return userAgent.includes('Windows') || platform.includes('Win');
};

const IS_WINDOWS_DEVICE = checkIsWindows();

const AccessDeniedScreen = () => {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState('');

  const getDeviceName = (): string => {
    const ua = window.navigator.userAgent;
    if (/Android/i.test(ua)) return 'Android device';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Macintosh/i.test(ua)) return 'Mac computer';
    if (/Linux/i.test(ua)) return 'Linux machine';
    return 'unauthorized device';
  };

  const speakWarning = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();

      // Delay to let cancel clear the queue asynchronously in Chrome
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        
        const voice = voices.find(v => 
          v.lang.startsWith('en') && 
          (v.name.includes('Neural') || v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Microsoft'))
        ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
        
        if (voice) {
          utterance.voice = voice;
        }
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }, 150);
    }
  };

  useEffect(() => {
    const deviceName = getDeviceName();
    const messages = [
      `Access restricted. This billing terminal is owned by Tushar Chauhan and permission is denied. If you are the right user, please ask Mr. Chauhan for access.`,
      `Unauthorized connection. This POS system is owned by Tushar Chauhan. To run on this ${deviceName}, please contact Mr. Chauhan to request access clearance.`,
      `Access denied. This billing portal is owned by Tushar Chauhan. If you are the authorized operator, ask Mr. Chauhan for system permissions.`,
      `Connection blocked. This terminal network is owned by Tushar Chauhan. Please consult Mr. Chauhan for authorization to access this POS console.`,
      `Device not allowed. This secure database console is owned by Tushar Chauhan. Access is restricted to Windows POS systems. Ask Mr. Chauhan for permissions.`
    ];
    
    const randomIndex = Math.floor(Math.random() * messages.length);
    const chosenText = messages[randomIndex];
    setSelectedMessage(chosenText);
    speakWarning(chosenText);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        speakWarning(chosenText);
      };
    }

    const handleGlobalClick = () => {
      speakWarning(chosenText);
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
    <div className="fixed inset-0 bg-[#0d0d11] flex flex-col items-center justify-center p-6 text-white font-sans select-none z-50 overflow-hidden">
      {/* Premium ambient color blobs in background */}
      <div className="absolute top-1/10 left-1/10 w-[450px] h-[450px] bg-[#5c3d2e]/15 rounded-full blur-[130px] pointer-events-none animate-pulse animate-duration-[8000ms]" />
      <div className="absolute bottom-1/10 right-1/10 w-[450px] h-[450px] bg-amber-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse animate-duration-[6000ms]" />

      {/* Glassmorphic Container Panel */}
      <div className="w-full max-w-md p-8 border border-white/10 bg-white/5 backdrop-blur-3xl rounded-3xl shadow-[0_24px_50px_rgba(0,0,0,0.4)] relative z-10 space-y-6 flex flex-col items-center">
        
        {/* Soft Glowing Circle with Lock Icon */}
        <div className="w-18 h-18 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.15)] animate-pulse">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-[#f5f5f7] text-xl font-bold tracking-tight">
            System Locked
          </h2>
          <p className="text-xs text-[#86868b] leading-relaxed max-w-xs mx-auto">
            This POS console is restricted to authorized Windows terminal workstations.
          </p>
        </div>

        {/* Glass Box displaying the dynamically picked message */}
        <div className="w-full p-5 bg-white/5 rounded-2xl border border-white/10 text-xs text-[#d2d2d7] leading-relaxed text-center font-normal shadow-inner relative">
          <span className="text-[#f5f5f7] font-medium block mb-2 text-[10px] tracking-wider uppercase opacity-40">
            Security Notice
          </span>
          "{selectedMessage}"
        </div>

        {/* Detailed diagnostic badge */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-[#86868b]">
          <Laptop className="w-3.5 h-3.5 text-[#86868b]" />
          <span>Restricted Platform: <strong className="text-amber-400 font-semibold">{getDeviceName()}</strong></span>
        </div>

        {/* Autoplay Voice Trigger Action (Glass Button) */}
        {!hasInteracted && (
          <button 
            onClick={() => {
              if (selectedMessage) {
                speakWarning(selectedMessage);
              }
              setHasInteracted(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 rounded-xl transition-all text-xs cursor-pointer shadow-md"
          >
            <Play className="w-3 h-3 fill-amber-300" />
            <span>PLAY SYSTEM AUDIBLE</span>
          </button>
        )}

        <div className="text-[10px] text-[#86868b] leading-relaxed font-light mt-1 text-center">
          Please contact Tushar Chauhan for POS access keys.
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

  // Reload and filter active seating list whenever the logged-in user changes
  useEffect(() => {
    reloadActiveCustomers();
  }, [currentUser]);

  const reloadActiveCustomers = async () => {
    try {
      const list = await getActiveCustomers();
      if (currentUser && currentUser.role === 'staff') {
        setActiveCustomers(list.filter(c => c.cashierId === currentUser.id));
      } else {
        setActiveCustomers(list);
      }
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
    playPaymentSound(); // Play payment success sound
  };

  const handleNewCustomerSuccess = async () => {
    setIsNewCustomerOpen(false);
    await reloadActiveCustomers();
    playEntrySound(); // Play entry chime sound
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
        currentUser={currentUser}
      />

      {/* Main Page Area */}
      <main className="lg:pl-64 pl-20 pt-20 min-h-screen transition-all duration-300">
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
                  currentUser={currentUser}
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
                <CustomerHistory settings={settings} currentUser={currentUser} />
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
