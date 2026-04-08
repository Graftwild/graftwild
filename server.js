'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { spawn } = require('child_process');

// ─── Load .env ────────────────────────────────────────────────────────────────
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* .env optional */ }

// ─── Stripe ───────────────────────────────────────────────────────────────────
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const DASHBOARD_PW  = process.env.DASHBOARD_PASSWORD || 'graftwild2026';
const STATIC_ROOT   = __dirname;
const IG_TOOL_DIR   = path.join(__dirname, 'ig-tool');
const PRODUCTS_FILE = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE   = path.join(__dirname, 'data', 'orders.json');
const REFRESH_MS    = 12 * 60 * 60 * 1000;     // 12 hours

// ─── State ────────────────────────────────────────────────────────────────────
let isRefreshing  = false;
let lastRefreshed = null;
let nextRefresh   = null;
let refreshTimer  = null;

// ─── Refresh logic ────────────────────────────────────────────────────────────
function runRefresh() {
  if (isRefreshing) {
    console.log('[refresh] Already running — skipping scheduled trigger');
    return Promise.resolve();
  }
  isRefreshing = true;
  const started = new Date();
  console.log(`[refresh] Starting at ${started.toISOString()}`);

  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'all'], {
      cwd:   IG_TOOL_DIR,
      shell: true,
      env:   { ...process.env },
    });

    proc.stdout.on('data', d => process.stdout.write('[ig-tool] ' + d));
    proc.stderr.on('data', d => process.stderr.write('[ig-tool] ' + d));

    proc.on('close', code => {
      isRefreshing = false;
      if (code === 0) {
        lastRefreshed = new Date().toISOString();
        console.log(`[refresh] Done. Last refreshed: ${lastRefreshed}`);
        resolve();
      } else {
        console.error(`[refresh] Failed with exit code ${code}`);
        reject(new Error(`npm run all exited with code ${code}`));
      }
    });

    proc.on('error', err => {
      isRefreshing = false;
      console.error('[refresh] Spawn error:', err.message);
      reject(err);
    });
  });
}

function scheduleNext() {
  clearTimeout(refreshTimer);
  nextRefresh = new Date(Date.now() + REFRESH_MS).toISOString();
  refreshTimer = setTimeout(() => {
    runRefresh().catch(() => {}).finally(scheduleNext);
  }, REFRESH_MS);
}

// ─── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function checkAuth(req) {
  const auth = req.headers['authorization'] || '';
  return auth === `Bearer ${DASHBOARD_PW}`;
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return null; }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ─── Static file server ───────────────────────────────────────────────────────
const PAGE_ROUTES = {
  '/':              '/index.html',
  '':               '/index.html',
  '/dashboard':     '/dashboard/index.html',
  '/dashboard/':    '/dashboard/index.html',
  '/shop':          '/shop/index.html',
  '/shop/':         '/shop/index.html',
  '/product':       '/product/index.html',
  '/product/':      '/product/index.html',
  '/cart':          '/cart/index.html',
  '/cart/':         '/cart/index.html',
  '/checkout':      '/checkout/index.html',
  '/checkout/':     '/checkout/index.html',
  '/order-success': '/order-success/index.html',
  '/order-success/':'/order-success/index.html',
};

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  urlPath = PAGE_ROUTES[urlPath] || urlPath;

  const filePath = path.join(STATIC_ROOT, urlPath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ─── HTTP server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const { method, url } = req;
  const urlPath = url.split('?')[0];

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    });
    res.end(); return;
  }

  // ── GET /api/status ────────────────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/status') {
    return json(res, 200, { isRefreshing, lastRefreshed, nextRefresh });
  }

  // ── POST /api/refresh ──────────────────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/refresh') {
    if (!checkAuth(req))  return json(res, 401, { ok: false, error: 'Unauthorized' });
    if (isRefreshing)     return json(res, 409, { ok: false, busy: true, error: 'Refresh already in progress' });

    runRefresh()
      .then(() => { scheduleNext(); })
      .catch(() => {});

    return json(res, 202, { ok: true, message: 'Refresh started' });
  }

  // ── GET /api/products ──────────────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/products') {
    const products = readJSON(PRODUCTS_FILE);
    if (!products) return json(res, 500, { error: 'Products unavailable' });
    return json(res, 200, products);
  }

  // ── POST /api/create-payment-intent ────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/create-payment-intent') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { items, customer } = JSON.parse(body);
        const products = readJSON(PRODUCTS_FILE) || [];

        // Calculate total server-side — never trust client price
        let total = 0;
        for (const item of items) {
          const product = products.find(p => p.id === item.productId);
          if (!product) return json(res, 400, { error: `Unknown product: ${item.productId}` });
          const sizeAdj = product.sizes?.[item.sizeIndex]?.priceAdjust || 0;
          total += (product.price + sizeAdj) * (item.qty || 1);
        }

        const intent = await stripe.paymentIntents.create({
          amount:   total,
          currency: 'usd',
          metadata: {
            customerName:  customer?.name || '',
            customerEmail: customer?.email || '',
            items: JSON.stringify(items.map(i => ({
              productId:  i.productId,
              qty:        i.qty,
              engraving:  i.engraving || '',
              sizeIndex:  i.sizeIndex ?? 0,
            }))),
          },
        });

        return json(res, 200, {
          clientSecret: intent.client_secret,
          total,
          publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        });
      } catch (e) {
        console.error('[stripe] create-payment-intent error:', e.message);
        return json(res, 500, { error: e.message });
      }
    });
    return;
  }

  // ── POST /api/webhook ──────────────────────────────────────────────────────
  // Stripe requires raw body for signature verification — collect as Buffer
  if (method === 'POST' && urlPath === '/api/webhook') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      const sig     = req.headers['stripe-signature'];
      const secret  = process.env.STRIPE_WEBHOOK_SECRET;

      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, secret);
      } catch (e) {
        console.error('[webhook] Signature verification failed:', e.message);
        res.writeHead(400); res.end(`Webhook Error: ${e.message}`); return;
      }

      if (event.type === 'payment_intent.succeeded') {
        const intent  = event.data.object;
        const meta    = intent.metadata;
        let items = [];
        try { items = JSON.parse(meta.items || '[]'); } catch {}

        const products = readJSON(PRODUCTS_FILE) || [];
        const lineItems = items.map(i => {
          const p = products.find(pr => pr.id === i.productId) || {};
          const sizeAdj = p.sizes?.[i.sizeIndex]?.priceAdjust || 0;
          return {
            productId: i.productId,
            name:      p.name || i.productId,
            size:      p.sizes?.[i.sizeIndex]?.label || '',
            engraving: i.engraving || '',
            qty:       i.qty || 1,
            price:     (p.price || 0) + sizeAdj,
          };
        });

        const order = {
          id:                   `ord_${Date.now()}`,
          stripePaymentIntentId: intent.id,
          status:               'paid',
          createdAt:            new Date().toISOString(),
          customer: {
            name:  meta.customerName || '',
            email: meta.customerEmail || '',
          },
          items:  lineItems,
          total:  intent.amount,
        };

        const orders = readJSON(ORDERS_FILE) || [];
        orders.push(order);
        writeJSON(ORDERS_FILE, orders);
        console.log(`[webhook] Order saved: ${order.id} — $${(order.total / 100).toFixed(2)}`);
      }

      res.writeHead(200); res.end('ok');
    });
    return;
  }

  // ── GET /api/orders ────────────────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/orders') {
    if (!checkAuth(req)) return json(res, 401, { error: 'Unauthorized' });
    const orders = readJSON(ORDERS_FILE) || [];
    return json(res, 200, orders);
  }

  // ── PATCH /api/orders/:id ──────────────────────────────────────────────────
  if (method === 'PATCH' && urlPath.startsWith('/api/orders/')) {
    if (!checkAuth(req)) return json(res, 401, { error: 'Unauthorized' });
    const orderId = urlPath.replace('/api/orders/', '');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body);
        const orders = readJSON(ORDERS_FILE) || [];
        const idx = orders.findIndex(o => o.id === orderId);
        if (idx === -1) return json(res, 404, { error: 'Order not found' });
        orders[idx].status = status;
        writeJSON(ORDERS_FILE, orders);
        return json(res, 200, orders[idx]);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    });
    return;
  }

  // ── Static files ───────────────────────────────────────────────────────────
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\nGraft Wild server running at http://localhost:${PORT}`);
  console.log(`  Public site : http://localhost:${PORT}`);
  console.log(`  Dashboard   : http://localhost:${PORT}/dashboard`);
  console.log(`  Shop        : http://localhost:${PORT}/shop`);
  console.log(`  Auto-refresh: every 12 hours\n`);

  runRefresh()
    .catch(err => console.error('[refresh] Startup refresh failed:', err.message))
    .finally(scheduleNext);
});
