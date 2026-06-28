export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sheetUrl = process.env.GOOGLE_SHEETS_URL;
  if (!sheetUrl) {
    return res.status(500).json({ error: 'GOOGLE_SHEETS_URL environment variable is not configured on Vercel.' });
  }

  try {
    if (req.method === 'GET') {
      let response = await fetch(sheetUrl, {
        method: 'GET',
        redirect: 'manual'
      });

      // Handle 302/301 redirects manually for GET
      if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
        const redirectUrl = response.headers.get('location');
        if (redirectUrl) {
          response = await fetch(redirectUrl, {
            method: 'GET'
          });
        }
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    } 
    
    if (req.method === 'POST') {
      let response = await fetch(sheetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body),
        redirect: 'manual'
      });

      // Google Apps Script redirects 302 to script.googleusercontent.com
      // We must handle the redirect manually to preserve the POST method
      if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
        const redirectUrl = response.headers.get('location');
        if (redirectUrl) {
          response = await fetch(redirectUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
          });
        }
      }

      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Sync proxy failed:', err);
    return res.status(520).json({ error: 'Communication with Google Sheets failed', details: err.message });
  }
}
