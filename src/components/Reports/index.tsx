import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Award,
  Sparkles,
  ShoppingBag
} from 'lucide-react';
import type { Bill, Expense, CafeSettings } from '../../types';
import { getBills, getExpenses } from '../../utils/db';
import { generateSalesPredictions } from '../../utils/aiOS';

interface ReportsProps {
  settings: CafeSettings;
}

export const Reports: React.FC<ReportsProps> = ({ settings }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [aiForecast, setAiForecast] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const loadReportData = async () => {
      try {
        const b = await getBills();
        setBills(b);
        const e = await getExpenses();
        setExpenses(e);
      } catch (err) {
        console.error('Failed to load reporting records:', err);
      }
    };
    loadReportData();
  }, []);

  const filterByPeriod = <T extends { date: string; timestamp?: string }>(items: T[]): T[] => {
    const now = new Date();
    return items.filter((item) => {
      const itemDate = new Date(item.date);
      const diffTime = Math.abs(now.getTime() - itemDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (reportPeriod === 'daily') return diffDays <= 1;
      if (reportPeriod === 'weekly') return diffDays <= 7;
      return diffDays <= 30; // Monthly
    });
  };

  const periodBills = filterByPeriod(bills);
  const periodExpenses = filterByPeriod(expenses);

  const totalSales = periodBills.reduce((acc, b) => acc + b.grandTotal, 0);
  const totalExpenses = periodExpenses.reduce((acc, e) => acc + e.price, 0);
  const netProfit = totalSales - totalExpenses;

  // Calculate top product categories
  const categoryCounter: Record<string, number> = {};
  periodBills.forEach((b) => {
    b.orderedItems.forEach((i) => {
      // Basic grouping: item sales
      categoryCounter[i.name] = (categoryCounter[i.name] || 0) + i.quantity;
    });
  });
  const sortedProducts = Object.entries(categoryCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Cashier productivity counter
  const cashierCounter: Record<string, number> = {};
  periodBills.forEach((b) => {
    const name = b.cashierName || 'Staff';
    cashierCounter[name] = (cashierCounter[name] || 0) + b.grandTotal;
  });

  const getAIForecast = async () => {
    if (!settings.groqApiKey) {
      alert('Please configure your Groq API Key in Settings to generate AI reports.');
      return;
    }
    setIsAiLoading(true);
    setAiForecast('');
    try {
      const summary = await generateSalesPredictions(bills.slice(-20), settings.groqApiKey);
      setAiForecast(summary);
    } catch (error) {
      setAiForecast('Failed to generate forecast.');
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Period Selection */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-apple-gray-100 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-apple-gray-800 uppercase tracking-wider">Advanced Financial Reports</h3>
          <p className="text-xs text-[#86868b]">Select target interval to filter financial ledger records</p>
        </div>
        <div className="flex bg-[#f5f5f7] p-1 rounded-xl border border-apple-gray-100">
          {(['daily', 'weekly', 'monthly'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setReportPeriod(period)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                reportPeriod === period 
                  ? 'bg-white text-apple-gray-800 shadow-sm' 
                  : 'text-[#86868b] hover:text-apple-gray-800'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Financial Overview Tiles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="apple-card space-y-2">
          <div className="flex justify-between items-center text-apple-blue-500">
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Total Sales</span>
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono text-apple-gray-800">
            {settings.currency}{totalSales.toFixed(2)}
          </div>
        </div>

        <div className="apple-card space-y-2">
          <div className="flex justify-between items-center text-red-500">
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Total Expenses</span>
            <TrendingDown className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono text-apple-gray-800">
            {settings.currency}{totalExpenses.toFixed(2)}
          </div>
        </div>

        <div className="apple-card space-y-2">
          <div className="flex justify-between items-center text-green-500">
            <span className="text-[10px] text-[#86868b] uppercase font-bold tracking-wider">Net Profit</span>
            <DollarSign className="w-5 h-5" />
          </div>
          <div className={`text-2xl font-bold font-mono ${netProfit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {settings.currency}{netProfit.toFixed(2)}
          </div>
        </div>
      </div>

      {/* AI forecast segment */}
      <div className="apple-card space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <span>AI Sales Forecasting & Predictions</span>
          </h4>
          <button
            onClick={getAIForecast}
            disabled={isAiLoading}
            className="text-[10px] font-bold px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 rounded-xl transition-all cursor-pointer"
          >
            {isAiLoading ? 'Analyzing...' : 'Generate AI Forecast'}
          </button>
        </div>
        {aiForecast && (
          <div className="p-4 bg-indigo-50/30 border border-indigo-100/50 rounded-2xl">
            <p className="text-xs text-apple-gray-800 font-light leading-relaxed whitespace-pre-wrap">{aiForecast}</p>
          </div>
        )}
      </div>

      {/* Detailed analytics sections */}
      <div className="grid grid-cols-2 gap-6">
        {/* Product performance */}
        <div className="apple-card space-y-4">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider flex items-center gap-2 border-b border-apple-gray-100 pb-2">
            <ShoppingBag className="w-4 h-4 text-apple-blue-500" />
            <span>Top Performing Products</span>
          </h4>
          <div className="space-y-3">
            {sortedProducts.map(([name, count]) => (
              <div key={name} className="flex justify-between items-center text-xs">
                <span className="text-apple-gray-800 font-medium">{name}</span>
                <span className="font-bold text-[#86868b]">{count} units sold</span>
              </div>
            ))}
            {sortedProducts.length === 0 && (
              <div className="text-center text-apple-gray-300 text-xs py-4">No product metrics recorded for this period.</div>
            )}
          </div>
        </div>

        {/* Staff performance */}
        <div className="apple-card space-y-4">
          <h4 className="text-xs font-bold text-apple-gray-800 uppercase tracking-wider flex items-center gap-2 border-b border-apple-gray-100 pb-2">
            <Award className="w-4 h-4 text-apple-blue-500" />
            <span>Cashier Sales Overview</span>
          </h4>
          <div className="space-y-3">
            {Object.entries(cashierCounter).map(([name, spend]) => (
              <div key={name} className="flex justify-between items-center text-xs">
                <span className="text-apple-gray-800 font-medium">{name}</span>
                <span className="font-bold font-mono text-apple-gray-800">{settings.currency}{spend.toFixed(2)}</span>
              </div>
            ))}
            {Object.keys(cashierCounter).length === 0 && (
              <div className="text-center text-apple-gray-300 text-xs py-4">No staff records logged for this period.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default Reports;
