'use strict';

// ═══════════════════ SHOOT CALENDAR ═══════════════════

let _calYear  = new Date().getFullYear();
let _calMonth = new Date().getMonth(); // 0-indexed
let _calSelectedDate = null;
let _dragShootId     = null; // id of shoot being dragged
let _dragIdeaId      = null; // id of idea being dragged onto calendar

const SHOOT_TYPE_ICON  = { shoot:'🎬', script:'✍️', edit:'✂️', post:'📤', deadline:'⏰' };
const SHOOT_TYPE_COLOR = {
  shoot:    '#5a9140',
  script:   '#3b82f6',
  edit:     '#d97706',
  post:     '#a78bfa',
  deadline: '#ef4444'
};
const SHOOT_TYPE_LABEL = { shoot:'Shoot', script:'Script', edit:'Edit', post:'Post', deadline:'Deadline' };
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Navigate months ────────────────────────────────────────────────────────────

function calNav(dir) {
  _calMonth += dir;
  if (_calMonth > 11) { _calMonth = 0; _calYear++; }
  if (_calMonth < 0)  { _calMonth = 11; _calYear--; }
  _calSelectedDate = null;
  closeEventPopover();
  renderCalendar();
}

// ── Render the full calendar page ─────────────────────────────────────────────

function renderCalendar() {
  const label = document.getElementById('cal-month-label');
  if (label) label.textContent = `${MONTH_NAMES[_calMonth]} ${_calYear}`;
  renderCalGrid();
  renderCalUpcoming();
  renderCalIdeas();
}

// ── Ideas backlog ─────────────────────────────────────────────────────────────

function renderCalIdeas() {
  const el = document.getElementById('cal-ideas-backlog');
  if (!el) return;

  const filterSel = document.getElementById('cal-ideas-filter');
  const filter    = filterSel ? filterSel.value : 'unscheduled';

  // Get scheduled idea titles so we can mark them
  const scheduledTitles = new Set(load(KEYS.shoots).map(s => s.title.trim().toLowerCase()));

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const priorityColor = { high: '#ef4444', medium: '#d97706', low: '#5a9140' };
  const priorityLabel = { high: 'High', medium: 'Med', low: 'Low' };
  const platformIcon  = {
    'instagram reel': '📱',
    'youtube':        '▶️',
    'tiktok':         '🎵',
    'blog':           '✍️',
    'podcast':        '🎙️',
  };

  let ideas = load(KEYS.ideas)
    .filter(d => d.status !== 'posted')
    .sort((a, b) => (priorityOrder[a.priority]||1) - (priorityOrder[b.priority]||1));

  if (filter === 'unscheduled') {
    ideas = ideas.filter(d => !scheduledTitles.has(d.title.trim().toLowerCase()));
  }

  if (!ideas.length) {
    el.innerHTML = `<div class="cal-ideas-empty">
      ${filter === 'unscheduled'
        ? 'All your ideas are scheduled — nice work! Switch to "All Ideas" to see them.'
        : 'No ideas yet. Head to Content Ideas to add some.'}
    </div>`;
    return;
  }

  el.innerHTML = ideas.map(idea => {
    const isScheduled = scheduledTitles.has(idea.title.trim().toLowerCase());
    const pColor = priorityColor[idea.priority] || '#5a9140';
    const pLabel = priorityLabel[idea.priority] || 'Med';
    const pIcon  = platformIcon[(idea.platform||'').toLowerCase()] || '💡';
    return `
      <div class="cal-idea-card${isScheduled?' cal-idea-card--scheduled':''}"
           draggable="true"
           ondragstart="ideaDragStart('${idea.id}', event)"
           ondragend="calDragEnd(event)"
           title="Drag to a calendar day to schedule">
        <div class="cal-idea-card-top">
          <span class="cal-idea-priority cal-idea-priority--${idea.priority || 'medium'}">${pLabel}</span>
          ${isScheduled ? `<span class="cal-idea-sched-badge">✓ Scheduled</span>` : ''}
        </div>
        <div class="cal-idea-title">${pIcon} ${idea.title}</div>
        ${idea.platform ? `<div class="cal-idea-meta">${idea.platform}${idea.tags ? ' · ' + idea.tags : ''}</div>` : ''}
        <div class="cal-idea-drag-hint">⠿ drag to schedule</div>
      </div>`;
  }).join('');
}

// ── Monthly grid ──────────────────────────────────────────────────────────────

function renderCalGrid() {
  const el = document.getElementById('cal-grid');
  if (!el) return;

  const shoots   = load(KEYS.shoots);
  const todayStr = new Date().toISOString().split('T')[0];

  // Build map: date → sorted shoots
  const byDate = {};
  for (const s of shoots) {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  }
  for (const d in byDate) {
    byDate[d].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
  }

  const firstDay    = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const dayHeaders  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let html = `
    <div class="cal-header-row">
      ${dayHeaders.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
    </div>
    <div class="cal-grid-body">`;

  // Empty leading cells
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-cell cal-cell--empty"
                  ondragover="calDragOver(event)"
                  ondragleave="calDragLeave(event)"
                  ondrop="calDrop('', event)"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr    = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday    = dateStr === todayStr;
    const isSelected = dateStr === _calSelectedDate;
    const dayShoots  = byDate[dateStr] || [];
    const maxChips   = 3;

    html += `
      <div class="cal-cell${isToday?' cal-cell--today':''}${isSelected?' cal-cell--selected':''}"
           data-date="${dateStr}"
           onclick="calDayClick('${dateStr}', event)"
           ondragover="calDragOver(event)"
           ondragleave="calDragLeave(event)"
           ondrop="calDrop('${dateStr}', event)">
        <div class="cal-cell-num${isToday?' cal-cell-num--today':''}">
          ${day}${dayShoots.length > 0 ? `<span class="cal-dot-count">${dayShoots.length}</span>` : ''}
        </div>
        ${dayShoots.slice(0, maxChips).map(s => `
          <div class="cal-chip cal-chip--${s.type||'shoot'}${s.done?' cal-chip--done':''}"
               draggable="true"
               ondragstart="calDragStart('${s.id}', event)"
               ondragend="calDragEnd(event)"
               onclick="event.stopPropagation(); openEventPopover('${s.id}', event)"
               title="${s.title}${s.time ? ' · ' + fmtTime(s.time) : ''}${s.done?' · ✓ Done':''}">
            ${s.done ? `<span class="cal-chip-check">✓</span>` : ''}
            ${s.time && !s.done ? `<span class="cal-chip-time">${fmtTime(s.time)}</span>` : ''}
            <span class="cal-chip-icon">${SHOOT_TYPE_ICON[s.type]||'📅'}</span>
            <span class="cal-chip-title">${s.title}</span>
          </div>`).join('')}
        ${dayShoots.length > maxChips ? `<div class="cal-more">+${dayShoots.length - maxChips} more</div>` : ''}
      </div>`;
  }

  // Trailing empty cells
  const total     = firstDay + daysInMonth;
  const remainder = total % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      html += `<div class="cal-cell cal-cell--empty"
                    ondragover="calDragOver(event)"
                    ondragleave="calDragLeave(event)"
                    ondrop="calDrop('', event)"></div>`;
    }
  }

  html += `</div>`;
  el.innerHTML = html;
}

// ── Day click → open add-shoot modal ─────────────────────────────────────────

function calDayClick(dateStr, e) {
  _calSelectedDate = dateStr;
  closeEventPopover();
  document.querySelectorAll('.cal-cell--selected').forEach(el => el.classList.remove('cal-cell--selected'));
  const cell = document.querySelector(`.cal-cell[data-date="${dateStr}"]`);
  if (cell) cell.classList.add('cal-cell--selected');
  openShootModal(dateStr);
}

// ── Drag-and-drop ─────────────────────────────────────────────────────────────

function calDragStart(id, e) {
  _dragShootId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  // Slight delay so the chip doesn't disappear instantly
  setTimeout(() => {
    const chip = e.target.closest('.cal-chip');
    if (chip) chip.classList.add('cal-chip--dragging');
  }, 0);
  closeEventPopover();
}

function calDragEnd(e) {
  _dragShootId = null;
  _dragIdeaId  = null;
  document.querySelectorAll('.cal-chip--dragging').forEach(el => el.classList.remove('cal-chip--dragging'));
  document.querySelectorAll('.cal-idea-card--dragging').forEach(el => el.classList.remove('cal-idea-card--dragging'));
  document.querySelectorAll('.cal-cell--dragover').forEach(el => el.classList.remove('cal-cell--dragover'));
}

// ── Idea drag start ───────────────────────────────────────────────────────────

function ideaDragStart(id, e) {
  _dragIdeaId  = id;
  _dragShootId = null;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'idea:' + id);
  setTimeout(() => {
    const card = e.target.closest('.cal-idea-card');
    if (card) card.classList.add('cal-idea-card--dragging');
  }, 0);
  closeEventPopover();
}

function calDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const cell = e.currentTarget;
  if (!cell.classList.contains('cal-cell--dragover')) {
    cell.classList.add('cal-cell--dragover');
  }
}

function calDragLeave(e) {
  // Only remove class when leaving the cell itself (not a child element)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('cal-cell--dragover');
  }
}

function calDrop(dateStr, e) {
  e.preventDefault();
  e.currentTarget.classList.remove('cal-cell--dragover');
  if (!dateStr) return;

  const raw = e.dataTransfer.getData('text/plain');

  // ── Idea dropped onto calendar day → pre-fill shoot modal ──────────────────
  if (_dragIdeaId || raw.startsWith('idea:')) {
    const ideaId = _dragIdeaId || raw.replace('idea:', '');
    _dragIdeaId  = null;
    const idea = load(KEYS.ideas).find(x => x.id === ideaId);
    if (!idea) return;

    // Flash the cell
    _calDropFlash(dateStr);

    // Open shoot modal pre-filled with idea details
    // Use setTimeout so our field-setting runs AFTER openModal's own reset
    openModal('shoot');
    setTimeout(() => {
      const platformTypeMap = {
        'instagram reel': 'shoot',
        'youtube':        'shoot',
        'tiktok':         'shoot',
        'blog':           'script',
        'podcast':        'script',
      };
      const guessedType = platformTypeMap[(idea.platform||'').toLowerCase()] || 'shoot';

      const dateEl  = document.getElementById('shoot-date');
      const titleEl = document.getElementById('shoot-title');
      const notesEl = document.getElementById('shoot-notes');
      const timeEl  = document.getElementById('shoot-time');
      if (dateEl)  dateEl.value  = dateStr;
      if (titleEl) titleEl.value = idea.title || '';
      if (notesEl && idea.notes) notesEl.value = idea.notes;
      document.getElementById('shoot-type').value = guessedType;
      document.querySelectorAll('.shoot-type-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-val') === guessedType);
      });
      if (timeEl) timeEl.focus();
    }, 30);
    return;
  }

  // ── Shoot chip moved to a new day ──────────────────────────────────────────
  const id = _dragShootId || raw;
  if (!id) return;

  const data = load(KEYS.shoots);
  const idx  = data.findIndex(s => s.id === id);
  if (idx === -1) return;
  if (data[idx].date === dateStr) return; // same day, no-op

  data[idx] = { ...data[idx], date: dateStr, updated: new Date().toISOString() };
  save(KEYS.shoots, data);
  renderCalendar();
  if (typeof renderOverview === 'function') renderOverview();
  _calDropFlash(dateStr);
}

function _calDropFlash(dateStr) {
  const cell = document.querySelector(`.cal-cell[data-date="${dateStr}"]`);
  if (cell) {
    cell.classList.add('cal-cell--drop-flash');
    setTimeout(() => cell.classList.remove('cal-cell--drop-flash'), 500);
  }
}

// ── Toggle done state ─────────────────────────────────────────────────────────

function toggleShootDone(id) {
  const data = load(KEYS.shoots);
  const idx  = data.findIndex(s => s.id === id);
  if (idx === -1) return;
  data[idx] = { ...data[idx], done: !data[idx].done, updated: new Date().toISOString() };
  save(KEYS.shoots, data);
  closeEventPopover();
  renderCalendar();
  if (typeof renderOverview === 'function') renderOverview();
}

// ── Event popover ─────────────────────────────────────────────────────────────

function openEventPopover(id, e) {
  const shoot = load(KEYS.shoots).find(s => s.id === id);
  if (!shoot) return;

  closeEventPopover();

  const color   = SHOOT_TYPE_COLOR[shoot.type] || '#5a9140';
  const icon    = SHOOT_TYPE_ICON[shoot.type]  || '📅';
  const label   = SHOOT_TYPE_LABEL[shoot.type] || shoot.type;
  const isDone  = !!shoot.done;

  const pop = document.createElement('div');
  pop.id    = 'event-popover';
  pop.className = 'event-popover';
  pop.innerHTML = `
    <div class="event-popover-stripe cal-stripe--${shoot.type}${isDone?' cal-stripe--done':''}"></div>
    <div class="event-popover-body">
      <div class="event-popover-header">
        <span class="event-popover-title${isDone?' event-popover-title--done':''}">${shoot.title}</span>
        <button class="event-popover-close" onclick="closeEventPopover()">✕</button>
      </div>
      <div class="event-popover-meta">
        <span class="event-popover-badge event-popover-badge--${shoot.type}">${icon} ${label}</span>
        <span class="event-popover-date">${fmtDate(shoot.date)}${shoot.time ? ' · ' + fmtTime(shoot.time) : ''}</span>
        ${isDone ? `<span class="event-popover-done-badge">✓ Done</span>` : ''}
      </div>
      ${shoot.dealLabel ? `<div class="event-popover-row"><span class="event-popover-label">Deal</span>${shoot.dealLabel}</div>` : ''}
      ${shoot.notes ? `<div class="event-popover-row"><span class="event-popover-label">Notes</span>${shoot.notes}</div>` : ''}
      <div class="event-popover-actions">
        <button class="btn btn-sm ${isDone ? 'btn-done-active' : 'btn-done'}"
                onclick="toggleShootDone('${shoot.id}')">
          ${isDone ? '↩ Reopen' : '✓ Mark Done'}
        </button>
        <button class="btn btn-ghost btn-sm" onclick="closeEventPopover();openModal('shoot','${shoot.id}')">✏️ Edit</button>
        <button class="btn btn-ghost btn-sm btn-del" onclick="closeEventPopover();confirmDelete('shoot','${shoot.id}')">🗑</button>
      </div>
    </div>`;

  document.body.appendChild(pop);

  // Position near click, keep in viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = e.clientX + 12;
  let y = e.clientY + 12;
  const pw = 268;
  const ph = 200;
  if (x + pw > vw - 16) x = e.clientX - pw - 12;
  if (y + ph > vh - 16) y = e.clientY - ph - 12;
  pop.style.left = Math.max(8, x) + 'px';
  pop.style.top  = Math.max(8, y) + 'px';

  setTimeout(() => {
    document.addEventListener('click', _popoverOutsideClick);
  }, 50);
}

function _popoverOutsideClick(e) {
  const pop = document.getElementById('event-popover');
  if (pop && !pop.contains(e.target)) closeEventPopover();
}

function closeEventPopover() {
  const pop = document.getElementById('event-popover');
  if (pop) pop.remove();
  document.removeEventListener('click', _popoverOutsideClick);
}

// ── Upcoming list ──────────────────────────────────────────────────────────────

function renderCalUpcoming() {
  const el = document.getElementById('cal-upcoming');
  if (!el) return;

  const today  = new Date().toISOString().split('T')[0];
  const shoots = load(KEYS.shoots)
    .filter(s => s.date >= today)
    .sort((a, b) => {
      const da = a.date + (a.time || '00:00');
      const db = b.date + (b.time || '00:00');
      return da.localeCompare(db);
    })
    .slice(0, 12);

  el.innerHTML = shoots.length
    ? shoots.map(s => {
        const color  = SHOOT_TYPE_COLOR[s.type] || '#5a9140';
        const isDone = !!s.done;
        return `
          <div class="cal-upcoming-item${isDone?' cal-upcoming-item--done':''}" onclick="openModal('shoot','${s.id}')">
            <div class="cal-upcoming-stripe cal-stripe--${s.type}${isDone?' cal-stripe--done':''}"></div>
            <div class="cal-upcoming-info">
              <div class="cal-upcoming-title${isDone?' cal-upcoming-title--done':''}">${SHOOT_TYPE_ICON[s.type]||'📅'} ${s.title}${isDone?' <span class="cal-done-tag">✓ done</span>':''}</div>
              <div class="cal-upcoming-meta">${fmtDate(s.date)}${s.time ? ' · ' + fmtTime(s.time) : ''}${s.dealLabel ? ' · ' + s.dealLabel : ''}</div>
            </div>
            <div class="action-btns" onclick="event.stopPropagation()">
              <button class="btn btn-ghost btn-sm" onclick="toggleShootDone('${s.id}')" title="${isDone?'Reopen':'Mark done'}">${isDone?'↩':'✓'}</button>
              <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDelete('shoot','${s.id}')">Del</button>
            </div>
          </div>`;
      }).join('')
    : '<div class="no-items">No upcoming shoots. Click any day or use + Add Shoot to plan one.</div>';
}

// ── Format time helper ─────────────────────────────────────────────────────────

function fmtTime(t) {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const hr   = h % 12 || 12;
    return `${hr}:${String(m).padStart(2,'0')}${ampm}`;
  } catch(e) { return t; }
}

// ── Open modal pre-filled with a date ─────────────────────────────────────────

function openShootModal(date) {
  openModal('shoot');
  const dateEl = document.getElementById('shoot-date');
  if (dateEl && date) dateEl.value = date;
  const timeEl = document.getElementById('shoot-time');
  if (timeEl) setTimeout(() => timeEl.focus(), 120);
}

// ── Populate deals dropdown ────────────────────────────────────────────────────

function populateShootDealDropdown() {
  const sel = document.getElementById('shoot-deal');
  if (!sel) return;
  const deals = load(KEYS.deals).filter(d => ['pitched','negotiating','signed'].includes(d.status));
  sel.innerHTML = `<option value="">— None —</option>` +
    deals.map(d => `<option value="${d.id}">${d.brand}</option>`).join('');
}

// ── Populate shoot modal for editing ──────────────────────────────────────────

function populateShootModal(id) {
  const s = load(KEYS.shoots).find(x => x.id === id);
  if (!s) return;
  document.getElementById('shoot-modal-title').textContent = 'Edit Shoot';
  document.getElementById('shoot-title').value = s.title  || '';
  document.getElementById('shoot-date').value  = s.date   || '';
  document.getElementById('shoot-time').value  = s.time   || '';
  document.getElementById('shoot-type').value  = s.type   || 'shoot';
  document.getElementById('shoot-deal').value  = s.dealId || '';
  document.getElementById('shoot-notes').value = s.notes  || '';

  document.querySelectorAll('.shoot-type-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-val') === (s.type || 'shoot'));
  });
}

// ── Save shoot ─────────────────────────────────────────────────────────────────

function saveShoot() {
  const title = document.getElementById('shoot-title').value.trim();
  const date  = document.getElementById('shoot-date').value;
  if (!title) { alert('Please enter a title.'); return; }
  if (!date)  { alert('Please pick a date.'); return; }

  const dealId  = document.getElementById('shoot-deal').value;
  const deals   = load(KEYS.deals);
  const deal    = deals.find(d => d.id === dealId);

  // Preserve done state when editing
  const existing = editingId ? load(KEYS.shoots).find(s => s.id === editingId) : null;

  const shoot = {
    id:        editingId || uid(),
    title,
    date,
    time:      document.getElementById('shoot-time').value || '',
    type:      document.getElementById('shoot-type').value,
    dealId:    dealId || '',
    dealLabel: deal ? deal.brand : '',
    notes:     document.getElementById('shoot-notes').value.trim(),
    done:      existing ? (existing.done || false) : false,
    updated:   new Date().toISOString(),
  };

  let data = load(KEYS.shoots);
  if (editingId) {
    data = data.map(s => s.id === editingId ? shoot : s);
  } else {
    data.push(shoot);
  }
  save(KEYS.shoots, data);
  closeModal('shoot');
  renderCalendar();
  if (typeof renderOverview === 'function') renderOverview();
}

// ── Hook into openModal / confirmDelete ───────────────────────────────────────

(function patchCalendarHooks() {
  const _origOpen = openModal;
  openModal = function(type, id) {
    _origOpen(type, id);
    if (type === 'shoot') {
      populateShootDealDropdown();
      if (id) populateShootModal(id);
    }
  };

  const _origDel = confirmDelete;
  confirmDelete = function(type, id) {
    if (type === 'shoot') {
      const btn = document.getElementById('confirm-delete-btn');
      document.getElementById('modal-confirm').classList.add('open');
      btn.onclick = () => {
        save(KEYS.shoots, load(KEYS.shoots).filter(s => s.id !== id));
        closeModal('confirm');
        renderCalendar();
        if (typeof renderOverview === 'function') renderOverview();
      };
    } else {
      _origDel(type, id);
    }
  };
})();

// ── showPage hook ─────────────────────────────────────────────────────────────

(function () {
  const _orig = showPage;
  showPage = function (name) {
    _orig(name);
    if (name === 'calendar') {
      closeEventPopover();
      renderCalendar();
    }
  };
})();
