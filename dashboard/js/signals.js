'use strict';

// ═══════════════════ CONTENT SIGNALS ═══════════════════
// Unified feed: saved IG questions (localStorage gw_igq) +
// live IG comments (window.GW_IG_DATA).
// Each live comment auto-gets a heuristic video-idea suggestion.
// "→ Save as Idea" pre-fills the igq modal for full workflow tracking.

const REQUEST_WORDS_S = [
  'should', 'could', 'try', 'do next', 'make', 'need', 'want',
  'more', 'what about', 'how do', 'please', 'can you', 'would love',
];

// Live comment lookup map — rebuilt on each renderSignals() call
// so that saveSignalFromComment(id) can retrieve full comment data.
const _liveSignalMap = {};

// ── Auto video idea generator (heuristic, no API) ────────────────────────────

function autoIdea(text) {
  if (!text) return '';
  const t = text.toLowerCase().trim();

  if (t.match(/^how (do|can|would|should) (you|i|we)/))
    return 'Tutorial: ' + text.replace(/[?!]$/,'').trim().slice(0, 60);
  if (t.match(/^what (is|are|do you|kind|type|size)/))
    return 'What I use for: ' + text.replace(/[?!]$/,'').trim().slice(0, 50);
  if (t.includes('should') && t.includes('?'))
    return 'Should you ' + text.replace(/^.*should\s*/i,'').replace(/[?]/g,'').trim().slice(0, 40) + '? My honest take';
  if (t.includes('more') && (t.includes('please') || t.includes('content') || t.includes('video')))
    return 'More content on: ' + text.replace(/more|please|content|video/gi,'').trim().slice(0, 50);
  if (t.includes('can you') || t.includes('please make') || t.includes('would love'))
    return 'Video: ' + text.replace(/can you|please|would love/gi,'').trim().slice(0, 55);
  if (text.includes('?'))
    return 'Answer: "' + text.replace(/[?]/g,'').trim().slice(0, 55) + '"';
  return 'Video idea from: "' + text.trim().slice(0, 50) + '"';
}

// ── Content signal gate — only keep comments worth filming ───────────────────
// Returns true if the comment is a question or a content request.
// Drops pure observations, compliments, and emoji-only comments.

function isContentSignal(text) {
  if (!text || !text.trim()) return false;
  const t = text.trim();

  // Drop replies to other users — "@username something short" is inter-user chatter
  // Strip all leading @mentions and check what's left
  const withoutMentions = t.replace(/^(@\w+\s*)+/u, '').trim();
  if (withoutMentions.length < 18) return false; // reply with nothing substantive left

  // Use the de-mentioned text for all further checks
  const check = withoutMentions;

  // Strip all emoji and punctuation — if nothing meaningful is left, skip it
  const stripped = check
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{1F300}-\u{1F9FF}❤️🔥💯👍👏🙌😍🥰😂🤣😊🎉✨]/gu, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (stripped.length < 8) return false;   // emoji-only or near-empty

  // Keep questions
  if (check.includes('?')) return true;

  // Keep content requests — only if the request keyword phrase is meaningful in context
  const lower = check.toLowerCase();
  if (REQUEST_WORDS_S.some(w => lower.includes(w))) return true;

  return false;  // pure observation — skip
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function escSig(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtSigNum(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ── Build unified signal list ─────────────────────────────────────────────────

function buildSignalList() {
  const out = [];
  const PRIORITY_SCORE = { high: 100, medium: 50, low: 10 };

  // 1. Saved igq records from localStorage (always shown first via sort)
  for (const d of load(KEYS.igq)) {
    const pscore    = PRIORITY_SCORE[d.priority] || 50;
    const daysAgo   = d.date
      ? Math.max(0, 60 - Math.ceil((Date.now() - new Date(d.date)) / 86400000))
      : 0;
    out.push({ _type: 'saved', _score: pscore + daysAgo, ...d });
  }

  // 2. Live IG comments (flattened from GW_IG_DATA)
  const igData = window.GW_IG_DATA;
  if (igData && igData.media && igData.media.all) {
    for (const post of igData.media.all) {
      const reach    = post.stats?.reach || 0;
      const postDate = post.timestamp ? post.timestamp.slice(0, 10) : '';
      for (const c of (post.comments || [])) {
        // Skip pure observations, compliments, and emoji-only comments
        if (!isContentSignal(c.text)) continue;

        const score = (c.likes || 0) * 10 + reach * 0.001;
        const item  = {
          _type:        'live',
          _score:       score,
          id:           c.id,
          text:         c.text || '',
          username:     c.username || null,
          likes:        c.likes || 0,
          timestamp:    c.timestamp || '',
          postId:       post.id,
          postType:     post.type || '',
          postReach:    reach,
          postPermalink:post.permalink || null,
          postDate,
          replies:      c.replies || [],
        };
        out.push(item);
      }
    }
  }

  return out;
}

// ── Filter + sort ─────────────────────────────────────────────────────────────

function applySignalsFilter(list, filter, search) {
  let out = list;

  if (filter === 'saved') {
    out = out.filter(s => s._type === 'saved');
  } else if (filter === 'questions') {
    out = out.filter(s => {
      const t = s._type === 'saved' ? (s.question || '') : (s.text || '');
      return t.includes('?');
    });
  } else if (filter === 'requests') {
    out = out.filter(s => {
      const t = (s._type === 'saved' ? (s.question || '') : (s.text || '')).toLowerCase();
      return REQUEST_WORDS_S.some(w => t.includes(w));
    });
  } else if (filter === 'liked') {
    out = out.filter(s => s._type === 'live');
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    out = out.filter(s => {
      if (s._type === 'saved')
        return (s.question + ' ' + (s.commenter || '') + ' ' + (s.idea || '') + ' ' + (s.notes || '')).toLowerCase().includes(q);
      return (s.text || '').toLowerCase().includes(q);
    });
  }

  if (filter === 'liked') {
    out = [...out].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (filter === 'recent') {
    out = [...out].sort((a, b) => {
      const at = a._type === 'saved' ? (a.date || '') : (a.timestamp || '');
      const bt = b._type === 'saved' ? (b.date || '') : (b.timestamp || '');
      return bt.localeCompare(at);
    });
  } else {
    // all / saved / questions / requests: saved records pinned first, then by score
    out = [...out].sort((a, b) => {
      if (a._type === 'saved' && b._type !== 'saved') return -1;
      if (a._type !== 'saved' && b._type === 'saved') return 1;
      return b._score - a._score;
    });
  }

  return out;
}

// ── Render saved igq card ─────────────────────────────────────────────────────

function renderSavedCard(d) {
  return `
    <div class="signal-card signal-card--saved">
      <div class="signal-card-header">
        <div class="signal-card-text">"${escSig(truncate(d.question, 100))}"</div>
        ${badge(d.status, igqStatusBadge[d.status] || 'badge-gray')}
      </div>
      <div class="signal-card-meta">
        ${d.commenter ? escSig(d.commenter) : ''}${d.date ? ' &middot; ' + fmtDate(d.date) : ''}
        <span class="priority-dot priority-${d.priority} priority-dot-inline"></span>
      </div>
      ${d.idea ? `<div class="signal-idea-box">&#128161; ${escSig(d.idea)}</div>` : ''}
      <div class="signal-card-actions">
        <select class="btn btn-ghost btn-sm" onchange="quickUpdateStatus('igq','${d.id}',this.value)">
          <option value="">Move to...</option>
          <option value="new">New</option>
          <option value="planned">Planned</option>
          <option value="filmed">Filmed</option>
          <option value="published">Published</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="openModal('igq','${d.id}')">Edit</button>
        <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDelete('igq','${d.id}')">&#10005;</button>
      </div>
    </div>`;
}

// ── Render live comment card ──────────────────────────────────────────────────

function renderLiveCard(c) {
  const likeBadge = c.likes > 0
    ? `<span class="badge badge-red">&#10084; ${fmtSigNum(c.likes)}</span>`
    : '';
  const who = c.username
    ? `@${escSig(c.username)}`
    : '<em class="td-muted">follower</em>';
  const viewLink = c.postPermalink
    ? `<a href="${c.postPermalink}" target="_blank" class="link-green">view post &#8599;</a>`
    : '';
  const idea = autoIdea(c.text);

  // Store in lookup map for saveSignalFromComment
  _liveSignalMap[c.id] = c;

  return `
    <div class="signal-card">
      <div class="signal-card-header">
        <div class="signal-card-text">${escSig(c.text)}</div>
        ${likeBadge}
      </div>
      <div class="signal-card-meta">
        <span>${who}</span>
        ${c.postDate ? `<span>&middot; ${c.postDate}</span>` : ''}
        ${viewLink ? `<span>&middot; ${viewLink}</span>` : ''}
      </div>
      ${idea ? `<div class="signal-idea-box">&#128161; ${escSig(idea)}</div>` : ''}
      <div class="signal-card-actions signal-card-actions--end">
        <button class="btn btn-ghost btn-sm" onclick="saveSignalFromComment('${escSig(c.id)}')">+ Save as Idea</button>
      </div>
    </div>`;
}

// ── Save live comment as igq record ──────────────────────────────────────────

function saveSignalFromComment(id) {
  const c = _liveSignalMap[id];
  if (!c) return;

  // Pre-fill the igq modal with comment data + auto-generated idea
  editingId   = null;
  editingType = 'igq';

  const backdrop = document.getElementById('modal-igq');
  backdrop.classList.add('open');
  clearModal('igq');

  document.getElementById('igq-question').value  = c.text;
  document.getElementById('igq-commenter').value = c.username ? '@' + c.username : 'IG follower';
  document.getElementById('igq-date').value      = c.postDate || new Date().toISOString().split('T')[0];
  document.getElementById('igq-post').value      = (c.postType || '') + (c.postDate ? ' · ' + c.postDate : '');
  document.getElementById('igq-idea').value      = autoIdea(c.text);
  document.getElementById('igq-status').value    = 'new';
  document.getElementById('igq-priority').value  = 'high';
  document.getElementById('igq-modal-title').textContent = 'Save as Video Idea';
}

// ── populateIgqModal + saveIgq (moved from igquestions.js) ───────────────────

function populateIgqModal(id) {
  const d = load(KEYS.igq).find(x => x.id === id);
  if (!d) return;
  document.getElementById('igq-modal-title').textContent = 'Edit Signal';
  document.getElementById('igq-question').value  = d.question  || '';
  document.getElementById('igq-commenter').value = d.commenter || '';
  document.getElementById('igq-date').value      = d.date      || '';
  document.getElementById('igq-post').value      = d.post      || '';
  document.getElementById('igq-idea').value      = d.idea      || '';
  document.getElementById('igq-status').value    = d.status    || 'new';
  document.getElementById('igq-priority').value  = d.priority  || 'medium';
  document.getElementById('igq-notes').value     = d.notes     || '';
}

function saveIgq() {
  const question = document.getElementById('igq-question').value.trim();
  if (!question) { alert('Please enter the question or comment text.'); return; }
  const item = {
    id:        editingId || uid(),
    question,
    commenter: document.getElementById('igq-commenter').value.trim(),
    date:      document.getElementById('igq-date').value,
    post:      document.getElementById('igq-post').value.trim(),
    idea:      document.getElementById('igq-idea').value.trim(),
    status:    document.getElementById('igq-status').value,
    priority:  document.getElementById('igq-priority').value,
    notes:     document.getElementById('igq-notes').value.trim(),
    updated:   new Date().toISOString(),
  };
  let data = load(KEYS.igq);
  if (editingId) {
    data = data.map(d => d.id === editingId ? item : d);
  } else {
    data.push(item);
  }
  save(KEYS.igq, data);
  closeModal('igq');
  renderSignals();
}

// ── Filter button ─────────────────────────────────────────────────────────────

function setSignalsFilter(value, btn) {
  filters.signals = value;
  btn.closest('.filter-row').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSignals();
}

// ── Main render ───────────────────────────────────────────────────────────────

function renderSignals(search = '') {
  const grid    = document.getElementById('signals-grid');
  const summary = document.getElementById('signals-summary');
  if (!grid) return;

  // Reset live lookup map on each render
  Object.keys(_liveSignalMap).forEach(k => delete _liveSignalMap[k]);

  const all      = buildSignalList();
  const saved    = all.filter(s => s._type === 'saved').length;
  const live     = all.filter(s => s._type === 'live').length;
  const filter   = (filters && filters.signals) || 'all';
  const filtered = applySignalsFilter(all, filter, search);

  if (summary) {
    summary.textContent = `${saved} saved · ${live} live comments`;
  }

  if (!filtered.length) {
    const msg = !window.GW_IG_DATA && filter !== 'saved'
      ? 'No Instagram data loaded. Click ↻ Refresh Data or run <code>npm run all</code>.'
      : 'No signals match this filter.';
    grid.innerHTML = `<div class="no-items">${msg}</div>`;
    return;
  }

  grid.innerHTML = filtered.slice(0, 200).map(s =>
    s._type === 'saved' ? renderSavedCard(s) : renderLiveCard(s)
  ).join('');
}

// ── showPage hook ─────────────────────────────────────────────────────────────

(function () {
  const _orig = showPage;
  showPage = function (name) {
    _orig(name);
    if (name === 'signals') renderSignals();
  };
})();
