/* saas-app.js — Bootstrap, router, theme, nav, global state */

/* ──────────────────────────────────────────────────────────
   Global state
   ────────────────────────────────────────────────────────── */
const saasState = {
  theme: 'light',
  sidebarExpanded: true,
  activePage: 'new-scan',
  activeSessionId: null,
  activeSessionTarget: null,
  activeSessionProfile: null,
  activeSessionStart: null,
};

/* ──────────────────────────────────────────────────────────
   Toast
   ────────────────────────────────────────────────────────── */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const iconMap = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
  toast.className = `saas-toast saas-toast-${type}`;
  toast.innerHTML = `<span class="material-symbols-outlined">${iconMap[type] || 'info'}</span><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ──────────────────────────────────────────────────────────
   Theme
   ────────────────────────────────────────────────────────── */
function applyTheme(theme) {
  saasState.theme = theme;
  const html = document.documentElement;
  html.classList.toggle('dark', theme === 'dark');
  html.classList.toggle('light', theme !== 'dark');
  const icon = document.getElementById('s-theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  localStorage.setItem('tirpan-theme', theme);

  // update highlight.js theme
  const hljsLink = document.getElementById('hljs-theme');
  if (hljsLink) {
    hljsLink.href = theme === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
  }
}

function initTheme() {
  const stored = localStorage.getItem('tirpan-theme') || 'light';
  applyTheme(stored);
  document.getElementById('s-theme-btn')?.addEventListener('click', () => {
    applyTheme(saasState.theme === 'dark' ? 'light' : 'dark');
  });
}

/* ──────────────────────────────────────────────────────────
   Sidebar
   ────────────────────────────────────────────────────────── */
function initSidebar() {
  const stored = localStorage.getItem('saas-sidebar') !== 'collapsed';
  saasState.sidebarExpanded = stored;
  applySidebar(stored);

  document.getElementById('s-sidebar-toggle')?.addEventListener('click', () => {
    saasState.sidebarExpanded = !saasState.sidebarExpanded;
    applySidebar(saasState.sidebarExpanded);
    localStorage.setItem('saas-sidebar', saasState.sidebarExpanded ? 'expanded' : 'collapsed');
  });

  // Mobile overlay
  document.getElementById('s-mobile-menu-btn')?.addEventListener('click', () => {
    document.getElementById('s-sidebar')?.classList.toggle('mobile-open');
    document.getElementById('s-mobile-overlay')?.classList.toggle('hidden');
  });
  document.getElementById('s-mobile-overlay')?.addEventListener('click', () => {
    document.getElementById('s-sidebar')?.classList.remove('mobile-open');
    document.getElementById('s-mobile-overlay')?.classList.add('hidden');
  });
}

function applySidebar(expanded) {
  const sidebar = document.getElementById('s-sidebar');
  if (!sidebar) return;
  sidebar.classList.toggle('sidebar-expanded', expanded);
  sidebar.classList.toggle('sidebar-collapsed', !expanded);
  const icon = document.getElementById('s-sidebar-toggle-icon');
  if (icon) icon.textContent = expanded ? 'chevron_left' : 'chevron_right';
}

/* ──────────────────────────────────────────────────────────
   Router
   ────────────────────────────────────────────────────────── */
const PAGE_CLASSES = {
  'new-scan':      NewScanPage,
  'mission-live':  MissionLivePage,
  'ai-assistant':  AIAssistantPage,
  'terminal':      TerminalPage,
  'activity':      ActivityPage,
  'reports':       ReportsPage,
  'files':         FilesPage,
  'settings':      SettingsPage,
};

const router = (() => {
  let currentPage = null;
  let currentKey  = null;

  function navigate(page, params = {}) {
    if (!PAGE_CLASSES[page]) page = 'new-scan';

    if (currentPage) {
      try { currentPage.unmount(); } catch {}
    }

    document.querySelectorAll('.s-page').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.remove('hidden');

    currentKey  = page;
    currentPage = new PAGE_CLASSES[page]();
    try { currentPage.mount(params); } catch (e) { console.error(e); }

    updateNav(page);
    updateBreadcrumb(page);
    saasState.activePage = page;

    if (window.location.hash.slice(1) !== page) {
      history.pushState({ page, params }, '', '#' + page);
    }

    // close mobile sidebar
    document.getElementById('s-sidebar')?.classList.remove('mobile-open');
    document.getElementById('s-mobile-overlay')?.classList.add('hidden');
  }

  function updateNav(active) {
    document.querySelectorAll('[data-nav]').forEach(item => {
      item.classList.toggle('nav-active', item.dataset.nav === active);
    });
  }

  function updateBreadcrumb(page) {
    const labels = {
      'new-scan':     'New Scan',
      'mission-live': 'Mission Live',
      'ai-assistant': 'AI Assistant',
      'terminal':     'Terminal',
      'activity':     'Activity',
      'reports':      'Reports',
      'files':        'Files',
      'settings':     'Settings',
    };
    const el = document.getElementById('s-breadcrumb');
    if (el) el.textContent = labels[page] || page;
  }

  return { navigate, currentKey: () => currentKey };
})();

/* ──────────────────────────────────────────────────────────
   Nav bindings
   ────────────────────────────────────────────────────────── */
function initNav() {
  document.querySelectorAll('[data-nav]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      router.navigate(item.dataset.nav);
    });
  });
}

/* ──────────────────────────────────────────────────────────
   System stats poll & connection indicator
   ────────────────────────────────────────────────────────── */
function initConnectionIndicator() {
  saasWs.on('_connected', () => {
    const dot = document.getElementById('s-ws-dot');
    const txt = document.getElementById('s-ws-text');
    if (dot) { dot.classList.add('connected'); dot.classList.remove('disconnected'); }
    if (txt) txt.textContent = 'Connected';
  });
  saasWs.on('_disconnected', () => {
    const dot = document.getElementById('s-ws-dot');
    const txt = document.getElementById('s-ws-text');
    if (dot) { dot.classList.remove('connected'); dot.classList.add('disconnected'); }
    if (txt) txt.textContent = 'Reconnecting…';

    document.getElementById('s-offline-banner')?.classList.remove('hidden');
    setTimeout(() => document.getElementById('s-offline-banner')?.classList.add('hidden'), 5000);
  });
}

function pollSystemStats() {
  async function update() {
    try {
      const s = await API.getSystemStats();
      if (s) {
        const cpu = document.getElementById('s-cpu');
        const ram = document.getElementById('s-ram');
        if (cpu) cpu.textContent = (s.cpu || 0).toFixed(0) + '%';
        if (ram) ram.textContent = (s.ram_used_gb || 0).toFixed(1) + ' GB';
      }
    } catch {}
  }
  update();
  setInterval(update, 15000);
}

/* ──────────────────────────────────────────────────────────
   Mission controls in header
   ────────────────────────────────────────────────────────── */
function initMissionControls() {
  document.getElementById('ml-pause-btn')?.addEventListener('click', () => {
    const p = router.currentKey() === 'mission-live';
    if (p && window.__currentPage) window.__currentPage.pauseMission?.();
  });
  document.getElementById('ml-resume-btn')?.addEventListener('click', () => {
    if (window.__currentPage) window.__currentPage.resumeMission?.();
  });
  document.getElementById('ml-stop-btn')?.addEventListener('click', () => {
    if (window.__currentPage) window.__currentPage.stopMission?.();
  });
}

/* ──────────────────────────────────────────────────────────
   Bootstrap
   ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initNav();
  initConnectionIndicator();
  pollSystemStats();

  saasWs.connect();

  window.addEventListener('popstate', (e) => {
    const page = (e.state && e.state.page) || window.location.hash.slice(1) || 'new-scan';
    router.navigate(page, (e.state && e.state.params) || {});
  });

  const initPage = window.location.hash.slice(1) || 'new-scan';
  router.navigate(initPage);

  // expose page instance for header controls
  const _origNavigate = router.navigate;
  // patch to expose current page instance globally for header button wiring
  Object.defineProperty(window, '__currentPage', {
    get: () => {
      // Access internal currentPage via closure — unavailable directly
      // Instead we wire controls inside each page's mount
      return null;
    }
  });
});
