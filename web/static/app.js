// ─── Mobile Sidebar ──────────────────────────────────────────────────────────

function toggleMobileSidebar() {
    const sb = document.getElementById('left-sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sb.classList.contains('mobile-open')) {
        sb.classList.remove('mobile-open');
        overlay.classList.remove('active');
    } else {
        sb.classList.add('mobile-open');
        overlay.classList.add('active');
    }
}

function closeMobileSidebar() {
    document.getElementById('left-sidebar').classList.remove('mobile-open');
    document.getElementById('right-sidebar').classList.remove('mobile-open');
    document.getElementById('mobile-overlay').classList.remove('active');
}

function toggleMobileRightSidebar() {
    const sb = document.getElementById('right-sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sb.classList.contains('mobile-open')) {
        sb.classList.remove('mobile-open');
        overlay.classList.remove('active');
    } else {
        document.getElementById('left-sidebar').classList.remove('mobile-open');
        sb.classList.add('mobile-open');
        overlay.classList.add('active');
    }
}

// ─── Sidebar Collapse ───────────────────────────────────────────────────────

function initSidebars() {
    const leftBtn = document.getElementById('left-collapse-btn');
    const rightBtn = document.getElementById('right-collapse-btn');

    leftBtn.addEventListener('click', () => {
        const sb = document.getElementById('left-sidebar');
        sb.classList.toggle('sidebar-collapsed-left');
        const icon = leftBtn.querySelector('.material-symbols-outlined');
        icon.textContent = sb.classList.contains('sidebar-collapsed-left')
            ? 'chevron_right'
            : 'chevron_left';
    });

    rightBtn.addEventListener('click', () => {
        const sb = document.getElementById('right-sidebar');
        sb.classList.toggle('sidebar-collapsed-right');
        const icon = rightBtn.querySelector('.material-symbols-outlined');
        icon.textContent = sb.classList.contains('sidebar-collapsed-right')
            ? 'chevron_left'
            : 'chevron_right';
    });
}

// ─── View Switching (Agent ↔ Console) ───────────────────────────────────────

let currentView = 'agent';
let previousView = 'agent';

const ALL_VIEWS = ['agent', 'chat', 'console', 'audit', 'config', 'report', 'intel', 'mission'];

function switchView(viewName) {
    if (!viewName) return;
    if (currentView !== 'intel') previousView = currentView;

    // Hide all views, show target
    ALL_VIEWS.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    currentView = viewName;
    syncInputMode();

    // Restore saved agent sub-view (feed/graph) when switching to agent
    if (viewName === 'agent') {
        try {
            const saved = localStorage.getItem('agView');
            if (saved === 'graph' || saved === 'feed') switchAgentView(saved);
        } catch(e) {}
    }

    // Update nav highlight
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        const view = item.dataset.view;
        const icon = item.querySelector('.material-symbols-outlined');
        if (view === viewName) {
            item.classList.remove('text-secondary-text');
            item.classList.add('text-primary');
            if (icon) icon.style.fontVariationSettings = "'FILL' 1";
        } else {
            item.classList.add('text-secondary-text');
            item.classList.remove('text-primary');
            if (icon) icon.style.fontVariationSettings = "'FILL' 0";
        }
    });
}

function initBottomNav() {
    const navItems = document.querySelectorAll('.bottom-nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view) {
                switchView(view);
                closeMobileSidebar();
            }
        });
    });
}

// ─── Console Tabs ────────────────────────────────────────────────────────────

function initConsoleTabs() {
    const tabs = document.querySelectorAll('.console-tab');
    const bodies = document.querySelectorAll('.console-body');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            tabs.forEach(t => {
                if (t.dataset.tab === target) {
                    t.classList.add('bg-black', 'text-primary', 'border-t-2', 'border-t-primary');
                    t.classList.remove('text-secondary-text', 'hover:bg-white/5');
                } else {
                    t.classList.remove('bg-black', 'text-primary', 'border-t-2', 'border-t-primary');
                    t.classList.add('text-secondary-text', 'hover:bg-white/5');
                }
            });

            bodies.forEach(body => {
                if (body.dataset.tab === target) {
                    body.classList.remove('hidden');
                } else {
                    body.classList.add('hidden');
                }
            });
        });
    });
}

// ─── Pentest / Defense Mode Toggle ──────────────────────────────────────────

function initModeToggle() {
    const pentestBtn = document.getElementById('mode-pentest');
    const defenseBtn = document.getElementById('mode-defense');

    function setMode(mode) {
        if (mode === 'pentest') {
            pentestBtn.classList.add('bg-primary', 'text-black');
            pentestBtn.classList.remove('text-secondary-text', 'hover:text-white');
            defenseBtn.classList.remove('bg-primary', 'text-black');
            defenseBtn.classList.add('text-secondary-text', 'hover:text-white');
        } else {
            defenseBtn.classList.add('bg-primary', 'text-black');
            defenseBtn.classList.remove('text-secondary-text', 'hover:text-white');
            pentestBtn.classList.remove('bg-primary', 'text-black');
            pentestBtn.classList.add('text-secondary-text', 'hover:text-white');
        }
        _updateShieldVisibility(mode === 'defense');
    }

    pentestBtn.addEventListener('click', () => setMode('pentest'));
    defenseBtn.addEventListener('click', () => setMode('defense'));

    // Initialize: shield hidden on pentest (default)
    _updateShieldVisibility(false);
}

function _updateShieldVisibility(show) {
    // Tab button in expanded intel view
    const shieldTabBtn = document.querySelector('.intel-tab[data-intel-tab="shield"]');
    // Nav item in right sidebar
    const shieldNavItem = document.querySelector('.intel-nav-item[data-panel="shield"]');
    // Right sidebar panel content
    const shieldPanel = document.getElementById('intel-panel-shield');
    // Expanded-view tab body
    const shieldTabBody = document.querySelector('.intel-tab-body[data-intel-tab="shield"]');

    if (show) {
        if (shieldTabBtn)  shieldTabBtn.style.display  = '';
        if (shieldNavItem) shieldNavItem.style.display = '';
        if (shieldPanel)   shieldPanel.classList.remove('hidden');
        if (shieldTabBody) shieldTabBody.classList.remove('hidden');
    } else {
        if (shieldTabBtn)  shieldTabBtn.style.display  = 'none';
        if (shieldNavItem) shieldNavItem.style.display = 'none';
        // If the shield panel is currently visible, switch to analysis first
        if (shieldPanel && !shieldPanel.classList.contains('hidden')) {
            switchIntelPanel('analysis');
        }
        if (shieldPanel) shieldPanel.classList.add('hidden');
        if (shieldTabBody && !shieldTabBody.classList.contains('hidden')) {
            shieldTabBody.classList.add('hidden');
        }
    }
}

// ─── Right Sidebar Intelligence Nav ─────────────────────────────────────────

const ALL_INTEL_PANELS = ['analysis', 'network', 'shield', 'history', 'nodes', 'kb'];

function switchIntelPanel(panelName) {
    // Hide all panels
    ALL_INTEL_PANELS.forEach(p => {
        const el = document.getElementById(`intel-panel-${p}`);
        if (el) el.classList.add('hidden');
    });
    // Show target
    const target = document.getElementById(`intel-panel-${panelName}`);
    if (target) target.classList.remove('hidden');
}

function initIntelNav() {
    const items = document.querySelectorAll('.intel-nav-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            items.forEach(i => {
                i.classList.add('text-secondary-text');
                i.classList.remove('text-primary');
            });
            item.classList.remove('text-secondary-text');
            item.classList.add('text-primary');

            const panel = item.dataset.panel;
            if (panel) {
                switchIntelPanel(panel);
                switchView('intel');
                switchIntelTab(panel);
            }
        });
    });
}

// ─── Intel Tab Switching (within view-intel) ─────────────────────────────────

const INTEL_TAB_ICONS = {
    analysis: 'monitoring',
    network: 'hub',
    shield: 'security',
    history: 'history',
    nodes: 'account_tree',
    kb: 'auto_stories',
};

function switchIntelTab(tabName) {
    document.querySelectorAll('.intel-tab-body').forEach(body => {
        body.classList.toggle('hidden', body.dataset.intelTab !== tabName);
    });
    document.querySelectorAll('.intel-tab').forEach(btn => {
        const active = btn.dataset.intelTab === tabName;
        btn.classList.toggle('bg-primary', active);
        btn.classList.toggle('text-black', active);
        btn.classList.toggle('text-secondary-text', !active);
    });
    const icon = document.getElementById('intel-view-icon');
    const title = document.getElementById('intel-view-title');
    if (icon) icon.textContent = INTEL_TAB_ICONS[tabName] || 'monitoring';
    if (title) title.textContent = tabName.charAt(0).toUpperCase() + tabName.slice(1);

    // When switching to network tab: force fresh render + fit
    if (tabName === 'network') {
        setTimeout(() => {
            // Reset fitted flag so _topoFitView always runs when tab is now visible
            if (_topoD3State['topo-d3-svg']) _topoD3State['topo-d3-svg'].fitted = false;
            _topoD3Render('topo-d3-svg', 'topo-tooltip', _topoLastHosts, _topoLastExploits, false);
            _topoUpdateTimeline();
        }, 60);
    }
}

function initIntelTabs() {
    document.querySelectorAll('.intel-tab').forEach(btn => {
        btn.addEventListener('click', () => switchIntelTab(btn.dataset.intelTab));
    });
}

function initExpandButtons() {
    document.querySelectorAll('.intel-expand-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const panel = btn.dataset.intelExpand;
            switchView('intel');
            switchIntelTab(panel);
        });
    });

    const backBtn = document.getElementById('intel-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => switchView(previousView));
    }
}

// ─── Node Toggle (Nodes panel expand/collapse) ───────────────────────────────

function initNodeToggles() {
    document.querySelectorAll('.node-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            // The node-toggle sits inside the direct parent card div
            const card = toggle.parentElement;
            const detail = card ? card.querySelector('.node-detail') : null;
            const chevron = toggle.querySelector('.node-chevron');
            if (!detail) return;

            const isOpen = !detail.classList.contains('hidden');
            if (isOpen) {
                detail.classList.add('hidden');
                if (chevron) chevron.style.transform = 'rotate(0deg)';
            } else {
                detail.classList.remove('hidden');
                if (chevron) chevron.style.transform = 'rotate(180deg)';
            }
        });
    });
}

// ─── Footer Clock ────────────────────────────────────────────────────────────

function initClock() {
    const clockEl = document.getElementById('footer-clock');
    if (!clockEl) return;

    function tick() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        clockEl.textContent = `${h}:${m}`;
    }

    tick();
    setInterval(tick, 1000);
}

// ─── Audit Log Filter Buttons ────────────────────────────────────────────────

function initAuditFilters() {
    const btns = document.querySelectorAll('.audit-filter-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => {
                b.classList.remove('bg-primary', 'text-black');
                b.classList.add('text-secondary-text', 'hover:text-white');
            });
            btn.classList.add('bg-primary', 'text-black');
            btn.classList.remove('text-secondary-text', 'hover:text-white');
        });
    });
}

// ─── API Key Visibility Toggle ───────────────────────────────────────────────

function initApiKeyToggle() {
    const btn = document.getElementById('toggle-api-key');
    if (btn) {
        btn.addEventListener('click', () => {
            const input = btn.closest('div').querySelector('input');
            if (input.type === 'password') { input.type = 'text'; btn.textContent = 'visibility_off'; }
            else { input.type = 'password'; btn.textContent = 'visibility'; }
        });
    }
    const sudoBtn = document.getElementById('toggle-sudo-pass');
    if (sudoBtn) {
        sudoBtn.addEventListener('click', () => {
            const input = sudoBtn.closest('div').querySelector('input');
            if (input.type === 'password') { input.type = 'text'; sudoBtn.textContent = 'visibility_off'; }
            else { input.type = 'password'; sudoBtn.textContent = 'visibility'; }
        });
    }
}

// ─── Network Topology Fullscreen ─────────────────────────────────────────────

function openTopoFullscreen() {
    const overlay = document.getElementById('topo-fullscreen-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    // Render live data into fullscreen SVG
    const tgt = document.getElementById('topo-fs-target');
    if (tgt) tgt.textContent = _topoCurrentTarget || '—';
    setTimeout(() => {
        _topoD3Render('topo-fs-svg', 'topo-fs-tooltip', _topoLastHosts, _topoLastExploits, true);
    }, 50);
}

function closeTopoFullscreen() {
    const overlay = document.getElementById('topo-fullscreen-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function initTopoFullscreen() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeTopoFullscreen();
    });
    // Timeline track drag-scrub
    const track = document.getElementById('topo-timeline-track');
    if (track) {
        let dragging = false;
        track.addEventListener('mousedown', (e) => { dragging = true; seekTopoTimeline(e); });
        document.addEventListener('mousemove', (e) => { if (dragging) seekTopoTimeline(e); });
        document.addEventListener('mouseup', () => { dragging = false; });
    }
    // Fullscreen SVG: init D3 when fullscreen opens (handled in openTopoFullscreen)
}

// ─── Theme Toggle (Dark / Light) ─────────────────────────────────────────────

function initThemeToggle() {
    const btn = document.getElementById('theme-toggle-btn');
    const icon = document.getElementById('theme-toggle-icon');
    if (!btn || !icon) return;

    const stored = localStorage.getItem('aegis-theme');
    if (stored === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        icon.textContent = 'light_mode';
    }

    btn.addEventListener('click', () => {
        const isLight = document.documentElement.classList.contains('light');

        const applyToggle = () => {
            if (isLight) {
                document.documentElement.classList.remove('light');
                document.documentElement.classList.add('dark');
                icon.textContent = 'dark_mode';
                localStorage.setItem('aegis-theme', 'dark');
            } else {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
                icon.textContent = 'light_mode';
                localStorage.setItem('aegis-theme', 'light');
            }
        };

        const afterToggle = () => {
            applyToggle();
            scheduleMinimapUpdate();
        };

        if (document.startViewTransition) {
            document.startViewTransition(afterToggle);
        } else {
            afterToggle();
        }
    });
}

// ─── Markdown & Code ─────────────────────────────────────────────────────────

function initMarkdown() {
    if (typeof marked === 'undefined') return;

    const renderer = new marked.Renderer();

    renderer.code = function(token) {
        const code = typeof token === 'object' ? token.text : token;
        const lang = (typeof token === 'object' ? token.lang : '') || '';
        const validLang = lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang) ? lang : '';
        const highlighted = (typeof hljs !== 'undefined')
            ? (validLang ? hljs.highlight(code, { language: validLang }).value : hljs.highlightAuto(code).value)
            : escapeHtml(code);
        const id = 'cb-' + Math.random().toString(36).substr(2, 8);
        const displayLang = validLang || (lang || 'code');
        return `<div class="code-block">
  <div class="code-header">
    <span class="code-lang">${escapeHtml(displayLang)}</span>
    <button class="copy-btn" data-target="${id}" title="Copy">
      <span class="material-symbols-outlined">content_copy</span>
    </button>
  </div>
  <pre id="${id}"><code class="hljs">${highlighted}</code></pre>
</div>`;
    };

    marked.use({ renderer, breaks: true, gfm: true });
}

function renderMarkdown(text) {
    if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
    return marked.parse(text);
}

function attachCopyButtons(container) {
    container.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.target;
            const pre = document.getElementById(id);
            if (!pre) return;
            const text = pre.querySelector('code')?.textContent ?? pre.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const icon = btn.querySelector('.material-symbols-outlined');
                if (icon) { icon.textContent = 'check'; setTimeout(() => { icon.textContent = 'content_copy'; }, 1500); }
            });
        });
    });
}

function attachMsgActions(el, rawText, _isUser) {
    const copyBtn  = el.querySelector('.action-copy');
    const editBtn  = el.querySelector('.action-edit');
    const retryBtn = el.querySelector('.action-retry');
    const infoBtn  = el.querySelector('.action-info');

    if (copyBtn) {
        // Avoid duplicate listeners
        const newBtn = copyBtn.cloneNode(true);
        copyBtn.replaceWith(newBtn);
        newBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(rawText || '').then(() => {
                const icon = newBtn.querySelector('.material-symbols-outlined');
                if (icon) {
                    icon.textContent = 'check';
                    newBtn.style.color = '#ccff00';
                    setTimeout(() => { icon.textContent = 'content_copy'; newBtn.style.color = ''; }, 1500);
                }
            });
        });
    }

    if (editBtn) {
        editBtn.addEventListener('click', () => {
            const input = document.getElementById('chat-input');
            if (input) { input.value = rawText; input.focus(); input.dispatchEvent(new Event('input')); }
        });
    }

    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            const stream = el.parentElement;
            if (!stream) return;
            const all = Array.from(stream.children);
            const idx = all.indexOf(el);
            for (let i = idx - 1; i >= 0; i--) {
                const uEl = all[i].querySelector('.user-msg-text');
                if (uEl) { sendChatMessage(uEl.textContent); return; }
            }
        });
    }

    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            const text = rawText || '';
            const words = text.trim().split(/\s+/).filter(Boolean).length;
            showToast(`~${words} words · ${text.length} chars`);
        });
    }
}

function showToast(msg) {
    let toast = document.getElementById('aegis-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'aegis-toast';
        toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-card border border-border-color text-secondary-text text-[11px] font-display uppercase tracking-widest px-4 py-2 z-50 pointer-events-none transition-opacity duration-300';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ─── Scroll Control ───────────────────────────────────────────────────────────

let autoScroll = true;

function initScrollTracking() {
    const container = document.getElementById('chat-scroll-area');
    if (!container) return;
    container.addEventListener('scroll', () => {
        const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
        autoScroll = atBottom;
    });
}

// ─── Agent feed scroll control ────────────────────────────────────────────────

let agentAutoScroll = true;

function initAgentScrollTracking() {
    const el = document.getElementById('agent-scroll-area');
    if (!el) return;
    el.addEventListener('scroll', () => {
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        agentAutoScroll = atBottom;
        _updateScrollBtn();
        _updateMinimap();
    });

    // Minimap click → navigate
    const minimap = document.getElementById('agent-minimap');
    if (minimap) {
        minimap.addEventListener('click', e => {
            const rect  = minimap.getBoundingClientRect();
            const ratio = (e.clientY - rect.top) / rect.height;
            // Center viewport on clicked position
            el.scrollTop = ratio * el.scrollHeight - el.clientHeight / 2;
        });
        // Drag on minimap
        let _dragging = false;
        minimap.addEventListener('mousedown', () => { _dragging = true; });
        window.addEventListener('mousemove', e => {
            if (!_dragging) return;
            const rect = minimap.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            el.scrollTop = ratio * el.scrollHeight;
        });
        window.addEventListener('mouseup', () => { _dragging = false; });
    }
}

function _updateScrollBtn() {
    const btn = document.getElementById('agent-scroll-btn');
    if (!btn) return;
    btn.style.display = agentAutoScroll ? 'none' : 'flex';
}

function agentForceScrollToBottom() {
    const el = document.getElementById('agent-scroll-area');
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    agentAutoScroll = true;
    _updateScrollBtn();
}

// ─── Agent Minimap ────────────────────────────────────────────────────────────

let _minimapDirty = false;
let _minimapRaf = null;

function scheduleMinimapUpdate() {
    if (_minimapRaf) return;
    _minimapRaf = requestAnimationFrame(() => {
        _minimapRaf = null;
        _updateMinimap();
    });
}

function _updateMinimap() {
    const canvas  = document.getElementById('agent-minimap-canvas');
    const scrollEl = document.getElementById('agent-scroll-area');
    const feed    = document.getElementById('mission-feed');
    const vp      = document.getElementById('agent-minimap-vp');
    if (!canvas || !scrollEl) return;

    const container = document.getElementById('agent-minimap');
    const dpr = window.devicePixelRatio || 1;
    const cw  = container.offsetWidth;
    const ch  = container.offsetHeight;
    if (cw === 0 || ch === 0) return;

    canvas.width  = cw * dpr;
    canvas.height = ch * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const isLight = document.documentElement.classList.contains('light');
    const bgColor = isLight ? '#f0f0f1' : '#050505';

    // Clear canvas
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cw, ch);

    // No cards → empty minimap, hide viewport indicator
    const cards = feed ? Array.from(feed.children) : [];
    if (cards.length === 0) {
        if (vp) vp.style.height = '0';
        return;
    }

    const totalH = scrollEl.scrollHeight;
    if (totalH > 0) {
        for (const card of cards) {
            const topPct  = card.offsetTop / totalH;
            const htPct   = card.offsetHeight / totalH;
            const y = topPct * ch;
            const h = Math.max(1.5, htPct * ch);

            // Colour by card semantic type + tool + success state
            const html = card.innerHTML;
            const hasSuccess = html.includes('check_circle');
            const hasFail    = html.includes('text-danger') || html.includes('border-danger');
            let color;
            if (isLight) {
                if (html.includes('MISSION COMPLETE'))
                    color = 'rgba(74,124,0,0.85)';
                else if (html.includes('psychology') || html.includes('THINKING'))
                    color = 'rgba(180,150,0,0.55)';
                else if (html.includes('lightbulb') || html.includes('REFLECTING') || html.includes('REFLECTION'))
                    color = 'rgba(147,51,234,0.45)';
                else if (html.includes('wifi_find') || html.includes('NMAP'))
                    color = 'rgba(37,99,235,0.65)';
                else if (html.includes('rocket_launch') || html.includes('METASPLOIT'))
                    color = hasSuccess ? 'rgba(220,38,38,0.85)' : 'rgba(220,38,38,0.5)';
                else if (html.includes('manage_search') || html.includes('SEARCHSPLOIT'))
                    color = 'rgba(234,88,12,0.6)';
                else if (html.includes('key') && html.includes('HYDRA'))
                    color = 'rgba(147,51,234,0.5)';
                else if (html.includes('border-green-500') || (html.includes('terminal') && html.includes('BASH')))
                    color = hasSuccess ? 'rgba(22,163,74,0.65)' : 'rgba(22,163,74,0.35)';
                else if (hasFail)
                    color = 'rgba(220,38,38,0.55)';
                else if (hasSuccess)
                    color = 'rgba(22,163,74,0.5)';
                else
                    color = 'rgba(0,0,0,0.08)';
            } else {
                if (html.includes('MISSION COMPLETE'))
                    color = 'rgba(200,255,0,0.85)';
                else if (html.includes('psychology') || html.includes('THINKING'))
                    color = 'rgba(200,255,0,0.55)';
                else if (html.includes('lightbulb') || html.includes('REFLECTING') || html.includes('REFLECTION'))
                    color = 'rgba(168,85,247,0.55)';
                else if (html.includes('wifi_find') || html.includes('NMAP'))
                    color = 'rgba(59,130,246,0.75)';
                else if (html.includes('rocket_launch') || html.includes('METASPLOIT'))
                    color = hasSuccess ? 'rgba(239,68,68,0.95)' : 'rgba(239,68,68,0.5)';
                else if (html.includes('manage_search') || html.includes('SEARCHSPLOIT'))
                    color = 'rgba(249,115,22,0.7)';
                else if (html.includes('key') && html.includes('HYDRA'))
                    color = 'rgba(168,85,247,0.55)';
                else if (html.includes('border-green-500') || (html.includes('terminal') && html.includes('BASH')))
                    color = hasSuccess ? 'rgba(34,197,94,0.7)' : 'rgba(34,197,94,0.4)';
                else if (hasFail)
                    color = 'rgba(239,68,68,0.6)';
                else if (hasSuccess)
                    color = 'rgba(34,197,94,0.55)';
                else
                    color = 'rgba(255,255,255,0.07)';
            }

            ctx.fillStyle = color;
            ctx.fillRect(3, y, cw - 6, h - 0.5);
        }
    }

    // Thin vertical accent line on left edge
    ctx.fillStyle = isLight ? 'rgba(74,124,0,0.1)' : 'rgba(200,255,0,0.08)';
    ctx.fillRect(0, 0, 1, ch);

    // Viewport indicator
    if (vp && totalH > 0) {
        const scrollRatio = scrollEl.scrollTop / totalH;
        const viewRatio   = scrollEl.clientHeight / totalH;
        const vpTop    = scrollRatio * ch;
        const vpHeight = Math.max(16, viewRatio * ch);
        vp.style.top    = vpTop + 'px';
        vp.style.height = vpHeight + 'px';
        vp.style.background = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(200,255,0,0.06)';
    }
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function showConfirm({ title = 'Are you sure?', message = '', onConfirm }) {
    const overlay  = document.getElementById('confirm-overlay');
    const backdrop = document.getElementById('confirm-backdrop');
    const titleEl  = document.getElementById('confirm-title');
    const msgEl    = document.getElementById('confirm-message');
    const okBtn    = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    if (!overlay) return;

    titleEl.textContent = title;
    msgEl.textContent   = message;
    overlay.classList.remove('hidden');

    const close = () => {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', doOk);
        cancelBtn.removeEventListener('click', close);
        backdrop.removeEventListener('click', close);
        document.removeEventListener('keydown', onKey);
    };
    const doOk = () => { close(); onConfirm(); };
    const onKey = (e) => {
        if (e.key === 'Enter')  doOk();
        if (e.key === 'Escape') close();
    };

    okBtn.addEventListener('click', doOk);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
}

// ─── Custom Prompt Modal ──────────────────────────────────────────────────────

function showPrompt({ title = 'Name', label = 'Name', icon = 'edit', defaultValue = '', onConfirm }) {
    const overlay = document.getElementById('custom-prompt-overlay');
    const input   = document.getElementById('custom-prompt-input');
    const titleEl = document.getElementById('custom-prompt-title');
    const labelEl = document.getElementById('custom-prompt-label');
    const iconEl  = document.getElementById('custom-prompt-icon');
    const confirmBtn = document.getElementById('custom-prompt-confirm');
    const cancelBtn  = document.getElementById('custom-prompt-cancel');
    const backdrop   = document.getElementById('custom-prompt-backdrop');
    if (!overlay || !input) return;

    titleEl.textContent = title;
    labelEl.textContent = label;
    iconEl.textContent  = icon;
    input.value = defaultValue;

    overlay.classList.remove('hidden');
    setTimeout(() => { input.focus(); input.select(); }, 50);

    const close = () => {
        overlay.classList.add('hidden');
        confirmBtn.removeEventListener('click', doConfirm);
        cancelBtn.removeEventListener('click', close);
        backdrop.removeEventListener('click', close);
        document.removeEventListener('keydown', onKey);
    };

    const doConfirm = () => {
        const val = input.value.trim();
        close();
        if (val) onConfirm(val);
    };

    const onKey = (e) => {
        if (e.key === 'Enter')  doConfirm();
        if (e.key === 'Escape') close();
    };

    confirmBtn.addEventListener('click', doConfirm);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
}

// ─── Conversations & Projects ──────────────────────────────────────────────────

let conversations = [];
let projects = [];
let activeConvId = null;
let draggedConvId = null;
let _pendingProjectId = null;

// Projects stay in localStorage (client-side folders only)
function loadProjectsFromStorage() {
    try {
        projects = JSON.parse(localStorage.getItem('aegis_projects') || '[]');
    } catch {
        projects = [];
    }
}

function saveProjectsToStorage() {
    localStorage.setItem('aegis_projects', JSON.stringify(projects));
    // Save conversation → project mappings separately
    const mappings = {};
    conversations.forEach(c => { if (c.projectId) mappings[c.id] = c.projectId; });
    localStorage.setItem('aegis_conv_projects', JSON.stringify(mappings));
}

async function loadConversationsFromAPI() {
    try {
        const res = await fetch('/api/v1/conversations');
        const data = await res.json();
        const mappings = JSON.parse(localStorage.getItem('aegis_conv_projects') || '{}');
        conversations = data.map(c => ({
            id: c.id,
            title: c.title,
            projectId: mappings[c.id] || null,
            createdAt: c.created_at * 1000,
        }));
    } catch {
        conversations = [];
    }
}

function getActiveConv() {
    return conversations.find(c => c.id === activeConvId) || null;
}

// ── Conversation actions ───────────────────────────────────────────────────────

function createNewConversation(projectId = null) {
    activeConvId = null;
    _pendingProjectId = projectId || null;
    if (ws && wsReady) ws.send(JSON.stringify({ type: 'new_conversation' }));
    renderConversationList();
    resetMessageStream();
    switchView('chat');
}

function deleteConversation(id) {
    const conv = conversations.find(c => c.id === id);
    const name = conv ? conv.title : 'this chat';
    showConfirm({
        title: 'Delete Chat',
        message: `"${name}" will be permanently deleted. This cannot be undone.`,
        onConfirm: async () => {
            try {
                await fetch(`/api/v1/conversations/${id}`, { method: 'DELETE' });
            } catch { /* ignore */ }
            conversations = conversations.filter(c => c.id !== id);
            if (activeConvId === id) {
                const next = conversations[0];
                if (next) { activeConvId = next.id; loadConversation(next.id); }
                else       { activeConvId = null; resetMessageStream(); }
            }
            saveProjectsToStorage();
            renderConversationList();
        },
    });
}

function startRenameConversation(id) {
    renderConversationList(id);
}

function resetMessageStream() {
    const stream = getMessageStream();
    if (!stream) return;
    stream.innerHTML = `
      <div id="chat-empty-state" class="flex flex-col items-center justify-center flex-1 py-24 gap-5 select-none pointer-events-none">
        <span class="material-symbols-outlined text-[48px]" style="color:#1A1A1A; font-variation-settings:'FILL' 1;">psychology</span>
        <div class="flex flex-col items-center gap-1">
          <p class="text-secondary-text text-xs font-display font-bold uppercase tracking-[0.2em]">AEGIS Chat</p>
          <p class="text-[11px] mono-text" style="color:#333;">Ask anything — security questions, code analysis, threat intel…</p>
        </div>
      </div>`;
    autoScroll = true;
}

async function loadConversation(convId) {
    activeConvId = convId;
    renderConversationList();
    const stream = getMessageStream();
    if (!stream) return;
    stream.innerHTML = '';

    // Update chat view title
    const conv = conversations.find(c => c.id === convId);
    const titleEl = document.getElementById('chat-conv-title');
    if (titleEl && conv) titleEl.textContent = conv.title || 'New Chat';

    try {
        const res = await fetch(`/api/v1/conversations/${convId}`);
        if (!res.ok) { resetMessageStream(); return; }
        const data = await res.json();
        const messages = data.messages || [];
        if (!messages.length) { resetMessageStream(); return; }
        messages.forEach(msg => {
            if (msg.role === 'user') appendUserMessageDOM(msg.content);
            else if (msg.role === 'assistant') appendAssistantMessageDOM(msg.content);
        });
        autoScroll = true;
        forceScrollToBottom();
    } catch {
        resetMessageStream();
    }

    // Sync backend context
    if (ws && wsReady) ws.send(JSON.stringify({ type: 'load_conversation', conversation_id: convId }));
}

function addMessageToConv(role, content) {
    // Backend handles persistence — only update sidebar title optimistically
    if (role !== 'user') return;
    const conv = getActiveConv();
    if (!conv || conv.title !== 'New Chat') return;
    conv.title = content.length > 32 ? content.substring(0, 32) + '…' : content;
    renderConversationList();
}

// ── Project actions ────────────────────────────────────────────────────────────

function createProject() {
    showPrompt({
        title: 'New Project',
        label: 'Project name',
        icon: 'create_new_folder',
        defaultValue: '',
        onConfirm: (name) => {
            projects.push({ id: 'proj_' + Date.now(), name, expanded: true });
            saveProjectsToStorage();
            renderConversationList();
        },
    });
}

function deleteProject(projId) {
    const proj = projects.find(p => p.id === projId);
    const name = proj ? proj.name : 'this project';
    const chatCount = conversations.filter(c => c.projectId === projId).length;
    const extra = chatCount ? ` ${chatCount} chat(s) inside will be moved to unfiled.` : '';
    showConfirm({
        title: 'Delete Project',
        message: `"${name}" will be permanently deleted.${extra}`,
        onConfirm: () => {
            conversations.forEach(c => { if (c.projectId === projId) c.projectId = null; });
            projects = projects.filter(p => p.id !== projId);
            saveProjectsToStorage();
            renderConversationList();
        },
    });
}

function startRenameProject(projId) {
    const proj = projects.find(p => p.id === projId);
    if (!proj) return;
    showPrompt({
        title: 'Rename Project',
        label: 'Project name',
        icon: 'drive_file_rename_outline',
        defaultValue: proj.name,
        onConfirm: (name) => {
            proj.name = name;
            saveProjectsToStorage();
            renderConversationList();
        },
    });
}

function toggleProject(projId) {
    const proj = projects.find(p => p.id === projId);
    if (!proj) return;
    proj.expanded = !proj.expanded;
    saveProjectsToStorage();
    renderConversationList();
}

// ── Render ─────────────────────────────────────────────────────────────────────

function buildChatRow(conv, renamingId) {
    const isActive   = conv.id === activeConvId;
    const isRenaming = conv.id === renamingId;

    const row = document.createElement('div');
    row.className = [
        'group flex items-center gap-0.5 transition-colors',
        isActive ? 'bg-primary/5 border-l border-primary' : 'hover:bg-white/5',
    ].join(' ');
    row.draggable = true;
    row.dataset.convId = conv.id;

    // Drag events
    row.addEventListener('dragstart', (e) => {
        draggedConvId = conv.id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => row.classList.add('opacity-40'), 0);
    });
    row.addEventListener('dragend', () => {
        draggedConvId = null;
        row.classList.remove('opacity-40');
    });

    if (isRenaming) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = conv.title;
        input.className = 'flex-1 bg-transparent border border-primary/40 outline-none text-[10px] mono-text text-primary px-2 py-1.5 min-w-0';
        const commit = async () => {
            const v = input.value.trim();
            if (v && v !== conv.title) {
                conv.title = v;
                try {
                    await fetch(`/api/v1/conversations/${conv.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: v }),
                    });
                } catch { /* ignore */ }
            }
            renderConversationList();
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') renderConversationList();
        });
        input.addEventListener('blur', commit);
        row.appendChild(input);
        setTimeout(() => { input.focus(); input.select(); }, 0);
    } else {
        const btn = document.createElement('button');
        btn.className = [
            'flex-1 text-left px-2 py-1.5 text-[10px] mono-text truncate leading-tight transition-colors min-w-0',
            isActive ? 'text-primary pl-1.5' : 'text-secondary-text hover:text-slate-200',
        ].join(' ');
        btn.title = conv.title;
        btn.textContent = conv.title;
        btn.addEventListener('click', () => { loadConversation(conv.id); switchView('chat'); });

        const renBtn = document.createElement('button');
        renBtn.className = 'shrink-0 w-5 h-5 flex items-center justify-center text-secondary-text opacity-0 group-hover:opacity-100 hover:text-primary transition-all';
        renBtn.title = 'Rename';
        renBtn.innerHTML = '<span class="material-symbols-outlined text-[12px]">edit</span>';
        renBtn.addEventListener('click', (e) => { e.stopPropagation(); startRenameConversation(conv.id); });

        const delBtn = document.createElement('button');
        delBtn.className = 'shrink-0 w-5 h-5 flex items-center justify-center text-secondary-text opacity-0 group-hover:opacity-100 hover:text-danger transition-all mr-0.5';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '<span class="material-symbols-outlined text-[12px]">delete</span>';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteConversation(conv.id); });

        row.appendChild(btn);
        row.appendChild(renBtn);
        row.appendChild(delBtn);
    }

    return row;
}

function addDropZone(target, targetProjectId) {
    target.addEventListener('dragover', (e) => {
        if (!draggedConvId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        target.classList.add('outline', 'outline-1', 'outline-primary/30');
    });
    target.addEventListener('dragleave', () => {
        target.classList.remove('outline', 'outline-1', 'outline-primary/30');
    });
    target.addEventListener('drop', (e) => {
        e.preventDefault();
        target.classList.remove('outline', 'outline-1', 'outline-primary/30');
        if (!draggedConvId) return;
        const conv = conversations.find(c => c.id === draggedConvId);
        if (conv) {
            conv.projectId = targetProjectId;
            saveProjectsToStorage();
            renderConversationList();
        }
    });
}

function renderConversationList(renamingId = null) {
    const list = document.getElementById('conversation-list');
    if (!list) return;
    list.innerHTML = '';

    // ── Project folders (always first) ──
    projects.forEach(proj => {
        const projConvs = conversations.filter(c => c.projectId === proj.id);

        const folder = document.createElement('div');
        folder.className = 'mt-1';

        // Folder header
        const hdr = document.createElement('div');
        hdr.className = 'group flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-white/5 transition-colors select-none';
        hdr.innerHTML = `
          <span class="material-symbols-outlined text-[13px] text-secondary-text transition-transform duration-150" style="transform:rotate(${proj.expanded ? '0' : '-90'}deg)">${proj.expanded ? 'folder_open' : 'folder'}</span>
          <span class="flex-1 text-[9px] font-bold text-secondary-text uppercase tracking-wider truncate">${escapeHtml(proj.name)}</span>
          <button class="btn-add-chat shrink-0 w-4 h-4 flex items-center justify-center text-secondary-text opacity-0 group-hover:opacity-100 hover:text-primary transition-all" title="Add chat to folder">
            <span class="material-symbols-outlined text-[12px]">add</span>
          </button>
          <button class="btn-ren-proj shrink-0 w-4 h-4 flex items-center justify-center text-secondary-text opacity-0 group-hover:opacity-100 hover:text-primary transition-all" title="Rename">
            <span class="material-symbols-outlined text-[12px]">edit</span>
          </button>
          <button class="btn-del-proj shrink-0 w-4 h-4 flex items-center justify-center text-secondary-text opacity-0 group-hover:opacity-100 hover:text-danger transition-all" title="Delete folder">
            <span class="material-symbols-outlined text-[12px]">delete</span>
          </button>`;

        hdr.querySelector('.btn-add-chat').addEventListener('click', (e) => { e.stopPropagation(); createNewConversation(proj.id); });
        hdr.querySelector('.btn-ren-proj').addEventListener('click', (e) => { e.stopPropagation(); startRenameProject(proj.id); });
        hdr.querySelector('.btn-del-proj').addEventListener('click', (e) => { e.stopPropagation(); deleteProject(proj.id); });
        hdr.addEventListener('click', () => toggleProject(proj.id));

        // Drop onto folder header → move to this project
        addDropZone(hdr, proj.id);

        folder.appendChild(hdr);

        // Chat rows inside folder
        if (proj.expanded) {
            const inner = document.createElement('div');
            inner.className = 'flex flex-col pl-3 border-l border-border-color ml-3';
            if (projConvs.length === 0) {
                const hint = document.createElement('div');
                hint.className = 'text-[9px] mono-text text-secondary-text px-2 py-1 opacity-40';
                hint.textContent = 'Empty — drag chats here';
                inner.appendChild(hint);
            } else {
                projConvs.forEach(conv => inner.appendChild(buildChatRow(conv, renamingId)));
            }
            addDropZone(inner, proj.id);
            folder.appendChild(inner);
        }

        list.appendChild(folder);
    });

    // ── Unfiled chats (below projects) ──
    const unfiled = conversations.filter(c => !c.projectId);
    if (!conversations.length) {
        const empty = document.createElement('div');
        empty.className = 'text-[9px] mono-text text-secondary-text px-2 py-2 opacity-50';
        empty.textContent = 'No chats yet';
        list.appendChild(empty);
    } else {
        if (projects.length) {
            const sep = document.createElement('div');
            sep.className = 'mt-1 mb-0.5 px-2';
            sep.innerHTML = '<div class="border-t border-border-color"></div>';
            list.appendChild(sep);
        }
        const unfiledWrap = document.createElement('div');
        unfiledWrap.className = 'flex flex-col min-h-[24px]';
        if (unfiled.length) {
            unfiled.forEach(conv => unfiledWrap.appendChild(buildChatRow(conv, renamingId)));
        } else if (projects.length) {
            const hint = document.createElement('div');
            hint.className = 'text-[9px] mono-text text-secondary-text px-2 py-1 opacity-40';
            hint.textContent = 'Drop here to unfile';
            unfiledWrap.appendChild(hint);
        }
        addDropZone(unfiledWrap, null);
        list.appendChild(unfiledWrap);
    }
}

async function initConversations() {
    loadProjectsFromStorage();
    await loadConversationsFromAPI();

    if (!conversations.length) {
        renderConversationList();
        resetMessageStream();
    } else {
        renderConversationList();
        // Load the most recent conversation into chat stream (no view switch — stay on agent view)
        activeConvId = conversations[0].id;
        const stream = getMessageStream();
        if (stream) stream.innerHTML = '';
        try {
            const res = await fetch(`/api/v1/conversations/${activeConvId}`);
            if (res.ok) {
                const data = await res.json();
                (data.messages || []).forEach(msg => {
                    if (msg.role === 'user') appendUserMessageDOM(msg.content);
                    else if (msg.role === 'assistant') appendAssistantMessageDOM(msg.content);
                });
            }
        } catch { /* ignore */ }
        if (ws && wsReady) ws.send(JSON.stringify({ type: 'load_conversation', conversation_id: activeConvId }));
    }

    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) newChatBtn.addEventListener('click', () => createNewConversation());

    const newFolderBtn = document.getElementById('new-folder-btn');
    if (newFolderBtn) newFolderBtn.addEventListener('click', createProject);
}

// ─── WebSocket Chat ───────────────────────────────────────────────────────────

let ws = null;
let wsReady = false;
let currentAssistantEl = null;  // streaming message bubble
let currentAssistantText = '';   // accumulated text for the current stream
let isStreaming = false;

function updateSendBtn() {
    const btn = document.getElementById('chat-view-send-btn');
    if (!btn) return;
    if (isStreaming) {
        btn.textContent = 'stop_circle';
        btn.classList.add('text-primary', 'opacity-70');
        btn.classList.remove('text-danger');
    } else {
        btn.textContent = 'send';
        btn.classList.remove('text-danger', 'opacity-70');
        btn.classList.add('text-primary');
    }
}

function wsConnect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
        wsReady = true;
        setConnectionBadge(true);
        // Re-sync server context after connect/reconnect
        if (activeConvId) {
            ws.send(JSON.stringify({ type: 'load_conversation', conversation_id: activeConvId }));
        }
    };

    ws.onclose = () => {
        wsReady = false;
        setConnectionBadge(false);
        // Reconnect after 3 s
        setTimeout(wsConnect, 3000);
    };

    ws.onerror = () => {
        wsReady = false;
        setConnectionBadge(false);
    };

    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'token') {
            appendToken(msg.content, msg.msg_id);
        } else if (msg.type === 'message_end') {
            finalizeAssistantMessage();
        } else if (msg.type === 'error') {
            appendErrorMessage(msg.content);
            finalizeAssistantMessage();
        } else if (msg.type === 'conversation_created') {
            const c = msg.conversation;
            conversations.unshift({
                id: c.id,
                title: c.title,
                projectId: _pendingProjectId,
                createdAt: c.created_at * 1000,
            });
            activeConvId = c.id;
            _pendingProjectId = null;
            saveProjectsToStorage();
            renderConversationList();
        } else if (msg.type === 'conversation_reset') {
            // UI already reset by createNewConversation()
        }
    };
}

function setConnectionBadge(online) {
    const dot = document.querySelector('header .animate-pulse');
    const label = document.querySelector('header .tracking-widest.uppercase');
    if (!dot || !label) return;
    if (online) {
        dot.classList.remove('bg-danger');
        dot.classList.add('bg-primary');
        label.textContent = 'Agent Active';
    } else {
        dot.classList.remove('bg-primary');
        dot.classList.add('bg-danger');
        label.textContent = 'Connecting...';
    }
}

function getMessageStream() {
    return document.getElementById('chat-message-stream');
}

function hideEmptyState() {
    const es = document.getElementById('chat-empty-state');
    if (es) es.remove();
}

function buildUserMessageEl(text) {
    const el = document.createElement('div');
    el.className = 'flex gap-4 justify-end group';
    el.innerHTML = `
        <div class="flex flex-col gap-1 max-w-[80%] items-end">
          <div class="text-[10px] font-bold text-secondary-text uppercase tracking-widest text-right">You</div>
          <div class="user-msg-text bg-card border border-border-color border-r-2 p-4 text-sm leading-relaxed whitespace-pre-wrap" style="color:#d1d5db;font-family:'Inter',sans-serif;border-right-color:#60a5fa;">${escapeHtml(text)}</div>
          <div class="msg-actions flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button class="action-copy msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">content_copy</span><span>Copy</span>
            </button>
            <button class="action-edit msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">edit</span><span>Edit</span>
            </button>
          </div>
        </div>
        <div class="shrink-0 w-8 h-8 border border-border-color flex items-center justify-center bg-surface self-start mt-5">
          <span class="material-symbols-outlined text-secondary-text text-xl">person</span>
        </div>`;
    attachMsgActions(el, text, true);
    return el;
}

function appendUserMessage(text) {
    hideEmptyState();
    const stream = getMessageStream();
    if (!stream) return;
    stream.appendChild(buildUserMessageEl(text));
    autoScroll = true;
    forceScrollToBottom();
}

function appendUserMessageDOM(text) {
    const stream = getMessageStream();
    if (!stream) return;
    stream.appendChild(buildUserMessageEl(text));
}

function buildAssistantMessageEl(htmlContent, rawText = '') {
    const el = document.createElement('div');
    el.className = 'flex gap-4 group';
    el.innerHTML = `
        <div class="shrink-0 w-8 h-8 border border-primary flex items-center justify-center bg-surface self-start mt-5">
          <span class="material-symbols-outlined text-primary text-xl">psychology</span>
        </div>
        <div class="flex flex-col gap-1 flex-1 min-w-0">
          <div class="text-[10px] font-bold text-secondary-text uppercase tracking-widest">AI Engine • Chat</div>
          <div class="bg-surface border-l-4 border-l-primary border border-border-color p-5">
            <div class="msg-text markdown-content text-sm leading-relaxed text-slate-200">${htmlContent}</div>
          </div>
          <div class="msg-actions flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button class="action-copy msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">content_copy</span><span>Copy</span>
            </button>
            <button class="action-retry msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">refresh</span><span>Retry</span>
            </button>
            <button class="action-info msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">info</span><span>Info</span>
            </button>
          </div>
        </div>`;
    attachMsgActions(el, rawText, false);
    return el;
}

function appendAssistantMessageDOM(markdownText) {
    const stream = getMessageStream();
    if (!stream) return;
    const el = buildAssistantMessageEl(renderMarkdown(markdownText), markdownText);
    stream.appendChild(el);
    attachCopyButtons(el);
}

function startAssistantMessage() {
    const stream = getMessageStream();
    if (!stream) return null;

    currentAssistantText = '';
    const el = document.createElement('div');
    el.className = 'flex gap-4 group';
    el.innerHTML = `
        <div class="shrink-0 w-8 h-8 border border-primary flex items-center justify-center bg-surface self-start mt-5">
          <span class="material-symbols-outlined text-primary text-xl">psychology</span>
        </div>
        <div class="flex flex-col gap-1 flex-1 min-w-0">
          <div class="text-[10px] font-bold text-secondary-text uppercase tracking-widest">AI Engine • Chat</div>
          <div class="bg-surface border-l-4 border-l-primary border border-border-color p-5">
            <div class="msg-text markdown-content text-sm leading-relaxed"></div>
            <span class="cursor-blink inline-block w-2 h-4 bg-primary ml-0.5 align-middle"></span>
          </div>
          <div class="msg-actions hidden flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button class="action-copy msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">content_copy</span><span>Copy</span>
            </button>
            <button class="action-retry msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">refresh</span><span>Retry</span>
            </button>
            <button class="action-info msg-action-btn flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-secondary-text hover:text-primary border border-transparent hover:border-border-color transition-all font-display uppercase tracking-wider">
              <span class="material-symbols-outlined text-[13px]">info</span><span>Info</span>
            </button>
          </div>
        </div>`;
    stream.appendChild(el);
    currentAssistantEl = el;
    scrollToBottom();
    return el;
}

function appendToken(token, msgId) {
    if (!isStreaming) return;
    if (!currentAssistantEl) startAssistantMessage();
    const p = currentAssistantEl.querySelector('.msg-text');
    if (!p) return;
    currentAssistantText += token;
    p.innerHTML = renderMarkdown(currentAssistantText);
    scrollToBottom();
}

function finalizeAssistantMessage() {
    if (!currentAssistantEl) return;

    // Remove streaming cursor
    const cursor = currentAssistantEl.querySelector('.cursor-blink');
    if (cursor) cursor.remove();

    // Re-render markdown & attach copy buttons
    const p = currentAssistantEl.querySelector('.msg-text');
    if (p && currentAssistantText) {
        p.innerHTML = renderMarkdown(currentAssistantText);
        attachCopyButtons(p);
    }

    // Reveal action bar and wire up handlers
    const actions = currentAssistantEl.querySelector('.msg-actions');
    if (actions) {
        actions.classList.remove('hidden');
        attachMsgActions(currentAssistantEl, currentAssistantText, false);
    }

    currentAssistantEl = null;
    currentAssistantText = '';
    isStreaming = false;
    updateSendBtn();
}

function appendErrorMessage(text) {
    const stream = getMessageStream();
    if (!stream) return;
    const el = document.createElement('div');
    el.className = 'flex gap-4';
    el.innerHTML = `
        <div class="shrink-0 w-8 h-8 border border-danger flex items-center justify-center bg-surface">
          <span class="material-symbols-outlined text-danger text-xl">error</span>
        </div>
        <div class="flex flex-col gap-2 flex-1">
          <div class="text-[10px] font-bold text-danger uppercase tracking-widest">Error</div>
          <div class="bg-surface border-l-2 border-l-danger border border-border-color p-5">
            <p class="text-sm leading-relaxed text-danger">${escapeHtml(text)}</p>
          </div>
        </div>`;
    stream.appendChild(el);
    scrollToBottom();
}

function scrollToBottom() {
    if (!autoScroll) return;
    forceScrollToBottom();
}

function forceScrollToBottom() {
    const container = document.getElementById('chat-scroll-area');
    if (container) container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sendChatMessage(text) {
    if (!text.trim()) return;
    // Ensure we're in chat view when sending
    if (currentView !== 'chat') switchView('chat');
    if (!wsReady) {
        appendErrorMessage('Not connected to backend. Retrying...');
        return;
    }
    isStreaming = true;
    updateSendBtn();
    appendUserMessage(text);
    startAssistantMessage();
    ws.send(JSON.stringify({ type: 'chat', content: text, provider: activeProvider, model: activeModel }));
}

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    const newH = Math.min(el.scrollHeight, 200);
    el.style.height = newH + 'px';
    const expandBtn = document.getElementById('chat-expand-btn');
    if (expandBtn) {
        expandBtn.classList.toggle('hidden', el.scrollHeight <= 200);
    }
}

function openFullscreenInput(initialText) {
    const overlay = document.getElementById('input-fullscreen-overlay');
    const ta = document.getElementById('input-fullscreen-textarea');
    if (!overlay || !ta) return;
    ta.value = initialText;
    overlay.classList.remove('hidden');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
}

function closeFullscreenInput(doSend) {
    const overlay = document.getElementById('input-fullscreen-overlay');
    const ta = document.getElementById('input-fullscreen-textarea');
    const input = document.getElementById('chat-input');
    if (!overlay || !ta) return;
    if (doSend) {
        const text = ta.value.trim();
        overlay.classList.add('hidden');
        if (text) {
            if (input) { input.value = ''; autoResizeTextarea(input); }
            sendChatMessage(text);
        }
    } else {
        if (input) { input.value = ta.value; autoResizeTextarea(input); }
        overlay.classList.add('hidden');
    }
}

/**
 * Returns true if input should inject into the running agent.
 * Agent view is always injection-mode; chat view is never injection-mode.
 */
function isAgentInputMode() {
    return currentView === 'agent';
}

function syncInputMode() {
    // Agent view input is always injection-mode — no visual toggle needed
    const input = document.getElementById('chat-input');
    if (!input) return;
    if (activeMissionId) {
        input.disabled = false;
        input.style.opacity = '';
    } else {
        input.disabled = false;
        input.style.opacity = '0.5';
    }
}

function initChatInput() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input) return;

    const doSend = async () => {
        // Agent view is always injection mode
        const text = input.value.trim();
        if (!text) return;

        if (!activeMissionId) {
            showToast('No active mission — start a mission first');
            return;
        }

        input.value = '';
        autoResizeTextarea(input);
        try {
            const res = await fetch(`/api/v1/sessions/${activeMissionId}/inject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text }),
            });
            const data = await res.json();
            if (data.ok) {
                appendMissionCard(`
                    <div class="bg-surface pl-4 pr-4 py-2 font-mono text-xs" style="border:1px solid rgba(234,179,8,0.35);border-left:4px solid #eab308;">
                        <div class="flex items-center gap-2 text-yellow-400 font-bold text-[10px] uppercase tracking-widest mb-1">
                            <span class="material-symbols-outlined text-[12px]">person</span>
                            OPERATOR INSTRUCTION
                        </div>
                        <div class="text-slate-200 text-[11px] whitespace-pre-wrap">${_esc(text)}</div>
                    </div>
                `);
                showToast('Instruction injected into agent');
            } else {
                showToast('Agent not running or session not found');
            }
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    });

    input.addEventListener('input', () => autoResizeTextarea(input));

    if (sendBtn) sendBtn.addEventListener('click', doSend);
}


// ─── Chat View Input ──────────────────────────────────────────────────────────

function initChatViewInput() {
    const input = document.getElementById('chat-view-input');
    const sendBtn = document.getElementById('chat-view-send-btn');
    if (!input) return;

    const doSend = () => {
        if (isStreaming) {
            isStreaming = false;
            finalizeAssistantMessage();
            return;
        }
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        autoResizeTextarea(input);
        sendChatMessage(text);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    });
    input.addEventListener('input', () => autoResizeTextarea(input));
    if (sendBtn) sendBtn.addEventListener('click', doSend);
}

// ─── Ollama Status & Model Selector ──────────────────────────────────────────

let availableModels = [];
let activeModel = '';
let activeProvider = 'ollama';  // 'ollama' | 'lmstudio' | 'openrouter'
let ollamaBaseUrl = 'http://127.0.0.1:11434';
let openRouterModels = [];
let cloudModel = 'anthropic/claude-sonnet-4-6';

// ─── LM Studio Status & Model Selector ───────────────────────────────────────

let lmStudioModels = [];
let lmStudioModel = '';
let lmStudioBaseUrl = 'http://127.0.0.1:1234';

async function fetchLMStudioStatus() {
    try {
        const res = await fetch('/api/v1/lmstudio/status');
        const data = await res.json();

        const dot = document.getElementById('cfg-lmstudio-status-dot');

        if (data.online) {
            lmStudioModels = data.models || [];
            // Only set lmStudioModel on first load
            if (!lmStudioModel) {
                lmStudioModel = data.current || (lmStudioModels[0] ?? '');
            }
            if (dot) { dot.classList.remove('bg-border-color', 'bg-danger'); dot.classList.add('bg-primary'); }
        } else {
            lmStudioModels = [];
            if (dot) { dot.classList.remove('bg-primary', 'bg-border-color'); dot.classList.add('bg-danger'); }
        }

        populateLMStudioModelDropdown();
        populateModelDropdown(); // refresh header dropdown to include LM Studio models

        // Sync config panel input (doesn't affect active selection)
        const cfgModel = document.getElementById('cfg-lmstudio-model');
        if (cfgModel && lmStudioModel) cfgModel.value = lmStudioModel;

        // Load base URL from backend
        try {
            const cfgRes = await fetch('/api/v1/config/lmstudio');
            const cfgData = await cfgRes.json();
            lmStudioBaseUrl = cfgData.base_url || lmStudioBaseUrl;
            const cfgUrl = document.getElementById('cfg-lmstudio-url');
            if (cfgUrl) cfgUrl.value = lmStudioBaseUrl;
            if (cfgData.model && !lmStudioModel) {
                lmStudioModel = cfgData.model;
                populateLMStudioModelDropdown();
            }
        } catch { /* ignore */ }

    } catch { /* ignore */ }
}

function populateLMStudioModelDropdown() {
    const list = document.getElementById('cfg-lmstudio-model-list');
    const label = document.getElementById('cfg-lmstudio-model-label');
    const hidden = document.getElementById('cfg-lmstudio-model');
    if (!list) return;

    list.innerHTML = '';

    if (!lmStudioModels.length) {
        list.innerHTML = '<div class="px-3 py-2 text-[10px] mono-text text-secondary-text">No models found — is LM Studio running?</div>';
        if (label) label.textContent = lmStudioModel || '—';
        if (hidden && lmStudioModel) hidden.value = lmStudioModel;
        return;
    }

    if (label) label.textContent = lmStudioModel || lmStudioModels[0] || '—';
    if (hidden) hidden.value = lmStudioModel || '';

    lmStudioModels.forEach(model => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = [
            'w-full text-left px-3 py-2 text-[11px] mono-text flex items-center justify-between',
            'hover:bg-primary/10 hover:text-primary transition-colors',
            model === lmStudioModel ? 'text-primary' : 'text-slate-300',
        ].join(' ');
        item.innerHTML = `<span>${escapeHtml(model)}</span>${model === lmStudioModel ? '<span class="material-symbols-outlined text-[12px]">check</span>' : ''}`;
        item.addEventListener('click', () => {
            lmStudioModel = model;
            closeLMStudioModelDropdown();
            populateLMStudioModelDropdown();
        });
        list.appendChild(item);
    });
}

function openLMStudioModelDropdown() {
    const dd = document.getElementById('cfg-lmstudio-model-dropdown');
    const chevron = document.getElementById('cfg-lmstudio-model-chevron');
    const btn = document.getElementById('cfg-lmstudio-model-btn');
    if (dd) dd.classList.remove('hidden');
    if (chevron) chevron.textContent = 'expand_less';
    if (btn) btn.classList.add('border-primary');
}

function closeLMStudioModelDropdown() {
    const dd = document.getElementById('cfg-lmstudio-model-dropdown');
    const chevron = document.getElementById('cfg-lmstudio-model-chevron');
    const btn = document.getElementById('cfg-lmstudio-model-btn');
    if (dd) dd.classList.add('hidden');
    if (chevron) chevron.textContent = 'expand_more';
    if (btn) btn.classList.remove('border-primary');
}

function initLMStudioModelDropdown() {
    const btn = document.getElementById('cfg-lmstudio-model-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('cfg-lmstudio-model-dropdown');
        if (dd && dd.classList.contains('hidden')) openLMStudioModelDropdown();
        else closeLMStudioModelDropdown();
    });
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('cfg-lmstudio-model-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closeLMStudioModelDropdown();
    });
}

async function fetchOllamaStatus() {
    try {
        const res = await fetch('/api/v1/ollama/status');
        const data = await res.json();

        const dot = document.getElementById('ollama-dot');
        const label = document.getElementById('ollama-status-text');
        const cfgDot = document.getElementById('cfg-ollama-status-dot');

        if (data.online) {
            availableModels = data.models || [];
            // Only set activeModel on first load (when nothing selected yet)
            if (!activeModel) {
                activeModel = data.current || (availableModels[0] ?? '');
                activeProvider = 'ollama';
            }

            if (dot) { dot.classList.remove('bg-border-color', 'bg-danger'); dot.classList.add('bg-primary'); }
            if (label) label.textContent = `Ollama online · ${availableModels.length} model${availableModels.length !== 1 ? 's' : ''}`;
            if (cfgDot) { cfgDot.classList.remove('bg-border-color', 'bg-danger'); cfgDot.classList.add('bg-primary'); }
        } else {
            availableModels = [];
            if (dot) { dot.classList.remove('bg-primary', 'bg-border-color'); dot.classList.add('bg-danger'); }
            if (label) label.textContent = 'Ollama offline';
            if (cfgDot) { cfgDot.classList.remove('bg-primary', 'bg-border-color'); cfgDot.classList.add('bg-danger'); }
        }

        updateModelLabel();
        populateModelDropdown();

        // Sync config panel's Ollama model dropdown (doesn't affect active selection)
        const cfgModel = document.getElementById('cfg-ollama-model');
        if (cfgModel && activeProvider === 'ollama' && activeModel) cfgModel.value = activeModel;

        // Load base URL from backend
        try {
            const cfgRes = await fetch('/api/v1/config/ollama');
            const cfgData = await cfgRes.json();
            ollamaBaseUrl = cfgData.base_url || ollamaBaseUrl;
            const cfgUrl = document.getElementById('cfg-ollama-url');
            if (cfgUrl) cfgUrl.value = ollamaBaseUrl;
        } catch { /* ignore */ }

    } catch {
        const dot = document.getElementById('ollama-dot');
        if (dot) { dot.classList.remove('bg-primary', 'bg-border-color'); dot.classList.add('bg-danger'); }
    }
}

function updateModelLabel() {
    const lbl = document.getElementById('model-label');
    let prefix = '';
    if (activeProvider === 'lmstudio') prefix = '[LMS] ';
    else if (activeProvider === 'openrouter') prefix = '[OR] ';
    if (lbl) lbl.textContent = activeModel ? prefix + activeModel : '—';
}

function populateModelDropdown() {
    // Header dropdown
    const list = document.getElementById('model-dropdown-list');
    if (list) {
        list.innerHTML = '';

        const hasOllama = availableModels.length > 0;
        const hasLMS = lmStudioModels.length > 0;
        const hasOR = openRouterModels.length > 0 || !!cloudModel;

        if (!hasOllama && !hasLMS && !hasOR) {
            list.innerHTML = '<div class="px-4 py-2 text-[10px] mono-text text-secondary-text">No models found</div>';
        } else {
            // Ollama section
            if (hasOllama) {
                const sep = document.createElement('div');
                sep.className = 'px-4 py-1 text-[9px] mono-text text-secondary-text uppercase tracking-widest border-b border-border-color';
                sep.textContent = 'Ollama';
                list.appendChild(sep);

                availableModels.forEach(model => {
                    const item = document.createElement('button');
                    const isActive = activeProvider === 'ollama' && model === activeModel;
                    item.className = [
                        'w-full text-left px-4 py-2 text-[11px] mono-text',
                        'hover:bg-primary/10 hover:text-primary transition-colors',
                        isActive ? 'text-primary' : 'text-slate-300',
                    ].join(' ');
                    item.textContent = model;
                    if (isActive) {
                        item.innerHTML += ' <span class="material-symbols-outlined text-[12px] align-middle ml-1">check</span>';
                    }
                    item.addEventListener('click', () => selectModel(model, 'ollama'));
                    list.appendChild(item);
                });
            }

            // LM Studio section
            if (hasLMS) {
                const sep = document.createElement('div');
                sep.className = 'px-4 py-1 text-[9px] mono-text text-secondary-text uppercase tracking-widest border-b border-t border-border-color mt-1';
                sep.textContent = 'LM Studio';
                list.appendChild(sep);

                lmStudioModels.forEach(model => {
                    const item = document.createElement('button');
                    const isActive = activeProvider === 'lmstudio' && model === activeModel;
                    item.className = [
                        'w-full text-left px-4 py-2 text-[11px] mono-text',
                        'hover:bg-primary/10 hover:text-primary transition-colors',
                        isActive ? 'text-primary' : 'text-slate-300',
                    ].join(' ');
                    item.textContent = model;
                    if (isActive) {
                        item.innerHTML += ' <span class="material-symbols-outlined text-[12px] align-middle ml-1">check</span>';
                    }
                    item.addEventListener('click', () => selectModel(model, 'lmstudio'));
                    list.appendChild(item);
                });
            }

            // OpenRouter section — always rendered independently of Ollama/LMStudio
            if (openRouterModels.length > 0) {
                const sep = document.createElement('div');
                sep.className = 'px-4 py-1 text-[9px] mono-text text-secondary-text uppercase tracking-widest border-b border-t border-border-color mt-1';
                sep.textContent = 'OpenRouter';
                list.appendChild(sep);

                openRouterModels.forEach(model => {
                    const item = document.createElement('button');
                    const isActive = activeProvider === 'openrouter' && model === activeModel;
                    item.className = [
                        'w-full text-left px-4 py-2 text-[11px] mono-text',
                        'hover:bg-primary/10 hover:text-primary transition-colors',
                        isActive ? 'text-primary' : 'text-slate-300',
                    ].join(' ');
                    item.textContent = model;
                    if (isActive) {
                        item.innerHTML += ' <span class="material-symbols-outlined text-[12px] align-middle ml-1">check</span>';
                    }
                    item.addEventListener('click', () => selectModel(model, 'openrouter'));
                    list.appendChild(item);
                });
            } else if (cloudModel) {
                // Show current cloud model even without fetched list
                const sep = document.createElement('div');
                sep.className = 'px-4 py-1 text-[9px] mono-text text-secondary-text uppercase tracking-widest border-b border-t border-border-color mt-1';
                sep.textContent = 'OpenRouter';
                list.appendChild(sep);
                const item = document.createElement('button');
                const isActive = activeProvider === 'openrouter';
                item.className = [
                    'w-full text-left px-4 py-2 text-[11px] mono-text',
                    'hover:bg-primary/10 hover:text-primary transition-colors',
                    isActive ? 'text-primary' : 'text-slate-300',
                ].join(' ');
                item.textContent = cloudModel;
                if (isActive) item.innerHTML += ' <span class="material-symbols-outlined text-[12px] align-middle ml-1">check</span>';
                item.addEventListener('click', () => selectModel(cloudModel, 'openrouter'));
                list.appendChild(item);
            }
        }
    }

    // Config dropdown
    populateCfgModelDropdown();
}

function populateCfgModelDropdown() {
    const list = document.getElementById('cfg-model-list');
    const label = document.getElementById('cfg-model-label');
    const hidden = document.getElementById('cfg-ollama-model');
    if (!list) return;

    list.innerHTML = '';

    if (!availableModels.length) {
        list.innerHTML = '<div class="px-3 py-2 text-[10px] mono-text text-secondary-text">No models found — is Ollama running?</div>';
        if (label) label.textContent = '—';
        return;
    }

    if (label) label.textContent = activeModel || availableModels[0] || '—';
    if (hidden) hidden.value = activeModel || '';

    availableModels.forEach(model => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = [
            'w-full text-left px-3 py-2 text-[11px] mono-text flex items-center justify-between',
            'hover:bg-primary/10 hover:text-primary transition-colors',
            model === activeModel ? 'text-primary' : 'text-slate-300',
        ].join(' ');
        item.innerHTML = `<span>${escapeHtml(model)}</span>${model === activeModel ? '<span class="material-symbols-outlined text-[12px]">check</span>' : ''}`;
        item.addEventListener('click', () => {
            selectModel(model);
            closeCfgModelDropdown();
        });
        list.appendChild(item);
    });
}

async function fetchOpenRouterModels() {
    try {
        const res = await fetch('/api/v1/openrouter/models');
        if (!res.ok) return;
        const data = await res.json();
        if (data.error && !data.models?.length) {
            const list = document.getElementById('cfg-cloud-model-list');
            if (list) list.innerHTML = `<div class="px-3 py-2 text-[10px] mono-text text-danger">${escapeHtml(data.error)}</div>`;
            return;
        }
        openRouterModels = data.models || [];
        populateCfgCloudModelDropdown();
        populateModelDropdown();
    } catch { /* ignore */ }
}

function populateCfgCloudModelDropdown() {
    const list = document.getElementById('cfg-cloud-model-list');
    const label = document.getElementById('cfg-cloud-model-label');
    const hidden = document.getElementById('cfg-cloud-model');
    if (!list) return;

    list.innerHTML = '';

    if (!openRouterModels.length) {
        list.innerHTML = '<div class="px-3 py-2 text-[10px] mono-text text-secondary-text">Enter API key and click Fetch Models</div>';
        return;
    }

    const current = (hidden?.value || cloudModel || '').trim();
    if (label) label.textContent = current || openRouterModels[0] || '—';

    openRouterModels.forEach(model => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = [
            'w-full text-left px-3 py-2 text-[11px] mono-text flex items-center justify-between',
            'hover:bg-primary/10 hover:text-primary transition-colors',
            model === current ? 'text-primary' : 'text-slate-300',
        ].join(' ');
        item.innerHTML = `<span>${escapeHtml(model)}</span>${model === current ? '<span class="material-symbols-outlined text-[12px]">check</span>' : ''}`;
        item.addEventListener('click', () => {
            cloudModel = model;
            if (label) label.textContent = model;
            if (hidden) hidden.value = model;
            document.getElementById('cfg-cloud-model-dropdown')?.classList.add('hidden');
            document.getElementById('cfg-cloud-model-chevron')?.textContent === 'expand_less' &&
                (document.getElementById('cfg-cloud-model-chevron').textContent = 'expand_more');
            populateCfgCloudModelDropdown();
            // Activate this as the current session model
            selectModel(model, 'openrouter');
        });
        list.appendChild(item);
    });
}

function initCloudModelDropdown() {
    const btn = document.getElementById('cfg-cloud-model-btn');
    const dropdown = document.getElementById('cfg-cloud-model-dropdown');
    const chevron = document.getElementById('cfg-cloud-model-chevron');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const hidden = dropdown?.classList.contains('hidden');
        dropdown?.classList.toggle('hidden');
        if (chevron) chevron.textContent = hidden ? 'expand_less' : 'expand_more';
        if (!hidden) return;
        populateCfgCloudModelDropdown();
    });

    document.getElementById('fetch-or-models-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('fetch-or-models-btn');
        if (btn) { btn.textContent = 'Fetching...'; btn.disabled = true; }
        await fetchOpenRouterModels();
        if (btn) { btn.innerHTML = '<span class="material-symbols-outlined text-[13px]">refresh</span> Fetch Models'; btn.disabled = false; }
        dropdown?.classList.remove('hidden');
        if (chevron) chevron.textContent = 'expand_less';
    });

    document.addEventListener('click', (e) => {
        if (!document.getElementById('cfg-cloud-model-wrapper')?.contains(e.target)) {
            dropdown?.classList.add('hidden');
            if (chevron) chevron.textContent = 'expand_more';
        }
    });
}

function selectModel(model, provider = 'ollama') {
    activeModel = model;
    activeProvider = provider;
    updateModelLabel();
    populateModelDropdown();
    closeModelDropdown();
    // Persist active selection so it survives page reload
    fetch('/api/v1/settings/active_provider', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: provider }) });
    fetch('/api/v1/settings/active_model',   { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: model }) });

    if (provider === 'lmstudio') {
        lmStudioModel = model;
        fetch('/api/v1/config/lmstudio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_url: lmStudioBaseUrl, model }),
        });
        const cfgLabel = document.getElementById('cfg-lmstudio-model-label');
        if (cfgLabel) cfgLabel.textContent = model;
        const cfgHidden = document.getElementById('cfg-lmstudio-model');
        if (cfgHidden) cfgHidden.value = model;
    } else if (provider === 'openrouter') {
        cloudModel = model;
        fetch('/api/v1/config/openrouter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cloud_model: model }),
        });
        const cfgLabel = document.getElementById('cfg-cloud-model-label');
        if (cfgLabel) cfgLabel.textContent = model;
        const cfgHidden = document.getElementById('cfg-cloud-model');
        if (cfgHidden) cfgHidden.value = model;
    } else {
        fetch('/api/v1/config/ollama', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_url: ollamaBaseUrl, model }),
        });
        const cfgModel = document.getElementById('cfg-ollama-model');
        if (cfgModel) cfgModel.value = model;
        const cfgLabel = document.getElementById('cfg-model-label');
        if (cfgLabel) cfgLabel.textContent = model;
    }
}

function openCfgModelDropdown() {
    const dd = document.getElementById('cfg-model-dropdown');
    const chevron = document.getElementById('cfg-model-chevron');
    const btn = document.getElementById('cfg-model-btn');
    if (dd) dd.classList.remove('hidden');
    if (chevron) chevron.textContent = 'expand_less';
    if (btn) btn.classList.add('border-primary');
}

function closeCfgModelDropdown() {
    const dd = document.getElementById('cfg-model-dropdown');
    const chevron = document.getElementById('cfg-model-chevron');
    const btn = document.getElementById('cfg-model-btn');
    if (dd) dd.classList.add('hidden');
    if (chevron) chevron.textContent = 'expand_more';
    if (btn) btn.classList.remove('border-primary');
}

function initCfgModelDropdown() {
    const btn = document.getElementById('cfg-model-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('cfg-model-dropdown');
        if (dd && dd.classList.contains('hidden')) openCfgModelDropdown();
        else closeCfgModelDropdown();
    });
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('cfg-model-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closeCfgModelDropdown();
    });
}

function openModelDropdown() {
    const dd = document.getElementById('model-dropdown');
    const chevron = document.getElementById('model-chevron');
    if (dd) dd.classList.remove('hidden');
    if (chevron) chevron.textContent = 'expand_less';
}

function closeModelDropdown() {
    const dd = document.getElementById('model-dropdown');
    const chevron = document.getElementById('model-chevron');
    if (dd) dd.classList.add('hidden');
    if (chevron) chevron.textContent = 'expand_more';
}

function initModelSelector() {
    const btn = document.getElementById('model-selector-btn');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('model-dropdown');
        if (dd && dd.classList.contains('hidden')) {
            openModelDropdown();
        } else {
            closeModelDropdown();
        }
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('model-selector-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closeModelDropdown();
    });
}

// ─── Config Save & Persistent Settings ───────────────────────────────────────

async function loadPersistedSettings() {
    try {
        const res = await fetch('/api/v1/settings');
        if (!res.ok) return;
        const data = await res.json();

        if (data.ollama_base_url) {
            ollamaBaseUrl = data.ollama_base_url;
            const cfgUrl = document.getElementById('cfg-ollama-url');
            if (cfgUrl) cfgUrl.value = ollamaBaseUrl;
        }
        // Restore last active selection (provider + model)
        if (data.active_provider && data.active_model) {
            activeProvider = data.active_provider;
            activeModel = data.active_model;
            updateModelLabel();
        } else if (data.ollama_model) {
            activeModel = data.ollama_model;
            activeProvider = 'ollama';
            updateModelLabel();
        }
        const cfgModel = document.getElementById('cfg-ollama-model');
        if (cfgModel && data.ollama_model) cfgModel.value = data.ollama_model;
        // Restore OpenRouter API key input and fetch models if key exists
        if (data.openrouter_api_key) {
            const keyInput = document.getElementById('cfg-openrouter-key');
            if (keyInput) keyInput.value = data.openrouter_api_key;
            fetchOpenRouterModels();
        } else {
            // Fallback: check keychain via dedicated endpoint (in case DB entry is missing)
            fetch('/api/v1/config/openrouter')
                .then(r => r.json())
                .then(orCfg => { if (orCfg.has_api_key) fetchOpenRouterModels(); })
                .catch(() => {});
        }
        if (data.cloud_model) {
            cloudModel = data.cloud_model;
            const cfgLabel = document.getElementById('cfg-cloud-model-label');
            if (cfgLabel) cfgLabel.textContent = cloudModel;
            const cfgHidden = document.getElementById('cfg-cloud-model');
            if (cfgHidden) cfgHidden.value = cloudModel;
        }
        if (data.lmstudio_base_url) {
            lmStudioBaseUrl = data.lmstudio_base_url;
            const cfgUrl = document.getElementById('cfg-lmstudio-url');
            if (cfgUrl) cfgUrl.value = lmStudioBaseUrl;
        }
        if (data.lmstudio_model) {
            lmStudioModel = data.lmstudio_model;
            populateLMStudioModelDropdown();
        }
    } catch { /* ignore */ }
}

async function saveConfig() {
    const btns = [
        document.getElementById('save-config-btn'),
        document.getElementById('save-config-btn-bottom'),
    ].filter(Boolean);

    const url        = document.getElementById('cfg-ollama-url')?.value?.trim()       || ollamaBaseUrl;
    const model      = document.getElementById('cfg-ollama-model')?.value?.trim()     || activeModel;
    const apiKey     = document.getElementById('cfg-openrouter-key')?.value?.trim()   || '';
    const orModel    = document.getElementById('cfg-cloud-model')?.value?.trim()      || cloudModel;
    const lmsUrl     = document.getElementById('cfg-lmstudio-url')?.value?.trim()     || lmStudioBaseUrl;
    const lmsModel   = document.getElementById('cfg-lmstudio-model')?.value?.trim()   || lmStudioModel;

    btns.forEach(b => { b.textContent = 'Saving...'; b.disabled = true; });

    try {
        await fetch('/api/v1/config/ollama', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_url: url, model }),
        });
        await fetch('/api/v1/config/lmstudio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base_url: lmsUrl, model: lmsModel }),
        });
        await fetch('/api/v1/config/openrouter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, cloud_model: orModel }),
        });
        cloudModel = orModel;
        ollamaBaseUrl = url;
        lmStudioBaseUrl = lmsUrl;
        lmStudioModel = lmsModel;
        if (activeProvider === 'ollama') activeModel = model;
        else if (activeProvider === 'openrouter') activeModel = orModel;
        updateModelLabel();
        // Persist active selection
        fetch('/api/v1/settings/active_provider', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: activeProvider }) });
        fetch('/api/v1/settings/active_model',   { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: activeModel }) });
        btns.forEach(b => { b.textContent = 'Saved!'; });
        setTimeout(() => btns.forEach(b => { b.textContent = 'Save Config'; b.disabled = false; }), 1500);
        await fetchOllamaStatus();
        await fetchLMStudioStatus();
    } catch {
        btns.forEach(b => { b.textContent = 'Error'; });
        setTimeout(() => btns.forEach(b => { b.textContent = 'Save Config'; b.disabled = false; }), 1500);
    }
}

function initConfigSave() {
    document.getElementById('save-config-btn')?.addEventListener('click', saveConfig);
    document.getElementById('save-config-btn-bottom')?.addEventListener('click', saveConfig);
}

// ─── Footer System Stats ─────────────────────────────────────────────────────

function formatTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

async function fetchSystemStats() {
    try {
        const res = await fetch('/api/v1/system/stats');
        if (!res.ok) return;
        const d = await res.json();

        const cpuEl = document.getElementById('footer-cpu');
        const gpuEl = document.getElementById('footer-gpu');
        const ramEl = document.getElementById('footer-ram');
        const tokEl = document.getElementById('footer-tokens');

        if (cpuEl) cpuEl.textContent = d.cpu + '%';
        if (ramEl) ramEl.textContent = d.ram_used_gb.toFixed(1) + 'GB';
        if (gpuEl) gpuEl.textContent = d.gpu !== null ? d.gpu + '%' : 'N/A';
        if (tokEl) tokEl.textContent = formatTokens(d.tokens);
    } catch (_) {}
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initMarkdown();
    initSidebars();
    initBottomNav();
    initConsoleTabs();
    initModeToggle();
    initIntelNav();
    initIntelTabs();
    initExpandButtons();
    initNodeToggles();
    initClock();
    initAuditFilters();
    initApiKeyToggle();
    initTopoFullscreen();
    initThemeToggle();
    initChatInput();
    initChatViewInput();
    initModelSelector();
    initCfgModelDropdown();
    initLMStudioModelDropdown();
    initCloudModelDropdown();
    initConfigSave();
    initScrollTracking();
    initAgentScrollTracking();
    window.addEventListener('resize', scheduleMinimapUpdate);
    loadPersistedSettings();
    initConversations();
    wsConnect();
    fetchOllamaStatus();
    setInterval(fetchOllamaStatus, 30000);
    fetchLMStudioStatus();
    setInterval(fetchLMStudioStatus, 30000);
    fetchSystemStats();
    setInterval(fetchSystemStats, 3000);

    // Pentest session features
    initMissionControls();
    initSessionSwitcher();
    initPauseControls();
    initNmapConfig();
    initAuditView();
    initReportView();
    loadSafetyConfig();
    loadMsfConfig();
    loadSessionsForSelects();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PENTEST SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

let activeMissionId = null;
let missionStartTime = null;
let missionPollHandle = null;
let missionUptimeHandle = null;

// ─── WebSocket session event handler extension ────────────────────────────────

/**
 * Wrap ws.onmessage once per WebSocket instance to intercept session events.
 * Guard flag prevents double-patching the same ws object.
 */
function patchWsSessionHandler() {
    if (!ws || ws._sessionPatched) return;
    ws._sessionPatched = true;

    const _base = ws.onmessage;
    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'session_event')     { handleSessionEvent(msg);  return; }
        if (msg.type === 'session_done')      { handleSessionDone(msg);   return; }
        if (msg.type === 'session_error')     { handleSessionError(msg);  return; }
        if (msg.type === 'session_subscribed') { return; }

        if (_base) _base(event);
    };
}

/**
 * Override wsConnect so every fresh WebSocket (including reconnects) automatically
 * re-patches the session handler and re-subscribes to the active mission.
 */
const _origWsConnect = wsConnect;
wsConnect = function () {
    _origWsConnect();
    // ws is now a brand-new WebSocket; wrap its onopen
    const _innerOnOpen = ws.onopen;
    ws.onopen = () => {
        if (_innerOnOpen) _innerOnOpen();
        patchWsSessionHandler();
        if (activeMissionId) {
            ws.send(JSON.stringify({ type: 'subscribe_session', session_id: activeMissionId }));
        }
    };
};

function handleSessionEvent(msg) {
    // Ignore events for sessions we are not currently viewing
    if (msg.session_id && viewingSessionId && msg.session_id !== viewingSessionId) {
        return;
    }
    const event = msg.event;
    const data = msg.data || {};

    if (event === 'start') {
        setPhaseActive(1);
        setAgentStatus('reasoning');
        updateMissionStatusHeader('running', msg.session_id);
        // When resuming from a checkpoint the feed already contains replayed events —
        // do NOT clear it. Only clear for fresh mission starts.
        if (!data.resuming) {
            clearMissionFeed();
            renderMissionStart(data.target || '', data.mode || '');
            agOnMissionStart(data);
        }
        appendConsoleLine(`[START] Target: ${data.target || ''} · Mode: ${data.mode || ''}`, 'text-primary');
        // Initialize objectives tracker from start event
        if (Array.isArray(data.objectives) && data.objectives.length > 0) {
            initObjectivesPanel(data.objectives);
        }

    } else if (event === 'llm_thinking_start') {
        _closeToolBatch();
        setAgentStatus('reasoning');
        startAgentStreamCard('thinking');

    } else if (event === 'llm_reflecting_start') {
        _closeToolBatch();
        setAgentStatus('reflecting');
        startAgentStreamCard('reflecting');

    } else if (event === 'llm_token') {
        appendAgentStreamToken(data.token || '');

    } else if (event === 'reasoning') {
        _closeToolBatch();
        setAgentStatus('reasoning', data.action ? `→ ${data.action}` : '');
        finalizeAgentStreamCard();
        renderMissionReasoning(data);
        updatePhaseFromEvent(data);
        agOnThinking(data);
        appendConsoleLine(`[THINK] ${data.thought || data.action || ''}`, 'text-secondary-text');
        if (data.action) {
            appendConsoleLine(`[ACTION] → ${data.action}`, 'text-slate-400');
        }

    } else if (event === 'tool_call') {
        const toolName = data.tool || data.tool_name || data.action || '';
        setAgentStatus('acting', toolName);
        _openOrAddToToolBatch(data);
        agOnToolCall(data);
        appendConsoleToolCall(data);

    } else if (event === 'tool_result') {
        setAgentStatus('reasoning');
        if (!_resolveToolBatchItem(data)) renderMissionToolResult(data); // fallback for replays
        agOnToolResult(data);
        appendConsoleToolResult(data);
        // Feed intel panels
        if (data.tool === 'searchsploit_search' && data.success) {
            updateAnalysisPanelFromSearchsploit(data);
        }

    } else if (event === 'reflection') {
        setAgentStatus('reflecting');
        finalizeAgentStreamCard();
        agOnReflection(data);
        // Streaming card already shows the full reflection content — skip duplicate static card
        if (data.content) {
            appendConsoleLine(`[REFLECT] ${data.content.slice(0, 120)}`, 'text-purple-400');
        }

    } else if (event === 'safety_block') {
        renderMissionSafetyBlock(data);
        appendConsoleLine(`[SAFETY] Blocked ${data.tool || ''}: ${data.reason || ''}`, 'text-orange-400');

    } else if (event === 'observation') {
        // Handled via tool_result; just update phase
        updatePhaseFromEvent(data);

    } else if (event === 'parallel_start') {
        const tools = (data.tools || []).join(', ');
        setAgentStatus('acting', `⚡ parallel ×${data.count}`);
        appendConsoleLine(`[PARALLEL] Starting ${data.count} tools simultaneously: ${tools}`, 'text-yellow-400');
        agOnParallelStart(data);

    } else if (event === 'parallel_done') {
        appendConsoleLine(`[PARALLEL] ${data.count} tools completed`, 'text-green-400');
        agOnParallelDone(data);

    } else if (event === 'phase_change' || event === 'discovery') {
        updatePhaseFromEvent(data);
        // Capture topology phase event for timeline
        if (data.attack_phase) {
            _topoEvents.push({ ts: Date.now(), type: 'phase_change', label: `Phase: ${data.attack_phase}` });
            _topoUpdateTimeline();
        }

    } else if (event === 'generate_report') {
        setPhaseActive(5);
        setAgentStatus('reflecting', 'generating report');
        appendConsoleLine('[REPORT] Generating final report…', 'text-primary');

    } else if (event === 'paused') {
        setAgentStatus('paused');
        appendConsoleLine('[PAUSED] Agent paused by operator', 'text-yellow-400');
        appendMissionCard(`
            <div class="border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 font-mono text-xs">
                <div class="flex items-center gap-2 text-yellow-400 font-bold">
                    <span class="material-symbols-outlined text-[13px]" style="font-variation-settings:'FILL' 1;">pause_circle</span>
                    AGENT PAUSED — waiting for operator instruction
                </div>
            </div>
        `);
        missionPaused = true;
        updatePauseButton();

    } else if (event === 'resumed') {
        appendConsoleLine('[RESUMED] Agent resumed', 'text-primary');
        appendMissionCard(`
            <div class="border border-primary/20 bg-primary/5 px-4 py-2 font-mono text-xs">
                <div class="flex items-center gap-2 text-primary font-bold">
                    <span class="material-symbols-outlined text-[13px]" style="font-variation-settings:'FILL' 1;">play_circle</span>
                    AGENT RESUMED
                </div>
            </div>
        `);
        missionPaused = false;
        updatePauseButton();

    } else if (event === 'rolled_back') {
        const iter = data.iteration || '?';
        const phase = data.attack_phase || '';
        appendConsoleLine(`[ROLLBACK] Iteration ${iter} noktasına geri dönüldü`, 'text-primary');
        appendMissionCard(`
            <div class="border border-primary/20 bg-primary/5 px-4 py-2 font-mono text-xs">
                <div class="flex items-center gap-2 text-primary font-bold">
                    <span class="material-symbols-outlined text-[13px]" style="font-variation-settings:'FILL' 1;">history</span>
                    ROLLBACK — Iteration ${iter}${phase ? ' · ' + phase : ''}
                </div>
            </div>
        `);
        missionPaused = false;
        updatePauseButton();

    } else if (event === 'injected') {
        appendConsoleLine(`[INJECT] Operator instruction added to agent memory`, 'text-yellow-400');

    } else if (event === 'operator_response') {
        const thought = data.thought || '';
        appendMissionCard(`
            <div class="bg-primary/5 pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(204,255,0,0.35);border-left:4px solid #ccff00;">
                <div class="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-widest mb-1.5">
                    <span class="material-symbols-outlined text-[13px]" style="font-variation-settings:'FILL' 1;">smart_toy</span>
                    AGENT RESPONSE TO OPERATOR
                </div>
                <div class="text-slate-200 text-[11px] whitespace-pre-wrap leading-relaxed">${_esc(thought)}</div>
            </div>
        `);
        appendConsoleLine(`[OPERATOR RESPONSE] ${thought.slice(0, 120)}`, 'text-primary');

    } else if (event === 'kill_switch') {
        stopMissionUptime();
        showToast('Emergency stop activated');
        updateMissionStatusHeader('stopped', msg.session_id);
        appendConsoleLine('[KILL_SWITCH] Emergency stop triggered', 'text-danger');

    } else if (event === 'max_iterations') {
        showToast('Max iterations reached — mission finishing');
        appendConsoleLine('[MAX_ITER] Maximum iterations reached — wrapping up', 'text-orange-400');

    } else if (event === 'objective_complete') {
        const obj = data.objective || '';
        markObjectiveComplete(obj);
        appendConsoleLine(`[OBJECTIVE ✓] ${obj}`, 'text-green-400');
        appendMissionCard(`
            <div class="border border-green-500/40 bg-green-500/5 px-4 py-2 font-mono text-xs">
                <div class="flex items-center gap-2 text-green-400 font-bold">
                    <span class="material-symbols-outlined text-[13px]" style="font-variation-settings:'FILL' 1;">task_alt</span>
                    OBJECTIVE ACHIEVED
                </div>
                <div class="text-slate-200 mt-1">${_esc(obj)}</div>
                ${data.evidence ? `<div class="text-slate-500 text-[10px] mt-1 truncate">${_esc(data.evidence.slice(0, 120))}</div>` : ''}
            </div>
        `);

    } else if (event === 'error') {
        setAgentStatus('error', data.error ? data.error.slice(0, 60) : '');
        renderMissionError(data);
        appendConsoleLine(`[ERROR] ${data.error || ''}`, 'text-danger');
    }

    if (activeMissionId) {
        refreshMissionStats(activeMissionId);
    }
}

function handleSessionDone(msg) {
    const counts = msg.data || msg;
    setPhaseActive(5);
    setAgentStatus('done');
    updateMissionStatusHeader('done', msg.session_id);
    stopMissionPoll();
    stopMissionUptime();
    hidePauseMissionBtn();
    missionPaused = false;
    syncInputMode();
    showToast('Mission complete');
    renderMissionDone({
        hosts:    counts.hosts,
        vulns:    counts.vulns,
        exploits: counts.exploits,
        flags:    counts.flags    || [],
        findings: counts.findings || [],
        objective_result: counts.objective_result || counts.objective || '',
    });
    agOnDone(counts);
    appendConsoleLine('[SESSION] Agent finished — report available in the Report tab', 'text-primary');

    // Only overwrite sidebar stats if user is viewing this session
    if (!viewingSessionId || viewingSessionId === activeMissionId) {
        if (counts.hosts    !== undefined) setStatValue('stat-hosts', counts.hosts);
        if (counts.vulns    !== undefined) setStatValue('stat-vulns', counts.vulns);
        if (counts.ports    !== undefined) setStatValue('stat-ports', counts.ports);
    }

    // Refresh intel panels from final session data
    if (activeMissionId) {
        fetch(`/api/v1/sessions/${activeMissionId}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (Array.isArray(data.vulnerabilities) && data.vulnerabilities.length > 0) {
                    _analysisVulns = data.vulnerabilities;
                    updateAnalysisPanelFromSearchsploit({ output: JSON.stringify({ vulnerabilities: data.vulnerabilities }) });
                }
                updateNetworkPanelFromSession(data);
            })
            .catch(() => {});
    }

    // Sync report view to completed session
    if (activeMissionId) {
        reportSessionId = activeMissionId;
        const sel = document.getElementById('report-session-select');
        if (sel && sel.value !== activeMissionId) sel.value = activeMissionId;
    }

    loadSessionsForSelects();
}

function handleSessionError(msg) {
    setAgentStatus('error', msg.error ? msg.error.slice(0, 60) : '');
    updateMissionStatusHeader('error', msg.session_id);
    stopMissionPoll();
    stopMissionUptime();
    hidePauseMissionBtn();
    missionPaused = false;
    syncInputMode();
    showToast('Mission error: ' + (msg.error || 'unknown'), true);
    renderMissionError({ error: msg.error || 'Session failed' });
    appendConsoleLine(`[ERROR] Session failed: ${msg.error || ''}`, 'text-danger');
}

// ─── Mission Controls ─────────────────────────────────────────────────────────

function initMissionControls() {
    const startBtn = document.getElementById('start-mission-btn');
    const stopBtn = document.getElementById('emergency-stop-btn');
    const stopBtnMobile = document.getElementById('emergency-stop-btn-mobile');

    if (startBtn) startBtn.addEventListener('click', startMission);
    if (stopBtn) stopBtn.addEventListener('click', killMission);
    if (stopBtnMobile) stopBtnMobile.addEventListener('click', killMission);
}

async function startMission() {
    const targetInput = document.getElementById('mission-target');
    const modeSelect = document.getElementById('mission-mode');
    const startBtn = document.getElementById('start-mission-btn');

    const target = targetInput ? targetInput.value.trim() : '';
    const mode = modeSelect ? modeSelect.value : 'scan_only';
    const portRangeInput = document.getElementById('mission-port-range');
    const notesInput = document.getElementById('mission-notes');
    const portRange = portRangeInput ? (portRangeInput.value.trim() || '1-65535') : '1-65535';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (!target) {
        showToast('Enter a target IP, CIDR range, or domain');
        if (targetInput) targetInput.focus();
        return;
    }

    if (startBtn) { startBtn.textContent = 'Starting...'; startBtn.disabled = true; }

    try {
        const res = await fetch('/api/v1/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, mode, port_range: portRange, notes, provider: activeProvider, model: activeModel }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Start failed');
        }
        const data = await res.json();
        activeMissionId = data.session_id;
        viewingSessionId = activeMissionId;
        missionStartTime = Date.now();
        missionPaused = false;
        hideResumeFromSessionBtn();

        // Update UI
        updateMissionStatusHeader('running', activeMissionId, target);
        resetMissionStats();
        resetPhaseBar();
        setPhaseActive(1);
        clearConsoleOutput();
        clearMissionFeed();
        agentAutoScroll = true;
        _updateScrollBtn();
        resetAnalysisPanel(target);
        resetNetworkPanel(target);
        renderMissionStart(target, mode);
        appendConsoleLine(`[SESSION] ${activeMissionId}`, 'text-primary');
        appendConsoleLine(`[TARGET]  ${target}  [MODE] ${mode.toUpperCase()}`, 'text-secondary-text');
        showPauseMissionBtn();
        updatePauseButton();
        setAgentStatus('reasoning');
        syncInputMode();

        // Subscribe to session events via WebSocket
        patchWsSessionHandler();
        if (ws && wsReady) {
            ws.send(JSON.stringify({ type: 'subscribe_session', session_id: activeMissionId }));
        }
        // activeMissionId is now set — wsConnect's onopen will re-subscribe on reconnect

        // Start polling for DB-backed stats
        startMissionPoll(activeMissionId);
        startMissionUptime();

        // Switch to agent view so user sees the live feed immediately
        switchView('agent');
        showToast('Mission started');

    } catch (err) {
        showToast('Error: ' + err.message, true);
    } finally {
        if (startBtn) {
            startBtn.textContent = 'Start Mission';
            startBtn.disabled = false;
        }
    }
}

/** Start a new mission using a saved session's scan results and vulns (skip re-scan). */
async function resumeMissionFromSession(sessionId) {
    if (!sessionId) { showToast('No session selected'); return; }
    const modeSelect = document.getElementById('mission-mode');
    const mode = modeSelect ? modeSelect.value : 'full_auto';

    try {
        const res = await fetch('/api/v1/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_from_session_id: sessionId, mode, target: '' }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || (err.detail && err.detail[0] ? err.detail[0].msg : 'Resume failed'));
        }
        const data = await res.json();
        activeMissionId = data.session_id;
        viewingSessionId = activeMissionId;
        missionStartTime = Date.now();
        missionPaused = false;

        updateMissionStatusHeader('running', activeMissionId, data.target || 'Resumed');
        resetMissionStats();
        resetPhaseBar();
        setPhaseActive(4);
        clearConsoleOutput();
        clearMissionFeed();
        resetAnalysisPanel(data.target || sessionId.slice(0, 8));
        resetNetworkPanel(data.target || sessionId.slice(0, 8));
        renderMissionStart(data.target || sessionId.slice(0, 8), mode);
        appendConsoleLine(`[RESUME] From session ${sessionId.slice(0, 8)}…`, 'text-primary');
        appendConsoleLine(`[TARGET] ${data.target || '—'}  [MODE] ${(data.mode || mode).toUpperCase()}`, 'text-secondary-text');
        hideResumeFromSessionBtn();
        showPauseMissionBtn();
        updatePauseButton();
        setAgentStatus('reasoning');
        syncInputMode();

        patchWsSessionHandler();
        if (ws && wsReady) {
            ws.send(JSON.stringify({ type: 'subscribe_session', session_id: activeMissionId }));
        }
        startMissionPoll(activeMissionId);
        startMissionUptime();
        switchView('agent');
        showToast('Mission resumed from saved state — exploitation phase');
    } catch (err) {
        showToast('Resume failed: ' + err.message, true);
    }
}

/** Continue from a specific iteration checkpoint on the SAME session.
 *  Works for both running and historical (completed/stopped) sessions.
 *  Deletes all events after the checkpoint and restarts the agent from there.
 */
async function forkFromIteration(iteration) {
    const sessionId = viewingSessionId || activeMissionId;
    if (!sessionId) { showToast('No session selected'); return; }

    showConfirm({
        title: 'Continue from here',
        message: `Continue from iteration ${iteration}? Steps after this checkpoint will be discarded and the agent will resume from here.`,
        icon: 'history',
        onConfirm: async () => {
            try {
                // Always rollback in-place — works for both running and historical sessions
                const res = await fetch(`/api/v1/sessions/${sessionId}/rollback/${iteration}`, {
                    method: 'POST',
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Continue failed');
                }
                const data = await res.json();
                const attackPhase = data.attack_phase || 'EXPLOITATION';

                activeMissionId = sessionId;
                viewingSessionId = sessionId;
                missionPaused = false;

                updateMissionStatusHeader('running', sessionId);

                // Replay events up to the checkpoint so messages are preserved
                clearMissionFeed();
                clearConsoleOutput();
                try {
                    const sessionRes = await fetch(`/api/v1/sessions/${sessionId}`);
                    const sessionInfo = sessionRes.ok ? await sessionRes.json() : null;
                    const evRes = await fetch(`/api/v1/sessions/${sessionId}/events`);
                    const evData = evRes.ok ? await evRes.json() : null;
                    if (evData && evData.events && evData.events.length > 0) {
                        const eventsUpTo = evData.events.filter(ev => (ev.iteration || 0) <= iteration);
                        const target = sessionInfo?.target || sessionId.slice(0, 8);
                        const mode = sessionInfo?.mode || 'full_auto';
                        renderMissionStart(target, mode);
                        eventsUpTo.forEach(ev => replaySessionEvent(ev.event_type, ev.data));
                        setTimeout(_agRender, 150);
                    }
                } catch (_) { /* replay best-effort */ }

                appendConsoleLine(`[RESUME] Continuing from iteration ${iteration}`, 'text-primary');
                appendConsoleLine(`[PHASE] ${attackPhase}`, 'text-secondary-text');
                hideResumeFromSessionBtn();
                showPauseMissionBtn();
                updatePauseButton();
                setAgentStatus('reasoning');
                syncInputMode();

                patchWsSessionHandler();
                if (ws && wsReady) {
                    ws.send(JSON.stringify({ type: 'subscribe_session', session_id: sessionId }));
                }
                startMissionPoll(sessionId);
                startMissionUptime();
                switchView('agent');
                showToast(`Continuing from iteration ${iteration}`);
            } catch (err) {
                showToast('Continue failed: ' + err.message, true);
            }
        },
    });
}

async function killMission() {
    if (!activeMissionId) {
        showToast('No active mission to stop');
        return;
    }
    showConfirm({
        title: 'Emergency Stop',
        message: `Stop mission ${activeMissionId.slice(0, 8)}...? The agent will halt immediately.`,
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/v1/sessions/${activeMissionId}/kill`, { method: 'POST' });
                const data = await res.json();
                if (data.ok) {
                    setAgentStatus('error', 'emergency stop');
                    updateMissionStatusHeader('stopped', activeMissionId);
                    stopMissionPoll();
                    stopMissionUptime();
                    hidePauseMissionBtn();
                    missionPaused = false;
                    syncInputMode();
                    showToast('Emergency stop sent');
                    appendConsoleLine('[KILL_SWITCH] Emergency stop triggered by user', 'text-danger');
                }
            } catch (err) {
                showToast('Kill failed: ' + err.message, true);
            }
        },
    });
}

// ─── Mission polling & uptime ──────────────────────────────────────────────────

function startMissionPoll(sessionId) {
    stopMissionPoll();
    missionPollHandle = setInterval(() => refreshMissionStats(sessionId), 5000);
}

function stopMissionPoll() {
    if (missionPollHandle) { clearInterval(missionPollHandle); missionPollHandle = null; }
}

function stopMissionUptime() {
    if (missionUptimeHandle) { clearInterval(missionUptimeHandle); missionUptimeHandle = null; }
}

function setUptimeFromDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    setStatValue('stat-uptime', `${hh}h ${mm}m ${ss}s`);
}

function startMissionUptime(startTimeMs) {
    stopMissionUptime();
    if (startTimeMs !== undefined) missionStartTime = startTimeMs;
    missionUptimeHandle = setInterval(() => {
        if (!missionStartTime) return;
        const elapsed = Math.floor((Date.now() - missionStartTime) / 1000);
        setUptimeFromDuration(elapsed);
    }, 1000);
}

async function refreshMissionStats(sessionId) {
    try {
        const res = await fetch(`/api/v1/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();

        // Skip stat update if user is viewing a different session
        if (viewingSessionId && viewingSessionId !== sessionId) return;

        // Count individual open ports across all scan result blobs (not scan record count)
        const livePorts = (data.scan_results || [])
            .flatMap(r => (r.hosts || []).flatMap(h => (h.ports || []).filter(p => p.state === 'open')))
            .length;
        const liveHosts = new Set(
            (data.scan_results || []).flatMap(r => (r.hosts || []).map(h => h.ip)).filter(Boolean)
        ).size;
        const liveVulns = (data.vulnerabilities || []).length;

        // Use live counts; fall back to DB summary fields if live counts are still 0
        setStatValue('stat-vulns', liveVulns || data.vulns_found || '—');
        setStatValue('stat-hosts', liveHosts || data.hosts_found || '—');
        setStatValue('stat-ports', livePorts || data.ports_found || '—');

        // Update network panel with live scan data
        updateNetworkPanelFromSession(data);

        // Update phase bar based on agent's attack_phase
        updatePhaseFromSessionStatus(data.status);

        // Stop polling if session is finished
        if (data.status === 'done' || data.status === 'error' || data.status === 'stopped') {
            stopMissionPoll();
            stopMissionUptime();
            stopNetworkPanel();
            updateMissionStatusHeader(data.status, sessionId);
        }

        // Detect orphaned sessions: DB says running/idle but no live task (e.g. server restarted)
        if ((data.status === 'running' || data.status === 'idle') && data.is_running === false) {
            stopMissionPoll();
            stopMissionUptime();
            updateMissionStatusHeader('error', sessionId);
            appendConsoleLine('[SERVER] Agent task lost — server may have restarted. Start a new mission.', 'text-danger');
        }
    } catch { /* ignore */ }
}

function setStatValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
}

function resetMissionStats() {
    setStatValue('stat-vulns', '0');
    setStatValue('stat-hosts', '0');
    setStatValue('stat-ports', '0');
    setStatValue('stat-uptime', '00h 00m 00s');
    setStatValue('stat-shells', '0');
}

// ─── Intel Panel: Analysis ─────────────────────────────────────────────────────

let _analysisVulns = [];

function resetAnalysisPanel(target) {
    _analysisVulns = [];

    const list = document.getElementById('analysis-findings-list');
    if (list) list.innerHTML = '<p class="text-[10px] text-secondary-text mono-text text-center py-4">Scanning…</p>';

    const score = document.getElementById('analysis-threat-score');
    if (score) { score.textContent = '—'; score.style.color = ''; }

    const status = document.getElementById('analysis-threat-status');
    if (status) { status.textContent = 'SCANNING'; status.style.color = '#ccff00'; }

    const circle = document.getElementById('analysis-threat-circle');
    if (circle) { circle.setAttribute('stroke', '#1A1A1A'); circle.setAttribute('stroke-dashoffset', '364.4'); }

    const summary = document.getElementById('analysis-summary-text');
    if (summary) summary.textContent = `Mission active on ${target || '?'}. Awaiting scan results…`;
}

function updateAnalysisPanelFromSearchsploit(data) {
    let output;
    try { output = typeof data.output === 'string' ? JSON.parse(data.output) : data.output; } catch { return; }
    const vulns = output?.vulnerabilities;
    if (!Array.isArray(vulns) || vulns.length === 0) return;

    _analysisVulns.push(...vulns);

    // ── Findings list ──────────────────────────────────────────────────────────
    const list = document.getElementById('analysis-findings-list');
    if (list) {
        const MAX = 12;
        const items = _analysisVulns.slice(0, MAX).map(v => {
            const cvss = v.cvss ?? v.score ?? null;
            const col  = cvss == null ? 'text-secondary-text'
                       : cvss >= 9   ? 'text-danger'
                       : cvss >= 7   ? 'text-orange-400'
                       : cvss >= 4   ? 'text-yellow-400'
                       :               'text-secondary-text';
            const badge = cvss != null ? cvss.toFixed(1) : '?';
            return `<div class="flex items-start gap-2 py-1 border-b border-border-color/20">
                <span class="${col} font-bold text-[10px] mono-text shrink-0 w-7">${badge}</span>
                <span class="text-slate-300 text-[10px] mono-text leading-snug break-all">${_esc(v.title || v.description || '')}</span>
            </div>`;
        }).join('');
        const more = _analysisVulns.length > MAX
            ? `<p class="text-[9px] text-secondary-text mono-text py-1 text-center">… and ${_analysisVulns.length - MAX} more</p>` : '';
        list.innerHTML = items + more;
    }

    // ── Threat gauge ───────────────────────────────────────────────────────────
    const maxCvss = Math.max(..._analysisVulns.map(v => v.cvss ?? v.score ?? 0));
    const circumference = 364.4;
    const dashOffset    = circumference * (1 - Math.min(maxCvss / 10, 1));
    const gaugeColor    = maxCvss >= 9 ? '#FF3B3B' : maxCvss >= 7 ? '#FF8C00' : maxCvss >= 4 ? '#ccff00' : '#666666';
    const gaugeLabel    = maxCvss >= 9 ? 'CRITICAL' : maxCvss >= 7 ? 'HIGH' : maxCvss >= 4 ? 'MEDIUM' : 'LOW';

    const circle = document.getElementById('analysis-threat-circle');
    if (circle) { circle.setAttribute('stroke', gaugeColor); circle.setAttribute('stroke-dashoffset', dashOffset.toFixed(1)); }

    const scoreEl = document.getElementById('analysis-threat-score');
    if (scoreEl) { scoreEl.textContent = maxCvss.toFixed(1); scoreEl.style.color = gaugeColor; }

    const statusEl = document.getElementById('analysis-threat-status');
    if (statusEl) { statusEl.textContent = gaugeLabel; statusEl.style.color = gaugeColor; }

    const summary = document.getElementById('analysis-summary-text');
    if (summary) {
        const svcSet = new Set(_analysisVulns.map(v => v.service).filter(Boolean));
        summary.textContent = `${_analysisVulns.length} vulnerabilit${_analysisVulns.length === 1 ? 'y' : 'ies'} across ${svcSet.size || '?'} service(s). Max CVSS ${maxCvss.toFixed(1)} — ${gaugeLabel}.`;
    }

    // Also update the expanded analysis page
    _updateAnalysisExpanded(_analysisVulns);
}

function _updateAnalysisExpanded(vulns) {
    if (!Array.isArray(vulns)) return;
    const total    = vulns.length;
    const critical = vulns.filter(v => (v.cvss_score ?? v.cvss ?? v.score ?? 0) >= 9).length;
    const high     = vulns.filter(v => { const s = v.cvss_score ?? v.cvss ?? v.score ?? 0; return s >= 7 && s < 9; }).length;
    const medium   = vulns.filter(v => { const s = v.cvss_score ?? v.cvss ?? v.score ?? 0; return s >= 4 && s < 7; }).length;
    const low      = vulns.filter(v => (v.cvss_score ?? v.cvss ?? v.score ?? 0) < 4).length;
    const maxCvss  = total > 0 ? Math.max(...vulns.map(v => v.cvss_score ?? v.cvss ?? v.score ?? 0)) : 0;
    const pct      = Math.round(Math.min(maxCvss / 10, 1) * 100);
    const gaugeColor = maxCvss >= 9 ? '#FF3B3B' : maxCvss >= 7 ? '#FF8C00' : maxCvss >= 4 ? '#ccff00' : '#666666';
    const gaugeLabel = maxCvss >= 9 ? 'CRITICAL' : maxCvss >= 7 ? 'HIGH' : maxCvss >= 4 ? 'MEDIUM' : total > 0 ? 'LOW' : 'NO DATA';

    // Stats row
    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const setC = (id, c) => { const el = document.getElementById(id); if (el) el.style.color = c; };
    setT('analysis-exp-threat-score', total > 0 ? pct + '%' : '—');
    setT('analysis-exp-threat-label', gaugeLabel);
    setC('analysis-exp-threat-score', total > 0 ? gaugeColor : '');
    setT('analysis-exp-critical', critical);
    setT('analysis-exp-high', high);
    setT('analysis-exp-total', total);

    // Criticality gauge
    const circ = document.getElementById('analysis-exp-gauge-circle');
    if (circ) { circ.setAttribute('stroke', total > 0 ? gaugeColor : '#444'); circ.setAttribute('stroke-dashoffset', (314.2 * (1 - pct / 100)).toFixed(1)); }
    setT('analysis-exp-gauge-pct', total > 0 ? pct + '%' : '—');
    setC('analysis-exp-gauge-pct', total > 0 ? gaugeColor : '');
    setT('analysis-exp-gauge-lbl', gaugeLabel);

    // CVSS distribution bars
    const barMax = Math.max(critical, high, medium, low, 1);
    const setBar = (barId, numId, count, color) => {
        const bar = document.getElementById(barId); if (bar) bar.style.width = Math.round(count / barMax * 100) + '%';
        const num = document.getElementById(numId); if (num) { num.textContent = count; num.style.color = color; }
    };
    setBar('analysis-exp-bar-critical', 'analysis-exp-n-critical', critical, '#FF3B3B');
    setBar('analysis-exp-bar-high',     'analysis-exp-n-high',     high,     '#FF8C00');
    setBar('analysis-exp-bar-medium',   'analysis-exp-n-medium',   medium,   '#EAB308');
    setBar('analysis-exp-bar-low',      'analysis-exp-n-low',      low,      '#888');

    // CVE table
    const tbody = document.getElementById('analysis-exp-cve-tbody');
    const cntEl = document.getElementById('analysis-exp-cve-count');
    if (cntEl) cntEl.textContent = total + ' total';
    if (tbody) {
        if (total === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-5 py-4 text-center text-secondary-text text-[10px]">No vulnerability data yet</td></tr>';
        } else {
            tbody.innerHTML = vulns.slice(0, 50).map(v => {
                const cvss  = v.cvss_score ?? v.cvss ?? v.score ?? null;
                const col   = cvss == null ? 'text-secondary-text' : cvss >= 9 ? 'text-danger' : cvss >= 7 ? 'text-orange-400' : cvss >= 4 ? 'text-yellow-400' : 'text-secondary-text';
                const badge = cvss != null ? cvss.toFixed(1) : '?';
                const title = _esc(v.title || v.description || 'Unknown');
                const cveId = v.cve_id ? `<span class="text-primary">${_esc(v.cve_id)}</span>` : `<span class="text-secondary-text text-[9px]">${title.slice(0, 40)}</span>`;
                const svc   = _esc(v.service || '—');
                const type  = _esc(v.exploit_type || '—');
                return `<tr class="border-b border-border-color hover:bg-surface transition-colors">
                    <td class="px-5 py-2 font-bold mono-text text-xs">${cveId}</td>
                    <td class="px-4 py-2"><span class="${col} font-bold">${badge}</span></td>
                    <td class="px-4 py-2 text-slate-300 text-[10px]">${svc}</td>
                    <td class="px-4 py-2 text-slate-400 text-[10px]">${type}</td>
                </tr>`;
            }).join('');
        }
    }

    // Summary text
    const sumEl = document.getElementById('analysis-exp-summary');
    if (sumEl && total > 0) {
        const svcSet = new Set(vulns.map(v => v.service).filter(Boolean));
        sumEl.textContent = `${total} vulnerabilit${total === 1 ? 'y' : 'ies'} across ${svcSet.size || '?'} service(s). Max CVSS ${maxCvss.toFixed(1)} — ${gaugeLabel}. ${critical} critical, ${high} high severity findings.`;
    }
}

// ─── Intel Panel: Network + D3 Topology Engine ────────────────────────────────

let _networkScanResults  = [];
let _networkVulnCount    = 0;
let _topoLastHosts       = [];
let _topoLastExploits    = [];
let _topoCurrentTarget   = '';
let _topoEvents          = [];   // [{ts, type, ip, data}]
let _topoTimelinePos     = 0;    // 0.0 – 1.0
let _topoPlaying         = false;
let _topoSpeed           = 1;
let _topoAnimFrame       = null;
let _topoLastAnimTs      = null;
let _topoD3State         = {};   // svgId → {zoom, sel, fitted}
// Snapshot of host/exploit IPs for diff-based event capture
let _topoPrevHostIPs     = new Set();
let _topoPrevExploitIPs  = new Set();

function resetNetworkPanel(target) {
    _networkScanResults = [];
    _networkVulnCount   = 0;
    _topoLastHosts      = [];
    _topoLastExploits   = [];
    _topoCurrentTarget  = target || '';
    _topoEvents         = [];
    _topoTimelinePos    = 0;
    _topoPrevHostIPs    = new Set();
    _topoPrevExploitIPs = new Set();
    _topoD3State        = {};
    _topoStopPlay();
    _topoUpdateTimeline();

    const subnetEl = document.getElementById('network-subnet-text');
    if (subnetEl) subnetEl.textContent = target || '—';

    const dot = document.getElementById('network-status-dot');
    if (dot) { dot.style.backgroundColor = '#ccff00'; dot.style.boxShadow = '0 0 4px #ccff00'; }

    const txt = document.getElementById('network-status-text');
    if (txt) { txt.textContent = 'Active'; txt.style.color = '#ccff00'; }

    setStatValue('network-hosts-count', '0');
    setStatValue('network-ports-count', '0');
    setStatValue('network-vulns-count', '0');

    renderNetworkTopology([], []);
}

// ─── Port risk classification ──────────────────────────────────────────────────

const _HIGH_RISK_PORTS  = new Set([23, 512, 513, 514, 1524, 5900, 6000]);
const _MED_RISK_PORTS   = new Set([21, 22, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 1099, 2049, 3306, 3389, 5432, 8009, 8080, 8443]);

function _portRiskColor(portNum) {
    if (_HIGH_RISK_PORTS.has(portNum)) return '#FF3B3B';
    if (_MED_RISK_PORTS.has(portNum))  return '#FF8C00';
    return '#555555';
}

function _portRiskLabel(portNum) {
    if (_HIGH_RISK_PORTS.has(portNum)) return 'CRIT';
    if (_MED_RISK_PORTS.has(portNum))  return 'HIGH';
    return 'LOW';
}

// Merge duplicate host entries (multiple scans can return the same IP)
function _mergeHosts(allHosts) {
    const map = new Map();
    for (const h of allHosts) {
        const ip = h.ip || '';
        if (!ip) continue;
        if (!map.has(ip)) {
            map.set(ip, { ip, hostname: h.hostname || '', os: h.os || '', ports: new Map() });
        }
        const merged = map.get(ip);
        for (const p of (h.ports || [])) {
            const key = `${p.number}/${p.protocol || 'tcp'}`;
            if (!merged.ports.has(key)) merged.ports.set(key, p);
        }
    }
    // Convert port Maps back to arrays sorted by port number
    const result = [];
    for (const [, host] of map) {
        result.push({ ...host, ports: [...host.ports.values()].sort((a, b) => a.number - b.number) });
    }
    return result;
}

function updateNetworkPanelFromSession(data) {
    const scanResults    = data.scan_results    || [];
    const exploitResults = data.exploit_results || [];
    const vulnCount      = (data.vulnerabilities || []).length || data.vulns_found || 0;
    _networkScanResults  = scanResults;
    _networkVulnCount    = vulnCount;

    const allHosts  = _mergeHosts(scanResults.flatMap(r => r.hosts || []));
    const openPorts = allHosts.flatMap(h => h.ports.filter(p => p.state === 'open'));
    const portCount = openPorts.length;

    _topoLastHosts    = allHosts;
    _topoLastExploits = exploitResults;
    if (data.target) _topoCurrentTarget = data.target;

    // Capture diff-based timeline events from newly seen hosts/exploits
    _topoCaptureEvents(allHosts, exploitResults, data);

    setStatValue('network-hosts-count', allHosts.length || '0');
    setStatValue('network-ports-count', portCount        || '0');
    setStatValue('network-vulns-count', vulnCount        || '0');

    // Small sidebar topology (SVG-based, compact)
    renderNetworkTopology(allHosts, exploitResults);

    if (scanResults.length > 0) {
        const dot = document.getElementById('network-status-dot');
        if (dot) { dot.style.backgroundColor = '#ccff00'; dot.style.boxShadow = '0 0 4px #ccff00'; }
        const txt = document.getElementById('network-status-text');
        if (txt) { txt.textContent = 'Scanning'; txt.style.color = '#ccff00'; }
    }

    _updateNetworkExpanded(data, allHosts, portCount, vulnCount, exploitResults);
}

function _updateNetworkExpanded(data, allHosts, portCount, vulnCount, exploitResults) {
    const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setT('network-exp-target',   data.target || data.name || '—');
    setT('network-exp-hosts',    allHosts.length || '0');
    setT('network-exp-ports',    portCount || '0');
    setT('network-exp-vulns',    vulnCount || '0');

    const exploitedCount = new Set((exploitResults || []).filter(e => e.success).map(e => e.host_ip)).size;
    const lateralCount   = (exploitResults || []).filter(e => e.success && e.source_ip && e.source_ip !== e.host_ip).length;
    setT('network-exp-exploited', exploitedCount || '0');
    setT('network-exp-lateral',   lateralCount   || '0');

    // D3 topology render
    _topoD3Render('topo-d3-svg', 'topo-tooltip', allHosts, exploitResults, false);

    _topoUpdateTimeline();
}

function stopNetworkPanel() {
    const dot = document.getElementById('network-status-dot');
    if (dot) { dot.style.backgroundColor = ''; dot.style.boxShadow = ''; }
    const txt = document.getElementById('network-status-text');
    if (txt) { txt.textContent = 'Done'; txt.style.color = ''; }
}

// ── Sidebar mini-topology (compact SVG, unchanged) ────────────────────────────

function renderNetworkTopology(allHosts, exploitResults) {
    const svg = document.getElementById('network-topology-svg');
    if (!svg) return;
    _renderTopologySVG(svg, allHosts, exploitResults);
}

function _renderTopologySVG(svg, allHosts, exploitResults) {
    if (!allHosts || allHosts.length === 0) {
        svg.innerHTML = `
            <text x="110" y="90" text-anchor="middle" fill="#333" font-family="monospace" font-size="9">Waiting for scan results…</text>
            <rect x="83" y="10" width="54" height="26" rx="2" fill="#0c0c00" stroke="#ccff00" stroke-width="1.5"/>
            <text x="110" y="22" text-anchor="middle" fill="#ccff00" font-family="monospace" font-size="6.5" font-weight="bold">AEGIS</text>
            <text x="110" y="32" text-anchor="middle" fill="#778800" font-family="monospace" font-size="5">AGENT</text>`;
        return;
    }
    const exploitedPorts = {};
    (exploitResults || []).forEach(e => {
        if (e.success && e.host_ip) {
            if (!exploitedPorts[e.host_ip]) exploitedPorts[e.host_ip] = new Set();
            exploitedPorts[e.host_ip].add(Number(e.port || e.target_port || 0));
        }
    });
    const CX = 110, CY = 28, R = 62, hostR = 20;
    let inner = `
        <rect x="83" y="10" width="54" height="26" rx="2" fill="#0c0c00" stroke="#ccff00" stroke-width="1.5"/>
        <text x="${CX}" y="22" text-anchor="middle" fill="#ccff00" font-family="monospace" font-size="6.5" font-weight="bold">AEGIS</text>
        <text x="${CX}" y="32" text-anchor="middle" fill="#778800" font-family="monospace" font-size="5">AGENT</text>`;
    const count = Math.min(allHosts.length, 8);
    const startAngle = count === 1 ? Math.PI / 2 : Math.PI * 0.15;
    const endAngle   = count === 1 ? Math.PI / 2 : Math.PI * 0.85;
    for (let i = 0; i < count; i++) {
        const angle = count === 1 ? Math.PI / 2 : startAngle + (endAngle - startAngle) * (i / (count - 1));
        const hx = CX + R * Math.cos(angle);
        const hy = CY + 80 + R * 0.65 * Math.sin(angle);
        const host = allHosts[i];
        const ip   = host.ip || `host${i + 1}`;
        const isExploited  = !!(exploitedPorts[ip]?.size > 0);
        const openPorts    = host.ports.filter(p => p.state === 'open');
        const hasRiskyPort = openPorts.some(p => _HIGH_RISK_PORTS.has(p.number) || _MED_RISK_PORTS.has(p.number));
        const stroke   = isExploited ? '#FF3B3B' : (hasRiskyPort ? '#FF8C00' : '#444444');
        const fill     = isExploited ? '#1a0000' : (hasRiskyPort ? '#1a0a00' : '#111111');
        const txtColor = isExploited ? '#ff6666' : (hasRiskyPort ? '#FF8C00' : '#aaaaaa');
        const lineStroke = isExploited ? '#FF3B3B' : '#333333';
        const lineDash   = isExploited ? 'stroke-dasharray="4,2"' : '';
        const entryPorts = exploitedPorts[ip] ? [...exploitedPorts[ip]].join(',') : '';
        const portDots = openPorts.slice(0, 6).map((p, pi) => {
            const da = (pi - (Math.min(openPorts.length, 6) - 1) / 2) * (Math.PI / 8);
            const px = hx + hostR * 1.35 * Math.cos(-Math.PI / 2 + da);
            const py = hy + hostR * 1.35 * Math.sin(-Math.PI / 2 + da);
            const pc = _portRiskColor(p.number);
            const pw = exploitedPorts[ip]?.has(p.number) ? 2.5 : 1.5;
            return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="#0a0a0a" stroke="${pc}" stroke-width="${pw}"/>
                    <text x="${px.toFixed(1)}" y="${(py + 1.5).toFixed(1)}" text-anchor="middle" fill="${pc}" font-family="monospace" font-size="3.5">${p.number}</text>`;
        }).join('');
        const lastOctet = ip.split('.').pop() || ip;
        inner += `
            <line x1="${CX}" y1="36" x2="${hx.toFixed(1)}" y2="${(hy - hostR).toFixed(1)}"
                  stroke="${lineStroke}" stroke-width="${isExploited ? 1.5 : 0.8}" opacity="${isExploited ? 0.9 : 0.4}" ${lineDash}/>
            ${isExploited ? `<text x="${((CX + hx)/2).toFixed(1)}" y="${((36 + hy - hostR)/2 - 3).toFixed(1)}" text-anchor="middle" fill="#FF3B3B" font-family="monospace" font-size="5">:${entryPorts}</text>` : ''}
            <circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${hostR}"
                    fill="${fill}" stroke="${stroke}" stroke-width="${isExploited ? 2 : 1.2}"/>
            ${isExploited ? `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${hostR + 4}" fill="none" stroke="#FF3B3B" stroke-width="0.5" opacity="0.4" stroke-dasharray="3,3"/>` : ''}
            <text x="${hx.toFixed(1)}" y="${(hy - 5).toFixed(1)}" text-anchor="middle"
                  fill="${txtColor}" font-family="monospace" font-size="7" font-weight="${isExploited ? 'bold' : 'normal'}">.${_esc(lastOctet)}</text>
            <text x="${hx.toFixed(1)}" y="${(hy + 5).toFixed(1)}" text-anchor="middle"
                  fill="${stroke}" font-family="monospace" font-size="5">${isExploited ? 'PWNED' : (openPorts.length + 'pts')}</text>
            ${portDots}`;
    }
    if (allHosts.length > 8) {
        inner += `<text x="${CX}" y="175" text-anchor="middle" fill="#555" font-family="monospace" font-size="6">+${allHosts.length - 8} more hosts</text>`;
    }
    svg.innerHTML = inner;
}

// ── D3 Full-Page Topology Engine ──────────────────────────────────────────────

function _topoD3Init(svgId, tooltipId) {
    if (!window.d3) return null;
    const svgEl = document.getElementById(svgId);
    if (!svgEl) return null;
    const d3 = window.d3;
    const sel = d3.select(svgEl);
    sel.selectAll('*').remove();

    // Arrow markers
    const defs = sel.append('defs');
    const _arrow = (id, color) => defs.append('marker')
        .attr('id', id).attr('viewBox','0 -5 10 10').attr('refX',8).attr('refY',0)
        .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
        .append('path').attr('d','M0,-5L10,0L0,5').attr('fill', color);
    _arrow('topo-arr-exploit', '#FF3B3B');
    _arrow('topo-arr-lateral', '#fb923c');
    _arrow('topo-arr-scan',    '#333');

    const g = sel.append('g').attr('id', `${svgId}-root`);
    g.append('g').attr('class','topo-links');
    g.append('g').attr('class','topo-laterals');
    g.append('g').attr('class','topo-nodes');

    const zoom = d3.zoom().scaleExtent([0.05, 8]).on('zoom', ev => g.attr('transform', ev.transform));
    sel.call(zoom).on('dblclick.zoom', null);

    const state = { zoom, sel, g, svgId, tooltipId, fitted: false };
    _topoD3State[svgId] = state;
    return state;
}

function _topoD3Render(svgId, tooltipId, allHosts, exploitResults, isFullscreen) {
    if (!window.d3) return;
    let state = _topoD3State[svgId];
    if (!state) state = _topoD3Init(svgId, tooltipId);
    if (!state) return;

    const d3      = window.d3;
    const svgEl   = document.getElementById(svgId);
    if (!svgEl) return;

    // Theme palette
    const _tL = document.documentElement.classList.contains('light');
    const _TC = {
        svgBg:       _tL ? '#f4f4f0' : '#030303',
        linkNorm:    _tL ? '#ccc'    : '#222',
        linkExploit: '#FF3B3B',
        nodeNorm:    _tL ? '#ebebea' : '#0f0f0f',
        nodeStroke:  _tL ? '#bbb'    : '#333',
        nodeMed:     _tL ? '#fff4ea' : '#1a0800',
        nodeMedStr:  '#FF8C00',
        nodeExpl:    _tL ? '#fff0f0' : '#1a0000',
        nodeExplStr: '#FF3B3B',
        ipNorm:      _tL ? '#333'    : '#aaa',
        ipMed:       '#FF8C00',
        ipExpl:      '#ff5555',
        statusNorm:  _tL ? '#777'    : '#555',
        statusMed:   '#FF8C00',
        statusExpl:  '#FF3B3B',
        osText:      _tL ? '#999'    : '#555',
        outerNorm:   _tL ? '#ccc'    : '#2a2a2a',
        emptyText1:  _tL ? '#ccc'    : '#1a1a1a',
        emptyText2:  _tL ? '#aaa'    : '#2a2a2a',
        emptyText3:  _tL ? '#bbb'    : '#1a1a1a',
        tooltipBg:   _tL ? '#fff'    : '#0a0a0a',
        tooltipBdr:  _tL ? '#ddd'    : '#222',
        tooltipText: _tL ? '#111'    : '#ccc',
        pdotFill:    _tL ? '#f0f0ee' : '#080808',
    };
    svgEl.style.background = _TC.svgBg;
    // Use real dimensions; fall back to safe defaults when element is hidden
    const realW = svgEl.clientWidth;
    const realH = svgEl.clientHeight;
    const hidden = (realW === 0 || realH === 0);
    const W = hidden ? 900 : realW;
    const H = hidden ? 600 : realH;

    // Empty state: show placeholder when no hosts yet
    const emptyG = state.g.select('.topo-empty');
    if (allHosts.length === 0) {
        if (emptyG.empty()) {
            const eg = state.g.append('g').attr('class', 'topo-empty').attr('transform', `translate(${W/2},${H/2})`);
            eg.append('text').attr('text-anchor','middle').attr('y',-12)
                .attr('fill',_TC.emptyText1).attr('font-family','monospace').attr('font-size', 13).attr('font-weight','bold').text('AEGIS');
            eg.append('text').attr('text-anchor','middle').attr('y',8)
                .attr('fill',_TC.emptyText2).attr('font-family','monospace').attr('font-size', 10).text('Waiting for scan results…');
            eg.append('text').attr('text-anchor','middle').attr('y',26)
                .attr('fill',_TC.emptyText3).attr('font-family','monospace').attr('font-size', 9).text('Start a mission or load a session');
        }
        return;
    }
    state.g.select('.topo-empty').remove();

    // Build exploit map: ip → {ports, modules, sessions, source_ip}
    const xMap = {};
    (exploitResults || []).forEach(e => {
        if (!e.host_ip) return;
        if (!xMap[e.host_ip]) xMap[e.host_ip] = { ports: new Set(), modules: [], sessions: 0, sources: new Set() };
        xMap[e.host_ip].ports.add(Number(e.port || e.target_port || 0));
        if (e.module) xMap[e.host_ip].modules.push(e.module);
        if (e.session_opened || e.session_id) xMap[e.host_ip].sessions++;
        if (e.source_ip) xMap[e.host_ip].sources.add(e.source_ip);
    });

    // Lateral movement edges: {from_ip, to_ip, port, module}
    const laterals = (exploitResults || [])
        .filter(e => e.success && e.source_ip && e.source_ip !== e.host_ip && e.source_ip !== '' && allHosts.find(h => h.ip === e.source_ip))
        .map(e => ({ from_ip: e.source_ip, to_ip: e.host_ip, port: e.port || e.target_port || 0, module: e.module || '' }));

    // Layout: AEGIS center-top, hosts in grid rows
    const AEGIS_X = W / 2, AEGIS_Y = isFullscreen ? 70 : 60;
    const nodeR   = isFullscreen ? 36 : 30;
    const COLS    = allHosts.length <= 3 ? allHosts.length : allHosts.length <= 8 ? 4 : Math.min(6, Math.ceil(Math.sqrt(allHosts.length)));
    const COL_W   = Math.max(nodeR * 4.5, (W - 100) / Math.max(COLS, 1));
    const ROW_H   = nodeR * 5.5;
    const gridW   = COLS * COL_W;
    const gridOffX = (W - gridW) / 2 + COL_W / 2;

    const hostPos = {};
    allHosts.forEach((h, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        hostPos[h.ip] = { x: gridOffX + col * COL_W, y: AEGIS_Y + 100 + row * ROW_H };
    });

    const sel = state.sel;
    const g   = state.g;

    // ── Links: AEGIS → host ───────────────────────────────────────────────────
    const linksG = g.select('.topo-links');
    const linkSel = linksG.selectAll('.topo-link').data(allHosts, d => d.ip);
    linkSel.enter().append('line').attr('class','topo-link')
        .merge(linkSel)
        .attr('x1', AEGIS_X).attr('y1', AEGIS_Y + 20)
        .attr('x2', d => hostPos[d.ip]?.x || 0).attr('y2', d => (hostPos[d.ip]?.y || 0) - nodeR)
        .attr('stroke', d => xMap[d.ip] ? _TC.linkExploit : _TC.linkNorm)
        .attr('stroke-width', d => xMap[d.ip] ? 1.5 : 0.8)
        .attr('stroke-dasharray', d => xMap[d.ip] ? '6,3' : '3,4')
        .attr('opacity', d => xMap[d.ip] ? 0.6 : (_tL ? 0.5 : 0.25))
        .attr('marker-end', d => xMap[d.ip] ? 'url(#topo-arr-exploit)' : 'url(#topo-arr-scan)');
    linkSel.exit().remove();

    // Port label on exploited links
    const portLabelSel = linksG.selectAll('.topo-link-lbl').data(allHosts.filter(h => xMap[h.ip]), d => d.ip);
    portLabelSel.enter().append('text').attr('class','topo-link-lbl')
        .merge(portLabelSel)
        .attr('x', d => (AEGIS_X + (hostPos[d.ip]?.x || 0)) / 2)
        .attr('y', d => (AEGIS_Y + 20 + (hostPos[d.ip]?.y || 0) - nodeR) / 2 - 4)
        .attr('text-anchor','middle').attr('fill','#FF3B3B').attr('font-family','monospace')
        .attr('font-size', isFullscreen ? 9 : 7)
        .text(d => xMap[d.ip] ? `⚡${[...xMap[d.ip].ports].filter(Boolean).join(',')}` : '');
    portLabelSel.exit().remove();

    // ── Lateral movement paths ─────────────────────────────────────────────────
    const latG = g.select('.topo-laterals');
    const latSel = latG.selectAll('.topo-lateral').data(laterals, d => `${d.from_ip}-${d.to_ip}`);
    latSel.enter().append('path').attr('class','topo-lateral')
        .merge(latSel)
        .attr('d', d => {
            const p1 = hostPos[d.from_ip] || { x: AEGIS_X, y: AEGIS_Y };
            const p2 = hostPos[d.to_ip]   || { x: AEGIS_X, y: AEGIS_Y };
            const mx = (p1.x + p2.x) / 2;
            const my = Math.min(p1.y, p2.y) - nodeR * 2.5;
            return `M${p1.x},${p1.y} Q${mx},${my} ${p2.x},${p2.y}`;
        })
        .attr('stroke','#fb923c').attr('stroke-width', isFullscreen ? 2 : 1.5)
        .attr('stroke-dasharray','8,4').attr('fill','none').attr('opacity',0.85)
        .attr('marker-end','url(#topo-arr-lateral)');
    latSel.exit().remove();

    // Lateral port labels
    const latLblSel = latG.selectAll('.topo-lat-lbl').data(laterals, d => `${d.from_ip}-${d.to_ip}`);
    latLblSel.enter().append('text').attr('class','topo-lat-lbl')
        .merge(latLblSel)
        .attr('x', d => {
            const p1 = hostPos[d.from_ip] || { x: AEGIS_X, y: AEGIS_Y };
            const p2 = hostPos[d.to_ip]   || { x: AEGIS_X, y: AEGIS_Y };
            return (p1.x + p2.x) / 2;
        })
        .attr('y', d => {
            const p1 = hostPos[d.from_ip] || { x: AEGIS_X, y: AEGIS_Y };
            const p2 = hostPos[d.to_ip]   || { x: AEGIS_X, y: AEGIS_Y };
            return Math.min(p1.y, p2.y) - nodeR * 2.8;
        })
        .attr('text-anchor','middle').attr('fill','#fb923c').attr('font-family','monospace')
        .attr('font-size', isFullscreen ? 10 : 8)
        .text(d => `LATERAL :${d.port}`);
    latLblSel.exit().remove();

    // ── Host nodes ─────────────────────────────────────────────────────────────
    const nodesG = g.select('.topo-nodes');

    // AEGIS node
    let aegisG = nodesG.select('#topo-aegis');
    if (aegisG.empty()) {
        aegisG = nodesG.append('g').attr('id','topo-aegis');
        aegisG.append('rect').attr('class','topo-aegis-rect')
            .attr('rx',2).attr('fill','#0c0c00').attr('stroke','#ccff00').attr('stroke-width',1.5);
        aegisG.append('text').attr('class','topo-aegis-t1').attr('text-anchor','middle')
            .attr('fill','#ccff00').attr('font-family','monospace').attr('font-weight','bold').text('AEGIS');
        aegisG.append('text').attr('class','topo-aegis-t2').attr('text-anchor','middle')
            .attr('fill','#778800').attr('font-family','monospace').text('AGENT');
        aegisG.append('circle').attr('class','topo-aegis-dot').attr('fill','#ccff00');
    }
    const bw = isFullscreen ? 80 : 64, bh = isFullscreen ? 34 : 28, fs1 = isFullscreen ? 12 : 9, fs2 = isFullscreen ? 9 : 7;
    aegisG.attr('transform',`translate(${AEGIS_X},${AEGIS_Y})`);
    aegisG.select('.topo-aegis-rect').attr('x',-bw/2).attr('y',-bh/2).attr('width',bw).attr('height',bh);
    aegisG.select('.topo-aegis-t1').attr('y',-2).attr('font-size',fs1);
    aegisG.select('.topo-aegis-t2').attr('y',bh/2-4).attr('font-size',fs2);
    aegisG.select('.topo-aegis-dot').attr('cx',bw/2-4).attr('cy',-bh/2+4).attr('r', isFullscreen ? 5 : 4);

    // Host node groups
    const nodeSel = nodesG.selectAll('.topo-host').data(allHosts, d => d.ip);
    const nodeEnter = nodeSel.enter().append('g').attr('class','topo-host')
        .attr('cursor','pointer')
        .on('mouseenter', (ev, d) => _topoShowTooltip(ev, d, xMap, exploitResults, tooltipId))
        .on('mousemove',  (ev)     => _topoMoveTooltip(ev, tooltipId))
        .on('mouseleave', ()       => _topoHideTooltip(tooltipId))
        .on('click',      (ev, d)  => { ev.stopPropagation(); showHostDetailPanel(d, xMap, exploitResults); });

    // Outer glow ring
    nodeEnter.append('circle').attr('class','topo-outer');
    // Main circle
    nodeEnter.append('circle').attr('class','topo-circle');
    // IP text
    nodeEnter.append('text').attr('class','topo-ip').attr('text-anchor','middle').attr('font-family','monospace').attr('font-weight','bold');
    // Status text
    nodeEnter.append('text').attr('class','topo-status').attr('text-anchor','middle').attr('font-family','monospace');
    // OS text
    nodeEnter.append('text').attr('class','topo-os').attr('text-anchor','middle').attr('font-family','monospace');
    // Port dots group
    nodeEnter.append('g').attr('class','topo-pdots');

    const allNodeSel = nodeEnter.merge(nodeSel);
    allNodeSel.attr('transform', d => {
        const p = hostPos[d.ip] || { x: W/2, y: H/2 };
        return `translate(${p.x},${p.y})`;
    });

    allNodeSel.select('.topo-outer')
        .attr('r', nodeR + 6)
        .attr('fill','none')
        .attr('stroke', d => xMap[d.ip] ? _TC.nodeExplStr : (d.ports.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number)) ? _TC.nodeMedStr : _TC.outerNorm))
        .attr('stroke-width', d => xMap[d.ip] ? 1.5 : 1)
        .attr('stroke-dasharray', d => xMap[d.ip] ? null : '3,3')
        .attr('opacity', 0.6);

    allNodeSel.select('.topo-circle')
        .attr('r', nodeR)
        .attr('fill', d => xMap[d.ip] ? _TC.nodeExpl : (d.ports.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number)) ? _TC.nodeMed : _TC.nodeNorm))
        .attr('stroke', d => xMap[d.ip] ? _TC.nodeExplStr : (d.ports.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number)) ? _TC.nodeMedStr : _TC.nodeStroke))
        .attr('stroke-width', d => xMap[d.ip] ? 2.5 : 1.5);

    allNodeSel.select('.topo-ip')
        .attr('y', d => xMap[d.ip] ? -5 : -4)
        .attr('font-size', isFullscreen ? 13 : 11)
        .attr('fill', d => xMap[d.ip] ? _TC.ipExpl : (d.ports.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number)) ? _TC.ipMed : _TC.ipNorm))
        .text(d => `.${(d.ip || '').split('.').pop()}`);

    allNodeSel.select('.topo-status')
        .attr('y', d => xMap[d.ip] ? nodeR - 8 : nodeR - 8)
        .attr('font-size', isFullscreen ? 8 : 7)
        .attr('fill', d => xMap[d.ip] ? _TC.statusExpl : (d.ports.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number)) ? _TC.statusMed : _TC.statusNorm))
        .text(d => xMap[d.ip] ? 'PWNED' : (d.ports.filter(p => p.state === 'open').length + ' ports'));

    allNodeSel.select('.topo-os')
        .attr('y', d => xMap[d.ip] ? 7 : 6)
        .attr('font-size', isFullscreen ? 8 : 7)
        .attr('fill', _TC.osText)
        .text(d => (d.os || '').split(' ').slice(0,2).join(' ').slice(0,12) || '');

    // Port dots around each host
    allNodeSel.each(function(d) {
        const openPorts = d.ports.filter(p => p.state === 'open').slice(0, 8);
        const pdG = d3.select(this).select('.topo-pdots');
        const dotR = nodeR * 1.45;
        const pdSel = pdG.selectAll('.pdot').data(openPorts, p => p.number);
        pdSel.enter().append('circle').attr('class','pdot')
            .merge(pdSel)
            .attr('r', isFullscreen ? 5 : 4)
            .attr('cx', (p, pi) => { const n = openPorts.length; const a = -Math.PI/2 + (pi/(Math.max(n-1,1))) * Math.PI; return dotR * Math.cos(a); })
            .attr('cy', (p, pi) => { const n = openPorts.length; const a = -Math.PI/2 + (pi/(Math.max(n-1,1))) * Math.PI; return dotR * Math.sin(a); })
            .attr('fill', _TC.pdotFill)
            .attr('stroke', p => _portRiskColor(p.number))
            .attr('stroke-width', p => xMap[d.ip]?.ports.has(p.number) ? 2.5 : 1.5);
        pdSel.exit().remove();

        // Port number labels (fullscreen only)
        if (isFullscreen) {
            const plSel = pdG.selectAll('.plbl').data(openPorts, p => p.number);
            plSel.enter().append('text').attr('class','plbl')
                .merge(plSel)
                .attr('x', (p, pi) => { const n = openPorts.length; const a = -Math.PI/2 + (pi/(Math.max(n-1,1))) * Math.PI; return (dotR+14) * Math.cos(a); })
                .attr('y', (p, pi) => { const n = openPorts.length; const a = -Math.PI/2 + (pi/(Math.max(n-1,1))) * Math.PI; return (dotR+14) * Math.sin(a) + 3; })
                .attr('text-anchor','middle').attr('fill', p => _portRiskColor(p.number))
                .attr('font-family','monospace').attr('font-size', 8)
                .text(p => p.number);
            plSel.exit().remove();
        }
    });

    nodeSel.exit().remove();

    // Click on SVG background closes detail panel
    sel.on('click', () => hideHostDetailPanel());

    // Auto-fit: only mark as fitted when the SVG is actually visible (has real dimensions)
    if (!state.fitted && allHosts.length > 0 && !hidden) {
        state.fitted = true;
        setTimeout(() => _topoFitView(isFullscreen, svgId), 100);
    }
}

function _topoFitView(isFullscreen, svgId) {
    if (!window.d3) return;
    const sid = svgId || (isFullscreen ? 'topo-fs-svg' : 'topo-d3-svg');
    const state = _topoD3State[sid];
    if (!state) return;
    const svgEl = document.getElementById(sid);
    const rootEl = document.getElementById(`${sid}-root`);
    if (!svgEl || !rootEl) return;
    const svgR  = svgEl.getBoundingClientRect();
    const gR    = rootEl.getBoundingClientRect();
    if (!svgR.width || !gR.width) return;
    const scale = Math.min(svgR.width / (gR.width + 80), svgR.height / (gR.height + 80), 1.2);
    const tx    = (svgR.width  - gR.width  * scale) / 2 - (gR.left  - svgR.left)  * scale;
    const ty    = (svgR.height - gR.height * scale) / 2 - (gR.top   - svgR.top)   * scale;
    state.sel.transition().duration(400)
        .call(state.zoom.transform, window.d3.zoomIdentity.translate(tx, ty).scale(scale));
}

// ── Hover Tooltip ─────────────────────────────────────────────────────────────

function _topoShowTooltip(ev, host, xMap, exploitResults, tooltipId) {
    const tip = document.getElementById(tooltipId || 'topo-tooltip');
    if (!tip) return;
    const _tL = document.documentElement.classList.contains('light');
    const tipBg   = _tL ? '#fff'  : '#0a0a0a';
    const tipBdr  = _tL ? '#ddd'  : '#222';
    const tipText = _tL ? '#333'  : '#ccc';
    const subText = _tL ? '#888'  : '#555';
    const muted   = _tL ? '#bbb'  : '#444';
    const divBdr  = _tL ? '#eee'  : '#1a1a1a';
    tip.style.background = tipBg;
    tip.style.border = `1px solid ${tipBdr}`;
    tip.style.color = tipText;

    const ex       = xMap[host.ip];
    const openPorts = host.ports.filter(p => p.state === 'open');
    const isEx     = !!ex;
    const statusColor = isEx ? '#FF3B3B' : (openPorts.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number)) ? '#FF8C00' : '#ccff00');
    const statusText  = isEx ? 'EXPLOITED' : (openPorts.length > 0 ? 'SCANNED' : 'UP');

    const portRows = openPorts.slice(0, 8).map(p => {
        const c = _portRiskColor(p.number);
        const isExp = ex?.ports.has(p.number);
        return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
            <span style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0"></span>
            <span style="color:${isExp ? '#FF3B3B' : c};font-weight:${isExp ? 'bold' : 'normal'}">${p.number}</span>
            <span style="color:${subText}">/${p.protocol || 'tcp'}</span>
            <span style="color:${subText}">${_esc(p.service || '')}</span>
            ${isExp ? '<span style="color:#FF3B3B;margin-left:auto">⚡</span>' : ''}
        </div>`;
    }).join('');

    const moduleList = ex ? [...new Set(ex.modules)].slice(0, 3).map(m => `<div style="color:#FF3B3B;padding:1px 0;">↳ ${_esc(m)}</div>`).join('') : '';
    const lateralSrc = (exploitResults || []).filter(e => e.host_ip === host.ip && e.source_ip).map(e => e.source_ip);
    const lateralTgt = (exploitResults || []).filter(e => e.source_ip === host.ip).map(e => e.host_ip);

    tip.innerHTML = `
        <div style="color:${statusColor};font-weight:bold;font-size:11px;margin-bottom:6px;border-bottom:1px solid ${divBdr};padding-bottom:5px;">
            ${_esc(host.ip)} ${host.hostname ? `<span style="color:${subText};font-weight:normal">(${_esc(host.hostname)})</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
            <span style="width:6px;height:6px;border-radius:50%;background:${statusColor}"></span>
            <span style="color:${statusColor}">${statusText}</span>
            ${host.os ? `<span style="color:${subText};margin-left:auto">${_esc(host.os.slice(0,24))}</span>` : ''}
        </div>
        ${openPorts.length > 0 ? `<div style="color:${muted};margin-bottom:3px;font-size:9px;text-transform:uppercase;letter-spacing:1px">Open Ports (${openPorts.length})</div>${portRows}` : ''}
        ${ex ? `<div style="color:${muted};margin-top:6px;margin-bottom:3px;font-size:9px;text-transform:uppercase;letter-spacing:1px">Modules</div>${moduleList}` : ''}
        ${lateralSrc.length ? `<div style="color:#fb923c;margin-top:5px;font-size:9px">← Pivot from: ${lateralSrc.join(', ')}</div>` : ''}
        ${lateralTgt.length ? `<div style="color:#fb923c;font-size:9px">→ Moved to: ${lateralTgt.join(', ')}</div>` : ''}
    `;
    tip.classList.remove('hidden');
    _topoMoveTooltip(ev, tooltipId);
}

function _topoMoveTooltip(ev, tooltipId) {
    const tip = document.getElementById(tooltipId || 'topo-tooltip');
    if (!tip || tip.classList.contains('hidden')) return;
    const container = tip.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    let x = ev.clientX - rect.left + 14;
    let y = ev.clientY - rect.top  - 10;
    if (x + 300 > container.clientWidth)  x = ev.clientX - rect.left - 300;
    if (y + 200 > container.clientHeight) y = ev.clientY - rect.top  - 200;
    tip.style.left = `${Math.max(0, x)}px`;
    tip.style.top  = `${Math.max(0, y)}px`;
}

function _topoHideTooltip(tooltipId) {
    const tip = document.getElementById(tooltipId || 'topo-tooltip');
    if (tip) tip.classList.add('hidden');
}

// ── Host Detail Panel ─────────────────────────────────────────────────────────

function showHostDetailPanel(host, xMap, exploitResults) {
    const panel   = document.getElementById('topo-detail-panel');
    const content = document.getElementById('topo-detail-content');
    const ipEl    = document.getElementById('topo-detail-ip');
    const dotEl   = document.getElementById('topo-detail-status-dot');
    if (!panel || !content) return;

    const ex = xMap[host.ip];
    const isEx = !!ex;
    const openPorts = host.ports.filter(p => p.state === 'open');
    const hasRisk   = openPorts.some(p => _MED_RISK_PORTS.has(p.number) || _HIGH_RISK_PORTS.has(p.number));
    const dotColor  = isEx ? '#FF3B3B' : (hasRisk ? '#FF8C00' : '#ccff00');

    if (ipEl) ipEl.textContent = host.ip || '—';
    if (dotEl) dotEl.style.background = dotColor;

    // All exploit results for this host
    const hostExploits = (exploitResults || []).filter(e => e.host_ip === host.ip);
    const lateralIn    = hostExploits.filter(e => e.source_ip && e.source_ip !== host.ip);
    const lateralOut   = (exploitResults || []).filter(e => e.source_ip === host.ip && e.host_ip !== host.ip);

    const badge = (text, color) =>
        `<span style="font-size:7px;color:${color};border:1px solid ${color}33;padding:1px 5px;background:${color}10">${text}</span>`;

    const statusBadge = isEx ? badge('PWNED', '#FF3B3B') : (hasRisk ? badge('VULNERABLE', '#FF8C00') : badge('UP', '#ccff00'));

    content.innerHTML = `
        <!-- Info card -->
        <div style="border:1px solid #1a1a1a;padding:10px;background:#0a0a0a">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;font-family:monospace">Host Info</span>
                ${statusBadge}
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;font-family:monospace;font-size:10px;">
                <div style="display:flex;gap:8px"><span style="color:#555;width:60px">IP</span><span style="color:#aaa">${_esc(host.ip || '—')}</span></div>
                ${host.hostname ? `<div style="display:flex;gap:8px"><span style="color:#555;width:60px">Host</span><span style="color:#aaa">${_esc(host.hostname)}</span></div>` : ''}
                ${host.os ? `<div style="display:flex;gap:8px"><span style="color:#555;width:60px">OS</span><span style="color:#aaa">${_esc(host.os.slice(0,32))}</span></div>` : ''}
                <div style="display:flex;gap:8px"><span style="color:#555;width:60px">Ports</span><span style="color:#ccff00">${openPorts.length} open</span></div>
                ${isEx ? `<div style="display:flex;gap:8px"><span style="color:#555;width:60px">Sessions</span><span style="color:#FF3B3B">${ex.sessions} active</span></div>` : ''}
            </div>
        </div>

        <!-- Open ports -->
        <div style="border:1px solid #1a1a1a;padding:10px;background:#0a0a0a">
            <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;font-family:monospace;margin-bottom:8px">
                Open Ports (${openPorts.length})
            </div>
            ${openPorts.length === 0 ? '<div style="color:#333;font-family:monospace;font-size:10px">No open ports</div>' :
                openPorts.map(p => {
                    const c   = _portRiskColor(p.number);
                    const lbl = _portRiskLabel(p.number);
                    const isExp = ex?.ports.has(p.number);
                    return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #111;font-family:monospace;font-size:10px;">
                        <span style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0"></span>
                        <span style="color:${c};font-weight:bold;width:40px">${p.number}</span>
                        <span style="color:#555;width:28px">/${p.protocol || 'tcp'}</span>
                        <span style="color:#888;flex:1">${_esc(p.service || '—')}</span>
                        <span style="color:${c};font-size:8px">${lbl}</span>
                        ${isExp ? '<span style="color:#FF3B3B;font-size:9px">⚡</span>' : ''}
                    </div>`;
                }).join('')
            }
        </div>

        <!-- Exploit attempts -->
        ${hostExploits.length > 0 ? `
        <div style="border:1px solid #1a1a1a;padding:10px;background:#0a0a0a">
            <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:1px;font-family:monospace;margin-bottom:8px">
                Exploit Attempts (${hostExploits.length})
            </div>
            ${hostExploits.map(e => `
                <div style="padding:5px 0;border-bottom:1px solid #0f0f0f;font-family:monospace;font-size:9px">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                        <span style="color:${e.success ? '#FF3B3B' : '#444'}">●</span>
                        <span style="color:${e.success ? '#FF3B3B' : '#555'};font-weight:${e.success ? 'bold' : 'normal'}">${_esc(e.module || '—')}</span>
                        <span style="margin-left:auto;color:${e.success ? '#FF3B3B' : '#333'}">${e.success ? '✓ SUCCESS' : '✗ FAIL'}</span>
                    </div>
                    <div style="color:#555;padding-left:14px">port ${e.port || e.target_port || '?'} ${e.payload ? '· ' + _esc(e.payload.split('/').pop() || '') : ''}</div>
                    ${e.source_ip ? `<div style="color:#fb923c;padding-left:14px">← via ${_esc(e.source_ip)}</div>` : ''}
                </div>
            `).join('')}
        </div>` : ''}

        <!-- Lateral movement -->
        ${(lateralIn.length > 0 || lateralOut.length > 0) ? `
        <div style="border:1px solid #fb923c33;padding:10px;background:#0a0500">
            <div style="font-size:9px;color:#fb923c;text-transform:uppercase;letter-spacing:1px;font-family:monospace;margin-bottom:8px">
                Lateral Movement
            </div>
            ${lateralIn.map(e => `
                <div style="font-family:monospace;font-size:9px;color:#fb923c;padding:2px 0">
                    ← Pivot IN from ${_esc(e.source_ip)} via port ${e.port || '?'} (${_esc(e.module || '—')})
                </div>`).join('')}
            ${lateralOut.map(e => `
                <div style="font-family:monospace;font-size:9px;color:#fb923c;padding:2px 0">
                    → Pivot OUT to ${_esc(e.host_ip)} via port ${e.port || '?'} (${_esc(e.module || '—')})
                </div>`).join('')}
        </div>` : ''}
    `;

    panel.classList.remove('hidden');
    panel.style.display = 'flex';
}

function hideHostDetailPanel() {
    const panel = document.getElementById('topo-detail-panel');
    if (panel) { panel.classList.add('hidden'); panel.style.display = ''; }
}

// ── Timeline Engine ───────────────────────────────────────────────────────────

const _TOPO_EVENT_COLORS = {
    host_discovered: '#60a5fa',
    port_scan:       '#ccff00',
    vuln_found:      '#f97316',
    exploit_attempt: '#cc2222',
    exploit_success: '#FF3B3B',
    lateral_move:    '#fb923c',
    privesc:         '#a855f7',
    phase_change:    '#555555',
};

function _topoCaptureEvents(allHosts, exploitResults, data) {
    const now = Date.now();
    // Detect new hosts
    allHosts.forEach(h => {
        if (!_topoPrevHostIPs.has(h.ip)) {
            _topoPrevHostIPs.add(h.ip);
            _topoEvents.push({ ts: now, type: 'host_discovered', ip: h.ip, label: `Discovered ${h.ip}` });
            if (h.ports.filter(p => p.state === 'open').length > 0) {
                _topoEvents.push({ ts: now + 1, type: 'port_scan', ip: h.ip, label: `Port scan ${h.ip}` });
            }
        }
    });
    // Detect new successful exploits
    (exploitResults || []).forEach(e => {
        if (!e.host_ip) return;
        const key = `${e.host_ip}:${e.port || 0}:${e.module}`;
        if (!_topoPrevExploitIPs.has(key)) {
            _topoPrevExploitIPs.add(key);
            const isLateral = e.source_ip && e.source_ip !== e.host_ip;
            _topoEvents.push({
                ts:    now + 2,
                type:  e.success ? (isLateral ? 'lateral_move' : 'exploit_success') : 'exploit_attempt',
                ip:    e.host_ip,
                label: e.success ? `Exploit ${e.host_ip}:${e.port || '?'}` : `Attempt ${e.host_ip}:${e.port || '?'}`,
            });
        }
    });
    _topoUpdateTimeline();
}

function _topoReconstructEvents(allHosts, exploitResults) {
    // Reconstruct a synthetic timeline for historical data load
    _topoEvents = [];
    _topoPrevHostIPs    = new Set();
    _topoPrevExploitIPs = new Set();
    const now = Date.now();
    const step = 5000;
    allHosts.forEach((h, i) => {
        _topoPrevHostIPs.add(h.ip);
        _topoEvents.push({ ts: now - (allHosts.length - i) * step * 3, type: 'host_discovered', ip: h.ip, label: `Discovered ${h.ip}` });
        if (h.ports.filter(p => p.state === 'open').length > 0) {
            _topoEvents.push({ ts: now - (allHosts.length - i) * step * 3 + step, type: 'port_scan', ip: h.ip, label: `Scan ${h.ip}` });
        }
    });
    (exploitResults || []).forEach((e, i) => {
        if (!e.host_ip) return;
        const key = `${e.host_ip}:${e.port || 0}:${e.module}`;
        _topoPrevExploitIPs.add(key);
        const isLateral = e.source_ip && e.source_ip !== e.host_ip;
        _topoEvents.push({
            ts:    now - step * (exploitResults.length - i),
            type:  e.success ? (isLateral ? 'lateral_move' : 'exploit_success') : 'exploit_attempt',
            ip:    e.host_ip,
            label: e.success ? `Exploit ${e.host_ip}:${e.port || '?'}` : `Attempt ${e.host_ip}:${e.port || '?'}`,
        });
    });
    _topoEvents.sort((a, b) => a.ts - b.ts);
}

function _topoUpdateTimeline() {
    const track = document.getElementById('topo-timeline-track');
    const evContainer = document.getElementById('topo-timeline-events');
    const cursor = document.getElementById('topo-timeline-cursor');
    if (!track || !evContainer) return;

    if (_topoEvents.length === 0) {
        evContainer.innerHTML = '';
        if (cursor) cursor.style.left = '0%';
        _topoSetTimeDisplay();
        return;
    }

    const minTs = _topoEvents[0].ts;
    const maxTs = _topoEvents[_topoEvents.length - 1].ts;
    const span  = Math.max(maxTs - minTs, 1);

    // Render event dots
    evContainer.innerHTML = _topoEvents.map(ev => {
        const pct = ((ev.ts - minTs) / span) * 100;
        const col = _TOPO_EVENT_COLORS[ev.type] || '#555';
        return `<div title="${_esc(ev.label || ev.type)}" style="position:absolute;left:${pct.toFixed(2)}%;top:50%;transform:translate(-50%,-50%);width:8px;height:8px;border-radius:50%;background:${col};cursor:pointer;border:1px solid #000" onclick="seekTopoTimelinePct(${pct})"></div>`;
    }).join('');

    // Update cursor position
    if (cursor) cursor.style.left = `${(_topoTimelinePos * 100).toFixed(2)}%`;
    _topoSetTimeDisplay();
}

function _topoSetTimeDisplay() {
    const el = document.getElementById('topo-time-display');
    if (!el) return;
    if (_topoEvents.length === 0) { el.textContent = '— / —'; return; }
    const minTs = _topoEvents[0].ts;
    const maxTs = _topoEvents[_topoEvents.length - 1].ts;
    const curTs = minTs + (maxTs - minTs) * _topoTimelinePos;
    const fmt = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
    el.textContent = `${fmt(curTs - minTs)} / ${fmt(maxTs - minTs)}`;
}

function seekTopoTimeline(ev) {
    const track = document.getElementById('topo-timeline-track');
    if (!track || _topoEvents.length === 0) return;
    const rect = track.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    seekTopoTimelinePct(pct * 100);
}

function seekTopoTimelinePct(pct) {
    _topoTimelinePos = Math.max(0, Math.min(1, pct / 100));
    _topoUpdateTimeline();
    _topoApplyTimelineFilter();
}

function _topoApplyTimelineFilter() {
    // Filter topology to show state at current timeline position
    if (_topoEvents.length === 0 || _topoTimelinePos >= 0.999) {
        _topoD3Render('topo-d3-svg', 'topo-tooltip', _topoLastHosts, _topoLastExploits, false);
        return;
    }
    const minTs = _topoEvents[0].ts;
    const maxTs = _topoEvents[_topoEvents.length - 1].ts;
    const cutTs = minTs + (maxTs - minTs) * _topoTimelinePos;
    const eventsUpTo = _topoEvents.filter(e => e.ts <= cutTs);
    const visibleIPs = new Set(eventsUpTo.filter(e => e.type === 'host_discovered' || e.type === 'port_scan').map(e => e.ip));
    const visibleHosts    = _topoLastHosts.filter(h => visibleIPs.has(h.ip));
    const exploitedUpTo   = eventsUpTo.filter(e => e.type === 'exploit_success' || e.type === 'lateral_move').map(e => e.ip);
    const visibleExploits = _topoLastExploits.filter(e => exploitedUpTo.includes(e.host_ip));
    _topoD3Render('topo-d3-svg', 'topo-tooltip', visibleHosts, visibleExploits, false);
}

function toggleTopoPlay() {
    if (_topoPlaying) { _topoStopPlay(); } else { _topoStartPlay(); }
}

function _topoStartPlay() {
    if (_topoEvents.length === 0) return;
    _topoPlaying = true;
    _topoLastAnimTs = null;
    if (_topoTimelinePos >= 0.999) _topoTimelinePos = 0;
    const icon = document.getElementById('topo-play-icon');
    if (icon) icon.textContent = 'pause';
    _topoAnimFrame = requestAnimationFrame(_topoAnimStep);
}

function _topoStopPlay() {
    _topoPlaying = false;
    if (_topoAnimFrame) { cancelAnimationFrame(_topoAnimFrame); _topoAnimFrame = null; }
    const icon = document.getElementById('topo-play-icon');
    if (icon) icon.textContent = 'play_arrow';
}

function _topoAnimStep(ts) {
    if (!_topoPlaying) return;
    if (_topoLastAnimTs !== null) {
        const elapsed = (ts - _topoLastAnimTs) / 1000;  // seconds
        const span    = Math.max(_topoEvents[_topoEvents.length - 1].ts - _topoEvents[0].ts, 1);
        const realSpan = span / 1000;  // seconds of real time to cover
        const minPlaytime = 10;       // always take at least 10s to play full timeline
        const playSpan = Math.max(realSpan / _topoSpeed, minPlaytime);
        _topoTimelinePos = Math.min(1, _topoTimelinePos + elapsed / playSpan);
        _topoUpdateTimeline();
        _topoApplyTimelineFilter();
        if (_topoTimelinePos >= 1) { _topoStopPlay(); return; }
    }
    _topoLastAnimTs = ts;
    _topoAnimFrame = requestAnimationFrame(_topoAnimStep);
}

function resetTopoTimeline() {
    _topoStopPlay();
    _topoTimelinePos = 0;
    _topoUpdateTimeline();
    _topoD3Render('topo-d3-svg', 'topo-tooltip', _topoLastHosts, _topoLastExploits, false);
}

function cycleTopoSpeed() {
    const speeds = [1, 2, 4, 0.5];
    const idx = speeds.indexOf(_topoSpeed);
    _topoSpeed = speeds[(idx + 1) % speeds.length];
    const btn = document.getElementById('topo-speed-btn');
    if (btn) btn.textContent = `${_topoSpeed}x`;
}

// ─── Phase progress bar ───────────────────────────────────────────────────────

const PHASE_NAMES = {
    1: 'DISCOVERY',
    2: 'PORT_SCAN',
    3: 'EXPLOIT_SEARCH',
    4: 'EXPLOITATION',
    5: 'REPORT',
};

function setPhaseActive(phaseNum) {
    document.querySelectorAll('.phase-step').forEach(step => {
        const n = parseInt(step.dataset.phase, 10);
        const dot = step.querySelector('div');
        const label = step.querySelector('span');
        if (n < phaseNum) {
            // Completed
            if (dot) { dot.style.borderColor = '#ccff00'; dot.style.backgroundColor = '#ccff00'; }
            if (label) label.style.color = '#ccff00';
        } else if (n === phaseNum) {
            // Active
            if (dot) { dot.style.borderColor = '#ccff00'; dot.style.backgroundColor = 'transparent'; }
            if (label) label.style.color = '#ccff00';
        } else {
            // Pending
            if (dot) { dot.style.borderColor = ''; dot.style.backgroundColor = ''; }
            if (label) label.style.color = '';
        }
    });
}

function resetPhaseBar() {
    document.querySelectorAll('.phase-step').forEach(step => {
        const dot = step.querySelector('div');
        const label = step.querySelector('span');
        if (dot) { dot.style.borderColor = ''; dot.style.backgroundColor = ''; }
        if (label) label.style.color = '';
    });
}

function updatePhaseFromEvent(data) {
    const phase = data.attack_phase || data.phase || '';
    const phaseMap = {
        'DISCOVERY': 1, 'PORT_SCAN': 2, 'EXPLOIT_SEARCH': 3,
        'EXPLOITATION': 4, 'POST_EXPLOIT': 4, 'DONE': 5,
    };
    const n = phaseMap[phase.toUpperCase()];
    if (n) _setPhaseFromEvent(n);
}

let _currentPhase = 0;  // tracked locally; only terminal states force override

function updatePhaseFromSessionStatus(status) {
    // Never reset phase backwards during a running session —
    // WebSocket phase_change events are the authoritative source.
    if (status === 'done') setPhaseActive(5);
    else if (status === 'error' || status === 'stopped') { /* keep last phase */ }
    // 'running' → do nothing here; phase_change WS events update the bar
}

function _setPhaseFromEvent(n) {
    if (n > _currentPhase) {
        _currentPhase = n;
        setPhaseActive(n);
    }
}

// ─── Mission status header ─────────────────────────────────────────────────────

let _currentMissionName = '';

function updateMissionStatusHeader(status, sessionId, missionName) {
    const dot = document.getElementById('mission-status-dot');
    const text = document.getElementById('mission-status-text');
    if (missionName !== undefined) _currentMissionName = missionName;
    const label = _currentMissionName || (sessionId ? sessionId.slice(0, 8) : '');

    const statusMap = {
        running: { color: 'bg-primary', label: `${label} · ACTIVE` },
        done:    { color: 'bg-primary', label: `${label} · DONE` },
        stopped: { color: 'bg-danger',  label: `${label} · STOPPED` },
        error:   { color: 'bg-danger',  label: `${label} · ERROR` },
        idle:    { color: 'bg-border-color', label: 'No Mission' },
    };

    const s = statusMap[status] || statusMap.idle;
    if (dot) {
        dot.className = `w-2 h-2 rounded-full shrink-0 transition-colors ${s.color}`;
    }
    if (text) text.textContent = s.label;
}

// ─── Console output helpers ───────────────────────────────────────────────────

function clearConsoleOutput() {
    ['console-bash', 'console-nmap', 'console-msf'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        // Restore empty state placeholder
        const emptyId = id + '-empty';
        const empty = document.createElement('div');
        empty.id = emptyId;
        empty.className = 'flex flex-col items-center justify-center h-full gap-3 text-secondary-text select-none';
        const labels = {
            'console-bash': ['terminal', 'No active session \u2014 start a mission to see live output'],
            'console-nmap': ['search', 'No nmap results yet'],
            'console-msf':  ['bolt', 'No Metasploit activity yet'],
        };
        const [icon, label] = labels[id];
        empty.innerHTML = `<span class="material-symbols-outlined text-3xl opacity-40">${icon}</span>
<span class="text-[11px] tracking-widest uppercase opacity-60">${label}</span>`;
        el.appendChild(empty);
    });
}

// Remove empty-state placeholder for a panel on first write
function _consoleEnsureActive(panelId) {
    const emptyEl = document.getElementById(panelId + '-empty');
    if (emptyEl) emptyEl.remove();
}

function _consoleAppend(panelId, text, colorClass = 'text-primary') {
    const el = document.getElementById(panelId);
    if (!el) return;
    _consoleEnsureActive(panelId);
    const line = document.createElement('div');
    line.className = colorClass;
    line.textContent = text;
    el.appendChild(line);
    el.scrollTop = el.scrollHeight;
}

function appendConsoleLine(text, colorClass = 'text-primary') {
    _consoleAppend('console-bash', text, colorClass);
}

function appendConsoleToolCall(data) {
    const tool = data.tool || data.tool_name || data.action || '';
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] TOOL_CALL: ${tool}`;
    _consoleAppend('console-bash', line, 'text-slate-300');
    if (data.params) {
        _consoleAppend('console-bash', `         params: ${JSON.stringify(data.params)}`, 'text-secondary-text');
    }

    // Mirror to specialist tabs
    const isNmap = tool === 'nmap_scan';
    const isMsf  = tool === 'metasploit_run' || tool === 'metasploit_search';
    if (isNmap || isMsf) {
        const tabId = isNmap ? 'console-nmap' : 'console-msf';
        _consoleAppend(tabId, line, 'text-slate-300');
        if (data.params) {
            _consoleAppend(tabId, `         params: ${JSON.stringify(data.params)}`, 'text-secondary-text');
        }
    }
}

function appendConsoleToolResult(data) {
    const tool = data.tool || data.tool_name || data.action || '';
    const success = data.success !== false;
    const color = success ? 'text-primary' : 'text-danger';
    const resultLine = `         result: ${success ? 'OK' : 'FAILED'}`;
    _consoleAppend('console-bash', resultLine, color);

    let outputPreview = '';
    if (data.output) {
        outputPreview = data.output.slice(0, 400).replace(/\n/g, '\n         ');
        _consoleAppend('console-bash', `         output: ${outputPreview}${data.output.length > 400 ? '\u2026' : ''}`, 'text-secondary-text');
    }

    // Mirror output to specialist tabs
    const isNmap = tool === 'nmap_scan';
    const isMsf  = tool === 'metasploit_run' || tool === 'metasploit_search';
    if (isNmap || isMsf) {
        const tabId = isNmap ? 'console-nmap' : 'console-msf';
        _consoleAppend(tabId, resultLine, color);
        if (data.output) {
            // Show full output in the specialist tab (up to 2000 chars)
            const lines = data.output.slice(0, 2000).split('\n');
            lines.forEach(l => _consoleAppend(tabId, l, 'text-secondary-text'));
            if (data.output.length > 2000) _consoleAppend(tabId, '\u2026 (truncated)', 'text-secondary-text');
        }
    }
}

// ─── Agent view live mission feed ─────────────────────────────────────────────

let _missionIteration = 0;
let _toolBatch       = null;  // current open tool-batch container
let _toolBatchUid    = 0;     // ever-incrementing item uid
const _toolDetailStore = new Map(); // storeId → raw data object (avoids HTML-encoding issues)
let _toolDetailStoreId = 0;

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Tool detail modal ────────────────────────────────────────────────────────

function showToolDetail(btn) {
    const card = btn.closest('[data-tool-id]');
    if (!card) return;
    const sid   = parseInt(card.getAttribute('data-tool-id'), 10);
    const title = card.getAttribute('data-tool-title') || 'Details';
    const data  = _toolDetailStore.get(sid);
    const titleEl   = document.getElementById('tool-detail-title');
    const contentEl = document.getElementById('tool-detail-content');
    const modal     = document.getElementById('tool-detail-modal');
    if (!modal || !contentEl) return;
    if (titleEl) titleEl.textContent = title;
    contentEl.textContent = data !== undefined ? JSON.stringify(data, null, 2) : '(no data)';
    modal.classList.remove('hidden');
}

function toggleThinkExpand(btn) {
    const card   = btn.closest('.think-card');
    const expand = card ? card.querySelector('.think-expand') : null;
    if (!expand) return;
    const ic = btn.querySelector('.material-symbols-outlined');
    const isOpen = expand.style.maxHeight !== '0px' && expand.style.maxHeight !== '' && expand.style.maxHeight !== null;
    if (isOpen && expand.style.maxHeight !== 'none') {
        _collapseEl(expand);
        if (ic) ic.textContent = 'expand_more';
    } else if (expand.style.maxHeight === '0px' || expand.style.maxHeight === '') {
        _expandEl(expand);
        if (ic) ic.textContent = 'expand_less';
    } else {
        // 'none' → collapse
        _collapseEl(expand);
        if (ic) ic.textContent = 'expand_more';
    }
}

function closeToolDetailModal() {
    const modal = document.getElementById('tool-detail-modal');
    if (modal) modal.classList.add('hidden');
}

// Render tool params as key-value rows (no raw JSON)
function _renderToolParams(params) {
    if (!params || typeof params !== 'object') return '';
    const entries = Object.entries(params);
    if (entries.length === 0) return `<span class="text-secondary-text/40 text-[11px]">no params</span>`;
    return entries.map(([k, v]) => {
        const val = typeof v === 'string' ? v : JSON.stringify(v);
        return `<div class="flex gap-2 min-w-0 mb-0.5">
            <span class="text-blue-400/70 shrink-0 text-[11px] font-bold">${_esc(k)}</span>
            <span class="text-secondary-text text-[11px] break-all">${_esc(val)}</span>
        </div>`;
    }).join('');
}

// ─── Tool Batch Grouping ──────────────────────────────────────────────────────

function _getToolStyle(toolName) {
    const n = (toolName || '').toLowerCase();
    if (n.includes('nmap'))                          return { icon:'wifi_find',     label:'NMAP',        border:'border-blue-500/50',   header:'text-blue-400',   spin:'border-blue-400/50',   hex:'#3b82f6', rgba:'rgba(59,130,246,0.35)'   };
    if (n.includes('bash')||n==='exec'||n==='run_command'||n==='shell') return { icon:'terminal',      label:'BASH',        border:'border-green-500/50',  header:'text-green-400',  spin:'border-green-400/50',  hex:'#22c55e', rgba:'rgba(34,197,94,0.35)'   };
    if (n.includes('ssh'))                                               return { icon:'key',           label:'SSH',         border:'border-cyan-500/50',   header:'text-cyan-400',   spin:'border-cyan-400/50',   hex:'#06b6d4', rgba:'rgba(6,182,212,0.35)'    };
    if (n.includes('python'))                        return { icon:'code',          label:'PYTHON',      border:'border-yellow-500/50', header:'text-yellow-400', spin:'border-yellow-400/50', hex:'#eab308', rgba:'rgba(234,179,8,0.35)'   };
    if (n.includes('msf')||n.includes('metasploit')) return { icon:'rocket_launch', label:'METASPLOIT',  border:'border-red-500/50',    header:'text-red-400',    spin:'border-red-400/50',    hex:'#ef4444', rgba:'rgba(239,68,68,0.35)'    };
    if (n.includes('searchsploit'))                  return { icon:'manage_search', label:'SEARCHSPLOIT',border:'border-orange-500/50', header:'text-orange-400', spin:'border-orange-400/50', hex:'#f97316', rgba:'rgba(249,115,22,0.35)'  };
    if (n.includes('hydra')||n.includes('brute'))    return { icon:'key',           label:'HYDRA',       border:'border-purple-500/50', header:'text-purple-400', spin:'border-purple-400/50', hex:'#a855f7', rgba:'rgba(168,85,247,0.35)'  };
    if (n.includes('sqlmap')||n.includes('sql'))     return { icon:'storage',       label:'SQLMAP',      border:'border-orange-500/50', header:'text-orange-400', spin:'border-orange-400/50', hex:'#f97316', rgba:'rgba(249,115,22,0.35)'  };
    if (n.includes('curl')||n.includes('http')||n.includes('web')) return { icon:'http', label:'HTTP',   border:'border-cyan-500/50',   header:'text-cyan-400',   spin:'border-cyan-400/50',   hex:'#06b6d4', rgba:'rgba(6,182,212,0.35)'   };
    if (n.includes('nikto')||n.includes('dirb')||n.includes('gobuster')) return { icon:'travel_explore', label:toolName.toUpperCase().slice(0,12), border:'border-teal-500/50', header:'text-teal-400', spin:'border-teal-400/50', hex:'#14b8a6', rgba:'rgba(20,184,166,0.35)' };
    return { icon:'terminal', label:toolName.toUpperCase().slice(0,12)||'TOOL', border:'border-blue-500/50', header:'text-blue-400', spin:'border-blue-400/50', hex:'#3b82f6', rgba:'rgba(59,130,246,0.35)' };
}

// Returns a short, human-readable summary line for the collapsed batch item header
function _getToolSpecialSummary(tool, params) {
    const n = (tool || '').toLowerCase();
    if (!params || typeof params !== 'object') return tool;

    if (n.includes('nmap')) {
        const cmd = params.command || params.cmd || params.command_line || '';
        let ip = params.target || params.host || params.ip || '';
        let ports = params.ports || params.port_range || '';
        let scanType = '';
        if (cmd) {
            const ipMatch = cmd.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\/\d+)?)\b/);
            if (ipMatch) ip = ipMatch[1];
            const portMatch = cmd.match(/-p[\s]*([\S]+)/);
            if (portMatch) ports = portMatch[1];
            if (cmd.includes('-sV') || cmd.includes('--version')) scanType = 'service scan';
            else if (cmd.includes('-sS') || cmd.includes('-sT')) scanType = 'port scan';
            else if (cmd.includes('-sU')) scanType = 'UDP scan';
            else if (cmd.includes('-sC') || cmd.includes('--script')) scanType = 'script scan';
            else if (cmd.includes('-A')) scanType = 'aggressive scan';
            else scanType = 'scan';
        }
        const parts = [];
        if (ip) parts.push(ip);
        if (scanType) parts.push(scanType);
        if (ports) parts.push('ports:' + ports);
        return parts.join(' · ') || tool;
    }

    if (n.includes('searchsploit')) {
        const query = params.query || params.search || params.service || params.term || params.keyword || '';
        const version = params.version || '';
        return query ? (version ? `${query} ${version}` : query) : tool;
    }

    if (n.includes('msf') || n.includes('metasploit')) {
        const module = params.module || params.exploit || '';
        const target = params.target || params.rhost || params.host || params.ip || '';
        if (module && target) return `${module} → ${target}`;
        if (module) return module;
        const cmd = params.command || params.cmd || '';
        return cmd ? cmd.slice(0, 80) : tool;
    }

    if (n.includes('ssh')) {
        const host = params.host || params.target || params.ip || '';
        const cmd  = params.command || params.cmd || '';
        if (host && cmd) return `${host}: ${cmd.slice(0, 60)}`;
        if (cmd) return cmd.slice(0, 80);
        if (host) return `connect → ${host}`;
        return tool;
    }

    // Generic fallback
    const cmd = params.command || params.cmd || params.command_line || '';
    if (cmd) return String(cmd).slice(0, 100);
    const target = params.target || params.host || params.ip || params.url || '';
    const mod = params.module || params.exploit || '';
    if (mod) return mod.slice(0, 80);
    if (target) return String(target).slice(0, 80);
    const first = Object.values(params).find(v => typeof v === 'string');
    return first ? first.slice(0, 80) : tool;
}

// ── Expand/collapse animation helpers ────────────────────────────────────────
// Animate an element open: measure real height → animate → then release to auto
function _expandEl(el, durationMs = 220) {
    // Measure actual content height while hidden
    el.style.transition = 'none';
    el.style.maxHeight  = 'none';
    const h = el.scrollHeight;
    el.style.maxHeight  = '0px';
    el.offsetHeight;                                     // force reflow
    el.style.transition = `max-height ${durationMs}ms cubic-bezier(0.4,0,0.2,1)`;
    el.style.maxHeight  = h + 'px';
    // After animation, release max-height so inner expansions aren't clipped
    clearTimeout(el._expandTimer);
    el._expandTimer = setTimeout(() => { el.style.maxHeight = 'none'; }, durationMs + 20);
}

// Animate an element closed: pin current height → animate to 0
function _collapseEl(el, durationMs = 200) {
    clearTimeout(el._expandTimer);
    el.style.transition = 'none';
    el.style.maxHeight  = el.scrollHeight + 'px';
    el.offsetHeight;
    el.style.transition = `max-height ${durationMs}ms cubic-bezier(0.4,0,0.2,1)`;
    el.style.maxHeight  = '0px';
}

function toggleToolBatch(headerEl) {
    const card   = headerEl.closest('.tool-batch-card');
    const list   = card ? card.querySelector('.tb-list') : null;
    const icon   = headerEl.querySelector('.tb-expand-icon');
    if (!list) return;
    const isOpen = list.style.maxHeight !== '0px' && list.style.maxHeight !== '' && list.style.maxHeight !== null;
    if (isOpen && list.style.maxHeight !== 'none') {
        _collapseEl(list);
        if (icon) icon.textContent = 'expand_more';
    } else if (list.style.maxHeight === '0px' || list.style.maxHeight === '') {
        _expandEl(list);
        if (icon) icon.textContent = 'expand_less';
    } else {
        // already 'none' (open) → collapse
        _collapseEl(list);
        if (icon) icon.textContent = 'expand_more';
    }
}

function _tbListRefreshHeight(el) {
    // If the parent list is pinned to a specific px, release it so it doesn't clip
    const list = el ? el.closest('.tb-list') : null;
    if (list && list.style.maxHeight && list.style.maxHeight !== '0px') {
        list.style.maxHeight = 'none';
    }
}

function toggleToolItemExpand(headerEl) {
    const item   = headerEl.closest('.tool-batch-item');
    const expand = item ? item.querySelector('.tool-item-expand') : null;
    const icon   = headerEl.querySelector('.tbi-expand-icon');
    if (!expand) return;
    const isOpen = expand.style.maxHeight !== '0px' && expand.style.maxHeight !== '' && expand.style.maxHeight !== null;
    if (isOpen && expand.style.maxHeight !== 'none') {
        _collapseEl(expand);
        if (icon) icon.textContent = 'expand_more';
    } else if (expand.style.maxHeight === '0px' || expand.style.maxHeight === '') {
        _expandEl(expand);
        if (icon) icon.textContent = 'expand_less';
        _tbListRefreshHeight(item);
    } else {
        // 'none' → collapse
        _collapseEl(expand);
        if (icon) icon.textContent = 'expand_more';
    }
}

function _toolCallSummary(tool, params) {
    if (!params || typeof params !== 'object') return tool;
    const cmd = params.command || params.cmd || params.command_line;
    if (cmd) return String(cmd).slice(0, 120);
    const target = params.target || params.host || params.ip || params.url || params.address;
    const args   = params.flags  || params.options || params.args || params.arguments || '';
    if (target) return (args ? `${target} ${args}` : String(target)).slice(0, 120);
    const mod = params.module || params.exploit || params.payload;
    if (mod) return String(mod).slice(0, 120);
    const first = Object.values(params).find(v => typeof v === 'string');
    return first ? first.slice(0, 120) : tool;
}

function _resultSummary(output) {
    if (!output) return '';
    return output.trim().split('\n').filter(l => l.trim()).slice(0, 2).join(' · ').slice(0, 140);
}

function _closeToolBatch() { _toolBatch = null; }

// ─── Feed Filter (auto-expand preferences) ────────────────────────────────────

const _FEED_FILTER_TOOLS = [
    { key: 'nmap',        label: 'NMAP',         icon: 'wifi_find'     },
    { key: 'metasploit',  label: 'METASPLOIT',   icon: 'rocket_launch' },
    { key: 'searchsploit',label: 'SEARCHSPLOIT', icon: 'manage_search' },
    { key: 'bash',        label: 'BASH / SHELL',  icon: 'terminal'      },
    { key: 'ssh',         label: 'SSH',           icon: 'key'           },
    { key: 'hydra',       label: 'HYDRA',         icon: 'key'           },
    { key: 'thinking',    label: 'THINKING',      icon: 'psychology'    },
    { key: 'reflecting',  label: 'REFLECTION',    icon: 'lightbulb'     },
];

let _feedFilter = null;   // lazily loaded from localStorage

function _getFeedFilter() {
    if (_feedFilter) return _feedFilter;
    try {
        const saved = localStorage.getItem('aegis_feed_filter');
        _feedFilter = saved ? JSON.parse(saved) : {};
    } catch { _feedFilter = {}; }
    // Default: everything expanded
    _FEED_FILTER_TOOLS.forEach(t => {
        if (_feedFilter[t.key] === undefined) _feedFilter[t.key] = true;
    });
    return _feedFilter;
}

function _saveFeedFilter() {
    try { localStorage.setItem('aegis_feed_filter', JSON.stringify(_feedFilter)); } catch {}
}

function _feedFilterAutoExpand(toolKey) {
    const f = _getFeedFilter();
    return f[toolKey] !== false;
}

function _toolKeyFromName(toolName) {
    const n = (toolName || '').toLowerCase();
    if (n.includes('nmap'))                            return 'nmap';
    if (n.includes('msf') || n.includes('metasploit')) return 'metasploit';
    if (n.includes('searchsploit'))                    return 'searchsploit';
    if (n.includes('ssh'))                             return 'ssh';
    if (n.includes('hydra') || n.includes('brute'))   return 'hydra';
    return 'bash';
}

function toggleFeedFilter() {
    const panel = document.getElementById('feed-filter-panel');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        _renderFeedFilterPanel();
        panel.classList.remove('hidden');
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', _closeFeedFilterOutside, { once: true });
        }, 0);
    } else {
        panel.classList.add('hidden');
    }
}

function _closeFeedFilterOutside(e) {
    const panel = document.getElementById('feed-filter-panel');
    if (panel && !panel.contains(e.target)) panel.classList.add('hidden');
}

function _renderFeedFilterPanel() {
    const list = document.getElementById('feed-filter-list');
    if (!list) return;
    const f = _getFeedFilter();
    list.innerHTML = _FEED_FILTER_TOOLS.map(t => `
        <label class="flex items-center gap-2 cursor-pointer group">
            <div class="relative w-7 h-4 shrink-0">
                <input type="checkbox" class="sr-only peer" ${f[t.key] !== false ? 'checked' : ''}
                    onchange="feedFilterToggle('${t.key}', this.checked)">
                <div class="w-7 h-4 rounded-full bg-border-color peer-checked:bg-primary/60 transition-colors"></div>
                <div class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white/60 peer-checked:translate-x-3 transition-transform"></div>
            </div>
            <span class="material-symbols-outlined text-[12px] text-secondary-text/50">${t.icon}</span>
            <span class="text-[10px] mono-text text-secondary-text/70 uppercase tracking-wide">${t.label}</span>
        </label>
    `).join('');
}

function feedFilterToggle(key, val) {
    const f = _getFeedFilter();
    f[key] = val;
    _saveFeedFilter();
}

function feedFilterSetAll(val) {
    const f = _getFeedFilter();
    _FEED_FILTER_TOOLS.forEach(t => { f[t.key] = val; });
    _saveFeedFilter();
    _renderFeedFilterPanel();
}

function _openOrAddToToolBatch(data) {
    const tool  = data.tool || '';
    const style = _getToolStyle(tool);
    const uid   = _toolBatchUid++;

    if (!_toolBatch) {
        const feed = getMissionFeed();
        if (!feed) return uid;
        const bId = `tb${uid}`;
        const wrapperEl = document.createElement('div');
        wrapperEl.className = 'tool-batch-card';
        wrapperEl.innerHTML = `
            <div class="border-l-2 ${style.border} bg-surface font-mono text-xs" style="border:1px solid ${style.rgba};border-left:4px solid ${style.hex};">
                <div class="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
                     onclick="toggleToolBatch(this)">
                    <span class="material-symbols-outlined text-[14px] ${style.header}">${style.icon}</span>
                    <span class="${style.header} font-bold text-[11px] uppercase tracking-widest" id="${bId}-label">${style.label}</span>
                    <span class="text-secondary-text/40 text-[10px] ml-1" id="${bId}-count">1</span>
                    <span class="material-symbols-outlined text-[13px] text-secondary-text/30 ml-auto tb-expand-icon">expand_more</span>
                </div>
                <div id="${bId}-list" class="tb-list divide-y divide-border-color/20 overflow-hidden" style="max-height:0;transition:max-height 0.35s ease-out;"></div>
            </div>`;
        feed.appendChild(wrapperEl);
        const listEl  = wrapperEl.querySelector(`#${bId}-list`);
        const iconEl  = wrapperEl.querySelector('.tb-expand-icon');
        _toolBatch = {
            wrapperEl,
            listEl,
            countEl:  wrapperEl.querySelector(`#${bId}-count`),
            labelEl:  wrapperEl.querySelector(`#${bId}-label`),
            borderEl: wrapperEl.querySelector('.border-l-2'),
            pendingQueue: [],
            toolSet: new Set([tool]),
            style
        };
        // Auto-expand based on filter preference
        const toolKey = _toolKeyFromName(tool);
        if (_feedFilterAutoExpand(toolKey)) {
            requestAnimationFrame(() => {
                listEl.style.maxHeight = 'none';
                if (iconEl) iconEl.textContent = 'expand_less';
            });
        }
        if (agentAutoScroll) { const s = document.getElementById('agent-scroll-area'); if(s) s.scrollTop = s.scrollHeight; }
    } else {
        _toolBatch.toolSet.add(tool);
        if (_toolBatch.toolSet.size > 1 && _toolBatch.labelEl) _toolBatch.labelEl.textContent = 'TOOLS';
    }

    const specialSummary = _esc(_getToolSpecialSummary(tool, data.params || {}));
    const paramsHtml     = _renderToolParams(data.params || {});
    const sid     = _toolDetailStoreId++;
    _toolDetailStore.set(sid, data);
    const itemEl  = document.createElement('div');
    itemEl.id = `tbitem-${uid}`;
    itemEl.className = 'tool-batch-item';
    itemEl.setAttribute('data-tool-id', sid);
    itemEl.setAttribute('data-tool-title', `${_esc(tool)} · details`);
    itemEl.innerHTML = `
        <div class="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
             onclick="toggleToolItemExpand(this)">
            <div class="shrink-0 w-4 h-4 flex items-center justify-center" id="tbstatus-${uid}">
                <div class="w-3 h-3 border ${_toolBatch.style.spin} border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="text-secondary-text/80 text-[11px] truncate">${specialSummary}</div>
            </div>
            <span class="material-symbols-outlined text-[13px] text-secondary-text/30 shrink-0 tbi-expand-icon">expand_more</span>
        </div>
        <div class="tool-item-expand overflow-hidden" style="max-height:0;transition:max-height 0.3s ease-out;">
            <div class="px-4 pb-3 pt-2 border-t border-border-color/20">
                <div class="space-y-0.5" id="tbdetail-${uid}">${paramsHtml}</div>
                <div class="mt-1.5 hidden" id="tbresult-detail-${uid}"></div>
            </div>
        </div>`;
    _toolBatch.listEl.appendChild(itemEl);

    const n = _toolBatch.listEl.children.length;
    if (_toolBatch.countEl) _toolBatch.countEl.textContent = `${n}`;
    _toolBatch.pendingQueue.push({ uid, tool, callData: data });
    // If list is already open, stretch its max-height to fit the new item
    if (_toolBatch.listEl.style.maxHeight && _toolBatch.listEl.style.maxHeight !== '0px') {
        _toolBatch.listEl.style.maxHeight = _toolBatch.listEl.scrollHeight + 'px';
    }

    if (agentAutoScroll) { const s = document.getElementById('agent-scroll-area'); if(s) s.scrollTop = s.scrollHeight; }
    scheduleMinimapUpdate();
    return uid;
}

function _resolveToolBatchItem(data) {
    if (!_toolBatch || !_toolBatch.pendingQueue.length) return false;
    const pending = _toolBatch.pendingQueue.shift();
    const uid     = pending.uid;
    const success = data.success !== false;
    const output  = data.output || data.error || '';
    const summary = _resultSummary(output);

    const statusEl = document.getElementById(`tbstatus-${uid}`);
    if (statusEl) {
        const ic = success ? 'check_circle' : 'error';
        const cl = success ? 'text-primary'  : 'text-danger';
        statusEl.innerHTML = `<span class="material-symbols-outlined text-[15px] ${cl}" style="font-variation-settings:'FILL' 1;">${ic}</span>`;
    }
    // Result summary removed from header — visible in expanded detail only
    // Also write full output into the expandable detail section
    const resultDetailEl = document.getElementById(`tbresult-detail-${uid}`);
    if (resultDetailEl && output) {
        const cl = success ? 'text-primary/70' : 'text-danger/70';
        resultDetailEl.innerHTML = `<pre class="${cl} text-[10px] whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto border-t border-border-color/20 pt-1.5">${_esc(output.trim().slice(0, 800))}</pre>`;
        resultDetailEl.classList.remove('hidden');
        // Recalculate heights if sections are open
        const item = resultDetailEl.closest('.tool-batch-item');
        const expand = item ? item.querySelector('.tool-item-expand') : null;
        if (expand && expand.style.maxHeight && expand.style.maxHeight !== '0px') {
            expand.style.maxHeight = expand.scrollHeight + 'px';
        }
        _tbListRefreshHeight(resultDetailEl);
    }

    const itemEl = document.getElementById(`tbitem-${uid}`);
    if (itemEl) {
        const sid = parseInt(itemEl.getAttribute('data-tool-id'), 10);
        _toolDetailStore.set(sid, { call: pending.callData, result: data });
        itemEl.setAttribute('data-tool-title', `${_esc(data.tool||'')} · call + result`);
    }
    if (agentAutoScroll) { const s = document.getElementById('agent-scroll-area'); if(s) s.scrollTop = s.scrollHeight; }
    scheduleMinimapUpdate();
    return true;
}

function getMissionFeed() {
    let feed = document.getElementById('mission-feed');
    if (!feed) {
        const stream = document.getElementById('message-stream');
        if (!stream) return null;
        // Hide the agent empty state
        const emptyState = document.getElementById('agent-empty-state');
        if (emptyState) emptyState.style.display = 'none';
        feed = document.createElement('div');
        feed.id = 'mission-feed';
        feed.className = 'flex flex-col gap-4 w-full';
        stream.appendChild(feed);
    }
    return feed;
}

function appendMissionCard(html) {
    const feed = getMissionFeed();
    if (!feed) return null;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    const el = wrapper.firstChild;
    if (el) feed.appendChild(el);
    // Only auto-scroll if the user hasn't manually scrolled up
    if (agentAutoScroll) {
        const scrollEl = document.getElementById('agent-scroll-area');
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }
    scheduleMinimapUpdate();
    return el || null;
}

function clearMissionFeed() {
    const feed = document.getElementById('mission-feed');
    if (feed) feed.remove();
    _missionIteration = 0;
    _toolBatch = null;
    _toolDetailStore.clear();
    const emptyState = document.getElementById('agent-empty-state');
    if (emptyState) emptyState.style.display = '';
    // Clear objectives panel
    const op = document.getElementById('objectives-panel');
    if (op) op.remove();
    _objectivesState = [];
    scheduleMinimapUpdate();
}

// ── Objectives Panel ──────────────────────────────────────────────────────────

let _objectivesState = []; // [{text, done}]

function initObjectivesPanel(objectives) {
    _objectivesState = objectives.map(o => ({ text: o, done: false }));

    // Remove existing panel if any
    const existing = document.getElementById('objectives-panel');
    if (existing) existing.remove();

    const stream = document.getElementById('message-stream');
    if (!stream) return;

    const panel = document.createElement('div');
    panel.id = 'objectives-panel';
    panel.className = 'border border-border-color bg-surface font-mono w-full';
    panel.innerHTML = `
        <div class="flex items-center gap-2 px-3 py-2 border-b border-border-color">
            <span class="material-symbols-outlined text-[13px] text-primary" style="font-variation-settings:'FILL' 1;">flag</span>
            <span class="text-[10px] font-bold uppercase tracking-widest text-primary">OBJECTIVES</span>
            <span id="obj-counter" class="ml-auto text-[10px] text-secondary-text">0/${objectives.length}</span>
        </div>
        <ul id="obj-list" class="px-3 py-2 space-y-1.5"></ul>
    `;
    // Insert at top of stream, before the mission feed
    stream.insertBefore(panel, stream.firstChild);

    _renderObjectivesList();
}

function _renderObjectivesList() {
    const list = document.getElementById('obj-list');
    const counter = document.getElementById('obj-counter');
    if (!list) return;

    const done = _objectivesState.filter(o => o.done).length;
    if (counter) counter.textContent = `${done}/${_objectivesState.length}`;

    list.innerHTML = _objectivesState.map(o => `
        <li class="flex items-start gap-2 text-[11px] ${o.done ? 'text-green-400' : 'text-secondary-text'}">
            <span class="material-symbols-outlined text-[13px] mt-0.5 shrink-0" style="font-variation-settings:'FILL' ${o.done ? 1 : 0};">
                ${o.done ? 'task_alt' : 'radio_button_unchecked'}
            </span>
            <span class="${o.done ? 'line-through opacity-70' : ''}">${_esc(o.text)}</span>
        </li>
    `).join('');
}

function markObjectiveComplete(objectiveText) {
    const obj = _objectivesState.find(o => o.text === objectiveText);
    if (obj) {
        obj.done = true;
        _renderObjectivesList();
    }
}

function renderMissionStart(target, mode) {
    const ts = new Date().toLocaleTimeString();
    appendMissionCard(`
        <div class="bg-primary/5 px-4 py-3 font-mono text-xs" style="border:1px solid rgba(204,255,0,0.35);border-left:4px solid #ccff00;">
            <div class="flex items-center gap-2 text-primary font-bold mb-1">
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1;">rocket_launch</span>
                MISSION STARTED &nbsp;·&nbsp; ${ts}
            </div>
            <div class="text-secondary-text">TARGET &nbsp;<span class="text-slate-200">${_esc(target)}</span> &nbsp;&nbsp; MODE &nbsp;<span class="text-slate-200">${_esc(mode).toUpperCase()}</span></div>
        </div>
    `);
}

// ── Agent LLM Streaming ──────────────────────────────────────────────────────

let _agentStreamEl   = null;  // the live streaming card element
let _agentStreamBody = null;  // the <pre> inside it that receives tokens
let _agentStreamMode = null;  // 'thinking' | 'reflecting'

function startAgentStreamCard(mode) {
    finalizeAgentStreamCard();
    _agentStreamMode  = mode;
    const isReflect   = mode === 'reflecting';
    const borderHex   = isReflect ? '#a855f7' : '#eab308';
    const borderRgba  = isReflect ? 'rgba(168,85,247,0.35)' : 'rgba(234,179,8,0.35)';
    const labelColor  = isReflect ? 'text-purple-400'   : 'text-yellow-400';
    const icon        = isReflect ? 'lightbulb'             : 'psychology';
    const label       = isReflect ? 'REFLECTING'            : 'THINKING';

    const dots = `<span class="flex items-center gap-[3px] ml-1.5" id="agent-stream-cursor">
        <span class="w-[5px] h-[5px] rounded-full bg-current" style="animation:thinking-dot 1.2s ease-in-out infinite;animation-delay:0ms"></span>
        <span class="w-[5px] h-[5px] rounded-full bg-current" style="animation:thinking-dot 1.2s ease-in-out infinite;animation-delay:200ms"></span>
        <span class="w-[5px] h-[5px] rounded-full bg-current" style="animation:thinking-dot 1.2s ease-in-out infinite;animation-delay:400ms"></span>
    </span>`;

    const wrapper = document.createElement('div');
    wrapper.className = 'mission-card-wrapper';

    if (isReflect) {
        const autoOpen  = _feedFilterAutoExpand('reflecting');
        const mhStyle   = autoOpen ? 'max-height:none;' : 'max-height:0;';
        const expandIco = autoOpen ? 'expand_less' : 'expand_more';
        // Reflecting: keep card visible after finalization
        wrapper.innerHTML = `
            <div class="think-card bg-surface font-mono text-xs" style="border:1px solid ${borderRgba};border-left:4px solid ${borderHex};">
                <div class="flex items-center gap-2 ${labelColor} font-bold text-[11px] uppercase tracking-widest pl-4 pr-4 py-2.5">
                    <span class="material-symbols-outlined text-[14px] animate-pulse">${icon}</span>
                    ${label}
                    ${dots}
                    <button onclick="toggleThinkExpand(this)" title="Toggle detail"
                        class="ml-auto flex items-center gap-1 ${labelColor} opacity-60 hover:opacity-100 transition-opacity px-1 py-0.5">
                        <span class="material-symbols-outlined text-[15px]">${expandIco}</span>
                    </button>
                </div>
                <div class="think-expand overflow-hidden pl-4 pr-4" style="${mhStyle}transition:max-height 0.25s ease-out;">
                    <pre id="agent-stream-body" class="text-secondary-text/70 text-[11px] italic leading-relaxed whitespace-pre-wrap break-all pb-3 max-h-72 overflow-y-auto"></pre>
                </div>
            </div>`;
    } else {
        // Thinking: card will be removed on finalization; just show animated header
        wrapper.innerHTML = `
            <div class="bg-surface pl-4 pr-4 py-2.5 font-mono text-xs" style="border:1px solid ${borderRgba};border-left:4px solid ${borderHex};">
                <div class="flex items-center gap-2 ${labelColor} font-bold text-[11px] uppercase tracking-widest">
                    <span class="material-symbols-outlined text-[14px] animate-pulse">${icon}</span>
                    ${label}
                    ${dots}
                </div>
                <pre id="agent-stream-body" class="sr-only"></pre>
            </div>`;
    }

    const feed = getMissionFeed();
    if (feed) {
        feed.appendChild(wrapper);
        _agentStreamEl   = wrapper;
        _agentStreamBody = wrapper.querySelector('#agent-stream-body');
        if (agentAutoScroll) {
            const scrollEl = document.getElementById('agent-scroll-area');
            if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
        }
    }
}

function appendAgentStreamToken(token) {
    if (!_agentStreamBody) return;
    _agentStreamBody.textContent += token;
    // Auto-scroll the card itself if it's overflowing
    _agentStreamBody.scrollTop = _agentStreamBody.scrollHeight;
    // Auto-scroll the page only if user hasn't scrolled up
    if (agentAutoScroll) {
        const scrollEl = document.getElementById('agent-scroll-area');
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }
}

function finalizeAgentStreamCard() {
    if (!_agentStreamEl) return;
    if (_agentStreamMode === 'thinking') {
        // Remove the temp streaming card — renderMissionReasoning will show clean parsed card
        _agentStreamEl.remove();
    } else {
        // Reflecting: keep the card, remove dots, apply markdown bold
        const cursor = _agentStreamEl.querySelector('#agent-stream-cursor');
        if (cursor) cursor.remove();
        // Convert plain-text pre → formatted div with markdown bold
        const body = _agentStreamEl.querySelector('#agent-stream-body');
        if (body) {
            const raw = body.textContent || '';
            const div = document.createElement('div');
            div.className = body.className.replace('whitespace-pre-wrap', 'whitespace-pre-wrap');
            div.innerHTML = _parseMd(_esc(raw));
            body.replaceWith(div);
        }
        // Release max-height now that content is final
        const expand = _agentStreamEl.querySelector('.think-expand');
        if (expand) { expand.style.maxHeight = 'none'; }
    }
    _agentStreamEl   = null;
    _agentStreamBody = null;
    _agentStreamMode = null;
}

function renderMissionReasoning(data) {
    _missionIteration++;
    const iter      = _missionIteration;
    const thought   = _esc(data.thought   || '');
    const reasoning = _esc(data.reasoning || '');
    const action    = _esc(data.action    || '');
    // Short preview shown in collapsed header (first ~70 chars of thought)
    const preview   = thought ? thought.slice(0, 72) + (thought.length > 72 ? '…' : '') : '';

    const bodyHtml = [
        thought   ? `<p class="text-slate-300/80 text-[12px] italic leading-relaxed whitespace-pre-wrap mb-2">${thought}</p>` : '',
        reasoning ? `<p class="text-secondary-text/70 text-[11px] italic leading-relaxed whitespace-pre-wrap mb-2">${reasoning}</p>` : '',
        action    ? `<p class="text-primary text-[11px] font-bold mt-1 not-italic">→ &nbsp;${action}</p>` : '',
    ].filter(Boolean).join('');

    const thinkOpen = _feedFilterAutoExpand('thinking');
    const thinkMH   = thinkOpen ? 'none' : '0px';
    const thinkIco  = thinkOpen ? 'expand_less' : 'expand_more';
    appendMissionCard(`
        <div class="think-card bg-surface font-mono text-xs" data-iteration="${iter}" style="border:1px solid rgba(234,179,8,0.35);border-left:4px solid #eab308;">
            <div class="flex items-center gap-2 pl-4 pr-4 py-2.5 text-yellow-400 font-bold text-[11px] uppercase tracking-widest">
                <span class="material-symbols-outlined text-[14px]">psychology</span>
                THINKING
                <div class="ml-auto flex items-center gap-2 shrink-0">
                    <button onclick="forkFromIteration(${iter})" title="Continue from this checkpoint"
                        class="flex items-center gap-1 text-[10px] text-secondary-text/40 hover:text-primary transition-colors px-1.5 py-0.5">
                        <span class="material-symbols-outlined text-[12px]">fork_right</span>
                    </button>
                    <button onclick="toggleThinkExpand(this)" title="Toggle thinking detail"
                        class="flex items-center gap-1 text-yellow-400/40 hover:text-yellow-400 transition-colors px-1 py-0.5">
                        <span class="material-symbols-outlined text-[15px]">${thinkIco}</span>
                    </button>
                </div>
            </div>
            <div class="think-expand overflow-hidden pl-4 pr-4" style="max-height:${thinkMH};transition:max-height 0.25s ease-out;">
                <div class="pb-3 border-t border-yellow-500/10 pt-2.5">
                    ${bodyHtml}
                </div>
            </div>
        </div>
    `);
}

function renderMissionToolCall(data) {
    const tool       = _esc(data.tool || '');
    const paramsHtml = _renderToolParams(data.params || {});
    const sid        = _toolDetailStoreId++;
    _toolDetailStore.set(sid, data);
    appendMissionCard(`
        <div class="group/card bg-surface pl-4 pr-4 py-3 font-mono text-xs relative"
             data-tool-id="${sid}" data-tool-title="TOOL CALL · ${tool}" style="border:1px solid rgba(59,130,246,0.35);border-left:4px solid #3b82f6;">
            <div class="flex items-center gap-2 text-blue-400 font-bold text-[11px] uppercase tracking-widest mb-2">
                <span class="material-symbols-outlined text-[14px]">terminal</span>
                TOOL CALL
            </div>
            <div class="text-primary font-bold mb-2 text-[12px]">▶ &nbsp;${tool}</div>
            <div class="space-y-0.5">${paramsHtml}</div>
            <button onclick="showToolDetail(this)"
                class="absolute bottom-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity
                       flex items-center gap-1 text-secondary-text hover:text-blue-400 bg-bg/80 rounded px-1.5 py-0.5 text-[10px]">
                <span class="material-symbols-outlined text-[13px]">info</span>
            </button>
        </div>
    `);
}

function renderMissionToolResult(data) {
    const tool    = _esc(data.tool || '');
    const success = data.success !== false;
    const output  = _esc(data.output || data.error || '');
    const borderHex2  = success ? '#ccff00' : '#ef4444';
    const borderRgba2 = success ? 'rgba(204,255,0,0.3)' : 'rgba(239,68,68,0.35)';
    const color   = success ? 'text-primary' : 'text-danger';
    const icon    = success ? 'check_circle' : 'error';
    const label   = success ? 'OK' : 'FAILED';
    const sid     = _toolDetailStoreId++;
    _toolDetailStore.set(sid, data);
    appendMissionCard(`
        <div class="group/card bg-surface pl-4 pr-4 py-3 font-mono text-xs relative"
             data-tool-id="${sid}" data-tool-title="RESULT · ${tool}" style="border:1px solid ${borderRgba2};border-left:4px solid ${borderHex2};">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 ${color} font-bold text-[11px] uppercase tracking-widest">
                    <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1;">${icon}</span>
                    RESULT: ${tool}
                </div>
                <span class="${color} font-bold text-[11px]">${label}</span>
            </div>
            ${output ? `<pre class="text-secondary-text text-[11px] overflow-x-auto max-h-48 whitespace-pre-wrap break-all">${output}</pre>` : ''}
            <button onclick="showToolDetail(this)"
                class="absolute bottom-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity
                       flex items-center gap-1 text-secondary-text hover:text-primary bg-bg/80 rounded px-1.5 py-0.5 text-[10px]">
                <span class="material-symbols-outlined text-[13px]">info</span>
            </button>
        </div>
    `);
}

function _parseMd(escapedText) {
    // Convert **bold** to <strong> (applied after HTML escaping so < > are already safe)
    return escapedText.replace(/\*\*(.+?)\*\*/g, '<strong class="text-secondary-text font-bold not-italic">$1</strong>');
}

function renderMissionReflection(data) {
    const rawContent = data.content || '';
    if (!rawContent) return;
    const content   = _parseMd(_esc(rawContent));
    const autoOpen  = _feedFilterAutoExpand('reflecting');
    const expandIco = autoOpen ? 'expand_less' : 'expand_more';
    const card = appendMissionCard(`
        <div class="think-card bg-surface font-mono text-xs" style="border:1px solid rgba(168,85,247,0.35);border-left:4px solid #a855f7;">
            <div class="flex items-center gap-2 pl-4 pr-4 py-2.5 text-purple-400 font-bold text-[11px] uppercase tracking-widest">
                <span class="material-symbols-outlined text-[14px]">lightbulb</span>
                REFLECTION
                <button onclick="toggleThinkExpand(this)" title="Toggle detail"
                    class="ml-auto flex items-center gap-1 text-purple-400/40 hover:text-purple-400 transition-colors px-1 py-0.5">
                    <span class="material-symbols-outlined text-[15px]">${expandIco}</span>
                </button>
            </div>
            <div class="think-expand overflow-hidden pl-4 pr-4" style="max-height:0;transition:max-height 0.25s ease-out;">
                <div class="pb-3 border-t border-purple-500/10 pt-2.5">
                    <div class="text-secondary-text text-[11px] italic leading-relaxed whitespace-pre-wrap">${content}</div>
                </div>
            </div>
        </div>
    `);
    // Auto-expand based on filter preference
    if (card && autoOpen) {
        const expand = card.querySelector('.think-expand');
        if (expand) requestAnimationFrame(() => _expandEl(expand, 220));
    }
}

function renderMissionSafetyBlock(data) {
    const reason = _esc(data.reason || '');
    const tool   = _esc(data.tool || '');
    appendMissionCard(`
        <div class="bg-surface pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(249,115,22,0.35);border-left:4px solid #f97316;">
            <div class="flex items-center gap-2 text-orange-400 font-bold text-[11px] uppercase tracking-widest mb-1">
                <span class="material-symbols-outlined text-[14px]">shield</span>
                SAFETY BLOCK${tool ? ' · ' + tool : ''}
            </div>
            <div class="text-orange-300/80 text-xs">${reason}</div>
        </div>
    `);
}

function renderMissionError(data) {
    const msg = _esc(data.error || 'Unknown error');
    appendMissionCard(`
        <div class="bg-surface pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(239,68,68,0.35);border-left:4px solid #ef4444;">
            <div class="flex items-center gap-2 text-danger font-bold text-[11px] uppercase tracking-widest mb-1">
                <span class="material-symbols-outlined text-[14px]">error</span>
                ERROR
            </div>
            <div class="text-danger/80 text-xs whitespace-pre-wrap">${msg}</div>
        </div>
    `);
}

function renderMissionDone(data) {
    const ts = new Date().toLocaleTimeString();
    // Build findings section if flags or objective result present
    let findingsHtml = '';
    const flags = Array.isArray(data.flags) ? data.flags : [];
    const objective = data.objective_result || data.objective || '';
    const findings  = Array.isArray(data.findings) ? data.findings : [];
    if (flags.length > 0) {
        findingsHtml += `<div class="mt-3 border-t border-primary/20 pt-3">
            <div class="text-primary/70 text-[10px] uppercase tracking-widest font-bold mb-1.5">Flags Found</div>
            ${flags.map(f => `<div class="flex items-center gap-2 mb-1">
                <span class="material-symbols-outlined text-[12px] text-primary">flag</span>
                <code class="text-primary text-[11px] break-all">${_esc(String(f))}</code>
            </div>`).join('')}
        </div>`;
    }
    if (findings.length > 0) {
        findingsHtml += `<div class="mt-3 border-t border-primary/20 pt-3">
            <div class="text-primary/70 text-[10px] uppercase tracking-widest font-bold mb-1.5">Key Findings</div>
            ${findings.map(f => `<div class="text-secondary-text text-[11px] mb-0.5 flex gap-2">
                <span class="text-primary shrink-0">›</span>
                <span>${_esc(String(f))}</span>
            </div>`).join('')}
        </div>`;
    }
    if (objective) {
        findingsHtml += `<div class="mt-3 border-t border-primary/20 pt-3">
            <div class="text-primary/70 text-[10px] uppercase tracking-widest font-bold mb-1.5">Objective Result</div>
            <div class="text-secondary-text text-[11px] italic leading-relaxed whitespace-pre-wrap">${_parseMd(_esc(objective))}</div>
        </div>`;
    }
    appendMissionCard(`
        <div class="border border-primary/30 bg-primary/5 px-4 py-4 font-mono text-xs">
            <div class="flex items-center gap-2 text-primary font-bold mb-3">
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1;">flag</span>
                MISSION COMPLETE &nbsp;·&nbsp; ${ts}
            </div>
            <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                    <div class="text-primary text-xl font-bold mono-text">${data.hosts || 0}</div>
                    <div class="text-secondary-text text-[10px] uppercase tracking-wider mt-0.5">Hosts</div>
                </div>
                <div>
                    <div class="text-primary text-xl font-bold mono-text">${data.vulns || 0}</div>
                    <div class="text-secondary-text text-[10px] uppercase tracking-wider mt-0.5">Vulns</div>
                </div>
                <div>
                    <div class="text-primary text-xl font-bold mono-text">${data.exploits || 0}</div>
                    <div class="text-secondary-text text-[10px] uppercase tracking-wider mt-0.5">Exploits</div>
                </div>
            </div>
            ${findingsHtml}
            <div class="mt-3 text-center text-secondary-text text-[11px] ${findingsHtml ? 'border-t border-primary/20 pt-3' : ''}">
                Report available in the <span class="text-primary cursor-pointer hover:underline" onclick="switchView('report')">Report</span> tab
            </div>
        </div>
    `);
}

// ─── Load sessions for dropdown selects ──────────────────────────────────────

async function loadSessionsForSelects() {
    try {
        const res = await fetch('/api/v1/sessions');
        if (!res.ok) return;
        const sessions = await res.json();

        // Populate audit session select
        const auditSelect = document.getElementById('audit-session-select');
        if (auditSelect) {
            const currentVal = auditSelect.value;
            auditSelect.innerHTML = '<option value="">ALL SESSIONS</option>';
            sessions.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                const d = s.created_at ? new Date(s.created_at * 1000) : null;
                const ts = d ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
                const label = s.name ? `${s.name} (${s.target})` : s.target;
                opt.textContent = `${s.id.slice(0, 8)} · ${label} · ${s.status.toUpperCase()} · ${ts}`;
                auditSelect.appendChild(opt);
            });
            if (currentVal) auditSelect.value = currentVal;
        }

        // Auto-set active mission if sessions exist with running status
        if (!activeMissionId) {
            const running = sessions.find(s => s.is_running);
            if (running) {
                activeMissionId = running.id;
                viewingSessionId = running.id;
                missionStartTime = running.created_at * 1000;
                updateMissionStatusHeader('running', running.id);
                patchWsSessionHandler();
                if (ws && wsReady) {
                    ws.send(JSON.stringify({ type: 'subscribe_session', session_id: running.id }));
                }
                startMissionPoll(running.id);
                startMissionUptime();
                showPauseMissionBtn();
                setAgentStatus('reasoning');
                syncInputMode();
            }
        }

        // Populate report session select
        const reportSelect = document.getElementById('report-session-select');
        if (reportSelect) {
            const currentReportVal = reportSelect.value;
            reportSelect.innerHTML = '<option value="">— select session —</option>';
            sessions.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                const d = s.created_at ? new Date(s.created_at * 1000) : null;
                const ts = d ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
                const statusLabel = s.is_running ? 'RUNNING' : (s.status || 'done').toUpperCase();
                const label = s.name ? `${s.name} (${s.target})` : s.target;
                opt.textContent = `${s.id.slice(0, 8)} · ${label} · ${statusLabel} · ${ts}`;
                reportSelect.appendChild(opt);
            });
            if (currentReportVal) {
                reportSelect.value = currentReportVal;
            } else if (activeMissionId) {
                reportSelect.value = activeMissionId;
            } else if (sessions.length > 0) {
                reportSelect.value = sessions[0].id;
            }
        }

    } catch { /* ignore */ }
}

// ─── Agent Status Bar ─────────────────────────────────────────────────────────

const _AGENT_STATUS = {
    idle:       { dot: 'bg-border-color',  text: 'No active mission',    color: 'text-secondary-text', pulse: false },
    reasoning:  { dot: 'bg-yellow-400',   text: 'Reasoning...',          color: 'text-yellow-400',     pulse: true  },
    acting:     { dot: 'bg-blue-400',     text: 'Executing',             color: 'text-blue-400',       pulse: true  },
    reflecting: { dot: 'bg-purple-400',   text: 'Reflecting...',         color: 'text-purple-400',     pulse: true  },
    paused:     { dot: 'bg-yellow-600',   text: 'Paused',                color: 'text-yellow-500',     pulse: false },
    done:       { dot: 'bg-primary',      text: 'Mission complete',      color: 'text-primary',        pulse: false },
    error:      { dot: 'bg-danger',       text: 'Error',                 color: 'text-danger',         pulse: false },
    stopped:    { dot: 'bg-danger',       text: 'Stopped',               color: 'text-danger',         pulse: false },
};

function setAgentStatus(key, detail = '') {
    const s = _AGENT_STATUS[key] || _AGENT_STATUS.idle;
    const dot = document.getElementById('agent-status-dot');
    const text = document.getElementById('agent-status-text');
    const detailEl = document.getElementById('agent-status-detail');

    if (dot) {
        dot.className = `w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${s.dot} ${s.pulse ? 'animate-pulse' : ''}`;
    }
    if (text) {
        text.className = `text-[10px] mono-text uppercase tracking-widest transition-colors ${s.color}`;
        text.textContent = s.text;
    }
    if (detailEl) {
        if (detail) {
            detailEl.textContent = '· ' + detail;
            detailEl.classList.remove('hidden');
        } else {
            detailEl.classList.add('hidden');
        }
    }
}

// ─── Session Switcher ─────────────────────────────────────────────────────────

let _sessionSwitcherOpen = false;
let viewingSessionId = null;  // session currently being viewed (may differ from activeMissionId)

function initSessionSwitcher() {
    const btn = document.getElementById('session-switcher-btn');
    const dropdown = document.getElementById('session-switcher-dropdown');
    const closeBtn = document.getElementById('session-dropdown-close');

    if (btn) btn.addEventListener('click', () => {
        _sessionSwitcherOpen ? closeSessionSwitcher() : openSessionSwitcher();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeSessionSwitcher);

    document.addEventListener('click', (e) => {
        if (!_sessionSwitcherOpen) return;
        if (dropdown && !dropdown.contains(e.target) && btn && !btn.contains(e.target)) {
            closeSessionSwitcher();
        }
    });
}

async function openSessionSwitcher() {
    const dropdown = document.getElementById('session-switcher-dropdown');
    const list = document.getElementById('session-switcher-list');
    if (!dropdown || !list) return;

    _sessionSwitcherOpen = true;
    dropdown.classList.remove('hidden');
    list.innerHTML = '<div class="px-4 py-3 text-[10px] mono-text text-secondary-text">Loading...</div>';

    try {
        const res = await fetch('/api/v1/sessions');
        const sessions = await res.json();

        if (!sessions.length) {
            list.innerHTML = '<div class="px-4 py-3 text-[10px] mono-text text-secondary-text">No sessions yet</div>';
            return;
        }

        list.innerHTML = '';
        sessions.forEach(s => {
            const d = s.created_at ? new Date(s.created_at * 1000) : null;
            const ts = d ? d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '';
            const isRunning = s.is_running;
            // DB status "running" but no live task means the server restarted mid-session
            const effStatus = isRunning ? 'running' : (s.status === 'running' ? 'stopped' : (s.status || 'done'));
            const statusLabel = effStatus.toUpperCase();
            const statusColor = effStatus === 'running' ? 'text-primary' : (effStatus === 'done' ? 'text-slate-400' : 'text-danger');
            const isViewing = s.id === (viewingSessionId || activeMissionId);
            const displayName = s.name ? s.name : s.target;

            const item = document.createElement('div');
            item.className = `w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors border-b border-border-color/30 ${isViewing ? 'bg-primary/5' : ''} group/sitem flex items-start gap-2`;
            item.dataset.sessionId = s.id;
            const clickArea = document.createElement('button');
            clickArea.className = 'flex-1 text-left min-w-0';
            clickArea.innerHTML = `
                <div class="flex items-center justify-between mb-0.5">
                    <span class="text-[10px] mono-text font-bold text-slate-200 truncate">${_esc(displayName)}</span>
                    <span class="text-[9px] font-bold ${statusColor} uppercase ml-2 shrink-0">${statusLabel}</span>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[9px] mono-text text-secondary-text">${s.id.slice(0, 8).toUpperCase()}</span>
                    ${s.name ? `<span class="text-[9px] mono-text text-secondary-text truncate">${_esc(s.target)}</span>` : ''}
                    <span class="text-[9px] mono-text text-secondary-text">${_esc(s.mode || '')}</span>
                    <span class="text-[9px] mono-text text-secondary-text">${ts}</span>
                </div>`;
            clickArea.addEventListener('click', () => {
                closeSessionSwitcher();
                switchToSession(s.id);
            });
            const btnGroup = document.createElement('div');
            btnGroup.className = 'flex flex-col gap-1 shrink-0 opacity-0 group-hover/sitem:opacity-100 transition-opacity mt-0.5';

            const renBtn = document.createElement('button');
            renBtn.className = 'text-secondary-text hover:text-primary transition-colors';
            renBtn.title = 'Rename mission';
            renBtn.innerHTML = '<span class="material-symbols-outlined text-[13px]">edit</span>';
            renBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeSessionSwitcher();
                showPrompt({
                    title: 'Name Mission',
                    label: 'Mission name',
                    icon: 'edit',
                    defaultValue: s.name || s.target,
                    onConfirm: async (name) => {
                        try {
                            await fetch(`/api/v1/sessions/${s.id}/name`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name }),
                            });
                            showToast('Mission renamed');
                            if (viewingSessionId === s.id || activeMissionId === s.id) {
                                updateMissionStatusHeader(effStatus, s.id, name);
                            }
                            openSessionSwitcher();
                        } catch { showToast('Rename failed'); }
                    },
                });
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'text-secondary-text hover:text-danger transition-colors';
            delBtn.title = 'Delete mission';
            delBtn.innerHTML = '<span class="material-symbols-outlined text-[13px]">delete</span>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeSessionSwitcher();
                showConfirm({
                    title: 'Delete Mission',
                    message: `Delete mission "${s.name || s.target}"? This cannot be undone.`,
                    onConfirm: async () => {
                        try {
                            await fetch(`/api/v1/sessions/${s.id}`, { method: 'DELETE' });
                            showToast('Mission deleted');
                            if (viewingSessionId === s.id) { viewingSessionId = null; }
                            if (activeMissionId === s.id) { activeMissionId = null; updateMissionStatusHeader('idle', null, ''); _currentMissionName = ''; }
                            loadSessionsForSelects();
                        } catch { showToast('Delete failed'); }
                    },
                });
            });

            btnGroup.appendChild(renBtn);
            btnGroup.appendChild(delBtn);
            item.appendChild(clickArea);
            item.appendChild(btnGroup);
            list.appendChild(item);
        });
    } catch {
        list.innerHTML = '<div class="px-4 py-3 text-[10px] mono-text text-danger">Failed to load sessions</div>';
    }
}

function closeSessionSwitcher() {
    const dropdown = document.getElementById('session-switcher-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    _sessionSwitcherOpen = false;
}

async function switchToSession(sessionId) {
    // Stop any active poll before switching — prevents stats from being overwritten
    // by a previously active mission while viewing a different session
    stopMissionPoll();

    try {
        const res = await fetch(`/api/v1/sessions/${sessionId}`);
        if (!res.ok) { showToast('Failed to load session'); return; }
        const session = await res.json();

        viewingSessionId = sessionId;

        // Treat DB status "running" with no live task as "stopped" (server restarted)
        const isRunning = session.is_running;
        const dbStatus = session.status || 'done';
        const effectiveStatus = isRunning ? 'running' : (dbStatus === 'running' ? 'stopped' : dbStatus);
        const missionDisplayName = session.name || session.target || sessionId.slice(0, 8);
        updateMissionStatusHeader(effectiveStatus, sessionId, missionDisplayName);

        // Compute stats — prefer DB summary fields, fall back to counting attached arrays
        // (DB summary may be 0 if the session was stopped before the final update)
        const hostsFound = session.hosts_found ||
            new Set((session.scan_results || []).flatMap(r => (r.hosts || []).map(h => h.ip))).size;
        const vulnsFound = session.vulns_found || (session.vulnerabilities || []).length;
        const portsFound = session.ports_found ||
            (session.scan_results || []).flatMap(r => (r.hosts || []).flatMap(h => h.ports || [])).length;

        setStatValue('stat-vulns', vulnsFound || '—');
        setStatValue('stat-hosts', hostsFound || '—');
        setStatValue('stat-ports', portsFound || '—');

        // Populate intel panels from stored session data
        if (Array.isArray(session.vulnerabilities) && session.vulnerabilities.length > 0) {
            _analysisVulns = session.vulnerabilities;
            updateAnalysisPanelFromSearchsploit({ output: JSON.stringify({ vulnerabilities: session.vulnerabilities }) });
        }
        updateNetworkPanelFromSession(session);
        // For historical sessions: reconstruct timeline from existing data
        {
            const hist_hosts    = _mergeHosts((session.scan_results || []).flatMap(r => r.hosts || []));
            const hist_exploits = session.exploit_results || [];
            if (hist_hosts.length > 0 && _topoEvents.length === 0) {
                _topoReconstructEvents(hist_hosts, hist_exploits);
                _topoUpdateTimeline();
            }
        }

        // Switch to agent view
        switchView('agent');
        clearMissionFeed();

        if (isRunning) {
            hideResumeFromSessionBtn();
            // Live session — subscribe to WS events and restart uptime from session start
            activeMissionId = sessionId;
            patchWsSessionHandler();
            if (ws && wsReady) {
                ws.send(JSON.stringify({ type: 'subscribe_session', session_id: sessionId }));
            }
            startMissionPoll(sessionId);
            startMissionUptime(session.created_at * 1000);
            showPauseMissionBtn();
            updatePauseButton();
            setAgentStatus('reasoning');
            syncInputMode();
        } else {
            // Historical session — stop timer, show fixed session duration
            stopMissionUptime();
            const dur = session.finished_at
                ? Math.floor(session.finished_at - session.created_at)
                : (session.updated_at ? Math.floor(session.updated_at - session.created_at) : 0);
            setUptimeFromDuration(dur);
            // do NOT touch activeMissionId (new missions can still start)
            hidePauseMissionBtn();
            showResumeFromSessionBtn();
            const agentStatus = (effectiveStatus === 'error' || effectiveStatus === 'stopped') ? 'error' : 'done';
            setAgentStatus(agentStatus, `${missionDisplayName} — historical`);
            syncInputMode();

            // Try to replay stored events; fall back to summary view
            try {
                const evRes = await fetch(`/api/v1/sessions/${sessionId}/events`);
                const evData = evRes.ok ? await evRes.json() : null;
                if (evData && evData.events && evData.events.length > 0) {
                    renderMissionStart(session.target, session.mode);
                    agOnMissionStart({ target: session.target, mode: session.mode });
                    evData.events.forEach(ev => replaySessionEvent(ev.event_type, ev.data));
                    // Always render graph after full replay and fit view
                    setTimeout(function(){ _agRender(); setTimeout(agZoomFit, 100); }, 150);
                } else {
                    renderHistoricalSession(session);
                }
            } catch {
                renderHistoricalSession(session);
            }

            // Show mission done card for completed sessions
            if (effectiveStatus === 'done') {
                renderMissionDone({
                    hosts:    session.hosts_found   || hostsFound || 0,
                    vulns:    session.vulns_found   || vulnsFound || 0,
                    exploits: session.exploits_run  || 0,
                });
            }
        }

    } catch (err) {
        showToast('Error loading session: ' + err.message);
    }
}

function replaySessionEvent(event, data) {
    switch (event) {
        case 'reasoning':
            _closeToolBatch();
            renderMissionReasoning(data);
            updatePhaseFromEvent(data);
            agOnThinking(data);
            break;
        case 'tool_call':
            _openOrAddToToolBatch(data);
            agOnToolCall(data);
            break;
        case 'tool_result':
            if (!_resolveToolBatchItem(data)) renderMissionToolResult(data);
            agOnToolResult(data);
            break;
        case 'reflection':
            renderMissionReflection(data);
            agOnReflection(data);
            break;
        case 'safety_block':
            renderMissionSafetyBlock(data);
            break;
        case 'error':
            renderMissionError(data);
            break;
        case 'parallel_start':
            agOnParallelStart(data);
            break;
        case 'parallel_done':
            agOnParallelDone(data);
            break;
        case 'phase_change':
        case 'observation':
        case 'discovery':
            updatePhaseFromEvent(data);
            break;
        case 'done':
            setPhaseActive(5);
            break;
        default:
            break;
    }
}

function renderHistoricalSession(session) {
    const ts = session.created_at ? new Date(session.created_at * 1000).toLocaleString() : '';

    appendMissionCard(`
        <div class="border border-border-color/60 bg-surface px-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 text-secondary-text font-bold mb-2">
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1;">history</span>
                HISTORICAL SESSION · ${_esc(ts)}
            </div>
            <div class="text-secondary-text">
                TARGET &nbsp;<span class="text-slate-200">${_esc(session.target)}</span>
                &nbsp;&nbsp; MODE &nbsp;<span class="text-slate-200">${_esc((session.mode || '').toUpperCase())}</span>
                &nbsp;&nbsp; STATUS &nbsp;<span class="text-slate-200">${_esc((session.status || '').toUpperCase())}</span>
            </div>
        </div>
    `);

    if (session.scan_results && session.scan_results.length > 0) {
        const items = session.scan_results.slice(0, 20).map(r =>
            `<div class="text-secondary-text">${_esc(String(r.ip || ''))}:${_esc(String(r.port || ''))} <span class="text-slate-300">${_esc(r.service || '')} ${_esc(r.version || '')}</span></div>`
        ).join('');
        appendMissionCard(`
            <div class="bg-surface pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(204,255,0,0.25);border-left:4px solid #ccff00;">
                <div class="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-widest mb-2">
                    <span class="material-symbols-outlined text-[13px]">search</span>
                    SCAN RESULTS · ${session.scan_results.length} ports found
                </div>
                ${items}
                ${session.scan_results.length > 20 ? `<div class="text-secondary-text text-[10px] mt-1">… and ${session.scan_results.length - 20} more</div>` : ''}
            </div>
        `);
    }

    if (session.vulnerabilities && session.vulnerabilities.length > 0) {
        const items = session.vulnerabilities.slice(0, 15).map(v =>
            `<div class="flex items-start gap-2"><span class="text-danger shrink-0">▸</span><span class="text-slate-300">${_esc(v.title || v.description || String(v).slice(0, 100))}</span></div>`
        ).join('');
        appendMissionCard(`
            <div class="bg-surface pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(239,68,68,0.35);border-left:4px solid #ef4444;">
                <div class="flex items-center gap-2 text-danger font-bold text-[10px] uppercase tracking-widest mb-2">
                    <span class="material-symbols-outlined text-[13px]">bug_report</span>
                    VULNERABILITIES · ${session.vulnerabilities.length} found
                </div>
                ${items}
            </div>
        `);
    }

    if (session.exploit_results && session.exploit_results.length > 0) {
        const items = session.exploit_results.map(e =>
            `<div class="text-${e.success ? 'primary' : 'danger'}">${e.success ? '✓' : '✗'} ${_esc(e.module || '')} → ${_esc(e.target_ip || '')}</div>`
        ).join('');
        appendMissionCard(`
            <div class="bg-surface pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(249,115,22,0.35);border-left:4px solid #f97316;">
                <div class="flex items-center gap-2 text-orange-400 font-bold text-[10px] uppercase tracking-widest mb-2">
                    <span class="material-symbols-outlined text-[13px]">bolt</span>
                    EXPLOIT RESULTS · ${session.exploit_results.length} attempts
                </div>
                ${items}
            </div>
        `);
    }

    if (!session.scan_results?.length && !session.vulnerabilities?.length && !session.exploit_results?.length) {
        appendMissionCard(`
            <div class="bg-surface pl-4 pr-4 py-3 font-mono text-xs" style="border:1px solid rgba(255,255,255,0.1);border-left:4px solid rgba(255,255,255,0.2);">
                <div class="text-secondary-text text-[11px]">No detailed findings stored for this session.</div>
            </div>
        `);
    }
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────

let missionPaused = false;

function showPauseMissionBtn() {
    const btn = document.getElementById('pause-mission-btn');
    if (btn) btn.classList.remove('hidden');
}

function hidePauseMissionBtn() {
    const btn = document.getElementById('pause-mission-btn');
    if (btn) btn.classList.add('hidden');
}

function showResumeFromSessionBtn() {
    const btn = document.getElementById('resume-from-session-btn');
    if (btn) btn.classList.remove('hidden');
}

function hideResumeFromSessionBtn() {
    const btn = document.getElementById('resume-from-session-btn');
    if (btn) btn.classList.add('hidden');
}

function updatePauseButton() {
    const btn = document.getElementById('pause-mission-btn');
    if (!btn) return;
    if (missionPaused) {
        btn.textContent = 'Resume';
        btn.classList.remove('border-yellow-500/60', 'text-yellow-400', 'hover:bg-yellow-500/10');
        btn.classList.add('border-primary', 'text-primary', 'hover:bg-primary/10');
    } else {
        btn.textContent = 'Pause';
        btn.classList.remove('border-primary', 'text-primary', 'hover:bg-primary/10');
        btn.classList.add('border-yellow-500/60', 'text-yellow-400', 'hover:bg-yellow-500/10');
    }
}

function initPauseControls() {
    const pauseBtn = document.getElementById('pause-mission-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', togglePauseMission);
    const resumeFromBtn = document.getElementById('resume-from-session-btn');
    if (resumeFromBtn) {
        resumeFromBtn.addEventListener('click', () => {
            if (viewingSessionId) resumeMissionFromSession(viewingSessionId);
            else showToast('Select a session first');
        });
    }
}

async function togglePauseMission() {
    const sessionId = activeMissionId || viewingSessionId;
    if (!sessionId) { showToast('No active mission'); return; }

    const endpoint = missionPaused ? 'resume' : 'pause';
    try {
        const res = await fetch(`/api/v1/sessions/${sessionId}/${endpoint}`, { method: 'POST' });
        const data = await res.json();
        if (!data.ok) showToast('Could not pause/resume — agent may not be running');
    } catch (err) {
        showToast('Error: ' + err.message);
    }
}

// ─── Nmap Config ──────────────────────────────────────────────────────────────

async function saveNmapSudo(enabled) {
    try {
        await fetch('/api/v1/config/nmap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nmap_sudo: enabled }),
        });
    } catch (_) {}
}

async function initNmapConfig() {
    // Fetch combined nmap config + platform info
    let platform = 'linux';
    let isElevated = false;
    let nmapSudo = false;
    try {
        const res = await fetch('/api/v1/config/nmap');
        if (res.ok) {
            const d = await res.json();
            platform = d.platform || 'linux';
            isElevated = !!d.is_elevated;
            nmapSudo = !!d.nmap_sudo;
        }
    } catch (_) {}

    if (platform === 'windows') {
        // ── Windows: show admin status badge ──────────────────────────────────
        document.getElementById('nmap-admin-section')?.classList.remove('hidden');
        const badge = document.getElementById('nmap-admin-badge');
        const hint  = document.getElementById('nmap-admin-hint');
        if (badge) {
            if (isElevated) {
                badge.textContent = 'Administrator';
                badge.className = 'text-[10px] mono-text px-2 py-1 border border-primary/40 text-primary bg-primary/10 shrink-0';
            } else {
                badge.textContent = 'Standard User';
                badge.className = 'text-[10px] mono-text px-2 py-1 border border-amber-500/40 text-amber-400 bg-amber-500/10 shrink-0';
                hint?.classList.remove('hidden');
            }
        }
    } else {
        // ── Linux / macOS: show sudo toggle + password ─────────────────────────
        document.getElementById('nmap-sudo-section')?.classList.remove('hidden');

        const cb = document.getElementById('cfg-nmap-sudo');
        if (cb) {
            cb.checked = nmapSudo;
            cb.addEventListener('change', () => saveNmapSudo(cb.checked));
        }

        // Sudo password save
        document.getElementById('save-sudo-btn')?.addEventListener('click', async () => {
            const pw = document.getElementById('cfg-sudo-pass')?.value?.trim();
            if (!pw) { showToast('Enter a sudo password first'); return; }
            const btn = document.getElementById('save-sudo-btn');
            if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
            try {
                const res = await fetch('/api/v1/config/sudo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pw }),
                });
                if (res.ok) {
                    showToast('Sudo password saved');
                    const input = document.getElementById('cfg-sudo-pass');
                    if (input) input.value = '';
                } else {
                    showToast('Failed to save sudo password');
                }
            } catch { showToast('Error saving sudo password'); }
            finally {
                if (btn) { btn.textContent = 'Save Password'; btn.disabled = false; }
            }
        });

        // Show indicator if sudo password is already configured
        fetch('/api/v1/config/sudo')
            .then(r => r.json())
            .then(d => {
                if (d.has_password) {
                    const input = document.getElementById('cfg-sudo-pass');
                    if (input) input.placeholder = '(configured)';
                }
            }).catch(() => {});
    }
}

// ─── Audit Log View ────────────────────────────────────────────────────────────

let auditCurrentFilter = 'ALL';
// Cache last loaded entries for export
let _auditLastEntries = [];

function initAuditView() {
    const sessionSelect = document.getElementById('audit-session-select');
    const searchInput = document.getElementById('audit-search-input');
    const filterBtns = document.querySelectorAll('.audit-filter-btn');
    const exportBtn = document.getElementById('audit-export-btn');

    if (sessionSelect) {
        sessionSelect.addEventListener('change', () => loadAuditLogs());
    }
    if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => loadAuditLogs(), 400);
        });
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Toggle active styling
            filterBtns.forEach(b => {
                b.classList.remove('bg-primary', 'text-black');
                b.classList.add('text-secondary-text');
            });
            btn.classList.add('bg-primary', 'text-black');
            btn.classList.remove('text-secondary-text');

            auditCurrentFilter = (btn.dataset.filter || 'all').toUpperCase();
            loadAuditLogs();
        });
    });

    if (exportBtn) {
        exportBtn.addEventListener('click', exportAuditCSV);
    }

    // Load on view switch
    const auditNavItem = document.querySelector('[data-view="audit"]');
    if (auditNavItem) {
        auditNavItem.addEventListener('click', () => {
            loadAuditLogs();
        });
    }
}

async function loadAuditLogs() {
    const sessionSelect = document.getElementById('audit-session-select');
    const searchInput = document.getElementById('audit-search-input');
    const tbody = document.getElementById('audit-table-body');
    const countEl = document.getElementById('audit-count');

    const sessionId = sessionSelect ? sessionSelect.value : '';
    const search = searchInput ? searchInput.value.trim() : '';
    const filter = auditCurrentFilter !== 'ALL' ? auditCurrentFilter.toLowerCase() : '';

    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', sessionId);
    if (filter) params.set('event_type', filter);
    if (search) params.set('search', search);
    params.set('limit', '500');

    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-secondary-text text-xs mono-text">
          <span class="material-symbols-outlined text-[14px] align-middle animate-spin mr-1">progress_activity</span>Loading...</td></tr>`;
    }

    try {
        const res = await fetch(`/api/v1/audit?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const entries = data.entries || [];
        _auditLastEntries = entries;

        if (tbody) {
            if (entries.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-secondary-text text-xs mono-text">No audit log entries found</td></tr>`;
            } else {
                tbody.innerHTML = entries.map(e => buildAuditRow(e)).join('');
            }
        }
        if (countEl) countEl.textContent = `Showing ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;

    } catch (err) {
        _auditLastEntries = [];
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-danger text-xs">Failed to load audit logs: ${escapeHtml(err.message)}</td></tr>`;
        if (countEl) countEl.textContent = 'Error';
    }
}

function exportAuditCSV() {
    if (!_auditLastEntries.length) {
        showToast('No entries to export — load logs first');
        return;
    }
    // Excel uses ';' as CSV delimiter when the system decimal separator is ',' (e.g. Turkish, German)
    // and ',' when the decimal separator is '.' (e.g. English). Auto-detect via locale.
    const SEP = (1.1).toLocaleString().includes(',') ? ';' : ',';
    const q = v => '"' + String(v ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""') + '"';

    const header = ['Timestamp', 'Session', 'Event', 'Tool', 'Target', 'Details', 'Status'];
    const rows = _auditLastEntries.map(entry => {
        const ts = entry.created_at
            ? new Date(entry.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19)
            : '';
        const sid = entry.session_id ? entry.session_id.slice(0, 8).toUpperCase() : '';
        const event = entry.event_type || '';
        const tool = entry.tool_name || '';
        const target = entry.target || '';
        let details = '';
        if (entry.details && typeof entry.details === 'object') {
            details = JSON.stringify(entry.details);
        } else if (entry.details) {
            details = String(entry.details);
        }
        const status = _auditStatusText(event);
        return [ts, sid, event, tool, target, details, status].map(q).join(SEP);
    });

    // UTF-8 BOM so Excel opens with correct encoding
    const bom = '\uFEFF';
    const csv = bom + [header.map(q).join(SEP), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${_auditLastEntries.length} entries`);
}

function _auditStatusText(event) {
    if (event.includes('KILL') || event.includes('BLOCK')) return 'BLOCKED';
    if (event.includes('ERROR')) return 'ERROR';
    if (event.includes('SUCCESS') || event.includes('START')) return 'OK';
    if (event.includes('END') || event.includes('DONE')) return 'DONE';
    return 'INFO';
}

function buildAuditRow(entry) {
    const ts = entry.created_at
        ? new Date(entry.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19)
        : '—';
    const sid = entry.session_id ? entry.session_id.slice(0, 8).toUpperCase() : '—';
    const event = entry.event_type || '—';
    const target = entry.target || '—';

    // Parse details JSON if stored as string
    let details = entry.details || {};
    if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch (_) { details = {}; }
    }

    // Build a human-readable action/detail summary
    let actionText = entry.tool_name || '';
    if (event === 'NMAP_SCAN') {
        const hp = `${details.hosts_found ?? '?'} host(s), ${(details.open_ports || []).length} open port(s)`;
        actionText = `nmap_scan → ${hp}`;
    } else if (event === 'EXPLOIT_FOUND') {
        actionText = `searchsploit → ${details.count ?? '?'} exploit(s) found`;
    } else if (event === 'METASPLOIT_RUN') {
        actionText = `${details.module || 'metasploit'} → ${details.session_opened ? 'SESSION OPENED' : 'no session'}`;
    } else if (event === 'TOOL_CALL') {
        const paramsStr = details.params ? JSON.stringify(details.params).slice(0, 80) : '';
        actionText = `${entry.tool_name}${paramsStr ? ' ' + paramsStr : ''}`;
    } else if (event === 'TOOL_RESULT') {
        actionText = `${entry.tool_name} → ${details.success ? 'success' : (details.error || 'failed')}`;
    } else if (event === 'SAFETY_BLOCK') {
        actionText = `${entry.tool_name} blocked: ${details.reason || ''}`;
    } else if (!actionText) {
        actionText = details ? JSON.stringify(details).slice(0, 80) : '—';
    }

    const eventColor = getAuditEventColor(event);
    const statusBadge = getAuditStatusBadge(event, details);
    const rowBg = event.includes('KILL') || event.includes('BLOCK') ? ' bg-danger/5'
        : event === 'METASPLOIT_RUN' && details.session_opened ? ' bg-orange-500/5' : '';

    return `<tr class="border-b border-border-color hover:bg-surface transition-colors${rowBg}">
      <td class="px-6 py-3 text-secondary-text">${escapeHtml(ts)}</td>
      <td class="px-4 py-3 text-slate-400">${escapeHtml(sid)}</td>
      <td class="px-4 py-3"><span class="${eventColor} font-bold">${escapeHtml(event)}</span></td>
      <td class="px-4 py-3 text-slate-300 max-w-[400px] truncate" title="${escapeHtml(actionText)}">${escapeHtml(actionText)}</td>
      <td class="px-4 py-3 text-slate-300">${escapeHtml(target)}</td>
      <td class="px-4 py-3">${statusBadge}</td>
    </tr>`;
}

function getAuditEventColor(event) {
    if (event.includes('KILL') || event.includes('BLOCK') || event.includes('ERROR')) return 'text-danger';
    if (event === 'METASPLOIT_RUN' || event === 'EXPLOIT_FOUND') return 'text-orange-400';
    if (event === 'NMAP_SCAN') return 'text-sky-400';
    if (event === 'TOOL_CALL') return 'text-slate-300';
    if (event === 'TOOL_RESULT') return 'text-slate-400';
    if (event.includes('START') || event.includes('SUCCESS') || event.includes('OK')) return 'text-primary';
    if (event.includes('END') || event.includes('DONE')) return 'text-secondary-text';
    return 'text-slate-300';
}

function getAuditStatusBadge(event, details) {
    if (event.includes('KILL') || event.includes('BLOCK')) {
        return '<span class="px-2 py-0.5 bg-danger/10 border border-danger/20 text-danger text-[8px] font-bold uppercase">BLOCKED</span>';
    }
    if (event.includes('ERROR')) {
        return '<span class="px-2 py-0.5 bg-danger/10 border border-danger/20 text-danger text-[8px] font-bold uppercase">ERROR</span>';
    }
    if (event === 'TOOL_RESULT') {
        const ok = details && (details.success === true || details.success === 'true');
        return ok
            ? '<span class="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[8px] font-bold uppercase">OK</span>'
            : '<span class="px-2 py-0.5 bg-danger/10 border border-danger/20 text-danger text-[8px] font-bold uppercase">FAIL</span>';
    }
    if (event === 'METASPLOIT_RUN') {
        const pwned = details && details.session_opened;
        return pwned
            ? '<span class="px-2 py-0.5 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[8px] font-bold uppercase">PWNED</span>'
            : '<span class="px-2 py-0.5 bg-white/5 border border-border-color text-secondary-text text-[8px] font-bold uppercase">NO SESSION</span>';
    }
    if (event.includes('START') || event === 'TOOL_CALL' || event === 'NMAP_SCAN' || event === 'EXPLOIT_FOUND') {
        return '<span class="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-[8px] font-bold uppercase">OK</span>';
    }
    if (event.includes('END') || event.includes('DONE')) {
        return '<span class="px-2 py-0.5 bg-white/5 border border-border-color text-secondary-text text-[8px] font-bold uppercase">DONE</span>';
    }
    return '<span class="px-2 py-0.5 bg-white/5 border border-border-color text-secondary-text text-[8px] font-bold uppercase">INFO</span>';
}

// ─── Report View ───────────────────────────────────────────────────────────────

let reportSessionId = null;

function initReportView() {
    const genBtn = document.getElementById('generate-report-btn');
    const htmlBtn = document.getElementById('export-html-btn');
    const pdfBtn = document.getElementById('download-pdf-btn');
    const sessionSelect = document.getElementById('report-session-select');

    if (genBtn) genBtn.addEventListener('click', generateReport);
    if (htmlBtn) htmlBtn.addEventListener('click', exportReportHTML);
    if (pdfBtn) pdfBtn.addEventListener('click', downloadReportPDF);

    if (sessionSelect) {
        sessionSelect.addEventListener('change', () => {
            reportSessionId = sessionSelect.value || null;
            if (reportSessionId) {
                generateReport();
            } else {
                _reportShowEmpty();
            }
        });
    }

    // Auto-load when switching to report view
    const reportNavItem = document.querySelector('[data-view="report"]');
    if (reportNavItem) {
        reportNavItem.addEventListener('click', () => {
            // Prefer active mission; fall back to first session in dropdown
            if (!reportSessionId) {
                const sel = document.getElementById('report-session-select');
                if (activeMissionId) {
                    reportSessionId = activeMissionId;
                    if (sel) sel.value = activeMissionId;
                } else if (sel && sel.options.length > 1) {
                    reportSessionId = sel.options[1].value;
                    sel.value = reportSessionId;
                }
            }
            if (reportSessionId) {
                generateReport();
            }
        });
    }
}

function _reportShowEmpty(msg) {
    const container = document.getElementById('report-content');
    if (!container) return;
    const text = msg || 'Select a session and click Generate';
    container.innerHTML = `<div id="report-empty-state" class="flex flex-col items-center justify-center gap-4 py-24 text-secondary-text">
      <span class="material-symbols-outlined text-5xl opacity-30">summarize</span>
      <p class="text-[11px] tracking-widest uppercase opacity-60">${escapeHtml(text)}</p>
    </div>`;
}

function _reportShowLoading() {
    const container = document.getElementById('report-content');
    if (!container) return;
    container.innerHTML = `<div class="flex flex-col items-center justify-center gap-4 py-24 text-secondary-text">
      <span class="material-symbols-outlined text-3xl opacity-40 animate-spin">progress_activity</span>
      <p class="text-[11px] tracking-widest uppercase opacity-60">Generating report…</p>
    </div>`;
}

async function generateReport() {
    const sel = document.getElementById('report-session-select');
    const sid = reportSessionId || (sel ? sel.value : null) || activeMissionId;
    if (!sid) {
        _reportShowEmpty('No session selected — start a mission first');
        return;
    }
    reportSessionId = sid;
    if (sel && sel.value !== sid) sel.value = sid;

    const btn = document.getElementById('generate-report-btn');
    if (btn) {
        btn.querySelector('span').textContent = 'hourglass_empty';
        btn.disabled = true;
        btn.style.opacity = '0.6';
    }
    _reportShowLoading();

    try {
        const res = await fetch(`/api/v1/sessions/${sid}/report/html`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        injectReportContent(html);
        showToast('Report generated');
    } catch (err) {
        _reportShowEmpty(`Failed to generate report: ${err.message}`);
        showToast('Report generation failed: ' + err.message, true);
    } finally {
        if (btn) {
            btn.querySelector('span').textContent = 'refresh';
            btn.disabled = false;
            btn.style.opacity = '';
        }
    }
}

function injectReportContent(htmlString) {
    const container = document.getElementById('report-content');
    if (!container) return;

    if (!htmlString || !htmlString.trim()) {
        _reportShowEmpty('Report content is empty — the session may have no findings yet');
        return;
    }

    // Render in an iframe for proper style isolation — the report has its own CSS
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'w-full flex flex-col';
    wrapper.style.cssText = 'background:#f6f8fa; border:1px solid var(--border-color,#2a3040); border-radius:4px; overflow:hidden;';

    // Toolbar strip above the iframe
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 12px; background:#161b22; border-bottom:1px solid #30363d;';
    toolbar.innerHTML = `
      <span class="material-symbols-outlined" style="font-size:14px; color:#8b949e;">description</span>
      <span style="font-size:10px; font-family:monospace; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#8b949e;">Pentest Report</span>
      <span id="report-page-info" style="font-size:10px; color:#6e7681; margin-left:auto;"></span>
      <button onclick="document.getElementById('report-iframe').contentWindow.print()"
        style="display:flex; align-items:center; gap:4px; background:transparent; border:1px solid #30363d; color:#8b949e; padding:3px 10px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; cursor:pointer; border-radius:3px;"
        title="Print / Save as PDF">
        <span class="material-symbols-outlined" style="font-size:12px;">print</span> Print
      </button>`;
    wrapper.appendChild(toolbar);

    // The iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'report-iframe';
    iframe.style.cssText = 'width:100%; border:none; background:#ffffff; min-height:80vh;';
    iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups');
    iframe.title = 'Pentest Report';
    wrapper.appendChild(iframe);

    container.appendChild(wrapper);

    // Write HTML into iframe
    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(htmlString);
    iDoc.close();

    // Auto-resize iframe to content height after load
    iframe.addEventListener('load', () => {
        try {
            const h = iframe.contentDocument.documentElement.scrollHeight;
            iframe.style.height = Math.max(h, 600) + 'px';
        } catch {
            iframe.style.height = '2400px';
        }
    });
}

function exportReportHTML() {
    const sid = reportSessionId || activeMissionId;
    if (!sid) { showToast('No session to export'); return; }
    window.open(`/api/v1/sessions/${sid}/report/html`, '_blank');
}

function downloadReportPDF() {
    const sid = reportSessionId || activeMissionId;
    if (!sid) { showToast('No session — start a mission first'); return; }
    showToast('Opening PDF download…');
    window.open(`/api/v1/sessions/${sid}/report/pdf`, '_blank');
}

function updateReportBadge(sessionId) {
    // Legacy helper kept for compatibility; the badge is now the select element
    const sel = document.getElementById('report-session-select');
    if (sel && sessionId && sel.value !== sessionId) sel.value = sessionId;
}

// ─── Safety Config Load/Save ───────────────────────────────────────────────────

async function loadSafetyConfig() {
    try {
        const res = await fetch('/api/v1/config/safety');
        if (!res.ok) return;
        const d = await res.json();

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        set('cfg-safety-scope', d.allowed_cidr || '');
        // Port scope: format as "min-max"
        const portMin = d.allowed_port_min || 1;
        const portMax = d.allowed_port_max || 65535;
        set('cfg-safety-ports', `${portMin}-${portMax}`);
        set('cfg-safety-excluded-ips', d.excluded_ips || '');
        set('cfg-safety-excluded-ports', d.excluded_ports || '');
        setChk('cfg-safety-allow-exploits', d.allow_exploit !== false);
        setChk('cfg-safety-block-dos', d.block_dos_exploits !== false);
        setChk('cfg-safety-block-destructive', d.block_destructive !== false);
        set('cfg-safety-max-severity', d.max_severity || 'CRITICAL');
        set('cfg-safety-time-limit', String(d.session_max_seconds || 7200));
        set('cfg-safety-rate-limit', String(d.max_requests_per_second || 50));
    } catch { /* ignore */ }
}

async function saveSafetyConfig() {
    const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : true; };

    // Parse port range "min-max"
    const portRange = get('cfg-safety-ports').split('-');
    const portMin = parseInt(portRange[0] || '1', 10);
    const portMax = parseInt(portRange[1] || '65535', 10);

    const body = {
        allowed_cidr: get('cfg-safety-scope') || '10.0.0.0/8',
        allowed_port_min: isNaN(portMin) ? 1 : portMin,
        allowed_port_max: isNaN(portMax) ? 65535 : portMax,
        excluded_ips: get('cfg-safety-excluded-ips'),
        excluded_ports: get('cfg-safety-excluded-ports'),
        allow_exploit: getChk('cfg-safety-allow-exploits'),
        block_dos_exploits: getChk('cfg-safety-block-dos'),
        block_destructive: getChk('cfg-safety-block-destructive'),
        max_severity: get('cfg-safety-max-severity') || 'CRITICAL',
        session_max_seconds: parseInt(get('cfg-safety-time-limit') || '7200', 10),
        max_requests_per_second: parseInt(get('cfg-safety-rate-limit') || '50', 10),
    };

    await fetch('/api/v1/config/safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ─── Metasploit Config Load/Save ───────────────────────────────────────────────

async function loadMsfConfig() {
    try {
        const res = await fetch('/api/v1/config/msf');
        if (!res.ok) return;
        const d = await res.json();

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        set('cfg-msf-host', d.host || '127.0.0.1');
        set('cfg-msf-port', String(d.port || 55553));
        const sslEl = document.getElementById('cfg-msf-ssl');
        if (sslEl) sslEl.checked = d.ssl === true;
    } catch { /* ignore */ }
}

async function saveMsfConfig() {
    const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const getChk = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };

    const body = {
        host: get('cfg-msf-host') || '127.0.0.1',
        port: parseInt(get('cfg-msf-port') || '55553', 10),
        password: get('cfg-msf-pass') || '',
        ssl: getChk('cfg-msf-ssl'),
    };

    await fetch('/api/v1/config/msf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ─── Extended saveConfig (wraps existing + adds safety + msf) ─────────────────

const _origSaveConfig = saveConfig;
saveConfig = async function () {
    await _origSaveConfig();
    await saveSafetyConfig();
    await saveMsfConfig();
};

// ─── Toast helper extension ────────────────────────────────────────────────────

// Override showToast to support error styling
const _origShowToast = showToast;
showToast = function (msg, isError = false) {
    let toast = document.getElementById('aegis-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'aegis-toast';
        toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-card border border-border-color text-secondary-text text-[11px] font-display uppercase tracking-widest px-4 py-2 z-50 pointer-events-none transition-opacity duration-300';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.color = isError ? '#FF3B3B' : '';
    toast.style.borderColor = isError ? '#FF3B3B' : '';
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
};

// ─── Advanced Mission Config (full-page view) ─────────────────────────────────

// ── State ──────────────────────────────────────────────────────────────────────
const _adv = {
    savedCredIds: [],
    globalNeverScan: [],
};

// ── Open / Close (now uses switchView) ────────────────────────────────────────

function openAdvModal() {
    // Sync primary target from sidebar quick-launch field
    const sidebarTarget = document.getElementById('mission-target');
    const advTarget = document.getElementById('adv-primary-target');
    if (sidebarTarget && advTarget && sidebarTarget.value.trim() && !advTarget.value.trim()) {
        advTarget.value = sidebarTarget.value.trim();
    }
    switchView('mission');
    _advSwitchTab('targets');
    _advLoadGlobalNeverScan();
    _advLoadSavedCredentials();
    _advLoadProfilesList();
    advRefreshToolStatus();
    _advRestoreLastConfig();
}

async function _advRestoreLastConfig() {
    try {
        const res = await fetch('/api/v1/settings');
        if (!res.ok) return;
        const data = await res.json();
        const raw = data.last_mission_config;
        if (!raw) return;
        const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!saved || typeof saved !== 'object') return;

        // Restore target + extra targets
        if (saved.primaryTarget) {
            const el = document.getElementById('adv-primary-target');
            if (el && !el.value.trim()) el.value = saved.primaryTarget;
        }
        if (saved.scopeNotes) {
            const el = document.getElementById('adv-scope-notes');
            if (el) el.value = saved.scopeNotes;
        }
        if (saved.knownTech) {
            const el = document.getElementById('adv-known-tech');
            if (el) el.value = saved.knownTech;
        }
        if (saved.excludedPortsRaw) {
            const el = document.getElementById('adv-excluded-ports');
            if (el) el.value = saved.excludedPortsRaw;
        }
        if (saved.missionName) {
            const el = document.getElementById('adv-mission-name');
            if (el) el.value = saved.missionName;
        }
        if (saved.cfg) _advApplyConfig(saved.cfg);
    } catch (_) {}
}

async function _advPersistConfig() {
    try {
        const cfg = _advCollectConfig();
        const primaryTarget = document.getElementById('adv-primary-target')?.value.trim() || '';
        const scopeNotes = document.getElementById('adv-scope-notes')?.value.trim() || '';
        const knownTech = document.getElementById('adv-known-tech')?.value.trim() || '';
        const excludedPortsRaw = document.getElementById('adv-excluded-ports')?.value.trim() || '';
        const missionName = document.getElementById('adv-mission-name')?.value.trim() || '';
        const payload = JSON.stringify({ primaryTarget, scopeNotes, knownTech, excludedPortsRaw, missionName, cfg });
        await fetch('/api/v1/settings/last_mission_config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: payload }),
        });
    } catch (_) {}
}

function closeAdvModal() {
    switchView(previousView || 'agent');
}

// ── Init on DOMContentLoaded ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    _advInitTabs();
    _advInitModeButtons();
    _advInitSpeedButtons();
    _advInitScanTypeButtons();
    _advInitPortPresets();
    _advInitExploitCascade();
    _advInitVersionSlider();
    _initConsoleTabs();
    _initTerminalInput();
    _initShellInput();
});

// ── Tab Switching ──────────────────────────────────────────────────────────────

function _advInitTabs() {
    document.querySelectorAll('.adv-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => _advSwitchTab(btn.dataset.tab));
    });
}

function _advSwitchTab(tabName) {
    document.querySelectorAll('.adv-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.adv-tab-body').forEach(body => {
        const id = body.id.replace('adv-tab-', '');
        body.classList.toggle('hidden', id !== tabName);
    });
}

// ── Mode buttons (Scan Only / Ask / Full Auto) ─────────────────────────────────

const _advModeDesc = {
    scan_only: 'Scan and identify vulnerabilities — no exploitation.',
    ask_before_exploit: 'Agent will ask for confirmation before running any exploit.',
    full_auto: 'Agent exploits autonomously within configured safety limits.',
    v2_auto: 'V2 Multi-Agent: BrainAgent coordinates specialized sub-agents (scanner, exploit, post-exploit, webapp, osint, lateral, reporting).',
};

function _advInitModeButtons() {
    document.querySelectorAll('.adv-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.adv-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const desc = document.getElementById('adv-mode-desc');
            if (desc) desc.textContent = _advModeDesc[btn.dataset.mode] || '';
        });
    });
}

function _advGetMode() {
    const active = document.querySelector('.adv-mode-btn.active');
    return active ? active.dataset.mode : 'scan_only';
}

// ── Speed profile buttons ──────────────────────────────────────────────────────

function _advInitSpeedButtons() {
    document.querySelectorAll('.adv-speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.adv-speed-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function _advGetSpeedProfile() {
    const active = document.querySelector('.adv-speed-btn.active');
    return active ? active.dataset.speed : 'normal';
}

// ── Scan type buttons ──────────────────────────────────────────────────────────

function _advInitScanTypeButtons() {
    document.querySelectorAll('.adv-scan-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.adv-scan-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function _advGetScanType() {
    const scanTypeMap = { syn: 'service', connect: 'service', udp: 'service', full: 'full' };
    const active = document.querySelector('.adv-scan-type-btn.active');
    return scanTypeMap[active ? active.dataset.stype : 'syn'] || 'service';
}

// ── Port range presets ─────────────────────────────────────────────────────────

function _advInitPortPresets() {
    document.querySelectorAll('.adv-port-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('adv-port-range').value = btn.dataset.range;
        });
    });
}

// ── Version intensity slider ───────────────────────────────────────────────────

function _advInitVersionSlider() {
    const slider = document.getElementById('adv-version-intensity');
    const val = document.getElementById('adv-version-intensity-val');
    if (slider && val) {
        slider.addEventListener('input', () => { val.textContent = slider.value; });
    }
}

// ── Exploit permission cascade ─────────────────────────────────────────────────

function _advInitExploitCascade() {
    const exploit = document.getElementById('pol-allow-exploit');
    if (!exploit) return;
    exploit.addEventListener('change', () => {
        const enabled = exploit.checked;
        ['pol-allow-post', 'pol-allow-lateral', 'pol-allow-docker'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = !enabled;
                if (!enabled) el.checked = false;
            }
        });
    });
}

// ── Dynamic list builders ──────────────────────────────────────────────────────

function advAddAdditionalTarget() {
    const container = document.getElementById('adv-additional-targets');
    const row = document.createElement('div');
    row.className = 'flex gap-2';
    row.innerHTML = `
        <input class="adv-input flex-1 font-mono" placeholder="IP, CIDR, or hostname" type="text"/>
        <button onclick="this.parentElement.remove()" class="w-8 h-8 flex items-center justify-center text-secondary-text hover:text-danger transition-colors shrink-0">
            <span class="material-symbols-outlined text-sm">delete</span>
        </button>`;
    container.appendChild(row);
}

function advAddScopeEntry() {
    const container = document.getElementById('adv-scope-entries');
    const row = document.createElement('div');
    row.className = 'adv-scope-row flex gap-2';
    row.innerHTML = `
        <input class="adv-input flex-1 font-mono" placeholder="10.0.0.0/24" type="text"/>
        <button onclick="this.closest('.adv-scope-row').remove()" class="w-8 h-8 flex items-center justify-center text-secondary-text hover:text-danger transition-colors shrink-0">
            <span class="material-symbols-outlined text-sm">delete</span>
        </button>`;
    container.appendChild(row);
}

function advAddNeverScanEntry() {
    const container = document.getElementById('adv-never-scan-entries');
    const row = document.createElement('div');
    row.className = 'adv-never-scan-row flex gap-2';
    row.innerHTML = `
        <input class="adv-input flex-1 font-mono border-danger/30 focus:border-danger" placeholder="IP or CIDR (e.g. 192.168.1.1 or 10.0.0.0/24)" type="text"/>
        <button onclick="this.closest('.adv-never-scan-row').remove()" class="w-8 h-8 flex items-center justify-center text-secondary-text hover:text-danger transition-colors shrink-0">
            <span class="material-symbols-outlined text-sm">delete</span>
        </button>`;
    container.appendChild(row);
}

// ── Excluded ports quick-add helper ───────────────────────────────────────────

function _advAddPortExclusion(ports) {
    const input = document.getElementById('adv-excluded-ports');
    if (!input) return;
    const existing = input.value.split(',').map(p => p.trim()).filter(Boolean);
    const toAdd = ports.split(',').map(p => p.trim()).filter(p => p && !existing.includes(p));
    input.value = [...existing, ...toAdd].join(',');
}

// ── Global never-scan loader ───────────────────────────────────────────────────

async function _advLoadGlobalNeverScan() {
    const container = document.getElementById('adv-global-never-scan');
    if (!container) return;
    try {
        const res = await fetch('/api/v1/never-scan');
        if (!res.ok) return;
        const entries = await res.json();
        _adv.globalNeverScan = entries;
        const header = container.querySelector('p');
        // Remove old entries (keep header)
        [...container.children].forEach(c => { if (c !== header) c.remove(); });
        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'text-[9px] text-secondary-text italic';
            empty.textContent = 'No global entries — add session entries below or check "Save globally"';
            container.appendChild(empty);
            return;
        }
        entries.forEach(e => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 py-1';
            row.innerHTML = `
                <span class="w-2 h-2 rounded-full bg-danger shrink-0"></span>
                <span class="font-mono text-[10px] text-slate-300 flex-1">${_escHtml(e.value)}</span>
                <span class="text-[9px] text-secondary-text flex-1 truncate">${_escHtml(e.reason || '')}</span>
                <button onclick="_advDeleteGlobalNeverScan(${e.id}, this)" class="text-secondary-text hover:text-danger transition-colors shrink-0">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>`;
            container.appendChild(row);
        });
    } catch (_) {}
}

async function _advDeleteGlobalNeverScan(id, btn) {
    try {
        await fetch(`/api/v1/never-scan/${id}`, { method: 'DELETE' });
        btn.closest('div').remove();
        _adv.globalNeverScan = _adv.globalNeverScan.filter(e => e.id !== id);
        showToast('Never-scan entry removed');
    } catch (_) { showToast('Failed to delete entry', true); }
}

// ── Credential builders ────────────────────────────────────────────────────────

function advAddSSHCred() {
    const container = document.getElementById('adv-ssh-creds');
    const idx = Date.now();
    const card = document.createElement('div');
    card.className = 'adv-cred-card';
    card.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="adv-cred-label">SSH Credential</span>
            <button onclick="this.closest('.adv-cred-card').remove()" class="text-secondary-text hover:text-danger transition-colors">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div><p class="adv-cred-label">Label / Host Pattern</p><input class="adv-input font-mono" data-field="name" placeholder="e.g. web-01 or 10.0.0.*" type="text"/></div>
            <div><p class="adv-cred-label">Port</p><input class="adv-input font-mono" data-field="port" placeholder="22" type="number" value="22"/></div>
            <div><p class="adv-cred-label">Username</p><input class="adv-input font-mono" data-field="username" placeholder="root" type="text"/></div>
            <div><p class="adv-cred-label">Password</p><input class="adv-input font-mono" data-field="password" placeholder="(leave empty for key auth)" type="password"/></div>
        </div>
        <div><p class="adv-cred-label">Private Key (PEM — optional)</p><textarea class="adv-input h-16 resize-none font-mono text-xs" data-field="private_key" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea></div>
        <div class="grid grid-cols-2 gap-2">
            <div><p class="adv-cred-label">Escalation</p>
                <select class="adv-select" data-field="escalation">
                    <option value="none">None</option>
                    <option value="sudo">sudo</option>
                    <option value="su">su</option>
                    <option value="pbrun">pbrun</option>
                    <option value="dzdo">dzdo</option>
                    <option value="pfexec">pfexec</option>
                    <option value="doas">doas</option>
                </select>
            </div>
            <div><p class="adv-cred-label">Escalation Password</p><input class="adv-input font-mono" data-field="escalation_password" placeholder="(if different)" type="password"/></div>
        </div>`;
    card.dataset.credType = 'ssh';
    container.appendChild(card);
}

function advAddSMBCred() {
    const container = document.getElementById('adv-smb-creds');
    const card = document.createElement('div');
    card.className = 'adv-cred-card';
    card.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="adv-cred-label">SMB / Windows Credential</span>
            <button onclick="this.closest('.adv-cred-card').remove()" class="text-secondary-text hover:text-danger transition-colors">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div><p class="adv-cred-label">Label / Host Pattern</p><input class="adv-input font-mono" data-field="name" placeholder="e.g. DC-01 or 10.0.0.*" type="text"/></div>
            <div><p class="adv-cred-label">Domain</p><input class="adv-input font-mono" data-field="domain" placeholder="WORKGROUP" type="text"/></div>
            <div><p class="adv-cred-label">Username</p><input class="adv-input font-mono" data-field="username" placeholder="Administrator" type="text"/></div>
            <div><p class="adv-cred-label">Password</p><input class="adv-input font-mono" data-field="password" placeholder="" type="password"/></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div><p class="adv-cred-label">Auth Type</p>
                <select class="adv-select" data-field="auth_type">
                    <option value="ntlm">NTLM</option>
                    <option value="kerberos">Kerberos</option>
                </select>
            </div>
            <div><p class="adv-cred-label">NTLM Hash (optional)</p><input class="adv-input font-mono" data-field="hash_value" placeholder="aad3b435...31d6cfe0" type="text"/></div>
        </div>`;
    card.dataset.credType = 'smb';
    container.appendChild(card);
}

function advAddSNMPCred() {
    const container = document.getElementById('adv-snmp-creds');
    const card = document.createElement('div');
    card.className = 'adv-cred-card';
    card.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="adv-cred-label">SNMP Credential</span>
            <button onclick="this.closest('.adv-cred-card').remove()" class="text-secondary-text hover:text-danger transition-colors">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <div><p class="adv-cred-label">Label / Host Pattern</p><input class="adv-input font-mono" data-field="name" placeholder="10.0.0.*" type="text"/></div>
            <div><p class="adv-cred-label">Version</p>
                <select class="adv-select" data-field="version">
                    <option value="2c">v2c</option>
                    <option value="1">v1</option>
                    <option value="3">v3</option>
                </select>
            </div>
            <div><p class="adv-cred-label">Community String</p><input class="adv-input font-mono" data-field="community" placeholder="public" type="text"/></div>
        </div>`;
    card.dataset.credType = 'snmp';
    container.appendChild(card);
}

function advAddDBCred() {
    const container = document.getElementById('adv-db-creds');
    const card = document.createElement('div');
    card.className = 'adv-cred-card';
    card.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="adv-cred-label">Database Credential</span>
            <button onclick="this.closest('.adv-cred-card').remove()" class="text-secondary-text hover:text-danger transition-colors">
                <span class="material-symbols-outlined text-sm">delete</span>
            </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div><p class="adv-cred-label">Label / Host Pattern</p><input class="adv-input font-mono" data-field="name" placeholder="db-server or 10.0.0.*" type="text"/></div>
            <div><p class="adv-cred-label">DB Type</p>
                <select class="adv-select" data-field="db_type">
                    <option value="mysql">MySQL / MariaDB</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mssql">MSSQL</option>
                    <option value="oracle">Oracle</option>
                    <option value="mongodb">MongoDB</option>
                    <option value="redis">Redis</option>
                </select>
            </div>
            <div><p class="adv-cred-label">Username</p><input class="adv-input font-mono" data-field="username" placeholder="root" type="text"/></div>
            <div><p class="adv-cred-label">Password</p><input class="adv-input font-mono" data-field="password" placeholder="" type="password"/></div>
            <div><p class="adv-cred-label">Database Name</p><input class="adv-input font-mono" data-field="database" placeholder="(optional)" type="text"/></div>
            <div><p class="adv-cred-label">Port</p><input class="adv-input font-mono" data-field="port" placeholder="3306" type="number"/></div>
        </div>`;
    card.dataset.credType = 'db';
    container.appendChild(card);
}

// ── Collect credentials from DOM ───────────────────────────────────────────────

function _advCollectCredentials() {
    const creds = [];
    document.querySelectorAll('.adv-cred-card').forEach(card => {
        const type = card.dataset.credType;
        const obj = { cred_type: type };
        card.querySelectorAll('[data-field]').forEach(input => {
            obj[input.dataset.field] = input.value;
        });
        creds.push(obj);
    });
    return creds;
}

// ── Load saved credentials from DB ────────────────────────────────────────────

async function _advLoadSavedCredentials() {
    const list = document.getElementById('adv-saved-creds-list');
    if (!list) return;
    try {
        const res = await fetch('/api/v1/credentials');
        if (!res.ok) return;
        const creds = await res.json();
        list.innerHTML = '';
        _adv.savedCredIds = [];
        if (creds.length === 0) {
            list.innerHTML = '<p class="text-[9px] text-secondary-text italic">No saved credentials</p>';
            return;
        }
        creds.forEach(c => {
            const row = document.createElement('label');
            row.className = 'adv-check-row text-[10px]';
            row.innerHTML = `
                <input type="checkbox" class="accent-primary" value="${c.id}" onchange="_advToggleSavedCred('${c.id}', this.checked)"/>
                <span class="font-mono">${_escHtml(c.name)}</span>
                <span class="text-secondary-text ml-1">[${_escHtml(c.cred_type)}]</span>
                <span class="text-[9px] text-secondary-text ml-1">${_escHtml(c.host_pattern || '')}</span>
                <button onclick="_advDeleteSavedCred('${c.id}', this)" class="ml-auto text-secondary-text hover:text-danger transition-colors shrink-0">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>`;
            list.appendChild(row);
        });
    } catch (_) {}
}

function _advToggleSavedCred(id, checked) {
    if (checked) {
        if (!_adv.savedCredIds.includes(id)) _adv.savedCredIds.push(id);
    } else {
        _adv.savedCredIds = _adv.savedCredIds.filter(x => x !== id);
    }
}

async function _advDeleteSavedCred(id, btn) {
    if (!confirm('Delete this credential?')) return;
    try {
        await fetch(`/api/v1/credentials/${id}`, { method: 'DELETE' });
        btn.closest('label').remove();
        _adv.savedCredIds = _adv.savedCredIds.filter(x => x !== id);
        showToast('Credential deleted');
    } catch (_) { showToast('Failed to delete', true); }
}

// ── Profiles ───────────────────────────────────────────────────────────────────

async function _advLoadProfilesList() {
    const sel = document.getElementById('adv-profile-select');
    if (!sel) return;
    try {
        const res = await fetch('/api/v1/scan-profiles');
        if (!res.ok) return;
        const profiles = await res.json();
        // Keep placeholder, replace rest
        sel.innerHTML = '<option value="">— Select profile —</option>';
        profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name}${p.description ? ' — ' + p.description : ''}`;
            sel.appendChild(opt);
        });
    } catch (_) {}
}

async function advLoadProfile() {
    const sel = document.getElementById('adv-profile-select');
    if (!sel || !sel.value) { showToast('Select a profile first', true); return; }
    try {
        const res = await fetch(`/api/v1/scan-profiles/${sel.value}`);
        if (!res.ok) { showToast('Profile not found', true); return; }
        const profile = await res.json();
        const cfg = profile.config || profile.config_json || {};
        _advApplyConfig(cfg);
        showToast(`Loaded: ${profile.name}`);
    } catch (_) { showToast('Failed to load profile', true); }
}

async function advDeleteProfile() {
    const sel = document.getElementById('adv-profile-select');
    if (!sel || !sel.value) { showToast('Select a profile first', true); return; }
    if (!confirm('Delete this scan profile?')) return;
    try {
        await fetch(`/api/v1/scan-profiles/${sel.value}`, { method: 'DELETE' });
        sel.remove(sel.selectedIndex);
        sel.value = '';
        showToast('Profile deleted');
    } catch (_) { showToast('Failed to delete', true); }
}

async function advSaveProfile() {
    const name = document.getElementById('adv-profile-name').value.trim();
    if (!name) { showToast('Enter a profile name', true); return; }
    const desc = document.getElementById('adv-profile-desc').value.trim();
    const config = _advCollectConfig();
    try {
        await fetch('/api/v1/scan-profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: desc, config: config }),
        });
        showToast(`Saved: ${name}`);
        document.getElementById('adv-profile-name').value = '';
        document.getElementById('adv-profile-desc').value = '';
        await _advLoadProfilesList();
    } catch (_) { showToast('Save failed', true); }
}

// ── Preset loader ──────────────────────────────────────────────────────────────

const _ADV_PRESETS = {
    quick_discovery: {
        speed_profile: 'normal',
        scan_type: 'service',
        port_range: '1-1024',
        allow_exploitation: false,
        nse_categories: [],
        os_detection: false,
        version_detection: true,
    },
    full_network_audit: {
        speed_profile: 'normal',
        scan_type: 'full',
        port_range: '1-65535',
        allow_exploitation: false,
        nse_categories: ['default', 'vuln', 'safe'],
        os_detection: true,
        version_detection: true,
    },
    web_app_scan: {
        speed_profile: 'normal',
        scan_type: 'service',
        port_range: '80,443,8080,8443,8000,8888,3000,4000,5000',
        allow_exploitation: false,
        nse_categories: ['http-*', 'default'],
        os_detection: false,
        version_detection: true,
        allow_browser_recon: true,
    },
    stealth_recon: {
        speed_profile: 'stealth',
        scan_type: 'service',
        port_range: '1-1024',
        allow_exploitation: false,
        nse_categories: [],
        os_detection: false,
        version_detection: false,
    },
};

function advLoadPreset(name) {
    const cfg = _ADV_PRESETS[name];
    if (!cfg) return;
    _advApplyConfig(cfg);
    showToast(`Preset loaded: ${name.replace(/_/g, ' ')}`);
    // Switch to discovery tab so user sees what changed
    _advSwitchTab('discovery');
}

// ── Config apply / collect ─────────────────────────────────────────────────────

function _advApplyConfig(cfg) {
    if (cfg.speed_profile) {
        document.querySelectorAll('.adv-speed-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.speed === cfg.speed_profile);
        });
    }
    if (cfg.scan_type) {
        const stypeMap = { service: 'syn', full: 'full' };
        const stype = stypeMap[cfg.scan_type] || cfg.scan_type;
        document.querySelectorAll('.adv-scan-type-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.stype === stype);
        });
    }
    if (cfg.port_range) document.getElementById('adv-port-range').value = cfg.port_range;
    if (cfg.nse_categories) {
        document.querySelectorAll('[data-nse]').forEach(cb => {
            cb.checked = cfg.nse_categories.includes(cb.dataset.nse);
        });
    }
    if (typeof cfg.os_detection !== 'undefined') {
        const el = document.getElementById('adv-os-detect');
        if (el) el.checked = cfg.os_detection;
    }
    if (typeof cfg.version_detection !== 'undefined') {
        const el = document.getElementById('adv-version-detect');
        if (el) el.checked = cfg.version_detection;
    }
    if (typeof cfg.allow_exploitation !== 'undefined') {
        const el = document.getElementById('pol-allow-exploit');
        if (el) {
            el.checked = cfg.allow_exploitation;
            el.dispatchEvent(new Event('change'));
        }
    }
    if (typeof cfg.allow_browser_recon !== 'undefined') {
        const el = document.getElementById('pol-allow-browser');
        if (el) el.checked = cfg.allow_browser_recon;
    }
    if (cfg.target_type) {
        const el = document.getElementById('adv-target-type');
        if (el) el.value = cfg.target_type;
    }
    if (cfg.mission_name) {
        const el = document.getElementById('adv-mission-name');
        if (el) el.value = cfg.mission_name;
    }
    if (cfg.mode) {
        document.querySelectorAll('.adv-mode-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === cfg.mode);
        });
        const desc = document.getElementById('adv-mode-desc');
        if (desc && _advModeDesc[cfg.mode]) desc.textContent = _advModeDesc[cfg.mode];
    }
    if (cfg.known_tech) {
        const el = document.getElementById('adv-known-tech');
        if (el) el.value = cfg.known_tech;
    }
    if (cfg.scope_notes) {
        const el = document.getElementById('adv-scope-notes');
        if (el) el.value = cfg.scope_notes;
    }
    if (cfg.objectives) {
        const el = document.getElementById('adv-objectives');
        if (el) el.value = cfg.objectives;
    }
    if (cfg.excluded_ports) {
        const el = document.getElementById('adv-excluded-ports');
        if (el) el.value = cfg.excluded_ports;
    }
    if (cfg.custom_scripts) {
        const el = document.getElementById('adv-custom-scripts');
        if (el) el.value = cfg.custom_scripts;
    }
    if (cfg.version_intensity) {
        const sl = document.getElementById('adv-version-intensity');
        const vl = document.getElementById('adv-version-intensity-val');
        if (sl) sl.value = cfg.version_intensity;
        if (vl) vl.textContent = cfg.version_intensity;
    }
    ['allow_post_exploitation','allow_lateral_movement','allow_docker_escape'].forEach(key => {
        if (typeof cfg[key] !== 'undefined') {
            const id = 'pol-' + key.replace('allow_','allow-').replace(/_/g,'-');
            const el = document.getElementById(id);
            if (el) el.checked = cfg[key];
        }
    });
}

function _advCollectConfig() {
    const nse = [];
    document.querySelectorAll('[data-nse]:checked').forEach(cb => nse.push(cb.dataset.nse));
    const customScripts = (document.getElementById('adv-custom-scripts') || {}).value || '';
    if (customScripts.trim()) nse.push(...customScripts.split(',').map(s => s.trim()).filter(Boolean));

    const _v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const _c = id => { const el = document.getElementById(id); return el ? el.checked : false; };

    return {
        mission_name:           _v('adv-mission-name'),
        target_type:            _v('adv-target-type') || 'auto',
        mode:                   _advGetMode(),
        speed_profile:          _advGetSpeedProfile(),
        scan_type:              _advGetScanType(),
        port_range:             _v('adv-port-range') || '1-1024',
        nse_categories:         nse,
        custom_scripts:         customScripts.trim(),
        os_detection:           _c('adv-os-detect'),
        version_detection:      _c('adv-version-detect'),
        allow_exploitation:     _c('pol-allow-exploit'),
        allow_post_exploitation: _c('pol-allow-post'),
        allow_lateral_movement: _c('pol-allow-lateral'),
        allow_docker_escape:    _c('pol-allow-docker'),
        allow_browser_recon:    _c('pol-allow-browser'),
        known_tech:             _v('adv-known-tech'),
        scope_notes:            _v('adv-scope-notes'),
        objectives:             _v('adv-objectives'),
        excluded_ports:         _v('adv-excluded-ports'),
        version_intensity:      (() => { const el = document.getElementById('adv-version-intensity'); return el ? el.value : '5'; })(),
    };
}

// ── Tool health status ─────────────────────────────────────────────────────────

async function advRefreshToolStatus() {
    const container = document.getElementById('adv-tool-status');
    if (!container) return;
    container.innerHTML = '<p class="text-[9px] text-secondary-text animate-pulse">Checking tools…</p>';
    try {
        const res = await fetch('/api/v1/tools/status');
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        container.innerHTML = '';
        // tools is a list [{name, available, degraded, message, ...}]
        const toolsList = Array.isArray(data) ? data : (data.tools || []);
        if (toolsList.length === 0) {
            container.innerHTML = '<p class="text-[9px] text-secondary-text italic">No tools registered</p>';
        }
        toolsList.forEach(t => {
            const row = document.createElement('div');
            row.className = 'adv-tool-row';
            const dotColor = !t.available ? '#FF3B3B' : t.degraded ? '#f59e0b' : '#ccff00';
            row.innerHTML = `
                <span class="adv-tool-dot" style="background:${dotColor}"></span>
                <span class="font-mono text-[10px] text-slate-300 w-40 shrink-0">${_escHtml(t.display_name || t.name)}</span>
                <span class="text-[9px] text-secondary-text/60 w-20 shrink-0">${_escHtml(t.category || '')}</span>
                <span class="text-[9px] text-secondary-text truncate">${_escHtml(t.message || 'OK')}</span>
                ${t.install_hint ? `<span class="text-[9px] text-secondary-text/40 ml-2 font-mono truncate">${_escHtml(t.install_hint)}</span>` : ''}`;
            container.appendChild(row);
        });
    } catch (_) {
        container.innerHTML = '<p class="text-[9px] text-danger">Failed to load tool status</p>';
    }
}

// ── Launch mission ─────────────────────────────────────────────────────────────

async function launchAdvancedMission() {
    const primaryTarget = document.getElementById('adv-primary-target').value.trim();

    if (!primaryTarget) {
        showToast('Enter a primary target first', true);
        _advSwitchTab('targets');
        document.getElementById('adv-primary-target').focus();
        return;
    }

    // Collect additional targets
    const additionalTargets = [];
    document.querySelectorAll('#adv-additional-targets input').forEach(inp => {
        if (inp.value.trim()) additionalTargets.push(inp.value.trim());
    });

    // Collect excluded targets (never-scan session entries)
    const excludedTargets = [];
    document.querySelectorAll('#adv-never-scan-entries input').forEach(inp => {
        if (inp.value.trim()) excludedTargets.push(inp.value.trim());
    });

    // Collect excluded ports
    const excludedPortsRaw = document.getElementById('adv-excluded-ports').value.trim();
    const excludedPorts = excludedPortsRaw
        ? excludedPortsRaw.split(',').map(p => p.trim()).filter(p => /^\d+$/.test(p))
        : [];

    // Collect scope notes
    const scopeNotes = document.getElementById('adv-scope-notes').value.trim();
    const knownTech = document.getElementById('adv-known-tech').value.trim();
    const cfg = _advCollectConfig();
    const creds = _advCollectCredentials();

    // If "save globally" checked, persist new never-scan entries
    if (document.getElementById('adv-save-never-scan').checked && excludedTargets.length > 0) {
        for (const val of excludedTargets) {
            try {
                await fetch('/api/v1/never-scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: val, reason: 'Added from Advanced Config modal' }),
                });
            } catch (_) {}
        }
    }

    // Save new credentials to DB if requested
    let newCredIds = [..._adv.savedCredIds];
    if (document.getElementById('adv-save-creds').checked && creds.length > 0) {
        for (const cred of creds) {
            try {
                const r = await fetch('/api/v1/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: cred.name || `${cred.cred_type}-${Date.now()}`,
                        cred_type: cred.cred_type,
                        host_pattern: cred.name || '*',
                        data: cred,
                    }),
                });
                if (r.ok) {
                    const saved = await r.json();
                    newCredIds.push(saved.id);
                }
            } catch (_) {}
        }
    }

    // Build full session payload (maps to StartSessionRequest in routes.py)
    console.log('[ADV] cfg:', cfg);
    const payload = {
        target: primaryTarget,
        mode: cfg.mode,
        port_range: cfg.port_range,
        provider: activeProvider || 'ollama',
        model: activeModel || undefined,
        mission_name: cfg.mission_name || undefined,
        target_type: cfg.target_type !== 'auto' ? cfg.target_type : undefined,
        additional_targets: additionalTargets.length > 0 ? additionalTargets : undefined,
        excluded_targets: excludedTargets.length > 0 ? excludedTargets : undefined,
        excluded_ports: excludedPorts.length > 0 ? excludedPorts : undefined,
        speed_profile: cfg.speed_profile,
        scan_type: cfg.scan_type,
        nse_categories: cfg.nse_categories.length > 0 ? cfg.nse_categories : undefined,
        os_detection: cfg.os_detection,
        version_detection: cfg.version_detection,
        allow_post_exploitation: cfg.allow_post_exploitation,
        allow_lateral_movement: cfg.allow_lateral_movement,
        allow_docker_escape: cfg.allow_docker_escape,
        allow_browser_recon: cfg.allow_browser_recon,
        known_tech: knownTech ? knownTech.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        scope_notes: scopeNotes || undefined,
        notes: cfg.notes || undefined,
        objectives: cfg.objectives ? cfg.objectives.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        credential_ids: newCredIds.length > 0 ? newCredIds : undefined,
    };

    // Sync primary target back to sidebar quick-launch field
    const sidebarTarget = document.getElementById('mission-target');
    if (sidebarTarget) sidebarTarget.value = primaryTarget;
    // Also sync hidden mode/port fields for quick-launch reuse
    const hiddenMode = document.getElementById('mission-mode');
    if (hiddenMode) hiddenMode.value = cfg.mode;
    const hiddenPort = document.getElementById('mission-port-range');
    if (hiddenPort) hiddenPort.value = cfg.port_range;

    _advPersistConfig();   // save to DB before closing
    closeAdvModal();
    console.log('[ADV] payload:', JSON.stringify(payload, null, 2));

    try {
        const res = await fetch('/api/v1/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            // FastAPI 422 returns detail as array of validation errors
            let msg = 'Start failed';
            if (errBody.detail) {
                if (Array.isArray(errBody.detail)) {
                    msg = errBody.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(' | ');
                } else {
                    msg = String(errBody.detail);
                }
            }
            console.error('Session start error:', errBody);
            throw new Error(`${res.status}: ${msg}`);
        }
        const data = await res.json();

        // Replicate session startup logic from startMission()
        activeMissionId = data.session_id;
        viewingSessionId = activeMissionId;
        missionStartTime = Date.now();
        missionPaused = false;
        hideResumeFromSessionBtn();

        updateMissionStatusHeader('running', activeMissionId, primaryTarget);
        resetMissionStats();
        resetPhaseBar();
        setPhaseActive(1);
        clearConsoleOutput();
        clearMissionFeed();
        renderMissionStart(primaryTarget, cfg.mode);
        appendConsoleLine(`[SESSION] ${activeMissionId}`, 'text-primary');
        appendConsoleLine(
            `[TARGET] ${primaryTarget}  [PROFILE] ${cfg.speed_profile.toUpperCase()}  [SCAN] ${cfg.scan_type.toUpperCase()}`,
            'text-secondary-text'
        );
        showPauseMissionBtn();
        updatePauseButton();
        setAgentStatus('reasoning');
        syncInputMode();

        patchWsSessionHandler();
        if (ws && wsReady) {
            ws.send(JSON.stringify({ type: 'subscribe_session', session_id: activeMissionId }));
        }

        startMissionPoll(activeMissionId);
        startMissionUptime();
        switchView('agent');
        showToast('Mission launched');

    } catch (err) {
        showToast('Launch failed: ' + err.message, true);
        openAdvModal();  // re-open so the user can fix the problem
    }
}

// ── HTML escape helper ─────────────────────────────────────────────────────────

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─── Console Tab Switching ─────────────────────────────────────────────────────

function _initConsoleTabs() {
    document.querySelectorAll('#view-console .console-tab').forEach(tab => {
        tab.addEventListener('click', () => _switchConsoleTab(tab.dataset.tab));
    });
}

function _switchConsoleTab(tabName) {
    document.querySelectorAll('#view-console .console-tab').forEach(t => {
        const isActive = t.dataset.tab === tabName;
        t.classList.toggle('bg-black', isActive);
        t.classList.toggle('text-primary', isActive);
        t.classList.toggle('border-t-2', isActive);
        t.classList.toggle('border-t-primary', isActive);
        t.classList.toggle('text-secondary-text', !isActive);
    });
    document.querySelectorAll('#view-console .console-body').forEach(body => {
        body.classList.toggle('hidden', body.dataset.tab !== tabName);
    });
}

// Called when a reverse shell arrives
function _onReverseShellReceived(shellId, remoteAddr) {
    const badge = document.getElementById('shell-count-badge');
    const emptyMsg = document.getElementById('shell-empty-msg');
    const inputRow = document.getElementById('shell-input-row');
    const bar = document.getElementById('shell-subtab-bar');

    const currentCount = parseInt(badge.dataset.count || '0') + 1;
    badge.dataset.count = currentCount;
    badge.textContent = currentCount;
    badge.classList.remove('hidden');
    setStatValue('stat-shells', currentCount);
    if (emptyMsg) emptyMsg.classList.add('hidden');

    const subTab = document.createElement('button');
    subTab.className = 'shell-subtab px-3 py-1 text-[10px] font-mono border border-border-color hover:border-primary bg-black/60 whitespace-nowrap transition-colors';
    subTab.textContent = `SHELL-${currentCount} [${remoteAddr}]`;
    subTab.dataset.shellId = shellId;
    subTab.onclick = () => _activateShell(shellId, remoteAddr);
    bar.appendChild(subTab);

    if (inputRow) inputRow.classList.remove('hidden');
    _activateShell(shellId, remoteAddr);
    _switchConsoleTab('shells');

    if (currentView !== 'console') {
        showToast(`Reverse shell received: ${remoteAddr} — Console → SHELLS`);
    }
}

let _activeShellId = null;

function _activateShell(shellId, remoteAddr) {
    _activeShellId = shellId;
    document.querySelectorAll('.shell-subtab').forEach(t => {
        const active = t.dataset.shellId === shellId;
        t.classList.toggle('text-primary', active);
        t.classList.toggle('border-primary', active);
        t.classList.toggle('text-secondary-text', !active);
    });
    const prompt = document.getElementById('shell-prompt');
    if (prompt) prompt.textContent = `${remoteAddr}#`;
    const inp = document.getElementById('shell-cmd-input');
    if (inp) inp.focus();
}

// ─── Interactive Terminal ──────────────────────────────────────────────────────

const _termHistory = [];
let _termHistoryIdx = -1;

function _initTerminalInput() {
    const input = document.getElementById('terminal-cmd-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _termSubmit(); }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (_termHistoryIdx < _termHistory.length - 1) {
                _termHistoryIdx++;
                input.value = _termHistory[_termHistory.length - 1 - _termHistoryIdx];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            _termHistoryIdx > 0 ? (input.value = _termHistory[_termHistory.length - 1 - (--_termHistoryIdx)])
                                : (_termHistoryIdx = -1, input.value = '');
        }
    });
}

async function _termSubmit() {
    const input = document.getElementById('terminal-cmd-input');
    const cmd = input.value.trim();
    if (!cmd) return;
    input.value = '';
    _termHistoryIdx = -1;
    _termHistory.push(cmd);
    _termPrint(`<span class="text-primary">aegis&gt;</span> ${_escHtml(cmd)}`);

    if (cmd === '/help') {
        _termPrint(`<span class="text-secondary-text">  /help            show this help
  /shells          list active reverse shells
  /clear           clear output
  /status          show active session
  /view &lt;name&gt;     switch to a view
  anything else    inject into active agent as task instruction</span>`);
        return;
    }
    if (cmd === '/clear') {
        const out = document.getElementById('terminal-output');
        if (out) { const h = out.firstElementChild; out.innerHTML = ''; if (h) out.appendChild(h); }
        return;
    }
    if (cmd === '/shells') {
        const shells = document.querySelectorAll('.shell-subtab');
        if (!shells.length) { _termPrint('<span class="text-secondary-text">No active shells</span>'); return; }
        shells.forEach(s => _termPrint(`<span class="text-green-400">  ${_escHtml(s.textContent)}</span>`));
        return;
    }
    if (cmd === '/status') {
        _termPrint(`<span class="text-secondary-text">Session: ${activeMissionId || '(none)'}</span>`);
        return;
    }
    if (cmd.startsWith('/view ')) {
        switchView(cmd.slice(6).trim());
        return;
    }
    if (!activeMissionId) {
        _termPrint('<span class="text-danger">No active session — launch a mission first</span>');
        return;
    }
    try {
        const res = await fetch(`/api/v1/sessions/${activeMissionId}/inject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: cmd }),
        });
        _termPrint(res.ok
            ? '<span class="text-secondary-text/60 text-[10px]">→ injected into agent</span>'
            : '<span class="text-danger">Injection failed</span>');
    } catch (_) {
        _termPrint('<span class="text-danger">Network error</span>');
    }
}

function _termPrint(htmlLine) {
    const out = document.getElementById('terminal-output');
    if (!out) return;
    const d = document.createElement('div');
    d.innerHTML = htmlLine;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}

// ─── Reverse Shell Input ───────────────────────────────────────────────────────

const _shellCmdHistory = [];
let _shellHistoryIdx = -1;

function _initShellInput() {
    const input = document.getElementById('shell-cmd-input');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendShellCommand(); }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (_shellHistoryIdx < _shellCmdHistory.length - 1) {
                _shellHistoryIdx++;
                input.value = _shellCmdHistory[_shellCmdHistory.length - 1 - _shellHistoryIdx];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            _shellHistoryIdx > 0 ? (input.value = _shellCmdHistory[_shellCmdHistory.length - 1 - (--_shellHistoryIdx)])
                                 : (_shellHistoryIdx = -1, input.value = '');
        }
    });
}

async function sendShellCommand() {
    const input = document.getElementById('shell-cmd-input');
    const cmd = input.value;
    if (!_activeShellId) { showToast('No active shell', true); return; }
    input.value = '';
    _shellHistoryIdx = -1;
    if (cmd.trim()) _shellCmdHistory.push(cmd);
    _shellPrint(`<span class="text-green-300 select-none"># </span>${_escHtml(cmd)}`);
    try {
        const res = await fetch(`/api/v1/shells/${_activeShellId}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd }),
        });
        if (!res.ok) _shellPrint('<span class="text-danger">Send failed — shell may be closed</span>');
    } catch (_) {
        _shellPrint('<span class="text-danger">Connection error</span>');
    }
}

// Called by WebSocket handler when shell output arrives
function receiveShellOutput(shellId, data) {
    if (_activeShellId !== shellId) return;
    _shellPrint(_escHtml(data));
}

function _shellPrint(htmlContent) {
    const out = document.getElementById('shell-output-area');
    if (!out) return;
    const d = document.createElement('div');
    d.innerHTML = htmlContent;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}



// ─── Attack Graph View v2 ──────────────────────────────────────────────────────

let _agView           = 'feed';
let _agNodes          = [];   // {id,type,label,detail,parentId,depth,x,y,_expanded,_children}
let _agEdges          = [];   // {from,to}
let _agNodeSeq        = 0;
let _agD3Zoom         = null;
let _agLastThinkId    = null;
let _agLastToolId     = null;
let _agParallelGrpId  = null;   // id of current parallel group node
let _agParallelActive = false;

// ── Node style registry ────────────────────────────────────────────────────────
const _AG = {
    aegis:      { color:'#ccff00', bg:'#0d1a00', bgL:'#f0ffd0', icon:'radar',          r:32, stroke:2.5 },
    target:     { color:'#ef4444', bg:'#1a0000', bgL:'#fff0f0', icon:'computer',        r:28, stroke:1.5 },
    thinking:   { color:'#eab308', bg:'#1a1100', bgL:'#fffbe8', icon:'psychology',      r:26, stroke:1.5 },
    reflecting: { color:'#a855f7', bg:'#0d0018', bgL:'#faf0ff', icon:'lightbulb',       r:26, stroke:1.5 },
    tool_nmap:  { color:'#3b82f6', bg:'#00102a', bgL:'#eff6ff', icon:'wifi_find',       r:28, stroke:1.5 },
    tool_msf:   { color:'#ef4444', bg:'#1a0000', bgL:'#fff0f0', icon:'rocket_launch',   r:28, stroke:1.5 },
    tool_bash:  { color:'#22c55e', bg:'#001a08', bgL:'#f0fff4', icon:'terminal',        r:28, stroke:1.5 },
    tool_ssh:   { color:'#06b6d4', bg:'#001018', bgL:'#ecfeff', icon:'key',             r:28, stroke:1.5 },
    tool_spy:   { color:'#f97316', bg:'#1a0800', bgL:'#fff7ed', icon:'manage_search',   r:28, stroke:1.5 },
    tool_other: { color:'#60a5fa', bg:'#001020', bgL:'#eff6ff', icon:'terminal',        r:28, stroke:1.5 },
    parallel:   { color:'#f97316', bg:'#1a0800', bgL:'#fff7ed', icon:'bolt',            r:30, stroke:2 },
    result_ok:  { color:'#ccff00', bg:'#0a1400', bgL:'#f7ffde', icon:'check_circle',    r:20, stroke:1 },
    result_fail:{ color:'#ef4444', bg:'#1a0000', bgL:'#fff0f0', icon:'error',           r:20, stroke:1 },
    reflection: { color:'#a855f7', bg:'#0d0018', bgL:'#faf0ff', icon:'lightbulb',       r:26, stroke:1.5 },
    done:       { color:'#ccff00', bg:'#0a1400', bgL:'#f7ffde', icon:'flag',            r:32, stroke:2.5 },
    error:      { color:'#ef4444', bg:'#1a0000', bgL:'#fff0f0', icon:'error',           r:26, stroke:1.5 },
};

function _agS(type) { return _AG[type] || _AG.tool_other; }
function _agIsLight() { return document.documentElement.classList.contains('light'); }
function _agBg(type) { return _agIsLight() ? _agS(type).bgL : _agS(type).bg; }
function _agSvgBg() { return _agIsLight() ? '#f7f7f7' : '#030303'; }
function _agEdgeColor(main) { return _agIsLight() ? (main ? '#ccc' : '#ddd') : (main ? '#1e1e1e' : '#111'); }

function _agToolType(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('nmap'))                              return 'tool_nmap';
    if (n.includes('msf') || n.includes('metasploit'))  return 'tool_msf';
    if (n.includes('bash') || n === 'exec' || n === 'run_command' || n === 'shell') return 'tool_bash';
    if (n.includes('ssh'))                               return 'tool_ssh';
    if (n.includes('searchsploit') || n.includes('exploit_db')) return 'tool_spy';
    return 'tool_other';
}

// ── Node management ────────────────────────────────────────────────────────────

function _agAddNode(type, label, detail, parentId) {
    detail   = detail   !== undefined ? detail   : {};
    parentId = parentId !== undefined ? parentId : null;
    const id = ++_agNodeSeq;
    const par = _agNodes.find(function(n){ return n.id === parentId; });
    const depth = par ? par.depth + 1 : (_agNodes.length > 0 ? _agNodes[_agNodes.length-1].depth + 1 : 0);
    _agNodes.push({ id:id, type:type, label:label, detail:detail, parentId:parentId,
                    depth:depth, x:0, y:0, _expanded:false, _children:[] });
    if (parentId !== null) {
        _agEdges.push({ from:parentId, to:id });
        if (par) par._children.push(id);
    }
    if (_agView === 'graph') _agScheduleRender();
    return id;
}

function _agReset() {
    _agNodes=[]; _agEdges=[]; _agNodeSeq=0;
    _agLastThinkId=null; _agLastToolId=null;
    _agParallelGrpId=null; _agParallelActive=false;
    const cnt = document.getElementById('ag-node-count');
    if (cnt) cnt.textContent = '';
    if (_agView === 'graph') _agRender();
}

let _agRenderTimer = null;
function _agScheduleRender() {
    if (_agRenderTimer) clearTimeout(_agRenderTimer);
    _agRenderTimer = setTimeout(_agRender, 60);
}

// ── View switch ────────────────────────────────────────────────────────────────

function switchAgentView(v) {
    _agView = v;
    try { localStorage.setItem('agView', v); } catch(e) {}
    const feedArea      = document.getElementById('agent-scroll-area');
    const minimap       = document.getElementById('ag-minimap-col');
    const graphView     = document.getElementById('ag-graph-view');
    const orchestraView = document.getElementById('ag-orchestra-view');
    const btnFeed       = document.getElementById('ag-view-btn-feed');
    const btnGraph      = document.getElementById('ag-view-btn-graph');
    const btnOrchestra  = document.getElementById('ag-view-btn-orchestra');

    const isLight = _agIsLight();
    const limePrimary = isLight ? '#4a7c00' : '#ccff00';
    const activeS   = 'border-color:'+limePrimary+';color:'+limePrimary+';background:'+limePrimary+'18;';
    const inactiveS = 'border-color:#333;color:#444;background:transparent;';

    // Hide all panels first
    if (feedArea)       feedArea.style.display  = 'none';
    if (minimap)        minimap.style.display   = 'none';
    if (graphView)      graphView.style.display = 'none';
    if (orchestraView)  orchestraView.style.display = 'none';
    if (btnFeed)        btnFeed.setAttribute('style',       inactiveS);
    if (btnGraph)       btnGraph.setAttribute('style',      inactiveS);
    if (btnOrchestra)   btnOrchestra.setAttribute('style',  inactiveS);

    if (v === 'graph') {
        if (graphView)  { graphView.style.display = 'flex'; graphView.style.flex = '1'; }
        if (btnGraph)   btnGraph.setAttribute('style', activeS);
        const svgEl = document.getElementById('ag-graph-svg');
        if (svgEl) svgEl.style.background = _agSvgBg();
        _agRender();
    } else if (v === 'orchestra') {
        if (orchestraView) { orchestraView.style.display = 'flex'; orchestraView.style.flex = '1'; }
        if (btnOrchestra)  btnOrchestra.setAttribute('style', activeS);
        fetchAgentOrchestra();
    } else {
        // feed (default)
        if (feedArea)  feedArea.style.display  = '';
        if (minimap)   minimap.style.display   = 'flex';
        if (btnFeed)   btnFeed.setAttribute('style',  activeS);
    }
}

// ── V2 Agent Orchestra ────────────────────────────────────────────────────────

const _V2_AGENT_STATUS_COLORS = {
    spawning: '#eab308',
    running: '#ccff00',
    done: '#3b82f6',
    failed: '#ef4444',
    paused: '#a855f7',
};
const _V2_AGENT_TYPE_ICONS = {
    scanner: 'radar', exploit: 'bug_report', post_exploit: 'terminal',
    webapp: 'web', osint: 'search', lateral: 'share', reporting: 'description',
    brain: 'psychology',
};

async function fetchAgentOrchestra() {
    const sid = _currentSessionId;
    if (!sid) return;

    try {
        // Fetch agents
        const agentsResp = await fetch(`/api/v1/sessions/${sid}/agents`);
        if (agentsResp.ok) {
            const { agents } = await agentsResp.json();
            _renderAgentCards(agents || []);
        }

        // Fetch mission context for stats
        const ctxResp = await fetch(`/api/v1/sessions/${sid}/mission-context`);
        if (ctxResp.ok) {
            const ctx = await ctxResp.json();
            const h = ctx.hosts ? Object.keys(ctx.hosts).length : 0;
            const v = ctx.vulnerabilities ? ctx.vulnerabilities.length : 0;
            const s = ctx.active_sessions ? ctx.active_sessions.length : 0;
            const c = ctx.credentials ? ctx.credentials.length : 0;
            _setEl('v2-stat-hosts', h);
            _setEl('v2-stat-vulns', v);
            _setEl('v2-stat-sessions', s);
            _setEl('v2-stat-creds', c);
            if (ctx.current_phase) _setEl('v2-mission-phase', 'Phase: ' + ctx.current_phase);
        }

        // Fetch harvested credentials
        const credResp = await fetch(`/api/v1/sessions/${sid}/credentials/harvested`);
        if (credResp.ok) {
            const { credentials } = await credResp.json();
            _renderHarvestedCreds(credentials || []);
        }

        // Fetch loot
        const lootResp = await fetch(`/api/v1/sessions/${sid}/loot`);
        if (lootResp.ok) {
            const { loot } = await lootResp.json();
            _renderLoot(loot || []);
        }
    } catch(e) {
        console.warn('Orchestra fetch error:', e);
    }
}

function _setEl(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function _renderAgentCards(agents) {
    const container = document.getElementById('v2-agent-cards');
    if (!container) return;
    if (!agents.length) {
        container.innerHTML = '<div class="text-[11px] text-secondary-text/40 mono-text col-span-2 py-4 text-center">No agents spawned yet</div>';
        return;
    }
    container.innerHTML = agents.map(a => {
        const color = _V2_AGENT_STATUS_COLORS[a.status] || '#555';
        const icon  = _V2_AGENT_TYPE_ICONS[a.agent_type] || 'smart_toy';
        const dur   = a.finished_at ? ((a.finished_at - a.started_at) / 1000).toFixed(1) + 's' : 'running…';
        return `<div class="bg-card border p-3 flex flex-col gap-1" style="border-color:${color}22;">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined" style="font-size:14px;color:${color};">${icon}</span>
            <span class="text-[11px] font-bold uppercase tracking-wider" style="color:${color};">${a.agent_type}</span>
            <span class="ml-auto text-[9px] mono-text" style="color:${color};">${a.status.toUpperCase()}</span>
          </div>
          <div class="text-[10px] text-secondary-text mono-text truncate">${a.target || '—'}</div>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[9px] text-secondary-text/50">${a.iterations || 0} iters · ${dur}</span>
            <span class="text-[9px] text-secondary-text/50">${(a.findings||[]).length} findings</span>
          </div>
        </div>`;
    }).join('');
}

function _renderHarvestedCreds(creds) {
    const container = document.getElementById('v2-harvested-creds');
    if (!container) return;
    if (!creds.length) {
        container.innerHTML = '<div class="text-[11px] text-secondary-text/40 mono-text p-3 text-center">None yet</div>';
        return;
    }
    container.innerHTML = `<table class="w-full text-[10px] mono-text">
      <thead><tr class="border-b border-border-color/30">
        <th class="text-left p-2 text-secondary-text/50">Host</th>
        <th class="text-left p-2 text-secondary-text/50">Type</th>
        <th class="text-left p-2 text-secondary-text/50">Username</th>
        <th class="text-left p-2 text-secondary-text/50">Service</th>
      </tr></thead>
      <tbody>${creds.map(c => `<tr class="border-b border-border-color/10">
        <td class="p-2 text-primary/80">${c.source_host||'—'}</td>
        <td class="p-2 text-secondary-text">${c.credential_type||'—'}</td>
        <td class="p-2 text-yellow-400">${c.username||'—'}</td>
        <td class="p-2 text-secondary-text">${c.service||'—'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function _renderLoot(loot) {
    const container = document.getElementById('v2-loot');
    if (!container) return;
    if (!loot.length) {
        container.innerHTML = '<div class="text-[11px] text-secondary-text/40 mono-text p-3 text-center">None yet</div>';
        return;
    }
    container.innerHTML = loot.map(l => `<div class="p-2 border-b border-border-color/20 flex items-center gap-2">
      <span class="material-symbols-outlined text-purple-400" style="font-size:13px;">folder</span>
      <div>
        <div class="text-[10px] text-primary/80">${l.description||l.loot_type}</div>
        <div class="text-[9px] text-secondary-text/50">${l.source_host} · ${l.source_path||''}</div>
      </div>
    </div>`).join('');
}

// Auto-refresh orchestra view every 5s when visible
setInterval(() => {
    if (_agView === 'orchestra') fetchAgentOrchestra();
}, 5000);


// ── Layout ────────────────────────────────────────────────────────────────────

function _agComputeLayout() {
    if (_agNodes.length === 0) return;
    const wrap = document.getElementById('ag-svg-wrap');
    const W  = wrap ? wrap.clientWidth  : 800;
    const cx = W / 2;
    const YSTEP   = 160;
    const XBRANCH = 230;
    const XPAR    = 180;   // horizontal spread for parallel children
    let chainY = 100;

    // Categorize nodes
    _agNodes.forEach(function(node) {
        const isBranch   = (node.type === 'result_ok' || node.type === 'result_fail');
        const isParChild  = _agParentType(node) === 'parallel';

        if (isParChild && !isBranch) {
            // Parallel children: positioned when parent expands
            const grp = _agNodes.find(function(n){ return n.id === node.parentId; });
            if (grp && grp._expanded) {
                const siblings = grp._children.filter(function(cid){
                    const c = _agNodes.find(function(n){ return n.id === cid; });
                    return c && c.type !== 'result_ok' && c.type !== 'result_fail';
                });
                const idx   = siblings.indexOf(node.id);
                const total = siblings.length;
                const spread = Math.min(XPAR * (total - 1), 600);
                node.x = grp.x + (idx - (total-1)/2) * (total > 1 ? spread/(total-1) : 0);
                node.y = grp.y + YSTEP;
                node._visible = true;
            } else {
                node.x = _agNodes.find(function(n){ return n.id === node.parentId; })?.x || cx;
                node.y = _agNodes.find(function(n){ return n.id === node.parentId; })?.y || chainY;
                node._visible = false;
            }
        } else if (isBranch) {
            const parent = _agNodes.find(function(n){ return n.id === node.parentId; });
            node.x = parent ? parent.x + XBRANCH : cx + XBRANCH;
            node.y = parent ? parent.y : chainY;
            node._visible = true;
        } else {
            node.x = cx + (node.depth % 2 === 0 ? -20 : 20);
            node.y = chainY;
            node._visible = true;
            chainY += YSTEP;
            // Leave extra room if this is an expanded parallel group
            if (node.type === 'parallel' && node._expanded) {
                chainY += YSTEP;
            }
        }
    });
}

function _agParentType(node) {
    if (!node.parentId) return null;
    const par = _agNodes.find(function(n){ return n.id === node.parentId; });
    return par ? par.type : null;
}

// ── D3 Render ─────────────────────────────────────────────────────────────────

function _agRender() {
    const svgEl = document.getElementById('ag-graph-svg');
    if (!svgEl || typeof d3 === 'undefined') return;
    const svg = d3.select(svgEl);
    const isLight = _agIsLight();

    // SVG background
    svgEl.style.background = _agSvgBg();

    // Init zoom
    if (!_agD3Zoom) {
        _agD3Zoom = d3.zoom().scaleExtent([0.05, 6]).on('zoom', function(e) {
            svg.select('.ag-root').attr('transform', e.transform);
        });
        svg.call(_agD3Zoom);
        svg.on('click', function(ev) {
            if (ev.target === svgEl) agCloseDetail();
        });
    }

    // Defs
    let defs = svg.select('defs');
    if (defs.empty()) defs = svg.append('defs');
    // Rebuild markers (color-sensitive)
    defs.selectAll('marker').remove();
    var markerDefs = [
        ['ag-arr-main',  isLight ? '#bbb' : '#252525'],
        ['ag-arr-ok',    isLight ? 'rgba(74,124,0,0.6)'    : 'rgba(204,255,0,0.5)'],
        ['ag-arr-fail',  isLight ? 'rgba(220,38,38,0.6)'   : 'rgba(239,68,68,0.5)'],
        ['ag-arr-par',   isLight ? 'rgba(234,88,12,0.6)'   : 'rgba(249,115,22,0.5)'],
    ];
    markerDefs.forEach(function(pair) {
        defs.append('marker').attr('id',pair[0]).attr('viewBox','0 -4 8 8')
            .attr('refX',15).attr('refY',0).attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
            .append('path').attr('d','M0,-4L8,0L0,4').attr('fill',pair[1]);
    });

    // Root group
    let root = svg.select('.ag-root');
    if (root.empty()) {
        root = svg.append('g').attr('class','ag-root');
        root.append('g').attr('class','ag-edge-layer');
        root.append('g').attr('class','ag-node-layer');
    }

    if (_agNodes.length === 0) { root.selectAll('*').remove(); return; }
    _agComputeLayout();

    // Node count badge
    const cnt = document.getElementById('ag-node-count');
    if (cnt) cnt.textContent = _agNodes.length + ' nodes · ' + _agEdges.length + ' edges';

    // ── Edges ──
    var visibleEdges = _agEdges.filter(function(e) {
        var tgt = _agNodes.find(function(n){ return n.id === e.to; });
        return tgt && tgt._visible !== false;
    });
    var edgeSel = root.select('.ag-edge-layer').selectAll('.ag-edge')
        .data(visibleEdges, function(d){ return d.from+'-'+d.to; });
    edgeSel.exit().transition().duration(200).attr('opacity',0).remove();
    var edgeEnter = edgeSel.enter().append('path').attr('class','ag-edge')
        .attr('fill','none').attr('opacity',0);
    edgeEnter.transition().duration(300).attr('opacity',1);
    edgeEnter.merge(edgeSel).attr('stroke-width',1.5).each(function(d) {
        var src = _agNodes.find(function(n){ return n.id === d.from; });
        var tgt = _agNodes.find(function(n){ return n.id === d.to; });
        if (!src || !tgt) return;
        var isOk     = tgt.type === 'result_ok';
        var isFail   = tgt.type === 'result_fail';
        var isPar    = tgt.type.startsWith('tool_') && src.type === 'parallel';
        var r1 = _agS(src.type).r, r2 = _agS(tgt.type).r;
        var dx = tgt.x-src.x, dy = tgt.y-src.y;
        var len = Math.sqrt(dx*dx+dy*dy)||1;
        var ux=dx/len, uy=dy/len;
        var sx=src.x+ux*r1, sy=src.y+uy*r1;
        var ex=tgt.x-ux*(r2+2), ey=tgt.y-uy*(r2+2);
        var qx=(sx+ex)/2+(isPar?0:isOk||isFail?0:-20), qy=(sy+ey)/2;
        var stroke = isPar  ? (isLight?'rgba(234,88,12,.35)' :'rgba(249,115,22,.3)') :
                     isOk   ? (isLight?'rgba(74,124,0,.4)'   :'rgba(204,255,0,.25)') :
                     isFail ? (isLight?'rgba(220,38,38,.4)'  :'rgba(239,68,68,.25)') :
                               (isLight?'#ccc':'#1c1c1c');
        var dash = (isPar||isOk||isFail)?'5,3':'3,5';
        var arr  = isPar  ? 'url(#ag-arr-par)' :
                   isOk   ? 'url(#ag-arr-ok)'  :
                   isFail ? 'url(#ag-arr-fail)' : 'url(#ag-arr-main)';
        d3.select(this)
            .attr('d','M'+sx+','+sy+' Q'+qx+','+qy+' '+ex+','+ey)
            .attr('stroke',stroke).attr('stroke-dasharray',dash).attr('marker-end',arr);
    });

    // ── Nodes ──
    var visibleNodes = _agNodes.filter(function(n){ return n._visible !== false; });
    var nodeSel = root.select('.ag-node-layer').selectAll('.ag-node')
        .data(visibleNodes, function(d){ return d.id; });
    nodeSel.exit().transition().duration(200).attr('opacity',0).remove();
    var nodeEnter = nodeSel.enter().append('g').attr('class','ag-node').style('cursor','pointer')
        .attr('opacity',0)
        .attr('transform', function(d){ return 'translate('+d.x+','+d.y+')'; });
    nodeEnter.transition().duration(350).attr('opacity',1);

    // Glow
    nodeEnter.append('circle').attr('class','ag-glow').attr('fill','none').attr('stroke-width',1);
    // Body
    nodeEnter.append('circle').attr('class','ag-circle');
    // Icon
    nodeEnter.append('text').attr('class','ag-icon')
        .attr('text-anchor','middle').attr('dominant-baseline','central')
        .style('font-family','Material Symbols Outlined')
        .style('font-variation-settings',"'FILL' 1,'wght' 300")
        .style('pointer-events','none');
    // Label
    nodeEnter.append('text').attr('class','ag-label')
        .attr('text-anchor','middle')
        .style('font-family','JetBrains Mono, monospace')
        .style('text-transform','uppercase').style('letter-spacing','0.07em')
        .style('pointer-events','none');
    // Expand hint for parallel nodes
    nodeEnter.append('text').attr('class','ag-expand-hint')
        .attr('text-anchor','middle')
        .style('font-family','Material Symbols Outlined')
        .style('font-variation-settings',"'FILL' 1")
        .style('pointer-events','none')
        .attr('opacity',0.5);

    nodeEnter.on('click', function(ev, d) {
        ev.stopPropagation();
        if (d.type === 'parallel') { _agToggleParallel(d); return; }
        agShowDetail(d);
    });

    var nodeMerge = nodeEnter.merge(nodeSel);
    nodeMerge.transition().duration(350)
        .attr('transform', function(d){ return 'translate('+d.x+','+d.y+')'; })
        .attr('opacity', function(d){ return d._visible===false ? 0 : 1; });

    nodeMerge.select('.ag-glow')
        .attr('r', function(d){ return _agS(d.type).r + 14; })
        .attr('stroke', function(d){ return _agS(d.type).color; })
        .attr('opacity', isLight ? 0.08 : 0.1);
    nodeMerge.select('.ag-circle')
        .attr('r', function(d){ return _agS(d.type).r; })
        .attr('fill',         function(d){ return _agBg(d.type); })
        .attr('stroke',       function(d){ return _agS(d.type).color; })
        .attr('stroke-width', function(d){ return _agS(d.type).stroke; });
    nodeMerge.select('.ag-icon')
        .attr('font-size', function(d){ return _agS(d.type).r * 0.7; })
        .attr('fill',      function(d){ return _agS(d.type).color; })
        .text(function(d){ return _agS(d.type).icon; });
    nodeMerge.select('.ag-label')
        .attr('y',         function(d){ return _agS(d.type).r + 15; })
        .attr('font-size', 9)
        .attr('fill',      function(d){ return _agS(d.type).color; })
        .attr('opacity',   isLight ? 0.8 : 0.7)
        .text(function(d){ return d.label.length > 12 ? d.label.slice(0,11)+'...' : d.label; });
    nodeMerge.select('.ag-expand-hint')
        .attr('y',         function(d){ return _agS(d.type).r + 27; })
        .attr('font-size', 10)
        .attr('fill',      function(d){ return _agS(d.type).color; })
        .attr('opacity',   function(d){ return d.type==='parallel' ? 0.45 : 0; })
        .text(function(d){ return d.type==='parallel' ? (d._expanded ? 'unfold_less' : 'unfold_more') : ''; });

    // Hover effects
    nodeMerge
        .on('mouseenter', function(ev, d) {
            d3.select(this).select('.ag-glow').transition().duration(120)
                .attr('opacity', isLight ? 0.22 : 0.28);
            d3.select(this).select('.ag-circle').transition().duration(120)
                .attr('stroke-width', _agS(d.type).stroke + 1);
        })
        .on('mouseleave', function(ev, d) {
            d3.select(this).select('.ag-glow').transition().duration(120)
                .attr('opacity', isLight ? 0.08 : 0.1);
            d3.select(this).select('.ag-circle').transition().duration(120)
                .attr('stroke-width', _agS(d.type).stroke);
        });

    if (_agNodes.filter(function(n){ return n._visible!==false; }).length <= 3) {
        setTimeout(agZoomFit, 250);
    }
}

// ── Parallel expand/collapse ──────────────────────────────────────────────────

function _agToggleParallel(grpNode) {
    grpNode._expanded = !grpNode._expanded;
    _agRender();
    if (grpNode._expanded) setTimeout(agZoomFit, 450);
    agShowDetail(grpNode);
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function agZoom(factor) {
    if (!_agD3Zoom) return;
    d3.select('#ag-graph-svg').transition().duration(220).call(_agD3Zoom.scaleBy, factor);
}

function agZoomFit() {
    var svgEl = document.getElementById('ag-graph-svg');
    if (!svgEl || !_agD3Zoom || _agNodes.length === 0) return;
    var vis = _agNodes.filter(function(n){ return n._visible !== false; });
    if (vis.length === 0) return;
    var W = svgEl.clientWidth || 800, H = svgEl.clientHeight || 600;
    var xs = vis.map(function(n){ return n.x; });
    var ys = vis.map(function(n){ return n.y; });
    var x0=Math.min.apply(null,xs)-80, x1=Math.max.apply(null,xs)+80;
    var y0=Math.min.apply(null,ys)-80, y1=Math.max.apply(null,ys)+80;
    var k = Math.min(0.92, Math.min(W/((x1-x0)||1), H/((y1-y0)||1)));
    var tx = W/2 - k*(x0+x1)/2, ty = H/2 - k*(y0+y1)/2;
    d3.select(svgEl).transition().duration(380)
        .call(_agD3Zoom.transform, d3.zoomIdentity.translate(tx,ty).scale(k));
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function agShowDetail(node) {
    var panel   = document.getElementById('ag-detail-panel');
    var titleEl = document.getElementById('ag-detail-title');
    var iconEl  = document.getElementById('ag-detail-icon');
    var bodyEl  = document.getElementById('ag-detail-body');
    if (!panel) return;

    var st = _agS(node.type);
    var isLight = _agIsLight();
    if (titleEl) { titleEl.textContent = node.label; titleEl.style.color = isLight ? '#333' : '#aaa'; }
    if (iconEl)  { iconEl.textContent = st.icon; iconEl.style.color = st.color; }

    var d   = node.detail || {};
    var html = '<span class="ag-type-badge" style="border:1px solid '+st.color+'44;color:'+st.color+';">'
             + node.type.replace(/_/g,' ') + '</span><br>';

    if (node.type === 'parallel') {
        var toolCount = node._children.length;
        html += '<div style="margin-bottom:10px;font-size:10px;color:'+(isLight?'#555':'#888')+';">'
              + toolCount + ' tools ' + (node._expanded ? '(click to collapse)' : '(click node to expand)') + '</div>';
        node._children.forEach(function(cid) {
            var c = _agNodes.find(function(n){ return n.id === cid; });
            if (c) {
                var cs = _agS(c.type);
                html += '<div style="margin-bottom:4px;display:flex;align-items:center;gap:6px;">'
                      + '<div style="width:8px;height:8px;border-radius:50%;background:'+cs.color+';flex-shrink:0;"></div>'
                      + '<span style="font-size:10px;color:'+(isLight?'#444':'#888')+';">'+_esc(c.label)+'</span></div>';
            }
        });
    }

    if (d.thought)   html += _agSec('Thought',     _esc(d.thought), isLight);
    if (d.reasoning) html += _agSec('Reasoning',   _esc(d.reasoning), isLight);
    if (d.action)    html += '<div style="color:'+st.color+';font-weight:700;margin:6px 0 10px;font-size:11px;">&#8594; '+_esc(d.action)+'</div>';
    if (d.tool)      html += _agKV('Tool',   _esc(d.tool), isLight);
    if (d.target)    html += _agKV('Target', _esc(d.target), isLight);
    if (d.mode)      html += _agKV('Mode',   _esc(d.mode), isLight);
    if (d.params && Object.keys(d.params).length > 0)
                     html += _agSec('Parameters', _esc(JSON.stringify(d.params, null, 2)), isLight);
    if (d.output)    html += _agSec('Output',    _esc(String(d.output).slice(0, 3000)), isLight);
    if (d.error)     html += _agSec('Error',     _esc(String(d.error)), isLight);
    if (d.content)   html += _agSec('Content',   _esc(d.content), isLight);

    if (bodyEl) bodyEl.innerHTML = html || '<span style="color:#444;">No details</span>';
    panel.style.width = '310px';
}

function _agKV(title, val, isLight) {
    return '<div style="margin-bottom:8px;">'
         + '<div class="ag-detail-section-title">'+title+'</div>'
         + '<span style="font-size:11px;color:'+(isLight?'#333':'#bbb')+';">'+val+'</span></div>';
}

function _agSec(title, content, isLight) {
    return '<div style="margin-bottom:10px;">'
         + '<div class="ag-detail-section-title">'+title+'</div>'
         + '<pre class="ag-detail-pre">'+content+'</pre></div>';
}

function agCloseDetail() {
    var panel = document.getElementById('ag-detail-panel');
    if (panel) panel.style.width = '0';
}

// ── Injection from graph view ─────────────────────────────────────────────────

function agInject() {
    var inp = document.getElementById('ag-inject-input');
    if (!inp || !inp.value.trim()) return;
    var text = inp.value.trim();
    inp.value = '';
    if (!activeMissionId) { showToast('No active mission'); return; }
    fetch('/api/v1/sessions/' + activeMissionId + '/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    }).then(function(r){ return r.json(); }).then(function(d){
        if (d.ok) showToast('Instruction injected into agent');
        else showToast('Agent not running or session not found');
    }).catch(function(e){ showToast('Error: ' + e.message); });
}

// ── Event hooks ───────────────────────────────────────────────────────────────

function agOnMissionStart(data) {
    _agReset();
    var aegisId = _agAddNode('aegis', 'AEGIS', {}, null);
    _agAddNode('target', data.target || 'TARGET', { target:data.target, mode:data.mode }, aegisId);
}

function agOnThinking(data) {
    var tgt = _agNodes.find(function(n){ return n.type === 'target'; });
    var parentId = _agLastToolId !== null ? _agLastToolId : (tgt ? tgt.id : null);
    var label = data.action ? data.action.slice(0,14) : 'THINKING';
    _agLastThinkId = _agAddNode('thinking', label, data, parentId);
    _agLastToolId  = null;
    _agParallelGrpId = null;
}

function agOnToolCall(data) {
    var type = _agToolType(data.tool || '');
    var label = (data.tool || 'TOOL').toUpperCase().slice(0, 12);
    var parentId;
    if (_agParallelActive && _agParallelGrpId !== null) {
        parentId = _agParallelGrpId;
    } else {
        var tgt = _agNodes.find(function(n){ return n.type === 'target'; });
        parentId = _agLastThinkId !== null ? _agLastThinkId : (tgt ? tgt.id : null);
    }
    _agLastToolId = _agAddNode(type, label, data, parentId);
}

function agOnToolResult(data) {
    if (_agLastToolId === null) return;
    var type  = data.success !== false ? 'result_ok' : 'result_fail';
    var label = data.success !== false ? 'OK' : 'FAILED';
    _agAddNode(type, label, data, _agLastToolId);
}

function agOnParallelStart(data) {
    var tgt = _agNodes.find(function(n){ return n.type === 'target'; });
    var parentId = _agLastThinkId !== null ? _agLastThinkId : (tgt ? tgt.id : null);
    var count = data.count || (data.tools ? data.tools.length : '?');
    var label = 'PAR x' + count;
    _agParallelGrpId  = _agAddNode('parallel', label, data, parentId);
    _agParallelActive = true;
    _agLastToolId     = null;
}

function agOnParallelDone(data) {
    _agParallelActive = false;
    // Make the parallel group node the new "last tool" so next thinking connects to it
    if (_agParallelGrpId !== null) _agLastToolId = _agParallelGrpId;
    _agParallelGrpId = null;
    if (_agView === 'graph') _agRender();
}

function agOnReflection(data) {
    var tgt = _agNodes.find(function(n){ return n.type === 'target'; });
    var parentId = _agLastToolId !== null ? _agLastToolId
                 : _agLastThinkId !== null ? _agLastThinkId
                 : (tgt ? tgt.id : null);
    _agAddNode('reflection', 'REFLECTION', data, parentId);
}

function agOnDone(data) {
    var lastId = _agNodes.length > 0 ? _agNodes[_agNodes.length-1].id : null;
    _agAddNode('done', 'DONE', data, lastId);
    if (_agView === 'graph') setTimeout(agZoomFit, 700);
}
