'use strict';

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { spawn, exec } = require('child_process');
const Busboy    = require('busboy');
const ffmpeg    = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const Anthropic  = require('@anthropic-ai/sdk');
const axios      = require('axios');

// ─── Load .env ────────────────────────────────────────────────────────────────
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
} catch { /* .env optional */ }

// ─── Stripe ───────────────────────────────────────────────────────────────────
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || '');

// ─── Claude / Anthropic ────────────────────────────────────────────────────────
const anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
ffmpeg.setFfmpegPath(ffmpegPath);

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const DASHBOARD_PW  = process.env.DASHBOARD_PASSWORD || 'graftwild2026';
const STATIC_ROOT   = __dirname;
const IG_TOOL_DIR   = path.join(__dirname, 'ig-tool');
const PRODUCTS_FILE     = path.join(__dirname, 'data', 'products.json');
const ORDERS_FILE       = path.join(__dirname, 'data', 'orders.json');
const SUBSCRIBERS_FILE  = path.join(__dirname, 'data', 'subscribers.json');
const REFRESH_MS    = 12 * 60 * 60 * 1000;     // 12 hours

// ─── Content Studio paths ──────────────────────────────────────────────────────
const TEMP_DIR           = path.join(__dirname, 'ig-tool', 'temp');
const STYLE_PROFILE_DIR  = path.join(__dirname, 'ig-tool', 'style-profiles');
const REMOTION_CLIPS_DIR = path.join(__dirname, 'remotion-engine', 'clips');
[TEMP_DIR, STYLE_PROFILE_DIR, REMOTION_CLIPS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

const WHISPER_BIN = (() => {
  const candidates = [
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/whisper',
    '/opt/homebrew/bin/whisper',
    '/usr/local/bin/whisper',
    'whisper',
  ];
  for (const c of candidates) {
    try {
      if (c.startsWith('/')) { if (fs.existsSync(c)) return c; }
      else { require('child_process').execSync(`which ${c}`, { stdio: 'ignore' }); return c; }
    } catch {}
  }
  return null;
})();

const GDOWN_BIN = (() => {
  const candidates = [
    '/Library/Frameworks/Python.framework/Versions/3.11/bin/gdown',
    '/opt/homebrew/bin/gdown',
    '/usr/local/bin/gdown',
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return 'gdown';
})();

const FFPROBE_BIN = ffmpegPath.replace('ffmpeg', 'ffprobe');

const STUDIO_SYSTEM_PROMPT = `You are analyzing a short-form social media video (Instagram Reel or TikTok) from the brand Graftwild. The brand style is minimal, deadpan, ASMR-forward backyard chicken keeping and homesteading content. Analyze every frame and the audio transcript and return a structured JSON style breakdown with these exact fields:
{
"hook": { "description": "what happens in the first 1-3 seconds", "hook_type": "visual | audio | text | combined", "timestamp": "0:00" },
"text_overlays": [{ "timestamp": "0:00", "text": "exact text on screen", "font_style": "your best description", "position": "top | center | bottom | top-left etc", "duration_seconds": 0, "emoji": "any emoji used or null" }],
"zooms": [{ "timestamp": "0:00", "direction": "in | out", "speed": "slow | medium | fast", "subject": "what is being zoomed into" }],
"audio": { "type": "asmr | voiceover | music | ambient | silent | mixed", "key_sound_moments": [{ "timestamp": "0:00", "description": "what sound is happening and why it works" }], "silence_moments": ["list any intentional silent gaps with timestamps"] },
"pacing": { "overall": "slow | medium | fast", "cut_timestamps": ["list every cut timestamp"], "rhythm_description": "describe the overall pacing feel" },
"caption_style": { "density": "minimal | moderate | heavy", "tone": "deadpan | informational | emotional | humorous", "example_caption": "if visible or inferable" },
"style_fingerprint": "A 3-5 sentence summary of what makes this video feel like Graftwild content"
}
Return only valid JSON. No preamble, no explanation.`;

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

  // ── POST /api/analyze-video ────────────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/analyze-video') {
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return json(res, 400, { error: 'Expected multipart/form-data' });

    const bb = Busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 } });
    let uploadPath = null, originalName = 'video', fileError = null, videoTitle = '';

    bb.on('field', (name, val) => { if (name === 'label') videoTitle = val.trim(); });
    bb.on('file', (_field, stream, info) => {
      const ext = path.extname(info.filename).toLowerCase();
      if (!['.mp4', '.mov', '.m4v'].includes(ext)) { fileError = `Unsupported file type: ${ext}`; stream.resume(); return; }
      originalName = info.filename;
      uploadPath = path.join(TEMP_DIR, `upload_${Date.now()}${ext}`);
      stream.pipe(fs.createWriteStream(uploadPath));
    });
    bb.on('finish', () => {
      if (fileError) return json(res, 400, { error: fileError });
      if (!uploadPath) return json(res, 400, { error: 'No video file received' });
      if (!WHISPER_BIN) return json(res, 500, { error: 'Whisper not found on this machine' });

      const baseName   = path.parse(originalName).name.replace(/[^a-z0-9_-]/gi, '_');
      const outputDir  = path.join(TEMP_DIR, baseName);
      fs.mkdirSync(outputDir, { recursive: true });
      const audioPath  = path.join(outputDir, `${baseName}_audio.wav`);
      const framePattern = path.join(outputDir, 'frame_%04d.jpg');

      const framesPromise = new Promise((resolve, reject) => {
        ffmpeg(uploadPath).outputOptions(['-vf', 'fps=6,scale=960:-1', '-q:v', '8']).output(framePattern)
          .on('end', () => resolve(fs.readdirSync(outputDir).filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).length))
          .on('error', reject).run();
      });

      const whisperPromise = new Promise((resolve, reject) => {
        ffmpeg(uploadPath).noVideo().audioCodec('pcm_s16le').output(audioPath)
          .on('end', () => {
            const ffmpegDir  = path.dirname(ffmpegPath);
            const whisperEnv = { ...process.env, PATH: `${ffmpegDir}:${process.env.PATH}` };
            const cmd = `"${WHISPER_BIN}" "${audioPath}" --model small --output_format json --output_dir "${outputDir}"`;
            exec(cmd, { maxBuffer: 50 * 1024 * 1024, env: whisperEnv }, (err, _out, stderr) => {
              if (err) return reject(new Error(`Whisper failed: ${stderr || err.message}`));
              let segments = [];
              try {
                const raw = JSON.parse(fs.readFileSync(path.join(outputDir, `${baseName}_audio.json`), 'utf8'));
                segments = (raw.segments || []).map(s => ({ start: s.start, end: s.end, text: s.text.trim() }));
              } catch (e) { console.error('Whisper parse error:', e.message); }
              resolve(segments);
            });
          })
          .on('error', reject).run();
      });

      Promise.all([framesPromise, whisperPromise])
        .then(([, segments]) => {
          fs.unlink(uploadPath, () => {});
          studioRunClaudeAnalysis({ outputDir, baseName, title: videoTitle, segments, res });
        })
        .catch(err => {
          fs.unlink(uploadPath, () => {});
          json(res, 500, { error: err.message });
        });
    });
    bb.on('error', err => json(res, 500, { error: err.message }));
    req.pipe(bb);
    return;
  }

  // ── GET /api/style-profiles ────────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/style-profiles') {
    try {
      const files = fs.readdirSync(STYLE_PROFILE_DIR).filter(f => f.endsWith('.json') && f !== 'style-master.json');
      return json(res, 200, files.map(filename => ({
        filename,
        data: JSON.parse(fs.readFileSync(path.join(STYLE_PROFILE_DIR, filename), 'utf8')),
      })));
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  // ── PATCH /api/style-profiles/:filename ───────────────────────────────────
  if (method === 'PATCH' && urlPath.startsWith('/api/style-profiles/')) {
    const filename = path.basename(urlPath.replace('/api/style-profiles/', ''));
    if (!filename.endsWith('.json') || filename === 'style-master.json') return json(res, 400, { error: 'Invalid filename' });
    const profilePath = path.join(STYLE_PROFILE_DIR, filename);
    if (!profilePath.startsWith(STYLE_PROFILE_DIR + path.sep)) return json(res, 403, { error: 'Forbidden' });
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { title } = JSON.parse(body);
        if (typeof title !== 'string' || !title.trim()) return json(res, 400, { error: 'title must be a non-empty string' });
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        profile.title = title.trim();
        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
        return json(res, 200, { success: true, title: profile.title });
      } catch (e) { return json(res, e.code === 'ENOENT' ? 404 : 500, { error: e.message }); }
    });
    return;
  }

  // ── GET /api/style-master ──────────────────────────────────────────────────
  if (method === 'GET' && urlPath === '/api/style-master') {
    (async () => {
      try {
        const files = fs.readdirSync(STYLE_PROFILE_DIR).filter(f => f.endsWith('.json') && f !== 'style-master.json');
        if (files.length < 2) return json(res, 400, { error: 'Upload and analyze at least 2 videos first' });
        const profiles = files.map(f => ({ filename: f, data: JSON.parse(fs.readFileSync(path.join(STYLE_PROFILE_DIR, f), 'utf8')) }));
        console.log(`[style-master] synthesizing from ${profiles.length} profiles...`);
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514', max_tokens: 4096,
          messages: [{ role: 'user', content: `Synthesize a master style guide JSON from these Graftwild video profiles. Return only valid JSON.\n\n${JSON.stringify(profiles, null, 2)}` }],
        });
        const textBlock = message.content.find(b => b.type === 'text');
        if (!textBlock) throw new Error('No text in Claude response');
        const masterProfile = JSON.parse(textBlock.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
        fs.writeFileSync(path.join(STYLE_PROFILE_DIR, 'style-master.json'), JSON.stringify(masterProfile, null, 2));
        return json(res, 200, masterProfile);
      } catch (e) { return json(res, 500, { error: e.message }); }
    })();
    return;
  }

  // ── POST /api/download-clips ───────────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/download-clips') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const jsonErr = (status, msg) => { if (!res.headersSent) json(res, status, { error: msg }); };

      let drive_url, project_name;
      try { ({ drive_url, project_name } = JSON.parse(body)); } catch { return jsonErr(400, 'Invalid JSON body'); }
      if (!drive_url || typeof drive_url !== 'string') return jsonErr(400, 'drive_url is required');
      if (!project_name || !/^[a-z0-9_-]+$/i.test(project_name)) return jsonErr(400, 'project_name must contain only letters, numbers, hyphens, underscores');

      let clipsDir;
      try { clipsDir = path.join(REMOTION_CLIPS_DIR, path.basename(project_name)); fs.mkdirSync(clipsDir, { recursive: true }); }
      catch (e) { return jsonErr(500, 'Could not create clips directory: ' + e.message); }

      const folderIdMatch = drive_url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      const folderId = folderIdMatch ? folderIdMatch[1] : null;
      console.log(`[download-clips] project="${project_name}" folderId="${folderId}"`);
      if (!folderId) return jsonErr(400, 'Could not extract folder ID from Google Drive URL');

      downloadFolderAndProbe(folderId, clipsDir, project_name, jsonErr);

      async function downloadFolderAndProbe(folderID, dir, projName, onErr) {
        let fileList;
        try {
          const folderUrl = `https://drive.google.com/drive/folders/${folderID}`;
          console.log(`[download-clips] fetching folder page: ${folderUrl}`);
          const resp = await axios.get(folderUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
            maxRedirects: 5, timeout: 20000,
          });
          const html = resp.data;
          console.log(`[download-clips] folder page: ${html.length} bytes`);
          const files = [], seen = new Set();
          const patterns = [
            /\["([a-zA-Z0-9_-]{25,})",\s*"",\s*"([^"]+\.(mp4|mov|m4v|mkv|webm))"/gi,
            /\["([a-zA-Z0-9_-]{25,})",null,"([^"]+\.(mp4|mov|m4v|mkv|webm))"/gi,
          ];
          for (const pat of patterns) {
            let m;
            while ((m = pat.exec(html)) !== null) {
              if (!seen.has(m[1])) { seen.add(m[1]); files.push({ id: m[1], name: m[2] }); }
            }
          }
          // Fallback: find video filenames and look backwards for adjacent ID
          const nameRe = /"([^"]+\.(mp4|mov|m4v|mkv|webm))"/gi;
          let nm;
          while ((nm = nameRe.exec(html)) !== null) {
            const before = html.slice(Math.max(0, nm.index - 200), nm.index);
            const idM = before.match(/([a-zA-Z0-9_-]{25,})/g);
            if (idM) { const id = idM[idM.length - 1]; if (!seen.has(id)) { seen.add(id); files.push({ id, name: nm[1] }); } }
          }
          fileList = files;
          console.log(`[download-clips] found ${fileList.length} video(s):`, fileList.map(f => f.name));
        } catch (e) {
          console.error('[download-clips] folder parse error:', e.message);
          return onErr(500, `Could not list folder contents: ${e.message}`);
        }

        if (!fileList.length) { json(res, 200, { status: 'clips_ready', project_name: projName, clips: [] }); return; }

        let failed = 0;
        for (const file of fileList) {
          const outPath = path.join(dir, file.name);
          try {
            const dlUrl = `https://drive.usercontent.google.com/download?id=${file.id}&export=download&confirm=t`;
            console.log(`[download-clips] downloading "${file.name}" (id=${file.id})`);
            const dlResp = await axios({ method: 'get', url: dlUrl, responseType: 'stream', timeout: 300000, maxRedirects: 10,
              headers: { 'User-Agent': 'Mozilla/5.0' } });
            await new Promise((resolve, reject) => {
              const w = fs.createWriteStream(outPath);
              dlResp.data.pipe(w); w.on('finish', resolve); w.on('error', reject); dlResp.data.on('error', reject);
            });
            console.log(`[download-clips] ✓ saved "${file.name}"`);
          } catch (e) {
            console.warn(`[download-clips] axios failed for "${file.name}": ${e.message}, trying curl...`);
            try {
              const curlUrl = `https://drive.usercontent.google.com/download?id=${file.id}&export=download&confirm=t`;
              await new Promise((resolve, reject) => {
                exec(`curl -L --silent --show-error --max-time 300 "${curlUrl}" -o "${outPath}"`,
                  { maxBuffer: 1024 * 1024 }, (err, _, stderr) => err ? reject(new Error(stderr || err.message)) : resolve());
              });
              console.log(`[download-clips] ✓ curl saved "${file.name}"`);
            } catch (ce) { console.error(`[download-clips] ✗ failed "${file.name}": ${ce.message}`); failed++; }
          }
        }

        if (failed === fileList.length) return onErr(500, `All ${failed} file downloads failed. Check console for details.`);

        // Probe durations
        const videoFiles = fs.readdirSync(dir).filter(f => /\.(mp4|mov|m4v|mkv|webm)$/i.test(f));
        let remaining = videoFiles.length;
        const clips = [];
        videoFiles.forEach(filename => {
          const filepath = path.join(dir, filename);
          const size_mb  = parseFloat((fs.statSync(filepath).size / (1024 * 1024)).toFixed(1));
          exec(`"${FFPROBE_BIN}" -v quiet -print_format json -show_streams "${filepath}"`, { maxBuffer: 1024 * 1024 }, (pErr, pOut) => {
            let duration_seconds = null;
            if (!pErr) { try { const s = (JSON.parse(pOut).streams || []).find(s => s.duration); if (s) duration_seconds = parseFloat(parseFloat(s.duration).toFixed(2)); } catch {} }
            clips.push({ filename, size_mb, duration_seconds });
            if (--remaining === 0) {
              clips.sort((a, b) => a.filename.localeCompare(b.filename));
              json(res, 200, { status: 'clips_ready', project_name: projName, clips });
            }
          });
        });
      }
    });
    return;
  }

  // ── POST /api/subscribe ────────────────────────────────────────────────────
  if (method === 'POST' && urlPath === '/api/subscribe') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { email } = JSON.parse(body);
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json(res, 400, { ok: false, error: 'Invalid email address' });
        }

        // Save subscriber (skip duplicates)
        const subscribers = readJSON(SUBSCRIBERS_FILE) || [];
        if (!subscribers.some(s => s.email.toLowerCase() === email.toLowerCase())) {
          subscribers.push({ email, subscribedAt: new Date().toISOString() });
          writeJSON(SUBSCRIBERS_FILE, subscribers);
        }

        // Send WILD10 email
        const transporter = nodemailer.createTransport({
          host:   process.env.SMTP_HOST,
          port:   parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_PORT === '465',
          auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });

        await transporter.sendMail({
          from:    process.env.SMTP_FROM || 'Graftwild <partnerships@graftwild.com>',
          to:      email,
          subject: 'Your 10% off — welcome to the wild side.',
          html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#1C1F17;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#1C1F17;padding:48px 24px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;">
        <tr><td style="padding-bottom:32px;border-bottom:1px solid rgba(245,240,232,0.1);">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,240,232,0.4);">GRAFTWILD</p>
        </td></tr>
        <tr><td style="padding:40px 0 24px;">
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:36px;font-weight:300;line-height:1.15;color:#F5F0E8;letter-spacing:-0.02em;">Welcome to<br><em>the wild side.</em></h1>
          <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;font-weight:300;line-height:1.7;color:rgba(245,240,232,0.55);">Here's your 10% off code for your first order. Use it at checkout — no expiry, no fine print.</p>
        </td></tr>
        <tr><td style="padding:24px 0 40px;">
          <div style="display:inline-block;border:1px solid rgba(245,240,232,0.35);padding:18px 36px;text-align:center;">
            <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;font-weight:500;letter-spacing:0.25em;text-transform:uppercase;color:rgba(245,240,232,0.35);">Your discount code</p>
            <p style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:400;letter-spacing:0.12em;color:#F5F0E8;">WILD10</p>
          </div>
        </td></tr>
        <tr><td style="padding-top:32px;border-top:1px solid rgba(245,240,232,0.08);">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;font-weight:300;line-height:1.7;color:rgba(245,240,232,0.25);">Big Pine Key, Florida Keys &nbsp;·&nbsp; <a href="https://graftwild.com" style="color:rgba(245,240,232,0.35);">graftwild.com</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
        });

        console.log(`[subscribe] Sent WILD10 to ${email}`);
        return json(res, 200, { ok: true });
      } catch (e) {
        console.error('[subscribe] error:', e.message);
        return json(res, 500, { ok: false, error: 'Could not send email — check SMTP config' });
      }
    });
    return;
  }

  // ── Static files ───────────────────────────────────────────────────────────
  serveStatic(req, res);
});

// ─── Claude video analysis ────────────────────────────────────────────────────
async function studioRunClaudeAnalysis({ outputDir, baseName, title, segments, res }) {
  try {
    const allFrames = fs.readdirSync(outputDir).filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
    const sizes = allFrames.map(f => fs.statSync(path.join(outputDir, f)).size);
    const kept = [];
    for (let i = 0; i < allFrames.length; i++) {
      if (i === 0 || i === allFrames.length - 1) { kept.push(allFrames[i]); continue; }
      if (Math.abs(sizes[i] - sizes[i - 1]) / sizes[i - 1] > 0.05) kept.push(allFrames[i]);
    }
    const frameFiles = kept.length <= 60 ? kept
      : Array.from({ length: 60 }, (_, i) => kept[Math.round(i * (kept.length - 1) / 59)]);
    console.log(`[studio] frames: ${allFrames.length} total → ${kept.length} deduped → ${frameFiles.length} sent`);

    const transcript = segments.length
      ? segments.map(s => `[${s.start.toFixed(2)}s→${s.end.toFixed(2)}s] ${s.text}`).join('\n')
      : '(no speech detected)';

    const content = [];
    for (const f of frameFiles) {
      const n = parseInt(f.replace('frame_', '').replace('.jpg', ''), 10);
      const secs = (n - 1) / 6;
      content.push({ type: 'text', text: `Frame at ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fs.readFileSync(path.join(outputDir, f)).toString('base64') } });
    }
    content.push({ type: 'text', text: `Audio transcript:\n${transcript}\n\nNow return the JSON style breakdown.` });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4096,
      system: STUDIO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock) throw new Error('No text in Claude response');
    const styleProfile = JSON.parse(textBlock.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
    styleProfile.title = title || baseName.replace(/[_-]+/g, ' ');
    fs.writeFileSync(path.join(STYLE_PROFILE_DIR, `${baseName}.json`), JSON.stringify(styleProfile, null, 2));
    fs.rmSync(outputDir, { recursive: true, force: true });
    console.log(`[studio] profile saved: ${baseName}.json`);
    json(res, 200, styleProfile);
  } catch (err) {
    const status  = err.status || err.statusCode || null;
    const detail  = err.error?.error?.message || null;
    console.error('[studio] Claude error:', status ? `HTTP ${status}` : '', err.message);
    fs.rmSync(outputDir, { recursive: true, force: true });
    json(res, 500, { error: status ? `Claude API error ${status}: ${detail || err.message}` : err.message });
  }
}

server.listen(PORT, () => {
  console.log(`\nGraftwild server running at http://localhost:${PORT}`);
  console.log(`  Public site : http://localhost:${PORT}`);
  console.log(`  Dashboard   : http://localhost:${PORT}/dashboard`);
  console.log(`  Shop        : http://localhost:${PORT}/shop`);
  console.log(`  Auto-refresh: every 12 hours\n`);

  runRefresh()
    .catch(err => console.error('[refresh] Startup refresh failed:', err.message))
    .finally(scheduleNext);
});
