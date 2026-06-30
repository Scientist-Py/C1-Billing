import React, { useState, useEffect } from 'react';
import { 
  IndianRupee, 
  Users, 
  Clock, 
  TrendingUp, 
  ArrowUpRight, 
  UserPlus
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import type { Customer, Bill, CafeSettings, User } from '../types';
import { getActiveCustomers, getBills, calculateBasementCharge } from '../utils/db';

interface DashboardProps {
  onNewCustomerClick: () => void;
  onViewActiveClick: () => void;
  onSelectCustomer: (id: string) => void;
  settings: CafeSettings;
  currentUser: User;
  lastSyncTime: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onNewCustomerClick,
  onViewActiveClick,
  onSelectCustomer,
  settings,
  currentUser,
  lastSyncTime
}) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [activeCustomers, setActiveCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState({
    todayRevenue: 0,
    weekRevenue: 0,
    monthRevenue: 0,
    todayCustomersCount: 0,
    activeCount: 0,
    mainHallOccupancy: 0,
    basementOccupancy: 0,
    avgBillValue: 0
  });

  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [popularItems, setPopularItems] = useState<{ name: string; category: string; count: number }[]>([]);

  // Timer Tick State (to force update basement charges and durations every second)
  const [, setTick] = useState(0);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        let pastBills = await getBills();
        let active = await getActiveCustomers();
        
        // Filter by cashier ID if staff profile
        if (currentUser.role === 'staff') {
          pastBills = pastBills.filter(b => b.cashierId === currentUser.id);
          active = active.filter(c => c.cashierId === currentUser.id);
        }
        
        setBills(pastBills);
        setActiveCustomers(active);
        
        // Calculate Metrics
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        // Today's Date start for timestamp checks
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);
        
        const startOfWeek = new Date();
        startOfWeek.setDate(now.getDate() - 7);
        startOfWeek.setHours(0,0,0,0);

        const startOfMonth = new Date();
        startOfMonth.setDate(now.getDate() - 30);
        startOfMonth.setHours(0,0,0,0);

        // Filters
        const todayBills = pastBills.filter(b => b.date === todayStr);
        const weekBills = pastBills.filter(b => new Date(b.exitTime) >= startOfWeek);
        const monthBills = pastBills.filter(b => new Date(b.exitTime) >= startOfMonth);

        // Revenue Sums
        const todayRev = todayBills.reduce((sum, b) => sum + b.grandTotal, 0);
        const weekRev = weekBills.reduce((sum, b) => sum + b.grandTotal, 0);
        const monthRev = monthBills.reduce((sum, b) => sum + b.grandTotal, 0);

        const todayCusts = todayBills.length + active.filter(c => new Date(c.entryTime) >= startOfToday).length;

        // Seating Occupancies
        const activeCount = active.length;
        const mainHallOcc = active.filter(c => c.location === 'Main Hall').reduce((sum, c) => sum + c.numGuests, 0);
        const basementOcc = active.filter(c => c.location === 'Basement').reduce((sum, c) => sum + c.numGuests, 0);

        // Average Bill
        const avgBill = pastBills.length > 0 
          ? pastBills.reduce((sum, b) => sum + b.grandTotal, 0) / pastBills.length 
          : 0;

        setStats({
          todayRevenue: todayRev,
          weekRevenue: weekRev,
          monthRevenue: monthRev,
          todayCustomersCount: todayCusts,
          activeCount,
          mainHallOccupancy: mainHallOcc,
          basementOccupancy: basementOcc,
          avgBillValue: avgBill
        });

        // Recent Checked out Bills (last 5)
        const sortedBills = [...pastBills].sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime());
        setRecentBills(sortedBills.slice(0, 5));

        // Popular Items Calculation
        const foodCounts: Record<string, { count: number; category: string }> = {};
        pastBills.forEach(b => {
          b.orderedItems.forEach(item => {
            if (foodCounts[item.name]) {
              foodCounts[item.name].count += item.quantity;
            } else {
              foodCounts[item.name] = { count: item.quantity, category: 'Food' }; // category mock or catalog mapping
            }
          });
        });
        const itemsList = Object.entries(foodCounts).map(([name, val]) => ({
          name,
          category: val.category,
          count: val.count
        }));
        itemsList.sort((a, b) => b.count - a.count);
        setPopularItems(itemsList.slice(0, 5));

      } catch (err) {
        console.error('Failed to aggregate dashboard metrics', err);
      }
    };

    loadDashboardData();
  }, [lastSyncTime]);

  // Timer Tick for Live timer updates on Dashboard
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Seating calculations (Basement Billing Rule)
  const getBasementCharge = (entryTime: string) => {
    return calculateBasementCharge(entryTime, Date.now(), settings.basementHourlyRate);
  };

  const getElapsedTimeStr = (entryTime: string) => {
    const elapsedMs = Date.now() - new Date(entryTime).getTime();
    const secs = Math.floor((elapsedMs / 1000) % 60);
    const mins = Math.floor((elapsedMs / (1000 * 60)) % 60);
    const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));

    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate chart data for revenue trend (last 7 days)
  const getRevenueChartData = () => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString([], { weekday: 'short' });
      
      const dayBills = bills.filter(b => b.date === dateStr);
      const amount = dayBills.reduce((sum, b) => sum + b.grandTotal, 0);
      data.push({ name: label, amount });
    }
    return data;
  };

  // Payment Method Breakdown data
  const getPaymentChartData = () => {
    const counts = { Cash: 0, UPI: 0, Card: 0, Split: 0 };
    bills.forEach(b => {
      if (counts[b.paymentMethod] !== undefined) {
        counts[b.paymentMethod] += b.grandTotal;
      }
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(item => item.value > 0);
  };

  const COLORS = ['#86868b', '#000000', '#e8e8ed', '#d2d2d7'];

  return (
    <div className="space-y-8 select-none">
      {/* Overview Stat Row */}
      <div className="grid grid-cols-4 gap-6">
        <div className="apple-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-apple-gray-300 uppercase tracking-wider">Today's Revenue</span>
            <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">
              {settings.currency}{stats.todayRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <span className="text-[10px] text-green-500 font-semibold flex items-center gap-1 mt-1.5">
              <TrendingUp className="w-3 h-3" />
              <span>Real-time billing</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-apple-gray-50 flex items-center justify-center border border-apple-gray-100">
            <IndianRupee className="w-6 h-6 text-apple-gray-800" />
          </div>
        </div>

        <div className="apple-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-apple-gray-300 uppercase tracking-wider">Active Customers</span>
            <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">{stats.activeCount} Seated</h3>
            <span className="text-[10px] text-[#86868b] font-medium mt-1.5 block">
              In-house cafe dining
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-apple-gray-50 flex items-center justify-center border border-apple-gray-100">
            <Users className="w-6 h-6 text-apple-gray-800" />
          </div>
        </div>

        <div className="apple-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-apple-gray-300 uppercase tracking-wider">Basement Seating</span>
            <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">{stats.basementOccupancy} guests</h3>
            <span className="text-[10px] text-orange-500 font-semibold mt-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} />
              <span>Timer-based charge active</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-apple-gray-50 flex items-center justify-center border border-apple-gray-100">
            <Clock className="w-6 h-6 text-apple-gray-800" />
          </div>
        </div>

        <div className="apple-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-apple-gray-300 uppercase tracking-wider">Avg Transaction</span>
            <h3 className="text-2xl font-bold text-apple-gray-800 mt-1">
              {settings.currency}{stats.avgBillValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </h3>
            <span className="text-[10px] text-blue-500 font-semibold mt-1.5 flex items-center gap-0.5">
              <span>Customer lifetime value</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-apple-gray-50 flex items-center justify-center border border-apple-gray-100">
            <ArrowUpRight className="w-6 h-6 text-apple-gray-800" />
          </div>
        </div>
      </div>

      {/* Quick Action Navigation */}
      <div className="flex gap-4">
        <button
          onClick={onNewCustomerClick}
          className="flex items-center gap-3 px-5 py-4 bg-white border border-apple-gray-100 shadow-apple-card hover:shadow-apple-medium rounded-2xl text-sm font-semibold text-apple-gray-800 hover:bg-[#f5f5f7]/40 transition-apple flex-1 text-left cursor-pointer"
        >
          <div className="w-10 h-10 bg-apple-gray-50 border border-apple-gray-100 rounded-xl flex items-center justify-center text-apple-gray-800">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-apple-gray-800">New Entry</div>
            <div className="text-xs text-[#86868b] font-light">Seating Check-in</div>
          </div>
        </button>

        <button
          onClick={onViewActiveClick}
          className="flex items-center gap-3 px-5 py-4 bg-white border border-apple-gray-100 shadow-apple-card hover:shadow-apple-medium rounded-2xl text-sm font-semibold text-apple-gray-800 hover:bg-[#f5f5f7]/40 transition-apple flex-1 text-left cursor-pointer"
        >
          <div className="w-10 h-10 bg-apple-gray-50 border border-apple-gray-100 rounded-xl flex items-center justify-center text-apple-gray-800">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-apple-gray-800">Live Orders & Seating</div>
            <div className="text-xs text-[#86868b] font-light">Manage {stats.activeCount} active billing terminals</div>
          </div>
        </button>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Revenue Area Chart */}
        <div className="apple-card col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-semibold text-apple-gray-800">Revenue Stream (Last 7 Days)</h4>
            <span className="text-xs font-semibold text-apple-gray-300 uppercase tracking-wider">Weekly trend</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={getRevenueChartData()}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d1d1f" stopOpacity={0.06} />
                    <stop offset="95%" stopColor="#1d1d1f" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e8ed" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#86868b' }} stroke="#e8e8ed" />
                <YAxis tick={{ fontSize: 10, fill: '#86868b' }} stroke="#e8e8ed" />
                <Tooltip 
                  contentStyle={{ 
                    background: 'rgba(255,255,255,0.95)', 
                    border: '1px solid #e8e8ed', 
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: '#1d1d1f'
                  }} 
                />
                <Area type="monotone" dataKey="amount" stroke="#1d1d1f" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Chart */}
        <div className="apple-card">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-semibold text-apple-gray-800">Revenue by Payment Methods</h4>
          </div>
          <div className="h-44 relative">
            {getPaymentChartData().length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-apple-gray-300">
                No revenue recorded yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={getPaymentChartData()}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {getPaymentChartData().map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      background: 'rgba(255,255,255,0.95)', 
                      border: '1px solid #e8e8ed', 
                      borderRadius: '12px',
                      fontSize: '11px',
                      color: '#1d1d1f'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          {/* Payment Method Legends */}
          <div className="grid grid-cols-2 gap-y-2 mt-4 text-xs font-medium text-apple-gray-800">
            {getPaymentChartData().map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                <span>{item.name} ({settings.currency}{item.value.toFixed(0)})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Activity & Timers Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Live Basement Timers (Updates every second!) */}
        <div className="apple-card col-span-2 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h4 className="text-sm font-semibold text-apple-gray-800">Live Basement Timer Dashboard</h4>
              <p className="text-[10px] text-apple-gray-300 mt-0.5">Continuous tracking of basement occupants and charges</p>
            </div>
            <span className="text-[10px] px-2.5 py-1 bg-orange-50 text-orange-500 rounded-full font-bold uppercase tracking-wider animate-pulse-soft">
              {activeCustomers.filter(c => c.location === 'Basement').length} active
            </span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-72 space-y-3 pr-2 no-scrollbar">
            {activeCustomers.filter(c => c.location === 'Basement').length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-apple-gray-300">
                <Clock className="w-8 h-8 opacity-40 mb-2" />
                <span className="text-xs">No active customers in the basement.</span>
              </div>
            ) : (
              activeCustomers.filter(c => c.location === 'Basement').map((customer) => {
                const elapsedStr = getElapsedTimeStr(customer.entryTime);
                const baseCharge = getBasementCharge(customer.entryTime);
                const foodTotal = customer.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const grandTotal = baseCharge + foodTotal;

                return (
                  <div 
                    key={customer.id} 
                    onClick={() => onSelectCustomer(customer.id)}
                    className="p-4 rounded-xl border border-apple-gray-100 hover:border-apple-gray-200 bg-[#f5f5f7]/30 hover:bg-white transition-all duration-150 flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <h5 className="text-xs font-semibold text-apple-gray-800">{customer.name}</h5>
                      <span className="text-[10px] text-apple-gray-300 font-medium block mt-0.5">{customer.phone}</span>
                      <span className="text-[9px] mt-1 px-1.5 py-0.5 rounded bg-apple-gray-50 border border-apple-gray-100 text-apple-gray-800 inline-block font-mono">
                        ID: {customer.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="text-[9px] text-[#86868b] uppercase tracking-wide block">Elapsed Time</span>
                        <span className="text-sm font-mono font-bold text-apple-gray-800">{elapsedStr}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-[#86868b] uppercase tracking-wide block">Seat Charge</span>
                        <span className="text-sm font-semibold text-apple-gray-800">{settings.currency}{baseCharge.toFixed(2)}</span>
                      </div>
                      <div className="text-right bg-apple-gray-50 border border-apple-gray-100/60 py-1.5 px-3 rounded-lg">
                        <span className="text-[8px] text-[#86868b] uppercase tracking-wide block font-semibold">Total Accumulation</span>
                        <span className="text-sm font-bold text-black">{settings.currency}{grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Popular Foods / Recent checked out Bills */}
        <div className="apple-card flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-semibold text-apple-gray-800 mb-4">Top Ordered Food Items</h4>
            <div className="space-y-3.5">
              {popularItems.length === 0 ? (
                <div className="text-center py-10 text-xs text-apple-gray-300">
                  No food sales tracked yet
                </div>
              ) : (
                popularItems.map((item, idx) => (
                  <div key={item.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 rounded bg-apple-gray-50 text-apple-gray-300 font-bold flex items-center justify-center text-[10px]">
                        #{idx + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-apple-gray-800">{item.name}</p>
                        <p className="text-[9px] text-apple-gray-300">{item.category}</p>
                      </div>
                    </div>
                    <span className="font-bold text-apple-gray-300 bg-apple-gray-50 px-2 py-0.5 rounded-full text-[10px]">
                      {item.count} sold
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-apple-gray-100 pt-4 mt-4">
            <h4 className="text-xs font-semibold text-apple-gray-800 mb-3">Recent Transactions</h4>
            <div className="space-y-2">
              {recentBills.length === 0 ? (
                <div className="text-center py-4 text-[10px] text-apple-gray-300">
                  No completed bills
                </div>
              ) : (
                recentBills.map(b => (
                  <div key={b.id} className="flex justify-between items-center text-[11px]">
                    <div className="flex flex-col">
                      <span className="font-semibold text-apple-gray-800">{b.billNumber}</span>
                      <span className="text-[9px] text-[#86868b]">{b.customerName}</span>
                    </div>
                    <span className="font-semibold text-apple-gray-800">
                      {settings.currency}{b.grandTotal.toFixed(0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
