import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  X, 
  UtensilsCrossed,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import type { MenuItem, User, CafeSettings } from '../types';
import { getMenu, saveMenuItem, deleteMenuItem, saveAuditLog } from '../utils/db';

interface MenuManagementProps {
  currentUser: User;
  settings: CafeSettings;
}

export const MenuManagement: React.FC<MenuManagementProps> = ({
  currentUser,
  settings
}) => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  
  // Editor Modals
  const [isEditing, setIsEditing] = useState(false);
  const [activeItem, setActiveItem] = useState<Partial<MenuItem> | null>(null);
  const [keywordsInput, setKeywordsInput] = useState('');

  const categories = ['All', ...Array.from(new Set(menu.map(item => item.category)))];

  const loadMenu = async () => {
    try {
      const items = await getMenu();
      setMenu(items);
    } catch (err) {
      console.error('Failed to load menu catalog', err);
    }
  };

  useEffect(() => {
    loadMenu();
  }, []);

  const handleToggleAvailability = async (item: MenuItem) => {
    const updated = { ...item, availability: !item.availability };
    try {
      await saveMenuItem(updated);
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'TOGGLE_MENU_AVAILABILITY',
        `Changed availability of ${item.name} to ${!item.availability}`
      );
      loadMenu();
    } catch (err) {
      alert('Failed to update availability.');
    }
  };

  const handleEditItem = (item: MenuItem) => {
    setActiveItem(item);
    setKeywordsInput(item.keywords.join(', '));
    setIsEditing(true);
  };
 
  const handleAddNewItem = () => {
    setActiveItem({
      id: `m_${Date.now()}`,
      name: '',
      category: 'Cold Beverages',
      price: 0,
      availability: true,
      popularTag: false,
      keywords: []
    });
    setKeywordsInput('');
    setIsEditing(true);
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (currentUser.role !== 'admin') {
      alert('Access Denied. Only Admins can delete catalog items.');
      return;
    }

    if (confirm(`Are you sure you want to delete menu item "${name}"?`)) {
      try {
        await deleteMenuItem(id);
        await saveAuditLog(
          currentUser.id,
          currentUser.username,
          'DELETE_MENU_ITEM',
          `Deleted menu item: ${name}`
        );
        loadMenu();
      } catch (err) {
        alert('Failed to delete item.');
      }
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem || !activeItem.name || activeItem.price === undefined) {
      alert('Please fill out all required fields.');
      return;
    }

    // Format keywords from string input
    const finalKeywords = keywordsInput
      .split(',')
      .map((kw) => kw.trim().toLowerCase())
      .filter(Boolean);

    const itemToSave: MenuItem = {
      id: activeItem.id || `m_${Date.now()}`,
      name: activeItem.name,
      category: activeItem.category || 'Cold Beverages',
      price: activeItem.price,
      availability: activeItem.availability !== undefined ? activeItem.availability : true,
      popularTag: activeItem.popularTag || false,
      keywords: finalKeywords
    };

    try {
      await saveMenuItem(itemToSave);
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        activeItem.id ? 'EDIT_MENU_ITEM' : 'ADD_MENU_ITEM',
        `${activeItem.id ? 'Edited' : 'Added'} menu item: ${itemToSave.name} (${itemToSave.category}, Price: ${settings.currency}${itemToSave.price})`
      );
      setIsEditing(false);
      setActiveItem(null);
      loadMenu();
    } catch (err) {
      alert('Failed to save item details.');
    }
  };

  // Filter Catalog
  const filteredMenu = menu.filter((item) => {
    const matchesSearch = 
      item.name.toLowerCase().includes(search.toLowerCase()) || 
      item.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase())) ||
      item.category.toLowerCase().includes(search.toLowerCase());

    const matchesCat = categoryFilter === 'All' ? true : item.category === categoryFilter;

    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6 select-none animate-fade-in">
      {/* Controls Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-apple-gray-100/80 shadow-apple-card gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-apple-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search menu catalog..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-apple-gray-50 border border-apple-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-apple-gray-200 transition-all font-light"
          />
        </div>

        {/* Category Filters & Add Button */}
        <div className="flex items-center gap-4">
          <div className="bg-[#f5f5f7] p-1 rounded-xl flex border border-apple-gray-100">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white text-apple-gray-800 shadow-sm'
                    : 'text-[#86868b] hover:text-apple-gray-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={handleAddNewItem}
            className="apple-btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="apple-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-apple-gray-50 border-b border-apple-gray-100/80 text-apple-gray-300 font-bold uppercase tracking-wider">
                <th className="py-4 px-6">Item Detail</th>
                <th className="py-4 px-6">Category</th>
                <th className="py-4 px-6">Pricing</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Search Tags</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-50 text-apple-gray-800">
              {filteredMenu.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-apple-gray-300">
                    <UtensilsCrossed className="w-10 h-10 opacity-30 mx-auto mb-2" />
                    <span className="font-semibold block">No catalog items found</span>
                    <span className="font-light text-[10px] mt-0.5">Add a new item to display inside orders.</span>
                  </td>
                </tr>
              ) : (
                filteredMenu.map((item) => (
                  <tr key={item.id} className="hover:bg-apple-gray-50/40 transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-semibold text-apple-gray-800 flex items-center gap-2">
                          <span>{item.name}</span>
                          {item.popularTag && (
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 border border-yellow-100 uppercase tracking-wide">
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-apple-gray-300 font-mono mt-0.5">{item.id}</div>
                      </div>
                    </td>
                    <td className="py-4 px-6 font-medium text-[#86868b]">{item.category}</td>
                    <td className="py-4 px-6 font-bold text-apple-gray-800">
                      {settings.currency}{item.price.toFixed(2)}
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        className="cursor-pointer transition-transform duration-100 hover:scale-105"
                      >
                        {item.availability ? (
                          <div className="flex items-center gap-1 text-green-600 font-semibold text-[10px]">
                            <ToggleRight className="w-6 h-6 text-green-500" />
                            <span>Available</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-apple-gray-300 font-semibold text-[10px]">
                            <ToggleLeft className="w-6 h-6 text-apple-gray-200" />
                            <span>Disabled</span>
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {item.keywords.map((tag) => (
                          <span 
                            key={tag} 
                            className="px-1.5 py-0.5 bg-apple-gray-50 border border-apple-gray-100 rounded text-[9px] text-[#86868b] font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleEditItem(item)}
                          className="p-1.5 rounded-lg border border-apple-gray-100 bg-[#f5f5f7]/30 hover:bg-apple-gray-100 text-apple-gray-800 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        
                        {currentUser.role === 'admin' && (
                          <button
                            onClick={() => handleDeleteItem(item.id, item.name)}
                            className="p-1.5 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 text-red-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal Popup */}
      {isEditing && activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-apple-gray-100 shadow-apple-medium w-full max-w-sm overflow-hidden animate-fade-in">
            <div className="px-6 py-4 bg-apple-gray-50 border-b border-apple-gray-100 flex justify-between items-center">
              <h3 className="text-sm font-bold text-apple-gray-800">
                {activeItem.id ? 'Modify Catalog Item' : 'New Catalog Item'}
              </h3>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setActiveItem(null);
                }}
                className="p-1 text-[#86868b] hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Item Name *</label>
                <input
                  type="text"
                  required
                  value={activeItem.name || ''}
                  onChange={(e) => setActiveItem(p => ({ ...p, name: e.target.value }))}
                  className="apple-input"
                  placeholder="e.g. Cold Latte"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-bold text-[#86868b]">Category</label>
                  <select
                    value={activeItem.category || 'Cold Beverages'}
                    onChange={(e) => setActiveItem(p => ({ ...p, category: e.target.value }))}
                    className="apple-input bg-apple-gray-50 text-apple-gray-800 cursor-pointer"
                  >
                    {categories.filter(c => c !== 'All').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-bold text-[#86868b]">Price ({settings.currency}) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={activeItem.price || ''}
                    onChange={(e) => setActiveItem(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                    className="apple-input font-mono"
                    placeholder="e.g. 150"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Autocomplete Keywords (comma-separated)</label>
                <input
                  type="text"
                  value={keywordsInput}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                  className="apple-input"
                  placeholder="e.g. cold, coffee, lat, drink"
                />
                <span className="text-[9px] text-apple-gray-300 font-light leading-normal">
                  Keywords help staff trigger instant selections inside customer carts.
                </span>
              </div>

              <div className="flex items-center gap-4 py-2 border-t border-apple-gray-50">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-[#86868b]">
                  <input
                    type="checkbox"
                    checked={activeItem.popularTag || false}
                    onChange={(e) => setActiveItem(p => ({ ...p, popularTag: e.target.checked }))}
                    className="rounded border-apple-gray-200 text-apple-gray-800 focus:ring-0"
                  />
                  <span>Highlight (Popular Tag)</span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full apple-btn-primary py-2.5 text-center mt-4"
              >
                Save Catalog Details
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
