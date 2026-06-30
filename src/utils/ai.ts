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

  const ordinalSuffix = visitCount === 1 ? 'st' : visitCount === 2 ? 'nd' : visitCount === 3 ? 'rd' : 'th';

  const systemPrompt = `You are a warm, professional WhatsApp greeting writer for Chapter One Cafe.
Write a personalized thank-you greeting to send to a customer after their visit. This greeting will appear ABOVE the digital invoice in the WhatsApp message.

STRICT Formatting Rules:
1. Write in a ${chosenStyle} tone.
2. Start with: 🌿 Hello *${bill.customerName}*! followed by a warm thank you line.
3. Mention their visit count: "🎉 This was your *${visitCount}${ordinalSuffix}* visit with us!" — If 1st visit, warmly welcome them as a new guest. If repeat, appreciate their loyalty.
4. Mention what they enjoyed: [${itemsText}] — Use food/beverage emojis (☕🍕🍔🍹🍫🍟) and make item names bold with *asterisks*.
5. End with a short eco-friendly line about sharing the bill digitally to save paper and trees 🌍.
6. Write exactly 4-6 lines. Each line should be separated by a blank line (double newline). Keep it warm but not overly long.
7. Use WhatsApp bold formatting (*word*) on the customer name, item names, and visit count.
8. DO NOT include any invoice details, prices, totals, or bill numbers — those are appended separately.
9. DO NOT use markdown headers, bullet points, or numbered lists.
10. Output ONLY the greeting text, nothing else.

Randomization seed: "${randomSeed}" — use this to vary your word choices so the message is unique every time.`;

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

  const randomSeed = Math.random().toString(36).substring(7);
  const systemPrompt = `You are the digital voice manager of Chapter One Cafe. Write a brief, warm, professional, and impressive welcome back greeting for our staff member "${username}" (role: "${role}").
  Guidelines:
  1. Keep it short (max 10-14 words, 1 short sentence) so it is clean to speak.
  2. Include a welcoming back message and positive shift wishes.
  3. Make it unique and different. Use the random key "${randomSeed}" for variation.
  4. Do not output any quotes or system text. Output ONLY the greeting itself.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout

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
        temperature: 0.85
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Failed to generate AI greeting, using fallback:", err);
    return `Welcome back, ${username}! Wishing you an excellent shift.`;
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
  
  // 1. Prioritize Microsoft Edge Female Online (Natural) voices (e.g. Aria, Jenny, Michelle)
  const edgeFemale = voices.find(v => 
    v.lang.startsWith('en') && 
    v.name.includes('Online') && 
    v.name.includes('Natural') &&
    (v.name.includes('Aria') || v.name.includes('Jenny') || v.name.includes('Michelle') || v.name.toLowerCase().includes('female'))
  );
  if (edgeFemale) return edgeFemale;

  // 2. Any English Edge Online (Natural) premium neural voice
  const edgeVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    v.name.includes('Online') && 
    v.name.includes('Natural')
  );
  if (edgeVoice) return edgeVoice;

  // 3. Look for any English Microsoft Female voice
  const microsoftFemale = voices.find(v => 
    v.lang.startsWith('en') && 
    v.name.includes('Microsoft') &&
    (v.name.includes('Zira') || v.name.toLowerCase().includes('female'))
  );
  if (microsoftFemale) return microsoftFemale;

  // 4. Look for any English Microsoft Neural/Natural voice
  const microsoftVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    (v.name.includes('Microsoft') || v.name.includes('Neural') || v.name.includes('Natural'))
  );
  if (microsoftVoice) return microsoftVoice;

  // 5. Look for any English Google voice (like Google US English which is typically female)
  const googleVoice = voices.find(v => 
    v.lang.startsWith('en') && 
    v.name.includes('Google')
  );
  if (googleVoice) return googleVoice;

  // 6. Fallback to any English voice
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  if (enVoice) return enVoice;

  return voices[0] || null;
};

/**
 * Call Gemini 2.0 Flash Audio API to generate high-fidelity neural speech audio.
 */
export const generateGeminiAudio = async (text: string, apiKey: string): Promise<string> => {
  // Use gemini-2.0-flash model which has built-in audio modality support
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Read this welcoming text out loud in a warm, natural, highly expressive and friendly voice. Speak clearly: "${text}"`
            }
          ]
        }
      ],
      generationConfig: {
        response_modalities: ["audio"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: "Aoede" // Highly expressive neural voice: Aoede, Puck, Charon, Fenrir, Kore
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini Audio API returned HTTP ${response.status}`);
  }

  const result = await response.json();
  const parts = result.candidates?.[0]?.content?.parts || [];
  
  // Robust check for both camelCase and snake_case properties returned by API
  const part = parts.find((p: any) => p.inlineData || p.inline_data);
  if (!part) {
    throw new Error('No audio part found in Gemini API response');
  }
  const inline = part.inlineData || part.inline_data;
  if (!inline || !inline.data) {
    throw new Error('No audio base64 data found in Gemini API response');
  }

  return inline.data; // Return base64 encoded audio string
};

const playBase64Audio = (base64Data: string, mimeType: string = 'audio/ogg; codecs=opus') => {
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType });
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  audio.play().catch((e) => {
    console.warn("Failed to play Gemini audio:", e);
  });
};

/**
 * Text-to-Speech (TTS) using Gemini Neural Audio API (primary) with Web Speech API (fallback).
 */
export const speakText = async (text: string, geminiApiKey?: string) => {
  // Try to use Gemini Neural Voice API first if key is provided
  if (geminiApiKey && geminiApiKey.trim().length > 0) {
    try {
      const base64Audio = await generateGeminiAudio(text, geminiApiKey);
      playBase64Audio(base64Audio);
      return; // Success!
    } catch (err) {
      console.warn("Gemini Audio generation failed, falling back to browser TTS:", err);
    }
  }

  // Fallback to browser standard SpeechSynthesis (Edge TTS)
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();

    const voice = await getBestVoice();

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }, 150);
  } else {
    console.warn('Speech synthesis is not supported in this browser.');
  }
};

/**
 * Generate AI-driven inventory audits and restock recommendations via Groq.
 */
export const generateAIInventoryInsights = async (
  inventory: any[],
  logs: any[],
  apiKey: string
): Promise<string> => {
  if (!apiKey || apiKey.trim().length === 0) {
    return 'Groq API Key is not configured. Please set your API key in settings to enable AI Inventory Insights.';
  }

  const itemsText = inventory.map(item => 
    `- ${item.name}: ${item.quantity} ${item.unit} (Alert threshold: ${item.minStock} ${item.unit})`
  ).join('\n');

  const recentLogsText = logs.slice(0, 15).map(log =>
    `- [${new Date(log.timestamp).toLocaleDateString()}] ${log.itemName} adjusted by ${log.quantityAdjusted} (${log.type}) - ${log.reason}`
  ).join('\n');

  const systemPrompt = `You are a professional AI Stock Auditor and Inventory Consultant at Chapter One Cafe.
Your task is to analyze the current stock status and recent transaction logs of our cafe ingredients, and provide a highly useful, professional, and readable stock report.

Format your output in clean, readable WhatsApp-style markdown using these sections:
1. ⚠️ *CRITICAL STOCK ALERTS* - List items that are below or very close to their alert threshold, or that we might run out of.
2. 📈 *USAGE AND WASTE REPORT* - Analyze usage patterns from logs (sales vs wastage/spoiled logs). Point out any high wastage items.
3. 🛒 *PREDICTIVE RESTOCK PLAN* - Recommend exactly which items we should order now and what quantities (be specific, e.g. "Order 40 units of Water Bottles to cover next week's sales").
4. 💡 *OPERATIONAL EFFICIENCY TIPS* - Give 1-2 quick tips to improve kitchen efficiency, reduce wastage, or optimize raw material spending.

Keep your response professional, warm, concise (approx 200-300 words), and highly actionable. Use emojis (📦, 🧀, ☕, 🍟, 📈, 🚨) to structure the sections beautifully. Do not include markdown titles like # or ##; use bold lines (e.g. *SECTION NAME*) instead.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000); // 7 second timeout

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
          { role: 'user', content: `Here is the current inventory status:\n${itemsText}\n\nRecent logs:\n${recentLogsText}` }
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
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("Groq AI inventory insights failed or timed out:", err);
    return '⚠️ *AI Insights Unavailable*\n\nThe request to Groq API timed out or failed. Please check your API key and internet connection, then try again.';
  }
};

