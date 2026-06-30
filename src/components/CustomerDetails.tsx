import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Receipt,
  Bookmark,
  UtensilsCrossed,
  History
} from 'lucide-react';
import type { Customer, MenuItem, CafeSettings, OrderedItem, Bill } from '../types';
import { getMenu, saveCustomer, getBills, calculateBasementCharge } from '../utils/db';
import { downloadReceiptPDF } from '../utils/pdfGenerator';
import { BillDetailsModal } from './BillDetailsModal';
import { formatWhatsAppMessage } from '../utils/whatsappFormatter';


interface CustomerDetailsProps {
  customer: Customer;
  onBack: () => void;
  onUpdate: (updatedCustomer?: Customer) => void;
  onCheckout: () => void;
  settings: CafeSettings;
  currentUser: { id: string; username: string; role: string };
}

export const CustomerDetails: React.FC<CustomerDetailsProps> = ({
  customer,
  onBack,
  onUpdate,
  onCheckout,
  settings,
  currentUser: _currentUser
}) => {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [matchedItems, setMatchedItems] = useState<MenuItem[]>([]);
  const [mostOrdered, setMostOrdered] = useState<MenuItem[]>([]);
  const [selectedPizzaGroup, setSelectedPizzaGroup] = useState<{
    baseName: string;
    options: MenuItem[];
  } | null>(null);

  // Repeating customer past records states
  const [pastBills, setPastBills] = useState<Bill[]>([]);
  const [selectedPastBill, setSelectedPastBill] = useState<Bill | null>(null);
  const [isAiSharing, setIsAiSharing] = useState(false);

  // Load past bills matching current customer phone
  useEffect(() => {
    const loadPastBills = async () => {
      try {
        const allBills = await getBills();
        const customerPhoneClean = customer.phone.trim();
        const matches = allBills.filter(b => b.customerPhone.trim() === customerPhoneClean);
        // Sort newest first
        matches.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime());
        setPastBills(matches);
      } catch (err) {
        console.error('Failed to load past bills', err);
      }
    };
    loadPastBills();
  }, [customer.phone]);

  const downloadOldPDF = (billObj: Bill) => {
    downloadReceiptPDF(billObj, settings, true);
  };

  const reShareWhatsApp = async (billObj: Bill) => {
    setIsAiSharing(true);
    let visitCount = 1;
    try {
      const allBills = await getBills();
      const customerPhoneClean = billObj.customerPhone.trim();
      visitCount = allBills.filter(b => b.customerPhone.trim() === customerPhoneClean).length;
    } catch (err) {
      console.warn("Failed to retrieve visit history:", err);
    }
    setIsAiSharing(false);

    const receiptMessage = formatWhatsAppMessage(billObj, visitCount);

    navigator.clipboard.writeText(receiptMessage).then(() => {
      const phoneClean = billObj.customerPhone.replace(/[^0-9]/g, '');
      const encodedMsg = encodeURIComponent(receiptMessage);
      window.open(`https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodedMsg}`, '_blank');
    });
  };
  
  // Billing calculations local overrides
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [extraCharges, setExtraCharges] = useState<number>(0);

  const [, setTick] = useState(0);

  // Timer Tick
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Menu catalog and compute dynamically most ordered items
  useEffect(() => {
    const loadMenuAndPopular = async () => {
      try {
        const catalog = await getMenu();
        const activeCatalog = catalog.filter(item => item.availability);
        setMenu(activeCatalog);

        // Fetch all bills to compute popular items dynamically
        const allBills = await getBills();
        const itemCounts: { [itemId: string]: number } = {};
        
        allBills.forEach(bill => {
          if (bill.orderedItems) {
            bill.orderedItems.forEach(item => {
              itemCounts[item.menuItemId] = (itemCounts[item.menuItemId] || 0) + item.quantity;
            });
          }
        });

        // Sort items by count descending
        const sortedIds = Object.keys(itemCounts).sort((a, b) => itemCounts[b] - itemCounts[a]);
        
        // Map to MenuItem
        const topItems = sortedIds
          .map(id => activeCatalog.find(item => item.id === id))
          .filter((item): item is MenuItem => !!item)
          .slice(0, 8);

        // Fallback to popularTag items if there are no bills yet
        if (topItems.length === 0) {
          const fallback = activeCatalog.filter(m => m.popularTag).slice(0, 8);
          setMostOrdered(fallback);
        } else {
          setMostOrdered(topItems);
        }
      } catch (err) {
        console.error('Failed to load menu or compute popular items', err);
      }
    };
    loadMenuAndPopular();
  }, []);

  // Instant autocomplete logic
  useEffect(() => {
    let list = menu;
    if (search.trim().length > 0) {
      const query = search.toLowerCase();
      list = menu.filter((item) => {
        // Match name
        const matchName = item.name.toLowerCase().includes(query);
        // Match category
        const matchCat = item.category.toLowerCase().includes(query);
        // Match keywords
        const matchKw = item.keywords.some((kw) => kw.toLowerCase().includes(query));

        return matchName || matchCat || matchKw;
      });
    } else {
      list = mostOrdered;
    }

    // Group gourmet pizzas
    const groupedList: MenuItem[] = [];
    const pizzaSeen = new Set<string>();

    list.forEach((item) => {
      if (item.category === "Gourmet Crafted Pizzas") {
        const baseName = item.name.split(' - ')[0];
        if (!pizzaSeen.has(baseName)) {
          pizzaSeen.add(baseName);
          const siblings = menu.filter((m) => m.name.startsWith(baseName));
          const regularSize = siblings.find((m) => m.name.endsWith('Regular')) || item;
          groupedList.push({
            ...regularSize,
            name: baseName,
            price: regularSize.price
          });
        }
      } else {
        groupedList.push(item);
      }
    });

    setMatchedItems(groupedList.slice(0, 8));
  }, [search, menu, mostOrdered]);

  // Seating computations
  const getSeatingCost = () => {
    if (customer.location !== 'Basement') return 0;
    return calculateBasementCharge(customer.entryTime, Date.now(), settings.basementHourlyRate);
  };

  const getElapsedTimeStr = () => {
    const elapsedMs = Date.now() - new Date(customer.entryTime).getTime();
    const secs = Math.floor((elapsedMs / 1000) % 60);
    const mins = Math.floor((elapsedMs / (1000 * 60)) % 60);
    const hrs = Math.floor(elapsedMs / (1000 * 60 * 60));

    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Add Item to Customer Order
  const handleAddItem = async (menuItem: MenuItem) => {
    if (menuItem.category === "Gourmet Crafted Pizzas") {
      const baseName = menuItem.name.split(' - ')[0];
      const options = menu.filter((item) => item.name.startsWith(baseName));
      options.sort((a, b) => a.price - b.price);
      setSelectedPizzaGroup({ baseName, options });
      return;
    }

    const existingIndex = customer.orderedItems.findIndex(
      (item) => item.menuItemId === menuItem.id
    );

    let updatedOrders: OrderedItem[] = [...customer.orderedItems];

    if (existingIndex > -1) {
      updatedOrders[existingIndex] = {
        ...updatedOrders[existingIndex],
        quantity: updatedOrders[existingIndex].quantity + 1
      };
    } else {
      const newItem: OrderedItem = {
        id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: 1
      };
      updatedOrders.push(newItem);
    }

    const updatedCustomer = {
      ...customer,
      orderedItems: updatedOrders
    };

    if (!customer.id.startsWith('temp_')) {
      await saveCustomer(updatedCustomer);
    }
    onUpdate(updatedCustomer);
  };

  // Adjust quantity
  const handleAdjustQty = async (orderId: string, adjust: number) => {
    const existingIndex = customer.orderedItems.findIndex((item) => item.id === orderId);
    if (existingIndex === -1) return;

    let updatedOrders = [...customer.orderedItems];
    const newQty = updatedOrders[existingIndex].quantity + adjust;

    if (newQty <= 0) {
      updatedOrders.splice(existingIndex, 1);
    } else {
      updatedOrders[existingIndex] = {
        ...updatedOrders[existingIndex],
        quantity: newQty
      };
    }

    const updatedCustomer = {
      ...customer,
      orderedItems: updatedOrders
    };

    if (!customer.id.startsWith('temp_')) {
      await saveCustomer(updatedCustomer);
    }
    onUpdate(updatedCustomer);
  };

  // Remove Item completely
  const handleRemoveItem = async (orderId: string) => {
    const updatedCustomer = {
      ...customer,
      orderedItems: customer.orderedItems.filter((item) => item.id !== orderId)
    };
    if (!customer.id.startsWith('temp_')) {
      await saveCustomer(updatedCustomer);
    }
    onUpdate(updatedCustomer);
  };

  // Seating & Seating Totals
  const seatingCost = getSeatingCost();
  const foodSubtotal = customer.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const rawSubtotal = foodSubtotal + seatingCost;
  
  // Deduct discount
  const discountAmount = rawSubtotal * (discountPercent / 100);
  const subtotalAfterDiscount = rawSubtotal - discountAmount + extraCharges;
  
  // Calculate Tax (GST)
  const gstAmount = subtotalAfterDiscount * (settings.gstPercentage / 100);
  const grandTotal = subtotalAfterDiscount + gstAmount;

  // Format entry date
  const entryDate = new Date(customer.entryTime);
  const entryTimeStr = entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const entryDayStr = entryDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-6 select-none animate-fade-in">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-4 border-b border-apple-gray-100">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-full bg-white hover:bg-apple-gray-50 border border-apple-gray-100/80 shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-apple-gray-800" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-apple-gray-800">{customer.name}</h3>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider flex items-center gap-1 ${
                customer.location === 'Basement'
                  ? 'bg-red-50 text-red-500 border-red-100'
                  : customer.location === 'Takeaway'
                  ? 'bg-blue-50 text-blue-600 border-blue-100'
                  : 'bg-green-50 text-green-600 border-green-100'
              }`}>
                <MapPin className="w-2.5 h-2.5" />
                <span>{customer.location}</span>
              </span>
              {pastBills.length > 0 && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-green-100 uppercase tracking-wider bg-green-50 text-green-600">
                  Repeat Customer ({pastBills.length} visits)
                </span>
              )}
            </div>
            <p className="text-xs text-apple-gray-300 font-medium mt-1">
              {customer.id.startsWith('temp_') ? (
                <span className="text-apple-gray-250 italic">Anonymous Cart — Add food items to proceed to seating check-in.</span>
              ) : (
                <>
                  Phone: {customer.phone} | Seating ID: {customer.id} | Guests: {customer.numGuests}
                  {_currentUser.role !== 'staff' && customer.cashierName && (
                    <> | Order Taken By: <span className="font-semibold text-orange-500">{customer.cashierName}</span></>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {customer.id.startsWith('temp_') ? (
          <button
            onClick={onCheckout}
            className="flex items-center gap-2 px-5 py-2.5 bg-apple-gray-800 hover:bg-black text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Table & Check-in</span>
          </button>
        ) : (
          <button
            onClick={onCheckout}
            className="apple-btn-primary flex items-center gap-2"
          >
            <Receipt className="w-4 h-4" />
            <span>Proceed to Checkout</span>
          </button>
        )}
      </div>

      {/* Main layout: 3 equal or structured columns */}
      <div className="grid grid-cols-3 gap-6 items-start">
        {/* COLUMN 1: Seating timer, notes, and ordered items */}
        <div className="space-y-6">
          {/* Seating Timer Module */}
          {(customer.location === 'Basement' || customer.notes) && (
            <div className="apple-card">
              <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#86868b]" />
                <span>{customer.location !== 'Basement' ? 'Session Notes' : 'Seating Clock'}</span>
              </h4>
              
              <div className="space-y-4">
                {customer.location === 'Basement' && (
                  <div className="flex justify-between items-center bg-[#f5f5f7] p-4 rounded-xl border border-apple-gray-100">
                    <div>
                      <span className="text-[10px] text-[#86868b] uppercase tracking-wide font-medium">Session Duration</span>
                      <div className="text-2xl font-bold font-mono text-apple-gray-800 mt-0.5">{getElapsedTimeStr()}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#86868b] uppercase tracking-wide font-medium">Seating Costs</span>
                      <div className="text-xl font-bold text-apple-gray-800 mt-0.5">
                        {settings.currency}{seatingCost.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                {customer.location === 'Basement' && (
                  <div className="p-3 bg-orange-50/50 border border-orange-100 rounded-xl text-[10px] text-orange-600 font-light leading-relaxed">
                    Basement rules: {settings.currency}{settings.basementHourlyRate} for the first hour, then {settings.currency}{(settings.basementHourlyRate / 60).toFixed(2)}/minute ({settings.currency}{settings.basementHourlyRate}/hr rate).
                  </div>
                )}

                {/* Seating Notes */}
                {customer.notes && (
                  <div className="p-3.5 bg-apple-gray-50 border border-apple-gray-100 rounded-xl">
                    <span className="text-[9px] uppercase font-bold text-apple-gray-300 block mb-1">Entry Notes</span>
                    <p className="text-xs text-apple-gray-800 font-light italic">"{customer.notes}"</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ordered Food items log */}
          <div className="apple-card">
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-[#86868b]" />
              <span>Cart Inventory</span>
            </h4>

            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 no-scrollbar">
              {customer.orderedItems.length === 0 ? (
                <div className="text-center py-12 text-xs text-apple-gray-300 font-light">
                  No food ordered. Search & add items.
                </div>
              ) : (
                customer.orderedItems.map((item) => (
                  <div key={item.id} className="flex justify-between items-center py-2 border-b border-apple-gray-50 text-xs">
                    <div>
                      <p className="font-semibold text-apple-gray-800">{item.name}</p>
                      <p className="text-[10px] text-apple-gray-300 mt-0.5">
                        {settings.currency}{item.price.toFixed(2)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Quantity Controls */}
                      <div className="flex items-center border border-apple-gray-100 rounded-lg bg-apple-gray-50 p-0.5">
                        <button
                          onClick={() => handleAdjustQty(item.id, -1)}
                          className="p-1 text-[#86868b] hover:text-black hover:bg-white rounded transition-colors cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 font-bold font-mono text-apple-gray-800 text-xs min-w-[20px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleAdjustQty(item.id, 1)}
                          className="p-1 text-[#86868b] hover:text-black hover:bg-white rounded transition-colors cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="p-1.5 text-apple-gray-200 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Past Order History for Repeat Customers */}
          {pastBills.length > 0 && (
            <div className="apple-card">
              <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <History className="w-4 h-4 text-[#86868b]" />
                <span>Past Visits ({pastBills.length})</span>
              </h4>
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 no-scrollbar animate-fade-in">
                {pastBills.map((b) => (
                  <div 
                    key={b.id} 
                    onClick={() => setSelectedPastBill(b)}
                    className="p-3 bg-[#f5f5f7]/30 border border-apple-gray-100/50 rounded-xl hover:bg-[#f5f5f7]/70 hover:border-apple-gray-200 transition-all cursor-pointer flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="font-bold text-apple-gray-800">{b.billNumber}</span>
                      <span className="text-[9px] text-[#86868b] block mt-0.5">
                        {new Date(b.exitTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <span className="font-bold text-apple-gray-800">{settings.currency}{b.grandTotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLUMN 2: Autocomplete Food search */}
        <div className="apple-card col-span-1 h-[480px] flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-[#86868b]" />
              <span>Instant Menu Search</span>
            </h4>

            {/* Fast Search input */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 text-apple-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search food by name, category, abbreviation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-apple-gray-50 border border-apple-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-apple-gray-200 transition-all font-light"
              />
            </div>

            {/* List Heading indicator */}
            <div className="flex justify-between items-center mb-2 px-1">
              <span className="text-[10px] font-bold text-apple-gray-300 uppercase tracking-wider">
                {search.trim().length === 0 ? "🔥 Top 8 Ordered Items" : "Search Results"}
              </span>
            </div>

            {/* Matching Results list */}
            <div className="space-y-1.5 overflow-y-auto max-h-[340px] pr-1 no-scrollbar">
              {matchedItems.length === 0 ? (
                <div className="text-center py-20 text-xs text-apple-gray-300 font-light">
                  {search.trim().length === 0 ? "No order history yet. Type to search..." : `No items match "${search}"`}
                </div>
              ) : (
                matchedItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAddItem(item)}
                    className="w-full text-left px-3 py-2 bg-[#f5f5f7]/30 hover:bg-[#f5f5f7]/85 border border-transparent hover:border-apple-gray-100/60 rounded-xl flex items-center justify-between text-xs transition-apple cursor-pointer animate-fade-in"
                  >
                    <div>
                      <span className="font-semibold text-apple-gray-800">{item.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-apple-gray-300 font-medium">{item.category}</span>
                        {item.category === "Gourmet Crafted Pizzas" && (
                          <span className="text-[8px] font-bold px-1.5 py-0.2 bg-orange-50 text-orange-500 border border-orange-100 rounded-full uppercase tracking-wide">
                            Sizes
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-apple-gray-800">
                        {item.category === "Gourmet Crafted Pizzas" ? `from ${settings.currency}${item.price}` : `${settings.currency}${item.price}`}
                      </span>
                      <div className="w-6 h-6 rounded-full bg-apple-gray-800 hover:bg-black text-white flex items-center justify-center font-bold text-xs shadow-sm">
                        +
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="text-[10px] text-[#86868b] border-t border-apple-gray-50 pt-2.5 text-center font-light leading-relaxed">
            Acronyms supported: `cc` (Cold Coffee), `esp` (Espresso), etc. Autocomplete is sub-millisecond.
          </div>
        </div>

        {/* COLUMN 3: Live Bill preview & adjustments */}
        <div className="space-y-6">
          <div className="apple-card">
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#86868b]" />
              <span>Bill Breakdown</span>
            </h4>

            {/* Calculations items */}
            <div className="space-y-3.5 text-xs text-[#86868b]">
              <div className="flex justify-between font-medium">
                <span>Food & Beverage Subtotal</span>
                <span className="text-apple-gray-800">{settings.currency}{foodSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Seating Costs ({customer.location})</span>
                <span className="text-apple-gray-800">{settings.currency}{seatingCost.toFixed(2)}</span>
              </div>
              
              <hr className="border-apple-gray-50" />

              {/* Discount Selector */}
              <div className="flex items-center justify-between">
                <span>Apply Discount (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent || ''}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  className="w-16 px-2 py-1 text-right bg-apple-gray-50 border border-apple-gray-100 rounded-lg text-xs font-mono text-apple-gray-800 focus:outline-none"
                />
              </div>

              {/* Extra Charges Input */}
              <div className="flex items-center justify-between">
                <span>Extra Charges ({settings.currency})</span>
                <input
                  type="number"
                  min="0"
                  value={extraCharges || ''}
                  onChange={(e) => setExtraCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-16 px-2 py-1 text-right bg-apple-gray-50 border border-apple-gray-100 rounded-lg text-xs font-mono text-apple-gray-800 focus:outline-none"
                />
              </div>

              {/* Subtotal */}
              <div className="flex justify-between font-medium">
                <span>Discounted Total</span>
                <span className="text-apple-gray-800">
                  {settings.currency}{(rawSubtotal - discountAmount + extraCharges).toFixed(2)}
                </span>
              </div>

              {/* Taxes */}
              <div className="flex justify-between font-medium">
                <span>Taxes (GST {settings.gstPercentage}%)</span>
                <span className="text-apple-gray-800">{settings.currency}{gstAmount.toFixed(2)}</span>
              </div>

              <hr className="border-apple-gray-50" />

              {/* Grand Total */}
              <div className="flex justify-between text-sm font-bold text-black bg-apple-gray-50 p-2.5 rounded-xl border border-apple-gray-100">
                <span>Grand Total</span>
                <span>{settings.currency}{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Timeline Tracking */}
          <div className="apple-card">
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#86868b]" />
              <span>Activity Log</span>
            </h4>

            {/* Vertically stacked timeline */}
            <div className="space-y-4 relative pl-4 before:content-[''] before:absolute before:left-1 before:top-2 before:bottom-2 before:w-[1px] before:bg-apple-gray-100">
              {/* Seating checkpoint */}
              <div className="relative text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-apple-gray-800 absolute -left-[17px] top-1 border border-white" />
                <span className="font-semibold text-apple-gray-800 block">Seat Check-in Registered</span>
                <span className="text-[10px] text-[#86868b]">{entryDayStr} at {entryTimeStr}</span>
              </div>

              {/* Food ordering checkpoint */}
              <div className="relative text-xs">
                <span className={`w-2.5 h-2.5 rounded-full absolute -left-[17px] top-1 border border-white ${
                  customer.orderedItems.length > 0 ? 'bg-apple-gray-800' : 'bg-apple-gray-100'
                }`} />
                <span className={`font-semibold block ${
                  customer.orderedItems.length > 0 ? 'text-apple-gray-800' : 'text-apple-gray-300'
                }`}>
                  F&B Cart Updated
                </span>
                {customer.orderedItems.length > 0 ? (
                  <span className="text-[10px] text-[#86868b]">{customer.orderedItems.length} items logged</span>
                ) : (
                  <span className="text-[10px] text-[#86868b]">Waiting for food orders...</span>
                )}
              </div>

              {/* Checkout checkpoint */}
              <div className="relative text-xs opacity-60">
                <span className="w-2.5 h-2.5 rounded-full bg-apple-gray-100 absolute -left-[17px] top-1 border border-white" />
                <span className="font-semibold text-apple-gray-300 block">Pending Checkout Settlement</span>
                <span className="text-[10px] text-apple-gray-300">Requires clerk pin validation</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedPastBill && (
        <BillDetailsModal
          bill={selectedPastBill}
          onClose={() => setSelectedPastBill(null)}
          settings={settings}
          onDownloadPDF={downloadOldPDF}
          onShareWhatsApp={reShareWhatsApp}
          isAiSharing={isAiSharing}
        />
      )}

      {selectedPizzaGroup && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-apple-gray-100 shadow-2xl space-y-5 animate-scale-up">
            <div>
              <span className="text-[9px] font-bold text-orange-500 uppercase tracking-widest bg-orange-50 border border-orange-100 px-2.5 py-0.5 rounded-full">
                Pizza Option
              </span>
              <h3 className="text-base font-bold text-apple-gray-800 mt-2">{selectedPizzaGroup.baseName}</h3>
              <p className="text-xs text-apple-gray-300 font-light mt-1">
                Select your preferred size:
              </p>
            </div>

            <div className="space-y-2">
              {selectedPizzaGroup.options.map((option) => {
                const size = option.name.split(' - ')[1] || 'Regular';
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      const actualAddItem = async () => {
                        const existingIndex = customer.orderedItems.findIndex(
                          (item) => item.menuItemId === option.id
                        );

                        let updatedOrders: OrderedItem[] = [...customer.orderedItems];

                        if (existingIndex > -1) {
                          updatedOrders[existingIndex] = {
                            ...updatedOrders[existingIndex],
                            quantity: updatedOrders[existingIndex].quantity + 1
                          };
                        } else {
                          const newItem: OrderedItem = {
                            id: `ord_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            menuItemId: option.id,
                            name: option.name,
                            price: option.price,
                            quantity: 1
                          };
                          updatedOrders.push(newItem);
                        }

                        const updatedCustomer = {
                          ...customer,
                          orderedItems: updatedOrders
                        };

                        if (!customer.id.startsWith('temp_')) {
                          await saveCustomer(updatedCustomer);
                        }
                        onUpdate(updatedCustomer);
                        setSelectedPizzaGroup(null);
                      };
                      actualAddItem();
                    }}
                    className="w-full p-3 bg-apple-gray-50/50 hover:bg-apple-gray-50 border border-apple-gray-100 rounded-xl flex items-center justify-between text-xs transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                  >
                    <div className="text-left">
                      <span className="font-bold text-apple-gray-800 text-sm block">{size}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-apple-gray-800 text-sm">
                        {settings.currency}{option.price}
                      </span>
                      <div className="w-6 h-6 rounded-full bg-apple-gray-800 text-white flex items-center justify-center font-bold text-xs shadow-md">
                        +
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setSelectedPizzaGroup(null)}
                className="px-4 py-2 bg-apple-gray-50 hover:bg-apple-gray-100 text-apple-gray-800 rounded-xl text-xs font-semibold border border-apple-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
