import React, { useState } from 'react';
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
  UtensilsCrossed,
  Edit,
  Save,
  RotateCcw
} from 'lucide-react';
import type { Bill, CafeSettings, PaymentMethod, PaymentDetails } from '../types';
import { saveBill, syncToGoogleSheets, saveAuditLog, calculateBasementCharge } from '../utils/db';

interface BillDetailsModalProps {
  bill: Bill;
  onClose: () => void;
  onBillUpdate?: (updatedBill: Bill) => void;
  settings: CafeSettings;
  onDownloadPDF: (bill: Bill) => void;
  onShareWhatsApp: (bill: Bill) => void;
  isAiSharing?: boolean;
  currentUser: { id: string; username: string; role: string } | null;
}

export const BillDetailsModal: React.FC<BillDetailsModalProps> = ({
  bill,
  onClose,
  onBillUpdate,
  settings,
  onDownloadPDF,
  onShareWhatsApp,
  isAiSharing = false,
  currentUser
}) => {
  const dateStr = new Date(bill.date).toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });


  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState<string>(bill.customerName);
  const [editCustomerPhone, setEditCustomerPhone] = useState<string>(bill.customerPhone);
  const [editEntryTime, setEditEntryTime] = useState<string>(bill.entryTime);
  const [editExitTime, setEditExitTime] = useState<string>(bill.exitTime || '');
  const [editGrandTotal, setEditGrandTotal] = useState<number>(bill.grandTotal);
  const [editDiscount, setEditDiscount] = useState<number>(bill.discount);
  const [editExtraCharges, setEditExtraCharges] = useState<number>(bill.extraCharges);
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>(bill.paymentMethod);
  const [editStatus, setEditStatus] = useState<'Paid' | 'Pending'>(bill.status);
  const [editPaymentDetails, setEditPaymentDetails] = useState<PaymentDetails>(bill.paymentDetails || {
    cashAmount: 0,
    upiAmount: 0,
    cardAmount: 0
  });

  const toLocalDateTimeString = (isoString: string): string => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleSaveChanges = async () => {
    if (!editCustomerName.trim() || !editCustomerPhone.trim()) {
      alert('Customer Name and Phone cannot be empty.');
      return;
    }

    // If Split, validate amounts
    if (editPaymentMethod === 'Split') {
      const sum = (editPaymentDetails.cashAmount || 0) + (editPaymentDetails.upiAmount || 0) + (editPaymentDetails.cardAmount || 0);
      if (Math.abs(sum - editGrandTotal) > 0.05) {
        alert(`Split total (${settings.currency}${sum.toFixed(2)}) must equal Grand Total (${settings.currency}${editGrandTotal.toFixed(2)}). Current Difference: ${settings.currency}${Math.abs(sum - editGrandTotal).toFixed(2)}`);
        return;
      }
    }

    let finalTimeSpent = bill.timeSpentMinutes;
    let finalBasementCharges = bill.basementCharges;

    if (bill.location === 'Basement') {
      const entryMs = new Date(editEntryTime).getTime();
      const exitMs = new Date(editExitTime).getTime();
      if (exitMs < entryMs) {
        alert('Check-Out Time must be after Check-In Time.');
        return;
      }
      finalTimeSpent = Math.max(0, Math.round((exitMs - entryMs) / 60000));
      finalBasementCharges = calculateBasementCharge(editEntryTime, editExitTime, settings.basementHourlyRate);
    }

    const updatedBill: Bill = {
      ...bill,
      customerName: editCustomerName.trim(),
      customerPhone: editCustomerPhone.trim(),
      entryTime: editEntryTime,
      exitTime: editExitTime,
      timeSpentMinutes: finalTimeSpent,
      basementCharges: finalBasementCharges,
      discount: editDiscount,
      extraCharges: editExtraCharges,
      grandTotal: editGrandTotal,
      paymentMethod: editPaymentMethod,
      paymentDetails: editPaymentMethod === 'Split' ? editPaymentDetails : undefined,
      status: editStatus
    };

    try {
      await saveBill(updatedBill);
      await syncToGoogleSheets('CHECKOUT', updatedBill);
      
      if (currentUser) {
        await saveAuditLog(
          currentUser.id,
          currentUser.username,
          'EDIT_BILL',
          `Edited past bill ${bill.billNumber} (Customer details updated)`
        );
      }
      
      setIsEditing(false);
      if (onBillUpdate) {
        onBillUpdate(updatedBill);
      }
      alert('Bill updated and synced to Google Sheets successfully!');
    } catch (err) {
      alert('Failed to update the bill.');
    }
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 animate-fade-in">
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
          <div className="flex items-center gap-2">
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => {
                  if (isEditing) {
                    setIsEditing(false);
                    setEditCustomerName(bill.customerName);
                    setEditCustomerPhone(bill.customerPhone);
                    setEditEntryTime(bill.entryTime);
                    setEditExitTime(bill.exitTime || '');
                    setEditGrandTotal(bill.grandTotal);
                    setEditDiscount(bill.discount);
                    setEditExtraCharges(bill.extraCharges);
                    setEditPaymentMethod(bill.paymentMethod);
                    setEditStatus(bill.status);
                    setEditPaymentDetails(bill.paymentDetails || { cashAmount: 0, upiAmount: 0, cardAmount: 0 });
                  } else {
                    setIsEditing(true);
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-apple-gray-100 bg-white hover:bg-apple-gray-50 text-apple-gray-800 text-[10px] font-bold cursor-pointer flex items-center gap-1 transition-all mr-1.5 shadow-sm"
              >
                {isEditing ? (
                  <>
                    <RotateCcw className="w-3 h-3 text-orange-500" />
                    <span>Cancel</span>
                  </>
                ) : (
                  <>
                    <Edit className="w-3 h-3 text-blue-500" />
                    <span>Edit Bill</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-apple-gray-100 text-[#86868b] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
                <div className="space-y-1.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] uppercase font-bold text-[#86868b] block mb-1">Name</label>
                        <input
                          type="text"
                          className="w-full text-xs font-bold border border-apple-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-apple-blue-500"
                          value={editCustomerName}
                          onChange={(e) => setEditCustomerName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-[#86868b] block mb-1">Phone</label>
                        <input
                          type="text"
                          className="w-full text-xs font-medium border border-apple-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-apple-blue-500"
                          value={editCustomerPhone}
                          onChange={(e) => setEditCustomerPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-bold text-apple-gray-800">{bill.customerName}</div>
                      <div className="text-xs text-[#86868b] font-medium">Phone: {bill.customerPhone}</div>
                    </>
                  )}
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
                    {isEditing ? (
                      <>
                        <div>
                          <label className="text-[#86868b] block text-[9px] uppercase font-semibold mb-1">Check-In Time</label>
                          <input
                            type="datetime-local"
                            className="w-full text-xs font-mono border border-apple-gray-200 rounded px-1.5 py-0.5 bg-white text-apple-gray-800 focus:outline-none"
                            value={toLocalDateTimeString(editEntryTime)}
                            onChange={(e) => setEditEntryTime(new Date(e.target.value).toISOString())}
                          />
                        </div>
                        <div>
                          <label className="text-[#86868b] block text-[9px] uppercase font-semibold mb-1">Check-Out Time</label>
                          <input
                            type="datetime-local"
                            className="w-full text-xs font-mono border border-apple-gray-200 rounded px-1.5 py-0.5 bg-white text-apple-gray-800 focus:outline-none"
                            value={toLocalDateTimeString(editExitTime)}
                            onChange={(e) => setEditExitTime(new Date(e.target.value).toISOString())}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Check-In Time</span>
                          <span className="font-bold text-apple-gray-800">{new Date(bill.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div>
                          <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Check-Out Time</span>
                          <span className="font-bold text-apple-gray-800">
                            {bill.exitTime 
                              ? new Date(bill.exitTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : 'N/A'}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="col-span-2 pt-2 border-t border-apple-gray-100/50 mt-1 flex justify-between items-center">
                      <div>
                        <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Total Duration</span>
                        <span className="font-bold text-apple-gray-800">
                          {isEditing ? (
                            `${Math.max(0, Math.round((new Date(editExitTime).getTime() - new Date(editEntryTime).getTime()) / 60000))} mins`
                          ) : (
                            `${bill.timeSpentMinutes} mins`
                          )}
                        </span>
                      </div>
                      {bill.basementCharges > 0 && (
                        <div className="text-right">
                          <span className="text-[#86868b] block text-[9px] uppercase font-semibold">Basement Fee</span>
                          <span className="font-bold text-orange-500">
                            {settings.currency}
                            {isEditing ? (
                              calculateBasementCharge(editEntryTime, editExitTime, settings.basementHourlyRate).toFixed(2)
                            ) : (
                              bill.basementCharges.toFixed(2)
                            )}
                          </span>
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
                  {isEditing ? (
                    <>
                      <div className="flex justify-between items-center border-t border-apple-gray-100/50 pt-2 mt-1">
                        <span className="text-[#86868b] flex items-center gap-1">Method:</span>
                        <select
                          value={editPaymentMethod}
                          onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                          className="apple-input py-1 text-xs w-28 cursor-pointer"
                        >
                          <option value="Cash">Cash</option>
                          <option value="UPI">UPI</option>
                          <option value="Card">Card</option>
                          <option value="Split">Split</option>
                        </select>
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[#86868b]">Status:</span>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as 'Paid' | 'Pending')}
                          className="apple-input py-1 text-xs w-28 cursor-pointer"
                        >
                          <option value="Paid">Paid</option>
                          <option value="Pending">Pending</option>
                        </select>
                      </div>

                      {editPaymentMethod === 'Split' && (
                        <div className="mt-2 bg-white/60 p-2.5 rounded-xl border border-apple-gray-100/60 grid grid-cols-3 gap-1 text-center font-mono text-[10px] animate-fade-in">
                          <div>
                            <span className="text-[#86868b] block text-[8px] uppercase font-bold">Cash</span>
                            <input
                              type="number"
                              value={editPaymentDetails.cashAmount || ''}
                              onChange={(e) => setEditPaymentDetails(p => ({ ...p, cashAmount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                              className="apple-input w-full text-center py-1 text-[10px] mt-0.5 font-mono"
                            />
                          </div>
                          <div>
                            <span className="text-[#86868b] block text-[8px] uppercase font-bold">UPI</span>
                            <input
                              type="number"
                              value={editPaymentDetails.upiAmount || ''}
                              onChange={(e) => setEditPaymentDetails(p => ({ ...p, upiAmount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                              className="apple-input w-full text-center py-1 text-[10px] mt-0.5 font-mono"
                            />
                          </div>
                          <div>
                            <span className="text-[#86868b] block text-[8px] uppercase font-bold">Card</span>
                            <input
                              type="number"
                              value={editPaymentDetails.cardAmount || ''}
                              onChange={(e) => setEditPaymentDetails(p => ({ ...p, cardAmount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                              className="apple-input w-full text-center py-1 text-[10px] mt-0.5 font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center border-t border-apple-gray-100/50 pt-2 mt-1">
                        <span className="text-[#86868b] flex items-center gap-1">
                          {getPaymentIcon(bill.paymentMethod)}
                          <span>Method:</span>
                        </span>
                        <span className="font-bold text-apple-gray-800">{bill.paymentMethod}</span>
                      </div>

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
                    </>
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

                  {isEditing ? (
                    <>
                      <div className="flex justify-between items-center mt-2.5">
                        <span className="text-red-500 font-bold">Discount ({settings.currency}):</span>
                        <input
                          type="number"
                          min="0"
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="apple-input py-1 text-xs w-28 text-right font-mono"
                        />
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="text-emerald-600 font-bold">Extra Charges ({settings.currency}):</span>
                        <input
                          type="number"
                          min="0"
                          value={editExtraCharges}
                          onChange={(e) => setEditExtraCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="apple-input py-1 text-xs w-28 text-right font-mono"
                        />
                      </div>

                      <div className="flex justify-between items-center text-sm font-bold text-black bg-white p-2 rounded-xl border border-apple-gray-100 mt-2.5">
                        <span>Grand Total ({settings.currency}):</span>
                        <input
                          type="number"
                          min="0"
                          value={editGrandTotal}
                          onChange={(e) => setEditGrandTotal(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="apple-input py-1.5 text-xs w-32 text-right font-mono font-bold"
                        />
                      </div>
                    </>
                  ) : (
                    <>
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

                      <div className="flex justify-between text-xs border-t border-apple-gray-100/30 pt-2 font-bold text-black bg-white p-2.5 rounded-xl border border-apple-gray-100 mt-2">
                        <span>Grand Total:</span>
                        <span>{settings.currency}{bill.grandTotal.toFixed(2)}</span>
                      </div>
                    </>
                  )}
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
            {isEditing ? (
              <button
                onClick={handleSaveChanges}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => onShareWhatsApp(bill)}
                  disabled={isAiSharing}
                  className="px-3 py-2 rounded-xl border border-green-100 bg-green-50/50 hover:bg-green-50 text-green-600 disabled:bg-green-50/20 disabled:text-green-400 cursor-pointer text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:cursor-not-allowed"
                  title="Send invoice to WhatsApp automatically in background"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>{isAiSharing ? "Sending..." : "Share Bill"}</span>
                </button>
                <button
                  onClick={() => onDownloadPDF(bill)}
                  className="px-3 py-2 rounded-xl border border-apple-gray-100 bg-white hover:bg-apple-gray-50 text-apple-gray-800 cursor-pointer text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                  title="Download copy PDF invoice"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
