/**
 * TIRPAN Defense — Frontend JavaScript Module
 *
 * Manages:
 *  - Defense session CRUD & lifecycle
 *  - WebSocket event handlers for all defense event types
 *  - Threat feed rendering (alerts, blocks, honeypot hits)
 *  - Attacker profile card updates
 *  - LLM reasoning stream rendering
 *  - Manual approval modal
 *  - Battle mode integration
 *  - SVG network topology
 */

// ── State ─────────────────────────────────────────────────────────────────────

const DefenseState = {
  currentSessionId: null,
  currentMode: 'manual',
  sessions: [],
  alerts: [],
  blocks: [],
  deceptions: [],
  profiles: {},
  pendingApprovalId: null,
  battleModeActive: false,
  battlePentestSid: null,
  agentState: 'idle',
  tokenBuffer: '',   // streaming token accumulator for reasoning feed
  currentReasoningEl: null,  // current streaming paragraph element
};

// ── Initialization ────────────────────────────────────────────────────────────

async function defenseInit() {
  await defenseLoadSessions();
}

// ── Session management ────────────────────────────────────────────────────────

async function defenseLoadSessions() {
  try {
    const res = await fetch('/api/v1/defense/sessions');
    const data = await res.json();
    DefenseState.sessions = data.sessions || [];
    defensePopulateSessionSelect();
  } catch (e) {
    console.error('defenseLoadSessions error:', e);
  }
}

function defensePopulateSessionSelect() {
  const sel = document.getElementById('def-network-select');
  if (!sel) return;
  const prev = DefenseState.currentSessionId;
  sel.innerHTML = '<option value="">-- Select session --</option>';
  for (const s of DefenseState.sessions) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name || s.network} ${s.live ? '● LIVE' : ''}`;
    sel.appendChild(opt);
  }
  if (prev && DefenseState.sessions.find(s => s.id === prev)) {
    sel.value = prev;
  }
  sel.onchange = () => defenseSelectSession(sel.value);
}

async function defenseSelectSession(sessionId) {
  DefenseState.currentSessionId = sessionId || null;
  if (!sessionId) {
    defenseResetUI();
    return;
  }

  try {
    const res = await fetch(`/api/v1/defense/sessions/${sessionId}`);
    const data = await res.json();
    const session = data.session;
    DefenseState.currentMode = session.mode;
    defenseUpdateStatusBadge(session.status, session.live, session.agent_state);
    defenseUpdateModeButtons(session.mode);
    await defenseLoadAlerts(sessionId);
    await defenseLoadBlocks(sessionId);
    await defenseLoadDeceptions(sessionId);
    await defenseLoadProfiles(sessionId);

    // Wire WebSocket for this session (defense-specific subscription)
    if (typeof wsSubscribeDefense === 'function') {
      wsSubscribeDefense(sessionId);
    }
  } catch (e) {
    console.error('defenseSelectSession error:', e);
  }
}

function defenseNewSession() {
  document.getElementById('def-new-session-modal').classList.remove('hidden');
}

async function defenseCreateSession() {
  const network = document.getElementById('def-new-network').value.trim();
  const name = document.getElementById('def-new-name').value.trim();
  const modeEl = document.querySelector('input[name="def-new-mode"]:checked');
  const mode = modeEl ? modeEl.value : 'manual';

  if (!network) {
    alert('Network CIDR is required (e.g. 192.168.1.0/24)');
    return;
  }

  try {
    const res = await fetch('/api/v1/defense/sessions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({network, name, mode}),
    });
    const data = await res.json();
    if (!data.success) throw new Error(JSON.stringify(data));

    document.getElementById('def-new-session-modal').classList.add('hidden');
    document.getElementById('def-new-network').value = '';
    document.getElementById('def-new-name').value = '';

    await defenseLoadSessions();
    const sel = document.getElementById('def-network-select');
    sel.value = data.session.id;
    defenseSelectSession(data.session.id);
  } catch (e) {
    alert('Failed to create session: ' + e.message);
  }
}

async function defenseStartSession() {
  if (!DefenseState.currentSessionId) {
    alert('Select or create a defense session first.');
    return;
  }

  try {
    const res = await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/start`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({remote_hosts: []}),
    });
    const data = await res.json();
    if (data.success) {
      defenseUpdateStatusBadge('monitoring', true, 'monitoring');
      document.getElementById('def-start-btn').classList.add('hidden');
      document.getElementById('def-stop-btn').classList.remove('hidden');
      defenseAddReasoningEntry('system', 'Defense monitoring started. Watching network for threats...');
    }
  } catch (e) {
    console.error('defenseStartSession error:', e);
  }
}

async function defenseStopSession() {
  if (!DefenseState.currentSessionId) return;
  try {
    await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/stop`, {method: 'POST'});
    defenseUpdateStatusBadge('idle', false, 'stopped');
    document.getElementById('def-start-btn').classList.remove('hidden');
    document.getElementById('def-stop-btn').classList.add('hidden');
    defenseAddReasoningEntry('system', 'Defense monitoring stopped.');
  } catch (e) {
    console.error('defenseStopSession error:', e);
  }
}

// ── Mode switching ────────────────────────────────────────────────────────────

async function defenseSetMode(mode) {
  DefenseState.currentMode = mode;
  defenseUpdateModeButtons(mode);

  if (!DefenseState.currentSessionId) return;
  try {
    await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/mode`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode}),
    });
  } catch (e) {
    console.error('defenseSetMode error:', e);
  }
}

function defenseUpdateModeButtons(mode) {
  const manualBtn = document.getElementById('def-mode-manual');
  const autoBtn = document.getElementById('def-mode-auto');
  if (!manualBtn || !autoBtn) return;

  if (mode === 'manual') {
    manualBtn.className = 'px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-black bg-primary rounded-sm transition-all';
    autoBtn.className = 'px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-secondary-text hover:text-white transition-all';
  } else {
    autoBtn.className = 'px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-black bg-primary rounded-sm transition-all';
    manualBtn.className = 'px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-secondary-text hover:text-white transition-all';
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

function defenseUpdateStatusBadge(status, live, agentState) {
  DefenseState.agentState = agentState;
  const badge = document.getElementById('def-status-badge');
  const text = document.getElementById('def-status-text');
  const dot = badge?.querySelector('span:first-child');
  const stateEl = document.getElementById('def-agent-state');

  if (!badge || !text) return;

  const statusDisplay = live ? (agentState || status).toUpperCase() : 'IDLE';
  text.textContent = statusDisplay;

  if (dot) {
    dot.className = live
      ? 'w-1.5 h-1.5 rounded-full bg-primary animate-pulse'
      : 'w-1.5 h-1.5 rounded-full bg-secondary-text';
  }

  if (stateEl) stateEl.textContent = (agentState || 'IDLE').toUpperCase();
}

// ── Alert feed ────────────────────────────────────────────────────────────────

async function defenseLoadAlerts(sessionId) {
  try {
    const res = await fetch(`/api/v1/defense/sessions/${sessionId}/alerts?limit=50`);
    const data = await res.json();
    DefenseState.alerts = data.alerts || [];
    defenseRenderAlerts();
    defenseUpdateStats();
  } catch (e) {}
}

function defenseRenderAlerts() {
  const feed = document.getElementById('def-alert-feed');
  if (!feed) return;

  if (!DefenseState.alerts.length) {
    feed.innerHTML = '<p class="text-[10px] text-secondary-text text-center py-3">No alerts</p>';
    return;
  }

  feed.innerHTML = '';
  for (const a of DefenseState.alerts.slice(0, 30)) {
    const el = document.createElement('div');
    const severityColors = {
      CRITICAL: 'border-red-500 bg-red-500/5 text-red-400',
      HIGH: 'border-orange-500 bg-orange-500/5 text-orange-400',
      MEDIUM: 'border-yellow-500 bg-yellow-500/5 text-yellow-400',
      LOW: 'border-border-color bg-background-dark text-secondary-text',
    };
    const colors = severityColors[a.severity] || severityColors.LOW;
    el.className = `flex items-center gap-2 border-l-2 px-2 py-1.5 cursor-pointer hover:bg-white/5 transition-all ${colors}`;
    el.innerHTML = `
      <span class="w-1.5 h-1.5 rounded-full bg-current shrink-0"></span>
      <div class="min-w-0 flex-1">
        <p class="text-[9px] font-bold uppercase truncate">${a.alert_type}</p>
        <p class="text-[8px] opacity-60 truncate">${a.src_ip || '?'} → ${a.dst_ip || '?'}</p>
      </div>
      <span class="text-[7px] font-bold uppercase opacity-60 shrink-0">${a.severity}</span>
    `;
    feed.appendChild(el);
  }

  const countEl = document.getElementById('def-alert-count');
  if (countEl) countEl.textContent = DefenseState.alerts.length;
}

function defenseAddAlert(alert) {
  DefenseState.alerts.unshift(alert);
  defenseRenderAlerts();
  defenseUpdateStats();

  // Flash notification
  const feed = document.getElementById('def-alert-feed');
  if (feed && feed.firstChild && feed.firstChild.classList) {
    feed.firstChild.classList.add('def-alert-flash');
    setTimeout(() => feed.firstChild?.classList.remove('def-alert-flash'), 1000);
  }
}

// ── Blocks list ───────────────────────────────────────────────────────────────

async function defenseLoadBlocks(sessionId) {
  try {
    const res = await fetch(`/api/v1/defense/sessions/${sessionId}/blocks?active_only=true`);
    const data = await res.json();
    DefenseState.blocks = data.blocks || [];
    defenseRenderBlocks();
    defenseUpdateStats();
  } catch (e) {}
}

function defenseRenderBlocks() {
  const list = document.getElementById('def-blocks-list');
  const countEl = document.getElementById('def-block-count');
  if (!list) return;

  const active = DefenseState.blocks.filter(b => b.active);
  if (countEl) countEl.textContent = active.length;

  if (!active.length) {
    list.innerHTML = '<p class="text-[10px] text-secondary-text text-center py-2">No blocks</p>';
    return;
  }

  list.innerHTML = '';
  for (const b of active.slice(0, 20)) {
    const el = document.createElement('div');
    el.className = 'flex items-center gap-2 bg-red-500/5 border border-red-500/20 px-2 py-1.5';
    el.innerHTML = `
      <span class="material-symbols-outlined text-red-400 text-[12px]">block</span>
      <div class="min-w-0 flex-1">
        <p class="text-[9px] font-bold mono-text text-red-400 truncate">${b.target_ip}</p>
        <p class="text-[8px] text-secondary-text truncate">${b.block_type}</p>
      </div>
    `;
    list.appendChild(el);
  }
}

function defenseAddBlock(block) {
  DefenseState.blocks.unshift(block);
  defenseRenderBlocks();
  defenseUpdateStats();
  defenseActionLog(`BLOCKED: ${block.ip} (${block.action})`);
}

// ── Deceptions list ───────────────────────────────────────────────────────────

async function defenseLoadDeceptions(sessionId) {
  try {
    const res = await fetch(`/api/v1/defense/sessions/${sessionId}/deceptions`);
    const data = await res.json();
    DefenseState.deceptions = data.deceptions || [];
    defenseRenderDeceptions();
  } catch (e) {}
}

function defenseRenderDeceptions() {
  const list = document.getElementById('def-deceptions-list');
  if (!list) return;

  if (!DefenseState.deceptions.length) {
    list.innerHTML = '<p class="text-[10px] text-secondary-text text-center py-2">No active deceptions</p>';
    return;
  }

  list.innerHTML = '';
  for (const d of DefenseState.deceptions.slice(0, 10)) {
    const icon = d.deception_type === 'HONEYPOT' ? '🍯' : '🐦';
    const el = document.createElement('div');
    el.className = 'flex items-center gap-2 text-[10px]';
    el.innerHTML = `
      <span>${icon}</span>
      <div class="min-w-0">
        <p class="mono-text truncate text-primary">${d.fake_service || d.deception_type}${d.bind_port ? ':' + d.bind_port : ''}</p>
        <p class="text-[8px] text-secondary-text">${d.triggered || 0} hits</p>
      </div>
    `;
    list.appendChild(el);
  }
}

function defenseAddDeception(d) {
  DefenseState.deceptions.unshift(d);
  defenseRenderDeceptions();
  defenseUpdateStats();
  defenseActionLog(`DEPLOYED: ${d.deception_type} on port ${d.port || '?'}`);
}

// ── Attacker profile card ─────────────────────────────────────────────────────

async function defenseLoadProfiles(sessionId) {
  try {
    const res = await fetch(`/api/v1/defense/sessions/${sessionId}/profiles`);
    const data = await res.json();
    for (const p of (data.profiles || [])) {
      DefenseState.profiles[p.src_ip] = p;
    }
    defenseUpdateStats();
  } catch (e) {}
}

function defenseUpdateProfile(profile) {
  DefenseState.profiles[profile.src_ip] = profile;
  defenseRenderProfileCard(profile);
  defenseUpdateStats();
}

function defenseRenderProfileCard(profile) {
  const card = document.getElementById('def-profile-card');
  if (!card) return;

  card.classList.remove('hidden');
  document.getElementById('def-profile-ip').textContent = profile.src_ip;
  document.getElementById('def-profile-actor').textContent = profile.actor_guess || 'Unknown';
  document.getElementById('def-profile-actor-conf').textContent =
    profile.actor_conf ? ` (${Math.round(profile.actor_conf * 100)}%)` : '';
  document.getElementById('def-profile-next').textContent =
    profile.next_move
      ? `${profile.next_move} (${Math.round((profile.next_move_conf || 0) * 100)}%)`
      : '—';
  document.getElementById('def-profile-ttps').textContent =
    (profile.ttps || []).join(', ') || '—';
  document.getElementById('def-profile-knows').textContent =
    (profile.known_hosts || []).join(', ') || '—';
  document.getElementById('def-profile-deceived').textContent =
    (profile.deceived_with || []).join(', ') || 'None';
}

// ── Reasoning feed ────────────────────────────────────────────────────────────

function defenseAddReasoningEntry(type, content, extra) {
  const feed = document.getElementById('def-reasoning-feed');
  if (!feed) return;

  // Remove placeholder if present
  const placeholder = feed.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');

  if (type === 'system') {
    el.className = 'text-[10px] text-secondary-text font-mono border-l-2 border-border-color pl-3 py-1';
    el.textContent = `> ${content}`;
  } else if (type === 'thought') {
    el.className = 'bg-card border border-border-color p-3';
    el.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="w-1 h-1 rounded-full bg-primary"></span>
        <span class="text-[8px] font-bold uppercase tracking-widest text-secondary-text">Agent Reasoning</span>
        ${extra?.phase ? `<span class="ml-auto text-[7px] uppercase text-secondary-text">${extra.phase}</span>` : ''}
      </div>
      <p class="text-[10px] font-mono text-white leading-relaxed whitespace-pre-wrap">${_escHtml(content)}</p>
      ${extra?.action && extra.action !== 'done' && extra.action !== 'monitor'
        ? `<div class="mt-2 pt-2 border-t border-border-color text-[9px] mono-text text-primary">→ ${extra.action}</div>`
        : ''}
    `;
  } else if (type === 'action') {
    const success = extra?.success !== false;
    el.className = `text-[10px] font-mono pl-3 border-l-2 ${success ? 'border-primary text-primary' : 'border-red-500 text-red-400'}`;
    el.textContent = `${success ? '✓' : '✗'} ${content}`;
  } else if (type === 'alert') {
    const severityIcon = {CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪'}[extra?.severity] || '⚪';
    el.className = 'flex items-start gap-2 py-1';
    el.innerHTML = `
      <span class="shrink-0 text-[12px]">${severityIcon}</span>
      <div>
        <span class="text-[9px] font-bold uppercase">${extra?.alert_type || 'ALERT'}</span>
        <span class="text-[9px] text-secondary-text ml-2">${content}</span>
      </div>
    `;
  } else if (type === 'honeypot') {
    el.className = 'text-[10px] font-mono text-primary border-l-2 border-primary pl-3 py-0.5';
    el.textContent = `🍯 ${content}`;
  } else if (type === 'canary') {
    el.className = 'text-[10px] font-mono text-primary border-l-2 border-primary pl-3 py-0.5';
    el.textContent = `🐦 ${content}`;
  } else {
    el.className = 'text-[10px] font-mono text-secondary-text';
    el.textContent = content;
  }

  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
}

// Streaming token support (for LLM reasoning stream)
function defenseStartTokenStream() {
  DefenseState.tokenBuffer = '';
  const feed = document.getElementById('def-reasoning-feed');
  if (!feed) return;

  const placeholder = feed.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');
  el.className = 'bg-card border border-border-color p-3';
  el.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <span class="w-1 h-1 rounded-full bg-primary animate-pulse"></span>
      <span class="text-[8px] font-bold uppercase tracking-widest text-secondary-text">Agent Reasoning</span>
    </div>
    <p class="def-stream-content text-[10px] font-mono text-white leading-relaxed whitespace-pre-wrap"></p>
  `;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  DefenseState.currentReasoningEl = el.querySelector('.def-stream-content');
}

function defenseAppendToken(token) {
  DefenseState.tokenBuffer += token;
  if (DefenseState.currentReasoningEl) {
    DefenseState.currentReasoningEl.textContent = DefenseState.tokenBuffer;
    const feed = document.getElementById('def-reasoning-feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
  }
}

function defenseEndTokenStream() {
  DefenseState.currentReasoningEl = null;
}

// ── Action log ────────────────────────────────────────────────────────────────

function defenseActionLog(msg) {
  const log = document.getElementById('def-action-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = 'mono-text text-[10px] text-primary';
  el.textContent = `> ${msg}`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function defenseUpdateStats() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('def-stat-alerts', DefenseState.alerts.length);
  set('def-stat-blocks', DefenseState.blocks.filter(b => b.active).length);
  set('def-stat-deceptions', DefenseState.deceptions.filter(d => d.status === 'active').length);
  set('def-stat-profiles', Object.keys(DefenseState.profiles).length);
}

// ── Detector toggles ──────────────────────────────────────────────────────────

async function defenseToggleDetector(name) {
  if (!DefenseState.currentSessionId) return;

  const btn = document.querySelector(`.def-detector-toggle[data-detector="${name}"]`);
  if (!btn) return;

  const enabled = btn.dataset.enabled === 'true';
  const newEnabled = !enabled;

  try {
    await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/detector`, {
      method: 'PATCH',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({detector: name, enabled: newEnabled}),
    });

    btn.dataset.enabled = String(newEnabled);
    if (newEnabled) {
      btn.className = 'def-detector-toggle px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[7px] font-bold uppercase';
      btn.textContent = 'ON';
    } else {
      btn.className = 'def-detector-toggle px-2 py-0.5 bg-white/5 border border-border-color text-secondary-text text-[7px] font-bold uppercase';
      btn.textContent = 'OFF';
    }
  } catch (e) {
    console.error('defenseToggleDetector error:', e);
  }
}

// ── Operator message ──────────────────────────────────────────────────────────

async function defenseSendMessage() {
  const input = document.getElementById('def-operator-input');
  if (!input || !input.value.trim()) return;
  if (!DefenseState.currentSessionId) {
    alert('No active defense session.');
    return;
  }

  const message = input.value.trim();
  input.value = '';

  defenseAddReasoningEntry('system', `Operator: ${message}`);

  try {
    await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/inject`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message}),
    });
  } catch (e) {
    console.error('defenseSendMessage error:', e);
  }
}

// ── Manual approval ───────────────────────────────────────────────────────────

function defenseShowApprovalRequest(approvalId, tool, params, reasoning) {
  DefenseState.pendingApprovalId = approvalId;
  const card = document.getElementById('def-approval-card');
  const details = document.getElementById('def-approval-details');
  if (!card || !details) return;

  details.textContent = `Action: ${tool}\nParameters: ${JSON.stringify(params, null, 2)}`;
  if (reasoning) {
    details.textContent += `\n\nReasoning: ${reasoning}`;
  }

  card.classList.remove('hidden');
  defenseAddReasoningEntry('system', `⏳ Waiting for approval: ${tool}`);
}

async function defenseApprove(approved) {
  const id = DefenseState.pendingApprovalId;
  if (!id) return;

  const card = document.getElementById('def-approval-card');
  if (card) card.classList.add('hidden');
  DefenseState.pendingApprovalId = null;

  defenseAddReasoningEntry('system', approved ? `✓ Action approved` : `✗ Action denied`);

  try {
    await fetch(`/api/v1/defense/approval/${id}/respond`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({approved}),
    });
  } catch (e) {
    console.error('defenseApprove error:', e);
  }
}

// ── Battle mode ───────────────────────────────────────────────────────────────

async function defenseToggleBattleMode() {
  if (!DefenseState.currentSessionId) {
    alert('Select a defense session first.');
    return;
  }

  const btn = document.getElementById('def-battle-btn');
  const badge = document.getElementById('def-battle-badge');

  if (DefenseState.battleModeActive) {
    // Disable
    await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/battle`, {
      method: 'DELETE',
    });
    DefenseState.battleModeActive = false;
    DefenseState.battlePentestSid = null;
    if (btn) btn.textContent = 'Enable Battle Mode';
    if (badge) badge.classList.add('hidden');
    defenseAddReasoningEntry('system', 'Battle mode disabled.');
  } else {
    // Enable
    const sel = document.getElementById('def-battle-session');
    const pentestSid = sel ? sel.value : '';
    if (!pentestSid) {
      alert('Select an active pentest session first.');
      return;
    }

    await fetch(`/api/v1/defense/sessions/${DefenseState.currentSessionId}/battle`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({pentest_session_id: pentestSid}),
    });

    DefenseState.battleModeActive = true;
    DefenseState.battlePentestSid = pentestSid;
    if (btn) btn.textContent = 'Disable Battle Mode';
    if (badge) badge.classList.remove('hidden');
    defenseAddReasoningEntry('system', `⚔️ Battle mode ACTIVE — monitoring pentest session ${pentestSid.slice(0, 8)}...`);
  }
}

// Populate battle mode pentest session list from main app state
function defensePopulateBattleSessions(sessions) {
  const sel = document.getElementById('def-battle-session');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- No pentest session --</option>';
  for (const s of (sessions || [])) {
    if (s.status === 'running') {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.target || s.id.slice(0, 8)} [${s.status}]`;
      sel.appendChild(opt);
    }
  }
}

// ── Network topology SVG ──────────────────────────────────────────────────────

function defenseUpdateTopology(hosts) {
  const svg = document.getElementById('def-topology-svg');
  if (!svg) return;

  const cx = 120, cy = 100, radius = 70;
  const n = hosts.length;
  let circles = '';

  hosts.slice(0, 12).forEach((host, i) => {
    const angle = (i / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    const isAttacker = DefenseState.alerts.some(a => a.src_ip === host.ip);
    const color = isAttacker ? '#ef4444' : '#ccff00';
    circles += `
      <circle cx="${x}" cy="${y}" r="5" fill="${color}" opacity="0.8"/>
      <text x="${x}" y="${y + 14}" text-anchor="middle" fill="#888" font-size="7" font-family="monospace">${host.ip}</text>
    `;
  });

  // Center gateway
  circles += `<circle cx="${cx}" cy="${cy}" r="8" fill="#ccff00" opacity="0.5"/>
              <text x="${cx}" y="${cy + 20}" text-anchor="middle" fill="#ccff00" font-size="8" font-family="monospace">GW</text>`;

  svg.innerHTML = circles;
}

// ── Honeypot hit display ──────────────────────────────────────────────────────

function defenseAddHoneypotHit(hit) {
  const list = document.getElementById('def-honeypot-hits');
  if (!list) return;

  const placeholder = list.querySelector('p');
  if (placeholder) placeholder.remove();

  const el = document.createElement('div');
  el.className = 'bg-primary/5 border border-primary/20 px-2 py-1.5 text-[9px]';
  el.innerHTML = `
    <span class="text-primary font-bold">🍯 HIT</span>
    <span class="text-secondary-text ml-2">${hit.src_ip} → :${hit.port}</span>
    <p class="text-[8px] text-secondary-text mt-0.5 truncate font-mono">${_escHtml(hit.payload || '')}</p>
  `;
  list.insertBefore(el, list.firstChild);
  defenseAddReasoningEntry('honeypot', `Hit on ${hit.service}:${hit.port} from ${hit.src_ip} — payload: ${hit.payload || '(empty)'}`);
}

// ── WebSocket event handlers (called from app.js) ─────────────────────────────

function defenseHandleWsEvent(type, data) {
  switch (type) {
    case 'defense_alert':
      defenseAddAlert(data);
      defenseAddReasoningEntry('alert',
        `${data.src_ip || '?'} → ${data.dst_ip || '?'}:${data.dst_port || '?'}`,
        {alert_type: data.alert_type, severity: data.severity}
      );
      break;

    case 'defense_block':
      defenseAddBlock(data);
      break;

    case 'defense_deception':
      defenseAddDeception(data);
      break;

    case 'attacker_profile':
      defenseUpdateProfile(data);
      break;

    case 'defense_reasoning':
      // End any previous stream
      defenseEndTokenStream();
      defenseAddReasoningEntry('thought', data.thought || '', {
        phase: data.phase,
        action: data.action,
      });
      break;

    case 'defense_token':
      // LLM streaming token
      if (!DefenseState.currentReasoningEl) {
        defenseStartTokenStream();
      }
      defenseAppendToken(data.content || '');
      break;

    case 'defense_action':
      defenseActionLog(
        `${data.success ? '✓' : '✗'} ${data.tool} ${data.success ? 'succeeded' : 'FAILED'}`
      );
      break;

    case 'defense_approval_request':
      defenseShowApprovalRequest(data.approval_id, data.tool, data.params, data.llm_reasoning);
      break;

    case 'defense_status':
      if (data.status) {
        defenseUpdateStatusBadge(data.status, data.status === 'monitoring', data.status);
      }
      if (data.mode) {
        defenseUpdateModeButtons(data.mode);
      }
      if (data.battle_mode !== undefined) {
        DefenseState.battleModeActive = data.battle_mode;
        const badge = document.getElementById('def-battle-badge');
        if (badge) {
          data.battle_mode ? badge.classList.remove('hidden') : badge.classList.add('hidden');
        }
      }
      break;

    case 'defense_session_started':
      defenseUpdateStatusBadge('monitoring', true, 'monitoring');
      document.getElementById('def-start-btn')?.classList.add('hidden');
      document.getElementById('def-stop-btn')?.classList.remove('hidden');
      break;

    case 'defense_session_stopped':
      defenseUpdateStatusBadge('idle', false, 'stopped');
      document.getElementById('def-start-btn')?.classList.remove('hidden');
      document.getElementById('def-stop-btn')?.classList.add('hidden');
      break;

    case 'honeypot_hit':
      defenseAddHoneypotHit(data);
      break;

    case 'canary_triggered':
      defenseAddReasoningEntry('canary',
        `CANARY TRIGGERED: ${data.canary_id} at ${data.path || 'unknown path'} — triggered by ${data.triggered_by_ip || '?'}`
      );
      break;

    case 'defense_detector_alert':
      // Raw detector event (before LLM analysis)
      defenseAddReasoningEntry('system',
        `[DETECTOR] ${data.alert_type} from ${data.src_ip || '?'} (${data.severity})`
      );
      break;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function defenseResetUI() {
  DefenseState.alerts = [];
  DefenseState.blocks = [];
  DefenseState.deceptions = [];
  DefenseState.profiles = {};
  defenseRenderAlerts();
  defenseRenderBlocks();
  defenseRenderDeceptions();
  defenseUpdateStats();

  const feed = document.getElementById('def-reasoning-feed');
  if (feed) {
    feed.innerHTML = `
      <div class="text-center text-secondary-text py-8" data-placeholder>
        <span class="material-symbols-outlined text-[48px] opacity-20">security</span>
        <p class="mt-4 text-[11px] uppercase tracking-widest">Defense agent idle</p>
        <p class="text-[10px] mt-2 opacity-60">Start monitoring to activate</p>
      </div>
    `;
  }

  const card = document.getElementById('def-profile-card');
  if (card) card.classList.add('hidden');
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── CSS injection for flash animation ────────────────────────────────────────

(function injectDefenseCSS() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes defAlertFlash {
      0% { background-color: rgba(204,255,0,0.15); }
      100% { background-color: transparent; }
    }
    .def-alert-flash {
      animation: defAlertFlash 0.8s ease-out;
    }
  `;
  document.head.appendChild(style);
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', defenseInit);
} else {
  defenseInit();
}
