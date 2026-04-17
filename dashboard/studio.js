/* ─── Content Studio ─────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = '';  // same origin

  const LOADING_MSGS = [
    'Extracting frames\u2026',
    'Transcribing audio\u2026',
    'Analyzing with Claude\u2026',
  ];

  let dropZone, fileInput, dropIcon, dropLabel, dropSub,
      videoLabel, analyzeBtn,
      analyzeLoading, analyzeLoadingMsg, analyzeResult,
      profilesGrid, profilesLoading, profilesEmpty,
      masterBtn, masterLoading, masterWrapper, masterCards,
      reelDriveUrl, reelProjectName, reelDownloadBtn,
      reelLoading, reelClipsWrapper, reelClipsList, reelGenerateBtn, reelError;

  let selectedFile = null;

  // ── Boot ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    dropZone          = document.getElementById('studio-drop-zone');
    fileInput         = document.getElementById('studio-file-input');
    dropIcon          = document.getElementById('studio-drop-icon');
    dropLabel         = document.getElementById('studio-drop-label');
    dropSub           = document.getElementById('studio-drop-sub');
    videoLabel        = document.getElementById('studio-video-label');
    analyzeBtn        = document.getElementById('studio-analyze-btn');
    analyzeLoading    = document.getElementById('studio-analyze-loading');
    analyzeLoadingMsg = document.getElementById('studio-loading-msg');
    analyzeResult     = document.getElementById('studio-analyze-result');
    profilesGrid      = document.getElementById('studio-profiles-grid');
    profilesLoading   = document.getElementById('studio-profiles-loading');
    profilesEmpty     = document.getElementById('studio-profiles-empty');
    masterBtn         = document.getElementById('studio-master-btn');
    masterLoading     = document.getElementById('studio-master-loading');
    masterWrapper     = document.getElementById('studio-master-wrapper');
    masterCards       = document.getElementById('studio-master-cards');
    reelDriveUrl      = document.getElementById('reel-drive-url');
    reelProjectName   = document.getElementById('reel-project-name');
    reelDownloadBtn   = document.getElementById('reel-download-btn');
    reelLoading       = document.getElementById('reel-loading');
    reelClipsWrapper  = document.getElementById('reel-clips-wrapper');
    reelClipsList     = document.getElementById('reel-clips-list');
    reelGenerateBtn   = document.getElementById('reel-generate-btn');
    reelError         = document.getElementById('reel-error');

    if (!dropZone) return;

    initDropZone();
    initAnalyzeBtn();
    initMasterBtn();
    initReelGenerator();

    // Load profiles when studio tab is activated
    const studioTabBtn = document.querySelector('[data-tab="studio"]');
    if (studioTabBtn) studioTabBtn.addEventListener('click', loadStyleProfiles);
  });

  // ── Drop zone ─────────────────────────────────────────────────────────────
  function initDropZone() {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.classList.remove('dragover');
      if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
  }

  function setFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['mp4', 'mov', 'm4v'].includes(ext)) { alert('Only .mp4, .mov, and .m4v files are supported.'); return; }
    selectedFile = file;
    dropZone.classList.add('has-file');
    dropIcon.textContent  = '\u2713';
    dropLabel.textContent = file.name;
    dropSub.textContent   = fmtBytes(file.size);
    if (!videoLabel.value) videoLabel.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  }

  function fmtBytes(b) {
    return b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  }

  // ── Section 1: Analyze ────────────────────────────────────────────────────
  function initAnalyzeBtn() {
    analyzeBtn.addEventListener('click', async () => {
      if (!selectedFile) { alert('Select a video file first.'); return; }

      analyzeBtn.disabled = true;
      analyzeResult.style.display = 'none';
      analyzeResult.innerHTML = '';
      analyzeLoading.style.display = 'flex';

      let msgIdx = 0;
      analyzeLoadingMsg.textContent = LOADING_MSGS[0];
      const ticker = setInterval(() => {
        msgIdx = (msgIdx + 1) % LOADING_MSGS.length;
        analyzeLoadingMsg.textContent = LOADING_MSGS[msgIdx];
      }, 5000);

      try {
        const fd = new FormData();
        fd.append('video', selectedFile);
        fd.append('label', videoLabel.value.trim());
        const res  = await fetch(`${API}/api/analyze-video`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Analysis failed');

        clearInterval(ticker);
        analyzeLoading.style.display = 'none';
        analyzeResult.innerHTML = renderFullWidth(data);
        analyzeResult.style.display = 'block';
        loadStyleProfiles();
      } catch (err) {
        clearInterval(ticker);
        analyzeLoading.style.display = 'none';
        analyzeResult.innerHTML = `<div class="empty-state" style="color:#c85a2a">Error: ${esc(err.message)}</div>`;
        analyzeResult.style.display = 'block';
      } finally {
        analyzeBtn.disabled = false;
      }
    });
  }

  // ── Section 2: Style Profiles ─────────────────────────────────────────────
  async function loadStyleProfiles() {
    profilesLoading.style.display = 'flex';
    profilesGrid.innerHTML = '';
    profilesEmpty.style.display = 'none';

    try {
      const res  = await fetch(`${API}/api/style-profiles`);
      const list = await res.json();
      profilesLoading.style.display = 'none';

      if (!Array.isArray(list) || !list.length) { profilesEmpty.style.display = 'block'; return; }

      profilesGrid.innerHTML = `
        <div class="studio-profile-summary-grid" id="studio-profile-summary-grid">
          ${list.map((p, i) => renderSummaryCard(p, i)).join('')}
        </div>
        <div class="studio-profile-panel" id="studio-profile-panel" style="display:none"></div>
      `;

      list.forEach((profile, i) => {
        const card = document.getElementById(`studio-pcard-${i}`);
        if (card) card.addEventListener('click', (e) => {
          if (e.target.closest('.studio-rename-btn, .studio-rename-save, .studio-rename-input')) return;
          toggleProfilePanel(profile, i);
        });
        const renameBtn = document.getElementById(`studio-rename-${i}`);
        if (renameBtn) renameBtn.addEventListener('click', (e) => { e.stopPropagation(); startRename(i, profile); });
      });
    } catch (err) {
      profilesLoading.style.display = 'none';
      profilesEmpty.textContent = 'Could not load profiles: ' + err.message;
      profilesEmpty.style.display = 'block';
    }
  }

  function renderSummaryCard({ filename, data }, i) {
    const title   = data.title || filename.replace(/\.json$/, '').replace(/[_-]+/g, ' ');
    const fp      = data.style_fingerprint || '';
    const preview = fp.length > 120 ? fp.slice(0, 120) + '\u2026' : fp;
    return `
      <div class="studio-profile-summary-card" id="studio-pcard-${i}" data-filename="${esc(filename)}">
        <div class="studio-psummary-title-row">
          <div class="studio-psummary-title" id="studio-title-display-${i}">${esc(title)}</div>
          <button class="studio-rename-btn" id="studio-rename-${i}" title="Rename">&#9998;</button>
        </div>
        ${preview ? `<div class="studio-psummary-preview">${esc(preview)}</div>` : ''}
        <div class="studio-psummary-expand">View breakdown &#9660;</div>
      </div>`;
  }

  function startRename(i, profile) {
    const titleEl = document.getElementById(`studio-title-display-${i}`);
    if (!titleEl) return;
    const currentTitle = titleEl.textContent;
    const titleRow = titleEl.parentElement;

    titleRow.innerHTML = `
      <input class="studio-rename-input" id="studio-rename-input-${i}" value="${esc(currentTitle)}" maxlength="80">
      <button class="studio-rename-save" id="studio-rename-save-${i}" title="Save">&#10003;</button>`;

    const input   = document.getElementById(`studio-rename-input-${i}`);
    const saveBtn = document.getElementById(`studio-rename-save-${i}`);
    input.focus(); input.select();

    function restore(title) {
      titleRow.innerHTML = `
        <div class="studio-psummary-title" id="studio-title-display-${i}">${esc(title)}</div>
        <button class="studio-rename-btn" id="studio-rename-${i}" title="Rename">&#9998;</button>`;
      document.getElementById(`studio-rename-${i}`)
        .addEventListener('click', (e) => { e.stopPropagation(); startRename(i, profile); });
    }

    function save() {
      const newTitle = input.value.trim();
      if (!newTitle) { restore(currentTitle); return; }
      fetch(`${API}/api/style-profiles/${encodeURIComponent(profile.filename)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      }).then(r => r.json()).then(data => {
        if (data.success) {
          profile.data.title = data.title;
          restore(data.title);
          if (_openPanelIdx === i) {
            const pt = document.querySelector('.studio-panel-title');
            if (pt) pt.textContent = data.title;
          }
        } else { restore(currentTitle); }
      }).catch(() => restore(currentTitle));
    }

    saveBtn.addEventListener('click', (e) => { e.stopPropagation(); save(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); restore(currentTitle); }
    });
  }

  let _openPanelIdx = null;

  function toggleProfilePanel(profile, i) {
    const panel    = document.getElementById('studio-profile-panel');
    const allCards = document.querySelectorAll('.studio-profile-summary-card');

    if (_openPanelIdx === i) {
      panel.style.display = 'none'; panel.innerHTML = '';
      _openPanelIdx = null;
      allCards.forEach(c => c.classList.remove('active'));
      return;
    }

    _openPanelIdx = i;
    allCards.forEach(c => c.classList.remove('active'));
    document.getElementById(`studio-pcard-${i}`).classList.add('active');

    const title = profile.data.title || profile.filename.replace(/\.json$/, '').replace(/[_-]+/g, ' ');
    panel.innerHTML = `
      <div class="studio-panel-header">
        <span class="studio-panel-title">${esc(title)}</span>
        <button class="studio-panel-close" id="studio-panel-close">&times;</button>
      </div>
      <div class="studio-panel-body">${renderFullWidth(profile.data)}</div>`;
    panel.style.display = 'block';

    document.getElementById('studio-panel-close').addEventListener('click', () => {
      panel.style.display = 'none'; panel.innerHTML = '';
      _openPanelIdx = null;
      allCards.forEach(c => c.classList.remove('active'));
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Section 3: Master Style Guide ─────────────────────────────────────────
  function initMasterBtn() {
    masterBtn.addEventListener('click', async () => {
      masterBtn.disabled = true;
      masterWrapper.style.display = 'none';
      masterCards.innerHTML = '';
      masterLoading.style.display = 'flex';

      try {
        const res  = await fetch(`${API}/api/style-master`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Generation failed');
        masterLoading.style.display = 'none';
        masterCards.innerHTML = renderFullWidth(data);
        masterWrapper.style.display = 'block';
      } catch (err) {
        masterLoading.style.display = 'none';
        masterCards.innerHTML = `<div class="empty-state" style="color:#c85a2a">Error: ${esc(err.message)}</div>`;
        masterWrapper.style.display = 'block';
      } finally {
        masterBtn.disabled = false;
      }
    });
  }

  // ── Section 4: Reel Generator ─────────────────────────────────────────────
  function initReelGenerator() {
    if (!reelDownloadBtn) return;
    reelDownloadBtn.addEventListener('click', async () => {
      const url     = reelDriveUrl.value.trim();
      const project = reelProjectName.value.trim();
      reelError.style.display = 'none';

      if (!url)     { showReelError('Enter a Google Drive folder URL.'); return; }
      if (!project) { showReelError('Enter a project name.'); return; }
      if (!/^[a-z0-9_-]+$/i.test(project)) { showReelError('Project name may only contain letters, numbers, hyphens, and underscores.'); return; }

      reelDownloadBtn.disabled       = true;
      reelClipsWrapper.style.display = 'none';
      reelClipsList.innerHTML        = '';
      reelLoading.style.display      = 'flex';

      try {
        const res  = await fetch(`${API}/api/download-clips`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drive_url: url, project_name: project }),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(text || `Server error (${res.status})`); }
        if (!res.ok) throw new Error(data.error || 'Download failed');

        reelLoading.style.display = 'none';
        renderClipsList(data.clips);
        reelClipsWrapper.style.display = 'block';
      } catch (err) {
        reelLoading.style.display = 'none';
        showReelError(err.message);
      } finally {
        reelDownloadBtn.disabled = false;
      }
    });
  }

  function renderClipsList(clips) {
    if (!clips || !clips.length) {
      reelClipsList.innerHTML = '<div class="reel-empty">No video clips found in that folder.</div>';
      return;
    }
    reelClipsList.innerHTML = `
      <div class="reel-clips-table">
        <div class="reel-clips-header"><span>Filename</span><span>Size</span><span>Duration</span></div>
        ${clips.map(c => `
          <div class="reel-clip-row">
            <span class="reel-clip-name">${esc(c.filename)}</span>
            <span class="reel-clip-meta">${c.size_mb} MB</span>
            <span class="reel-clip-meta">${c.duration_seconds != null ? c.duration_seconds + 's' : '—'}</span>
          </div>`).join('')}
      </div>`;
  }

  function showReelError(msg) { reelError.textContent = msg; reelError.style.display = 'block'; }

  // ── Full-width 3-column layout ─────────────────────────────────────────────
  function renderFullWidth(data) {
    const col1 = [], col2 = [], col3 = [], bottom = [];

    if (data.hook) {
      const h = data.hook;
      col1.push(card('Hook', kv('Opens', h.description) + kv('Type', h.hook_type) + kv('At', h.timestamp)));
    }
    if (data.caption_style) {
      const c = data.caption_style;
      col1.push(card('Caption Style',
        kv('Density', c.density) + kv('Tone', c.tone) +
        (c.example_caption ? kv('Example', `<em>&ldquo;${esc(c.example_caption)}&rdquo;</em>`) : '')));
    }
    if (Array.isArray(data.text_overlays)) {
      const items = sortByTs(data.text_overlays);
      col2.push(card('Text Overlays', items.length
        ? `<div class="studio-timeline">${items.map(o => tlItem(o.timestamp,
            (o.text || '\u2014') + (o.emoji ? ' ' + o.emoji : ''),
            [o.position, o.font_style].filter(Boolean).join(' \u00b7') + (o.duration_seconds ? ` \u00b7 ${o.duration_seconds}s` : '')
          )).join('')}</div>`
        : '<span class="studio-tl-sub">None detected</span>'));
    }
    if (Array.isArray(data.zooms)) {
      const items = sortByTs(data.zooms);
      col3.push(card('Zooms', items.length
        ? `<div class="studio-timeline">${items.map(z => tlItem(z.timestamp,
            [z.direction, z.speed].filter(Boolean).join(' \u00b7'), z.subject
          )).join('')}</div>`
        : '<span class="studio-tl-sub">None detected</span>'));
    }
    if (data.audio) {
      const a = data.audio;
      const moments  = Array.isArray(a.key_sound_moments) ? a.key_sound_moments : [];
      const silences = Array.isArray(a.silence_moments)   ? a.silence_moments   : [];
      col3.push(card('Audio',
        kv('Type', a.type) +
        moments.map(m => kv(m.timestamp || '?', m.description)).join('') +
        (silences.length ? kv('Silence', silences.map(String).join(', ')) : '')));
    }
    if (data.pacing) {
      const p = data.pacing, cuts = Array.isArray(p.cut_timestamps) ? p.cut_timestamps : [];
      bottom.push(card('Pacing',
        kv('Overall', p.overall) + kv('Feel', p.rhythm_description) +
        (cuts.length ? `<div class="studio-kv"><span class="studio-kv-key">Cuts</span><span class="studio-kv-val"><div class="studio-chips">${cuts.map(c => `<span class="studio-chip">${esc(String(c))}</span>`).join('')}</div></span></div>` : ''),
        'full'));
    }
    if (data.style_fingerprint) {
      bottom.push(card('Style Fingerprint', `<p class="studio-fingerprint-text">${esc(data.style_fingerprint)}</p>`, 'full'));
    }
    if (!col1.length && !col2.length && !col3.length && !bottom.length) {
      bottom.push(card('Style Guide',
        Object.entries(data).filter(([k]) => k !== 'title')
          .map(([k, v]) => kv(k, typeof v === 'object' ? JSON.stringify(v) : String(v))).join(''), 'full'));
    }

    const hasColumns = col1.length || col2.length || col3.length;
    return (hasColumns ? `<div class="studio-layout-3col">
      <div class="studio-layout-col">${col1.join('')}</div>
      <div class="studio-layout-col">${col2.join('')}</div>
      <div class="studio-layout-col">${col3.join('')}</div>
    </div>` : '') +
    (bottom.length ? `<div class="studio-layout-bottom">${bottom.join('')}</div>` : '');
  }

  // ── Primitives ────────────────────────────────────────────────────────────
  function card(title, body, width) {
    return `<div class="studio-card${width === 'full' ? ' full-width' : ''}">
      <div class="studio-card-header"><span class="studio-card-title">${esc(title)}</span></div>
      <div class="studio-card-body">${body}</div>
    </div>`;
  }

  function kv(key, val) {
    if (!val && val !== 0) return '';
    const v = (typeof val === 'string' && /^</.test(val)) ? val : esc(String(val));
    return `<div class="studio-kv"><span class="studio-kv-key">${esc(String(key))}</span><span class="studio-kv-val">${v}</span></div>`;
  }

  function tlItem(ts, label, sub) {
    return `<div class="studio-tl-item">
      <span class="studio-ts">${esc(ts || '?')}</span>
      <div class="studio-tl-body">
        ${label ? `<div class="studio-tl-label">${esc(String(label))}</div>` : ''}
        ${sub   ? `<div class="studio-tl-sub">${esc(String(sub))}</div>`   : ''}
      </div>
    </div>`;
  }

  function sortByTs(arr) { return [...arr].sort((a, b) => ts2s(a.timestamp) - ts2s(b.timestamp)); }
  function ts2s(ts) {
    if (!ts || typeof ts !== 'string') return 0;
    const p = ts.split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
  }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
