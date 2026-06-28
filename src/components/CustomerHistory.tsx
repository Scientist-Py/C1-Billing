import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Calendar, 
  Receipt, 
  User, 
  FileDown, 
  Share2, 
  Award,
  ChevronRight,
  X,
  Phone,
  Eye,
  Trash2
} from 'lucide-react';
import type { Bill, CafeSettings, User as UserType } from '../types';
import { getBills, deleteBill, saveAuditLog, syncToGoogleSheets } from '../utils/db';
import { downloadReceiptPDF } from '../utils/pdfGenerator';
import { BillDetailsModal } from './BillDetailsModal';


interface CustomerHistoryProps {
  settings: CafeSettings;
  currentUser: UserType;
}

export const CustomerHistory: React.FC<CustomerHistoryProps> = ({
  settings,
  currentUser
}) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Selected Profile state
  const [selectedProfilePhone, setSelectedProfilePhone] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [profileStats, setProfileStats] = useState<{
    customerName: string;
    phone: string;
    visitCount: number;
    totalSpend: number;
    avgSpend: number;
    favoriteItems: { name: string; count: number }[];
    historicalBills: Bill[];
  } | null>(null);

  const handleDeleteBill = async (billObj: Bill) => {
    if (!window.confirm(`Are you sure you want to delete invoice ${billObj.billNumber} for ${billObj.customerName}? This will permanently remove it from database logs.`)) {
      return;
    }
    try {
      // 1. Delete from local IndexedDB
      await deleteBill(billObj.id);

      // 2. Sync deletion to Google Sheets
      syncToGoogleSheets('DELETE_BILL', { billNumber: billObj.billNumber });

      // 3. Write Audit Log
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'DELETE_BILL',
        `Deleted invoice ${billObj.billNumber} for ${billObj.customerName}. Value: ${settings.currency}${billObj.grandTotal.toFixed(2)}`
      );

      alert(`Invoice ${billObj.billNumber} successfully deleted.`);
      loadHistory();
    } catch (err) {
      alert('Failed to delete invoice from database.');
    }
  };

  const loadHistory = async () => {
    try {
      let allBills = await getBills();
      // Filter if staff member
      if (currentUser.role === 'staff') {
        allBills = allBills.filter(b => b.cashierId === currentUser.id);
      }
      // Sort newest first
      allBills.sort((a, b) => new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime());
      setBills(allBills);
    } catch (err) {
      console.error('Failed to load billing history', err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Compute stats for a customer profile when a phone number is selected
  useEffect(() => {
    if (!selectedProfilePhone) {
      setProfileStats(null);
      return;
    }

    const customerBills = bills.filter(b => b.customerPhone === selectedProfilePhone);
    if (customerBills.length === 0) {
      setProfileStats(null);
      return;
    }

    const customerName = customerBills[0].customerName;
    const visitCount = customerBills.length;
    const totalSpend = customerBills.reduce((sum, b) => sum + b.grandTotal, 0);
    const avgSpend = totalSpend / visitCount;

    // Favorite items count
    const itemMap: Record<string, number> = {};
    customerBills.forEach(b => {
      b.orderedItems.forEach(item => {
        itemMap[item.name] = (itemMap[item.name] || 0) + item.quantity;
      });
    });

    const favoriteItems = Object.entries(itemMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    setProfileStats({
      customerName,
      phone: selectedProfilePhone,
      visitCount,
      totalSpend,
      avgSpend,
      favoriteItems,
      historicalBills: customerBills
    });

  }, [selectedProfilePhone, bills]);

  // Filter bills
  const filteredBills = bills.filter((b) => {
    const query = search.toLowerCase();
    const matchSearch = 
      b.customerName.toLowerCase().includes(query) || 
      b.customerPhone.includes(query) || 
      b.billNumber.toLowerCase().includes(query) || 
      b.location.toLowerCase().includes(query);

    let matchDate = true;
    if (startDate) {
      matchDate = matchDate && b.date >= startDate;
    }
    if (endDate) {
      matchDate = matchDate && b.date <= endDate;
    }

    return matchSearch && matchDate;
  });

  // Re-generate jsPDF invoice
  const downloadOldPDF = (billObj: Bill) => {
    downloadReceiptPDF(billObj, settings, true);
  };

  const reShareWhatsApp = (billObj: Bill) => {
    let itemsText = '';
    billObj.orderedItems.forEach(item => {
      itemsText += `• ${item.name} x ${item.quantity} = ₹${(item.price * item.quantity).toFixed(2)}\n`;
    });

    if (billObj.basementCharges > 0) {
      itemsText += `• Basement Seating Fee (${billObj.timeSpentMinutes} min) = ${settings.currency}${billObj.basementCharges.toFixed(2)}\n`;
    }

    const receiptMessage = `*CHAPTER ONE CAFE INVOICE (COPY)*\n` +
      `--------------------------------------\n` +
      `*Bill Number:* ${billObj.billNumber}\n` +
      `*Customer Name:* ${billObj.customerName}\n` +
      `*Phone Number:* ${billObj.customerPhone}\n` +
      (billObj.location !== 'Main Hall' ? `*Area:* ${billObj.location}\n` : '') +
      `*Date:* ${(billObj.location === 'Main Hall' || billObj.location === 'Takeaway') ? new Date(billObj.exitTime).toLocaleDateString() : new Date(billObj.exitTime).toLocaleString()}\n` +
      (billObj.location === 'Basement' ? `*Time Spent:* ${billObj.timeSpentMinutes} Minutes\n` : '') +
      `--------------------------------------\n` +
      `*ITEMS ORDERED:*\n${itemsText}` +
      `--------------------------------------\n` +
      `*Subtotal:* ₹${billObj.subtotal.toFixed(2)}\n` +
      (billObj.discount > 0 ? `*Discount:* -₹${billObj.discount.toFixed(2)}\n` : '') +
      (billObj.extraCharges > 0 ? `*Extra Charges:* +₹${billObj.extraCharges.toFixed(2)}\n` : '') +
      `*GST (${settings.gstPercentage}%):* ₹${billObj.tax.toFixed(2)}\n` +
      `*GRAND TOTAL:* ₹${billObj.grandTotal.toFixed(2)}\n` +
      `--------------------------------------\n` +
      `*Payment Method:* ${billObj.paymentMethod} (${billObj.status})\n` +
      `--------------------------------------\n` +
      `_${settings.receiptFooter}_`;

    navigator.clipboard.writeText(receiptMessage).then(() => {
      const phoneClean = billObj.customerPhone.replace(/[^0-9]/g, '');
      const encodedMsg = encodeURIComponent(receiptMessage);
      window.open(`https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodedMsg}`, '_blank');
    });
  };

  return (
    <div className="space-y-6 select-none animate-fade-in relative">
      {/* Controls Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-apple-gray-100/80 shadow-apple-card gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-apple-gray-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, phone, or receipt ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-apple-gray-50 border border-apple-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-apple-gray-200 transition-all font-light"
          />
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2 text-xs font-semibold text-[#86868b]">
          <Calendar className="w-4 h-4 text-[#86868b]" />
          <span>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 rounded bg-apple-gray-50 border border-apple-gray-100 font-mono focus:outline-none"
          />
          <span>To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 rounded bg-apple-gray-50 border border-apple-gray-100 font-mono focus:outline-none"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate(''); }}
              className="p-1 text-red-500 hover:bg-red-50 rounded"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* History Log Table */}
      <div className="apple-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-apple-gray-50 border-b border-apple-gray-100/80 text-apple-gray-300 font-bold uppercase tracking-wider">
                <th className="py-4 px-6">Bill Number</th>
                <th className="py-4 px-6">Customer Details</th>
                {currentUser.role !== 'staff' && <th className="py-4 px-6">Cashier</th>}
                <th className="py-4 px-6">Area</th>
                <th className="py-4 px-6">Duration</th>
                <th className="py-4 px-6">Grand Total</th>
                <th className="py-4 px-6">Method</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-50 text-apple-gray-800">
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={currentUser.role !== 'staff' ? 8 : 7} className="py-16 text-center text-apple-gray-300">
                    <Receipt className="w-10 h-10 opacity-30 mx-auto mb-2" />
                    <span className="font-semibold block">No historical bills matched</span>
                    <span className="font-light text-[10px] mt-0.5">Finalize a seating session to archive records here.</span>
                  </td>
                </tr>
              ) : (
                filteredBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-apple-gray-50/40 transition-colors cursor-pointer" onClick={() => setSelectedBill(bill)}>
                    <td className="py-4 px-6 font-bold text-apple-gray-800">{bill.billNumber}</td>
                    <td className="py-4 px-6">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedProfilePhone(bill.customerPhone); }}
                        className="text-left font-semibold text-apple-gray-800 hover:text-black hover:underline cursor-pointer flex flex-col"
                      >
                        <span>{bill.customerName}</span>
                        <span className="text-[10px] text-[#86868b] font-normal flex items-center gap-1 mt-0.5">
                          <Phone className="w-2.5 h-2.5" /> {bill.customerPhone}
                        </span>
                      </button>
                    </td>
                    {currentUser.role !== 'staff' && (
                      <td className="py-4 px-6 font-semibold text-orange-500">
                        {bill.cashierName || 'System'}
                      </td>
                    )}
                    <td className="py-4 px-6">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${
                        bill.location === 'Basement' 
                          ? 'bg-red-50 text-red-500 border-red-100' 
                          : bill.location === 'Takeaway'
                          ? 'bg-blue-50 text-blue-600 border-blue-100'
                          : 'bg-green-50 text-green-600 border-green-100'
                      }`}>
                        {bill.location}
                      </span>
                    </td>
                    <td className="py-4 px-6 font-medium text-[#86868b]">{bill.timeSpentMinutes} mins</td>
                    <td className="py-4 px-6 font-bold text-apple-gray-800">
                      {settings.currency}{bill.grandTotal.toFixed(2)}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        bill.status === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                      }`}>
                        {bill.paymentMethod} ({bill.status})
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedBill(bill); }}
                          className="p-1.5 rounded-lg border border-apple-gray-100 bg-[#f5f5f7]/30 hover:bg-apple-gray-100 text-apple-gray-850 cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadOldPDF(bill); }}
                          className="p-1.5 rounded-lg border border-apple-gray-100 bg-white hover:bg-apple-gray-50 text-apple-gray-800 cursor-pointer"
                          title="Download Copy PDF"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); reShareWhatsApp(bill); }}
                          className="p-1.5 rounded-lg border border-green-100 bg-green-50/50 hover:bg-green-50 text-green-600 cursor-pointer"
                          title="Share to WhatsApp"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedProfilePhone(bill.customerPhone); }}
                          className="p-1.5 rounded-lg border border-apple-gray-100 bg-[#f5f5f7]/30 hover:bg-apple-gray-100 text-apple-gray-800 cursor-pointer flex items-center gap-1 font-medium"
                          title="View customer profile details"
                        >
                          <span>Profile</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                        {currentUser.role === 'admin' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteBill(bill); }}
                            className="p-1.5 rounded-lg border border-red-100 bg-red-50/50 hover:bg-red-50 hover:border-red-200 text-red-500 cursor-pointer flex items-center justify-center"
                            title="Delete Invoice"
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

      {/* Customer Profile Side Drawer Modal */}
      {selectedProfilePhone && profileStats && (
        <div className="fixed inset-y-0 right-0 z-40 w-[420px] bg-white border-l border-apple-gray-100 shadow-apple-medium p-6 flex flex-col justify-between animate-slide-in">
          <div>
            {/* Profile Header */}
            <div className="flex justify-between items-start pb-4 border-b border-apple-gray-50 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-apple-gray-50 border border-apple-gray-100 flex items-center justify-center font-bold text-apple-gray-800 text-lg">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-apple-gray-800 leading-tight">
                    {profileStats.customerName}
                  </h4>
                  <p className="text-xs text-apple-gray-300 font-medium mt-0.5">{profileStats.phone}</p>
                </div>
              </div>
              
              <button
                onClick={() => setSelectedProfilePhone(null)}
                className="p-1.5 rounded-full hover:bg-apple-gray-50 text-[#86868b] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Profile Performance Metrics */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-3 bg-apple-gray-50 border border-apple-gray-100/60 rounded-2xl text-center">
                <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Total Visits</span>
                <span className="text-base font-bold text-apple-gray-800 mt-1 block">{profileStats.visitCount}</span>
              </div>
              <div className="p-3 bg-apple-gray-50 border border-apple-gray-100/60 rounded-2xl text-center">
                <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Total Spend</span>
                <span className="text-base font-bold text-apple-gray-800 mt-1 block">
                  {settings.currency}{profileStats.totalSpend.toFixed(0)}
                </span>
              </div>
              <div className="p-3 bg-apple-gray-50 border border-apple-gray-100/60 rounded-2xl text-center">
                <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Avg Order</span>
                <span className="text-base font-bold text-apple-gray-800 mt-1 block">
                  {settings.currency}{profileStats.avgSpend.toFixed(0)}
                </span>
              </div>
            </div>

            {/* Customer preferences / Favorite Items */}
            <div className="mb-6">
              <h5 className="text-[10px] uppercase font-bold text-apple-gray-300 tracking-wider mb-2.5 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                <span>Preferred Choices</span>
              </h5>
              <div className="space-y-2">
                {profileStats.favoriteItems.length === 0 ? (
                  <div className="text-xs text-[#86868b] italic">No items ordered yet.</div>
                ) : (
                  profileStats.favoriteItems.map((item, idx) => (
                    <div key={item.name} className="flex justify-between items-center py-2 px-3 bg-[#f5f5f7]/30 border border-apple-gray-100/50 rounded-xl text-xs">
                      <span className="font-semibold text-apple-gray-800">
                        {idx + 1}. {item.name}
                      </span>
                      <span className="text-[10px] font-bold text-apple-gray-300 bg-white px-2 py-0.5 border border-apple-gray-100 rounded-full">
                        {item.count} items ordered
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Customer Historical Bills list */}
            <div>
              <h5 className="text-[10px] uppercase font-bold text-apple-gray-300 tracking-wider mb-2.5 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                <span>Recent Transactions ({profileStats.visitCount})</span>
              </h5>
              
              <div className="space-y-2 overflow-y-auto max-h-56 pr-1 no-scrollbar">
                {profileStats.historicalBills.map(b => (
                  <div 
                    key={b.id} 
                    onClick={() => setSelectedBill(b)}
                    className="p-3 bg-white border border-apple-gray-100 rounded-xl hover:border-apple-gray-200 hover:bg-apple-gray-50/50 cursor-pointer transition-colors flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="font-bold text-apple-gray-800">{b.billNumber}</span>
                      <span className="text-[9px] text-[#86868b] block mt-0.5">
                        {new Date(b.exitTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-bold text-apple-gray-800">{settings.currency}{b.grandTotal.toFixed(2)}</span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadOldPDF(b); }}
                          className="p-1 rounded bg-apple-gray-50 border border-apple-gray-100 hover:bg-apple-gray-100 text-apple-gray-800 transition-colors cursor-pointer"
                        >
                          <FileDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-apple-gray-50 pt-4 text-center">
            <span className="text-[10px] text-apple-gray-300 block">Chapter One Cafe Billing System</span>
          </div>
        </div>
      )}

      {/* Bill Details Modal */}
      {selectedBill && (
        <BillDetailsModal
          bill={selectedBill}
          onClose={() => setSelectedBill(null)}
          settings={settings}
          onDownloadPDF={downloadOldPDF}
          onShareWhatsApp={reShareWhatsApp}
        />
      )}
    </div>
  );
};
