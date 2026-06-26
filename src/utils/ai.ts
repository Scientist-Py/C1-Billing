import type { Bill } from '../types';

const styles = [
  "Enthusiastic and friendly (using words like 'awesome', 'thrilled to have you', 'great energy')",
  "Cozy, welcoming, and warm (using words like 'pleasure hosting you', 'cozy vibes', 'hope you relaxed')",
  "Elegant, premium, and polite (using words like 'distinctive taste', 'delighted to host', 'sincere thanks')",
  "Snappy, witty, and fun (using snarky or playful puns about cafe food, short sentences, high energy)"
];

/**
 * Generate a highly personalized and randomized WhatsApp message via Groq API.
 * Uses AbortController to enforce a 4-second timeout for graceful failovers.
 */
export const generateAIWhatsAppMessage = async (
  bill: Bill,
  apiKey: string,
  visitCount: number
): Promise<string> => {
  if (!apiKey || apiKey.trim().length === 0) {
    return '';
  }

  const itemsText = bill.orderedItems.map((i) => `${i.name} x${i.quantity}`).join(', ');
  const chosenStyle = styles[Math.floor(Math.random() * styles.length)];
  const randomSeed = Math.random().toString(36).substring(7);

  const systemPrompt = `You are a professional AI cashier assistant at Chapter One Cafe.
Your task is to write a highly personalized, premium, warm, and professional checkout message to send to our guest on WhatsApp.

Copywriting Guidelines:
1. Write in a ${chosenStyle} tone. Do not write generic or basic text; use premium, elegant, and warm vocabulary.
2. Address the customer by name: "${bill.customerName}". Make their name bold, e.g. "*${bill.customerName}*".
3. Mention their visit count: ${visitCount} visit(s). If visitCount is 1, greet them as a new customer and welcome them warmly. If visitCount > 1, thank them for their loyalty as a repeating customer.
4. Mention their ordered items: [${itemsText}]. Comment briefly on them with relevant vibrant food/beverage emojis (e.g. 🍕, 🍹, 🍔, 🍫, ☕, 🍟). Make the key items bold, e.g. "*${bill.orderedItems[0]?.name || 'order'}*".
5. Seating location rules:
   - If the seating location is exactly "Main Hall", DO NOT mention the words "Main Hall" or "hall" or "area", and DO NOT mention the duration, seating time, or time spent in your message at all. Simply focus on the dining experience.
   - If they sat in the "Basement", make a cozy reference to their work/study session and their duration (${bill.timeSpentMinutes} mins).
6. Ensure the message is concise (2-4 sentences max) so it fits beautifully in a WhatsApp chat bubble.
7. Use bold text (using asterisks like *word*) on key highlights and names.
8. DO NOT mention raw prices, subtotals, or tax rates. The billing details are appended separately.
9. Output ONLY the greeting narrative. Do not include markdown headers or system notes.

To keep it unique and different every time, use this randomization token: "${randomSeed}". Do not use standard templates.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 second timeout

  // Route requests via Vite dev server proxy on localhost/local network to bypass browser CORS policies
  const host = window.location.hostname;
  const isLocalEnv = host === 'localhost' || 
                     host === '127.0.0.1' || 
                     host.startsWith('192.168.') || 
                     host.startsWith('10.') || 
                     host.startsWith('172.') || 
                     host.endsWith('.local');
                     
  const url = isLocalEnv 
    ? '/api-groq/openai/v1/chat/completions' 
    : 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Write a customized WhatsApp thank you message for customer ${bill.customerName}.` }
        ],
        temperature: 0.8
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Groq API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Groq API completion failed or timed out. Falling back to default template.", err);
    return '';
  }
};

/**
 * Generate a natural-language daily business summary using Groq's Llama 3 model.
 * Aggregates metrics client-side first to optimize API token usage.
 */
export const generateAIDailySummary = async (
  todayBills: Bill[],
  yesterdayBills: Bill[],
  apiKey: string
): Promise<string> => {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('Groq API Key is missing. Please configure it in Settings.');
  }

  if (todayBills.length === 0) {
    return 'No transactions have been recorded for today yet. Make some sales to see AI insights!';
  }

  // Aggregate metrics
  const todayRevenue = todayBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const todayCount = todayBills.length;
  const todayAOV = todayRevenue / todayCount;

  const yesterdayRevenue = yesterdayBills.reduce((sum, b) => sum + b.grandTotal, 0);
  const yesterdayCount = yesterdayBills.length;

  // Comparison metrics
  let revenueChangePercent = 0;
  if (yesterdayRevenue > 0) {
    revenueChangePercent = ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
  }
  let countChangePercent = 0;
  if (yesterdayCount > 0) {
    countChangePercent = ((todayCount - yesterdayCount) / yesterdayCount) * 100;
  }

  // Location share
  const mainHallRevenue = todayBills.filter(b => b.location === 'Main Hall').reduce((sum, b) => sum + b.grandTotal, 0);
  const basementRevenue = todayBills.filter(b => b.location === 'Basement').reduce((sum, b) => sum + b.grandTotal, 0);
  const takeawayRevenue = todayBills.filter(b => b.location === 'Takeaway').reduce((sum, b) => sum + b.grandTotal, 0);

  const mainHallPercent = todayRevenue > 0 ? (mainHallRevenue / todayRevenue) * 100 : 0;
  const basementPercent = todayRevenue > 0 ? (basementRevenue / todayRevenue) * 100 : 0;
  const takeawayPercent = todayRevenue > 0 ? (takeawayRevenue / todayRevenue) * 100 : 0;

  // Product sales velocity
  const itemsMap: Record<string, number> = {};
  todayBills.forEach(b => {
    b.orderedItems.forEach(item => {
      itemsMap[item.name] = (itemsMap[item.name] || 0) + item.quantity;
    });
  });
  const topItems = Object.entries(itemsMap)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // Payment method breakdown
  const paymentMap: Record<string, number> = { Cash: 0, UPI: 0, Card: 0, Split: 0 };
  todayBills.forEach(b => {
    paymentMap[b.paymentMethod] = (paymentMap[b.paymentMethod] || 0) + 1;
  });
  const paymentBreakdown = Object.entries(paymentMap)
    .map(([method, count]) => `${method}: ${((count / todayCount) * 100).toFixed(0)}%`)
    .join(', ');

  // Cashier checkouts
  const cashierMap: Record<string, number> = {};
  todayBills.forEach(b => {
    cashierMap[b.cashierName] = (cashierMap[b.cashierName] || 0) + 1;
  });
  const cashierBreakdown = Object.entries(cashierMap)
    .map(([name, count]) => `${name}: ${count} checkout(s)`)
    .join(', ');

  // Seating time
  const basementBills = todayBills.filter(b => b.location === 'Basement');
  const avgSeatingTime = basementBills.length > 0
    ? basementBills.reduce((sum, b) => sum + b.timeSpentMinutes, 0) / basementBills.length
    : 0;

  const dataPayload = {
    todayDate: new Date().toLocaleDateString(),
    metrics: {
      revenue: todayRevenue.toFixed(2),
      checkouts: todayCount,
      aov: todayAOV.toFixed(2)
    },
    yesterdayCompare: {
      revenueChange: revenueChangePercent.toFixed(1) + '%',
      checkoutChange: countChangePercent.toFixed(1) + '%',
      hadDataFromYesterday: yesterdayRevenue > 0
    },
    locations: {
      mainHallShare: `${mainHallPercent.toFixed(1)}% (₹${mainHallRevenue.toFixed(2)})`,
      basementShare: `${basementPercent.toFixed(1)}% (₹${basementRevenue.toFixed(2)})`,
      takeawayShare: `${takeawayPercent.toFixed(1)}% (₹${takeawayRevenue.toFixed(2)})`
    },
    topItems: topItems.map(item => `${item.name} (${item.qty} sold)`).join(', '),
    payments: paymentBreakdown,
    staff: cashierBreakdown,
    basementStats: {
      totalBasementBills: basementBills.length,
      averageSessionDuration: `${avgSeatingTime.toFixed(0)} mins`
    }
  };

  const systemPrompt = `You are an expert Business Intelligence Analyst for Chapter One Cafe.
Your task is to analyze the daily sales aggregation payload and write a highly engaging, professional, natural-language executive summary of today's business.

Writing Guidelines:
1. Start with a summary sentence comparing today's performance to yesterday (e.g., "Today was 23% busier than yesterday..."). If there is no comparison data from yesterday, state this gracefully.
2. Highlight seating location dynamics, explaining which area drove the most revenue (e.g. Basement seating vs Main Hall).
3. Mention the top-selling items and any interesting volume patterns.
4. Keep the tone executive, modern, warm, and highly analytical.
5. Use markdown highlighting (like bolding with **word**) for key metrics, food items, cashiers, and percentages to make the text highly scannable and beautiful.
6. The summary must be concise (approx 3-5 sentences, max 150 words). Do not include introductory conversational text (like "Here is your summary:") or markdown headers. Output ONLY the analysis text itself.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

  const host = window.location.hostname;
  const isLocalEnv = host === 'localhost' || 
                     host === '127.0.0.1' || 
                     host.startsWith('192.168.') || 
                     host.startsWith('10.') || 
                     host.startsWith('172.') || 
                     host.endsWith('.local');
                     
  const url = isLocalEnv 
    ? '/api-groq/openai/v1/chat/completions' 
    : 'https://api.groq.com/openai/v1/chat/completions';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze this cafe sales payload: ${JSON.stringify(dataPayload)}` }
        ],
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Groq API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error("Groq AI Daily Summary failed", err);
    throw err;
  }
};
