// ═══════════════════ BADGE HELPERS ═══════════════════

const dealStatusBadge = {
  'pitched':     'badge-blue',
  'negotiating': 'badge-gold',
  'signed':      'badge-green',
  'completed':   'badge-purple',
  'rejected':    'badge-red',
};

const outStatusBadge = {
  'to contact': 'badge-gray',
  'contacted':  'badge-blue',
  'replied':    'badge-gold',
  'in talks':   'badge-green',
  'closed':     'badge-purple',
};

const ideaStatusBadge = {
  'idea':      'badge-gray',
  'scripted':  'badge-blue',
  'filmed':    'badge-gold',
  'edited':    'badge-orange',
  'published': 'badge-green',
};

const igqStatusBadge = {
  'new':       'badge-blue',
  'planned':   'badge-gold',
  'filmed':    'badge-orange',
  'published': 'badge-green',
};

const catBadge = {
  'affiliate':   'badge-green',
  'brand deal':  'badge-gold',
  'merchandise': 'badge-blue',
  'consulting':  'badge-purple',
  'other':       'badge-gray',
};

function badge(text, cls) {
  return `<span class="badge ${cls}">${cap(text)}</span>`;
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function fmt$(n) {
  return '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}

function truncate(s, n = 40) {
  return s && s.length > n ? s.slice(0, n) + '…' : (s || '—');
}

