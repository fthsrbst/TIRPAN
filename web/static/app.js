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

const ALL_VIEWS = ['agent', 'console', 'audit', 'config', 'intel'];

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
            if (view) switchView(view);
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
    }

    pentestBtn.addEventListener('click', () => setMode('pentest'));
    defenseBtn.addEventListener('click', () => setMode('defense'));
}

// ─── Right Sidebar Intelligence Nav ─────────────────────────────────────────

const ALL_INTEL_PANELS = ['analysis', 'network', 'shield', 'history', 'nodes'];

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
    if (!btn) return;
    btn.addEventListener('click', () => {
        const input = btn.closest('div').querySelector('input');
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = 'visibility_off';
        } else {
            input.type = 'password';
            btn.textContent = 'visibility';
        }
    });
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
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
});
