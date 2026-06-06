const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const fetch = require('node-fetch');  // Node 20 has native fetch, but kept for clarity

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Configuration from environment
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TERMINAL_MAX_CLIENTS = parseInt(process.env.TERMINAL_MAX_CLIENTS || '5');
const SESSION_TIMEOUT_SECONDS = parseInt(process.env.SESSION_TIMEOUT_SECONDS || '1800');
const COOKIE_SECRET = crypto.randomBytes(32).toString('hex');
const COOKIE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Start WeTTY subprocess on internal port 3001
let wettyProcess = null;
function startWeTTY() {
  wettyProcess = spawn('wetty', [
    '--port', '3001',
    '--base', '/term/',
    '--command', '/usr/local/bin/run-session.sh',
    '--host', '127.0.0.1',
    '--max-clients', String(TERMINAL_MAX_CLIENTS),
    '--no-open',
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SESSION_TIMEOUT_SECONDS: String(SESSION_TIMEOUT_SECONDS),
      GIT_REPO_OWNER: process.env.GIT_REPO_OWNER || 'ssterjo',
    },
  });

  wettyProcess.on('exit', (code) => {
    console.error(`WeTTY exited with code ${code}, restarting in 5s...`);
    setTimeout(startWeTTY, 5000);
  });
}

startWeTTY();

// Utility: sign and verify HMAC cookies
function signCookie(sessionId) {
  const timestamp = Date.now();
  const data = `${sessionId}|${timestamp}`;
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64');
  return `${data}|${hmac}`;
}

function verifyCookie(cookie) {
  const parts = cookie.split('|');
  if (parts.length !== 3) return null;

  const [sessionId, timestamp, providedHmac] = parts;
  const data = `${sessionId}|${timestamp}`;
  const expectedHmac = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64');

  if (providedHmac !== expectedHmac) return null;

  const age = Date.now() - parseInt(timestamp);
  if (age > COOKIE_TTL) return null;

  return sessionId;
}

// Landing page with Turnstile widget
app.get('/', (req, res) => {
  if (req.cookies.terminal_auth) {
    if (verifyCookie(req.cookies.terminal_auth)) {
      return res.redirect('/term/');
    }
  }

  res.type('text/html').send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Setup Terminal</title>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
        .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; }
        h1 { text-align: center; margin-top: 0; }
        p { text-align: center; color: #666; }
        .cf-turnstile { display: flex; justify-content: center; margin: 2rem 0; }
        button { width: 100%; padding: 12px; background: #0051ba; color: white; border: none; border-radius: 4px; font-size: 16px; cursor: pointer; }
        button:hover { background: #003d91; }
        button:disabled { background: #ccc; cursor: not-allowed; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Setup Terminal</h1>
        <p>Complete the challenge below to access the browser-based setup terminal.</p>
        <form method="POST" action="/validate">
          <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
          <button type="submit">Continue</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// Turnstile validation endpoint
app.post('/validate', async (req, res) => {
  const token = req.body['cf-turnstile-response'];
  if (!token) {
    return res.status(400).send('Missing Turnstile token.');
  }

  try {
    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: TURNSTILE_SECRET_KEY,
        response: token,
      }),
    });

    const { success, error_codes } = await verification.json();

    if (!success) {
      console.error('Turnstile validation failed:', error_codes);
      return res.status(403).send('Challenge failed. Please try again.');
    }

    // Issue signed cookie
    const sessionId = crypto.randomUUID();
    const authCookie = signCookie(sessionId);
    res.cookie('terminal_auth', authCookie, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: COOKIE_TTL,
    });

    res.redirect('/term/');
  } catch (error) {
    console.error('Turnstile verification error:', error);
    res.status(500).send('Internal server error.');
  }
});

// Gate middleware: require valid auth cookie for /term/*
app.use('/term/', (req, res, next) => {
  const cookie = req.cookies.terminal_auth;
  if (!cookie || !verifyCookie(cookie)) {
    return res.redirect('/');
  }
  next();
});

// Proxy authenticated requests to WeTTY on localhost:3001
app.use('/term/', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: false,
  pathRewrite: { '^/term': '' },
  ws: true,  // Enable WebSocket upgrade for WeTTY terminal
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(502).send('Terminal service unavailable. Please try again.');
  },
}));

// 404 fallback
app.use((req, res) => {
  res.status(404).send('Not found.');
});

// Start Express on port 3000
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Terminal gate listening on port ${PORT}`);
});
