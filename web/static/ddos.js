// ─── TIRPAN DDoS / Stress Test Frontend ──────────────────────────────────────
// Handles the DDoS sidebar panel, expanded intel tab, and API communication.

'use strict';

const DDOS = {
    _running: false,
    _pollTimer: null,
    _selectedVector: 'http-flood',
    _pollInterval: 1000,
    _log: [],
};

// ─── Initialization ──────────────────────────────────────────────────────────

function initDDoSPanel() {
    if (initDDoSPanel._bound) return;
    initDDoSPanel._bound = true;

    // Vector selection buttons (sidebar)
    const vectorBtns = document.querySelectorAll('#intel-panel-ddos .ddos-vector-btn');
    vectorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            DDOS._selectedVector = btn.dataset.vector;
            vectorBtns.forEach(b => {
                b.classList.toggle('border-primary/30', b.dataset.vector === DDOS._selectedVector);
                b.classList.toggle('text-primary', b.dataset.vector === DDOS._selectedVector);
                b.classList.toggle('border-border-color', b.dataset.vector !== DDOS._selectedVector);
                b.classList.toggle('text-secondary-text', b.dataset.vector !== DDOS._selectedVector);
            });
        });
    });

    // AI Analyze button
    const analyzeBtn = document.getElementById('ddos-analyze-btn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => DDOS._aiAnalyze());
    }

    // Start button
    const startBtn = document.getElementById('ddos-start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => DDOS._start());
    }

    // Stop button
    const stopBtn = document.getElementById('ddos-stop-btn');
    if (stopBtn) {
        stopBtn.addEventListener('click', () => DDOS._stop());
    }
}

// ─── Start / Stop ────────────────────────────────────────────────────────────

DDOS._start = async function () {
    const targetInput = document.getElementById('ddos-target-input');
    const workersInput = document.getElementById('ddos-workers-input');
    const durationInput = document.getElementById('ddos-duration-input');
    const msgEl = document.getElementById('ddos-msg');
    const startBtn = document.getElementById('ddos-start-btn');
    const stopBtn = document.getElementById('ddos-stop-btn');

    const target = (targetInput?.value || '').trim();
    if (!target) {
        DDOS._showMsg('Please enter a target URL or host.');
        return;
    }

    const workers = parseInt(workersInput?.value || '100') || 100;
    const duration = parseInt(durationInput?.value || '30') || 30;

    try {
        DDOS._showMsg('Launching attack...', false);
        startBtn.disabled = true;
        stopBtn.disabled = true;
        startBtn.querySelector('.material-symbols-outlined').textContent = 'pending';
        startBtn.querySelector('span:last-child').textContent = 'Pending...';

        const resp = await fetch('/api/v1/ddos/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: target,
                vector: DDOS._selectedVector,
                workers: workers,
                duration: duration,
            }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            DDOS._showMsg(data.detail || data.error || 'Start failed.');
            DDOS._resetButtons();
            return;
        }

        DDOS._clearMsg();
        DDOS._running = true;
        DDOS._log = [];
        DDOS._updateUIState();
        DDOS._startPolling();

    } catch (err) {
        DDOS._showMsg('Network error: ' + err.message);
        DDOS._resetButtons();
    }
};

DDOS._stop = async function () {
    const startBtn = document.getElementById('ddos-start-btn');
    const stopBtn = document.getElementById('ddos-stop-btn');

    try {
        stopBtn.disabled = true;
        const resp = await fetch('/api/v1/ddos/stop', { method: 'POST' });
        const data = await resp.json();

        if (!resp.ok) {
            DDOS._showMsg(data.detail || 'Stop failed.');
            DDOS._resetButtons();
            return;
        }

        DDOS._running = false;
        DDOS._stopPolling();
        DDOS._updateUIState();
        DDOS._clearMsg();

    } catch (err) {
        DDOS._showMsg('Network error: ' + err.message);
        DDOS._resetButtons();
    }
};

// ─── Polling ─────────────────────────────────────────────────────────────────

DDOS._startPolling = function () {
    DDOS._stopPolling();
    DDOS._pollTimer = setInterval(() => DDOS._poll(), DDOS._pollInterval);
    DDOS._poll(); // immediate first poll
};

DDOS._stopPolling = function () {
    if (DDOS._pollTimer) {
        clearInterval(DDOS._pollTimer);
        DDOS._pollTimer = null;
    }
};

DDOS._poll = async function () {
    try {
        const resp = await fetch('/api/v1/ddos/status');
        const data = await resp.json();
        DDOS._updateStats(data);

        if (!data.running && DDOS._running) {
            // Attack completed naturally
            DDOS._running = false;
            DDOS._stopPolling();
            DDOS._updateUIState();
        }
    } catch (err) {
        // Silently retry
    }
};

// ─── UI State Updates ────────────────────────────────────────────────────────

DDOS._updateUIState = function () {
    const startBtn = document.getElementById('ddos-start-btn');
    const stopBtn = document.getElementById('ddos-stop-btn');
    const statusIconBox = document.getElementById('ddos-status-icon-box');
    const statusLabel = document.getElementById('ddos-status-label');
    const statusSub = document.getElementById('ddos-status-sub');
    const statsDiv = document.getElementById('ddos-stats');
    const statStatus = document.getElementById('ddos-stat-status');

    if (DDOS._running) {
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.classList.add('opacity-50');
            startBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
            startBtn.querySelector('span:last-child').textContent = 'Running';
        }
        if (stopBtn) {
            stopBtn.disabled = false;
            stopBtn.classList.remove('opacity-30');
        }
        if (statusIconBox) {
            statusIconBox.classList.remove('border-danger');
            statusIconBox.classList.add('border-primary', 'animate-pulse');
            statusIconBox.querySelector('.material-symbols-outlined').classList.remove('text-danger');
            statusIconBox.querySelector('.material-symbols-outlined').classList.add('text-primary');
        }
        if (statusLabel) statusLabel.textContent = 'Attack Active';
        if (statusSub) statusSub.textContent = `${DDOS._selectedVector.toUpperCase()} — Running`;
        if (statsDiv) statsDiv.classList.remove('hidden');
        if (statStatus) statStatus.textContent = 'LIVE';
    } else {
        DDOS._resetButtons();
        if (statusIconBox) {
            statusIconBox.classList.remove('border-primary', 'animate-pulse');
            statusIconBox.classList.add('border-danger');
            statusIconBox.querySelector('.material-symbols-outlined').classList.add('text-danger');
            statusIconBox.querySelector('.material-symbols-outlined').classList.remove('text-primary');
        }
        if (statusLabel) statusLabel.textContent = 'DDoS Engine';
        if (statusSub) statusSub.textContent = 'Idle — Ready';
        if (statStatus) statStatus.textContent = 'IDLE';
    }
};

DDOS._resetButtons = function () {
    const startBtn = document.getElementById('ddos-start-btn');
    const stopBtn = document.getElementById('ddos-stop-btn');

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.classList.remove('opacity-50');
        startBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
        startBtn.querySelector('span:last-child').textContent = 'Launch';
    }
    if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.classList.add('opacity-30');
    }
};

DDOS._updateStats = function (data) {
    // Sidebar stats
    const ppsEl = document.getElementById('ddos-stat-pps');
    const mbpsEl = document.getElementById('ddos-stat-mbps');
    const statusEl = document.getElementById('ddos-stat-status');

    if (ppsEl) ppsEl.textContent = Math.round(data.pps || 0).toLocaleString();
    if (mbpsEl) mbpsEl.textContent = (data.mbps || 0).toFixed(2);
    if (statusEl) {
        const errRate = data.requests > 0 ? ((data.client_err_4xx || 0) + (data.server_err_5xx || 0)) / data.requests * 100 : 0;
        statusEl.textContent = errRate >= 50 ? '5XX↑' : (errRate >= 20 ? '4XX↑' : 'OK');
    }

    // Expanded view stats
    const reqExp = document.getElementById('ddos-exp-stat-req');
    if (reqExp) reqExp.querySelector('p:last-child').textContent = (data.requests || 0).toLocaleString();

    const bwExp = document.getElementById('ddos-exp-stat-bw');
    if (bwExp) bwExp.textContent = ((data.bytes_total || 0) / 1e6).toFixed(2) + ' MB';

    const wExp = document.getElementById('ddos-exp-stat-w');
    if (wExp) wExp.textContent = data.workers || 0;

    const srExp = document.getElementById('ddos-exp-stat-sr');
    if (srExp) {
        const total = data.requests || 0;
        const good = (data.success_2xx || 0) + (data.redirect_3xx || 0);
        srExp.textContent = total > 0 ? Math.round(good / total * 100) + '%' : '—%';
    }

    // Config display
    const targetExp = document.getElementById('ddos-exp-target');
    if (targetExp) targetExp.textContent = data.target || '—';

    const vectorExp = document.getElementById('ddos-exp-vector');
    if (vectorExp) vectorExp.textContent = (data.vector || '').toUpperCase();

    const workersExp = document.getElementById('ddos-exp-workers');
    if (workersExp) workersExp.textContent = data.workers || 0;

    const durationExp = document.getElementById('ddos-exp-duration');
    if (durationExp) durationExp.textContent = (data.duration || 0) + 's';

    // Response breakdown
    const r2xx = document.getElementById('ddos-exp-resp-2xx');
    if (r2xx) r2xx.textContent = (data.success_2xx || 0).toLocaleString();

    const r3xx = document.getElementById('ddos-exp-resp-3xx');
    if (r3xx) r3xx.textContent = (data.redirect_3xx || 0).toLocaleString();

    const r4xx = document.getElementById('ddos-exp-resp-4xx');
    if (r4xx) r4xx.textContent = (data.client_err_4xx || 0).toLocaleString();

    const r5xx = document.getElementById('ddos-exp-resp-5xx');
    if (r5xx) r5xx.textContent = (data.server_err_5xx || 0).toLocaleString();

    const rErr = document.getElementById('ddos-exp-resp-err');
    if (rErr) rErr.textContent = (data.errors || 0).toLocaleString();

    // Log entries
    const recent = {
        time: new Date().toLocaleTimeString(),
        pps: Math.round(data.pps || 0),
        mbps: (data.mbps || 0).toFixed(2),
        requests: data.requests || 0,
        errors: data.errors || 0,
    };
    DDOS._log.push(recent);
    if (DDOS._log.length > 100) DDOS._log.shift();
    DDOS._renderLog();
};

DDOS._renderLog = function () {
    const tbody = document.getElementById('ddos-exp-log-tbody');
    const countEl = document.getElementById('ddos-exp-log-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = DDOS._log.length + ' entries';

    if (DDOS._log.length === 0) {
        tbody.innerHTML = '<tr><td class="px-5 py-4 text-secondary-text text-center" colspan="3">No attack launched yet</td></tr>';
        return;
    }

    const rows = DDOS._log.slice(-20).reverse().map(entry => {
        return (
            `<tr class="border-b border-border-color hover:bg-surface transition-colors">` +
            `<td class="px-5 py-2.5 text-secondary-text">${entry.time}</td>` +
            `<td class="px-4 py-2.5 text-slate-300">${entry.pps.toLocaleString()} req/s — ${entry.mbps} MB/s</td>` +
            `<td class="px-4 py-2.5 text-secondary-text">Total: ${entry.requests.toLocaleString()} | Err: ${entry.errors}</td>` +
            `</tr>`
        );
    }).join('');

    tbody.innerHTML = rows;
};

DDOS._showMsg = function (msg, isError = true) {
    const el = document.getElementById('ddos-msg');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    if (isError) {
        el.classList.add('text-danger', 'bg-danger/5', 'border-danger/20');
    } else {
        el.classList.remove('text-danger', 'bg-danger/5', 'border-danger/20');
        el.classList.add('text-primary', 'bg-primary/5', 'border-primary/20');
    }
};

DDOS._clearMsg = function () {
    const el = document.getElementById('ddos-msg');
    if (el) el.classList.add('hidden');
};

DDOS._aiAnalyze = async function () {
    const targetInput = document.getElementById('ddos-target-input');
    const analyzeBtn = document.getElementById('ddos-analyze-btn');
    const workersInput = document.getElementById('ddos-workers-input');
    const durationInput = document.getElementById('ddos-duration-input');
    const msgEl = document.getElementById('ddos-msg');

    const target = (targetInput?.value || '').trim();
    if (!target) {
        DDOS._showMsg('Enter a target URL first.');
        return;
    }

    if (analyzeBtn) {
        analyzeBtn.disabled = true;
        analyzeBtn.querySelector('.material-symbols-outlined').textContent = 'pending';
    }

    DDOS._showMsg('Probing target & calling AI...', false);

    try {
        const resp = await fetch('/api/v1/ddos/ai-analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target: target }),
        });

        const data = await resp.json();
        const rec = data.recommendation || {};
        const aiUsed = data.ai_used || false;
        const probe = data.probe || {};

        DDOS._showMsg(
            `${aiUsed ? 'AI' : 'Heuristic'} Analysis: ${rec.reasoning || ''}\n` +
            `Target: ${probe.server || '?'} | Status: ${probe.status || '?'} | ` +
            `Recommended → ${(rec.vector || '').toUpperCase()}, ${rec.workers || '?'} workers, ${rec.duration || '?'}s`,
            false
        );

        // Auto-fill recommendations
        if (rec.vector) {
            DDOS._selectedVector = rec.vector;
            const vectorBtns = document.querySelectorAll('#intel-panel-ddos .ddos-vector-btn');
            vectorBtns.forEach(b => {
                const match = b.dataset.vector === DDOS._selectedVector;
                b.classList.toggle('border-primary/30', match);
                b.classList.toggle('text-primary', match);
                b.classList.toggle('border-border-color', !match);
                b.classList.toggle('text-secondary-text', !match);
            });
        }
        if (workersInput && rec.workers) workersInput.value = rec.workers;
        if (durationInput && rec.duration) durationInput.value = rec.duration;

    } catch (err) {
        DDOS._showMsg('AI analysis failed: ' + err.message);
    } finally {
        if (analyzeBtn) {
            analyzeBtn.disabled = false;
            analyzeBtn.querySelector('.material-symbols-outlined').textContent = 'psychology';
        }
    }
};

// ─── Expanded Intel Tab Integration ──────────────────────────────────────────

// Called when the DDoS expanded tab becomes visible
DDOS._refreshExpanded = function () {
    // Copy current settings from sidebar inputs to expanded config
    const targetInput = document.getElementById('ddos-target-input');
    const workersInput = document.getElementById('ddos-workers-input');
    const durationInput = document.getElementById('ddos-duration-input');

    const targetExp = document.getElementById('ddos-exp-target');
    if (targetExp && targetInput) targetExp.textContent = targetInput.value.trim() || '—';

    const vectorExp = document.getElementById('ddos-exp-vector');
    if (vectorExp) vectorExp.textContent = DDOS._selectedVector.toUpperCase();

    const workersExp = document.getElementById('ddos-exp-workers');
    if (workersExp && workersInput) workersExp.textContent = workersInput.value || '100';

    const durationExp = document.getElementById('ddos-exp-duration');
    if (durationExp && durationInput) durationExp.textContent = (durationInput?.value || '30') + 's';
};

// ─── Refresh DDoS data on intel panel switch ─────────────────────────────────

function refreshDDoSPanelForSession(sessionId) {
    DDOS._refreshExpanded();
}

// ─── Launch init ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initDDoSPanel();
});

// ─── Cleanup on page unload ──────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
    DDOS._stopPolling();
});
