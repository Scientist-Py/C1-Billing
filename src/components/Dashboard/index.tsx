import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Users, 
  ShoppingCart, 
  Activity, 
  AlertTriangle,
  Brain,
  RefreshCw
} from 'lucide-react';
import type { Bill, InventoryItem, CafeSettings, Customer } from '../../types';
import { getBills, getInventory, getActiveCustomers } from '../../utils/db';
import { getSyncTasks } from '../../utils/syncEngine';
import { generateWeeklySummary } from '../../utils/aiOS';

interface DashboardProps {
  settings: CafeSettings;
}

export const Dashboard: React.FC<DashboardProps> = ({ settings }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeCust, setActiveCust] = useState<Customer[]>([]);
  const [pendingTasksCount, setPendingTasksCount] = useState(0);
  const [aiReport, setAiReport] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const b = await getBills();
        setBills(b);
        
        const inv = await getInventory();
        setInventory(inv);

        const act = await getActiveCustomers();
        setActiveCust(act);

        const tasks = await getSyncTasks();
        setPendingTasksCount(tasks.length);
      } catch (err) {
        console.error('Failed to load dashboard metrics:', err);
      }
    };

    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayBills = bills.filter((b) => b.date === todayStr);
  const todaySales = todayBills.reduce((acc, b) => acc + b.grandTotal, 0);
  const averageBill = todayBills.length > 0 ? todaySales / todayBills.length : 0;

  // Simple item sales counter
  const itemCounter: Record<string, number> = {};
  todayBills.forEach((b) => {
    b.orderedItems.forEach((i) => {
      itemCounter[i.name] = (itemCounter[i.name] || 0) + i.quantity;
    });
  });
  const topSellingItem = Object.entries(itemCounter).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  const lowStockCount = inventory.filter((i) => i.quantity <= i.minStock).length;

  const triggerAIReview = async () => {
    if (!settings.groqApiKey) {
      alert('Please configure your Groq API Key in Settings to generate AI reviews.');
      return;
    }
    setIsAiLoading(true);
    setAiReport('');
    try {
      const summary = await generateWeeklySummary(bills.slice(-20), settings.groqApiKey);
      setAiReport(summary);
    } catch (error) {
      setAiReport('Failed to generate weekly review. Check API credentials.');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-apple-gray-800">Chapter One OS Dashboard</h2>
          <p className="text-xs text-[#86868b]">Real-time operational overview and executive analytics</p>
        </div>
        <button
          onClick={triggerAIReview}
          disabled={isAiLoading}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-apple-blue-500 to-[#0071e3] text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
        >
          <Brain className="w-4 h-4" />
          <span>{isAiLoading ? 'Analyzing...' : 'Generate AI Performance Review'}</span>
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="apple-card flex items-center gap-4">
          <div className="p-3 bg-[#e8f3ff] text-apple-blue-500 rounded-2xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Today's Sales</span>
            <div className="text-lg font-bold text-apple-gray-800 mt-0.5">{settings.currency}{todaySales.toFixed(2)}</div>
          </div>
        </div>

        <div className="apple-card flex items-center gap-4">
          <div className="p-3 bg-green-50 text-green-500 rounded-2xl">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Average Ticket</span>
            <div className="text-lg font-bold text-apple-gray-800 mt-0.5">{settings.currency}{averageBill.toFixed(2)}</div>
          </div>
        </div>

        <div className="apple-card flex items-center gap-4">
          <div className="p-3 bg-orange-50 text-orange-500 rounded-2xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Active Customers</span>
            <div className="text-lg font-bold text-apple-gray-800 mt-0.5">{activeCust.length} Active</div>
          </div>
        </div>

        <div className="apple-card flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-500 rounded-2xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Low Stock Warnings</span>
            <div className="text-lg font-bold text-apple-gray-800 mt-0.5">{lowStockCount} items</div>
          </div>
        </div>
      </div>

      {/* AI Report Summary (Collapsible/Conditional) */}
      {aiReport && (
        <div className="apple-card bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border border-indigo-100 rounded-3xl p-5">
          <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-600" />
            <span>AI Executive Analysis</span>
          </h4>
          <p className="text-xs text-apple-gray-800 font-light leading-relaxed whitespace-pre-wrap">{aiReport}</p>
        </div>
      )}

      {/* Main Grid: Sync logs & operation stats */}
      <div className="grid grid-cols-3 gap-6">
        <div className="apple-card col-span-2 space-y-4">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-apple-blue-500" />
            <span>Today's Product Highlights</span>
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-[#f5f5f7] rounded-2xl border border-apple-gray-50 text-center">
              <span className="text-[10px] text-[#86868b] uppercase tracking-wide font-medium">Bestseller Dish</span>
              <div className="text-md font-bold text-apple-gray-800 mt-1">{topSellingItem}</div>
            </div>
            <div className="p-4 bg-[#f5f5f7] rounded-2xl border border-apple-gray-50 text-center">
              <span className="text-[10px] text-[#86868b] uppercase tracking-wide font-medium">Today's Cover Count</span>
              <div className="text-md font-bold text-apple-gray-800 mt-1">{todayBills.length} Bills</div>
            </div>
          </div>
        </div>

        <div className="apple-card space-y-4">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-[#86868b]" />
            <span>Sync Queue Monitor</span>
          </h4>
          <div className="p-4 bg-[#f5f5f7] rounded-2xl border border-apple-gray-50 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-[#86868b] uppercase tracking-wide font-medium">Offline Queued Items</span>
              <div className="text-xl font-mono font-bold text-apple-gray-800 mt-0.5">{pendingTasksCount} Pending</div>
            </div>
            <span className={`w-3 h-3 rounded-full ${pendingTasksCount === 0 ? 'bg-green-500 shadow-green-100' : 'bg-orange-500 shadow-orange-100'} shadow-md`} />
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
