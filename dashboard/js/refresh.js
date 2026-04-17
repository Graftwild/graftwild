'use strict';

// ═══════════════════ REFRESH BUTTON ═══════════════════
// Connects to the local server's /api/refresh SSE endpoint, streams
// live pipeline output into a floating log panel, and offers a
// one-click reload when the fetch is complete.
//
// Gracefully degrades when the dashboard is opened via file://:
// shows instructions to start the server instead.

(function () {
  const IS_SERVER = window.location.protocol !== 'file:';

  // ── Build floating log panel ────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'refresh-panel';
  Object.assign(panel.style, {
    position:     'fixed',
    bottom:       '20px',
    right:        '20px',
    width:        '400px',
    maxHeight:    '340px',
    background:   'var(--card2)',
    border:       '1px solid var(--border)',
    borderRadius: '10px',
    boxShadow:    '0 8px 36px rgba(0,0,0,0.55)',
    zIndex:       '600',
    overflow:     'hidden',
    display:      'none',
    flexDirection:'column',
  });

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
                padding:11px 16px;border-bottom:1px solid var(--border)">
      <span id="refresh-panel-title"
            style="font-size:13px;font-weight:600;color:var(--text)">&#8635; Instagram Refresh</span>
      <button onclick="document.getElementById('refresh-panel').style.display='none'"
              style="background:none;border:none;color:var(--muted);cursor:pointer;
                     font-size:20px;line-height:1;padding:0 4px">&#215;</button>
    </div>
    <div id="refresh-log"
         style="flex:1;overflow-y:auto;padding:10px 14px;
                font-size:11px;font-family:ui-monospace,'SF Mono',monospace;
                color:var(--muted);line-height:1.75;min-height:100px"></div>
    <div id="refresh-reload-bar"
         style="display:none;padding:10px 14px;border-top:1px solid var(--border)">
      <button class="btn btn-primary"
              onclick="location.reload()"
              style="width:100%;justify-content:center">
        Reload Dashboard
      </button>
    </div>
  `;

  document.body.appendChild(panel);

  // ── Helpers ─────────────────────────────────────────────────────────────
  function showPanel() {
    panel.style.display      = 'flex';
    panel.style.borderColor  = 'var(--border)';
    document.getElementById('refresh-log').innerHTML = '';
    document.getElementById('refresh-reload-bar').style.display = 'none';
  }

  function logLine(text, color) {
    const log = document.getElementById('refresh-log');
    const div = document.createElement('div');
    if (color) div.style.color = color;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function setBtnState(busy) {
    const btn = document.getElementById('refresh-btn');
    if (!btn) return;
    btn.disabled    = busy;
    btn.textContent = busy ? '↻  Refreshing…' : '↻  Refresh Data';
  }

  // ── Main trigger ─────────────────────────────────────────────────────────
  window.triggerRefresh = function () {
    if (!IS_SERVER) {
      alert(
        'The Refresh button requires the dashboard server to be running.\n\n' +
        'One-time setup — paste this in Terminal:\n\n' +
        '  cd ~/Desktop/graftwild/ig-tool && node server.js\n\n' +
        'Then open:  http://localhost:8080\n' +
        '(bookmark that URL instead of the file)'
      );
      return;
    }

    setBtnState(true);
    showPanel();
    logLine('Connecting to server…');

    const es = new EventSource('/api/refresh');

    es.addEventListener('status', e => {
      logLine(JSON.parse(e.data).msg, 'var(--muted)');
    });

    es.addEventListener('step', e => {
      logLine(JSON.parse(e.data).msg, 'var(--green-lt)');
    });

    es.addEventListener('log', e => {
      logLine(JSON.parse(e.data).msg);
    });

    es.addEventListener('done', e => {
      logLine('✓  ' + JSON.parse(e.data).msg, '#5a9140');
      panel.style.borderColor = '#5a9140';
      document.getElementById('refresh-reload-bar').style.display = 'block';
      setBtnState(false);
      es.close();
    });

    es.addEventListener('error', e => {
      if (e.data) logLine('✗  ' + JSON.parse(e.data).msg, 'var(--red-lt)');
      panel.style.borderColor = 'var(--red)';
      setBtnState(false);
      es.close();
    });

    // Unexpected stream drop (server killed, network issue, etc.)
    es.onerror = function () {
      if (es.readyState === EventSource.CLOSED) return;
      logLine('✗  Stream closed unexpectedly', 'var(--red-lt)');
      panel.style.borderColor = 'var(--red)';
      setBtnState(false);
      es.close();
    };
  };
})();
