'use strict';
require('dotenv').config();
const http = require('http');
const { exchangeForLongLived, saveToken } = require('./lib/auth');

const APP_ID       = process.env.IG_APP_ID;
const APP_SECRET   = process.env.IG_APP_SECRET;
const REDIRECT_URI = process.env.IG_REDIRECT_URI || 'http://localhost:3000/callback';
const PORT         = 3000;

const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_business_manage_comments',
].join(',');

if (!APP_ID || !APP_SECRET) {
  console.error('Error: IG_APP_ID and IG_APP_SECRET must be set in .env');
  process.exit(1);
}

const authUrl =
  `https://www.instagram.com/oauth/authorize` +
  `?client_id=${APP_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${SCOPES}` +
  `&response_type=code`;

console.log('\nGraft Wild — Instagram Auth Setup\n');
console.log('Open this URL in your browser:\n');
console.log('   ' + authUrl);
console.log('\nWaiting on port ' + PORT + '...\n');

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, `http://localhost:${PORT}`); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  if (url.pathname !== '/callback') { res.writeHead(404); res.end('Not found'); return; }

  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    console.error('Auth error:', error);
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(page('Authorization failed', error, '#c0392b'));
    server.close(); return;
  }

  if (!code) { res.writeHead(400); res.end('No code'); return; }

  try {
    process.stdout.write('Exchanging code for short-lived token... ');
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code }),
    });
    const shortToken = await tokenRes.json();
    if (shortToken.error_type) throw new Error(`${shortToken.error_type}: ${shortToken.error_message}`);
    console.log('ok');

    process.stdout.write('Exchanging for long-lived token (60 days)... ');
    const longToken = await exchangeForLongLived(shortToken.access_token);
    console.log('ok');

    const tokenData = { access_token: longToken.access_token, token_type: 'bearer', expires_at: Date.now() + longToken.expires_in * 1000, user_id: shortToken.user_id };
    saveToken(tokenData);

    const days = Math.round(longToken.expires_in / 86400);
    console.log(`\nToken saved. Valid for ${days} days.`);
    console.log('Run: npm run fetch\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page('Authorization successful', `Token saved. Valid for <strong>${days} days</strong>.<br>Close this window and run <code>npm run fetch</code>.`, '#5a9140'));
    server.close();
  } catch (err) {
    console.error('Error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(page('Error', err.message, '#c0392b'));
    server.close();
  }
});

server.listen(PORT);
server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} in use. Kill it and retry.`);
  else console.error('Server error:', err);
  process.exit(1);
});

function page(title, body, color) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#0e1610;color:#d8ead0"><h2 style="color:${color}">${title}</h2><p>${body}</p></body></html>`;
}
