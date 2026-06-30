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

/**
 * Generate the structured invoice section (always the same format).
 */
export const formatInvoiceSection = (bill: Bill): string => {
  const exitDate = new Date(bill.exitTime);
  const timeStr = exitDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  const day = String(exitDate.getDate()).padStart(2, '0');
  const month = String(exitDate.getMonth() + 1).padStart(2, '0');
  const year = exitDate.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  const itemsList = bill.orderedItems.map(item => {
    const total = item.price * item.quantity;
    return item.quantity > 1
      ? `  🔸 *${item.name}* × ${item.quantity} — ₹${total.toFixed(2)}`
      : `  🔸 *${item.name}* — ₹${total.toFixed(2)}`;
  }).join('\n');

  let basementLine = '';
  if (bill.basementCharges > 0) {
    basementLine = `\n  🔸 Basement Seating (${bill.timeSpentMinutes} min) — ₹${bill.basementCharges.toFixed(2)}`;
  }

  return (
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *CHAPTER ONE CAFE — DIGITAL INVOICE*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🧾 Bill No: *${bill.billNumber}*\n\n` +
    `📅 Date: *${dateStr}*\n\n` +
    `🕒 Time: *${timeStr}*\n\n` +
    `👤 Customer: *${bill.customerName}*\n\n` +
    `📞 Phone: *${bill.customerPhone}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🍽 *YOUR ORDER*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `${itemsList}${basementLine}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Subtotal: ₹${bill.subtotal.toFixed(2)}\n\n` +
    (bill.discount > 0 ? `🏷️ Discount: -₹${bill.discount.toFixed(2)}\n\n` : '') +
    (bill.extraCharges > 0 ? `⚡ Extra Charges: +₹${bill.extraCharges.toFixed(2)}\n\n` : '') +
    `🧾 GST: ₹${bill.tax.toFixed(2)}\n\n` +
    `💳 Total Paid: *₹${bill.grandTotal.toFixed(2)}*\n\n` +
    `💵 Payment: ${bill.paymentMethod} (${bill.status})\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `⭐ We'd love your feedback!\n` +
    `https://tinyurl.com/Chapter-One-Review\n\n` +
    `📸 Follow us: https://instagram.com/chapteronecafe_\n\n` +
    `✨ _Every visit writes a new chapter. See you soon!_\n\n` +
    `With warm regards,\n` +
    `*Team Chapter One* ☕`
  );
};

/**
 * Generate a static fallback greeting (used when Groq API is unavailable).
 */
export const getStaticGreeting = (bill: Bill, visitCount: number): string => {
  const ordinal = getOrdinalSuffix(visitCount);
  const topItemNames = bill.orderedItems.map(i => `*${i.name}*`).join(', ');

  return (
    `🌿 Hello *${bill.customerName}*! Thank you for visiting *Chapter One Cafe* ❤️\n\n` +
    `🎉 This was your *${visitCount}${ordinal}* visit with us!\n\n` +
    `🍽️ You enjoyed: ${topItemNames}\n\n` +
    `💚 Your bill is shared digitally — saving paper, saving trees 🌍`
  );
};

/**
 * Build the full WhatsApp message by combining AI intro + invoice.
 * If aiIntro is empty, uses the static fallback greeting.
 */
export const buildWhatsAppMessage = (bill: Bill, visitCount: number, aiIntro: string): string => {
  const greeting = aiIntro.trim() || getStaticGreeting(bill, visitCount);
  const invoice = formatInvoiceSection(bill);
  return `${greeting}\n\n${invoice}`;
};
