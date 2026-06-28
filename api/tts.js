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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not configured on Vercel.' });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Missing text in request body.' });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`;

  try {
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
                voice_name: "Aoede" // Highly expressive neural female voice
              }
            }
          }
        }
      })
    });

    const data = await response.json();
    
    // Extract base64 audio data from Gemini response
    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const audioData = part?.inlineData?.data;

    if (audioData) {
      return res.status(200).json({ audioContent: audioData });
    } else {
      return res.status(502).json({ error: 'Failed to extract audio modality from Gemini API response.', details: data });
    }
  } catch (err) {
    console.error('Gemini TTS proxy failed:', err);
    return res.status(520).json({ error: 'Communication with Gemini API failed', details: err.message });
  }
}
