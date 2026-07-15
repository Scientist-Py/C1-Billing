import type { Bill, InventoryItem, InventoryLog, CRMProfile, MenuItem } from '../types';

const getApiUrl = (): string => {
  if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.hostname === '')) {
    return 'https://api.groq.com/openai/v1/chat/completions';
  }
  return '/api-groq/openai/v1/chat/completions';
};

const callGroq = async (prompt: string, apiKey: string): Promise<string> => {
  if (!apiKey || apiKey.trim().length === 0) {
    return 'Please configure your Groq API Key in Settings to generate AI insights.';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6-second timeout

  try {
    const response = await fetch(getApiUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'You are an expert hospitality business analyst for Chapter One Cafe.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Groq status ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('Groq call failed:', err);
    return 'Failed to generate AI report due to API timeout or error.';
  }
};

/**
 * Generate weekly operational and financial overview.
 */
export const generateWeeklySummary = async (
  bills: Bill[],
  apiKey: string
): Promise<string> => {
  const totalSales = bills.reduce((acc, b) => acc + b.grandTotal, 0);
  const totalCovers = bills.length;
  const basementSales = bills.reduce((acc, b) => acc + b.basementCharges, 0);

  const prompt = `Perform a weekly business performance review based on these stats:
- Total Sales: ₹${totalSales.toFixed(2)}
- Total Bills Issued: ${totalCovers}
- Total Basement Hourly Lounge Fees Collected: ₹${basementSales.toFixed(2)}
Please provide a brief, professional, and motivational summary of this week's progress, highlighting average transaction size and recommendations to increase revenue. Keep it under 150 words.`;

  return callGroq(prompt, apiKey);
};

/**
 * Generate stock analysis and warnings based on stock thresholds.
 */
export const generateInventoryInsights = async (
  items: InventoryItem[],
  logs: InventoryLog[],
  apiKey: string
): Promise<string> => {
  const lowStockItems = items.filter((i) => i.quantity <= i.minStock).map((i) => `${i.name} (Stock: ${i.quantity} ${i.unit}, Min: ${i.minStock})`);
  const logsSummary = logs.slice(0, 10).map((l) => `${l.timestamp}: ${l.user} adjusted ${l.itemName} by ${l.quantityAdjusted} (${l.type})`).join('\n');

  const prompt = `Analyze our café's current inventory status:
Low Stock Items:
${lowStockItems.length > 0 ? lowStockItems.join('\n') : 'All items are currently above safety stock thresholds.'}

Recent Actions:
${logsSummary || 'No recent adjustments.'}

Please output a concise set of action points advising what items to restock immediately and how to optimize raw materials. Format as a neat list.`;

  return callGroq(prompt, apiKey);
};

/**
 * Generate Sales Forecasts using past invoice transaction volumes.
 */
export const generateSalesPredictions = async (
  bills: Bill[],
  apiKey: string
): Promise<string> => {
  const dailySalesMap: Record<string, number> = {};
  bills.forEach((b) => {
    dailySalesMap[b.date] = (dailySalesMap[b.date] || 0) + b.grandTotal;
  });
  const dataPoints = Object.entries(dailySalesMap).slice(-7).map(([date, val]) => `${date}: ₹${val.toFixed(2)}`).join(', ');

  const prompt = `Based on our past sales data:
${dataPoints || 'No sales records available yet.'}

Provide a short forecasting report indicating our expected sales trend for the upcoming week and identify potential peak times. Keep it compact and structured.`;

  return callGroq(prompt, apiKey);
};

/**
 * Suggest loyalty-driven targeted promotions.
 */
export const generateSuggestedPromotions = async (
  menuItems: MenuItem[],
  profiles: CRMProfile[],
  apiKey: string
): Promise<string> => {
  const topItems = menuItems.filter((i) => i.popularTag).map((i) => i.name).slice(0, 5).join(', ');
  const silverGoldCount = profiles.filter((p) => p.loyaltyPoints >= 100).length;

  const prompt = `Recommend two creative, targeted marketing promotions.
Cafe popular dishes: ${topItems || 'Standard Menu'}
Active loyalty members (Silver tier or higher): ${silverGoldCount} members

Propose one promotion targeting high-value repeat guests, and one targeting occasional visitors to drive up covers. Output only the campaign titles and short execution summaries.`;

  return callGroq(prompt, apiKey);
};
