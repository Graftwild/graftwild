'use strict';

// ─── Config ──────────────────────────────────────────────────────────────────
// Change this password to whatever you want
const DASHBOARD_PASSWORD = 'graftwild2026';
const DATA_PATH = '/ig-tool/data/dashboard-data.json';

// ─── Auth ─────────────────────────────────────────────────────────────────────
const gate   = document.getElementById('gate');
const app    = document.getElementById('app');
const pwInput = document.getElementById('pw-input');
const pwBtn   = document.getElementById('pw-btn');
const pwError = document.getElementById('pw-error');

function unlock() {
  if (pwInput.value === DASHBOARD_PASSWORD) {
    localStorage.setItem('gw_unlocked', '1');
    gate.style.display = 'none';
    app.style.display  = 'flex';
    init();
  } else {
    pwError.textContent = 'Incorrect password.';
    pwInput.value = '';
    pwInput.focus();
    pwInput.style.borderColor = '#c85a2a';
    setTimeout(() => { pwInput.style.borderColor = ''; }, 1500);
  }
}

pwBtn.addEventListener('click', unlock);
pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') unlock(); });

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('gw_unlocked');
  app.style.display = 'none';
  gate.style.display = 'flex';
  pwInput.value = '';
  pwError.textContent = '';
});

// Resume session
if (localStorage.getItem('gw_unlocked')) {
  gate.style.display = 'none';
  app.style.display  = 'flex';
  init();
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  renderKanban();
  renderDeals();
  renderCalendar();
  await loadAnalytics();
  initRefreshUI();
  loadOrders();
}

// ─── Refresh UI ───────────────────────────────────────────────────────────────
let refreshStatusInterval = null;

function initRefreshUI() {
  // Inject button + status row into the analytics tab before the loading indicator
  const panel = document.getElementById('tab-analytics');
  const bar = document.createElement('div');
  bar.id = 'refresh-bar';
  bar.style.cssText = 'display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;';
  bar.innerHTML = `
    <button id="refresh-btn" style="
      padding:0.5rem 1.1rem;
      background:transparent;
      border:1px solid var(--gold);
      color:var(--gold);
      border-radius:var(--radius);
      font-family:var(--font-body);
      font-size:0.72rem;
      font-weight:600;
      letter-spacing:0.12em;
      text-transform:uppercase;
      cursor:pointer;
      transition:background 0.2s,color 0.2s;
    ">↻ Refresh Now</button>
    <span id="refresh-status" style="font-size:0.72rem;color:var(--text-dim);"></span>`;
  panel.insertBefore(bar, panel.firstChild);

  const btn = document.getElementById('refresh-btn');
  btn.addEventListener('mouseenter', () => { if (!btn.disabled) { btn.style.background = 'var(--gold)'; btn.style.color = 'var(--black)'; } });
  btn.addEventListener('mouseleave', () => { if (!btn.disabled) { btn.style.background = 'transparent'; btn.style.color = 'var(--gold)'; } });
  btn.addEventListener('click', triggerRefresh);

  // Poll /api/status every 5s to keep display current while refreshing
  updateRefreshStatus();
  refreshStatusInterval = setInterval(updateRefreshStatus, 5000);
}

async function updateRefreshStatus() {
  try {
    const res  = await fetch('/api/status');
    if (!res.ok) throw new Error();
    const data = await res.json();
    const statusEl = document.getElementById('refresh-status');
    const btn      = document.getElementById('refresh-btn');
    if (!statusEl || !btn) return;

    if (data.isRefreshing) {
      setRefreshBtn('Fetching...', true);
      statusEl.textContent = 'Pulling fresh data from Instagram…';
    } else {
      setRefreshBtn('↻ Refresh Now', false);
      const parts = [];
      if (data.lastRefreshed) {
        parts.push('Last fetched: ' + new Date(data.lastRefreshed).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      }
      if (data.nextRefresh) {
        parts.push('Next auto: ' + new Date(data.nextRefresh).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      }
      statusEl.textContent = parts.join('  ·  ');
    }
  } catch {
    // Server not running — hide the bar gracefully
    const bar = document.getElementById('refresh-bar');
    if (bar) bar.style.display = 'none';
    clearInterval(refreshStatusInterval);
  }
}

function setRefreshBtn(text, disabled) {
  const btn = document.getElementById('refresh-btn');
  if (!btn) return;
  btn.textContent = text;
  btn.disabled    = disabled;
  btn.style.opacity = disabled ? '0.5' : '1';
  btn.style.cursor  = disabled ? 'default' : 'pointer';
  if (disabled) { btn.style.background = 'transparent'; btn.style.color = 'var(--gold)'; }
}

async function triggerRefresh() {
  const btn = document.getElementById('refresh-btn');
  if (btn?.disabled) return;

  try {
    setRefreshBtn('Starting...', true);
    const res = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DASHBOARD_PASSWORD}` },
    });
    if (res.status === 409) {
      flashBtn('Already running…');
      return;
    }
    if (res.status === 401) {
      flashBtn('✗ Auth error');
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Refresh started — poll status, then reload analytics when done
    document.getElementById('refresh-status').textContent = 'Pulling fresh data from Instagram…';
    setRefreshBtn('Fetching...', true);
    waitForRefreshDone();
  } catch {
    flashBtn('✗ Server unreachable');
  }
}

function waitForRefreshDone() {
  const poll = setInterval(async () => {
    try {
      const res  = await fetch('/api/status');
      const data = await res.json();
      if (!data.isRefreshing) {
        clearInterval(poll);
        await loadAnalytics();
        flashBtn('✓ Updated', 'success');
        updateRefreshStatus();
      }
    } catch {
      clearInterval(poll);
      flashBtn('✗ Failed');
    }
  }, 4000);
}

function flashBtn(text, type) {
  const btn = document.getElementById('refresh-btn');
  if (!btn) return;
  const origColor  = btn.style.color;
  const origBorder = btn.style.borderColor;
  btn.disabled    = false;
  btn.textContent = text;
  btn.style.opacity = '1';
  btn.style.cursor  = 'pointer';
  if (type === 'success') {
    btn.style.color = 'var(--green-light)';
    btn.style.borderColor = 'var(--green-light)';
  } else {
    btn.style.color = '#c85a2a';
    btn.style.borderColor = '#c85a2a';
  }
  setTimeout(() => {
    btn.textContent = '↻ Refresh Now';
    btn.style.color = origColor || 'var(--gold)';
    btn.style.borderColor = origBorder || 'var(--gold)';
    btn.style.background = 'transparent';
  }, 3000);
}

// ─── Analytics ────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const res  = await fetch(DATA_PATH + '?t=' + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    document.getElementById('analytics-loading').style.display = 'none';
    document.getElementById('analytics-content').style.display = 'block';
    document.getElementById('last-updated').textContent =
      'Data as of ' + new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    renderProfile(data.account.profile);
    renderStats(data.account);
    renderChart(data.account.insightsByDay);
    renderTopTable(data.media.topByEngagement);
  } catch (err) {
    document.getElementById('analytics-loading').textContent =
      'Could not load analytics data. Run: npm run all inside ig-tool/ first.';
  }
}

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function renderProfile(p) {
  document.getElementById('profile-bar').innerHTML = `
    <img class="profile-pic" src="${p.profilePicture || ''}" alt="@${p.username}" onerror="this.style.display='none'"/>
    <div class="profile-info">
      <h2>@${p.username}</h2>
      <p>${p.name} &nbsp;·&nbsp; ${p.bio?.split('\n')[0] || ''}</p>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><strong>${fmt(p.followers)}</strong><span>Followers</span></div>
      <div class="profile-stat"><strong>${fmt(p.following)}</strong><span>Following</span></div>
      <div class="profile-stat"><strong>${p.totalPosts}</strong><span>Posts</span></div>
    </div>`;
}

function renderStats(account) {
  const { last7Days, last30Days, trends } = account;
  const trendHtml = (val) => {
    if (val == null) return '';
    const cls = val > 0 ? 'up' : val < 0 ? 'down' : 'flat';
    const arrow = val > 0 ? '↑' : val < 0 ? '↓' : '→';
    return `<div class="stat-trend ${cls}">${arrow} ${Math.abs(val)}% vs prev week</div>`;
  };
  const cards = [
    { label: '7-Day Reach',      value: fmt(last7Days.reach),           trend: trendHtml(trends.reach) },
    { label: '30-Day Reach',     value: fmt(last30Days.reach),          trend: '' },
    { label: 'Avg Daily Reach',  value: fmt(last30Days.avgDailyReach),  trend: '' },
    { label: '7-Day Impressions',value: fmt(last7Days.impressions) || fmt(last7Days.reach), trend: '' },
  ];
  document.getElementById('stat-grid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
      ${c.trend}
    </div>`).join('');
}

function renderChart(insightsByDay) {
  const canvas = document.getElementById('reach-chart');
  const ctx    = canvas.getContext('2d');
  const dpr    = window.devicePixelRatio || 1;

  const days  = Object.keys(insightsByDay).sort().slice(-30);
  const values = days.map(d => insightsByDay[d]?.reach || 0);
  const maxVal = Math.max(...values, 1);

  // Size canvas
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width - 32; // account for padding
  const H = 160;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const padL = 48, padR = 12, padT = 12, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Grid lines
  ctx.strokeStyle = 'rgba(42,42,36,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
    const label = fmt(Math.round(maxVal * (1 - i / 4)));
    ctx.fillStyle = 'rgba(90,90,78,0.8)';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(label, padL - 4, y + 3.5);
  }

  // Build path
  const barW = chartW / days.length;
  const pts = values.map((v, i) => ({
    x: padL + i * barW + barW / 2,
    y: padT + chartH - (v / maxVal) * chartH,
  }));

  // Fill gradient
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0,   'rgba(90,153,84,0.35)');
  grad.addColorStop(1,   'rgba(90,153,84,0.02)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT + chartH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#5a9954';
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.stroke();

  // Dots on first and last + max
  const maxIdx = values.indexOf(maxVal);
  [0, maxIdx, pts.length - 1].forEach(i => {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, 3, 0, Math.PI * 2);
    ctx.fillStyle = i === maxIdx ? '#c8922a' : '#5a9954';
    ctx.fill();
  });

  // X-axis date labels (first, middle, last)
  ctx.fillStyle = 'rgba(90,90,78,0.8)';
  ctx.font = '9px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  [0, Math.floor(days.length / 2), days.length - 1].forEach(i => {
    const d = days[i];
    if (!d) return;
    const label = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    ctx.fillText(label, pts[i].x, H - 6);
  });
}

function badgeHtml(type) {
  const map = { REEL: ['badge-reel','Reel'], IMAGE: ['badge-image','Photo'], CAROUSEL_ALBUM: ['badge-carousel','Album'] };
  const [cls, label] = map[type] || ['badge-image', type];
  return `<span class="post-type-badge ${cls}">${label}</span>`;
}

function renderPosts(posts) {
  if (!posts?.length) return;
  document.getElementById('post-grid').innerHTML = posts.map(p => `
    <div class="post-thumb">
      <div class="post-thumb-img">
        ${p.thumbnail
          ? `<img src="${p.thumbnail}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='📷'" />`
          : (p.type === 'REEL' ? '🎬' : '📷')}
      </div>
      <div class="post-thumb-body">
        ${badgeHtml(p.type)}
        <div class="post-stat-row">
          <span>❤ ${fmt(p.stats.likes)}</span>
          <span>💬 ${fmt(p.stats.comments)}</span>
          <span>📤 ${fmt(p.stats.shares)}</span>
        </div>
        <div class="post-stat-row" style="margin-top:0.2rem">
          <span>👁 ${fmt(p.stats.reach)}</span>
          ${p.stats.engagementRate != null ? `<span style="color:var(--gold-pale)">${p.stats.engagementRate}%</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function renderTopTable(posts) {
  if (!posts?.length) return;
  document.getElementById('top-table-body').innerHTML = posts.map((p, i) => `
    <tr>
      <td style="color:var(--text-dim)">${i + 1}</td>
      <td>${badgeHtml(p.type)}</td>
      <td class="caption-cell">${p.caption || '—'}</td>
      <td>${fmt(p.stats.likes)}</td>
      <td>${fmt(p.stats.comments)}</td>
      <td>${fmt(p.stats.shares)}</td>
      <td>${fmt(p.stats.saved)}</td>
      <td>${fmt(p.stats.reach)}</td>
      <td style="color:var(--gold)">${p.stats.engagementRate != null ? p.stats.engagementRate + '%' : '—'}</td>
      <td><a href="${p.permalink}" target="_blank" rel="noopener">↗</a></td>
    </tr>`).join('');
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Content Ideas (Kanban) ────────────────────────────────────────────────────
const COLS = ['Ideas', 'Planned', 'Shot', 'Posted'];
const COL_KEYS = COLS.map(c => c.toLowerCase());

function loadIdeas() {
  try { return JSON.parse(localStorage.getItem('gw_ideas') || '[]'); }
  catch { return []; }
}

function saveIdeas(ideas) {
  localStorage.setItem('gw_ideas', JSON.stringify(ideas));
}

function renderKanban() {
  const ideas = loadIdeas();
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = COLS.map((col, ci) => {
    const colKey  = COL_KEYS[ci];
    const colIdeas = ideas.filter(i => i.status === colKey);
    return `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <span class="kanban-col-title">${col}</span>
          <span class="kanban-count">${colIdeas.length}</span>
        </div>
        <div class="kanban-cards">
          ${colIdeas.map(idea => ideaCardHtml(idea, ci)).join('') || ''}
        </div>
      </div>`;
  }).join('');
}

function ideaCardHtml(idea, colIdx) {
  const prevCol = colIdx > 0 ? `<button class="btn-move" data-id="${idea.id}" data-dir="-1">← ${COLS[colIdx-1]}</button>` : '';
  const nextCol = colIdx < COLS.length - 1 ? `<button class="btn-move" data-id="${idea.id}" data-dir="1">${COLS[colIdx+1]} →</button>` : '';
  return `
    <div class="idea-card" data-id="${idea.id}">
      <div class="idea-card-type">${escHtml(idea.type)}</div>
      <div class="idea-card-title">${escHtml(idea.title)}</div>
      ${idea.notes ? `<div class="idea-card-notes">${escHtml(idea.notes)}</div>` : ''}
      <div class="idea-card-actions">
        ${prevCol}${nextCol}
        <button class="btn-delete" data-id="${idea.id}" title="Delete">✕</button>
      </div>
    </div>`;
}

document.getElementById('kanban').addEventListener('click', e => {
  const btn = e.target.closest('[data-id]');
  if (!btn) return;
  const id = btn.dataset.id;
  const ideas = loadIdeas();
  if (btn.classList.contains('btn-delete')) {
    if (!confirm('Delete this idea?')) return;
    saveIdeas(ideas.filter(i => i.id !== id));
  } else if (btn.classList.contains('btn-move')) {
    const dir = parseInt(btn.dataset.dir, 10);
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    const curIdx = COL_KEYS.indexOf(idea.status);
    const newIdx = Math.max(0, Math.min(COLS.length - 1, curIdx + dir));
    idea.status = COL_KEYS[newIdx];
    saveIdeas(ideas);
  }
  renderKanban();
});

document.getElementById('idea-form').addEventListener('submit', e => {
  e.preventDefault();
  const title = document.getElementById('idea-title').value.trim();
  if (!title) return;
  const ideas = loadIdeas();
  ideas.push({
    id:     Date.now().toString(),
    title,
    type:   document.getElementById('idea-type').value,
    notes:  document.getElementById('idea-notes').value.trim(),
    status: 'ideas',
    created: new Date().toISOString(),
  });
  saveIdeas(ideas);
  renderKanban();
  e.target.reset();
  document.getElementById('idea-title').focus();
});

// ─── Brand Deals ──────────────────────────────────────────────────────────────
let editingDealId = null;

function loadDeals() {
  try { return JSON.parse(localStorage.getItem('gw_deals') || '[]'); }
  catch { return []; }
}

function saveDeals(deals) {
  localStorage.setItem('gw_deals', JSON.stringify(deals));
}

const STATUS_ORDER = ['active', 'negotiating', 'outreach', 'complete'];

function renderDeals() {
  const deals = loadDeals().sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  const tbody = document.getElementById('deals-tbody');
  const empty = document.getElementById('deals-empty');
  if (!deals.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = deals.map(d => `
    <tr data-id="${d.id}">
      <td class="brand-name">${escHtml(d.brand || '—')}</td>
      <td><span class="status-badge status-${d.status || 'outreach'}">${d.status || 'outreach'}</span></td>
      <td>${d.rate ? '$' + escHtml(d.rate) : '—'}</td>
      <td>${d.deadline ? new Date(d.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
      <td class="deal-notes">${escHtml(d.notes || '—')}</td>
      <td>
        <button class="btn-icon edit-deal" data-id="${d.id}" title="Edit">✎</button>
        <button class="btn-icon del delete-deal" data-id="${d.id}" title="Delete">✕</button>
      </td>
    </tr>`).join('');
}

document.getElementById('deals-tbody').addEventListener('click', e => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (!id) return;
  if (e.target.classList.contains('delete-deal')) {
    if (!confirm('Delete this deal?')) return;
    saveDeals(loadDeals().filter(d => d.id !== id));
    renderDeals();
  } else if (e.target.classList.contains('edit-deal')) {
    openDealModal(id);
  }
});

document.getElementById('new-deal-btn').addEventListener('click', () => openDealModal(null));

function openDealModal(id) {
  editingDealId = id;
  const modal = document.getElementById('deal-modal');
  const delBtn = document.getElementById('modal-delete');
  if (id) {
    const deal = loadDeals().find(d => d.id === id);
    if (!deal) return;
    document.getElementById('modal-title').textContent = 'Edit Deal';
    document.getElementById('deal-brand').value    = deal.brand    || '';
    document.getElementById('deal-status').value   = deal.status   || 'outreach';
    document.getElementById('deal-rate').value     = deal.rate     || '';
    document.getElementById('deal-deadline').value = deal.deadline || '';
    document.getElementById('deal-notes').value    = deal.notes    || '';
    delBtn.style.display = 'inline-block';
  } else {
    document.getElementById('modal-title').textContent = 'New Deal';
    document.getElementById('deal-brand').value    = '';
    document.getElementById('deal-status').value   = 'outreach';
    document.getElementById('deal-rate').value     = '';
    document.getElementById('deal-deadline').value = '';
    document.getElementById('deal-notes').value    = '';
    delBtn.style.display = 'none';
  }
  modal.classList.add('open');
  document.getElementById('deal-brand').focus();
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('deal-modal').classList.remove('open');
});

document.getElementById('modal-delete').addEventListener('click', () => {
  if (!editingDealId) return;
  if (!confirm('Delete this deal?')) return;
  saveDeals(loadDeals().filter(d => d.id !== editingDealId));
  renderDeals();
  document.getElementById('deal-modal').classList.remove('open');
});

document.getElementById('modal-save').addEventListener('click', () => {
  const brand = document.getElementById('deal-brand').value.trim();
  if (!brand) { document.getElementById('deal-brand').focus(); return; }
  const deals = loadDeals();
  const payload = {
    brand,
    status:   document.getElementById('deal-status').value,
    rate:     document.getElementById('deal-rate').value.trim(),
    deadline: document.getElementById('deal-deadline').value,
    notes:    document.getElementById('deal-notes').value.trim(),
  };
  if (editingDealId) {
    const idx = deals.findIndex(d => d.id === editingDealId);
    if (idx !== -1) deals[idx] = { ...deals[idx], ...payload };
  } else {
    deals.push({ id: Date.now().toString(), created: new Date().toISOString(), ...payload });
  }
  saveDeals(deals);
  renderDeals();
  document.getElementById('deal-modal').classList.remove('open');
});

// Close modal on overlay click
document.getElementById('deal-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('deal-modal'))
    document.getElementById('deal-modal').classList.remove('open');
});

// ─── Content Calendar ─────────────────────────────────────────────────────────
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calActiveDate = null;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderCalendar() {
  const panel = document.getElementById('tab-calendar');
  const ideas = loadIdeas();

  const firstDay   = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr   = new Date().toISOString().slice(0, 10);

  // Build day cells
  let cells = '';
  // Leading blanks
  for (let i = 0; i < firstDay; i++) {
    cells += `<div class="cal-day other-month"></div>`;
  }
  // Active days
  for (let d = 1; d <= daysInMonth; d++) {
    const mm    = String(calMonth + 1).padStart(2, '0');
    const dd    = String(d).padStart(2, '0');
    const dateStr = `${calYear}-${mm}-${dd}`;
    const isToday = dateStr === todayStr;
    const dayIdeas = ideas.filter(i => i.scheduledDate === dateStr);
    const chips = dayIdeas.slice(0, 3).map(i => {
      const cls = (i.type || 'photo').toLowerCase() + (i.status === 'posted' ? ' posted' : '');
      return `<div class="cal-chip ${cls}">${escHtml(i.title)}</div>`;
    }).join('');
    const more = dayIdeas.length > 3 ? `<div class="cal-more">+${dayIdeas.length - 3} more</div>` : '';
    cells += `<div class="cal-day${isToday ? ' today' : ''}" data-date="${dateStr}">
      <div class="cal-day-num">${d}</div>
      ${chips}${more}
    </div>`;
  }
  // Trailing blanks to complete final row
  const totalCells = firstDay + daysInMonth;
  const trailing = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < trailing; i++) {
    cells += `<div class="cal-day other-month"></div>`;
  }

  panel.innerHTML = `
    <div class="cal-nav">
      <div class="cal-nav-group">
        <button class="cal-nav-btn" id="cal-prev">← Prev</button>
        <button class="cal-nav-btn cal-today-btn" id="cal-today">Today</button>
        <button class="cal-nav-btn" id="cal-next">Next →</button>
      </div>
      <h2>${MONTH_NAMES[calMonth]} ${calYear}</h2>
    </div>
    <div class="cal-grid">
      ${DAY_NAMES.map(d => `<div class="cal-day-header">${d}</div>`).join('')}
      ${cells}
    </div>`;

  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    renderCalendar();
  });

  panel.querySelectorAll('.cal-day:not(.other-month)').forEach(cell => {
    cell.addEventListener('click', () => openCalDayModal(cell.dataset.date));
  });
}

function openCalDayModal(dateStr) {
  calActiveDate = dateStr;
  const overlay = document.getElementById('cal-modal');
  const ideas   = loadIdeas();

  // Header date
  const d = new Date(dateStr + 'T12:00:00');
  document.getElementById('cal-modal-date').textContent =
    d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  renderCalModalList(ideas, dateStr);

  // Populate existing-ideas select (unscheduled only)
  const sel = document.getElementById('cal-schedule-select');
  const unscheduled = ideas.filter(i => !i.scheduledDate || i.scheduledDate === dateStr);
  sel.innerHTML = unscheduled.length
    ? unscheduled.map(i => `<option value="${i.id}">${escHtml(i.title)} (${i.type})</option>`).join('')
    : '<option value="">— No unscheduled ideas —</option>';

  document.getElementById('cal-quick-title').value = '';
  overlay.classList.add('open');
  document.getElementById('cal-quick-title').focus();
}

function renderCalModalList(ideas, dateStr) {
  const dayIdeas = ideas.filter(i => i.scheduledDate === dateStr);
  const list = document.getElementById('cal-modal-list');
  list.innerHTML = dayIdeas.length
    ? dayIdeas.map(i => `
        <div class="cal-modal-item">
          <span class="cal-chip ${(i.type||'photo').toLowerCase()}${i.status==='posted'?' posted':''}" style="flex-shrink:0">${escHtml(i.type)}</span>
          <span class="cal-modal-item-title">${escHtml(i.title)}</span>
          <button class="btn-icon cal-unschedule" data-id="${i.id}" title="Remove from calendar">✕</button>
        </div>`).join('')
    : '<div class="cal-modal-empty">Nothing scheduled yet.</div>';

  list.querySelectorAll('.cal-unschedule').forEach(btn => {
    btn.addEventListener('click', () => {
      const all = loadIdeas();
      const idea = all.find(x => x.id === btn.dataset.id);
      if (idea) { delete idea.scheduledDate; saveIdeas(all); }
      renderCalModalList(loadIdeas(), calActiveDate);
      renderCalendar();
    });
  });
}

document.getElementById('cal-schedule-btn').addEventListener('click', () => {
  const sel = document.getElementById('cal-schedule-select');
  const id  = sel.value;
  if (!id) return;
  const ideas = loadIdeas();
  const idea  = ideas.find(i => i.id === id);
  if (!idea) return;
  idea.scheduledDate = calActiveDate;
  saveIdeas(ideas);
  renderCalModalList(ideas, calActiveDate);
  // Refresh select
  const sel2 = document.getElementById('cal-schedule-select');
  const unscheduled = ideas.filter(i => !i.scheduledDate || i.scheduledDate === calActiveDate);
  sel2.innerHTML = unscheduled.length
    ? unscheduled.map(i => `<option value="${i.id}">${escHtml(i.title)} (${i.type})</option>`).join('')
    : '<option value="">— No unscheduled ideas —</option>';
  renderCalendar();
});

document.getElementById('cal-quick-btn').addEventListener('click', () => {
  const titleEl = document.getElementById('cal-quick-title');
  const title   = titleEl.value.trim();
  if (!title) { titleEl.focus(); return; }
  const ideas = loadIdeas();
  ideas.push({
    id:            Date.now().toString(),
    title,
    type:          document.getElementById('cal-quick-type').value,
    notes:         '',
    status:        'planned',
    scheduledDate: calActiveDate,
    created:       new Date().toISOString(),
  });
  saveIdeas(ideas);
  titleEl.value = '';
  renderCalModalList(ideas, calActiveDate);
  renderCalendar();
  renderKanban();
});

document.getElementById('cal-modal-close').addEventListener('click', () => {
  document.getElementById('cal-modal').classList.remove('open');
});
document.getElementById('cal-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('cal-modal'))
    document.getElementById('cal-modal').classList.remove('open');
});

// ─── Orders ───────────────────────────────────────────────────────────────────
async function loadOrders() {
  const wrap = document.getElementById('orders-content');
  if (!wrap) return;
  try {
    const res = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${DASHBOARD_PASSWORD}` }
    });
    if (!res.ok) throw new Error('Unauthorized');
    const orders = await res.json();
    renderOrders(orders);
  } catch (e) {
    wrap.innerHTML = `<p style="color:#c85a2a;font-size:0.85rem;">Could not load orders: ${e.message}</p>`;
  }
}

function renderOrders(orders) {
  const wrap = document.getElementById('orders-content');
  if (!orders.length) {
    wrap.innerHTML = `<p style="color:var(--text-dim);font-size:0.9rem;">No orders yet. Once a customer checks out, orders will appear here.</p>`;
    return;
  }

  const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const pending = orders.filter(o => o.status === 'paid' || o.status === 'processing').length;

  wrap.innerHTML = `
    <div class="orders-stats stat-grid">
      <div class="stat-card">
        <div class="stat-label">Total Orders</div>
        <div class="stat-value">${orders.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value">$${(totalRevenue / 100).toFixed(0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">To Ship</div>
        <div class="stat-value">${pending}</div>
      </div>
    </div>
    <div class="orders-table-wrap">
      <table class="orders-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${orders.slice().reverse().map(o => {
            const date = new Date(o.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
            const itemsSummary = (o.items || []).map(i =>
              `${i.name}${i.qty > 1 ? ' ×' + i.qty : ''}${i.engraving ? `<br><span class="order-engraving">✦ "${i.engraving}"</span>` : ''}`
            ).join('<br>');
            const statusClass = 'status-' + (o.status || 'paid');
            return `
              <tr>
                <td style="white-space:nowrap;color:var(--text-dim)">${date}</td>
                <td><span class="order-customer">${o.customer?.name || '—'}</span><br><span style="font-size:0.72rem;color:var(--text-dim)">${o.customer?.email || ''}</span></td>
                <td>${itemsSummary}</td>
                <td style="white-space:nowrap;color:var(--gold-pale);font-weight:600">$${((o.total || 0) / 100).toFixed(2)}</td>
                <td>
                  <select class="order-status ${statusClass}" data-order-id="${o.id}" onchange="updateOrderStatus(this)">
                    <option value="paid"       ${o.status==='paid'       ?'selected':''}>Paid</option>
                    <option value="processing" ${o.status==='processing' ?'selected':''}>Processing</option>
                    <option value="shipped"    ${o.status==='shipped'    ?'selected':''}>Shipped</option>
                    <option value="delivered"  ${o.status==='delivered'  ?'selected':''}>Delivered</option>
                  </select>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function updateOrderStatus(select) {
  const orderId = select.dataset.orderId;
  const status  = select.value;
  select.className = `order-status status-${status}`;
  try {
    await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHBOARD_PASSWORD}`
      },
      body: JSON.stringify({ status })
    });
  } catch {
    // Silent fail — status still shows locally
  }
}
