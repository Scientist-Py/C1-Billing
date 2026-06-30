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

const getDetailedItemsList = (items: Bill['orderedItems']): string => {
  return items.map(item => {
    const total = item.price * item.quantity;
    if (item.quantity > 1) {
      return `  🔸 *${item.name}* × ${item.quantity} — ₹${total.toFixed(2)}`;
    }
    return `  🔸 *${item.name}* — ₹${total.toFixed(2)}`;
  }).join('\n');
};

const getLoyaltyLine = (visitCount: number, name: string): string => {
  if (visitCount === 1) {
    return `🎉 This was your *1st visit* with us! We're truly honoured to have served you for the very first time, *${name}*. We hope this is the beginning of many wonderful chapters together.`;
  }
  if (visitCount <= 3) {
    return `🎉 This was your *${visitCount}${getOrdinalSuffix(visitCount)} visit* with us! It's wonderful to see you again, *${name}*. Thank you for choosing Chapter One — your continued trust means everything to us.`;
  }
  if (visitCount <= 10) {
    return `🎉 This was your *${visitCount}${getOrdinalSuffix(visitCount)} visit* with us! *${name}*, you've become a truly valued part of our Chapter One family. We're grateful for your loyalty and look forward to serving you many more times.`;
  }
  return `🎉 This was your *${visitCount}${getOrdinalSuffix(visitCount)} visit* with us! *${name}*, what can we say — you're one of our most cherished patrons. Your unwavering loyalty inspires us to keep raising the bar every single day. Thank you from the bottom of our hearts. 💛`;
};

export const formatWhatsAppMessage = (bill: Bill, visitCount: number): string => {
  const exitDate = new Date(bill.exitTime);
  const timeStr = exitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  // Format date as DD/MM/YYYY
  const day = String(exitDate.getDate()).padStart(2, '0');
  const month = String(exitDate.getMonth() + 1).padStart(2, '0');
  const year = exitDate.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  // Detailed items with bold names
  const detailedItems = getDetailedItemsList(bill.orderedItems);

  // Short comma-separated highlights for the greeting
  const topItemNames = bill.orderedItems.map(i => `*${i.name}*`).join(', ');

  // Loyalty message based on visit count
  const loyaltyLine = getLoyaltyLine(visitCount, bill.customerName);

  // Basement seating line
  let basementLine = '';
  if (bill.basementCharges > 0) {
    basementLine = `\n  🔸 Basement Seating Fee (${bill.timeSpentMinutes} min) — ₹${bill.basementCharges.toFixed(2)}`;
  }

  const message =
    `🌿 Hello *${bill.customerName}*!\n\n` +
    `Thank you so much for gracing us with your presence at *Chapter One Cafe* today. It was an absolute pleasure having you with us, and we sincerely hope you had a delightful experience. ❤️\n\n` +
    `${loyaltyLine}\n\n` +
    `🍽️ Today you savoured:\n${topItemNames}\n\n` +
    `We truly hope every bite was as special as your visit. Your satisfaction means the world to us, and our team always strives to make each moment at Chapter One memorable. 🌟\n\n` +
    `💚 We've shared your bill digitally to help reduce paper waste. Small choices like this help save trees and make our cafe a little greener. Together, we're making a difference — one cup at a time. 🌍\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *CHAPTER ONE CAFE — DIGITAL INVOICE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🧾 Bill No: *${bill.billNumber}*\n\n` +
    `📅 Date: *${dateStr}*\n\n` +
    `🕒 Time: *${timeStr}*\n\n` +
    `👤 Customer: *${bill.customerName}*\n\n` +
    `📞 Phone: *${bill.customerPhone}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍽 *YOUR ORDER DETAILS*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${detailedItems}${basementLine}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Subtotal: ₹${bill.subtotal.toFixed(2)}\n\n` +
    (bill.discount > 0 ? `🏷️ Discount: -₹${bill.discount.toFixed(2)}\n\n` : '') +
    (bill.extraCharges > 0 ? `⚡ Extra Charges: +₹${bill.extraCharges.toFixed(2)}\n\n` : '') +
    `🧾 GST: ₹${bill.tax.toFixed(2)}\n\n` +
    `💳 Total Paid: *₹${bill.grandTotal.toFixed(2)}*\n\n` +
    `💵 Payment: ${bill.paymentMethod} (${bill.status})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⭐ *We'd truly appreciate your feedback!*\n` +
    `Your words help us grow and serve you better.\n` +
    `Leave us a Google Review:\n` +
    `https://tinyurl.com/Chapter-One-Review\n\n` +
    `📸 Follow us on Instagram for updates, offers & behind-the-scenes moments:\n` +
    `https://instagram.com/chapteronecafe_\n\n` +
    `📍 *Chapter One Cafe*\n\n` +
    `✨ _Every visit writes a new chapter in our story. We can't wait to welcome you back and create more beautiful memories together._\n\n` +
    `With warm regards,\n` +
    `*Team Chapter One* ☕🤎`;

  return message;
};
