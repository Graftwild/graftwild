'use strict';
const fs   = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '..', '.token.json');

function loadToken() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); }
  catch { return null; }
}

function saveToken(data) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

async function exchangeForLongLived(shortToken) {
  const clientSecret = process.env.IG_APP_SECRET;
  if (!clientSecret) throw new Error('IG_APP_SECRET not set in .env');
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type',    'ig_exchange_token');
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('access_token',  shortToken);
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`Token exchange failed: ${data.error.message}`);
  return data;
}

async function refreshLongLived(accessToken) {
  const url = new URL('https://graph.instagram.com/refresh_access_token');
  url.searchParams.set('grant_type',   'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh failed: ${data.error.message}`);
  return data;
}

async function getValidToken() {
  const stored = loadToken();
  if (!stored || !stored.access_token) throw new Error('No token found. Run: npm run auth');
  const now       = Date.now();
  const expiresAt = stored.expires_at || 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (now >= expiresAt) throw new Error('Token expired. Run: npm run auth');
  if (now >= expiresAt - sevenDays) {
    process.stdout.write('Token expiring soon, refreshing... ');
    try {
      const refreshed = await refreshLongLived(stored.access_token);
      const updated   = { access_token: refreshed.access_token, token_type: 'bearer', expires_at: now + refreshed.expires_in * 1000, user_id: stored.user_id };
      saveToken(updated);
      console.log('refreshed.');
      return updated.access_token;
    } catch (err) { console.warn(`refresh failed, using existing.`); }
  }
  return stored.access_token;
}

module.exports = { getValidToken, exchangeForLongLived, saveToken, loadToken };
