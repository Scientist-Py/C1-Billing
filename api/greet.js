export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY environment variable is not configured on Vercel.' });
  }

  const { username, role } = req.body;
  if (!username || !role) {
    return res.status(400).json({ error: 'Missing username or role in request body.' });
  }

  const randomSeed = Math.random().toString(36).substring(7);
  const systemPrompt = `You are the digital voice manager of Chapter One Cafe. Write a brief, warm, professional, and impressive welcome back greeting for our staff member "${username}" (role: "${role}").
  Guidelines:
  1. Keep it short (max 10-14 words, 1 short sentence) so it is clean to speak.
  2. Include a welcoming back message and positive shift wishes.
  3. Make it unique and different. Use the random key "${randomSeed}" for variation.
  4. Do not output any quotes or system text. Output ONLY the greeting itself.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return res.status(200).json({ greeting: data.choices[0].message.content.trim() });
    } else {
      return res.status(502).json({ error: 'Unexpected response structure from Groq API', details: data });
    }
  } catch (err) {
    console.error('Groq greeting proxy failed:', err);
    return res.status(520).json({ error: 'Communication with Groq API failed', details: err.message });
  }
}
