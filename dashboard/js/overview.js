// ═══════════════════ OVERVIEW ═══════════════════

function renderOverview() {
  const deals    = load(KEYS.deals);
  const outreach = load(KEYS.outreach);
  const ideas    = load(KEYS.ideas);
  const igq      = load(KEYS.igq);
  const shoots   = load(KEYS.shoots);

  // ── Date greeting ──────────────────────────────────────────────────────────
  const dateEl = document.getElementById('overview-date');
  if (dateEl) {
    const now  = new Date();
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const mons = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    dateEl.textContent = `${days[now.getDay()]}, ${mons[now.getMonth()]} ${now.getDate()}`;
  }

  // ── Pipeline banner ────────────────────────────────────────────────────────
  const active    = deals.filter(d => ['pitched','negotiating','signed'].includes(d.status));
  const completed = deals.filter(d => d.status === 'completed');
  const pipeline  = active.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);
  const earned    = completed.reduce((s, d) => s + (parseFloat(d.value) || 0), 0);
  const outNeedsAction = outreach.filter(d => ['to contact','contacted'].includes(d.status)).length;

  const pipelineEl = document.getElementById('overview-pipeline');
  if (pipelineEl) {
    pipelineEl.innerHTML = `
      <div class="kpi-grid">
        <div class="stat-card stat-card--hero card-border-gold-thick">
          <div class="stat-label">Pipeline</div>
          <div class="stat-value gold">${fmt$(pipeline)}</div>
          <div class="stat-sub">${active.length} active deal${active.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card card-border-green">
          <div class="stat-label">Earned</div>
          <div class="stat-value green">${fmt$(earned)}</div>
          <div class="stat-sub">${completed.length} deal${completed.length !== 1 ? 's' : ''} closed</div>
        </div>
        <div class="stat-card stat-card--secondary">
          <div class="stat-label">Content Ideas</div>
          <div class="stat-value">${ideas.filter(d => d.status !== 'published').length}</div>
          <div class="stat-sub">Not yet published</div>
        </div>
        <div class="stat-card stat-card--secondary">
          <div class="stat-label">Outreach</div>
          <div class="stat-value">${outNeedsAction}</div>
          <div class="stat-sub">${outreach.length} total contacts</div>
        </div>
      </div>`;
  }

  // ── Active & pending deals ─────────────────────────────────────────────────
  const activeD = active.slice(0, 6);
  document.getElementById('overview-deals').innerHTML = activeD.length
    ? activeD.map(d => `
      <div class="recent-item" onclick="showPage('deals')" >
        <div>
          <div class="recent-item-name">${d.brand}</div>
          <div class="recent-item-meta">${d.value ? fmt$(d.value) : 'No value set'}${d.deadline ? ' · Due ' + fmtDate(d.deadline) : ''}</div>
        </div>
        ${badge(d.status, dealStatusBadge[d.status] || 'badge-gray')}
      </div>`).join('')
    : '<div class="no-items">No active deals yet</div>';

  // ── Upcoming shoots ────────────────────────────────────────────────────────
  const today     = new Date().toISOString().split('T')[0];
  const upcoming  = shoots
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const shootTypeIcon = { shoot:'🎬', script:'✍️', edit:'✂️', post:'📤', deadline:'⏰' };

  document.getElementById('overview-shoots').innerHTML = upcoming.length
    ? upcoming.map(s => `
      <div class="recent-item" onclick="showPage('calendar')" >
        <div>
          <div class="recent-item-name">${shootTypeIcon[s.type] || '📅'} ${s.title}</div>
          <div class="recent-item-meta">${fmtDate(s.date)}${s.dealLabel ? ' · ' + s.dealLabel : ''}</div>
        </div>
      </div>`).join('')
    : '<div class="no-items">No shoots scheduled — <span class="link-green" onclick="showPage(\'calendar\')">add one</span></div>';

  // ── Top ideas ──────────────────────────────────────────────────────────────
  const topIdeas = ideas
    .filter(d => d.status !== 'published')
    .sort((a, b) => { const p = {high:0,medium:1,low:2}; return (p[a.priority]||1) - (p[b.priority]||1); })
    .slice(0, 5);
  document.getElementById('overview-ideas').innerHTML = topIdeas.length
    ? topIdeas.map(d => `
      <div class="recent-item" onclick="showPage('ideas')" >
        <div>
          <div class="recent-item-name">
            <span class="priority-dot priority-${d.priority}"></span>${truncate(d.title, 42)}
          </div>
          <div class="recent-item-meta">${cap(d.platform)}</div>
        </div>
        ${badge(d.status, ideaStatusBadge[d.status] || 'badge-gray')}
      </div>`).join('')
    : '<div class="no-items">No content ideas yet</div>';

  // ── Comments to script ─────────────────────────────────────────────────────
  const toFilm = igq.filter(d => ['new','planned'].includes(d.status)).slice(0, 5);
  document.getElementById('overview-ig').innerHTML = toFilm.length
    ? toFilm.map(d => `
      <div class="recent-item" onclick="showPage('signals')" >
        <div>
          <div class="recent-item-name">${truncate(d.question, 42)}</div>
          <div class="recent-item-meta">${d.commenter || ''}</div>
        </div>
        ${badge(d.status, igqStatusBadge[d.status] || 'badge-gray')}
      </div>`).join('')
    : '<div class="no-items">No signals saved yet</div>';
}
