// ═══════════════════ BRAND DEALS ═══════════════════

// ── Nudge Panel ───────────────────────────────────────────────────────────────
// Thresholds (days without update before flagging):
const NUDGE_THRESHOLDS = { signed: 2, negotiating: 3, pitched: 5 };

function _nudgeDaysAgo(isoStr) {
  if (!isoStr) return 999;
  return Math.floor((Date.now() - new Date(isoStr).getTime()) / 86400000);
}

function _nudgeUrgency(days, threshold) {
  if (days >= threshold + 4) return 'critical'; // 7+ days for signed, etc.
  if (days >= threshold)     return 'warning';
  return null;
}

function renderNudgePanel() {
  const el = document.getElementById('deals-nudge');
  if (!el) return;

  const deals = load(KEYS.deals);
  const flagged = deals
    .filter(d => NUDGE_THRESHOLDS[d.status])
    .map(d => {
      const days      = _nudgeDaysAgo(d.updated);
      const threshold = NUDGE_THRESHOLDS[d.status];
      const urgency   = _nudgeUrgency(days, threshold);
      return { ...d, days, threshold, urgency };
    })
    .filter(d => d.urgency)
    .sort((a, b) => b.days - a.days);

  if (!flagged.length) {
    el.innerHTML = '';
    return;
  }

  const collapsed = localStorage.getItem('gw_nudge_collapsed') === '1';
  const hasCritical = flagged.some(d => d.urgency === 'critical');

  el.innerHTML = `
    <div class="nudge-panel${hasCritical ? ' nudge-panel--critical' : ''}">
      <div class="nudge-header" onclick="toggleNudgePanel()">
        <div class="nudge-header-left">
          <span class="nudge-bell">🔔</span>
          <span class="nudge-title">Needs a Nudge</span>
          <span class="nudge-count">${flagged.length}</span>
        </div>
        <span class="nudge-toggle-icon">${collapsed ? '▼' : '▲'}</span>
      </div>
      <div class="nudge-body" id="nudge-body" style="display:${collapsed ? 'none' : 'grid'}">
        ${flagged.map(d => {
          const isCritical = d.urgency === 'critical';
          const emailMatch = (d.contact || '').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
          const email      = emailMatch ? emailMatch[0] : '';
          const nameMatch  = (d.contact || '').split('—')[0].trim();
          return `
            <div class="nudge-card nudge-card--${d.urgency}">
              <div class="nudge-card-top">
                <div>
                  <div class="nudge-brand">${d.brand}</div>
                  <div class="nudge-contact">${nameMatch || 'No contact'}${email ? ` · ${email}` : ''}</div>
                </div>
                <div class="nudge-card-top-right">
                  ${badge(d.status, dealStatusBadge[d.status] || 'badge-gray')}
                  <span class="nudge-days nudge-days--${d.urgency}">${d.days}d</span>
                </div>
              </div>
              <div class="nudge-card-actions">
                <button class="btn btn-ghost btn-sm" onclick="nudgeCopyFollowUp('${d.id}', this)">📋 Copy Follow-up</button>
                ${email ? `<a class="btn btn-ghost btn-sm" href="mailto:${email}?subject=Following+up+—+${encodeURIComponent(d.brand)}&body=${encodeURIComponent(_nudgeEmailBody(d))}">✉️ Open Email</a>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="openModal('deal','${d.id}')">Edit Deal</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function toggleNudgePanel() {
  const body      = document.getElementById('nudge-body');
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? 'grid' : 'none';
  localStorage.setItem('gw_nudge_collapsed', collapsed ? '0' : '1');
  const icon = document.querySelector('.nudge-toggle-icon');
  if (icon) icon.textContent = collapsed ? '▲' : '▼';
}

function _nudgeEmailBody(d) {
  const firstName = (d.contact || '').split(/[\s,—]/)[0] || 'there';
  const statusMsg = {
    signed:      `I wanted to follow up on our deal — I'm ready to move forward whenever you are.`,
    negotiating: `I wanted to circle back on our conversation. I'm still very interested in making this work.`,
    pitched:     `I wanted to follow up on my pitch and see if you had any questions or thoughts.`,
  }[d.status] || `I wanted to follow up on our partnership conversation.`;

  return `Hi ${firstName},\n\n${statusMsg}\n\nLet me know if there's anything I can provide to help move things forward!\n\nStryder Graft\nFounder, Graftwild\nstryder@graftwild.com`;
}

function nudgeCopyFollowUp(id, btn) {
  const deal = load(KEYS.deals).find(d => d.id === id);
  if (!deal) return;
  const text = _nudgeEmailBody(deal);
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = orig, 1800);
  });
}

function renderDealsPipeline() {
  const all       = load(KEYS.deals);
  const active    = all.filter(d => ['pitched','negotiating','signed'].includes(d.status));
  const completed = all.filter(d => d.status === 'completed');
  const pipeline  = active.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);
  const earned    = completed.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);

  const el = document.getElementById('deals-pipeline');
  if (!el) return;
  el.innerHTML = `
    <div class="pipeline-row">
      <div class="stat-card card-border-gold">
        <div class="stat-label">Pipeline</div>
        <div class="stat-value gold">${fmt$(pipeline)}</div>
        <div class="stat-sub">${active.length} open deal${active.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="stat-card card-border-green">
        <div class="stat-label">Earned</div>
        <div class="stat-value green">${fmt$(earned)}</div>
        <div class="stat-sub">${completed.length} completed</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Deals</div>
        <div class="stat-value">${all.length}</div>
        <div class="stat-sub">All time</div>
      </div>
    </div>`;
}

function renderDeals(search = '') {
  renderNudgePanel();
  renderDealsPipeline();
  let data = load(KEYS.deals);
  if (filters.deals !== 'all') data = data.filter(d => d.status === filters.deals);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(d => (d.brand + d.type + d.notes + d.contact).toLowerCase().includes(q));
  }
  data.sort((a,b) => (a.brand||'').localeCompare(b.brand||''));
  document.getElementById('deals-count').textContent = `${data.length} deal${data.length !== 1 ? 's' : ''}`;
  const tbody = document.getElementById('deals-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No deals found. Add your first brand deal.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(d => `
    <tr>
      <td class="td-wrap"><strong>${d.brand}</strong>${d.contact ? `<span class="td-sub">${truncate(d.contact,32)}</span>` : ''}</td>
      <td class="td-value-gold">${d.value ? fmt$(d.value) : '—'}</td>
      <td>${badge(d.status, dealStatusBadge[d.status] || 'badge-gray')}</td>
      <td>${fmtDate(d.deadline)}</td>
      <td class="td-muted" title="${(d.notes || d.deliverables || '').replace(/"/g,'&quot;')}">${truncate(d.notes || d.deliverables, 50)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm" onclick="openModal('deal','${d.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDelete('deal','${d.id}')">Del</button>
        </div>
      </td>
    </tr>`).join('');
}

function populateDealModal(id) {
  const d = load(KEYS.deals).find(x => x.id === id);
  if (!d) return;
  document.getElementById('deal-modal-title').textContent = 'Edit Brand Deal';
  document.getElementById('deal-brand').value       = d.brand || '';
  document.getElementById('deal-type').value        = d.type || 'sponsored post';
  document.getElementById('deal-value').value       = d.value || '';
  document.getElementById('deal-status').value      = d.status || 'pitched';
  document.getElementById('deal-deadline').value    = d.deadline || '';
  document.getElementById('deal-contact').value     = d.contact || '';
  document.getElementById('deal-deliverables').value= d.deliverables || '';
  document.getElementById('deal-notes').value       = d.notes || '';
}

function saveDeal() {
  const brand = document.getElementById('deal-brand').value.trim();
  if (!brand) { alert('Please enter a brand name.'); return; }
  const deal = {
    id:          editingId || uid(),
    brand,
    type:        document.getElementById('deal-type').value,
    value:       document.getElementById('deal-value').value,
    status:      document.getElementById('deal-status').value,
    deadline:    document.getElementById('deal-deadline').value,
    contact:     document.getElementById('deal-contact').value.trim(),
    deliverables:document.getElementById('deal-deliverables').value.trim(),
    notes:       document.getElementById('deal-notes').value.trim(),
    updated:     new Date().toISOString(),
  };
  let data = load(KEYS.deals);
  if (editingId) {
    data = data.map(d => d.id === editingId ? deal : d);
  } else {
    data.push(deal);
  }
  save(KEYS.deals, data);
  closeModal('deal');
  renderDeals();
}
