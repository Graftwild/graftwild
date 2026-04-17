// ═══════════════════ CONTENT IDEAS ═══════════════════

function renderIdeas(search = '') {
  let data = load(KEYS.ideas);
  if (filters.ideas !== 'all') data = data.filter(d => d.status === filters.ideas);
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(d => (d.title + d.tags + d.notes + d.source).toLowerCase().includes(q));
  }
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  data.sort((a,b) => (priorityOrder[a.priority]||1) - (priorityOrder[b.priority]||1));

  const grid = document.getElementById('ideas-grid');
  if (!data.length) {
    grid.innerHTML = '<div class="no-items">No ideas found. Capture your first content idea.</div>';
    return;
  }
  grid.innerHTML = data.map(d => {
    const tags = d.tags ? d.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
    return `
    <div class="idea-card">
      <div class="idea-card-header">
        <div class="idea-card-title">
          <span class="priority-dot priority-${d.priority}"></span>${d.title}
        </div>
        ${badge(d.status, ideaStatusBadge[d.status] || 'badge-gray')}
      </div>
      <div class="idea-card-meta">
        ${badge(d.platform, 'badge-gray')}
        <span class="idea-card-source">${cap(d.source)}</span>
      </div>
      ${tags ? `<div>${tags}</div>` : ''}
      ${d.hooks ? `<div class="idea-card-hooks"><span class="idea-card-hooks-label">Hook options</span>${d.hooks}</div>` : ''}
      ${d.notes ? `<div class="idea-card-notes">${d.notes}</div>` : ''}
      <div class="idea-card-actions">
        <button class="btn btn-ghost btn-sm" onclick="openModal('idea','${d.id}')">Edit</button>
        <select class="btn btn-ghost btn-sm" onchange="quickUpdateStatus('ideas','${d.id}',this.value)">
          <option value="">Move to...</option>
          <option value="idea">Idea</option>
          <option value="scripted">Scripted</option>
          <option value="filmed">Filmed</option>
          <option value="edited">Edited</option>
          <option value="published">Published</option>
        </select>
        <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDelete('idea','${d.id}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

function quickUpdateStatus(section, id, status) {
  if (!status) return;
  const key = section === 'ideas' ? KEYS.ideas : KEYS.igq;
  const data = load(key).map(d => d.id === id ? { ...d, status } : d);
  save(key, data);
  if (section === 'ideas') renderIdeas();
  else renderSignals();
}

function populateIdeaModal(id) {
  const d = load(KEYS.ideas).find(x => x.id === id);
  if (!d) return;
  document.getElementById('idea-modal-title').textContent = 'Edit Content Idea';
  document.getElementById('idea-title').value    = d.title || '';
  document.getElementById('idea-source').value   = d.source || 'audience question';
  document.getElementById('idea-platform').value = d.platform || 'instagram reel';
  document.getElementById('idea-priority').value = d.priority || 'medium';
  document.getElementById('idea-status').value   = d.status || 'idea';
  document.getElementById('idea-tags').value     = d.tags || '';
  document.getElementById('idea-hooks').value    = d.hooks || '';
  document.getElementById('idea-notes').value    = d.notes || '';
}

function saveIdea() {
  const title = document.getElementById('idea-title').value.trim();
  if (!title) { alert('Please enter an idea title.'); return; }
  const idea = {
    id:       editingId || uid(),
    title,
    source:   document.getElementById('idea-source').value,
    platform: document.getElementById('idea-platform').value,
    priority: document.getElementById('idea-priority').value,
    status:   document.getElementById('idea-status').value,
    tags:     document.getElementById('idea-tags').value.trim(),
    hooks:    document.getElementById('idea-hooks').value.trim(),
    notes:    document.getElementById('idea-notes').value.trim(),
    updated:  new Date().toISOString(),
  };
  let data = load(KEYS.ideas);
  if (editingId) {
    data = data.map(d => d.id === editingId ? idea : d);
  } else {
    data.push(idea);
  }
  save(KEYS.ideas, data);
  closeModal('idea');
  renderIdeas();
}

// ── AI-powered idea generator ─────────────────────────────────────────────────
async function generateIdea() {
  const btn = document.getElementById('generate-idea-btn');

  // ── Get or prompt for API key ──
  let apiKey = localStorage.getItem('gw_anthropic_key') || '';
  if (!apiKey) {
    apiKey = (prompt(
      'Enter your Anthropic API key to generate ideas with AI.\n' +
      'Get one at: console.anthropic.com\n\n' +
      'Your key is stored locally in your browser only.'
    ) || '').trim();
    if (!apiKey) return;
    localStorage.setItem('gw_anthropic_key', apiKey);
  }

  // ── Build context from live dashboard data ──
  const deals   = load(KEYS.deals).filter(d => ['signed','negotiating','pitched'].includes(d.status));
  const ideas   = load(KEYS.ideas);
  const existingTitles = ideas.map(d => d.title).join('\n- ');
  const dealContext = deals.length
    ? deals.map(d => `${d.brand} (${d.status}${d.value ? ', $' + d.value : ''})`).join(', ')
    : 'none currently';

  const prompt_text = `You are a content strategist for Stryder Graft, a Florida-based creator behind Graftwild — a brand built around homesteading, backyard chickens, Florida fishing/foraging, and outdoor living. He has 17.4K Instagram followers. His best content is authentic, specific, and ties real life on the land to relatable human experiences.

Active brand deals: ${dealContext}

Ideas already in his list (do not repeat these):
- ${existingTitles || 'none yet'}

Generate ONE fresh, highly specific content idea that would perform well for his audience. It must feel real and filmable — not generic. If there's an active brand deal, consider weaving it in naturally.

Respond ONLY with valid JSON in this exact shape:
{
  "title": "...",
  "platform": "instagram reel" | "youtube" | "tiktok" | "instagram post" | "shorts" | "multi-platform",
  "priority": "high" | "medium" | "low",
  "source": "own idea" | "audience question" | "brand request" | "trending" | "ig comment",
  "tags": "comma, separated, tags",
  "notes": "2-4 sentences: the hook, why it works for his audience, and any production tips."
}`;

  // ── Show loading state ──
  if (btn) { btn.textContent = '⏳ Generating...'; btn.disabled = true; }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt_text }],
      }),
    });

    if (res.status === 401) {
      localStorage.removeItem('gw_anthropic_key');
      alert('Invalid API key — it has been cleared. Please try again.');
      if (btn) { btn.textContent = '✨ Generate Idea'; btn.disabled = false; }
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data   = await res.json();
    const raw    = data.content?.[0]?.text || '';
    const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) throw new Error('Could not parse response from AI.');

    const idea = JSON.parse(jsonStr);

    // ── Pre-fill the Add Idea modal ──
    editingId   = null;
    editingType = 'idea';
    document.getElementById('modal-idea').classList.add('open');
    clearModal('idea');
    document.getElementById('idea-title').value    = idea.title    || '';
    document.getElementById('idea-platform').value = idea.platform || 'instagram reel';
    document.getElementById('idea-priority').value = idea.priority || 'high';
    document.getElementById('idea-source').value   = idea.source   || 'own idea';
    document.getElementById('idea-tags').value     = idea.tags     || '';
    document.getElementById('idea-notes').value    = idea.notes    || '';
    document.getElementById('idea-modal-title').textContent = '✨ AI-Generated Idea';

    if (btn) { btn.textContent = '✨ Generate Idea'; btn.disabled = false; }

  } catch (e) {
    alert('Error generating idea: ' + e.message);
    if (btn) { btn.textContent = '✨ Generate Idea'; btn.disabled = false; }
  }
}
