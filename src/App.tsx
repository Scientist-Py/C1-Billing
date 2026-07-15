import { useState, useEffect } from 'react';
import { SplashScreen } from './components/SplashScreen';
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
import { Inventory } from './components/Inventory';
import { Expenses } from './components/Expenses';
import { CRM } from './components/CRM';
import type { User, Customer, CafeSettings, Bill, OrderedItem } from './types';
import { initDB, seedDefaultData, getSettings, getActiveCustomers, saveAuditLog, syncToGoogleSheets, pullAndMergeFromGoogleSheets, purgeAllData } from './utils/db';
import { playEntrySound, playPaymentSound } from './utils/audio';
import { Lock } from 'lucide-react';
import { useToast } from './context/toastContext';
import { SyncEngine } from './utils/syncEngine';

const checkIsMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(window.navigator.userAgent);
};

const checkIsElectron = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.navigator.userAgent.includes('Electron');
};

const IS_MOBILE_DEVICE = checkIsMobile();
const IS_ELECTRON = checkIsElectron();

interface MobileAccessGateScreenProps {
  onUnlock: () => void;
  correctKey: string;
}

const MobileAccessGateScreen: React.FC<MobileAccessGateScreenProps> = ({ onUnlock, correctKey }) => {
  const [inputKey, setInputKey] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanInput = inputKey.trim();
    if (cleanInput === correctKey) {
      localStorage.setItem('mobile_pos_access_unlocked', 'true');
      onUnlock();
    } else {
      setErrorMsg('Invalid 24-character mobile access key.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0d0d11] flex flex-col items-center justify-center p-6 text-white font-sans z-50 overflow-hidden">
      {/* Premium ambient color blobs in background */}
      <div className="absolute top-1/10 left-1/10 w-[350px] h-[350px] bg-[#5c3d2e]/15 rounded-full blur-[100px] pointer-events-none animate-pulse animate-duration-[8000ms]" />
      <div className="absolute bottom-1/10 right-1/10 w-[350px] h-[350px] bg-amber-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse animate-duration-[6000ms]" />

      {/* Glassmorphic Container Panel */}
      <div className="w-full max-w-sm p-8 border border-white/10 bg-white/5 backdrop-blur-3xl rounded-3xl shadow-[0_24px_50px_rgba(0,0,0,0.4)] relative z-10 space-y-6 flex flex-col items-center">
        
        {/* Soft Glowing Circle with Lock Icon */}
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.2)] animate-pulse">
          <Lock className="w-8 h-8" />
        </div>

        {/* Dynamic header titles */}
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            Mobile Activation Gate
          </h2>
          <p className="text-[11px] text-[#86868b] leading-relaxed max-w-xs mx-auto">
            This POS system is owned by Tushar Chauhan. To access this terminal on your Android/mobile browser, please enter your 24-character security key.
          </p>
        </div>

        {/* Access Key Input Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div className="space-y-1">
            <input
              type="password"
              placeholder="•••• •••• •••• •••• •••• ••••"
              maxLength={100}
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-sm font-mono tracking-widest outline-none focus:border-amber-500/50 focus:bg-white/10 transition-all text-white placeholder-white/20"
            />
          </div>

          {errorMsg && (
            <p className="text-[10px] text-red-400 text-center font-medium animate-bounce">
              ⚠️ {errorMsg}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl py-3 text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Unlock Console Access
          </button>
        </form>

        <div className="text-[9px] text-[#86868b] text-center font-light leading-relaxed">
          Access keys are managed by Tushar Chauhan.<br />
          PCs and Electron Desktop apps bypass this gate.
        </div>

      </div>
    </div>
  );
};

function App() {
  const toast = useToast();
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [isMobileUnlocked, setIsMobileUnlocked] = useState(() => localStorage.getItem('mobile_pos_access_unlocked') === 'true');

  // Initialize and update the background review request scheduler whenever settings change
  useEffect(() => {
    let active = true;
    if (settings) {
      import('./utils/scheduler').then(({ Scheduler }) => {
        if (active) Scheduler.init(settings);
      }).catch(err => {
        console.error('Failed to start review scheduler:', err);
      });
    }
    return () => {
      active = false;
      import('./utils/scheduler').then(({ Scheduler }) => {
        Scheduler.stop();
      }).catch(() => {});
    };
  }, [settings]);

  // Listen for review templates sent in the background and show rating toast
  useEffect(() => {
    const handleReviewSent = (e: Event) => {
      const customEvent = e as CustomEvent<{ customerName: string }>;
      const { customerName } = customEvent.detail;
      toast.success('⭐⭐⭐⭐⭐', `Review request sent to ${customerName}`);
    };
    window.addEventListener('review-sent', handleReviewSent);
    return () => window.removeEventListener('review-sent', handleReviewSent);
  }, [toast]);

  // Listen for review templates scheduled in the background and show scheduling toast
  useEffect(() => {
    const handleReviewScheduled = (e: Event) => {
      const customEvent = e as CustomEvent<{ customerName: string; time: string }>;
      const { customerName, time } = customEvent.detail;
      const formattedTime = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      toast.info('Review Scheduled', `Automatic review for ${customerName} scheduled for ${formattedTime}`);
    };
    window.addEventListener('review-scheduled', handleReviewScheduled);
    return () => window.removeEventListener('review-scheduled', handleReviewScheduled);
  }, [toast]);

  // Listen for skipped review scheduling and show a warning toast
  useEffect(() => {
    const handleReviewScheduleSkipped = (e: Event) => {
      const customEvent = e as CustomEvent<{ reason: string }>;
      const { reason } = customEvent.detail;
      toast.warning('Review Auto-Send Skipped', reason);
    };
    window.addEventListener('review-schedule-skipped', handleReviewScheduleSkipped);
    return () => window.removeEventListener('review-schedule-skipped', handleReviewScheduleSkipped);
  }, [toast]);
  
  // Navigation tabs
  const [currentTab, setTab] = useState<string>('dashboard');

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  
  // State lists
  const [activeCustomers, setActiveCustomers] = useState<Customer[]>([]);
  
  // Sub-views & Modals
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [checkoutCustomer, setCheckoutCustomer] = useState<Customer | null>(null);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  
  // Selected Customer details object
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAutoLocked, setIsAutoLocked] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [preorderedItemsForCheckin, setPreorderedItemsForCheckin] = useState<OrderedItem[] | undefined>(undefined);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initDB();

        // Database purge trigger via URL parameter (?purge=true)
        if (window.location.search.includes('purge=true')) {
          await purgeAllData();
          localStorage.clear();
          sessionStorage.clear();
          // Redirect to clean landing page URL
          window.location.href = window.location.origin + window.location.pathname;
          return;
        }

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
      if (!match) {
        setSelectedCustomer(null);
        setSelectedCustomerId(null); // customer checked out
      } else {
        // Only update if the stringified content actually changed to prevent resetting local input states!
        if (JSON.stringify(match) !== JSON.stringify(selectedCustomer)) {
          setSelectedCustomer(match);
        }
      }
    } else {
      setSelectedCustomer(null);
    }
  }, [selectedCustomerId, activeCustomers, selectedCustomer]);

  // Reload and filter active seating list whenever the logged-in user changes
  useEffect(() => {
    reloadActiveCustomers();
  }, [currentUser]);

  // Background Sync Engine queue runner
  useEffect(() => {
    if (!currentUser) return;
    
    // Process queue immediately on login/start
    SyncEngine.processQueue().catch(console.warn);

    const intervalId = window.setInterval(() => {
      SyncEngine.processQueue().catch(console.warn);
    }, 30000); // Process queue every 30 seconds

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser]);

  // Background live synchronization with Google Sheets
  useEffect(() => {
    if (!currentUser) return;
    if (currentTab !== 'seating') return; // Only run active seating sync on seating tab

    // Pause sync if modals are active or a customer cart is selected to prevent focus stealing/UI refresh
    if (isNewCustomerOpen || checkoutCustomer || selectedCustomerId) {
      return;
    }

    const triggerSync = async () => {
      try {
        const syncResult = await pullAndMergeFromGoogleSheets(selectedCustomerId);
        if (syncResult.success) {
          await reloadActiveCustomers();
          setLastSyncTime(Date.now());
        }
      } catch (err) {
        console.warn('Background sync error:', err);
      }
    };
    
    // Run immediately
    triggerSync();

    const intervalId = window.setInterval(triggerSync, 15000); // 15 seconds polling

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser, selectedCustomerId, isNewCustomerOpen, checkoutCustomer, currentTab]);

  const reloadActiveCustomers = async () => {
    try {
      const list = await getActiveCustomers();
      let filteredList = list;
      if (currentUser && currentUser.role === 'staff') {
        filteredList = list.filter(c => c.cashierId === currentUser.id);
      }

      setActiveCustomers((prev) => {
        // Preserve the temporary anonymous customer cart using the latest state reference
        const activeTemp = prev.find(c => c.id.startsWith('temp_'));
        if (activeTemp) {
          const withoutTemp = filteredList.filter(c => c.id !== activeTemp.id);
          return [...withoutTemp, activeTemp];
        }
        return filteredList;
      });
    } catch (err) {
      console.error('Error reloading active seating data', err);
    }
  };

  const handleStartNewEntryOrdering = () => {
    const placeholderCustomer: Customer = {
      id: `temp_${Date.now()}`,
      name: 'New Customer',
      phone: '',
      location: 'Main Hall',
      numGuests: 1,
      notes: '',
      entryTime: new Date().toISOString(),
      status: 'active',
      orderedItems: [],
      cashierId: currentUser?.id,
      cashierName: currentUser?.username
    };
    setActiveCustomers((prev) => [...prev, placeholderCustomer]);
    setSelectedCustomerId(placeholderCustomer.id);
  };

  const handleCheckoutOrCheckin = (cust: Customer) => {
    if (cust.id.startsWith('temp_')) {
      setPreorderedItemsForCheckin(cust.orderedItems);
      setIsNewCustomerOpen(true);
    } else {
      handleCheckoutCustomer(cust);
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

  const handleNewCustomerSuccess = async (newCust?: Customer) => {
    // Remove temporary customer from active list
    setActiveCustomers((prev) => prev.filter(c => !c.id.startsWith('temp_')));
    setIsNewCustomerOpen(false);
    setPreorderedItemsForCheckin(undefined);
    playEntrySound(); // Play entry chime sound
    
    await reloadActiveCustomers();
    
    if (newCust) {
      setSelectedCustomerId(newCust.id); // Go straight to their details view
    } else {
      setTab('active'); // Switch to active customer list
    }
  };

  if (IS_MOBILE_DEVICE && !IS_ELECTRON && !isMobileUnlocked) {
    return (
      <MobileAccessGateScreen
        onUnlock={() => setIsMobileUnlocked(true)}
        correctKey={settings?.mobileAccessKey || 'C1Pos@2026_SecureKey24Ch'}
      />
    );
  }

  if (showSplash || !settings) {
    return <SplashScreen />;
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
        onNewCustomerClick={handleStartNewEntryOrdering}
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
              onBack={() => {
                if (selectedCustomerId.startsWith('temp_')) {
                  const confirmDiscard = window.confirm("Are you sure you want to discard this temporary order?");
                  if (!confirmDiscard) return;
                  // Remove from local list
                  setActiveCustomers((prev) => prev.filter(c => c.id !== selectedCustomerId));
                }
                setSelectedCustomerId(null);
              }}
              onUpdate={(updatedCust) => {
                if (updatedCust && updatedCust.id.startsWith('temp_')) {
                  setActiveCustomers((prev) =>
                    prev.map(c => c.id === updatedCust.id ? updatedCust : c)
                  );
                } else {
                  reloadActiveCustomers();
                }
              }}
              onCheckout={() => handleCheckoutOrCheckin(selectedCustomer)}
              settings={settings}
              currentUser={currentUser}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <Dashboard
                  onNewCustomerClick={handleStartNewEntryOrdering}
                  onViewActiveClick={() => setTab('active')}
                  onSelectCustomer={handleSelectCustomer}
                  settings={settings}
                  currentUser={currentUser}
                  lastSyncTime={lastSyncTime}
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
              {currentTab === 'crm' && (
                <CRM settings={settings} currentUser={currentUser} onSettingsUpdate={setSettings} />
              )}
              {currentTab === 'history' && (
                <CustomerHistory
                  settings={settings}
                  currentUser={currentUser}
                  lastSyncTime={lastSyncTime}
                />
              )}
              {currentTab === 'menu' && (
                <MenuManagement currentUser={currentUser} settings={settings} />
              )}
              {currentTab === 'inventory' && (
                <Inventory currentUser={currentUser} settings={settings} />
              )}
              {currentTab === 'expenses' && (
                <Expenses settings={settings} currentUser={currentUser} />
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
          onClose={() => {
            setIsNewCustomerOpen(false);
            setPreorderedItemsForCheckin(undefined);
          }}
          onSuccess={handleNewCustomerSuccess}
          currentUser={currentUser}
          preorderedItems={preorderedItemsForCheckin}
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
