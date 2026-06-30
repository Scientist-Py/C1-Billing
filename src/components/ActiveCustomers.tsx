import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Clock, 
  Trash2, 
  ChevronRight, 
  Plus, 
  ArrowUpDown,
  UtensilsCrossed,
  Receipt
} from 'lucide-react';
import type { Customer, SeatingLocation, CafeSettings, User } from '../types';
import { deleteCustomer, saveAuditLog, calculateBasementCharge } from '../utils/db';

interface ActiveCustomersProps {
  customers: Customer[];
  onRefresh: () => void;
  onSelectCustomer: (id: string) => void;
  onCheckoutCustomer: (customer: Customer) => void;
  currentUser: User;
  settings: CafeSettings;
}

type SortOption = 'entry-oldest' | 'entry-newest' | 'bill-highest' | 'bill-lowest' | 'name-az';

export const ActiveCustomers: React.FC<ActiveCustomersProps> = ({
  customers,
  onRefresh,
  onSelectCustomer,
  onCheckoutCustomer,
  currentUser,
  settings
}) => {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState<'All' | SeatingLocation>('All');
  const [sortBy, setSortBy] = useState<SortOption>('entry-oldest');
  
  // Local state to force recalculations of active timers every second
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Seating Cost
  const getSeatingCost = (customer: Customer) => {
    if (customer.location !== 'Basement') return 0;
    return calculateBasementCharge(customer.entryTime, Date.now(), settings.basementHourlyRate);
  };

  const getElapsedTimeStr = (entryTime: string) => {
    const elapsedMs = Date.now() - new Date(entryTime).getTime();
    const secs = Math.floor((elapsedMs / 1000) % 60);
    const mins = Math.floor((elapsedMs / (1000 * 60)) % 60);
    const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));

    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDelete = async (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentUser.role !== 'admin') {
      alert('Permission Denied. Only Administrators can delete active customer entries.');
      return;
    }

    if (confirm(`Are you sure you want to delete customer "${customer.name}"? This will erase their active order progress.`)) {
      try {
        await deleteCustomer(customer.id);
        await saveAuditLog(
          currentUser.id,
          currentUser.username,
          'DELETE_CUSTOMER',
          `Deleted active customer: ${customer.name} (Phone: ${customer.phone}, Location: ${customer.location})`
        );
        onRefresh();
      } catch (err) {
        alert('Failed to delete customer.');
      }
    }
  };

  // Filter and Sort Customers
  const filteredCustomers = customers
    .filter((c) => {
      const matchSearch = 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.phone.includes(search) ||
        c.id.toLowerCase().includes(search.toLowerCase());
      
      const matchLoc = locationFilter === 'All' ? true : c.location === locationFilter;
      
      return matchSearch && matchLoc;
    })
    .sort((a, b) => {
      const aFoodTotal = a.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const aSeating = getSeatingCost(a);
      const aTotal = aFoodTotal + aSeating;

      const bFoodTotal = b.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const bSeating = getSeatingCost(b);
      const bTotal = bFoodTotal + bSeating;

      const aTime = new Date(a.entryTime).getTime();
      const bTime = new Date(b.entryTime).getTime();

      switch (sortBy) {
        case 'entry-oldest':
          return aTime - bTime;
        case 'entry-newest':
          return bTime - aTime;
        case 'bill-highest':
          return bTotal - aTotal;
        case 'bill-lowest':
          return aTotal - bTotal;
        case 'name-az':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  return (
    <div className="space-y-6 select-none">
      {/* Controls Bar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-apple-gray-100/80 shadow-apple-card gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-apple-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, phone, or seating ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-apple-gray-50 border border-apple-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-apple-gray-200 transition-all font-light"
          />
        </div>

        {/* Filter and Sort buttons */}
        <div className="flex items-center gap-4">
          {/* Seating Location Tabs */}
          <div className="bg-[#f5f5f7] p-1 rounded-xl flex border border-apple-gray-100">
            {(['All', 'Main Hall', 'Basement', 'Takeaway'] as const).map((loc) => (
              <button
                key={loc}
                onClick={() => setLocationFilter(loc)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  locationFilter === loc
                    ? 'bg-white text-apple-gray-800 shadow-sm'
                    : 'text-[#86868b] hover:text-apple-gray-800'
                }`}
              >
                {loc}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="relative flex items-center gap-1.5 px-3 py-2 bg-apple-gray-50 border border-apple-gray-100 rounded-xl">
            <ArrowUpDown className="w-3.5 h-3.5 text-[#86868b]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="text-xs font-semibold bg-transparent focus:outline-none text-[#86868b] cursor-pointer"
            >
              <option value="entry-oldest">Oldest Entry</option>
              <option value="entry-newest">Newest Entry</option>
              <option value="bill-highest">Highest Bill</option>
              <option value="bill-lowest">Lowest Bill</option>
              <option value="name-az">Customer Name A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid of Active Customer Cards */}
      {filteredCustomers.length === 0 ? (
        <div className="apple-card py-20 text-center flex flex-col items-center justify-center text-apple-gray-300">
          <UtensilsCrossed className="w-12 h-12 opacity-30 mb-3" />
          <p className="text-sm font-semibold">No Active Customer Seating Found</p>
          <p className="text-xs text-apple-gray-300 font-light mt-1">
            {search || locationFilter !== 'All' 
              ? 'Try modifying your search or filter settings.' 
              : 'Add a new customer entry to start tracking time and orders.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => {
            const seatingCost = getSeatingCost(customer);
            const foodCost = customer.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const grandTotal = seatingCost + foodCost;
            const elapsed = getElapsedTimeStr(customer.entryTime);
            
            // Format entry time locally
            const entryTimeFormatted = new Date(customer.entryTime).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            });

            return (
              <div
                key={customer.id}
                onClick={() => onSelectCustomer(customer.id)}
                className="apple-card flex flex-col justify-between h-[255px] cursor-pointer relative hover:border-apple-gray-200"
              >
                {/* Card Header */}
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-bold text-apple-gray-800 leading-tight truncate max-w-[150px]">
                        {customer.name}
                      </h4>
                      <p className="text-[10px] text-apple-gray-300 font-medium mt-0.5">{customer.phone}</p>
                    </div>

                    {/* Area Badge */}
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1 ${
                      customer.location === 'Basement'
                        ? 'bg-red-50 text-red-500 border-red-100'
                        : customer.location === 'Takeaway'
                        ? 'bg-blue-50 text-blue-600 border-blue-100'
                        : 'bg-green-50 text-green-600 border-green-100'
                    }`}>
                      <MapPin className="w-2.5 h-2.5" />
                      <span>{customer.location}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[9px] font-semibold mt-1">
                    {customer.id.startsWith('temp_') ? (
                      <span className="text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-sans font-bold flex items-center gap-1 select-none">
                        📝 DRAFT ORDER
                      </span>
                    ) : (
                      <span className="text-apple-gray-300 font-mono">ID: {customer.id}</span>
                    )}
                    {currentUser.role !== 'staff' && customer.cashierName && (
                      <span className="text-orange-500 font-sans font-semibold">By: {customer.cashierName}</span>
                    )}
                  </div>
                </div>

                {/* Seating Timeline Widget */}
                {customer.location === 'Basement' ? (
                  <div className="my-4 py-2 px-3 bg-apple-gray-50 border border-apple-gray-100/60 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[11px] text-apple-gray-800">
                      <Clock className="w-3.5 h-3.5 text-[#86868b]" />
                      <span className="font-semibold">{entryTimeFormatted}</span>
                    </div>
                    
                    {/* Elapsed Timer */}
                    <div className="text-right">
                      <span className="text-[8px] text-[#86868b] uppercase tracking-wide block">Duration</span>
                      <span className="text-xs font-bold font-mono text-apple-gray-800">{elapsed}</span>
                    </div>
                  </div>
                ) : (
                  <div className="my-4 py-2 px-3 bg-[#f5f5f7]/30 border border-apple-gray-100/40 rounded-xl flex items-center justify-center text-[10px] text-[#86868b] font-medium h-[42px]">
                    {customer.notes ? (
                      <span className="truncate italic">"{customer.notes}"</span>
                    ) : (
                      <span>{customer.location === 'Takeaway' ? 'Takeaway Session' : 'Walk-in Seating Session'}</span>
                    )}
                  </div>
                )}

                {/* Subtotals & Current Accumulation */}
                <div className="flex justify-between items-center text-xs pb-3 border-b border-apple-gray-50">
                  <div className="text-left">
                    <span className="text-[8px] text-[#86868b] uppercase tracking-wide block">Seating ({customer.location === 'Basement' ? 'Timer' : 'Free'})</span>
                    <span className="font-semibold text-apple-gray-800">
                      {settings.currency}{seatingCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[8px] text-[#86868b] uppercase tracking-wide block">Food Total</span>
                    <span className="font-semibold text-apple-gray-800">
                      {settings.currency}{foodCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] text-black font-semibold uppercase tracking-wide block">Total Cost</span>
                    <span className="font-bold text-black text-sm">
                      {settings.currency}{grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Actions row */}
                <div className="pt-3 flex justify-between items-center">
                  <div className="flex gap-2">
                    {/* Add Food Shortcut */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCustomer(customer.id);
                      }}
                      className="p-2 rounded-lg bg-apple-gray-50 hover:bg-apple-gray-100 text-apple-gray-800 border border-apple-gray-100 transition-colors cursor-pointer"
                      title="Add Food Items"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Checkout */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCheckoutCustomer(customer);
                      }}
                      className="p-2 rounded-lg bg-apple-gray-50 hover:bg-apple-gray-100 text-apple-gray-800 border border-apple-gray-100 transition-colors cursor-pointer"
                      title="Checkout & Print"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                    </button>

                    {/* Admin Delete */}
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={(e) => handleDelete(customer, e)}
                        className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 transition-colors cursor-pointer"
                        title="Delete Active Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] font-semibold text-[#86868b] hover:text-apple-gray-800 flex items-center transition-colors">
                    <span>Manage</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
