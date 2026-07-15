import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Calendar, 
  Coins, 
  X,
  TrendingDown
} from 'lucide-react';
import type { Expense, CafeSettings, User as UserType } from '../types';
import { getExpenses, saveExpense, deleteExpense, saveAuditLog } from '../utils/db';

interface ExpensesProps {
  settings: CafeSettings;
  currentUser: UserType | null;
}

export const Expenses: React.FC<ExpensesProps> = ({ settings, currentUser }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'month' | 'custom'>('today');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states
  const [itemName, setItemName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Kitchen');
  const [quantity, setQuantity] = useState('');
  const [purchaser, setPurchaser] = useState(currentUser?.username || '');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);

  // Categories list
  const categories = ['Kitchen', 'Coffee Bar', 'Cleaning', 'Utilities', 'Salaries', 'Other'];

  const loadExpensesData = async () => {
    try {
      setLoading(true);
      const list = await getExpenses();
      setExpenses(list);
    } catch (err) {
      console.error('Failed to load expenses', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpensesData();
  }, []);

  // Update dates when presets change
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (datePreset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (datePreset === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      setStartDate(yesterdayStr);
      setEndDate(yesterdayStr);
    } else if (datePreset === 'month') {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      setStartDate(startOfMonth.toISOString().split('T')[0]);
      setEndDate(today);
    }
  }, [datePreset]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !price || !purchaser.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert('Please enter a valid price greater than 0');
      return;
    }

    const newExpense: Expense = {
      id: `exp_${Date.now()}`,
      date: expenseDate,
      itemName: itemName.trim(),
      category,
      quantity: quantity.trim() || '1 unit',
      price: priceNum,
      purchaser: purchaser.trim(),
      notes: notes.trim() || undefined,
      timestamp: new Date().toISOString()
    };

    try {
      await saveExpense(newExpense);
      
      // Save Audit log
      if (currentUser) {
        await saveAuditLog(
          currentUser.id,
          currentUser.username,
          'ADD_EXPENSE',
          `Added daily expense item "${newExpense.itemName}" cost: ${settings.currency}${newExpense.price.toFixed(2)}`
        );
      }

      // Reset form
      setItemName('');
      setPrice('');
      setCategory('Kitchen');
      setQuantity('');
      setNotes('');
      setExpenseDate(new Date().toISOString().split('T')[0]);
      setIsModalOpen(false);

      // Reload
      loadExpensesData();
      alert('Purchase expense logged successfully!');
    } catch (err) {
      alert('Failed to log expense');
    }
  };

  const handleDeleteExpense = async (exp: Expense) => {
    if (!currentUser || currentUser.role !== 'admin') {
      alert('Only administrators can delete logged purchase expenses.');
      return;
    }

    if (!confirm(`Are you sure you want to delete purchase log for "${exp.itemName}" (Cost: ${settings.currency}${exp.price.toFixed(2)})?`)) {
      return;
    }

    try {
      await deleteExpense(exp.id);

      // Audit Log
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'DELETE_EXPENSE',
        `Deleted past expense item "${exp.itemName}" (cost was: ${settings.currency}${exp.price.toFixed(2)})`
      );

      loadExpensesData();
      alert('Expense item deleted successfully');
    } catch (err) {
      alert('Failed to delete expense');
    }
  };

  // Calculations for KPI Cards
  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const currentMonthStart = new Date();
  currentMonthStart.setDate(1);
  currentMonthStart.setHours(0,0,0,0);

  const stats = expenses.reduce((acc, curr) => {
    const cost = curr.price;
    const expDate = new Date(curr.date);
    
    if (curr.date === todayStr) {
      acc.today += cost;
    }
    if (curr.date === yesterdayStr) {
      acc.yesterday += cost;
    }
    if (expDate >= currentMonthStart) {
      acc.month += cost;
    }
    return acc;
  }, { today: 0, yesterday: 0, month: 0 });

  // Filter list
  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = exp.itemName.toLowerCase().includes(search.toLowerCase()) || 
                          exp.purchaser.toLowerCase().includes(search.toLowerCase()) ||
                          (exp.notes && exp.notes.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'All' || exp.category === selectedCategory;
    const matchesDate = exp.date >= startDate && exp.date <= endDate;
    return matchesSearch && matchesCategory && matchesDate;
  });

  const totalFilteredSum = filteredExpenses.reduce((sum, exp) => sum + exp.price, 0);

  return (
    <div className="space-y-6 animate-fade-in select-none">
      
      {/* Header section */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-apple-gray-800">Daily Expenses Ledger</h2>
          <p className="text-xs text-[#86868b] mt-0.5">Track daily cafe purchases, grocery items, and vendor costs (Daily Hisab)</p>
        </div>
        <button
          onClick={() => {
            setPurchaser(currentUser?.username || '');
            setIsModalOpen(true);
          }}
          className="apple-btn-primary py-2.5 px-4 flex items-center gap-1.5 font-semibold text-xs shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Log Purchase / Expense</span>
        </button>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Today's Expense */}
        <div className="bg-white p-5 rounded-3xl border border-apple-gray-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Bought Today</span>
            <span className="text-2xl font-bold text-apple-gray-850 font-mono">
              {settings.currency}{stats.today.toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 text-amber-500 flex items-center justify-center">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* Yesterday's Expense */}
        <div className="bg-white p-5 rounded-3xl border border-apple-gray-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Bought Yesterday</span>
            <span className="text-2xl font-bold text-apple-gray-850 font-mono">
              {settings.currency}{stats.yesterday.toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 text-blue-500 flex items-center justify-center">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* This Month's Expense */}
        <div className="bg-white p-5 rounded-3xl border border-apple-gray-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Total Spent This Month</span>
            <span className="text-2xl font-bold text-apple-gray-850 font-mono">
              {settings.currency}{stats.month.toFixed(2)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 text-rose-500 flex items-center justify-center">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* Filters Ledger Section */}
      <div className="bg-white p-4 rounded-3xl border border-apple-gray-100 shadow-sm space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Search bar & Category dropdown */}
          <div className="flex flex-1 flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" />
              <input
                type="text"
                placeholder="Search purchase logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="apple-input pl-9 w-full text-xs"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="apple-input text-xs w-full sm:w-44 cursor-pointer"
            >
              <option value="All">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Date range filters */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Presets segment button */}
            <div className="bg-apple-gray-50 border border-apple-gray-100 rounded-xl p-0.5 flex gap-1 text-[10px] font-bold">
              {(['today', 'yesterday', 'month', 'custom'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setDatePreset(preset)}
                  className={`px-3 py-1.5 rounded-lg capitalize cursor-pointer transition-all duration-200 ${
                    datePreset === preset
                      ? 'bg-white text-apple-gray-800 shadow-sm'
                      : 'text-[#86868b] hover:text-apple-gray-800'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Custom Date Range Inputs */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 text-xs animate-fade-in">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="apple-input font-mono text-[11px] py-1 px-2.5"
                />
                <span className="text-[#86868b] text-[10px]">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="apple-input font-mono text-[11px] py-1 px-2.5"
                />
              </div>
            )}

          </div>

        </div>

        {/* Expenses List Ledger Table */}
        <div className="overflow-x-auto border border-apple-gray-50 rounded-2xl">
          <table className="min-w-full text-left border-collapse">
            <thead>
              <tr className="bg-apple-gray-50 text-[10px] font-bold text-[#86868b] uppercase tracking-wider border-b border-apple-gray-100">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Purchased Item</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Qty / Vol</th>
                <th className="py-3 px-4 text-right">Price Paid</th>
                <th className="py-3 px-4 text-center">Purchaser</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-center w-12">Actions</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-apple-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-[#86868b] italic">
                    Loading expenses database...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-[#86868b] italic">
                    No purchase logs match your search filters.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-apple-gray-50/40 transition-colors">
                    <td className="py-3 px-4 font-mono whitespace-nowrap text-[#86868b]">
                      {exp.date}
                    </td>
                    <td className="py-3 px-4 font-bold text-apple-gray-800">
                      {exp.itemName}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-apple-gray-50 text-apple-gray-500 border border-apple-gray-100">
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-apple-gray-700">
                      {exp.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-apple-gray-850 font-mono">
                      {settings.currency}{exp.price.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-center text-apple-gray-700 whitespace-nowrap">
                      {exp.purchaser}
                    </td>
                    <td className="py-3 px-4 text-[#86868b] italic max-w-xs truncate" title={exp.notes}>
                      {exp.notes || '-'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDeleteExpense(exp)}
                        disabled={currentUser?.role !== 'admin'}
                        className="p-1 rounded text-apple-gray-300 hover:text-red-500 hover:bg-red-50/50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                        title={currentUser?.role === 'admin' ? "Delete purchase log" : "Only admin can delete expenses"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Filtered Ledger Summary Bar */}
        <div className="flex justify-between items-center pt-3 border-t border-apple-gray-50 text-xs">
          <span className="text-[#86868b] font-medium">
            Showing <strong className="text-apple-gray-850 font-semibold">{filteredExpenses.length}</strong> purchase records
          </span>
          <div className="text-right">
            <span className="text-[10px] text-[#86868b] uppercase tracking-wider block font-bold">Ledger Subtotal</span>
            <span className="text-base font-bold text-apple-gray-850 font-mono">
              {settings.currency}{totalFilteredSum.toFixed(2)}
            </span>
          </div>
        </div>

      </div>

      {/* Log Purchase Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm select-none p-4">
          <div className="bg-white rounded-3xl border border-apple-gray-100 shadow-apple-medium w-full max-w-md overflow-hidden animate-fade-in">
            
            {/* Modal Header */}
            <div className="px-6 py-4 bg-apple-gray-50 border-b border-apple-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-apple-gray-800">Log Daily Purchase Expense</h3>
                <span className="text-[10px] text-apple-gray-300 font-semibold uppercase tracking-wider block mt-0.5">
                  Daily Expense Ledger (Hisab)
                </span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-apple-gray-100 text-[#86868b] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleAddExpense} className="p-6 space-y-4">
              
              {/* Item Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Purchased Item Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Milk 10L, Sugar, Tea Leaves, Coffee Mug"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="apple-input text-xs w-full"
                  required
                />
              </div>

              {/* Price & Quantity Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Price Paid ({settings.currency}) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Total amount"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="apple-input text-xs w-full font-mono text-center"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Quantity / Volume</label>
                  <input
                    type="text"
                    placeholder="e.g. 5 packets, 10 kg, 3 pieces"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="apple-input text-xs w-full text-center"
                  />
                </div>
              </div>

              {/* Category & Date Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Category <span className="text-red-500">*</span></label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="apple-input text-xs w-full cursor-pointer"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Purchase Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="apple-input text-xs w-full font-mono text-center"
                    required
                  />
                </div>
              </div>

              {/* Purchaser & Notes */}
              <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Logged By / Purchaser <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={purchaser}
                    onChange={(e) => setPurchaser(e.target.value)}
                    className="apple-input text-xs w-full"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Notes / Vendor Details</label>
                  <textarea
                    placeholder="Optional notes or supplier info..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="apple-input text-xs w-full resize-none py-2"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="apple-btn-secondary flex-1 py-2.5 text-center text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="apple-btn-primary flex-1 py-2.5 text-center text-xs font-bold cursor-pointer"
                >
                  Log Purchase
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
