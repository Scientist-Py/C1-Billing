import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Calendar, Clock, Users, Utensils, Receipt, RefreshCw } from 'lucide-react';
import type { Customer, Bill, MenuItem, User } from '../types';
import { getActiveCustomers, getBills, getMenu, pullAndMergeFromGoogleSheets } from '../utils/db';

interface HeaderProps {
  title: string;
  onNewCustomerClick: () => void;
  onSelectCustomer: (id: string) => void;
  onSelectBill: (bill: Bill) => void;
  setTab: (tab: string) => void;
  currency: string;
  currentUser: User;
  onSyncComplete?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onNewCustomerClick,
  onSelectCustomer,
  onSelectBill,
  setTab,
  currency,
  currentUser,
  onSyncComplete
}) => {
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'syncing' | 'failed'>('idle');

  const triggerManualSync = async () => {
    setSyncStatus('syncing');
    try {
      await pullAndMergeFromGoogleSheets();
      setSyncStatus('success');
      if (onSyncComplete) {
        onSyncComplete();
      }
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err) {
      setSyncStatus('failed');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  };
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Search data sets
  const [activeCustomers, setActiveCustomers] = useState<Customer[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  
  // Results
  const [matchedCustomers, setMatchedCustomers] = useState<Customer[]>([]);
  const [matchedBills, setMatchedBills] = useState<Bill[]>([]);
  const [matchedMenu, setMatchedMenu] = useState<MenuItem[]>([]);
  
  const searchRef = useRef<HTMLDivElement>(null);

  // Time ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch data on focus/search
  const loadSearchData = async () => {
    try {
      let active = await getActiveCustomers();
      let pastBills = await getBills();
      const menuCatalog = await getMenu();

      // Filter search datasets for active sessions and bills if staff profile
      if (currentUser.role === 'staff') {
        active = active.filter(c => c.cashierId === currentUser.id);
        pastBills = pastBills.filter(b => b.cashierId === currentUser.id);
      }

      setActiveCustomers(active);
      setBills(pastBills);
      setMenu(menuCatalog);
    } catch (err) {
      console.error('Error fetching search datasets', err);
    }
  };

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase();

      // Search active customers
      const fCustomers = activeCustomers.filter(c => 
        c.name.toLowerCase().includes(query) || 
        c.phone.includes(query) || 
        c.id.toLowerCase().includes(query)
      );

      // Search bills
      const fBills = bills.filter(b => 
        b.customerName.toLowerCase().includes(query) || 
        b.customerPhone.includes(query) || 
        b.billNumber.toLowerCase().includes(query)
      );

      // Search menu
      const fMenu = menu.filter(m => 
        m.name.toLowerCase().includes(query) || 
        m.category.toLowerCase().includes(query) || 
        m.keywords.some(k => k.toLowerCase().includes(query))
      );

      setMatchedCustomers(fCustomers.slice(0, 5));
      setMatchedBills(fBills.slice(0, 5));
      setMatchedMenu(fMenu.slice(0, 5));
    } else {
      setMatchedCustomers([]);
      setMatchedBills([]);
      setMatchedMenu([]);
    }
  }, [searchQuery, activeCustomers, bills, menu]);

  // Click outside listener
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearching(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <header className="h-20 bg-white border-b border-apple-gray-100 flex items-center justify-between px-8 fixed top-0 right-0 lg:left-64 left-20 z-15 select-none transition-all duration-300">
      {/* Title */}
      <div>
        <h2 className="text-xl font-semibold text-apple-gray-800 tracking-tight capitalize">{title}</h2>
      </div>

      {/* Global Search Bar */}
      <div className="relative lg:w-96 md:w-64 w-48" ref={searchRef}>
        <div className="relative">
          <Search className="w-4 h-4 text-apple-gray-300 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customer, phone, bill, menu item..."
            value={searchQuery}
            onFocus={() => {
              loadSearchData();
              setIsSearching(true);
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-apple-gray-50 border border-apple-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-apple-gray-200 transition-all font-light"
          />
        </div>

        {/* Global Search Results Overlay */}
        {isSearching && searchQuery.trim().length > 0 && (
          <div className="absolute top-12 left-0 right-0 bg-white border border-apple-gray-100 rounded-2xl shadow-apple-medium overflow-hidden max-h-[480px] overflow-y-auto z-50 p-2 animate-fade-in no-scrollbar">
            {matchedCustomers.length === 0 && matchedBills.length === 0 && matchedMenu.length === 0 ? (
              <div className="text-center py-8 text-apple-gray-300 text-xs">
                No matching results for "{searchQuery}"
              </div>
            ) : (
              <div className="space-y-4 p-2">
                {/* Active Seating matches */}
                {matchedCustomers.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-apple-gray-300 px-2 mb-1.5 tracking-wider flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>Active Customers ({matchedCustomers.length})</span>
                    </h3>
                    <div className="space-y-0.5">
                      {matchedCustomers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            onSelectCustomer(c.id);
                            setIsSearching(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-apple-gray-50 flex justify-between items-center text-xs text-apple-gray-800 transition-colors cursor-pointer"
                        >
                          <div>
                            <span className="font-semibold">{c.name}</span>
                            <span className="text-apple-gray-300 text-[10px] ml-2">{c.phone}</span>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-bold">
                            {c.location}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Billing History matches */}
                {matchedBills.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-apple-gray-300 px-2 mb-1.5 tracking-wider flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Receipt Archives ({matchedBills.length})</span>
                    </h3>
                    <div className="space-y-0.5">
                      {matchedBills.map(b => (
                        <button
                          key={b.id}
                          onClick={() => {
                            onSelectBill(b);
                            setIsSearching(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-apple-gray-50 flex justify-between items-center text-xs text-apple-gray-800 transition-colors cursor-pointer"
                        >
                          <div>
                            <span className="font-semibold">{b.billNumber}</span>
                            <span className="text-apple-gray-300 text-[10px] ml-2">{b.customerName}</span>
                          </div>
                          <span className="font-semibold text-apple-gray-800">
                            {currency}{b.grandTotal.toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Menu matches */}
                {matchedMenu.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase font-bold text-apple-gray-300 px-2 mb-1.5 tracking-wider flex items-center gap-1.5">
                      <Utensils className="w-3.5 h-3.5" />
                      <span>Menu Catalog ({matchedMenu.length})</span>
                    </h3>
                    <div className="space-y-0.5">
                      {matchedMenu.map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setTab('menu');
                            setIsSearching(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-apple-gray-50 flex justify-between items-center text-xs text-apple-gray-800 transition-colors cursor-pointer"
                        >
                          <div>
                            <span className="font-semibold">{m.name}</span>
                            <span className="text-apple-gray-300 text-[10px] ml-2">{m.category}</span>
                          </div>
                          <span className="font-semibold text-apple-gray-800">
                            {currency}{m.price}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date-Time & Quick Actions */}
      <div className="flex items-center gap-6">
        {/* Sync Indicator Button */}
        <button
          onClick={triggerManualSync}
          disabled={syncStatus === 'syncing'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-300 cursor-pointer ${
            syncStatus === 'syncing'
              ? 'bg-apple-gray-50 border-apple-gray-100 text-apple-gray-300 animate-pulse'
              : syncStatus === 'success'
              ? 'bg-green-50 border-green-100 text-green-600'
              : syncStatus === 'failed'
              ? 'bg-red-50 border-red-100 text-red-500'
              : 'bg-white border-apple-gray-100 hover:bg-apple-gray-50 text-apple-gray-800'
          }`}
          title="Synchronize data with cloud server"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">
            {syncStatus === 'syncing'
              ? 'Syncing...'
              : syncStatus === 'success'
              ? 'Synced'
              : syncStatus === 'failed'
              ? 'Failed'
              : 'Sync Server'}
          </span>
        </button>

        {/* Live Date/Time widget */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-apple-gray-300 font-medium">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-apple-gray-300" />
            <span>
              {currentTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-apple-gray-300" />
            <span>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>

        {/* Quick New Customer Button */}
        <button
          onClick={onNewCustomerClick}
          className="flex items-center gap-2 px-4 py-2 bg-apple-gray-800 text-white rounded-xl text-xs font-semibold hover:bg-black transition-apple shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Entry</span>
        </button>
      </div>
    </header>
  );
};
