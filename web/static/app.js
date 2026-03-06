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

const ALL_VIEWS = ['agent', 'console', 'audit', 'config'];

function switchView(viewName) {
    if (!viewName) return;

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
    initClock();
    initAuditFilters();
    initApiKeyToggle();
});
