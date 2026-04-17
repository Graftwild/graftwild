// ═══════════════════ OUTREACH ═══════════════════

function renderOutreach(search = '') {
  let data = load(KEYS.outreach);
  if (filters.outreach !== 'all') data = data.filter(d => d.status === filters.outreach);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(d => (d.name + d.brand + d.email + d.notes).toLowerCase().includes(q));
  }
  data.sort((a,b) => (a.name||'').localeCompare(b.name||''));
  document.getElementById('outreach-count').textContent = `${data.length} contact${data.length !== 1 ? 's' : ''}`;
  const tbody = document.getElementById('outreach-tbody');
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No contacts found. Start tracking your outreach.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(d => `
    <tr>
      <td><strong>${d.name}</strong></td>
      <td>${d.brand || '—'}</td>
      <td>${d.platform ? badge(d.platform, 'badge-gray') : '—'}</td>
      <td class="td-muted">${d.email || (d.link ? `<a href="${d.link.startsWith('http') ? d.link : '#'}" class="link-external">${truncate(d.link,25)}</a>` : '—')}</td>
      <td>${badge(d.status, outStatusBadge[d.status] || 'badge-gray')}</td>
      <td>${fmtDate(d.date)}</td>
      <td class="td-muted td-wrap">${truncate(d.notes)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-ghost btn-sm" onclick="openModal('outreach','${d.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDelete('outreach','${d.id}')">Del</button>
        </div>
      </td>
    </tr>`).join('');
}

function populateOutreachModal(id) {
  const d = load(KEYS.outreach).find(x => x.id === id);
  if (!d) return;
  document.getElementById('outreach-modal-title').textContent = 'Edit Contact';
  document.getElementById('out-name').value     = d.name || '';
  document.getElementById('out-brand').value    = d.brand || '';
  document.getElementById('out-email').value    = d.email || '';
  document.getElementById('out-platform').value = d.platform || 'instagram';
  document.getElementById('out-status').value   = d.status || 'to contact';
  document.getElementById('out-date').value     = d.date || '';
  document.getElementById('out-link').value     = d.link || '';
  document.getElementById('out-notes').value    = d.notes || '';
}

function saveOutreach() {
  const name = document.getElementById('out-name').value.trim();
  if (!name) { alert('Please enter a contact name.'); return; }
  const contact = {
    id:       editingId || uid(),
    name,
    brand:    document.getElementById('out-brand').value.trim(),
    email:    document.getElementById('out-email').value.trim(),
    platform: document.getElementById('out-platform').value,
    status:   document.getElementById('out-status').value,
    date:     document.getElementById('out-date').value,
    link:     document.getElementById('out-link').value.trim(),
    notes:    document.getElementById('out-notes').value.trim(),
    updated:  new Date().toISOString(),
  };
  let data = load(KEYS.outreach);
  if (editingId) {
    data = data.map(d => d.id === editingId ? contact : d);
  } else {
    data.push(contact);
  }
  save(KEYS.outreach, data);
  closeModal('outreach');
  renderOutreach();
}
