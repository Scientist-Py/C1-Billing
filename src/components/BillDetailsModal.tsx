import React from 'react';
import { 
  X, 
  FileDown, 
  Share2, 
  User, 
  MapPin, 
  Clock, 
  CreditCard, 
  Coins, 
  Smartphone, 
  Activity,
  Receipt,
  UserCheck,
  UtensilsCrossed
} from 'lucide-react';
import type { Bill, CafeSettings } from '../types';

interface BillDetailsModalProps {
  bill: Bill;
  onClose: () => void;
  settings: CafeSettings;
  onDownloadPDF: (bill: Bill) => void;
  onShareWhatsApp: (bill: Bill) => void;
  isAiSharing?: boolean;
}

export const BillDetailsModal: React.FC<BillDetailsModalProps> = ({
  bill,
  onClose,
  settings,
  onDownloadPDF,
  onShareWhatsApp,
  isAiSharing = false
}) => {
  const entryDate = new Date(bill.entryTime);
  const exitDate = new Date(bill.exitTime);
  
  const entryTimeStr = entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const exitTimeStr = exitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = exitDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  // Get Payment Icon helper
  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'Cash':
        return <Coins className="w-4 h-4 text-amber-500" />;
      case 'UPI':
        return <Smartphone className="w-4 h-4 text-blue-500" />;
      case 'Card':
        return <CreditCard className="w-4 h-4 text-purple-500" />;
      default:
        return <Activity className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm select-none p-4 animate-fade-in">
      <div 
        className="bg-white rounded-3xl border border-apple-gray-100 shadow-apple-medium w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-apple-gray-50 border-b border-apple-gray-100/80 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-apple-gray-800">Invoice Details</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                bill.status === 'Paid' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
              }`}>
                {bill.status}
              </span>
            </div>
            <span className="text-[10px] text-apple-gray-300 font-semibold uppercase tracking-wider block mt-0.5">
              Receipt #{bill.billNumber}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-apple-gray-100 text-[#86868b] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 no-scrollbar">
          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Column 1: Customer & Seating Info */}
            <div className="space-y-4">
              
              {/* Customer Profile Card */}
              <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-3">
                <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5 border-b border-apple-gray-100 pb-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>Customer Profile</span>
                </h4>
                <div className="space-y-1">
                  <div className="text-sm font-bold text-apple-gray-800">{bill.customerName}</div>
                  <div className="text-xs text-[#86868b] font-medium">Phone: {bill.customerPhone}</div>
                  {bill.location !== 'Main Hall' && (
                    <div className="text-xs text-[#86868b] font-medium flex items-center gap-1.5 mt-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider flex items-center gap-1 ${
                        bill.location === 'Basement'
                          ? 'bg-red-50 text-red-500 border-red-100'
                          : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{bill.location}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Seating Timeline details (only for Basement lounge tracking) */}
              {bill.location === 'Basement' && (
                <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-3">
                  <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5 border-b border-apple-gray-100 pb-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Session Timeline</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Check-In Time</span>
                      <span className="font-bold text-apple-gray-800">{entryTimeStr}</span>
                    </div>
                    <div>
                      <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Check-Out Time</span>
                      <span className="font-bold text-apple-gray-800">{exitTimeStr}</span>
                    </div>
                    <div className="col-span-2 pt-2 border-t border-apple-gray-100/50 mt-1 flex justify-between items-center">
                      <div>
                        <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Total Duration</span>
                        <span className="font-bold text-apple-gray-800">{bill.timeSpentMinutes} mins</span>
                      </div>
                      {bill.basementCharges > 0 && (
                        <div className="text-right">
                          <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Basement Fee</span>
                          <span className="font-bold text-orange-500">{settings.currency}{bill.basementCharges.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Details Card */}
              <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-3">
                <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5 border-b border-apple-gray-100 pb-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Settlement Info</span>
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-[#86868b]">Cashier/Staff:</span>
                    <span className="font-bold text-apple-gray-800">{bill.cashierName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#86868b]">Date:</span>
                    <span className="font-bold text-apple-gray-800">{dateStr}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-apple-gray-100/50 pt-2 mt-1">
                    <span className="text-[#86868b] flex items-center gap-1">
                      {getPaymentIcon(bill.paymentMethod)}
                      <span>Method:</span>
                    </span>
                    <span className="font-bold text-apple-gray-800">{bill.paymentMethod}</span>
                  </div>

                  {/* Render Split details if exists */}
                  {bill.paymentMethod === 'Split' && bill.paymentDetails && (
                    <div className="mt-2 bg-white/60 p-2.5 rounded-xl border border-apple-gray-100/60 grid grid-cols-3 gap-1 text-center font-mono text-[10px]">
                      <div>
                        <span className="text-[#86868b] block text-[8px] uppercase">Cash</span>
                        <span className="font-bold">{settings.currency}{bill.paymentDetails.cashAmount?.toFixed(0) || '0'}</span>
                      </div>
                      <div>
                        <span className="text-[#86868b] block text-[8px] uppercase">UPI</span>
                        <span className="font-bold">{settings.currency}{bill.paymentDetails.upiAmount?.toFixed(0) || '0'}</span>
                      </div>
                      <div>
                        <span className="text-[#86868b] block text-[8px] uppercase">Card</span>
                        <span className="font-bold">{settings.currency}{bill.paymentDetails.cardAmount?.toFixed(0) || '0'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Column 2: Order Items & Financial Totals */}
            <div className="space-y-4 flex flex-col justify-between">
              
              {/* Items List */}
              <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl flex-1 flex flex-col">
                <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5 border-b border-apple-gray-100 pb-1.5 mb-2">
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  <span>Cart Items</span>
                </h4>
                
                <div className="space-y-2 overflow-y-auto max-h-[180px] flex-1 pr-1 no-scrollbar">
                  {bill.orderedItems.length === 0 ? (
                    <div className="text-center py-8 text-xs text-apple-gray-300 italic font-light">
                      No food items ordered in this session.
                    </div>
                  ) : (
                    bill.orderedItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b border-apple-gray-50/50 last:border-0">
                        <div>
                          <span className="font-semibold text-apple-gray-800">{item.name}</span>
                          <span className="text-[9px] text-[#86868b] block mt-0.5">
                            {item.quantity}x {settings.currency}{item.price.toFixed(2)}
                          </span>
                        </div>
                        <span className="font-bold text-apple-gray-800">
                          {settings.currency}{(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Calculations Card */}
              <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-2.5">
                <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider flex items-center gap-1.5 border-b border-apple-gray-100 pb-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Receipt Totals</span>
                </h4>

                <div className="space-y-2 text-xs text-[#86868b] font-medium font-mono">
                  <div className="flex justify-between">
                    <span>Food Subtotal:</span>
                    <span className="text-apple-gray-800">{settings.currency}{bill.foodTotal.toFixed(2)}</span>
                  </div>
                  {bill.basementCharges > 0 && (
                    <div className="flex justify-between">
                      <span>Basement Charges:</span>
                      <span className="text-apple-gray-800">{settings.currency}{bill.basementCharges.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-apple-gray-100/30 pt-1.5">
                    <span>Subtotal:</span>
                    <span className="text-apple-gray-800">{settings.currency}{bill.subtotal.toFixed(2)}</span>
                  </div>

                  {bill.discount > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Discount applied:</span>
                      <span>-{settings.currency}{bill.discount.toFixed(2)}</span>
                    </div>
                  )}

                  {bill.extraCharges > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Extra Charges:</span>
                      <span>+{settings.currency}{bill.extraCharges.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Taxes (GST {settings.gstPercentage}%):</span>
                    <span className="text-apple-gray-800">{settings.currency}{bill.tax.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-sm font-bold text-black bg-white p-2.5 rounded-xl border border-apple-gray-100 mt-2">
                    <span>Grand Total:</span>
                    <span>{settings.currency}{bill.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-apple-gray-50 border-t border-apple-gray-100/80 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-apple-gray-100 hover:bg-apple-gray-50 text-apple-gray-800 text-xs font-semibold rounded-xl transition-all shadow-sm cursor-pointer"
          >
            Close View
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={() => onShareWhatsApp(bill)}
              disabled={isAiSharing}
              className="px-3 py-2 rounded-xl border border-green-100 bg-green-50/50 hover:bg-green-50 text-green-600 disabled:bg-green-50/20 disabled:text-green-400 cursor-pointer text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:cursor-not-allowed"
              title="Share invoice to WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{isAiSharing ? "Drafting AI..." : "Share WhatsApp"}</span>
            </button>
            <button
              onClick={() => onDownloadPDF(bill)}
              className="px-3 py-2 rounded-xl border border-apple-gray-100 bg-white hover:bg-apple-gray-50 text-apple-gray-800 cursor-pointer text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download copy PDF invoice"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
