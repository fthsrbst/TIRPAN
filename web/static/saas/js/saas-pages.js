/* saas-pages.js — Page controllers */

/* ──────────────────────────────────────────────────────────
   SCAN PROFILES
   ────────────────────────────────────────────────────────── */
const SCAN_PROFILES = {
  quick: {
    key: 'quick',
    label: 'Quick Discovery',
    icon: 'bolt',
    color: '#06b6d4',
    tag: 'cyan',
    desc: 'Fast host & port discovery. No exploitation. Safe for production.',
    time: '~5 min',
    payload: {
      mode: 'scan_only',
      speed_profile: 'normal',
      port_range: '1-1000',
      scan_type: 'syn',
      os_detection: false,
      version_detection: true,
      allow_exploit: false,
      allow_post_exploitation: false,
      allow_lateral_movement: false,
      allow_browser_recon: false,
      nse_categories: ['default'],
    },
  },
  full: {
    key: 'full',
    label: 'Full Network Audit',
    icon: 'manage_search',
    color: '#8b5cf6',
    tag: 'violet',
    desc: 'All ports, version detection, asks before each exploit attempt.',
    time: '~30 min',
    payload: {
      mode: 'ask_before_exploit',
      speed_profile: 'normal',
      port_range: '1-65535',
      scan_type: 'syn',
      os_detection: true,
      version_detection: true,
      allow_exploit: true,
      allow_post_exploitation: false,
      allow_lateral_movement: false,
      allow_browser_recon: false,
      nse_categories: ['default', 'vuln', 'safe'],
    },
  },
  web: {
    key: 'web',
    label: 'Web Application',
    icon: 'language',
    color: '#10b981',
    tag: 'emerald',
    desc: 'Browser-enabled recon focused on HTTP/HTTPS services.',
    time: '~20 min',
    payload: {
      mode: 'ask_before_exploit',
      speed_profile: 'normal',
      port_range: '80,443,8000,8080,8443,3000,5000,9000',
      scan_type: 'connect',
      os_detection: false,
      version_detection: true,
      allow_exploit: true,
      allow_post_exploitation: false,
      allow_lateral_movement: false,
      allow_browser_recon: true,
      nse_categories: ['default', 'http'],
    },
  },
  stealth: {
    key: 'stealth',
    label: 'Stealth Recon',
    icon: 'visibility_off',
    color: '#6b7280',
    tag: 'gray',
    desc: 'IDS-evasion timing, passive only. No exploitation whatsoever.',
    time: '~15 min',
    payload: {
      mode: 'scan_only',
      speed_profile: 'stealth',
      port_range: '1-1000',
      scan_type: 'syn',
      os_detection: false,
      version_detection: false,
      allow_exploit: false,
      allow_post_exploitation: false,
      allow_lateral_movement: false,
      allow_browser_recon: false,
      nse_categories: [],
    },
  },
  ctf: {
    key: 'ctf',
    label: 'CTF / Lab Mode',
    icon: 'flag',
    color: '#ef4444',
    tag: 'red',
    desc: 'Full auto exploitation chain. Aggressive timing. Lab use only.',
    time: 'Varies',
    payload: {
      mode: 'full_auto',
      speed_profile: 'aggressive',
      port_range: '1-65535',
      scan_type: 'syn',
      os_detection: true,
      version_detection: true,
      allow_exploit: true,
      allow_post_exploitation: true,
      allow_lateral_movement: true,
      allow_browser_recon: false,
      nse_categories: ['default', 'vuln', 'auth', 'safe'],
    },
  },
};

/* ──────────────────────────────────────────────────────────
   HELPER: plain-English event translator
   ────────────────────────────────────────────────────────── */
function eventToEnglish(event, data) {
  const tool = (data && (data.tool || data.tool_name || '')) || '';
  const target = (data && (data.target || data.host || data.ip || '')) || '';
  const t = target ? ` on ${target}` : '';

  if (event === 'reasoning' || event === 'llm_thinking') {
    const thought = (data && (data.thought || data.content || data.text || '')) || '';
    if (thought.length > 4) return thought.substring(0, 200) + (thought.length > 200 ? '…' : '');
    return 'AI is planning the next step…';
  }
  if (event === 'tool_call') {
    const map = {
      nmap_scan: `Running port scan${t}`,
      nmap_host_discovery: `Discovering hosts in network`,
      run_exploit: `Attempting exploit${t}`,
      searchsploit: `Searching for exploits`,
      nikto_scan: `Running web scanner${t}`,
      browser_navigate: `Navigating web app${t}`,
      run_command: `Executing command`,
      read_file: `Reading file`,
      write_file: `Writing file`,
      msf_run_module: `Running Metasploit module${t}`,
      get_shell: `Obtaining shell${t}`,
    };
    return map[tool] || `Running ${tool || 'tool'}${t}`;
  }
  if (event === 'tool_result') {
    if (data && data.success === false) return `${tool || 'Tool'} returned an error`;
    return `${tool || 'Tool'} completed${t}`;
  }
  if (event === 'vuln_found' || event === 'finding') {
    const cve = (data && data.cve_id) || '';
    const sev = (data && data.severity) || '';
    return cve ? `Found ${cve}${sev ? ' (' + sev + ')' : ''}${t}` : `Vulnerability found${t}`;
  }
  if (event === 'phase_change' || event === 'phase_changed') {
    const names = { 1: 'Discovery', 2: 'Port Scan', 3: 'Analysis', 4: 'Exploitation', 5: 'Post-Exploit', 6: 'Reporting', 7: 'Done' };
    const p = (data && (data.phase || data.new_phase)) || 0;
    return `Phase: ${names[p] || 'Next phase'}`;
  }
  if (event === 'agent_done' || event === 'done') return 'Mission completed.';
  if (event === 'start') return 'Mission started.';
  if (event === 'error') return `Error: ${(data && data.message) || 'unknown'}`;
  if (event === 'safety_block') return `Action blocked by safety policy`;
  if (event === 'scan_result') return `Scan results received${t}`;
  return event.replace(/_/g, ' ');
}

function severityClass(sev) {
  const s = (sev || '').toUpperCase();
  if (s === 'CRITICAL') return 'saas-badge-critical';
  if (s === 'HIGH')     return 'saas-badge-high';
  if (s === 'MEDIUM')   return 'saas-badge-medium';
  return 'saas-badge-low';
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtElapsed(start) {
  if (!start) return '00:00';
  const s = Math.floor((Date.now() / 1000) - start);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/* ──────────────────────────────────────────────────────────
   PAGE: New Scan
   ────────────────────────────────────────────────────────── */
class NewScanPage {
  constructor() {
    this._selectedProfile = 'quick';
    this._launching = false;
  }

  mount() {
    this._renderProfiles();
    this._bind();
  }

  unmount() {}

  _renderProfiles() {
    const grid = document.getElementById('profile-grid');
    if (!grid) return;
    grid.innerHTML = Object.values(SCAN_PROFILES).map(p => `
      <div class="profile-card ${p.key === this._selectedProfile ? 'selected' : ''}"
           data-profile="${p.key}" tabindex="0"
           style="--profile-color:${p.color}">
        <div class="profile-card-header">
          <div class="profile-icon-wrap" style="background:${p.color}20">
            <span class="material-symbols-outlined" style="color:${p.color};font-size:20px">${p.icon}</span>
          </div>
          <span class="profile-time">${p.time}</span>
        </div>
        <div class="profile-card-body">
          <div class="profile-label">${p.label}</div>
          <div class="profile-desc">${p.desc}</div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.profile-card').forEach(card => {
      card.addEventListener('click', () => this._selectProfile(card.dataset.profile));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') this._selectProfile(card.dataset.profile); });
    });
  }

  _selectProfile(key) {
    this._selectedProfile = key;
    document.querySelectorAll('.profile-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.profile === key);
    });
  }

  _bind() {
    const form = document.getElementById('new-scan-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); this._launch(); });
  }

  async _launch() {
    if (this._launching) return;
    const target = document.getElementById('s-target')?.value?.trim();
    if (!target) {
      showToast('Please enter a target IP, CIDR, or hostname.', 'warning');
      document.getElementById('s-target')?.focus();
      return;
    }

    this._launching = true;
    const btn = document.getElementById('s-launch-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="saas-spinner"></span> Starting…'; }

    const profile = SCAN_PROFILES[this._selectedProfile];
    const payload = {
      ...profile.payload,
      target,
      mission_name: document.getElementById('s-mission-name')?.value?.trim() || '',
      notes:        document.getElementById('s-notes')?.value?.trim() || '',
      objectives:   (document.getElementById('s-objectives')?.value?.trim() || '').split('\n').filter(Boolean),
    };

    const tlInput = document.getElementById('s-time-limit');
    if (tlInput && tlInput.value) payload.time_limit = parseInt(tlInput.value, 10);

    try {
      const res = await API.startSession(payload);
      saasState.activeSessionId = res.session_id;
      saasState.activeSessionTarget = target;
      saasState.activeSessionProfile = this._selectedProfile;
      saasState.activeSessionStart = Date.now() / 1000;
      router.navigate('mission-live', { sessionId: res.session_id });
    } catch (err) {
      showToast('Failed to start scan: ' + err.message, 'error');
    } finally {
      this._launching = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">rocket_launch</span> Start Scan'; }
    }
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Mission Live
   ────────────────────────────────────────────────────────── */
class MissionLivePage {
  constructor() {
    this._sessionId = null;
    this._pollTimer = null;
    this._elapsedTimer = null;
    this._sessionStart = null;
    this._feedCount = 0;
    this._done = false;
    this._paused = false;
  }

  mount(params) {
    this._sessionId = params.sessionId || saasState.activeSessionId;
    if (!this._sessionId) { router.navigate('new-scan'); return; }

    this._feedCount = 0;
    this._done = false;
    this._paused = false;

    window._missionPage = this;
    saasWs.subscribe(this._sessionId);
    saasWs.on('session_event', msg => this._onEvent(msg));
    saasWs.on('approval_request', msg => this._onApproval(msg));

    this._loadInitial();
    this._startPoll();
    this._startElapsed();
    this._updateControls();
  }

  unmount() {
    window._missionPage = null;
    saasWs.unsubscribe();
    saasWs.on('session_event', null);
    saasWs.on('approval_request', null);
    clearInterval(this._pollTimer);
    clearInterval(this._elapsedTimer);
  }

  async _loadInitial() {
    try {
      const s = await API.getSession(this._sessionId);
      this._applySessionData(s);

      // Replay last 50 events for context
      try {
        const evts = await API.getSessionEvents(this._sessionId);
        if (evts && evts.events) {
          const last = evts.events.slice(-50);
          last.forEach(ev => this._renderFeedItem(ev.event_type, ev.data, ev.created_at));
        }
      } catch {}
    } catch (e) {
      showToast('Could not load session data.', 'error');
    }
  }

  _startPoll() {
    this._pollTimer = setInterval(async () => {
      try {
        const s = await API.getSession(this._sessionId);
        this._applySessionData(s);
      } catch {}
    }, 6000);
  }

  _startElapsed() {
    this._sessionStart = saasState.activeSessionStart || (Date.now() / 1000);
    this._elapsedTimer = setInterval(() => {
      const el = document.getElementById('ml-elapsed');
      if (el) el.textContent = fmtElapsed(this._sessionStart);
    }, 1000);
  }

  _applySessionData(s) {
    if (!s) return;
    this._sessionStart = s.created_at || this._sessionStart;

    const statusMap = {
      running: ['running', 'Running', 'saas-dot-running'],
      paused:  ['paused',  'Paused',  'saas-dot-paused'],
      done:    ['done',    'Done',    'saas-dot-done'],
      error:   ['error',   'Error',   'saas-dot-error'],
      stopped: ['stopped', 'Stopped', 'saas-dot-error'],
      idle:    ['idle',    'Idle',    'saas-dot-idle'],
    };
    const [statusKey, statusLabel, dotClass] = statusMap[s.status] || ['idle', s.status, 'saas-dot-idle'];

    this._done = (statusKey === 'done' || statusKey === 'error' || statusKey === 'stopped');
    this._paused = (statusKey === 'paused');

    const dot = document.getElementById('ml-status-dot');
    if (dot) { dot.className = 'saas-status-dot ' + dotClass; }
    const stxt = document.getElementById('ml-status-text');
    if (stxt) stxt.textContent = statusLabel;

    const tgt = document.getElementById('ml-target');
    if (tgt) tgt.textContent = s.target || saasState.activeSessionTarget || '';

    const pname = SCAN_PROFILES[saasState.activeSessionProfile]?.label || '';
    const pEl = document.getElementById('ml-profile');
    if (pEl) pEl.textContent = pname;

    // Stats
    setText('ml-hosts',  s.hosts_found  || 0);
    setText('ml-ports',  s.ports_found  || 0);
    setText('ml-vulns',  s.vulns_found  || 0);
    setText('ml-shells', (s.shells || []).length || 0);

    this._updateControls();

    // Show done bar
    const donebar = document.getElementById('ml-done-bar');
    if (donebar) donebar.classList.toggle('hidden', !this._done);
  }

  _updateControls() {
    const pauseBtn = document.getElementById('ml-pause-btn');
    const resumeBtn = document.getElementById('ml-resume-btn');
    const stopBtn = document.getElementById('ml-stop-btn');

    if (pauseBtn) pauseBtn.classList.toggle('hidden', this._done || this._paused);
    if (resumeBtn) resumeBtn.classList.toggle('hidden', this._done || !this._paused);
    if (stopBtn) stopBtn.classList.toggle('hidden', this._done);
  }

  _onEvent(msg) {
    const event = msg.event || msg.event_type || '';
    const data  = msg.data || msg;

    if (event === 'reasoning' || event === 'llm_thinking') {
      const text = eventToEnglish(event, data);
      const el = document.getElementById('ml-summary');
      if (el) { el.textContent = text; el.classList.remove('opacity-0'); }
    }

    if (event === 'phase_change' || event === 'phase_changed') {
      this._advanceStepper((data && (data.phase || data.new_phase)) || 0);
    }

    if (event === 'agent_done' || event === 'done') {
      this._done = true;
      this._updateControls();
      const donebar = document.getElementById('ml-done-bar');
      if (donebar) donebar.classList.remove('hidden');
      API.getSession(this._sessionId).then(s => this._applySessionData(s)).catch(() => {});
    }

    if (event === 'error') {
      this._done = true;
      this._updateControls();
    }

    this._renderFeedItem(event, data);
  }

  _onApproval(msg) {
    const modal = document.getElementById('approval-modal');
    if (!modal) return;

    const tool   = msg.tool || 'action';
    const params = msg.params || {};
    const desc   = params.target ? `${tool} on ${params.target}` : tool;

    document.getElementById('approval-desc').textContent =
      `The AI wants to run: ${desc}. Allow this action?`;
    document.getElementById('approval-detail').textContent =
      params.command || params.module || params.exploit_path || '';

    modal.classList.remove('hidden');

    const approve = document.getElementById('approval-allow-btn');
    const skip    = document.getElementById('approval-skip-btn');
    const stop    = document.getElementById('approval-stop-btn');

    const cleanup = () => {
      modal.classList.add('hidden');
      approve.onclick = null;
      skip.onclick    = null;
      stop.onclick    = null;
    };

    approve.onclick = () => { saasWs.approvalResponse(msg.approval_id, true);  cleanup(); };
    skip.onclick    = () => { saasWs.approvalResponse(msg.approval_id, false); cleanup(); };
    stop.onclick    = () => {
      API.killSession(this._sessionId).catch(() => {});
      cleanup();
    };
  }

  _renderFeedItem(event, data, ts) {
    const feed = document.getElementById('ml-feed');
    if (!feed) return;
    if (event === 'pong' || event === 'ping' || event === 'session_subscribed') return;

    this._feedCount++;
    if (this._feedCount > 200) {
      const first = feed.querySelector('.feed-item');
      if (first) first.remove();
    }

    const text = eventToEnglish(event, data);
    const time = ts ? fmtTime(ts) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let typeClass = 'feed-default';
    let icon = 'circle';
    if (event === 'tool_call')                        { typeClass = 'feed-scan';    icon = 'play_circle'; }
    if (event === 'tool_result')                      { typeClass = 'feed-ok';      icon = 'check_circle'; }
    if (event === 'vuln_found' || event === 'finding'){ typeClass = 'feed-vuln';    icon = 'warning'; }
    if (event === 'reasoning' || event === 'llm_thinking') { typeClass = 'feed-think'; icon = 'psychology'; }
    if (event === 'error')                            { typeClass = 'feed-error';   icon = 'error'; }
    if (event === 'safety_block')                     { typeClass = 'feed-block';   icon = 'block'; }
    if (event === 'phase_change' || event === 'phase_changed') { typeClass = 'feed-phase'; icon = 'flag'; }
    if (event === 'agent_done' || event === 'done')   { typeClass = 'feed-done';    icon = 'task_alt'; }

    // Vuln badge
    let extra = '';
    if ((event === 'vuln_found' || event === 'finding') && data) {
      const cve = data.cve_id || '';
      const sev = data.severity || '';
      if (cve || sev) {
        extra = `<span class="saas-badge ${severityClass(sev)}">${sev || 'VULN'}${cve ? ' · ' + cve : ''}</span>`;
      }
    }

    const item = document.createElement('div');
    item.className = `feed-item ${typeClass}`;
    item.innerHTML = `
      <span class="material-symbols-outlined feed-icon">${icon}</span>
      <div class="feed-body">
        <span class="feed-text">${text}</span>
        ${extra}
      </div>
      <span class="feed-time">${time}</span>
    `;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
  }

  _advanceStepper(phase) {
    const steps = document.querySelectorAll('.phase-step');
    steps.forEach((step, i) => {
      const stepPhase = parseInt(step.dataset.phase, 10);
      step.classList.remove('done', 'active', 'pending');
      if (stepPhase < phase)  step.classList.add('done');
      else if (stepPhase === phase) step.classList.add('active');
      else step.classList.add('pending');
    });
  }

  pauseMission() {
    API.pauseSession(this._sessionId)
      .then(() => { this._paused = true; this._updateControls(); })
      .catch(e => showToast('Could not pause: ' + e.message, 'error'));
  }

  resumeMission() {
    API.resumeSession(this._sessionId)
      .then(() => { this._paused = false; this._updateControls(); })
      .catch(e => showToast('Could not resume: ' + e.message, 'error'));
  }

  stopMission() {
    if (!confirm('Stop this mission? This cannot be undone.')) return;
    API.killSession(this._sessionId)
      .then(() => { this._done = true; this._updateControls(); showToast('Mission stopped.', 'success'); })
      .catch(e => showToast('Could not stop: ' + e.message, 'error'));
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Activity
   ────────────────────────────────────────────────────────── */
class ActivityPage {
  mount() { this._loadSessions(); this._bindTabs(); }
  unmount() {}

  _bindTabs() {
    document.querySelectorAll('.activity-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.activity-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.activity-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById('activity-panel-' + tab.dataset.tab);
        if (panel) panel.classList.remove('hidden');
        if (tab.dataset.tab === 'audit') this._loadAudit();
      });
    });
  }

  async _loadSessions() {
    const container = document.getElementById('activity-sessions');
    if (!container) return;
    container.innerHTML = '<div class="saas-loading">Loading…</div>';
    try {
      const list = await API.getSessions();
      if (!list || !list.length) {
        container.innerHTML = '<div class="saas-empty-state"><span class="material-symbols-outlined">inbox</span><p>No scans yet. <a href="#new-scan" class="saas-link">Start your first scan →</a></p></div>';
        return;
      }
      container.innerHTML = list.map(s => this._renderSessionCard(s)).join('');
      container.querySelectorAll('.session-card').forEach(card => {
        card.addEventListener('click', () => {
          saasState.activeSessionId = card.dataset.sid;
          saasState.activeSessionTarget = card.dataset.target;
          router.navigate('mission-live', { sessionId: card.dataset.sid });
        });
      });
    } catch (e) {
      container.innerHTML = '<div class="saas-error">Failed to load sessions.</div>';
    }
  }

  _renderSessionCard(s) {
    const statusBadge = {
      running: 'saas-badge-running',
      done:    'saas-badge-success',
      error:   'saas-badge-error',
      stopped: 'saas-badge-error',
      paused:  'saas-badge-warning',
    }[s.status] || 'saas-badge-idle';

    const elapsed = s.finished_at && s.created_at
      ? fmtDuration(s.finished_at - s.created_at)
      : s.created_at ? fmtElapsed(s.created_at) : '';

    return `
      <div class="session-card" data-sid="${s.id}" data-target="${s.target || ''}">
        <div class="session-card-main">
          <div class="session-target">${s.target || 'Unknown'}</div>
          <div class="session-meta">
            <span class="saas-badge ${statusBadge}">${s.status}</span>
            ${s.name ? `<span class="session-name">${s.name}</span>` : ''}
            ${elapsed ? `<span class="session-duration"><span class="material-symbols-outlined" style="font-size:12px">schedule</span>${elapsed}</span>` : ''}
          </div>
        </div>
        <div class="session-stats">
          <span title="Hosts"><span class="material-symbols-outlined" style="font-size:14px">dns</span>${s.hosts_found || 0}</span>
          <span title="Ports"><span class="material-symbols-outlined" style="font-size:14px">lan</span>${s.ports_found || 0}</span>
          <span title="Vulns"><span class="material-symbols-outlined" style="font-size:14px;color:var(--c-danger)">warning</span>${s.vulns_found || 0}</span>
        </div>
        <span class="material-symbols-outlined session-arrow">chevron_right</span>
      </div>
    `;
  }

  async _loadAudit() {
    const container = document.getElementById('activity-audit');
    if (!container || container.dataset.loaded) return;
    container.innerHTML = '<div class="saas-loading">Loading audit log…</div>';
    try {
      const data = await API.getAuditLog({ limit: 100 });
      const entries = data?.entries || data?.logs || data || [];
      if (!entries.length) {
        container.innerHTML = '<div class="saas-empty-state"><span class="material-symbols-outlined">receipt_long</span><p>No audit events yet.</p></div>';
        return;
      }
      container.innerHTML = `
        <table class="saas-table">
          <thead><tr><th>Time</th><th>Event</th><th>Tool / Action</th><th>Target</th><th>Status</th></tr></thead>
          <tbody>
            ${entries.map(e => `
              <tr>
                <td class="audit-time">${fmtTime(e.created_at || e.timestamp)}</td>
                <td>${e.event_type || e.type || ''}</td>
                <td class="audit-tool">${e.tool || e.action || '—'}</td>
                <td>${e.target || '—'}</td>
                <td><span class="saas-badge ${e.success === false ? 'saas-badge-error' : 'saas-badge-success'}">${e.success === false ? 'failed' : 'ok'}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      container.dataset.loaded = '1';
    } catch {
      container.innerHTML = '<div class="saas-error">Failed to load audit log.</div>';
    }
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Reports
   ────────────────────────────────────────────────────────── */
class ReportsPage {
  mount() { this._loadSessionList(); this._bind(); }
  unmount() {}

  async _loadSessionList() {
    const sel = document.getElementById('report-session-sel');
    if (!sel) return;
    try {
      const list = await API.getSessions();
      sel.innerHTML = '<option value="">— Select a scan —</option>' +
        (list || []).filter(s => s.status === 'done').map(s =>
          `<option value="${s.id}">${s.target} ${s.name ? '· ' + s.name : ''} (${new Date(s.created_at * 1000).toLocaleDateString()})</option>`
        ).join('');
      if (saasState.activeSessionId) sel.value = saasState.activeSessionId;
    } catch {}
  }

  _bind() {
    const sel = document.getElementById('report-session-sel');
    if (sel) sel.addEventListener('change', () => this._loadReport(sel.value));

    const pdfBtn = document.getElementById('report-pdf-btn');
    if (pdfBtn) pdfBtn.addEventListener('click', () => {
      const id = document.getElementById('report-session-sel')?.value;
      if (id) window.open(API.downloadPdf(id), '_blank');
      else showToast('Select a scan first.', 'warning');
    });
  }

  async _loadReport(sessionId) {
    const frame = document.getElementById('report-frame');
    const empty = document.getElementById('report-empty');
    if (!sessionId) {
      if (frame) frame.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    try {
      if (frame) { frame.classList.remove('hidden'); frame.src = `/api/v1/sessions/${sessionId}/report/html`; }
      if (empty) empty.classList.add('hidden');
    } catch {}
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Files
   ────────────────────────────────────────────────────────── */
class FilesPage {
  mount() { this._loadSessionList(); this._bind(); }
  unmount() {}

  async _loadSessionList() {
    const sel = document.getElementById('files-session-sel');
    if (!sel) return;
    try {
      const list = await API.getSessions();
      sel.innerHTML = '<option value="">— Select a scan —</option>' +
        (list || []).map(s =>
          `<option value="${s.id}">${s.target} ${s.name ? '· ' + s.name : ''}</option>`
        ).join('');
      if (saasState.activeSessionId) sel.value = saasState.activeSessionId;
    } catch {}
  }

  _bind() {
    const sel = document.getElementById('files-session-sel');
    if (sel) sel.addEventListener('change', () => this._loadFiles(sel.value));
  }

  async _loadFiles(sessionId) {
    const container = document.getElementById('files-list');
    if (!container) return;
    if (!sessionId) { container.innerHTML = ''; return; }
    container.innerHTML = '<div class="saas-loading">Loading files…</div>';
    try {
      const arts = await API.getArtifacts(sessionId);
      if (!arts || !arts.length) {
        container.innerHTML = '<div class="saas-empty-state"><span class="material-symbols-outlined">folder_open</span><p>No files for this scan.</p></div>';
        return;
      }
      container.innerHTML = arts.map(f => `
        <div class="file-card">
          <span class="material-symbols-outlined file-icon">description</span>
          <div class="file-info">
            <div class="file-name">${f.filename || f.name}</div>
            <div class="file-meta">${f.size ? formatBytes(f.size) : ''}</div>
          </div>
          <a href="/api/v1/sessions/${sessionId}/artifacts/${f.filename || f.name}"
             download class="saas-btn saas-btn-ghost saas-btn-sm">
            <span class="material-symbols-outlined" style="font-size:16px">download</span>
          </a>
        </div>`).join('');
    } catch {
      container.innerHTML = '<div class="saas-error">Failed to load files.</div>';
    }
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: AI Assistant
   ────────────────────────────────────────────────────────── */
class AIAssistantPage {
  constructor() {
    this._convId = null;
    this._currentMsgId = null;
    this._buffer = '';
    this._msgEl = null;
  }

  mount() {
    this._bind();
    saasWs.on('token',       msg => this._onToken(msg));
    saasWs.on('message_end', msg => this._onEnd(msg));
    saasWs.on('error',       msg => this._onError(msg));
  }

  unmount() {
    saasWs.on('token', null);
    saasWs.on('message_end', null);
  }

  _bind() {
    const form = document.getElementById('ai-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); this._send(); });

    const input = document.getElementById('ai-input');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
    }
  }

  _send() {
    const input = document.getElementById('ai-input');
    const text = input?.value?.trim();
    if (!text) return;
    input.value = '';

    this._appendMsg('user', text);
    this._msgEl = this._appendMsg('assistant', '');
    this._buffer = '';
    this._currentMsgId = null;

    saasWs.sendChat(text, null, null, this._convId);
  }

  _onToken(msg) {
    this._currentMsgId = msg.msg_id;
    this._buffer += msg.content || '';
    if (this._msgEl) {
      const body = this._msgEl.querySelector('.ai-msg-body');
      if (body) {
        body.innerHTML = typeof marked !== 'undefined'
          ? marked.parse(this._buffer)
          : this._escHtml(this._buffer);
      }
    }
    const feed = document.getElementById('ai-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  _onEnd() {
    this._currentMsgId = null;
    if (this._msgEl) {
      const body = this._msgEl.querySelector('.ai-msg-body');
      if (body && typeof hljs !== 'undefined') {
        body.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
      }
    }
  }

  _onError(msg) {
    if (this._msgEl) {
      const body = this._msgEl.querySelector('.ai-msg-body');
      if (body) body.textContent = 'Error: ' + (msg.content || 'unknown');
    }
  }

  _appendMsg(role, text) {
    const feed = document.getElementById('ai-feed');
    if (!feed) return null;
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role}`;
    div.innerHTML = `
      <div class="ai-msg-avatar">
        <span class="material-symbols-outlined">${role === 'user' ? 'person' : 'smart_toy'}</span>
      </div>
      <div class="ai-msg-body">${text ? this._escHtml(text) : '<span class="ai-cursor"></span>'}</div>`;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
    return div;
  }

  _escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Terminal
   ────────────────────────────────────────────────────────── */
class TerminalPage {
  constructor() {
    this._term = null;
    this._fitAddon = null;
    this._termId = null;
    this._resizeObs = null;
  }

  mount() {
    this._initTerminal();
    saasWs.on('terminal_opened', msg => {
      this._termId = msg.terminal_id;
      setText('term-status', 'Connected');
    });
    saasWs.on('terminal_output', msg => {
      if (msg.terminal_id === this._termId && this._term) {
        this._term.write(msg.data);
      }
    });
    saasWs.on('terminal_exit', msg => {
      if (msg.terminal_id === this._termId) {
        this._term?.writeln('\r\n\x1b[33m[Session ended]\x1b[0m');
        setText('term-status', 'Disconnected');
        this._termId = null;
      }
    });

    const connectBtn = document.getElementById('term-connect-btn');
    if (connectBtn) connectBtn.addEventListener('click', () => this._connect());
  }

  unmount() {
    if (this._termId) saasWs.closeTerminal(this._termId);
    saasWs.on('terminal_opened', null);
    saasWs.on('terminal_output', null);
    saasWs.on('terminal_exit', null);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._term) { this._term.dispose(); this._term = null; }
  }

  _initTerminal() {
    const el = document.getElementById('saas-terminal');
    if (!el || typeof Terminal === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const theme = isDark
      ? { background: '#18181b', foreground: '#d4d4d8', cursor: '#a1a1aa' }
      : { background: '#f4f4f5', foreground: '#18181b', cursor: '#71717a' };

    this._term = new Terminal({ theme, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, cursorBlink: true });
    this._fitAddon = new FitAddon.FitAddon();
    this._term.loadAddon(this._fitAddon);
    this._term.open(el);
    this._fitAddon.fit();

    this._term.onData(data => {
      if (this._termId) saasWs.sendTerminalInput(this._termId, data);
    });

    this._resizeObs = new ResizeObserver(() => {
      this._fitAddon?.fit();
      if (this._termId && this._term) {
        saasWs.resizeTerminal(this._termId, this._term.rows, this._term.cols);
      }
    });
    this._resizeObs.observe(el);

    this._connect();
  }

  _connect() {
    if (!this._term) return;
    saasWs.openTerminal(saasState.activeSessionId || '', this._term.rows, this._term.cols);
    setText('term-status', 'Connecting…');
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Settings
   ────────────────────────────────────────────────────────── */
class SettingsPage {
  mount() { this._load(); this._bind(); }
  unmount() {}

  async _load() {
    try {
      const s = await API.getSettings();
      if (!s) return;
    } catch {}
  }

  _bind() {
    const form = document.getElementById('settings-form');
    if (form) form.addEventListener('submit', async e => {
      e.preventDefault();
      await this._save();
    });
  }

  async _save() {
    const btn = document.getElementById('settings-save-btn');
    if (btn) btn.disabled = true;
    try {
      const speed = document.querySelector('input[name="speed"]:checked')?.value;
      if (speed) localStorage.setItem('saas-default-speed', speed);

      const maxSev = document.getElementById('settings-max-severity')?.value;
      if (maxSev) localStorage.setItem('saas-max-severity', maxSev);

      const blockExploit = document.getElementById('settings-block-exploit')?.checked;
      localStorage.setItem('saas-block-exploit', blockExploit ? '1' : '0');

      showToast('Settings saved.', 'success');
    } catch (e) {
      showToast('Failed to save: ' + e.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
}

/* ──────────────────────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────────────────────── */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function fmtDuration(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
