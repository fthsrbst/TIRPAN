/* saas-pages.js — Page controllers v2 */

/* ──────────────────────────────────────────────────────────
   SCAN PROFILES
   ────────────────────────────────────────────────────────── */
const SCAN_PROFILES = {
  quick: {
    key: 'quick', label: 'Quick Discovery', icon: 'bolt', color: '#06b6d4', time: '~5 min',
    desc: 'Fast host & port discovery. No exploitation. Safe for production.',
    payload: {
      mode: 'scan_only', speed_profile: 'normal', port_range: '1-1000',
      scan_type: 'syn', os_detection: false, version_detection: true,
      allow_exploit: false, allow_post_exploitation: false, allow_lateral_movement: false,
      allow_browser_recon: false, nse_categories: ['default'],
    },
  },
  full: {
    key: 'full', label: 'Full Network Audit', icon: 'manage_search', color: '#8b5cf6', time: '~30 min',
    desc: 'All ports, version detection, asks before each exploit attempt.',
    payload: {
      mode: 'ask_before_exploit', speed_profile: 'normal', port_range: '1-65535',
      scan_type: 'syn', os_detection: true, version_detection: true,
      allow_exploit: true, allow_post_exploitation: false, allow_lateral_movement: false,
      allow_browser_recon: false, nse_categories: ['default', 'vuln', 'safe'],
    },
  },
  web: {
    key: 'web', label: 'Web Application', icon: 'language', color: '#10b981', time: '~20 min',
    desc: 'Browser-enabled recon focused on HTTP/HTTPS services.',
    payload: {
      mode: 'ask_before_exploit', speed_profile: 'normal',
      port_range: '80,443,8000,8080,8443,3000,5000,9000,7000,4443',
      scan_type: 'connect', os_detection: false, version_detection: true,
      allow_exploit: true, allow_post_exploitation: false, allow_lateral_movement: false,
      allow_browser_recon: true, nse_categories: ['default', 'http'],
    },
  },
  stealth: {
    key: 'stealth', label: 'Stealth Recon', icon: 'visibility_off', color: '#6b7280', time: '~15 min',
    desc: 'IDS-evasion timing, passive fingerprinting only. No exploitation.',
    payload: {
      mode: 'scan_only', speed_profile: 'stealth', port_range: '1-1000',
      scan_type: 'syn', os_detection: false, version_detection: false,
      allow_exploit: false, allow_post_exploitation: false, allow_lateral_movement: false,
      allow_browser_recon: false, nse_categories: [],
    },
  },
  ctf: {
    key: 'ctf', label: 'CTF / Lab Mode', icon: 'flag', color: '#ef4444', time: 'Varies',
    desc: 'Full auto exploitation chain. Aggressive timing. Lab targets only.',
    payload: {
      mode: 'full_auto', speed_profile: 'aggressive', port_range: '1-65535',
      scan_type: 'syn', os_detection: true, version_detection: true,
      allow_exploit: true, allow_post_exploitation: true, allow_lateral_movement: true,
      allow_browser_recon: false, nse_categories: ['default', 'vuln', 'auth', 'safe'],
    },
  },
};

/* ──────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────── */
function eventToEnglish(event, data) {
  const tool   = (data && (data.tool || data.tool_name || '')) || '';
  const target = (data && (data.target || data.host || data.ip || '')) || '';
  const t = target ? ` on ${target}` : '';

  if (event === 'reasoning' || event === 'llm_thinking') {
    const thought = (data && (data.thought || data.content || data.text || '')) || '';
    if (thought.length > 4) return thought.substring(0, 220) + (thought.length > 220 ? '…' : '');
    return 'AI is planning the next step…';
  }
  if (event === 'tool_call') {
    const map = {
      nmap_scan: `Running port scan${t}`,
      nmap_host_discovery: `Discovering hosts`,
      run_exploit: `Attempting exploit${t}`,
      searchsploit: `Searching exploits`,
      nikto_scan: `Running web scanner${t}`,
      browser_navigate: `Navigating web app${t}`,
      run_command: `Executing command`,
      read_file: `Reading file`,
      write_file: `Writing file`,
      msf_run_module: `Running Metasploit module${t}`,
      get_shell: `Obtaining shell${t}`,
      hydra: `Running brute force${t}`,
      gobuster: `Directory busting${t}`,
      sqlmap: `SQLMap scan${t}`,
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
    const names = { 1:'Discovery', 2:'Port Scan', 3:'Analysis', 4:'Exploitation', 5:'Post-Exploit', 6:'Reporting', 7:'Done' };
    const p = (data && (data.phase || data.new_phase)) || 0;
    return `Phase → ${names[p] || 'Next phase'}`;
  }
  if (event === 'agent_done' || event === 'done') return 'Mission completed.';
  if (event === 'start') return 'Mission started.';
  if (event === 'error') return `Error: ${(data && data.message) || 'unknown'}`;
  if (event === 'safety_block') return 'Action blocked by safety policy';
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

function severityRowClass(sev) {
  const s = (sev || '').toUpperCase();
  if (s === 'CRITICAL') return 'findings-row-c';
  if (s === 'HIGH')     return 'findings-row-h';
  if (s === 'MEDIUM')   return 'findings-row-m';
  return 'findings-row-l';
}

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtElapsed(start) {
  if (!start) return '00:00';
  const s = Math.floor((Date.now() / 1000) - start);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function fmtDuration(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

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

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    xml: 'code', json: 'data_object', txt: 'description', html: 'web',
    pdf: 'picture_as_pdf', png: 'image', jpg: 'image', jpeg: 'image',
    zip: 'folder_zip', gz: 'folder_zip', csv: 'table_chart',
  };
  return map[ext] || 'draft';
}

function fileColor(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = {
    xml: '#8b5cf6', json: '#f59e0b', txt: '#64748b', html: '#3b82f6',
    pdf: '#ef4444', png: '#10b981', jpg: '#10b981', jpeg: '#10b981',
    zip: '#6b7280', gz: '#6b7280', csv: '#06b6d4',
  };
  return map[ext] || 'var(--c-accent)';
}

/* ──────────────────────────────────────────────────────────
   PAGE: Dashboard
   ────────────────────────────────────────────────────────── */
class DashboardPage {
  constructor() { this._timer = null; }

  mount() {
    this._load();
    this._timer = setInterval(() => this._load(), 30000);
    document.querySelectorAll('#page-dashboard [data-nav]').forEach(btn => {
      btn.addEventListener('click', e => { e.preventDefault(); router.navigate(btn.dataset.nav); });
    });
  }

  unmount() { clearInterval(this._timer); }

  async _load() {
    try {
      const [sessions, stats] = await Promise.all([
        API.getSessions().catch(() => []),
        API.getSystemStats().catch(() => null),
      ]);

      const total    = sessions.length;
      const active   = sessions.filter(s => s.status === 'running' || s.status === 'paused').length;
      const done     = sessions.filter(s => s.status === 'done').length;
      const vulns    = sessions.reduce((a, s) => a + (s.vulns_found || 0), 0);
      const critical = sessions.reduce((a, s) => a + (s.critical_count || 0), 0);

      setText('dash-total',    total);
      setText('dash-active',   active);
      setText('dash-done',     done);
      setText('dash-vulns',    vulns);
      setText('dash-critical', critical);

      if (stats) {
        setText('dash-cpu', (stats.cpu || 0).toFixed(0) + '%');
        setText('dash-ram', (stats.ram_used_gb || 0).toFixed(1) + ' GB');
      }

      const wsConnected = document.getElementById('s-ws-dot')?.classList.contains('connected');
      setText('dash-ws', wsConnected ? 'Bağlı' : 'Bağlanıyor…');

      this._renderRecent(sessions.slice(0, 6));
    } catch(e) { console.error('Dashboard load error', e); }
  }

  _renderRecent(sessions) {
    const el = document.getElementById('dash-recent-missions');
    if (!el) return;
    if (!sessions.length) {
      el.innerHTML = `<div style="padding:32px;text-align:center;color:var(--c-muted-txt)">
        <span class="material-symbols-outlined" style="font-size:36px;display:block;opacity:0.3">my_location</span>
        <p style="font-size:13px;margin-top:8px">Henüz mission yok</p></div>`;
      return;
    }
    const statusIcon = { running:'play_circle', done:'check_circle', error:'error', paused:'pause_circle', stopped:'stop_circle' };
    const statusColor = { running:'#10b981', done:'#3b82f6', error:'#ef4444', paused:'#f59e0b', stopped:'#6b7280' };
    el.innerHTML = sessions.map(s => {
      const ic = statusIcon[s.status] || 'circle';
      const co = statusColor[s.status] || 'var(--c-muted-txt)';
      return `<div class="dash-mission-row" onclick="router.navigate('mission-live',{sessionId:'${s.id}'});saasState.activeSessionId='${s.id}';saasState.activeSessionTarget='${s.target||''}'">
        <span class="material-symbols-outlined" style="color:${co};font-size:16px">${ic}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name || s.target || '—'}</div>
          <div style="font-size:11px;color:var(--c-muted-txt)">${s.target || ''} · ${fmtDate(s.created_at)}</div>
        </div>
        ${s.vulns_found ? `<span class="saas-badge saas-badge-high" style="font-size:10px">${s.vulns_found} zafiyet</span>` : ''}
      </div>`;
    }).join('');
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Missions
   ────────────────────────────────────────────────────────── */
class MissionsPage {
  constructor() { this._sessions = []; }

  mount() {
    this._load();
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    const refresh = debounce(() => this._render(), 200);
    document.getElementById('ms-search')?.addEventListener('input', refresh);
    document.getElementById('ms-status-filter')?.addEventListener('change', refresh);
    document.getElementById('ms-date-filter')?.addEventListener('change', refresh);
    document.getElementById('ms-sort')?.addEventListener('change', refresh);
  }

  unmount() {}

  async _load() {
    try {
      const data = await API.getSessions();
      this._sessions = data || [];
      this._render();
    } catch(e) {
      document.getElementById('ms-cards-grid').innerHTML =
        `<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--c-muted-txt)">Missions yüklenemedi.</div>`;
    }
  }

  _filter() {
    const q      = (document.getElementById('ms-search')?.value || '').toLowerCase();
    const status = document.getElementById('ms-status-filter')?.value || '';
    const date   = document.getElementById('ms-date-filter')?.value || '';
    const sort   = document.getElementById('ms-sort')?.value || 'newest';
    const now    = Date.now() / 1000;
    const cutoff = { today: now - 86400, week: now - 604800, month: now - 2592000 };

    let list = [...this._sessions];
    if (q)      list = list.filter(s => (s.target||'').toLowerCase().includes(q) || (s.name||'').toLowerCase().includes(q));
    if (status) list = list.filter(s => s.status === status);
    if (date && cutoff[date]) list = list.filter(s => (s.created_at || 0) >= cutoff[date]);

    list.sort((a, b) => {
      if (sort === 'oldest') return (a.created_at||0) - (b.created_at||0);
      if (sort === 'target') return (a.target||'').localeCompare(b.target||'');
      if (sort === 'vulns')  return (b.vulns_found||0) - (a.vulns_found||0);
      return (b.created_at||0) - (a.created_at||0);
    });
    return list;
  }

  _render() {
    const grid = document.getElementById('ms-cards-grid');
    if (!grid) return;
    const list = this._filter();
    if (!list.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;padding:48px;text-align:center;color:var(--c-muted-txt)">
        <span class="material-symbols-outlined" style="font-size:52px;display:block;opacity:0.3;margin-bottom:12px">my_location</span>
        <p>Filtreye uygun mission bulunamadı.</p></div>`;
      return;
    }

    const statusIcon  = { running:'play_circle', done:'check_circle', error:'error', paused:'pause_circle', stopped:'stop_circle', idle:'radio_button_unchecked' };
    const statusColor = { running:'#10b981', done:'#3b82f6', error:'#ef4444', paused:'#f59e0b', stopped:'#6b7280', idle:'var(--c-muted-txt)' };
    const statusLabel = { running:'Çalışıyor', done:'Tamamlandı', error:'Hatalı', paused:'Duraklatıldı', stopped:'Durduruldu', idle:'Hazır' };

    grid.innerHTML = list.map(s => {
      const ic = statusIcon[s.status]  || 'circle';
      const co = statusColor[s.status] || 'var(--c-muted-txt)';
      const lb = statusLabel[s.status] || s.status;
      return `<div class="mission-card" onclick="saasState.activeSessionId='${s.id}';saasState.activeSessionTarget='${s.target||''}';router.navigate('mission-live',{sessionId:'${s.id}'})">
        <div class="mission-card-header">
          <span class="material-symbols-outlined" style="color:${co};font-size:18px">${ic}</span>
          <span style="font-size:11px;font-weight:700;color:${co};text-transform:uppercase;letter-spacing:.05em">${lb}</span>
          <div style="flex:1"></div>
          <span style="font-size:11px;color:var(--c-muted-txt)">${fmtDate(s.created_at)}</span>
        </div>
        <div style="font-size:14px;font-weight:700;margin:8px 0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name || s.target || '—'}</div>
        <div style="font-size:12px;color:var(--c-muted-txt);margin-bottom:10px">${s.target || ''}</div>
        <div class="mission-card-stats">
          <span title="Host"><span class="material-symbols-outlined" style="font-size:12px">dns</span>${s.hosts_found||0}</span>
          <span title="Port"><span class="material-symbols-outlined" style="font-size:12px">lan</span>${s.ports_found||0}</span>
          <span title="Zafiyet" style="${(s.vulns_found||0)>0?'color:#f59e0b':''}">
            <span class="material-symbols-outlined" style="font-size:12px">warning</span>${s.vulns_found||0}
          </span>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="saas-btn saas-btn-primary saas-btn-sm" style="flex:1;font-size:11px"
            onclick="event.stopPropagation();saasState.activeSessionId='${s.id}';saasState.activeSessionTarget='${s.target||''}';router.navigate('mission-live',{sessionId:'${s.id}'})">
            <span class="material-symbols-outlined" style="font-size:12px">visibility</span>İzle
          </button>
        </div>
      </div>`;
    }).join('');
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: New Scan
   ────────────────────────────────────────────────────────── */
class NewScanPage {
  constructor() {
    this._selectedProfile = localStorage.getItem('saas-last-profile') || 'quick';
    this._launching = false;
  }

  mount() {
    this._renderProfiles();
    this._bind();
    this._loadDefaults();
  }

  unmount() {}

  _renderProfiles() {
    const grid = document.getElementById('profile-grid');
    if (!grid) return;
    grid.innerHTML = Object.values(SCAN_PROFILES).map(p => `
      <div class="profile-card ${p.key === this._selectedProfile ? 'selected' : ''}"
           data-profile="${p.key}" tabindex="0"
           style="--profile-color:${p.color};--profile-color-alpha:${p.color}33">
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
    localStorage.setItem('saas-last-profile', key);
    document.querySelectorAll('.profile-card').forEach(c => c.classList.toggle('selected', c.dataset.profile === key));

    // Pre-fill advanced toggles from profile
    const profile = SCAN_PROFILES[key];
    if (!profile) return;
    const p = profile.payload;
    _setChecked('adv-os-detect', p.os_detection);
    _setChecked('adv-version-detect', p.version_detection);
    _setChecked('adv-allow-exploit', p.allow_exploit);
    _setChecked('adv-allow-post', p.allow_post_exploitation);
    _setChecked('adv-allow-lateral', p.allow_lateral_movement);
    _setChecked('adv-browser-recon', p.allow_browser_recon);
    const portEl = document.getElementById('adv-port-range');
    if (portEl && !portEl.value) portEl.placeholder = p.port_range || '1-1000';
    // NSE categories
    const activeNse = p.nse_categories || [];
    document.querySelectorAll('#adv-nse-cats .nse-chip').forEach(chip => {
      chip.classList.toggle('active', activeNse.includes(chip.dataset.cat));
    });
  }

  _loadDefaults() {
    const speed = localStorage.getItem('saas-default-speed') || 'normal';
    const radioEl = document.querySelector(`input[name="speed"][value="${speed}"]`);
    if (radioEl) radioEl.checked = true;
    this._selectProfile(this._selectedProfile);
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
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="saas-spinner"></span> Launching…'; }

    const profile = SCAN_PROFILES[this._selectedProfile];
    const payload = { ...profile.payload, target };

    // Apply advanced overrides
    const portRange = document.getElementById('adv-port-range')?.value?.trim();
    if (portRange) payload.port_range = portRange;

    const scanType = document.getElementById('adv-scan-type')?.value;
    if (scanType) payload.scan_type = scanType;

    const timing = document.getElementById('adv-timing')?.value;
    if (timing) payload.nmap_timing = timing;

    const maxHosts = document.getElementById('adv-max-hosts')?.value;
    if (maxHosts) payload.max_parallel_hosts = parseInt(maxHosts, 10);

    const rateLimit = document.getElementById('adv-rate-limit')?.value;
    if (rateLimit) payload.rate_limit = parseInt(rateLimit, 10);

    payload.os_detection      = document.getElementById('adv-os-detect')?.checked ?? profile.payload.os_detection;
    payload.version_detection = document.getElementById('adv-version-detect')?.checked ?? profile.payload.version_detection;
    payload.allow_exploit     = document.getElementById('adv-allow-exploit')?.checked ?? profile.payload.allow_exploit;
    payload.allow_post_exploitation  = document.getElementById('adv-allow-post')?.checked ?? profile.payload.allow_post_exploitation;
    payload.allow_lateral_movement   = document.getElementById('adv-allow-lateral')?.checked ?? profile.payload.allow_lateral_movement;
    payload.allow_browser_recon      = document.getElementById('adv-browser-recon')?.checked ?? profile.payload.allow_browser_recon;

    const maxCvss = document.getElementById('adv-max-cvss')?.value;
    if (maxCvss) payload.max_cvss_score = parseFloat(maxCvss);

    // NSE categories from chips
    const nseChips = document.querySelectorAll('#adv-nse-cats .nse-chip.active');
    payload.nse_categories = Array.from(nseChips).map(c => c.dataset.cat);

    // Exclusions
    const excludeIps = document.getElementById('adv-exclude-ips')?.value?.trim();
    if (excludeIps) payload.excluded_ips = excludeIps.split('\n').map(s => s.trim()).filter(Boolean);

    const excludePorts = document.getElementById('adv-exclude-ports')?.value?.trim();
    if (excludePorts) payload.excluded_ports = excludePorts.split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);

    const verbosity = document.getElementById('adv-output-format')?.value;
    if (verbosity) payload.verbosity = verbosity;

    const operator = document.getElementById('adv-operator')?.value?.trim();
    if (operator) payload.operator = operator;

    payload.mission_name = document.getElementById('s-mission-name-quick')?.value?.trim() || '';
    payload.notes        = document.getElementById('adv-notes')?.value?.trim() || '';
    payload.objectives   = (document.getElementById('adv-objectives')?.value?.trim() || '').split('\n').filter(Boolean);

    const tl = document.getElementById('adv-time-limit')?.value;
    if (tl) payload.time_limit = parseInt(tl, 10);

    try {
      const res = await API.startSession(payload);
      saasState.activeSessionId      = res.session_id;
      saasState.activeSessionTarget  = target;
      saasState.activeSessionProfile = this._selectedProfile;
      saasState.activeSessionStart   = Date.now() / 1000;
      router.navigate('mission-live', { sessionId: res.session_id });
    } catch (err) {
      showToast('Failed to start scan: ' + err.message, 'error');
    } finally {
      this._launching = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">rocket_launch</span> Launch Scan'; }
    }
  }
}

function _setChecked(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(val);
}

/* ──────────────────────────────────────────────────────────
   PAGE: Mission Live
   ────────────────────────────────────────────────────────── */
class MissionLivePage {
  constructor() {
    this._sessionId    = null;
    this._pollTimer    = null;
    this._elapsedTimer = null;
    this._sessionStart = null;
    this._feedCount    = 0;
    this._done         = false;
    this._paused       = false;
    this._findings     = [];
    this._findingsView = 'list';
    this._feedFilter   = 'all';
    this._autoScroll   = true;
    this._chartSev     = null;
    this._chartPhase   = null;
    this._phaseProgress = [0,0,0,0,0];
  }

  mount(params) {
    this._sessionId = params.sessionId || saasState.activeSessionId;
    if (!this._sessionId) { router.navigate('missions'); return; }

    this._feedCount = 0;
    this._done      = false;
    this._paused    = false;
    this._findings  = [];
    this._phaseProgress = [0,0,0,0,0];

    window._missionPage = this;
    saasWs.subscribe(this._sessionId);
    saasWs.on('session_event',    msg => this._onEvent(msg));
    saasWs.on('approval_request', msg => this._onApproval(msg));

    setText('ml-session-id', this._sessionId.substring(0, 8));
    document.getElementById('ml-empty')?.classList.add('hidden');

    this._bindFeedControls();
    this._bindTabToggle();
    this._bindFindingsToggle();

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
    this._chartSev?.destroy();
    this._chartPhase?.destroy();
    this._chartSev = null;
    this._chartPhase = null;
  }

  _bindFeedControls() {
    document.querySelectorAll('.feed-filter-btn[data-feed-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.feed-filter-btn[data-feed-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._feedFilter = btn.dataset.feedType;
        this._applyFeedFilter();
      });
    });

    const autoScrollBtn = document.getElementById('ml-autoscroll-btn');
    autoScrollBtn?.addEventListener('click', () => {
      this._autoScroll = !this._autoScroll;
      autoScrollBtn.classList.toggle('active', this._autoScroll);
    });

    document.getElementById('ml-feed-clear-btn')?.addEventListener('click', () => {
      const feed = document.getElementById('ml-feed');
      if (feed) feed.innerHTML = '';
      this._feedCount = 0;
      setText('ml-feed-count', 0);
    });
  }

  _bindTabToggle() {
    document.querySelectorAll('.ml-view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.ml-view-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const isFeed = tab.dataset.tab === 'feed';
        document.getElementById('ml-grid-wrapper')?.classList.toggle('hidden', !isFeed);
        const graphSec = document.getElementById('ml-graph-section');
        if (graphSec) { graphSec.classList.toggle('hidden', isFeed); if (!isFeed) this._initCharts(); }
      });
    });
  }

  _bindFindingsToggle() {
    document.getElementById('ml-findings-list-btn')?.addEventListener('click', () => {
      document.getElementById('ml-findings-list-btn')?.classList.add('active');
      document.getElementById('ml-findings-card-btn')?.classList.remove('active');
      this._findingsView = 'list';
      this._renderFindings();
    });
    document.getElementById('ml-findings-card-btn')?.addEventListener('click', () => {
      document.getElementById('ml-findings-card-btn')?.classList.add('active');
      document.getElementById('ml-findings-list-btn')?.classList.remove('active');
      this._findingsView = 'card';
      this._renderFindings();
    });
  }

  _applyFeedFilter() {
    const feed = document.getElementById('ml-feed');
    if (!feed) return;
    feed.querySelectorAll('.feed-item').forEach(item => {
      const show = this._feedFilter === 'all' || item.classList.contains('feed-' + this._feedFilter);
      item.style.display = show ? '' : 'none';
    });
  }

  _initCharts() {
    const sevCanvas   = document.getElementById('ml-chart-severity');
    const phaseCanvas = document.getElementById('ml-chart-phases');
    if (!sevCanvas || !phaseCanvas || typeof Chart === 'undefined') return;

    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    this._findings.forEach(f => { const k = (f.severity||'LOW').toUpperCase(); if (counts[k] !== undefined) counts[k]++; });

    if (this._chartSev) this._chartSev.destroy();
    this._chartSev = new Chart(sevCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Critical', 'High', 'Medium', 'Low'],
        datasets: [{ data: [counts.CRITICAL, counts.HIGH, counts.MEDIUM, counts.LOW], backgroundColor: ['#ef4444','#f97316','#f59e0b','#22c55e'], borderWidth: 0 }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, cutout: '65%', maintainAspectRatio: true },
    });

    const phaseLabels = ['Discovery','Port Scan','Analysis','Exploitation','Reporting'];
    if (this._chartPhase) this._chartPhase.destroy();
    this._chartPhase = new Chart(phaseCanvas, {
      type: 'bar',
      data: {
        labels: phaseLabels,
        datasets: [{ label: 'Events', data: this._phaseProgress, backgroundColor: '#6366f1', borderRadius: 4 }],
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 10 } } }, y: { ticks: { font: { size: 10 } } } }, maintainAspectRatio: false },
    });
  }

  async _loadInitial() {
    try {
      const s = await API.getSession(this._sessionId);
      this._applySessionData(s);
      try {
        const evts = await API.getSessionEvents(this._sessionId);
        if (evts && evts.events) {
          const last = evts.events.slice(-80);
          last.forEach(ev => this._renderFeedItem(ev.event_type, ev.data, ev.created_at));
        }
      } catch {}
    } catch {
      showToast('Could not load session data.', 'error');
    }
  }

  _startPoll() {
    this._pollTimer = setInterval(async () => {
      try { const s = await API.getSession(this._sessionId); this._applySessionData(s); } catch {}
    }, 7000);
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
      running: ['Running', 'saas-dot-running'],
      paused:  ['Paused',  'saas-dot-paused'],
      done:    ['Done',    'saas-dot-done'],
      error:   ['Error',   'saas-dot-error'],
      stopped: ['Stopped', 'saas-dot-error'],
      idle:    ['Idle',    'saas-dot-idle'],
    };
    const [label, dotClass] = statusMap[s.status] || ['Idle', 'saas-dot-idle'];

    this._done   = ['done', 'error', 'stopped'].includes(s.status);
    this._paused = (s.status === 'paused');

    const dot = document.getElementById('ml-status-dot');
    if (dot) dot.className = 'saas-status-dot ' + dotClass;
    setText('ml-status-text', label);
    setText('ml-target', s.target || saasState.activeSessionTarget || '—');

    const pEl = document.getElementById('ml-profile');
    if (pEl) pEl.textContent = SCAN_PROFILES[saasState.activeSessionProfile]?.label || '';

    setText('ml-hosts',  s.hosts_found  || 0);
    setText('ml-ports',  s.ports_found  || 0);
    setText('ml-vulns',  s.vulns_found  || 0);
    setText('ml-shells', (s.shells || []).length || 0);

    this._updateControls();
    const donebar = document.getElementById('ml-done-bar');
    if (donebar) donebar.classList.toggle('hidden', !this._done);
  }

  _updateControls() {
    const pauseBtn  = document.getElementById('ml-pause-btn');
    const resumeBtn = document.getElementById('ml-resume-btn');
    const stopBtn   = document.getElementById('ml-stop-btn');
    if (pauseBtn)  pauseBtn.classList.toggle('hidden', this._done || this._paused);
    if (resumeBtn) resumeBtn.classList.toggle('hidden', this._done || !this._paused);
    if (stopBtn)   stopBtn.classList.toggle('hidden', this._done);
  }

  _onEvent(msg) {
    const event = msg.event || msg.event_type || '';
    const data  = msg.data || msg;

    if (event === 'reasoning' || event === 'llm_thinking') {
      const text = eventToEnglish(event, data);
      const el = document.getElementById('ml-summary');
      if (el) { el.textContent = text; el.classList.remove('opacity-0'); el.style.fontStyle = 'italic'; el.style.color = ''; }
    }

    if (event === 'phase_change' || event === 'phase_changed') {
      this._advanceStepper((data && (data.phase || data.new_phase)) || 0);
    }

    if (event === 'vuln_found' || event === 'finding') {
      this._addFinding(data);
    }

    if (event === 'agent_done' || event === 'done') {
      this._done = true;
      this._updateControls();
      const donebar = document.getElementById('ml-done-bar');
      if (donebar) donebar.classList.remove('hidden');
      API.getSession(this._sessionId).then(s => this._applySessionData(s)).catch(() => {});
    }

    if (event === 'error') { this._done = true; this._updateControls(); }

    this._renderFeedItem(event, data);
  }

  _addFinding(data) {
    if (!data) return;
    this._findings.push(data);
    this._renderFindings();
    setText('ml-findings-count', this._findings.length);
  }

  _renderFindings() {
    const body = document.getElementById('ml-findings-body');
    if (!body) return;

    const isCard = document.getElementById('ml-findings-card-btn')?.classList.contains('active');

    if (isCard) {
      body.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;padding:14px">` +
        this._findings.map(f => {
          const sev = f.severity || 'LOW';
          const cve = f.cve_id || '';
          return `<div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:var(--radius-md);padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
              <span class="saas-badge ${severityClass(sev)}">${sev}${cve ? ' · ' + cve : ''}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--c-txt);margin-bottom:4px">${f.title || f.name || cve || 'Vulnerability'}</div>
            <div style="font-size:12px;color:var(--c-muted-txt)">${f.target || f.host || ''}</div>
          </div>`;
        }).join('') + '</div>';
    } else {
      body.innerHTML = this._findings.map(f => {
        const sev = f.severity || 'LOW';
        const cve = f.cve_id || '';
        return `<div class="finding-item">
          <span class="saas-badge ${severityClass(sev)}" style="flex-shrink:0">${sev}</span>
          <div class="finding-main">
            <div class="finding-title">${f.title || f.name || cve || 'Vulnerability'}</div>
            <div class="finding-meta">
              ${cve ? `<span>${cve}</span>` : ''}
              ${f.target || f.host ? `<span style="font-family:'JetBrains Mono',monospace">${f.target || f.host}</span>` : ''}
              ${f.port ? `<span>port ${f.port}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    }
  }

  _onApproval(msg) {
    const modal = document.getElementById('approval-modal');
    if (!modal) return;
    const tool   = msg.tool || 'action';
    const params = msg.params || {};
    const desc   = params.target ? `${tool} on ${params.target}` : tool;
    document.getElementById('approval-desc').textContent = `The AI wants to run: ${desc}. Allow this action?`;
    document.getElementById('approval-detail').textContent = params.command || params.module || params.exploit_path || '';
    modal.classList.remove('hidden');

    const approve = document.getElementById('approval-allow-btn');
    const skip    = document.getElementById('approval-skip-btn');
    const stop    = document.getElementById('approval-stop-btn');
    const cleanup = () => { modal.classList.add('hidden'); approve.onclick = null; skip.onclick = null; stop.onclick = null; };
    approve.onclick = () => { saasWs.approvalResponse(msg.approval_id, true);  cleanup(); };
    skip.onclick    = () => { saasWs.approvalResponse(msg.approval_id, false); cleanup(); };
    stop.onclick    = () => { API.killSession(this._sessionId).catch(() => {}); cleanup(); };
  }

  _renderFeedItem(event, data, ts) {
    const feed = document.getElementById('ml-feed');
    if (!feed) return;
    if (['pong','ping','session_subscribed'].includes(event)) return;

    this._feedCount++;
    // keep max 100 DOM nodes
    if (feed.children.length >= 100) feed.removeChild(feed.firstChild);
    setText('ml-feed-count', this._feedCount);

    // Track phase activity for chart
    const phaseIdx = { discovery:0, port_scan:1, analysis:2, exploitation:3, reporting:4 };
    if (event === 'phase_change' || event === 'phase_changed') {
      const ph = ((data && (data.phase || data.new_phase)) || '').toString().toLowerCase();
      const idx = phaseIdx[ph] ?? ((parseInt(ph,10)||1) - 1);
      if (idx >= 0 && idx < 5) this._phaseProgress[idx]++;
    } else {
      const ph = (data && data.phase) || '';
      const idx = phaseIdx[ph] ?? -1;
      if (idx >= 0) this._phaseProgress[idx]++;
    }

    const text = eventToEnglish(event, data);
    const time = ts ? fmtTime(ts) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let typeClass = 'feed-default', icon = 'circle', filterKey = 'all';
    if (event === 'tool_call')                               { typeClass = 'feed-scan feed-tool';   icon = 'play_circle';  filterKey = 'tool'; }
    else if (event === 'tool_result')                        { typeClass = 'feed-ok feed-tool';     icon = 'check_circle'; filterKey = 'tool'; }
    else if (event === 'vuln_found' || event === 'finding')  { typeClass = 'feed-vuln';             icon = 'warning';      filterKey = 'vuln'; }
    else if (event === 'reasoning' || event === 'llm_thinking') { typeClass = 'feed-think';         icon = 'psychology';   filterKey = 'think'; }
    else if (event === 'error')                              { typeClass = 'feed-error';            icon = 'error'; }
    else if (event === 'safety_block')                       { typeClass = 'feed-block';            icon = 'block'; }
    else if (event === 'phase_change' || event === 'phase_changed') { typeClass = 'feed-phase';    icon = 'flag';         filterKey = 'phase'; }
    else if (event === 'agent_done' || event === 'done')     { typeClass = 'feed-done';             icon = 'task_alt'; }

    let extra = '';
    if ((event === 'vuln_found' || event === 'finding') && data) {
      const cve = data.cve_id || '';
      const sev = data.severity || '';
      if (cve || sev) extra = `<span class="saas-badge ${severityClass(sev)}" style="font-size:10px">${sev || 'VULN'}${cve ? ' · ' + cve : ''}</span>`;
    }

    const item = document.createElement('div');
    item.className = `feed-item ${typeClass}`;
    // hide if filtered out
    if (this._feedFilter !== 'all' && filterKey !== this._feedFilter && !typeClass.includes('feed-' + this._feedFilter)) {
      item.style.display = 'none';
    }
    item.innerHTML = `<span class="material-symbols-outlined feed-icon">${icon}</span>` +
      `<div class="feed-body"><span class="feed-text">${text}</span>${extra}</div>` +
      `<span class="feed-time">${time}</span>`;
    feed.appendChild(item);
    if (this._autoScroll) feed.scrollTop = feed.scrollHeight;
  }

  _advanceStepper(phase) {
    document.querySelectorAll('.phase-step').forEach(step => {
      const sp = parseInt(step.dataset.phase, 10);
      step.classList.remove('done', 'active', 'pending');
      if (sp < phase)       step.classList.add('done');
      else if (sp === phase) step.classList.add('active');
      else                   step.classList.add('pending');
    });
  }

  pauseMission() {
    API.pauseSession(this._sessionId)
      .then(() => { this._paused = true; this._updateControls(); showToast('Mission paused.', 'info'); })
      .catch(e => showToast('Could not pause: ' + e.message, 'error'));
  }

  resumeMission() {
    API.resumeSession(this._sessionId)
      .then(() => { this._paused = false; this._updateControls(); showToast('Mission resumed.', 'success'); })
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
  constructor() {
    this._sessions  = [];
    this._view      = localStorage.getItem('saas-scan-view') || 'list';
    this._filter    = 'all';
    this._sort      = 'newest';
    this._searchQ   = '';
    this._dateQ     = '';
    this._auditRaw  = [];
    this._auditQ    = '';
    this._auditType = '';
  }

  mount() {
    this._applyViewToggle();
    this._loadSessions();
    this._bindTabs();
    this._bindFilters();
  }

  unmount() {}

  _applyViewToggle() {
    const listBtn = document.getElementById('act-view-list');
    const cardBtn = document.getElementById('act-view-card');
    if (listBtn) listBtn.classList.toggle('active', this._view === 'list');
    if (cardBtn) cardBtn.classList.toggle('active', this._view === 'card');

    if (listBtn) listBtn.addEventListener('click', () => { this._view = 'list'; localStorage.setItem('saas-scan-view', 'list'); this._applyViewToggle(); this._renderSessions(); });
    if (cardBtn) cardBtn.addEventListener('click', () => { this._view = 'card'; localStorage.setItem('saas-scan-view', 'card'); this._applyViewToggle(); this._renderSessions(); });
  }

  _bindFilters() {
    let debounce = null;
    document.getElementById('act-search')?.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { this._searchQ = e.target.value.toLowerCase(); this._renderSessions(); }, 200);
    });
    document.getElementById('act-status-filter')?.addEventListener('change', e => {
      this._filter = e.target.value || 'all';
      this._renderSessions();
    });
    document.getElementById('act-date-filter')?.addEventListener('change', e => {
      this._dateQ = e.target.value;
      this._renderSessions();
    });
    document.getElementById('act-sort')?.addEventListener('change', e => {
      this._sort = e.target.value;
      this._renderSessions();
    });
    document.getElementById('act-refresh-btn')?.addEventListener('click', () => this._loadSessions());

    // Audit log search & filter
    let auditDebounce = null;
    document.getElementById('audit-search')?.addEventListener('input', e => {
      clearTimeout(auditDebounce);
      auditDebounce = setTimeout(() => { this._auditQ = e.target.value.toLowerCase(); this._renderAudit(); }, 200);
    });
    document.getElementById('audit-filter')?.addEventListener('change', e => {
      this._auditType = e.target.value;
      this._renderAudit();
    });
  }

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
    container.innerHTML = '<div class="saas-loading"><span class="saas-spinner saas-spinner-dark"></span>Loading…</div>';
    try {
      const list = await API.getSessions();
      this._sessions = list || [];
      this._renderSessions();
    } catch {
      container.innerHTML = '<div class="saas-error">Failed to load sessions.</div>';
    }
  }

  _renderSessions() {
    const container = document.getElementById('activity-sessions');
    if (!container) return;

    let list = [...this._sessions];
    const now = Date.now() / 1000;
    const dateCutoffs = { today: now - 86400, week: now - 604800, month: now - 2592000 };

    // Filter by status
    if (this._filter && this._filter !== 'all') {
      list = list.filter(s => s.status === this._filter);
    }
    // Filter by date
    if (this._dateQ && dateCutoffs[this._dateQ]) {
      list = list.filter(s => (s.created_at || 0) >= dateCutoffs[this._dateQ]);
    }
    // Filter by search
    if (this._searchQ) {
      list = list.filter(s =>
        (s.target || '').toLowerCase().includes(this._searchQ) ||
        (s.name || '').toLowerCase().includes(this._searchQ)
      );
    }
    // Sort
    if (this._sort === 'newest') list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (this._sort === 'oldest') list.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    else if (this._sort === 'target') list.sort((a, b) => (a.target || '').localeCompare(b.target || ''));
    else if (this._sort === 'vulns') list.sort((a, b) => (b.vulns_found || 0) - (a.vulns_found || 0));

    if (!list.length) {
      container.innerHTML = `<div class="saas-empty-state">
        <span class="material-symbols-outlined">inbox</span>
        <p>${this._sessions.length ? 'No scans match your filter.' : 'No scans yet.'}</p>
        ${!this._sessions.length ? '<a href="#new-scan" class="saas-btn saas-btn-primary saas-btn-sm" onclick="router.navigate(\'new-scan\');return false"><span class="material-symbols-outlined" style="font-size:15px">rocket_launch</span>Start your first scan</a>' : ''}
      </div>`;
      return;
    }

    if (this._view === 'card') {
      container.innerHTML = `<div class="session-grid">${list.map(s => this._renderVCard(s)).join('')}</div>`;
    } else {
      container.innerHTML = list.map(s => this._renderListCard(s)).join('');
    }

    container.querySelectorAll('[data-sid]').forEach(el => {
      el.addEventListener('click', () => {
        saasState.activeSessionId     = el.dataset.sid;
        saasState.activeSessionTarget = el.dataset.target;
        router.navigate('mission-live', { sessionId: el.dataset.sid });
      });
    });
  }

  _statusColor(status) {
    const m = { running:'#3b82f6', done:'#10b981', error:'#ef4444', stopped:'#ef4444', paused:'#f59e0b', idle:'#94a3b8' };
    return m[status] || '#94a3b8';
  }

  _renderListCard(s) {
    const statusBadge = {
      running:'saas-badge-running', done:'saas-badge-success',
      error:'saas-badge-error', stopped:'saas-badge-error', paused:'saas-badge-warning',
    }[s.status] || 'saas-badge-idle';
    const elapsed = s.finished_at && s.created_at ? fmtDuration(s.finished_at - s.created_at)
      : s.created_at ? fmtElapsed(s.created_at) : '';
    return `
      <div class="session-card" data-sid="${s.id}" data-target="${s.target || ''}">
        <div class="session-card-main">
          <div class="session-target">${s.target || 'Unknown'}</div>
          <div class="session-meta">
            <span class="saas-badge ${statusBadge}">${s.status}</span>
            ${s.name ? `<span class="session-name">${s.name}</span>` : ''}
            ${elapsed ? `<span class="session-duration"><span class="material-symbols-outlined" style="font-size:11px">schedule</span>${elapsed}</span>` : ''}
            ${s.created_at ? `<span class="session-duration" style="color:var(--c-muted-txt)">${fmtDate(s.created_at)}</span>` : ''}
          </div>
        </div>
        <div class="session-stats">
          <span title="Hosts"><span class="material-symbols-outlined" style="font-size:14px">dns</span>${s.hosts_found || 0}</span>
          <span title="Open Ports"><span class="material-symbols-outlined" style="font-size:14px">lan</span>${s.ports_found || 0}</span>
          <span title="Vulnerabilities" style="color:var(--c-danger)"><span class="material-symbols-outlined" style="font-size:14px">warning</span>${s.vulns_found || 0}</span>
        </div>
        <span class="material-symbols-outlined session-arrow">chevron_right</span>
      </div>`;
  }

  _renderVCard(s) {
    const color = this._statusColor(s.status);
    const statusBadge = {
      running:'saas-badge-running', done:'saas-badge-success',
      error:'saas-badge-error', stopped:'saas-badge-error', paused:'saas-badge-warning',
    }[s.status] || 'saas-badge-idle';
    return `
      <div class="session-vcard" data-sid="${s.id}" data-target="${s.target || ''}" style="--svc-color:${color}">
        <div class="svc-header">
          <div>
            <div class="svc-target">${s.target || 'Unknown'}</div>
            ${s.name ? `<div class="svc-name">${s.name}</div>` : ''}
          </div>
          <span class="saas-badge ${statusBadge}">${s.status}</span>
        </div>
        <div class="svc-stats">
          <div class="svc-stat"><div class="svc-stat-value">${s.hosts_found || 0}</div><div class="svc-stat-label">Hosts</div></div>
          <div class="svc-stat"><div class="svc-stat-value">${s.ports_found || 0}</div><div class="svc-stat-label">Ports</div></div>
          <div class="svc-stat"><div class="svc-stat-value" style="color:var(--c-danger)">${s.vulns_found || 0}</div><div class="svc-stat-label">Vulns</div></div>
        </div>
        <div class="svc-footer">
          <span class="svc-time">${s.created_at ? fmtDate(s.created_at) : ''}</span>
          <span class="material-symbols-outlined" style="font-size:16px;color:var(--c-muted-txt)">chevron_right</span>
        </div>
      </div>`;
  }

  async _loadAudit() {
    const container = document.getElementById('activity-audit');
    if (!container) return;
    if (container.dataset.loaded && this._auditRaw.length) { this._renderAudit(); return; }
    container.innerHTML = '<div class="saas-loading"><span class="saas-spinner saas-spinner-dark"></span>Yükleniyor…</div>';
    try {
      const data = await API.getAuditLog({ limit: 500 });
      this._auditRaw = data?.entries || data?.logs || (Array.isArray(data) ? data : []);
      container.dataset.loaded = '1';
      this._renderAudit();
    } catch {
      container.innerHTML = '<div class="saas-error">Audit log yüklenemedi.</div>';
    }
  }

  _renderAudit() {
    const container = document.getElementById('activity-audit');
    if (!container) return;
    let entries = [...this._auditRaw];

    if (this._auditType) entries = entries.filter(e => (e.event_type || e.type || '').toLowerCase().includes(this._auditType));
    if (this._auditQ) {
      entries = entries.filter(e =>
        (e.event_type || '').toLowerCase().includes(this._auditQ) ||
        (e.tool || '').toLowerCase().includes(this._auditQ) ||
        (e.target || '').toLowerCase().includes(this._auditQ)
      );
    }

    if (!entries.length) {
      container.innerHTML = '<div class="saas-empty-state"><span class="material-symbols-outlined">receipt_long</span><p>Eşleşen event yok.</p></div>';
      return;
    }
    container.innerHTML = `<div class="saas-table-wrap"><table class="saas-table">
      <thead><tr><th>Zaman</th><th>Event</th><th>Araç / Aksiyon</th><th>Hedef</th><th>Durum</th></tr></thead>
      <tbody>${entries.map(e => `<tr>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px;white-space:nowrap">${fmtTime(e.created_at || e.timestamp)}</td>
        <td>${e.event_type || e.type || ''}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-size:12px">${e.tool || e.action || '—'}</td>
        <td>${e.target || '—'}</td>
        <td><span class="saas-badge ${e.success === false ? 'saas-badge-error' : 'saas-badge-success'}">${e.success === false ? 'hatalı' : 'ok'}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Reports
   ────────────────────────────────────────────────────────── */
class ReportsPage {
  constructor() {
    this._sessions    = [];
    this._view        = localStorage.getItem('saas-report-view') || 'card';
    this._sort        = 'newest';
    this._searchQ     = '';
    this._severityQ   = '';
    this._dateQ       = '';
    this._currentId   = null;
  }

  mount() {
    this._applyViewToggle();
    this._loadReports();
    this._bindFilters();
  }

  unmount() {}

  _applyViewToggle() {
    const cardBtn = document.getElementById('rpt-view-card');
    const listBtn = document.getElementById('rpt-view-list');
    if (cardBtn) cardBtn.classList.toggle('active', this._view === 'card');
    if (listBtn) listBtn.classList.toggle('active', this._view === 'list');
    if (cardBtn) cardBtn.addEventListener('click', () => { this._view = 'card'; localStorage.setItem('saas-report-view', 'card'); this._applyViewToggle(); this._renderReports(); });
    if (listBtn) listBtn.addEventListener('click', () => { this._view = 'list'; localStorage.setItem('saas-report-view', 'list'); this._applyViewToggle(); this._renderReports(); });
  }

  _bindFilters() {
    let debounce = null;
    document.getElementById('rpt-search')?.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { this._searchQ = e.target.value.toLowerCase(); this._renderReports(); }, 200);
    });
    document.getElementById('rpt-severity-filter')?.addEventListener('change', e => { this._severityQ = e.target.value; this._renderReports(); });
    document.getElementById('rpt-date-filter')?.addEventListener('change', e => { this._dateQ = e.target.value; this._renderReports(); });
    document.getElementById('rpt-sort')?.addEventListener('change', e => { this._sort = e.target.value; this._renderReports(); });
    document.getElementById('report-refresh-btn')?.addEventListener('click', () => this._loadReports());
    document.getElementById('rpt-back-btn')?.addEventListener('click', () => {
      document.getElementById('rpt-viewer')?.classList.add('hidden');
      document.getElementById('rpt-content')?.classList.remove('hidden');
      this._currentId = null;
    });
    document.getElementById('report-pdf-btn')?.addEventListener('click', () => {
      if (this._currentId) window.open(API.downloadPdf(this._currentId), '_blank');
    });
  }

  async _loadReports() {
    const container = document.getElementById('rpt-content');
    if (!container) return;
    container.innerHTML = '<div class="saas-loading"><span class="saas-spinner saas-spinner-dark"></span>Loading reports…</div>';
    try {
      const list = await API.getSessions();
      this._sessions = (list || []).filter(s => s.status === 'done');
      this._computeSeverityTotals();
      this._renderReports();
    } catch {
      container.innerHTML = '<div class="saas-error">Failed to load reports.</div>';
    }
  }

  _computeSeverityTotals() {
    let c = 0, h = 0, m = 0, l = 0;
    this._sessions.forEach(s => {
      c += s.critical_count || 0;
      h += s.high_count || 0;
      m += s.medium_count || 0;
      l += s.low_count || 0;
      // If no breakdown, use total vulns as a proxy
      if (!s.critical_count && !s.high_count && !s.medium_count && !s.low_count && s.vulns_found) {
        h += s.vulns_found;
      }
    });
    setText('rpt-total-c', c || '0');
    setText('rpt-total-h', h || '0');
    setText('rpt-total-m', m || '0');
    setText('rpt-total-l', l || '0');
  }

  _renderReports() {
    const container = document.getElementById('rpt-content');
    if (!container) return;

    const now = Date.now() / 1000;
    const dateCutoffs = { today: now - 86400, week: now - 604800, month: now - 2592000 };

    let list = [...this._sessions];
    if (this._searchQ) {
      list = list.filter(s =>
        (s.target || '').toLowerCase().includes(this._searchQ) ||
        (s.name || '').toLowerCase().includes(this._searchQ)
      );
    }
    if (this._dateQ && dateCutoffs[this._dateQ]) {
      list = list.filter(s => (s.created_at || 0) >= dateCutoffs[this._dateQ]);
    }
    if (this._severityQ === 'critical') list = list.filter(s => (s.critical_count || 0) > 0);
    else if (this._severityQ === 'high') list = list.filter(s => (s.high_count || s.vulns_found || 0) > 0);
    else if (this._severityQ === 'medium') list = list.filter(s => (s.medium_count || 0) > 0);

    if (this._sort === 'newest') list.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    else if (this._sort === 'oldest') list.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    else if (this._sort === 'target') list.sort((a, b) => (a.target || '').localeCompare(b.target || ''));
    else if (this._sort === 'vulns') list.sort((a, b) => (b.vulns_found || 0) - (a.vulns_found || 0));

    if (!list.length) {
      container.innerHTML = `<div class="saas-empty-state">
        <span class="material-symbols-outlined">summarize</span>
        <p>${this._sessions.length ? 'No reports match your filter.' : 'No completed scans yet.'}</p>
      </div>`;
      return;
    }

    if (this._view === 'card') {
      container.innerHTML = `<div class="report-grid">${list.map(s => this._renderCard(s)).join('')}</div>`;
    } else {
      container.innerHTML = list.map(s => this._renderListItem(s)).join('');
    }

    container.querySelectorAll('[data-rid]').forEach(el => {
      el.addEventListener('click', () => this._openReport(el.dataset.rid, el.dataset.rtarget, el.dataset.rname));
    });
  }

  _renderCard(s) {
    const c = s.critical_count || 0, h = s.high_count || 0, m = s.medium_count || 0, l = s.low_count || 0;
    const total = c + h + m + l || s.vulns_found || 0;
    return `
      <div class="report-card" data-rid="${s.id}" data-rtarget="${s.target || ''}" data-rname="${s.name || ''}">
        <div class="report-card-header">
          <div>
            <div class="report-card-target">${s.target || 'Unknown'}</div>
            ${s.name ? `<div class="report-card-name">${s.name}</div>` : ''}
          </div>
          <div class="report-card-date">${s.created_at ? fmtDate(s.created_at) : ''}</div>
        </div>
        <div class="report-card-sevs">
          ${c ? `<span class="saas-badge saas-badge-critical">${c} critical</span>` : ''}
          ${h ? `<span class="saas-badge saas-badge-high">${h} high</span>` : ''}
          ${m ? `<span class="saas-badge saas-badge-medium">${m} medium</span>` : ''}
          ${l ? `<span class="saas-badge saas-badge-low">${l} low</span>` : ''}
          ${!total ? `<span class="saas-badge saas-badge-idle">No findings</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="saas-progress" style="flex:1">
            <div class="saas-progress-bar" style="background:var(--c-danger)" title="Vulnerabilities"></div>
          </div>
          <span style="font-size:12px;color:var(--c-muted-txt)">${total} total</span>
        </div>
      </div>`;
  }

  _renderListItem(s) {
    const total = (s.critical_count||0) + (s.high_count||0) + (s.medium_count||0) + (s.low_count||0) || s.vulns_found || 0;
    return `
      <div class="report-list-item" data-rid="${s.id}" data-rtarget="${s.target || ''}" data-rname="${s.name || ''}">
        <div class="report-list-main">
          <div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600">${s.target || 'Unknown'}</div>
          <div style="font-size:12px;color:var(--c-muted-txt);margin-top:2px">${s.name ? s.name + ' · ' : ''}${s.created_at ? fmtDate(s.created_at) : ''}</div>
        </div>
        <span class="saas-badge saas-badge-${total > 0 ? 'warning' : 'idle'}">${total} findings</span>
        <span class="material-symbols-outlined" style="color:var(--c-muted-txt);font-size:18px">arrow_forward</span>
      </div>`;
  }

  _openReport(sessionId, target, name) {
    this._currentId = sessionId;
    const viewer = document.getElementById('rpt-viewer');
    const content = document.getElementById('rpt-content');
    const frame   = document.getElementById('report-frame');
    const title   = document.getElementById('rpt-viewer-title');

    if (!viewer || !content || !frame) return;
    frame.src = `/api/v1/sessions/${sessionId}/report/html`;
    if (title) title.textContent = target + (name ? ' · ' + name : '');
    content.classList.add('hidden');
    viewer.classList.remove('hidden');
  }
}

/* ──────────────────────────────────────────────────────────
   PAGE: Files
   ────────────────────────────────────────────────────────── */
class FilesPage {
  constructor() {
    this._view = localStorage.getItem('saas-files-view') || 'list';
    window._filesPage = this;
  }

  mount() { this._loadSessionList(); this._bind(); }
  unmount() { window._filesPage = null; }

  setView(v) { this._view = v; localStorage.setItem('saas-files-view', v); }

  async _loadSessionList() {
    const sel = document.getElementById('files-session-sel');
    if (!sel) return;
    try {
      const list = await API.getSessions();
      sel.innerHTML = '<option value="">— Select a scan —</option>' +
        (list || []).map(s =>
          `<option value="${s.id}">${s.target} ${s.name ? '· ' + s.name : ''} (${fmtDate(s.created_at)})</option>`
        ).join('');
      if (saasState.activeSessionId) { sel.value = saasState.activeSessionId; this._loadFiles(saasState.activeSessionId); }
    } catch {}
  }

  _bind() {
    const sel = document.getElementById('files-session-sel');
    if (sel) sel.addEventListener('change', () => this._loadFiles(sel.value));

    const listBtn = document.getElementById('files-view-list');
    const cardBtn = document.getElementById('files-view-card');
    const refresh = () => { const sid = sel?.value; if (sid) this._loadFiles(sid); };
    listBtn?.addEventListener('click', () => { this.setView('list'); listBtn.classList.add('active'); cardBtn?.classList.remove('active'); refresh(); });
    cardBtn?.addEventListener('click', () => { this.setView('card'); cardBtn.classList.add('active'); listBtn?.classList.remove('active'); refresh(); });
    // Apply saved view state
    if (this._view === 'card') { cardBtn?.classList.add('active'); listBtn?.classList.remove('active'); }
    else { listBtn?.classList.add('active'); cardBtn?.classList.remove('active'); }
  }

  async _loadFiles(sessionId) {
    const container = document.getElementById('files-list');
    if (!container) return;
    if (!sessionId) {
      container.innerHTML = '<div class="saas-empty-state"><span class="material-symbols-outlined">folder_open</span><p>Select a scan to browse its files.</p></div>';
      return;
    }
    container.innerHTML = '<div class="saas-loading"><span class="saas-spinner saas-spinner-dark"></span>Loading files…</div>';
    try {
      const arts = await API.getArtifacts(sessionId);
      if (!arts || !arts.length) {
        container.innerHTML = '<div class="saas-empty-state"><span class="material-symbols-outlined">folder_open</span><p>No files for this scan.</p></div>';
        return;
      }

      if (this._view === 'card') {
        container.innerHTML = `<div class="files-grid">${arts.map(f => {
          const name = f.filename || f.name;
          const icon = fileIcon(name);
          const color = fileColor(name);
          return `<div class="file-vcard">
            <span class="material-symbols-outlined file-vcard-icon" style="--file-color:${color}">${icon}</span>
            <div class="file-vcard-name">${name}</div>
            <div class="file-vcard-meta">${f.size ? formatBytes(f.size) : ''}</div>
            <a href="/api/v1/sessions/${sessionId}/artifacts/${name}" download
               class="saas-btn saas-btn-ghost saas-btn-sm" onclick="event.stopPropagation()">
              <span class="material-symbols-outlined" style="font-size:14px">download</span>Download
            </a>
          </div>`;
        }).join('')}</div>`;
      } else {
        container.innerHTML = arts.map(f => {
          const name = f.filename || f.name;
          const icon = fileIcon(name);
          const color = fileColor(name);
          return `<div class="file-card">
            <span class="material-symbols-outlined file-icon" style="color:${color}">${icon}</span>
            <div class="file-info">
              <div class="file-name">${name}</div>
              <div class="file-meta">${f.size ? formatBytes(f.size) : ''}${f.created_at ? ' · ' + fmtDate(f.created_at) : ''}</div>
            </div>
            <a href="/api/v1/sessions/${sessionId}/artifacts/${name}" download
               class="saas-btn saas-btn-ghost saas-btn-sm">
              <span class="material-symbols-outlined" style="font-size:14px">download</span>
            </a>
          </div>`;
        }).join('');
      }
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
    this._buffer = '';
    this._msgEl  = null;
    window._aiPage = this;
  }

  mount() {
    this._bind();
    saasWs.on('token',       msg => this._onToken(msg));
    saasWs.on('message_end', msg => this._onEnd(msg));
    saasWs.on('error',       msg => this._onError(msg));
    this._updateProviderLabel();
  }

  unmount() {
    window._aiPage = null;
    saasWs.on('token', null);
    saasWs.on('message_end', null);
    saasWs.on('error', null);
  }

  clearChat() {
    saasWs.send({ type: 'new_conversation' });
    this._convId = null;
    const feed = document.getElementById('ai-feed');
    if (feed) feed.innerHTML = '';
    setText('ai-session-info', '');
  }

  _updateProviderLabel() {
    const label = document.getElementById('ai-provider-label');
    if (!label) return;
    API.getSettings?.().then(s => {
      if (s && s.provider) label.textContent = s.provider;
    }).catch(() => {});
  }

  _bind() {
    document.getElementById('ai-clear-btn')?.addEventListener('click', () => this.clearChat());
    const form = document.getElementById('ai-form');
    if (form) form.addEventListener('submit', e => { e.preventDefault(); this._send(); });
    const input = document.getElementById('ai-input');
    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 160) + 'px';
      });
    }
  }

  _send() {
    const input = document.getElementById('ai-input');
    const text  = input?.value?.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';

    this._appendMsg('user', text);
    this._msgEl  = this._appendMsg('assistant', '');
    this._buffer = '';

    saasWs.sendChat(text, null, null, this._convId);
  }

  _onToken(msg) {
    this._buffer += msg.content || '';
    if (this._msgEl) {
      const body = this._msgEl.querySelector('.ai-msg-body');
      if (body) body.innerHTML = typeof marked !== 'undefined' ? marked.parse(this._buffer) : this._escHtml(this._buffer);
    }
    const feed = document.getElementById('ai-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }

  _onEnd() {
    if (this._msgEl) {
      const body = this._msgEl.querySelector('.ai-msg-body');
      if (body && typeof hljs !== 'undefined') body.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    }
  }

  _onError(msg) {
    if (this._msgEl) {
      const body = this._msgEl.querySelector('.ai-msg-body');
      if (body) body.innerHTML = `<span style="color:var(--c-danger)">Error: ${this._escHtml(msg.content || 'unknown')}</span>`;
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
      <div class="ai-msg-body">${text ? this._escHtml(text) : '<span style="opacity:0.4">▍</span>'}</div>`;
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
    this._term     = null;
    this._fitAddon = null;
    this._termId   = null;
    this._resizeObs = null;
    window._termPage = this;
  }

  mount() {
    this._initTerminal();
    saasWs.on('terminal_opened', msg => {
      this._termId = msg.terminal_id;
      setText('term-status', 'Connected');
    });
    saasWs.on('terminal_output', msg => {
      if (msg.terminal_id === this._termId && this._term) this._term.write(msg.data);
    });
    saasWs.on('terminal_exit', msg => {
      if (msg.terminal_id === this._termId) {
        this._term?.writeln('\r\n\x1b[33m[Session ended]\x1b[0m');
        setText('term-status', 'Disconnected');
        this._termId = null;
      }
    });
    saasWs.on('terminal_error', msg => {
      this._term?.writeln(`\r\n\x1b[31m[Terminal Error: ${msg.message || 'Unknown error'}]\x1b[0m`);
      setText('term-status', 'Error');
    });
    document.getElementById('term-connect-btn')?.addEventListener('click', () => this._connect());
    document.getElementById('term-clear-btn')?.addEventListener('click', () => this.clearTerminal());
  }

  unmount() {
    window._termPage = null;
    if (this._termId) saasWs.closeTerminal(this._termId);
    saasWs.on('terminal_opened', null);
    saasWs.on('terminal_output', null);
    saasWs.on('terminal_exit', null);
    saasWs.on('terminal_error', null);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._term) { this._term.dispose(); this._term = null; }
  }

  clearTerminal() { this._term?.clear(); }

  _initTerminal() {
    const el = document.getElementById('saas-terminal');
    if (!el || typeof Terminal === 'undefined') return;
    const isDark = document.documentElement.classList.contains('dark');
    const theme = isDark
      ? { background: '#030712', foreground: '#d4d4d8', cursor: '#818cf8', selectionBackground: '#334155' }
      : { background: '#f8fafc', foreground: '#0f172a', cursor: '#6366f1', selectionBackground: '#e0e7ff' };

    this._term     = new Terminal({ theme, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, cursorBlink: true, allowTransparency: true });
    this._fitAddon = new FitAddon.FitAddon();
    this._term.loadAddon(this._fitAddon);
    this._term.open(el);
    this._fitAddon.fit();
    this._term.onData(data => { if (this._termId) saasWs.sendTerminalInput(this._termId, data); });
    this._resizeObs = new ResizeObserver(() => {
      this._fitAddon?.fit();
      if (this._termId && this._term) saasWs.resizeTerminal(this._termId, this._term.rows, this._term.cols);
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
    // Speed radio
    const speed = localStorage.getItem('saas-default-speed') || 'normal';
    const speedR = document.querySelector(`input[name="speed"][value="${speed}"]`);
    if (speedR) speedR.checked = true;

    // CVSS slider
    const maxSev = localStorage.getItem('saas-max-severity') || '10';
    const cvssR  = document.getElementById('settings-max-cvss');
    const cvssV  = document.getElementById('settings-cvss-val');
    if (cvssR) { cvssR.value = maxSev; if (cvssV) cvssV.textContent = parseFloat(maxSev).toFixed(1); }

    _setChecked('settings-block-exploit', localStorage.getItem('saas-block-exploit') === '1');

    // View preferences
    _setVal('settings-scan-view',   localStorage.getItem('saas-scan-view')    || 'list');
    _setVal('settings-report-view', localStorage.getItem('saas-report-view')  || 'card');

    // Provider + model config from localStorage
    const provider = localStorage.getItem('saas-provider') || 'ollama';
    this._switchProvider(provider);

    _setVal('cfg-ollama-url',   localStorage.getItem('cfg-ollama-url')   || '');
    _setVal('cfg-ollama-model', localStorage.getItem('cfg-ollama-model') || '');
    _setVal('cfg-or-model',     localStorage.getItem('cfg-or-model')     || '');
    _setVal('cfg-ocg-model',    localStorage.getItem('cfg-ocg-model')    || '');
    _setVal('cfg-ocg-url',      localStorage.getItem('cfg-ocg-url')      || '');
    _setVal('cfg-lms-url',      localStorage.getItem('cfg-lms-url')      || '');
    _setVal('cfg-lms-model',    localStorage.getItem('cfg-lms-model')    || '');
    // Mask stored OR key
    if (localStorage.getItem('cfg-or-key')) _setVal('cfg-or-key', '••••••••');

    // Sync from backend
    try {
      const s = await API.getSettings();
      if (s?.provider) this._switchProvider(s.provider);
    } catch {}
  }

  _switchProvider(provider) {
    const r = document.querySelector(`input[name="ai-provider"][value="${provider}"]`);
    if (r) r.checked = true;
    document.querySelectorAll('.provider-card').forEach(c => c.classList.toggle('selected', c.dataset.provider === provider));
    ['ollama','openrouter','opencode-go','lmstudio'].forEach(p => {
      const panel = document.getElementById('cfg-' + p);
      if (panel) panel.style.display = (p === provider || (p === 'opencode-go' && provider === 'opencode_go')) ? '' : 'none';
    });
    localStorage.setItem('saas-provider', provider);
  }

  _bind() {
    // Settings tab switching
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.querySelector(`.settings-panel[data-spanel="${btn.dataset.stab}"]`)?.classList.add('active');
      });
    });

    // Provider card + radio switching
    document.querySelectorAll('.provider-card').forEach(card => {
      card.addEventListener('click', () => {
        const p = card.dataset.provider;
        if (p) this._switchProvider(p);
      });
    });
    document.querySelectorAll('input[name="ai-provider"]').forEach(r => {
      r.addEventListener('change', () => { if (r.checked) this._switchProvider(r.value); });
    });

    // Theme toggle in settings
    document.getElementById('settings-theme-btn')?.addEventListener('click', () => {
      applyTheme(saasState.theme === 'dark' ? 'light' : 'dark');
    });

    // CVSS slider live value
    document.getElementById('settings-max-cvss')?.addEventListener('input', e => {
      const el = document.getElementById('settings-cvss-val');
      if (el) el.textContent = parseFloat(e.target.value).toFixed(1);
    });

    // Key visibility toggles
    document.querySelectorAll('.saas-key-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        const ic  = btn.querySelector('.material-symbols-outlined');
        if (!inp) return;
        inp.type = inp.type === 'password' ? 'text' : 'password';
        if (ic) ic.textContent = inp.type === 'password' ? 'visibility' : 'visibility_off';
      });
    });

    // Model fetch buttons
    document.getElementById('fetch-ollama-models-btn')?.addEventListener('click', () => this._fetchOllamaModels());
    document.getElementById('fetch-or-models-btn')?.addEventListener('click', () => this._fetchOrModels());
    document.getElementById('fetch-lms-models-btn')?.addEventListener('click', () => this._fetchLmsModels());

    // Test connection buttons
    document.getElementById('test-ollama-btn')?.addEventListener('click', () => this._testOllama());
    document.getElementById('test-or-btn')?.addEventListener('click', () => this._testOr());
    document.getElementById('test-lms-btn')?.addEventListener('click', () => this._testLms());

    // Form save
    document.getElementById('settings-form')?.addEventListener('submit', async e => { e.preventDefault(); await this._save(); });
  }

  async _fetchOllamaModels() {
    const btn   = document.getElementById('fetch-ollama-models-btn');
    const url   = document.getElementById('cfg-ollama-url')?.value?.trim() || '';
    const dl    = document.getElementById('ollama-models-list');
    if (!dl) return;
    if (btn) { btn.disabled = true; btn.querySelector('.material-symbols-outlined').style.animation = 'spin .6s linear infinite'; }
    try {
      const res = await API.getOllamaStatus(url);
      const models = res?.models || [];
      dl.innerHTML = models.map(m => `<option value="${m.name || m}">`).join('');
      showToast(`${models.length} Ollama model yüklendi.`, 'success');
    } catch(e) {
      showToast('Ollama modelleri alınamadı: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.querySelector('.material-symbols-outlined').style.animation = ''; }
    }
  }

  async _fetchOrModels() {
    const btn = document.getElementById('fetch-or-models-btn');
    const dl  = document.getElementById('or-models-list');
    if (!dl) return;
    if (btn) { btn.disabled = true; btn.querySelector('.material-symbols-outlined').style.animation = 'spin .6s linear infinite'; }
    try {
      const res = await API.getOpenRouterModels();
      const models = res?.data || res?.models || [];
      dl.innerHTML = models.map(m => `<option value="${m.id || m}">`).join('');
      showToast(`${models.length} OpenRouter model yüklendi.`, 'success');
    } catch(e) {
      showToast('OpenRouter modelleri alınamadı: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.querySelector('.material-symbols-outlined').style.animation = ''; }
    }
  }

  async _fetchLmsModels() {
    const btn = document.getElementById('fetch-lms-models-btn');
    const url = document.getElementById('cfg-lms-url')?.value?.trim() || '';
    const dl  = document.getElementById('lms-models-list');
    if (!dl) return;
    if (btn) { btn.disabled = true; btn.querySelector('.material-symbols-outlined').style.animation = 'spin .6s linear infinite'; }
    try {
      const res = await API.getLmStudioStatus(url);
      const models = res?.models || [];
      dl.innerHTML = models.map(m => `<option value="${m.id || m.name || m}">`).join('');
      showToast(`${models.length} LM Studio model yüklendi.`, 'success');
    } catch(e) {
      showToast('LM Studio modelleri alınamadı: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.querySelector('.material-symbols-outlined').style.animation = ''; }
    }
  }

  async _testOllama() {
    const url = document.getElementById('cfg-ollama-url')?.value?.trim() || '';
    const res = document.getElementById('test-ollama-result');
    if (res) res.textContent = 'Test ediliyor…';
    try {
      const r = await API.getOllamaStatus(url);
      if (res) res.textContent = r?.status === 'ok' ? `✓ Bağlı — ${(r.models||[]).length} model` : '✓ Bağlı';
      if (res) res.style.color = 'var(--c-success)';
    } catch(e) {
      if (res) { res.textContent = '✗ ' + e.message; res.style.color = 'var(--c-danger)'; }
    }
  }

  async _testOr() {
    const res = document.getElementById('test-or-result');
    if (res) res.textContent = 'Test ediliyor…';
    try {
      const r = await API.getOpenRouterModels();
      if (res) { res.textContent = `✓ Bağlı — ${(r?.data||[]).length} model`; res.style.color = 'var(--c-success)'; }
    } catch(e) {
      if (res) { res.textContent = '✗ ' + e.message; res.style.color = 'var(--c-danger)'; }
    }
  }

  async _testLms() {
    const url = document.getElementById('cfg-lms-url')?.value?.trim() || '';
    const res = document.getElementById('test-lms-result');
    if (res) res.textContent = 'Test ediliyor…';
    try {
      const r = await API.getLmStudioStatus(url);
      if (res) { res.textContent = `✓ Bağlı — ${(r?.models||[]).length} model`; res.style.color = 'var(--c-success)'; }
    } catch(e) {
      if (res) { res.textContent = '✗ ' + e.message; res.style.color = 'var(--c-danger)'; }
    }
  }

  async _save() {
    const btn = document.getElementById('settings-save-btn');
    if (btn) btn.disabled = true;
    try {
      const speed = document.querySelector('input[name="speed"]:checked')?.value;
      if (speed) localStorage.setItem('saas-default-speed', speed);

      const maxCvss = document.getElementById('settings-max-cvss')?.value;
      if (maxCvss) localStorage.setItem('saas-max-severity', maxCvss);
      localStorage.setItem('saas-block-exploit', document.getElementById('settings-block-exploit')?.checked ? '1' : '0');

      const provider    = document.querySelector('input[name="ai-provider"]:checked')?.value || '';
      const ollamaUrl   = document.getElementById('cfg-ollama-url')?.value?.trim()   || '';
      const ollamaModel = document.getElementById('cfg-ollama-model')?.value?.trim() || '';
      const orKeyRaw    = document.getElementById('cfg-or-key')?.value?.trim()       || '';
      const orKey       = orKeyRaw === '••••••••' ? (localStorage.getItem('cfg-or-key')||'') : orKeyRaw;
      const orModel     = document.getElementById('cfg-or-model')?.value?.trim()     || '';
      const ocgKey      = document.getElementById('cfg-ocg-key')?.value?.trim()      || '';
      const ocgModel    = document.getElementById('cfg-ocg-model')?.value?.trim()    || '';
      const ocgUrl      = document.getElementById('cfg-ocg-url')?.value?.trim()      || '';
      const lmsUrl      = document.getElementById('cfg-lms-url')?.value?.trim()      || '';
      const lmsModel    = document.getElementById('cfg-lms-model')?.value?.trim()    || '';

      if (provider)    localStorage.setItem('saas-provider', provider);
      if (ollamaUrl)   localStorage.setItem('cfg-ollama-url', ollamaUrl);
      if (ollamaModel) localStorage.setItem('cfg-ollama-model', ollamaModel);
      if (orKey)       localStorage.setItem('cfg-or-key', orKey);
      if (orModel)     localStorage.setItem('cfg-or-model', orModel);
      if (ocgModel)    localStorage.setItem('cfg-ocg-model', ocgModel);
      if (ocgUrl)      localStorage.setItem('cfg-ocg-url', ocgUrl);
      if (lmsUrl)      localStorage.setItem('cfg-lms-url', lmsUrl);
      if (lmsModel)    localStorage.setItem('cfg-lms-model', lmsModel);

      const scanView = document.getElementById('settings-scan-view')?.value;
      if (scanView) localStorage.setItem('saas-scan-view', scanView);
      const rptView = document.getElementById('settings-report-view')?.value;
      if (rptView) localStorage.setItem('saas-report-view', rptView);

      // Persist to backend via correct endpoints
      if (provider) {
        const payload = { provider, ollama_url: ollamaUrl, ollama_model: ollamaModel, openrouter_key: orKey, openrouter_model: orModel, opencode_go_key: ocgKey, opencode_go_model: ocgModel, opencode_go_url: ocgUrl, lmstudio_url: lmsUrl, lmstudio_model: lmsModel };
        try { await API.saveSettings(payload); } catch {}
      }

      showToast('Ayarlar kaydedildi.', 'success');
    } catch(e) {
      showToast('Kayıt hatası: ' + e.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
}

function _setVal(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

/* ══════════════════════════════════════════════════════════
   UsersPage — Admin only: user management
   ══════════════════════════════════════════════════════════ */
class UsersPage {
  mount() {
    const el = document.getElementById('page-users');
    if (el) el.classList.remove('hidden');
    this._load();
  }

  unmount() {
    const el = document.getElementById('page-users');
    if (el) el.classList.add('hidden');
  }

  async _load() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--c-muted-txt);padding:20px;text-align:center">Loading…</td></tr>`;
    try {
      const users = await API.getUsers();
      const currentUser = Auth.getUser();
      tbody.innerHTML = users.map(u => `
        <tr style="border-bottom:1px solid var(--c-border)">
          <td style="padding:12px 10px;font-weight:500">${u.username}</td>
          <td style="padding:12px 10px;color:var(--c-muted-txt);font-size:13px">${u.email}</td>
          <td style="padding:12px 10px">
            ${u.id === currentUser?.id
              ? `<span class="saas-badge">${u.role}</span>`
              : `<select class="saas-select" data-uid="${u.id}" style="width:110px;font-size:13px">
                   ${['admin','analyst','viewer'].map(r =>
                     `<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`
                   ).join('')}
                 </select>`
            }
          </td>
          <td style="padding:12px 10px">
            ${u.is_active
              ? `<span style="color:var(--c-success);font-size:12px;font-weight:600">● Active</span>`
              : `<span style="color:var(--c-danger);font-size:12px;font-weight:600">● Inactive</span>`}
          </td>
          <td style="padding:12px 10px;color:var(--c-muted-txt);font-size:12px">
            ${new Date(u.created_at * 1000).toLocaleDateString()}
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('select[data-uid]').forEach(sel => {
        sel.addEventListener('change', async () => {
          try {
            await API.updateUserRole(sel.dataset.uid, sel.value);
            showToast('Role updated', 'success');
          } catch (e) {
            showToast(e.message, 'error');
            this._load();
          }
        });
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--c-danger);padding:20px">${e.message}</td></tr>`;
    }
  }
}
