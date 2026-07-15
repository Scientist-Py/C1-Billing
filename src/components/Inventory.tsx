import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Search, 
  Boxes, 
  Sparkles, 
  AlertTriangle, 
  TrendingUp, 
  X,
  History
} from 'lucide-react';
import type { InventoryItem, InventoryLog, CafeSettings, User } from '../types';
import { 
  getInventory, 
  saveInventoryItem, 
  deleteInventoryItem, 
  getInventoryLogs, 
  adjustStock, 
  saveAuditLog 
} from '../utils/db';
import { generateAIInventoryInsights } from '../utils/ai';

interface InventoryProps {
  currentUser: User;
  settings: CafeSettings;
}

export const Inventory: React.FC<InventoryProps> = ({ currentUser, settings }) => {
  const [activeSubTab, setActiveSubTab] = useState<'stock' | 'logs'>('stock');
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // New item form
  const [newItem, setNewItem] = useState({
    name: '',
    quantity: 0,
    unit: 'Pcs',
    minStock: 10
  });

  // Adjust stock form
  const [adjustData, setAdjustData] = useState({
    quantity: 0,
    type: 'restock' as InventoryLog['type'],
    reason: 'Weekly Restock'
  });

  // AI insights state
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const invList = await getInventory();
      const logList = await getInventoryLogs();
      setInventory(invList);
      setLogs(logList);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name.trim()) return;

    const itemId = `inv_${Date.now()}`;
    const item: InventoryItem = {
      id: itemId,
      name: newItem.name.trim(),
      quantity: Math.max(0, newItem.quantity),
      unit: newItem.unit,
      minStock: Math.max(0, newItem.minStock),
      lastUpdated: new Date().toISOString()
    };

    try {
      await saveInventoryItem(item);
      
      // Write creation log
      await adjustStock(
        itemId,
        item.quantity,
        'restock',
        'Initial Item Creation',
        currentUser.username
      );

      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'ADD_INVENTORY_ITEM',
        `Created inventory item ${item.name} with starting stock: ${item.quantity} ${item.unit}`
      );

      setNewItem({ name: '', quantity: 0, unit: 'Pcs', minStock: 10 });
      setIsAddOpen(false);
      loadData();
    } catch (err) {
      alert('Failed to save inventory item.');
    }
  };

  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const multiplier = (adjustData.type === 'consumption' || adjustData.type === 'waste') ? -1 : 1;
    const finalAmount = Math.max(0, adjustData.quantity) * multiplier;

    try {
      await adjustStock(
        selectedItem.id,
        finalAmount,
        adjustData.type,
        adjustData.reason,
        currentUser.username
      );

      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'ADJUST_INVENTORY_STOCK',
        `Adjusted stock for ${selectedItem.name}: ${finalAmount > 0 ? '+' : ''}${finalAmount} ${selectedItem.unit} (${adjustData.type}) - ${adjustData.reason}`
      );

      setAdjustData({ quantity: 0, type: 'restock', reason: 'Weekly Restock' });
      setSelectedItem(null);
      setIsAdjustOpen(false);
      loadData();
    } catch (err) {
      alert('Failed to adjust stock level.');
    }
  };

  const handleDeleteItem = async (item: InventoryItem) => {
    if (!confirm(`Are you sure you want to delete ${item.name}? This will clear all its history.`)) return;

    try {
      await deleteInventoryItem(item.id);
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'DELETE_INVENTORY_ITEM',
        `Deleted inventory item: ${item.name}`
      );
      loadData();
    } catch (err) {
      alert('Failed to delete item.');
    }
  };

  // Generate Groq AI Stock consultant report
  const handleGenerateAIReport = async () => {
    if (!settings.groqApiKey) {
      alert('Groq API Key is not configured in Settings. Please configure it to enable AI Stock Insights.');
      return;
    }

    setIsAiLoading(true);
    setAiReport(null);
    try {
      const report = await generateAIInventoryInsights(inventory, logs, settings.groqApiKey);
      setAiReport(report);
    } catch (err) {
      console.error(err);
      setAiReport('Failed to generate inventory audit report.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Filter items
  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  // Statistics
  const lowStockItems = inventory.filter(item => item.quantity <= item.minStock);
  const totalWastageCount = logs.filter(l => l.type === 'waste').reduce((sum, l) => sum + Math.abs(l.quantityAdjusted), 0);

  return (
    <div className="space-y-6 select-none animate-fade-in relative pb-10">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-apple-gray-800">Inventory Stock Ledger</h2>
          <p className="text-xs text-apple-gray-300 font-light mt-0.5">
            Admin console to manage raw materials, track ingredient audits, and consult Groq AI stock insights.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            className="p-2.5 bg-white border border-apple-gray-100 rounded-xl hover:bg-apple-gray-50 text-[#86868b] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setIsAddOpen(true)}
            className="apple-btn-primary px-4 py-2.5 flex items-center gap-2 text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>Create Stock Item</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-4 gap-6">
        <div className="apple-card p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Stock Catalog</span>
            <span className="text-2xl font-bold text-apple-gray-800 block mt-1">{inventory.length}</span>
            <span className="text-[10px] text-apple-gray-300 font-medium block mt-0.5">Unique inventory items</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100/50 flex items-center justify-center text-indigo-500">
            <Boxes className="w-6 h-6" />
          </div>
        </div>

        <div className="apple-card p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Low Stock Alerts</span>
            <span className="text-2xl font-bold block mt-1 text-red-500">{lowStockItems.length}</span>
            <span className="text-[10px] text-red-400 font-medium block mt-0.5">Require replenishment</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100/50 flex items-center justify-center text-red-500">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="apple-card p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Wastage Logged</span>
            <span className="text-2xl font-bold block mt-1 text-orange-500">{totalWastageCount}</span>
            <span className="text-[10px] text-orange-400 font-medium block mt-0.5">Damaged or spoiled units</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100/50 flex items-center justify-center text-orange-500">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="apple-card p-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Transaction Count</span>
            <span className="text-2xl font-bold text-apple-gray-800 block mt-1">{logs.length}</span>
            <span className="text-[10px] text-apple-gray-300 font-medium block mt-0.5">Logged adjustments</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-green-50 border border-green-100/50 flex items-center justify-center text-green-600">
            <History className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Groq AI Stock insights summary panel */}
      {settings.groqApiKey && (
        <div className="bg-gradient-to-r from-orange-50 to-indigo-50/50 border border-orange-100 rounded-3xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-orange-600 font-bold text-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>Groq AI Inventory Auditor</span>
            </div>
            <p className="text-xs text-apple-gray-800 font-medium leading-relaxed max-w-2xl">
              Consult Chapter One's AI stock expert. Analyze low stock levels, forecast restocking quantities, audit spoliation, and receive smart wastage reduction guidelines based on real logs.
            </p>
          </div>
          <button
            onClick={handleGenerateAIReport}
            disabled={isAiLoading}
            className="apple-btn-primary bg-orange-600 border-orange-600 hover:bg-orange-700 text-white font-semibold text-xs py-2.5 px-4 shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98] disabled:bg-orange-400"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAiLoading ? 'Auditing logs...' : 'Generate AI Insights'}</span>
          </button>
        </div>
      )}

      {/* AI Report display modal/panel */}
      {aiReport && (
        <div className="apple-card p-6 bg-white border border-indigo-100 shadow-lg space-y-4 animate-scale-up">
          <div className="flex justify-between items-center pb-2 border-b border-apple-gray-50">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500 animate-spin" style={{ animationDuration: '3s' }} />
              <h4 className="text-sm font-bold text-apple-gray-800 uppercase tracking-wide">AI Stock Auditor Report</h4>
            </div>
            <button
              onClick={() => setAiReport(null)}
              className="p-1 rounded-full hover:bg-apple-gray-50 text-apple-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="text-xs text-apple-gray-800 leading-relaxed whitespace-pre-wrap font-sans font-medium space-y-2 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
            {aiReport}
          </div>
          <div className="text-[10px] text-apple-gray-300 italic text-right">
            Generated using openai/gpt-oss-120b via Groq API.
          </div>
        </div>
      )}

      {/* Sub Tabs Controls */}
      <div className="border-b border-apple-gray-50 flex justify-between items-center">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveSubTab('stock')}
            className={`pb-3 text-sm font-semibold tracking-tight transition-all cursor-pointer relative ${
              activeSubTab === 'stock'
                ? 'text-apple-gray-800 border-b-2 border-apple-gray-800'
                : 'text-[#86868b] hover:text-apple-gray-800'
            }`}
          >
            Raw Materials & Ingredients
          </button>
          <button
            onClick={() => setActiveSubTab('logs')}
            className={`pb-3 text-sm font-semibold tracking-tight transition-all cursor-pointer relative ${
              activeSubTab === 'logs'
                ? 'text-apple-gray-800 border-b-2 border-apple-gray-800'
                : 'text-[#86868b] hover:text-apple-gray-800'
            }`}
          >
            Adjustment Logs History
          </button>
        </div>

        {activeSubTab === 'stock' && (
          <div className="relative pb-2 shrink-0">
            <Search className="w-4 h-4 text-apple-gray-300 absolute left-3.5 top-2" />
            <input
              type="text"
              placeholder="Search catalog..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="apple-input pl-9 pr-4 py-1.5 text-xs w-48 font-semibold rounded-xl bg-[#e8e8ed]/25"
            />
          </div>
        )}
      </div>

      {/* Sub Tab: Stock levels */}
      {activeSubTab === 'stock' && (
        <div className="bg-white border border-apple-gray-100 rounded-3xl overflow-hidden shadow-apple-small">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-apple-gray-50 border-b border-apple-gray-100 text-[10px] font-bold text-[#86868b] uppercase tracking-wider select-none">
                <th className="px-6 py-3.5">Ingredient / Supply Name</th>
                <th className="px-6 py-3.5 text-center">Stock Level</th>
                <th className="px-6 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-center">Alert Limit</th>
                <th className="px-6 py-3.5 text-center">Last Adjusted</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-50 text-xs">
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#86868b] font-medium">
                    No matching raw material items found.
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => {
                  const isLow = item.quantity <= item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-apple-gray-50/40 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base">📦</span>
                          <div>
                            <span className="font-bold text-apple-gray-800 block">{item.name}</span>
                            <span className="text-[10px] text-apple-gray-300 font-medium font-mono">{item.id}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center font-bold text-sm text-apple-gray-800">
                        {item.quantity} <span className="text-xs font-normal text-[#86868b]">{item.unit}</span>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] border ${
                          isLow 
                            ? 'bg-red-50 text-red-500 border-red-100' 
                            : 'bg-green-50 text-green-600 border-green-100'
                        }`}>
                          {isLow ? '🚨 LOW STOCK' : '✅ STABLE'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center font-medium font-mono text-apple-gray-800">
                        {item.minStock} {item.unit}
                      </td>

                      <td className="px-6 py-4 text-center text-apple-gray-300 font-medium">
                        {new Date(item.lastUpdated).toLocaleDateString()} at {new Date(item.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setIsAdjustOpen(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-[#f5f5f7] border border-apple-gray-100 rounded-xl hover:bg-[#e8e8ed] text-apple-gray-800 font-semibold cursor-pointer text-[10px] transition-colors"
                          >
                            <span>Adjust</span>
                          </button>
                          
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="p-1.5 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-xl text-[#86868b] hover:text-red-500 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Sub Tab: Audit Logs */}
      {activeSubTab === 'logs' && (
        <div className="bg-white border border-apple-gray-100 rounded-3xl overflow-hidden shadow-apple-small">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-apple-gray-50 border-b border-apple-gray-100 text-[10px] font-bold text-[#86868b] uppercase tracking-wider select-none">
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Raw Material</th>
                <th className="px-6 py-3.5 text-center">Type</th>
                <th className="px-6 py-3.5 text-center">Amount</th>
                <th className="px-6 py-3.5">Audit Reason & Remarks</th>
                <th className="px-6 py-3.5 text-right">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-50 text-xs">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#86868b] font-medium">
                    No stock transaction history logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isPositive = log.quantityAdjusted >= 0;
                  return (
                    <tr key={log.id} className="hover:bg-apple-gray-50/40 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-apple-gray-300">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>

                      <td className="px-6 py-4 font-bold text-apple-gray-800">
                        {log.itemName}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] border uppercase ${
                          log.type === 'restock'
                            ? 'bg-green-50 text-green-600 border-green-100'
                            : log.type === 'waste'
                            ? 'bg-red-50 text-red-500 border-red-100'
                            : log.type === 'consumption'
                            ? 'bg-blue-50 text-blue-600 border-blue-100'
                            : 'bg-apple-gray-50 text-apple-gray-800 border-apple-gray-100'
                        }`}>
                          {log.type}
                        </span>
                      </td>

                      <td className={`px-6 py-4 text-center font-bold text-sm ${
                        isPositive ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {isPositive ? '+' : ''}{log.quantityAdjusted}
                      </td>

                      <td className="px-6 py-4 text-[#86868b] font-medium max-w-xs truncate">
                        {log.reason}
                      </td>

                      <td className="px-6 py-4 text-right font-semibold text-apple-gray-800">
                        {log.user}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Create Item */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <form onSubmit={handleAddNewItem} className="bg-white rounded-3xl p-6 max-w-sm w-full border border-apple-gray-100 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-apple-gray-50 pb-2">
              <h3 className="text-base font-bold text-apple-gray-800">Create Stock Item</h3>
              <button type="button" onClick={() => setIsAddOpen(false)} className="text-apple-gray-300 hover:text-apple-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-[#86868b]">
              <div className="flex flex-col gap-1.5">
                <label className="uppercase tracking-wider text-[10px] font-bold">Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cheese Slice, Water Bottle"
                  value={newItem.name}
                  onChange={(e) => setNewItem(prev => ({ ...prev, name: e.target.value }))}
                  className="apple-input w-full text-apple-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="uppercase tracking-wider text-[10px] font-bold">Starting Quantity</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newItem.quantity}
                    onChange={(e) => setNewItem(prev => ({ ...prev, quantity: parseInt(e.target.value, 10) || 0 }))}
                    className="apple-input w-full text-apple-gray-800 font-mono text-center"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="uppercase tracking-wider text-[10px] font-bold">Unit Type</label>
                  <select
                    value={newItem.unit}
                    onChange={(e) => setNewItem(prev => ({ ...prev, unit: e.target.value }))}
                    className="apple-input w-full text-apple-gray-800 text-center"
                  >
                    <option value="Pcs">Pcs (Pieces)</option>
                    <option value="Kg">Kg (Kilogram)</option>
                    <option value="Ltr">Ltr (Liters)</option>
                    <option value="Bags">Bags</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="uppercase tracking-wider text-[10px] font-bold">Min Stock Warning Level</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newItem.minStock}
                  onChange={(e) => setNewItem(prev => ({ ...prev, minStock: parseInt(e.target.value, 10) || 0 }))}
                  className="apple-input w-full text-apple-gray-800 font-mono text-center"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 bg-apple-gray-50 hover:bg-apple-gray-100 text-apple-gray-800 rounded-xl text-xs font-semibold border border-apple-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-apple-gray-800 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Add Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Adjust Stock */}
      {isAdjustOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <form onSubmit={handleAdjustStockSubmit} className="bg-white rounded-3xl p-6 max-w-sm w-full border border-apple-gray-100 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-apple-gray-50 pb-2">
              <div>
                <span className="text-[9px] font-bold text-orange-500 uppercase tracking-widest bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                  Stock Control
                </span>
                <h3 className="text-base font-bold text-apple-gray-800 mt-1">{selectedItem.name}</h3>
              </div>
              <button type="button" onClick={() => setIsAdjustOpen(false)} className="text-apple-gray-300 hover:text-apple-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-semibold text-[#86868b]">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="uppercase tracking-wider text-[10px] font-bold">Adjustment Type</label>
                  <select
                    value={adjustData.type}
                    onChange={(e) => {
                      const type = e.target.value as InventoryLog['type'];
                      setAdjustData(prev => ({ 
                        ...prev, 
                        type,
                        reason: type === 'restock' ? 'Weekly Restock' : type === 'waste' ? 'Spoilage / Damages' : 'Manual stock count adjust'
                      }));
                    }}
                    className="apple-input w-full text-apple-gray-800 text-center"
                  >
                    <option value="restock">Add Stock (+)</option>
                    <option value="waste">Spolige/Waste (-)</option>
                    <option value="adjustment">Count Adjust (+/-)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="uppercase tracking-wider text-[10px] font-bold">Amount ({selectedItem.unit})</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={adjustData.quantity || ''}
                    onChange={(e) => setAdjustData(prev => ({ ...prev, quantity: parseInt(e.target.value, 10) || 0 }))}
                    className="apple-input w-full text-apple-gray-800 font-mono text-center"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="uppercase tracking-wider text-[10px] font-bold">Log Reason / Remarks</label>
                <input
                  type="text"
                  required
                  placeholder="Reason details for auditing..."
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData(prev => ({ ...prev, reason: e.target.value }))}
                  className="apple-input w-full text-apple-gray-800"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsAdjustOpen(false)}
                className="px-4 py-2 bg-apple-gray-50 hover:bg-apple-gray-100 text-apple-gray-800 rounded-xl text-xs font-semibold border border-apple-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-apple-gray-800 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Confirm Adjust
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
