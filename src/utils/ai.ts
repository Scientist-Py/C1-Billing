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

  // Use proxy path to bypass CORS restrictions in the browser.
  // The proxy is handled by Vite proxy in development and vercel.json rewrites in production.
  const url = '/api-groq/openai/v1/chat/completions';

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

  // Use proxy path to bypass CORS restrictions in the browser.
  const url = '/api-groq/openai/v1/chat/completions';

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

/**
 * Generates a warm, professional welcome greeting using Groq API.
 */
export const generateWelcomeGreeting = async (
  username: string,
  role: string,
  apiKey: string
): Promise<string> => {
  if (!apiKey || apiKey.trim().length === 0) {
    return `Welcome back, ${username}! Wishing you an excellent shift.`;
  }

  const systemPrompt = `You are the digital voice manager of Chapter One Cafe. Write a very brief, professional, warm, and highly impressive welcome back greeting for our staff member "${username}" (role: "${role}").
  Guidelines:
  1. The greeting must be professional, motivational, and impressive.
  2. Keep it very short (max 12-18 words, 1-2 short sentences) so it's quick and clean to speak.
  3. Include a warm greeting.
  4. Do not output any quotes or system text. Output ONLY the greeting itself.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5 seconds timeout

  try {
    const response = await fetch('/api-groq/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Greet the user "${username}" (role: "${role}")` }
        ],
        temperature: 0.8
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Failed to generate AI greeting, using fallback:", err);
    return `Welcome back, ${username}! Wishing you an excellent and productive shift.`;
  }
};

const getBestVoice = (): Promise<SpeechSynthesisVoice | null> => {
  return new Promise((resolve) => {
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(selectVoice(voices));
      return;
    }
    
    // Listen to voiceschanged if they are loaded asynchronously
    const callback = () => {
      const updatedVoices = window.speechSynthesis.getVoices();
      resolve(selectVoice(updatedVoices));
    };
    window.speechSynthesis.onvoiceschanged = callback;
    
    // Safety fallback
    setTimeout(() => {
      resolve(selectVoice(window.speechSynthesis.getVoices()));
    }, 800);
  });
};

const selectVoice = (voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
  if (!voices || voices.length === 0) return null;
  
  // 1. Look for English Edge Online (Natural) premium neural voices
  const edgeVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    v.name.includes('Online') && 
    v.name.includes('Natural')
  );
  if (edgeVoice) return edgeVoice;

  // 2. Look for any English Microsoft Neural/Natural voice
  const microsoftVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    (v.name.includes('Microsoft') || v.name.includes('Neural') || v.name.includes('Natural'))
  );
  if (microsoftVoice) return microsoftVoice;

  // 3. Look for any English Google voice
  const googleVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    v.name.includes('Google')
  );
  if (googleVoice) return googleVoice;

  // 4. Fallback to any English voice
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  if (enVoice) return enVoice;

  return voices[0] || null;
};

/**
 * Text-to-Speech (TTS) using Web Speech API.
 * Uses high-quality browser cloud/neural voices (like Edge premium neural voices) if available.
 */
export const speakText = async (text: string) => {
  if ('speechSynthesis' in window) {
    // Cancel any current speaking activity
    window.speechSynthesis.cancel();

    // Resolve the best voice asynchronously
    const voice = await getBestVoice();

    // Small delay to ensure speech engine resets cleanly
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = 0.95; // Natural clear speed
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }, 150);
  } else {
    console.warn('Speech synthesis is not supported in this browser.');
  }
};

