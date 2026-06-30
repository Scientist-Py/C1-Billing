import type { Bill } from '../types';

const getOrdinalSuffix = (num: number): string => {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) {
    return 'st';
  }
  if (j === 2 && k !== 12) {
    return 'nd';
  }
  if (j === 3 && k !== 13) {
    return 'rd';
  }
  return 'th';
};

export const formatWhatsAppMessage = (bill: Bill, visitCount: number): string => {
  const ordinal = getOrdinalSuffix(visitCount);
  const topItems = bill.orderedItems.map(i => i.name).join(', ');
  
  const exitDate = new Date(bill.exitTime);
  const timeStr = exitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  
  // Format date as DD/MM/YYYY
  const day = String(exitDate.getDate()).padStart(2, '0');
  const month = String(exitDate.getMonth() + 1).padStart(2, '0');
  const year = exitDate.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  let itemsListStr = bill.orderedItems.map(item => {
    return `• ${item.name} x${item.quantity} = ₹${(item.price * item.quantity).toFixed(2)}`;
  }).join('\n');
  
  if (bill.basementCharges > 0) {
    itemsListStr += `\n• Basement Seating Fee (${bill.timeSpentMinutes} min) = ₹${bill.basementCharges.toFixed(2)}`;
  }

  const message = 
    `🌿 Hello *${bill.customerName}*! Thank you for visiting *Chapter One Cafe* ❤️\n\n` +
    `🎉 This was your *${visitCount}${ordinal}* visit with us!\n\n` +
    `🍕 Today you enjoyed: *${topItems || 'Delicious Food'}*\n\n` +
    `💚 We've shared your bill digitally to help reduce paper waste. Small choices like this help save trees and make our cafe a little greener. 🌍\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *CHAPTER ONE CAFE - DIGITAL INVOICE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🧾 Bill No: *${bill.billNumber}*\n\n` +
    `📅 Date: *${dateStr}*\n\n` +
    `🕒 Time: *${timeStr}*\n\n` +
    `👤 Customer: *${bill.customerName}*\n\n` +
    `📞 Phone: *${bill.customerPhone}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍽 *YOUR ORDER*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${itemsListStr}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Subtotal: ₹${bill.subtotal.toFixed(2)}\n\n` +
    (bill.discount > 0 ? `🏷️ Discount: -₹${bill.discount.toFixed(2)}\n\n` : '') +
    (bill.extraCharges > 0 ? `⚡ Extra Charges: +₹${bill.extraCharges.toFixed(2)}\n\n` : '') +
    `🧾 GST: ₹${bill.tax.toFixed(2)}\n\n` +
    `💳 Total Paid: *₹${bill.grandTotal.toFixed(2)}*\n\n` +
    `💵 Payment: ${bill.paymentMethod} (${bill.status})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⭐ We'd love your feedback!\n` +
    `Leave us a Google Review:\n` +
    `https://tinyurl.com/Chapter-One-Review\n\n` +
    `📸 Follow us on Instagram:\n` +
    `https://instagram.com/chapteronecafe_\n\n` +
    `📍 Chapter One Cafe\n\n` +
    `✨ Every visit writes a new chapter. We can't wait to welcome you back!`;

  return message;
};
