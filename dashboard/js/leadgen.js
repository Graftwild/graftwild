'use strict';

// ═══════════════════ LEAD GEN ═══════════════════
// Uses the stored Anthropic API key (same as ideas.js) to:
//  1. Scan brands in a niche and return structured leads
//  2. Draft a personalized pitch email for each lead

let _leadgenCurrentLead = null; // lead being drafted so we can save it

// ── Toggle panel visibility ────────────────────────────────────────────────

function toggleLeadGenPanel() {
  const panel = document.getElementById('leadgen-panel');
  const btn   = document.getElementById('leadgen-toggle-btn');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  btn.textContent = open ? 'Expand ↓' : 'Collapse ↑';
}

// ── Quick-fill query from chip ─────────────────────────────────────────────

function leadgenSetQuery(text) {
  const el = document.getElementById('leadgen-query');
  if (el) { el.value = text; el.focus(); }
}

// ── Get API key (shared with ideas.js) ────────────────────────────────────

function _lgGetApiKey() {
  let key = localStorage.getItem('gw_anthropic_key') || '';
  if (!key) {
    key = (prompt('Enter your Anthropic API key to use Lead Gen:') || '').trim();
    if (!key) return null;
    localStorage.setItem('gw_anthropic_key', key);
  }
  return key;
}

// ── Build creator context for prompts ─────────────────────────────────────

function _lgCreatorContext() {
  const deals    = load(KEYS.deals).map(d => d.brand);
  const outreach = load(KEYS.outreach).map(d => d.brand);
  const existing = [...new Set([...deals, ...outreach])].filter(Boolean);
  return `
Creator: Stryder Graft — Graftwild LLC
Niche: Backyard chickens, homesteading, foraging, outdoor living, Florida-based
Platform: Instagram (22.7K followers) + TikTok cross-post
Avg reel rate: $500. Engagement: high (181K views on top reel, 7.6K likes)
Audience: homesteaders, chicken keepers, outdoor/nature enthusiasts, people interested in clean/natural living
Already in talks or signed: ${existing.length ? existing.join(', ') : 'none yet'}`.trim();
}

// ── Scan for brand leads ────────────────────────────────────────────────────

async function scanLeads() {
  const query   = (document.getElementById('leadgen-query').value || '').trim();
  const count   = parseInt(document.getElementById('leadgen-count').value) || 10;
  const btn     = document.getElementById('leadgen-scan-btn');
  const results = document.getElementById('leadgen-results');

  if (!query) {
    document.getElementById('leadgen-query').focus();
    return;
  }

  const apiKey = _lgGetApiKey();
  if (!apiKey) return;

  btn.disabled    = true;
  btn.textContent = '⏳ Scanning...';
  results.innerHTML = `<div class="leadgen-loading">Finding brands in <em>${escHtml(query)}</em>…</div>`;

  const prompt = `You are a brand partnership assistant for a creator.

${_lgCreatorContext()}

The creator wants to find ${count} brands/companies in this niche: "${query}"

Return ONLY a valid JSON array (no markdown, no explanation) with exactly ${count} objects. Each object must have:
- "brand": company name (string)
- "website": their website URL (string, best guess if unsure — use format https://www.brandname.com)
- "contact_email": most likely partnership/collab email (string, e.g. collab@brand.com or partnerships@brand.com — make your best educated guess based on common patterns)
- "why_fit": 1–2 sentence explanation of why this brand fits Graftwild's audience (string)
- "pitch_angle": a specific content angle or hook idea for a collab (string, 1 sentence)
- "platform": where they're most active, e.g. "Instagram, Amazon" (string)
- "tier": estimated brand size — "small", "mid", or "large" (string)

Focus on brands that: sell physical products, align with clean/natural living, homesteading, chickens, or outdoor lifestyle, and would benefit from authentic creator content. Avoid brands already listed as existing partners.

Return only the JSON array. No other text.`;

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
        max_tokens: 2500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (res.status === 401) {
      localStorage.removeItem('gw_anthropic_key');
      throw new Error('Invalid API key — cleared. Please try again.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data  = await res.json();
    const raw   = data.content?.[0]?.text || '[]';
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/,'').trim();
    const leads = JSON.parse(clean);

    renderLeadResults(leads, query);

  } catch (err) {
    results.innerHTML = `<div class="leadgen-error">⚠️ ${escHtml(err.message)}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = '🔍 Find Brands';
  }
}

// ── Render lead cards ──────────────────────────────────────────────────────

function renderLeadResults(leads, query) {
  const el = document.getElementById('leadgen-results');
  if (!leads || !leads.length) {
    el.innerHTML = '<div class="leadgen-error">No leads returned — try a different query.</div>';
    return;
  }

  const tierColor = { small: '#5a9140', mid: '#d97706', large: '#3b82f6' };
  const tierLabel = { small: 'Small brand', mid: 'Mid-size', large: 'Large brand' };

  el.innerHTML = `
    <div class="leadgen-results-header">
      <span>${leads.length} brands found for <em>"${escHtml(query)}"</em></span>
      <button class="btn btn-ghost btn-sm" onclick="scanLeads()">↻ Refresh</button>
    </div>
    <div class="leadgen-grid">
      ${leads.map((lead, i) => {
        const color = tierColor[lead.tier] || '#5a9140';
        const label = tierLabel[lead.tier] || lead.tier;
        // Check if already in outreach
        const already = load(KEYS.outreach).some(
          o => o.brand.toLowerCase() === (lead.brand||'').toLowerCase()
        );
        return `
          <div class="leadgen-card" id="lgcard-${i}">
            <div class="leadgen-card-top">
              <div class="leadgen-card-brand">${escHtml(lead.brand)}</div>
              <span class="leadgen-tier-badge" style="background:${color}20;color:${color}">${label}</span>
            </div>
            <div class="leadgen-card-platform">${escHtml(lead.platform || '')}</div>
            <div class="leadgen-why">${escHtml(lead.why_fit || '')}</div>
            <div class="leadgen-angle">💡 ${escHtml(lead.pitch_angle || '')}</div>
            <div class="leadgen-contact">
              ${lead.website ? `<a href="${escHtml(lead.website)}" target="_blank" class="leadgen-link">🌐 ${escHtml(lead.website.replace('https://','').replace('http://',''))}</a>` : ''}
              ${lead.contact_email ? `<span class="leadgen-email">✉️ ${escHtml(lead.contact_email)}</span>` : ''}
            </div>
            <div class="leadgen-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="draftLeadEmail(${i})"
                      data-lead='${escAttr(JSON.stringify(lead))}'>
                ✉️ Draft Email
              </button>
              ${already
                ? `<span class="leadgen-already">✓ In outreach</span>`
                : `<button class="btn btn-ghost btn-sm" onclick="saveLeadToOutreach(${i})"
                          data-lead='${escAttr(JSON.stringify(lead))}'>+ Save Lead</button>`
              }
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ── Draft pitch email for a lead ───────────────────────────────────────────

async function draftLeadEmail(cardIdx) {
  const btn  = document.querySelector(`#lgcard-${cardIdx} button[onclick^="draftLeadEmail"]`);
  const lead = JSON.parse(btn.getAttribute('data-lead'));

  const apiKey = _lgGetApiKey();
  if (!apiKey) return;

  const origText   = btn.textContent;
  btn.disabled     = true;
  btn.textContent  = '⏳ Drafting...';

  const prompt = `You are writing a cold outreach email from a creator to a brand for a potential paid collaboration.

${_lgCreatorContext()}

Brand to pitch: ${lead.brand}
Their website: ${lead.website || 'unknown'}
Content angle to pitch: ${lead.pitch_angle || 'authentic product integration'}

Write a short, friendly, professional cold outreach email. It should:
- Have a compelling subject line on the first line, prefixed with "Subject: "
- Then a blank line
- Then the email body
- Be 150–220 words max
- Sound like a real person wrote it — warm, confident, not a template
- Mention a specific reason why Graftwild's audience is a fit for their brand
- Reference the pitch angle naturally
- Include a clear call to action (reply to discuss / hop on a quick call)
- Sign off as: Stryder Graft / Founder, Graftwild / stryder@graftwild.com

Do not use placeholder brackets like [NAME] — write a complete, ready-to-send email.`;

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
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (res.status === 401) {
      localStorage.removeItem('gw_anthropic_key');
      throw new Error('Invalid API key — cleared.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data  = await res.json();
    const email = data.content?.[0]?.text || '';

    // Extract subject vs body
    const lines   = email.trim().split('\n');
    const subjLine = lines.find(l => l.toLowerCase().startsWith('subject:')) || '';
    const subject  = subjLine.replace(/^subject:\s*/i, '').trim();
    const body     = lines.filter(l => !l.toLowerCase().startsWith('subject:')).join('\n').trim();

    // Show draft modal
    _leadgenCurrentLead = lead;
    document.getElementById('leadgen-draft-meta').innerHTML =
      `<strong>To:</strong> ${escHtml(lead.contact_email || lead.brand)} &nbsp;·&nbsp; <strong>Subject:</strong> ${escHtml(subject)}`;
    document.getElementById('leadgen-draft-body').value = body;
    document.getElementById('modal-leadgen-draft').classList.add('open');

  } catch (err) {
    alert('Draft failed: ' + err.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = origText;
  }
}

// ── Copy email to clipboard ────────────────────────────────────────────────

function leadgenCopyEmail() {
  const meta = document.getElementById('leadgen-draft-meta').textContent;
  const body = document.getElementById('leadgen-draft-body').value;
  navigator.clipboard.writeText(meta + '\n\n' + body).then(() => {
    const btn = document.querySelector('#modal-leadgen-draft .btn-ghost:nth-child(2)');
    if (btn) { const t = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = t, 1500); }
  });
}

// ── Save drafted lead to outreach tracker ─────────────────────────────────

function leadgenSaveToOutreach() {
  const lead  = _leadgenCurrentLead;
  const body  = document.getElementById('leadgen-draft-body').value;
  const meta  = document.getElementById('leadgen-draft-meta').textContent;
  if (!lead) return;

  const contact = {
    id:       uid(),
    name:     'Partnerships Team',
    brand:    lead.brand || '',
    email:    lead.contact_email || '',
    platform: 'email',
    status:   'to contact',
    date:     new Date().toISOString().split('T')[0],
    link:     lead.website || '',
    notes:    `Lead Gen — ${lead.why_fit || ''}\nPitch angle: ${lead.pitch_angle || ''}\n\nDrafted email:\n${meta}\n\n${body}`,
    updated:  new Date().toISOString(),
  };

  const data = load(KEYS.outreach);
  data.push(contact);
  save(KEYS.outreach, data);

  closeModal('leadgen-draft');
  renderOutreach();

  // Quick confirm
  const btn = document.querySelector('#modal-leadgen-draft .btn-primary');
  if (btn) { btn.textContent = '✓ Saved!'; setTimeout(() => btn.textContent = '+ Save to Outreach', 1200); }
}

// ── Save lead directly (no email drafted) ─────────────────────────────────

function saveLeadToOutreach(cardIdx) {
  const btn  = document.querySelector(`#lgcard-${cardIdx} button[onclick^="saveLeadToOutreach"]`);
  const lead = JSON.parse(btn.getAttribute('data-lead'));

  const contact = {
    id:       uid(),
    name:     'Partnerships Team',
    brand:    lead.brand || '',
    email:    lead.contact_email || '',
    platform: 'email',
    status:   'to contact',
    date:     new Date().toISOString().split('T')[0],
    link:     lead.website || '',
    notes:    `Lead Gen — ${lead.why_fit || ''}\nPitch angle: ${lead.pitch_angle || ''}`,
    updated:  new Date().toISOString(),
  };

  const data = load(KEYS.outreach);
  data.push(contact);
  save(KEYS.outreach, data);
  renderOutreach();

  // Swap button to "✓ In outreach"
  btn.outerHTML = `<span class="leadgen-already">✓ In outreach</span>`;
}

// ── HTML escape helpers ────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str || '').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}
