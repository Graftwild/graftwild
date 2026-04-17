// ═══════════════════ DATA STORE ═══════════════════

const KEYS = {
  deals:    'gw_deals',
  outreach: 'gw_outreach',
  revenue:  'gw_revenue',
  ideas:    'gw_ideas',
  igq:      'gw_igq',
  shoots:   'gw_shoots',
};

function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}

function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ═══════════════════ NAVIGATION ═══════════════════

let currentPage = 'overview';

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`nav a[data-page="${page}"]`).classList.add('active');
  currentPage = page;
  refreshPage(page);
}

function refreshPage(page) {
  if (page === 'overview')  renderOverview();
  if (page === 'deals')     renderDeals();
  if (page === 'outreach')  renderOutreach();
  if (page === 'ideas')     renderIdeas();
  if (page === 'signals')   renderSignals();
  if (page === 'calendar')  renderCalendar();
}

// ═══════════════════ FILTERS ═══════════════════

const filters = { deals: 'all', outreach: 'all', ideas: 'all', signals: 'all' };

function setFilter(section, value, btn) {
  filters[section] = value;
  btn.closest('.filter-row').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (section === 'deals')    renderDeals();
  if (section === 'outreach') renderOutreach();
  if (section === 'ideas')    renderIdeas();
  if (section === 'signals')  renderSignals();
}

// ═══════════════════ MODALS ═══════════════════

let editingId = null;
let editingType = null;

function openModal(type, id = null) {
  editingId = id;
  editingType = type;
  const backdrop = document.getElementById('modal-' + type);
  if (!backdrop) return;
  backdrop.classList.add('open');

  if (id) {
    if (type === 'deal')     populateDealModal(id);
    if (type === 'outreach') populateOutreachModal(id);
    if (type === 'idea')     populateIdeaModal(id);
    if (type === 'igq')      populateIgqModal(id);
    if (type === 'shoot')    populateShootModal(id);
  } else {
    clearModal(type);
    const today = new Date().toISOString().split('T')[0];
    if (type === 'outreach') document.getElementById('out-date').value  = today;
    if (type === 'igq')      document.getElementById('igq-date').value  = today;
    if (type === 'shoot')    document.getElementById('shoot-date').value = today;
  }
}

function closeModal(type) {
  const el = document.getElementById('modal-' + type);
  if (el) el.classList.remove('open');
  editingId = null;
  editingType = null;
}

function clearModal(type) {
  const modal = document.getElementById('modal-' + type);
  if (!modal) return;
  modal.querySelectorAll('input, textarea').forEach(el => el.value = '');
  modal.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  if (type === 'deal')     document.getElementById('deal-modal-title').textContent     = 'Add Brand Deal';
  if (type === 'outreach') document.getElementById('outreach-modal-title').textContent = 'Add Contact';
  if (type === 'idea')     document.getElementById('idea-modal-title').textContent     = 'Add Content Idea';
  if (type === 'igq')      document.getElementById('igq-modal-title').textContent      = 'Add IG Question';
  if (type === 'shoot')    document.getElementById('shoot-modal-title').textContent    = 'Add Shoot';
}

// close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(b => {
  b.addEventListener('click', e => {
    if (e.target === b) b.classList.remove('open');
  });
});

// ═══════════════════ CONFIRM DELETE ═══════════════════

let pendingDelete = null;

function confirmDelete(type, id) {
  pendingDelete = { type, id };
  document.getElementById('modal-confirm').classList.add('open');
  document.getElementById('confirm-delete-btn').onclick = executeDelete;
}

function executeDelete() {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;
  const map = {
    deal:     KEYS.deals,
    outreach: KEYS.outreach,
    idea:     KEYS.ideas,
    igq:      KEYS.igq,
    shoot:    KEYS.shoots,
  };
  const key = map[type];
  if (!key) return;
  const data = load(key).filter(d => d.id !== id);
  save(key, data);
  closeModal('confirm');
  pendingDelete = null;
  refreshPage(currentPage);
}
