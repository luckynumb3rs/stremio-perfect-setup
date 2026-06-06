/*
 * Terminal Service Express Gateway and Authentication Handler
 *
 * Purpose:
 *   This Express.js application serves as an authentication and proxy gateway
 *   for the browser-based terminal service. It implements a Cloudflare
 *   Turnstile challenge-based authentication flow, issues HMAC-signed session
 *   cookies upon successful challenge completion, and proxies authenticated
 *   requests to the WeTTY terminal daemon (WebSocket proxy for xterm.js).
 *
 * Architecture:
 *   - Express gateway on port 3000 (external)
 *   - WeTTY daemon subprocess on localhost:3001 (internal)
 *   - HTTP proxy with WebSocket upgrade for terminal sessions
 *
 * Request Flow:
 *   1. Unauthenticated GET / -> Landing page with Turnstile widget
 *   2. POST /validate with Turnstile token -> Validate via Cloudflare API
 *   3. On success -> Issue signed HMAC-SHA256 cookie, redirect to /term/
 *   4. GET /term/* with valid cookie -> Proxy to WeTTY daemon
 *   5. Expired/invalid cookies -> Redirect back to landing page
 *
 * Security Model:
 *   - Turnstile Challenge: Prevents automated abuse via Cloudflare's
 *     managed challenge (CAPTCHA/device fingerprint by Cloudflare)
 *   - HMAC Cookie Signing: Ensures cookies cannot be forged; tampering is
 *     detectable via signature verification
 *   - Cookie TTL: 24 hours (COOKIE_TTL); older cookies are rejected
 *   - HTTPOnly + Secure + SameSite=Strict: Standard session hardening
 *   - Session Isolation: run-session.sh ensures per-connection tmpfs isolation
 *
 * Environment Variables:
 *   - TURNSTILE_SITE_KEY: Public site key for Turnstile widget (required)
 *   - TURNSTILE_SECRET_KEY: Private secret for server-side validation (required)
 *   - COOKIE_SECRET: HMAC-SHA256 key for signing session cookies (required)
 *   - TERMINAL_MAX_CLIENTS: Max concurrent WeTTY sessions (default 5)
 *   - SESSION_TIMEOUT_SECONDS: Hard timeout per session, sec (default 1800)
 *   - GIT_REPO_OWNER: GitHub account for sparse clone (default ssterjo)
 *
 * Notes:
 *   - WeTTY is restarted automatically if it exits (5s retry delay)
 *   - Proxy errors are caught and return a 502 "Terminal service unavailable"
 *   - All 404s and unmatched routes return "Not found"
 */

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Configuration from environment
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const TERMINAL_MAX_CLIENTS = Math.max(1, parseInt(process.env.TERMINAL_MAX_CLIENTS || '5') || 5);
const SESSION_TIMEOUT_SECONDS = Math.max(30, parseInt(process.env.SESSION_TIMEOUT_SECONDS || '1800') || 1800);
const COOKIE_SECRET = process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Validate required environment variables
if (!TURNSTILE_SITE_KEY || !TURNSTILE_SECRET_KEY) {
  console.error('Error: TURNSTILE_SITE_KEY or TURNSTILE_SECRET_KEY not set in environment');
  process.exit(1);
}

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
  const ts = parseInt(timestamp);
  if (isNaN(ts)) return null;

  const data = `${sessionId}|${timestamp}`;
  const expectedHmac = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('base64');

  if (providedHmac !== expectedHmac) return null;

  const age = Date.now() - ts;
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
      timeout: 5000,
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
