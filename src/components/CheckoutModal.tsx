import React, { useState, useEffect } from 'react';
import { 
  X, 
  CreditCard, 
  Coins, 
  Smartphone, 
  Activity, 
  Check, 
  FileDown, 
  Share2,
  Calculator
} from 'lucide-react';
import type { Customer, Bill, CafeSettings, PaymentMethod, PaymentDetails } from '../types';
import { getNextBillNumber, saveBill, deleteCustomer, saveAuditLog, syncToGoogleSheets, calculateBasementCharge, getInventory, adjustStock, getBills } from '../utils/db';
import { downloadReceiptPDF } from '../utils/pdfGenerator';
import { sendCheckoutInvoice } from '../utils/whatsappCloud';
import { useToast } from '../context/toastContext';

interface CheckoutModalProps {
  customer: Customer;
  onClose: () => void;
  onCheckoutComplete: () => void;
  settings: CafeSettings;
  currentUser: { id: string; username: string; role: string };
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  customer,
  onClose,
  onCheckoutComplete,
  settings,
  currentUser
}) => {
  const toast = useToast();
  
  const preventMinus = (e: React.KeyboardEvent) => {
    if (e.key === '-' || e.key === 'e' || e.key === 'E') {
      e.preventDefault();
    }
  };

  const [exitTime, setExitTime] = useState<string>(new Date().toISOString());
  const [billNumber, setBillNumber] = useState<string>('');
  
  // Payment variables
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails>({
    cashAmount: 0,
    upiAmount: 0,
    cardAmount: 0
  });

  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Pending'>('Paid');
  const [cashReceived, setCashReceived] = useState<number | ''>('');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [extraCharges, setExtraCharges] = useState<number>(0);
  
  // Custom total override state
  const [customGrandTotal, setCustomGrandTotal] = useState<number>(0);
  const [useCustomGrandTotal, setUseCustomGrandTotal] = useState<boolean>(false);
  
  // Success state after final checkout
  const [isSuccess, setIsSuccess] = useState(false);
  const [generatedBill, setGeneratedBill] = useState<Bill | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Loyalty profile overview for returning guests
  const [loyaltyProfile, setLoyaltyProfile] = useState<{
    visitCount: number;
    totalSpend: number;
    loyaltyPoints: number;
    tier: string;
    recommendedDiscount: number;
  } | null>(null);

  useEffect(() => {
    if (!customer.phone) return;
    const loadLoyaltyInfo = async () => {
      try {
        const allBills = await getBills();
        const cleanTarget = customer.phone.replace(/\D/g, '');
        const customerBills = allBills.filter(b => b.customerPhone.replace(/\D/g, '') === cleanTarget);
        
        if (customerBills.length > 0) {
          const totalSpend = customerBills.reduce((acc, curr) => acc + curr.grandTotal, 0);
          const loyaltyPoints = Math.floor(totalSpend / 100);
          
          let tier = 'Bronze';
          let recommendedDiscount = 0;
          if (loyaltyPoints >= 55) {
            tier = 'Platinum';
            recommendedDiscount = 15;
          } else if (loyaltyPoints >= 50) {
            tier = 'Gold';
            recommendedDiscount = 10;
          } else if (loyaltyPoints >= 20) {
            tier = 'Silver';
            recommendedDiscount = 5;
          }

          setLoyaltyProfile({
            visitCount: customerBills.length,
            totalSpend,
            loyaltyPoints,
            tier,
            recommendedDiscount
          });
        }
      } catch (err) {
        console.warn('Failed to load loyalty info for checkout:', err);
      }
    };
    loadLoyaltyInfo();
  }, [customer.phone]);

  // Time & Seating Calculations
  const elapsedMs = new Date(exitTime).getTime() - new Date(customer.entryTime).getTime();
  const timeSpentMins = Math.ceil(elapsedMs / (1000 * 60));
  
  // Manual billable minutes override for basement (defaults to actual time)
  const [billableMinutes, setBillableMinutes] = useState<number>(timeSpentMins);
  
  // Keep billableMinutes in sync with live timer (only if user hasn't manually reduced it)
  useEffect(() => {
    if (billableMinutes >= timeSpentMins - 1) {
      setBillableMinutes(timeSpentMins);
    }
  }, [timeSpentMins]);

  // Format minutes into human-readable hours + minutes
  const formatDuration = (mins: number): string => {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) return `${h} hr`;
    return `${h} hr ${m} min`;
  };
  
  const getSeatingCost = () => {
    if (customer.location !== 'Basement') return 0;
    // Use billableMinutes to calculate charge instead of actual elapsed time
    const billableMs = billableMinutes * 60 * 1000;
    const fakeExitTime = new Date(customer.entryTime).getTime() + billableMs;
    return calculateBasementCharge(customer.entryTime, fakeExitTime, settings.basementHourlyRate);
  };

  const seatingCost = getSeatingCost();
  const foodSubtotal = customer.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const rawSubtotal = foodSubtotal + seatingCost;

  // Recalculations
  const discountAmount = rawSubtotal * (discountPercent / 100);
  const subtotalAfterDiscount = rawSubtotal - discountAmount + extraCharges;
  const gstAmount = subtotalAfterDiscount * (settings.gstPercentage / 100);
  const grandTotal = subtotalAfterDiscount + gstAmount;

  const finalGrandTotal = useCustomGrandTotal ? customGrandTotal : grandTotal;
  const changeToReturn = cashReceived !== '' ? cashReceived - finalGrandTotal : 0;

  // Live timer update for exitTime until checked out successfully
  useEffect(() => {
    if (isSuccess) return;
    const interval = setInterval(() => {
      setExitTime(new Date().toISOString());
    }, 1000);
    return () => clearInterval(interval);
  }, [isSuccess]);

  useEffect(() => {
    const fetchBillNum = async () => {
      const num = await getNextBillNumber();
      setBillNumber(num);
    };
    fetchBillNum();
  }, []);

  // Update Split fields if total changes
  useEffect(() => {
    if (paymentMethod === 'Split') {
      const equalShare = parseFloat((finalGrandTotal / 3).toFixed(2));
      setPaymentDetails({
        cashAmount: equalShare,
        upiAmount: equalShare,
        cardAmount: parseFloat((finalGrandTotal - equalShare * 2).toFixed(2))
      });
    }
  }, [paymentMethod, finalGrandTotal]);

  const handleCheckoutSubmit = async () => {
    // Validate split payments
    if (paymentMethod === 'Split') {
      const sum = (paymentDetails.cashAmount || 0) + (paymentDetails.upiAmount || 0) + (paymentDetails.cardAmount || 0);
      if (Math.abs(sum - finalGrandTotal) > 0.05) {
        alert(`Split total (${settings.currency}${sum.toFixed(2)}) must equal Grand Total (${settings.currency}${finalGrandTotal.toFixed(2)}). Current Difference: ${settings.currency}${Math.abs(sum - finalGrandTotal).toFixed(2)}`);
        return;
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const finalExitTime = new Date().toISOString();
    const finalElapsedMs = new Date(finalExitTime).getTime() - new Date(customer.entryTime).getTime();
    const finalTimeSpentMins = Math.ceil(finalElapsedMs / (1000 * 60));
    
    // Recalculate seating cost using billable minutes
    const finalBillableMs = billableMinutes * 60 * 1000;
    const finalFakeExitTime = new Date(customer.entryTime).getTime() + finalBillableMs;
    const finalSeatingCost = customer.location === 'Basement'
      ? calculateBasementCharge(customer.entryTime, finalFakeExitTime, settings.basementHourlyRate)
      : 0;

    const finalRawSubtotal = foodSubtotal + finalSeatingCost;
    const finalDiscountAmount = finalRawSubtotal * (discountPercent / 100);
    const finalSubtotalAfterDiscount = finalRawSubtotal - finalDiscountAmount + extraCharges;
    const finalGstAmount = finalSubtotalAfterDiscount * (settings.gstPercentage / 100);
    
    const calculatedGrandTotal = finalSubtotalAfterDiscount + finalGstAmount;
    const resolvedGrandTotal = useCustomGrandTotal ? customGrandTotal : calculatedGrandTotal;

    // Split details alignment with final recalculation
    let finalPaymentDetails = paymentMethod === 'Split' ? { ...paymentDetails } : undefined;
    if (finalPaymentDetails) {
      // Small adjustment for Card share to match final recalculated total exactly
      const cashVal = finalPaymentDetails.cashAmount || 0;
      const upiVal = finalPaymentDetails.upiAmount || 0;
      finalPaymentDetails.cardAmount = parseFloat((resolvedGrandTotal - cashVal - upiVal).toFixed(2));
    }

    const finalizedBill: Bill = {
      id: `bill_${Date.now()}`,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      location: customer.location,
      billNumber: '', // Will be set atomically by saveBill inside transaction
      date: todayStr,
      entryTime: customer.entryTime,
      exitTime: finalExitTime,
      timeSpentMinutes: finalTimeSpentMins,
      orderedItems: customer.orderedItems,
      foodTotal: foodSubtotal,
      basementCharges: finalSeatingCost,
      subtotal: finalRawSubtotal,
      discount: useCustomGrandTotal ? Math.max(0, calculatedGrandTotal - customGrandTotal) : finalDiscountAmount,
      extraCharges,
      tax: finalGstAmount,
      grandTotal: resolvedGrandTotal,
      paymentMethod,
      paymentDetails: finalPaymentDetails,
      status: paymentStatus,
      cashierName: customer.cashierName || currentUser.username,
      cashierId: customer.cashierId || currentUser.id
    };

    try {
      // 1. Save Bill record in history (generates and returns atomic billNumber inside write transaction)
      const assignedBillNumber = await saveBill(finalizedBill);
      finalizedBill.billNumber = assignedBillNumber;
      
      // Synchronize in background to Google Sheets
      syncToGoogleSheets('CHECKOUT', finalizedBill);
      
      // 2. Delete Customer from Active roster
      await deleteCustomer(customer.id);
      
      // 3. Write Audit Log
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'CHECKOUT_CUSTOMER',
        `Settled bill ${assignedBillNumber} for ${customer.name}. Grand Total: ${settings.currency}${finalGrandTotal.toFixed(2)} (${paymentMethod}, Status: ${paymentStatus})`
      );

      // 4. Automated Inventory Consumption
      try {
        const currentInventory = await getInventory();
        for (const item of finalizedBill.orderedItems) {
          // Rule 1: Water Bottle
          if (item.name.toLowerCase().includes('water bottle')) {
            const match = currentInventory.find(i => i.name.toLowerCase() === 'water bottle');
            if (match) {
              await adjustStock(
                match.id,
                -item.quantity,
                'consumption',
                `Automated Checkout: sold ${item.quantity} Water Bottle(s) (Bill ${assignedBillNumber})`,
                currentUser.username
              );
            }
          }
          
          // Rule 2: Burger with Extra Cheese Slice
          if (item.name.toLowerCase().includes('burger') && item.name.includes('(Extra Cheese Slice)')) {
            const match = currentInventory.find(i => i.name.toLowerCase() === 'cheese slice');
            if (match) {
              await adjustStock(
                match.id,
                -item.quantity,
                'consumption',
                `Automated Checkout: added ${item.quantity} Cheese Slice(s) (Bill ${assignedBillNumber})`,
                currentUser.username
              );
            }
          }

          // Rule 3: Pizza with Extra Cheese
          if (item.name.toLowerCase().includes('pizza') && item.name.includes('(Extra Cheese)')) {
            const match = currentInventory.find(i => i.name.toLowerCase() === 'pizza cheese pack');
            if (match) {
              await adjustStock(
                match.id,
                -item.quantity,
                'consumption',
                `Automated Checkout: added ${item.quantity} Pizza Cheese Pack(s) (Bill ${assignedBillNumber})`,
                currentUser.username
              );
            }
          }
        }
      } catch (invErr) {
        console.warn('Failed to perform automated inventory consumption:', invErr);
      }

      setGeneratedBill(finalizedBill);
      setIsSuccess(true);
      
      // Dispatch background WhatsApp Cloud template delivery and CRM profile sync
      try {
        sendCheckoutInvoice(finalizedBill, settings);
      } catch (waErr) {
        console.warn('Failed to start background WhatsApp invoice task:', waErr);
      }
    } catch (err) {
      alert('Failed to settle customer billing record.');
    }
  };

  const handleDone = () => {
    onCheckoutComplete();
  };

  // Professional jsPDF generator
  const downloadPDFBill = (billObj: Bill) => {
    downloadReceiptPDF(billObj, settings, false);
  };

  // WhatsApp background billing delivery
  const shareWhatsAppBill = async (billObj: Bill) => {
    setIsAiLoading(true);
    toast.info('Sending Invoice', 'Uploading and generating receipt template...');
    try {
      sendCheckoutInvoice(billObj, settings);
      toast.success('Dispatched', `Invoice sent to customer ${billObj.customerName} in the background.`);
    } catch (err: any) {
      toast.error('Send Failed', err.message);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-apple-gray-100 shadow-apple-medium w-full max-w-4xl overflow-hidden animate-fade-in mx-4">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-apple-gray-50 border-b border-apple-gray-100 flex justify-between items-center">
          <div>
            <h3 className="text-base font-bold text-apple-gray-800">Checkout Terminal</h3>
            <span className="text-[10px] text-apple-gray-300 font-semibold uppercase tracking-wider">
              Invoice #{billNumber}
            </span>
          </div>
          {!isSuccess && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-apple-gray-100/70 text-[#86868b] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[85vh] no-scrollbar">
          {!isSuccess ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Customer & Ordered Items (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                
                {/* Seating Area & Customer Banner */}
                <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-2">
                  <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Customer Seating details</span>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#86868b]">Name:</span>
                    <span className="font-bold text-apple-gray-850">{customer.name}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#86868b]">Location:</span>
                    <span className="font-bold text-apple-gray-850">{customer.location}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#86868b]">Phone:</span>
                      <span className="font-mono font-bold text-apple-gray-850">{customer.phone}</span>
                    </div>
                  )}
                </div>

                {/* Seating timer recap banner */}
                {customer.location === 'Basement' && (
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[8px] text-indigo-400 uppercase tracking-wider block font-bold">Actual Duration</span>
                        <span className="font-bold text-sm block text-indigo-900">{formatDuration(timeSpentMins)}</span>
                        <span className="text-[10px] text-indigo-300 font-light mt-0.5">
                          ({new Date(customer.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → Now)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] text-indigo-400 uppercase tracking-wider block font-bold">Seating Charge</span>
                        <span className="font-bold text-sm block text-indigo-900">{settings.currency}{seatingCost.toFixed(2)}</span>
                      </div>
                    </div>
                    {/* Manual billable minutes adjustment */}
                    <div className="flex items-center gap-3 pt-2 border-t border-indigo-100">
                      <div className="flex-1">
                        <label className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">Billable Minutes</label>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBillableMinutes(prev => Math.max(0, prev - 5))}
                            className="w-8 h-8 rounded-lg bg-white border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-colors cursor-pointer flex items-center justify-center"
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            max={timeSpentMins}
                            value={billableMinutes}
                            onChange={(e) => setBillableMinutes(Math.max(0, Math.min(timeSpentMins, parseInt(e.target.value, 10) || 0)))}
                            className="apple-input w-20 font-mono text-center text-sm"
                          />
                          <button
                            onClick={() => setBillableMinutes(prev => Math.min(timeSpentMins, prev + 5))}
                            className="w-8 h-8 rounded-lg bg-white border border-indigo-200 text-indigo-600 font-bold text-sm hover:bg-indigo-50 transition-colors cursor-pointer flex items-center justify-center"
                          >+</button>
                        </div>
                      </div>
                      {billableMinutes < timeSpentMins && (
                        <div className="text-right">
                          <span className="text-[9px] text-green-500 font-semibold block">Reduced by</span>
                          <span className="text-xs font-bold text-green-600">{formatDuration(timeSpentMins - billableMinutes)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                 {/* Loyalty Status Recap Banner */}
                {loyaltyProfile && (
                  <div className="p-4 bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl space-y-2 text-apple-gray-800 animate-fade-in">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-[8px] text-amber-600 uppercase tracking-wider block font-bold">Loyalty Profile</span>
                        <span className="font-bold text-sm block text-amber-900">{loyaltyProfile.tier} Member</span>
                        <span className="text-[9px] text-amber-500 font-light block">
                          ({loyaltyProfile.visitCount} visits, ₹{loyaltyProfile.totalSpend.toFixed(2)} lifetime spend)
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] text-amber-600 uppercase tracking-wider block font-bold">Loyalty Points</span>
                        <span className="font-mono font-bold text-sm block text-amber-900">{loyaltyProfile.loyaltyPoints} pts</span>
                      </div>
                    </div>

                    {/* Recommendation Row */}
                    {loyaltyProfile.recommendedDiscount > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t border-amber-500/10 gap-2">
                        <span className="text-[10px] text-amber-800">
                          Suggested Discount: <strong>{loyaltyProfile.recommendedDiscount}% OFF</strong>
                        </span>
                        <button
                          onClick={() => setDiscountPercent(loyaltyProfile.recommendedDiscount)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[9px] cursor-pointer transition-all active:scale-95 shadow-sm"
                        >
                          Apply {loyaltyProfile.recommendedDiscount}%
                        </button>
                      </div>
                    )}

                    {/* Flat redemption option (1 pt = ₹1) */}
                    {loyaltyProfile.loyaltyPoints > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t border-amber-500/10 gap-2">
                        <span className="text-[10px] text-amber-800">
                          Redeem Points (Max: ₹{loyaltyProfile.loyaltyPoints} off)
                        </span>
                        <button
                          onClick={() => {
                            const pointsDiscount = Math.min(loyaltyProfile.loyaltyPoints, rawSubtotal);
                            const newTotal = grandTotal - pointsDiscount;
                            setCustomGrandTotal(Math.max(0, newTotal));
                            setUseCustomGrandTotal(true);
                            toast.success('Redemption Applied', `Flat ₹${pointsDiscount} discount applied using loyalty points.`);
                          }}
                          className="px-2.5 py-1 bg-apple-gray-800 hover:bg-apple-gray-900 text-white font-bold rounded-lg text-[9px] cursor-pointer transition-all active:scale-95 shadow-sm"
                        >
                          Redeem Points
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Ordered Items Summary List */}
                <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl flex flex-col max-h-[200px]">
                  <h4 className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider border-b border-apple-gray-100 pb-1.5 mb-2 block">
                    Ordered Items Summary
                  </h4>
                  <div className="space-y-2 overflow-y-auto pr-1 no-scrollbar flex-1">
                    {customer.orderedItems.length === 0 ? (
                      <div className="text-center py-6 text-xs text-apple-gray-300 italic font-light">
                        No food items ordered in this session.
                      </div>
                    ) : (
                      customer.orderedItems.map((item) => (
                        <div key={item.id} className="flex justify-between items-center text-xs py-1 border-b border-apple-gray-100/30 last:border-0">
                          <div>
                            <span className="font-semibold text-apple-gray-800">{item.name}</span>
                            <span className="text-[9px] text-[#86868b] block mt-0.5">
                              {item.quantity}x {settings.currency}{item.price.toFixed(2)}
                            </span>
                          </div>
                          <span className="font-bold text-apple-gray-850 font-mono">
                            {settings.currency}{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t border-apple-gray-100 pt-2 mt-2 flex justify-between items-center text-xs">
                    <span className="font-bold text-[#86868b]">Food Subtotal:</span>
                    <span className="font-bold text-apple-gray-850 font-mono">{settings.currency}{foodSubtotal.toFixed(2)}</span>
                  </div>
                </div>

              </div>

              {/* Right Column: Settlement & Payments (7 cols) */}
              <div className="lg:col-span-7 space-y-4 border-t lg:border-t-0 lg:border-l border-apple-gray-100 pt-4 lg:pt-0 lg:pl-6">
                
                {/* Adjustments row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Discount (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercent || ''}
                      onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                      onKeyDown={preventMinus}
                      className="apple-input w-full font-mono text-center"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Extra Charges ({settings.currency})</label>
                    <input
                      type="number"
                      min="0"
                      value={extraCharges || ''}
                      onChange={(e) => setExtraCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                      onKeyDown={preventMinus}
                      className="apple-input w-full font-mono text-center"
                    />
                  </div>
                </div>

                {/* Payment Methods - LARGE BUTTONS */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Payment Method Selection</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['Cash', 'UPI', 'Card', 'Split'] as PaymentMethod[]).map((method) => {
                      const Icon = method === 'Cash' ? Coins : method === 'UPI' ? Smartphone : method === 'Card' ? CreditCard : Activity;
                      const colorClasses = method === 'Cash' 
                        ? 'border-amber-100 hover:bg-amber-50/30 text-amber-600' 
                        : method === 'UPI' 
                        ? 'border-blue-100 hover:bg-blue-50/30 text-blue-600' 
                        : method === 'Card' 
                        ? 'border-purple-100 hover:bg-purple-50/30 text-purple-600' 
                        : 'border-emerald-100 hover:bg-emerald-50/30 text-emerald-600';
                      const activeClasses = method === 'Cash' 
                        ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/10' 
                        : method === 'UPI' 
                        ? 'bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/10' 
                        : method === 'Card' 
                        ? 'bg-purple-500 border-purple-500 text-white shadow-md shadow-purple-500/10' 
                        : 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/10';
                      return (
                        <button
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          className={`py-6 rounded-2xl border flex flex-col items-center justify-center gap-2 text-sm font-bold transition-all duration-200 cursor-pointer ${
                            paymentMethod === method ? activeClasses : `bg-white ${colorClasses}`
                          }`}
                        >
                          <Icon className="w-6 h-6" />
                          <span>{method}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cash Calculator */}
                {paymentMethod === 'Cash' && (
                  <div className="p-4 bg-amber-50/40 border border-amber-100/50 rounded-2xl space-y-3 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-amber-800">
                      <Calculator className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Cash Change Calculator</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider">Total Due</label>
                        <div className="px-3 py-2 rounded-xl bg-white border border-apple-gray-100 font-mono font-bold text-sm text-apple-gray-800 text-center flex items-center justify-center h-10">
                          {settings.currency}{finalGrandTotal.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider">Cash Received</label>
                        <input
                          type="number"
                          min="0"
                          placeholder="Amount paid..."
                          value={cashReceived || ''}
                          onChange={(e) => setCashReceived(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                          className="apple-input font-mono text-center text-sm font-bold w-full h-10"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider">Change to Return</label>
                        <div className={`px-3 py-2 rounded-xl border font-mono font-bold text-sm text-center flex items-center justify-center h-10 ${
                          changeToReturn >= 0 
                            ? 'bg-green-50 border-green-150 text-green-600' 
                            : 'bg-red-50 border-red-150 text-red-650'
                        }`}>
                          {settings.currency}{Math.max(0, changeToReturn).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Split Details Input */}
                {paymentMethod === 'Split' && (
                  <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-3">
                    <span className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider block">Custom Payment Split</span>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-[#86868b] font-medium text-center">Cash</label>
                        <input
                          type="number"
                          value={paymentDetails.cashAmount || ''}
                          onChange={(e) => setPaymentDetails(p => ({ ...p, cashAmount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          className="apple-input font-mono text-center text-xs py-1.5"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-[#86868b] font-medium text-center">UPI</label>
                        <input
                          type="number"
                          value={paymentDetails.upiAmount || ''}
                          onChange={(e) => setPaymentDetails(p => ({ ...p, upiAmount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          className="apple-input font-mono text-center text-xs py-1.5"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-[#86868b] font-medium text-center">Card</label>
                        <input
                          type="number"
                          value={paymentDetails.cardAmount || ''}
                          onChange={(e) => setPaymentDetails(p => ({ ...p, cardAmount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          className="apple-input font-mono text-center text-xs py-1.5"
                        />
                      </div>
                    </div>
                    <div className="text-center text-[10px] font-bold text-[#86868b] font-mono">
                      Split Total: {settings.currency}
                      {((paymentDetails.cashAmount || 0) + (paymentDetails.upiAmount || 0) + (paymentDetails.cardAmount || 0)).toFixed(2)} / {settings.currency}{finalGrandTotal.toFixed(2)}
                    </div>
                  </div>
                )}

                {/* Grand Total Override */}
                <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Custom Bill Override</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-apple-gray-800">
                      <input
                        type="checkbox"
                        checked={useCustomGrandTotal}
                        onChange={(e) => {
                          setUseCustomGrandTotal(e.target.checked);
                          if (e.target.checked) {
                            setCustomGrandTotal(parseFloat(grandTotal.toFixed(2)));
                          }
                        }}
                        className="rounded border-apple-gray-100 text-apple-gray-800 focus:ring-apple-gray-800 w-4 h-4 cursor-pointer"
                      />
                      <span>Enable Override</span>
                    </label>
                  </div>
                  {useCustomGrandTotal && (
                    <div className="flex items-center gap-3 animate-fade-in">
                      <span className="text-xs text-[#86868b] font-medium">Override Bill Total:</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm text-[#86868b]">{settings.currency}</span>
                        <input
                          type="number"
                          min="0"
                          value={customGrandTotal || ''}
                          onChange={(e) => setCustomGrandTotal(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="apple-input w-full pl-7 font-mono font-bold text-sm text-apple-gray-850"
                          placeholder="Enter final paid amount"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Status & Totals */}
                <div className="flex items-center justify-between border-t border-apple-gray-50 pt-4">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setPaymentStatus('Paid')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 ${
                        paymentStatus === 'Paid' ? 'bg-green-500 text-white shadow-sm' : 'bg-apple-gray-50 text-[#86868b] border border-apple-gray-100 hover:bg-apple-gray-100/50'
                      }`}
                    >
                      Paid
                    </button>
                    <button
                      onClick={() => setPaymentStatus('Pending')}
                      className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all duration-200 ${
                        paymentStatus === 'Pending' ? 'bg-orange-500 text-white shadow-sm' : 'bg-apple-gray-50 text-[#86868b] border border-apple-gray-100 hover:bg-apple-gray-100/50'
                      }`}
                    >
                      Pending
                    </button>
                  </div>

                  <div className="text-right">
                    <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Total Bill Due</span>
                    <span className="text-2xl font-bold text-black font-mono">
                      {settings.currency}{finalGrandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action trigger */}
                <button
                  onClick={handleCheckoutSubmit}
                  className="w-full apple-btn-primary py-3.5 text-center flex items-center justify-center gap-2 font-bold cursor-pointer text-sm"
                >
                  <Check className="w-5 h-5" />
                  <span>Complete Checkout Settlement</span>
                </button>
              </div>
            </div>
          ) : (
            /* Success screen */
            <div className="text-center py-6 space-y-6 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-full bg-green-50 border border-green-100 text-green-500 flex items-center justify-center mx-auto shadow-sm">
                <Check className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-lg font-bold text-apple-gray-800">Checkout Complete!</h4>
                <p className="text-xs text-[#86868b] font-light mt-1">
                  Bill {generatedBill?.billNumber} has been finalized and archived successfully.
                </p>
              </div>

              {/* Export Panel */}
              <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl space-y-4 max-w-sm mx-auto">
                <span className="text-[9px] font-bold text-[#86868b] uppercase tracking-wider block">Share or Print Invoice</span>
                
                <div className="flex gap-3 justify-center">
                  {/* Download PDF button */}
                  <button
                    onClick={() => generatedBill && downloadPDFBill(generatedBill)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-apple-gray-100 shadow-sm rounded-xl text-xs font-semibold text-apple-gray-800 hover:bg-apple-gray-100/50 cursor-pointer animate-fade-in"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Save PDF</span>
                  </button>

                  {/* Share on WhatsApp */}
                  <button
                    onClick={() => generatedBill && shareWhatsAppBill(generatedBill)}
                    disabled={isAiLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-500 disabled:bg-green-400 text-white shadow-sm rounded-xl text-xs font-semibold hover:bg-green-600 cursor-pointer disabled:cursor-not-allowed transition-all animate-fade-in"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{isAiLoading ? "Sending..." : "Share Bill"}</span>
                  </button>
                </div>
                
                <p className="text-[9px] text-[#86868b] font-light leading-relaxed">
                  Clicking *Share Bill* sends the invoice receipt and PDF to the customer's WhatsApp automatically in the background.
                </p>
              </div>

              <button
                onClick={handleDone}
                className="apple-btn-secondary w-full py-2.5 max-w-sm mx-auto"
              >
                Close and Exit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
