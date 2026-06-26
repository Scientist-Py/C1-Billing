import React, { useState, useEffect } from 'react';
import { 
  X, 
  CreditCard, 
  Coins, 
  Smartphone, 
  Activity, 
  Check, 
  FileDown, 
  Share2
} from 'lucide-react';
import type { Customer, Bill, CafeSettings, PaymentMethod, PaymentDetails } from '../types';
import { getNextBillNumber, saveBill, deleteCustomer, saveAuditLog, syncToGoogleSheets, getBills, calculateBasementCharge } from '../utils/db';
import { downloadReceiptPDF } from '../utils/pdfGenerator';
import { generateAIWhatsAppMessage } from '../utils/ai';

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
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [extraCharges, setExtraCharges] = useState<number>(0);
  
  // Success state after final checkout
  const [isSuccess, setIsSuccess] = useState(false);
  const [generatedBill, setGeneratedBill] = useState<Bill | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Time & Seating Calculations
  const elapsedMs = new Date(exitTime).getTime() - new Date(customer.entryTime).getTime();
  const timeSpentMins = Math.ceil(elapsedMs / (1000 * 60));
  
  const getSeatingCost = () => {
    if (customer.location !== 'Basement') return 0;
    return calculateBasementCharge(customer.entryTime, exitTime, settings.basementHourlyRate);
  };

  const seatingCost = getSeatingCost();
  const foodSubtotal = customer.orderedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const rawSubtotal = foodSubtotal + seatingCost;

  // Recalculations
  const discountAmount = rawSubtotal * (discountPercent / 100);
  const subtotalAfterDiscount = rawSubtotal - discountAmount + extraCharges;
  const gstAmount = subtotalAfterDiscount * (settings.gstPercentage / 100);
  const grandTotal = subtotalAfterDiscount + gstAmount;

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
      const equalShare = parseFloat((grandTotal / 3).toFixed(2));
      setPaymentDetails({
        cashAmount: equalShare,
        upiAmount: equalShare,
        cardAmount: parseFloat((grandTotal - equalShare * 2).toFixed(2))
      });
    }
  }, [paymentMethod, grandTotal]);

  const handleCheckoutSubmit = async () => {
    // Validate split payments
    if (paymentMethod === 'Split') {
      const sum = (paymentDetails.cashAmount || 0) + (paymentDetails.upiAmount || 0) + (paymentDetails.cardAmount || 0);
      if (Math.abs(sum - grandTotal) > 0.05) {
        alert(`Split total (${settings.currency}${sum.toFixed(2)}) must equal Grand Total (${settings.currency}${grandTotal.toFixed(2)}). Current Difference: ${settings.currency}${Math.abs(sum - grandTotal).toFixed(2)}`);
        return;
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const finalExitTime = new Date().toISOString();
    const finalElapsedMs = new Date(finalExitTime).getTime() - new Date(customer.entryTime).getTime();
    const finalTimeSpentMins = Math.ceil(finalElapsedMs / (1000 * 60));
    
    // Recalculate seating cost
    const finalSeatingCost = customer.location === 'Basement'
      ? calculateBasementCharge(customer.entryTime, finalExitTime, settings.basementHourlyRate)
      : 0;

    const finalRawSubtotal = foodSubtotal + finalSeatingCost;
    const finalDiscountAmount = finalRawSubtotal * (discountPercent / 100);
    const finalSubtotalAfterDiscount = finalRawSubtotal - finalDiscountAmount + extraCharges;
    const finalGstAmount = finalSubtotalAfterDiscount * (settings.gstPercentage / 100);
    const finalGrandTotal = finalSubtotalAfterDiscount + finalGstAmount;

    // Split details alignment with final recalculation
    let finalPaymentDetails = paymentMethod === 'Split' ? { ...paymentDetails } : undefined;
    if (finalPaymentDetails) {
      // Small adjustment for Card share to match final recalculated total exactly
      const cashVal = finalPaymentDetails.cashAmount || 0;
      const upiVal = finalPaymentDetails.upiAmount || 0;
      finalPaymentDetails.cardAmount = parseFloat((finalGrandTotal - cashVal - upiVal).toFixed(2));
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
      discount: finalDiscountAmount,
      extraCharges,
      tax: finalGstAmount,
      grandTotal: finalGrandTotal,
      paymentMethod,
      paymentDetails: finalPaymentDetails,
      status: paymentStatus,
      cashierName: currentUser.username
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

      setGeneratedBill(finalizedBill);
      setIsSuccess(true);
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

  // WhatsApp formatted billing text share
  const shareWhatsAppBill = async (billObj: Bill) => {
    setIsAiLoading(true);
    let introText = '';
    
    if (settings.groqApiKey && settings.groqApiKey.trim().length > 0) {
      try {
        const allBills = await getBills();
        const customerPhoneClean = billObj.customerPhone.trim();
        // Count previous visits (history bills + current 1)
        const visitCount = allBills.filter(b => b.customerPhone.trim() === customerPhoneClean).length;
        
        introText = await generateAIWhatsAppMessage(billObj, settings.groqApiKey, visitCount);
      } catch (err) {
        console.warn("Failed to generate AI message", err);
      }
    }

    setIsAiLoading(false);

    // Fallback template if Groq is empty/fails
    if (!introText) {
      introText = `Hello ${billObj.customerName}, thank you for dining with us! Hope you enjoyed your visit.`;
    }

    let itemsText = '';
    billObj.orderedItems.forEach(item => {
      itemsText += `• ${item.name} x ${item.quantity} = ₹${(item.price * item.quantity).toFixed(2)}\n`;
    });

    if (billObj.basementCharges > 0) {
      itemsText += `• Basement Seating Fee (${billObj.timeSpentMinutes} min) = ${settings.currency}${billObj.basementCharges.toFixed(2)}\n`;
    }

    const receiptMessage = `${introText}\n\n` +
      `*CHAPTER ONE CAFE INVOICE*\n` +
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

    // Copy to clipboard
    navigator.clipboard.writeText(receiptMessage).then(() => {
      // Build API link
      const phoneClean = billObj.customerPhone.replace(/[^0-9]/g, '');
      const encodedMsg = encodeURIComponent(receiptMessage);
      window.open(`https://api.whatsapp.com/send?phone=${phoneClean}&text=${encodedMsg}`, '_blank');
    }).catch(() => {
      alert('Could not copy billing receipt details to clipboard automatically.');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm select-none">
      <div className="bg-white rounded-3xl border border-apple-gray-100 shadow-apple-medium w-full max-w-lg overflow-hidden animate-fade-in">
        
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
        <div className="p-6 overflow-y-auto max-h-[480px] no-scrollbar">
          {!isSuccess ? (
            <div className="space-y-6">
              {/* Seating recap banner */}
              {customer.location === 'Basement' && (
                <div className="p-4 bg-apple-gray-50 border border-apple-gray-100 rounded-2xl flex justify-between items-center text-xs text-apple-gray-800">
                  <div>
                    <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Duration Seated</span>
                    <span className="font-bold text-sm block">{timeSpentMins} Minutes</span>
                    <span className="text-[10px] text-apple-gray-300 font-light mt-0.5">
                      ({new Date(customer.entryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - Now)
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Seating Fees ({customer.location})</span>
                    <span className="font-bold text-sm block">{settings.currency}{seatingCost.toFixed(2)}</span>
                  </div>
                </div>
              )}

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

              {/* Payment Methods */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider block">Payment Method Selection</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Cash', 'UPI', 'Card', 'Split'] as PaymentMethod[]).map((method) => {
                    const Icon = method === 'Cash' ? Coins : method === 'UPI' ? Smartphone : method === 'Card' ? CreditCard : Activity;
                    return (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`py-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition-apple cursor-pointer ${
                          paymentMethod === method
                            ? 'bg-apple-gray-800 border-apple-gray-800 text-white shadow-sm'
                            : 'bg-white border-apple-gray-100 text-apple-gray-800 hover:bg-apple-gray-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{method}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

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
                  <div className="text-center text-[10px] font-semibold text-apple-gray-300">
                    Split Total: {settings.currency}
                    {((paymentDetails.cashAmount || 0) + (paymentDetails.upiAmount || 0) + (paymentDetails.cardAmount || 0)).toFixed(2)} / {settings.currency}{grandTotal.toFixed(2)}
                  </div>
                </div>
              )}

              {/* Status & Totals */}
              <div className="flex items-center justify-between border-t border-apple-gray-50 pt-4">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPaymentStatus('Paid')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      paymentStatus === 'Paid' ? 'bg-green-500 text-white shadow-sm' : 'bg-apple-gray-50 text-[#86868b]'
                    }`}
                  >
                    Paid
                  </button>
                  <button
                    onClick={() => setPaymentStatus('Pending')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                      paymentStatus === 'Pending' ? 'bg-orange-500 text-white shadow-sm' : 'bg-apple-gray-50 text-[#86868b]'
                    }`}
                  >
                    Pending
                  </button>
                </div>

                <div className="text-right">
                  <span className="text-[8px] text-[#86868b] uppercase tracking-wider block font-bold">Total Bill Due</span>
                  <span className="text-xl font-bold text-black">{settings.currency}{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Action trigger */}
              <button
                onClick={handleCheckoutSubmit}
                className="w-full apple-btn-primary py-3 text-center flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Complete Checkout Settlement</span>
              </button>
            </div>
          ) : (
            /* Success screen */
            <div className="text-center py-6 space-y-6">
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
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-apple-gray-100 shadow-sm rounded-xl text-xs font-semibold text-apple-gray-800 hover:bg-apple-gray-100/50 cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Save PDF</span>
                  </button>

                  {/* Share on WhatsApp */}
                  <button
                    onClick={() => generatedBill && shareWhatsAppBill(generatedBill)}
                    disabled={isAiLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-500 disabled:bg-green-400 text-white shadow-sm rounded-xl text-xs font-semibold hover:bg-green-600 cursor-pointer disabled:cursor-not-allowed transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{isAiLoading ? "Writing AI copy..." : "WhatsApp"}</span>
                  </button>
                </div>
                
                <p className="text-[9px] text-[#86868b] font-light leading-relaxed">
                  Clicking *WhatsApp* copies the text receipt format and redirects to WhatsApp Web. Attach the PDF manually.
                </p>
              </div>

              <button
                onClick={handleDone}
                className="apple-btn-secondary w-full py-2.5 max-w-sm"
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
