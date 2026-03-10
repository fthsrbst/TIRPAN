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

const ALL_VIEWS = ['agent', 'console', 'audit', 'config', 'report', 'intel'];

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
    }

    pentestBtn.addEventListener('click', () => setMode('pentest'));
    defenseBtn.addEventListener('click', () => setMode('defense'));
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

// ─── Network Topology Fullscreen ─────────────────────────────────────────────

function openTopoFullscreen() {
    const overlay = document.getElementById('topo-fullscreen-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

function closeTopoFullscreen() {
    const overlay = document.getElementById('topo-fullscreen-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function initTopoFullscreen() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeTopoFullscreen();
    });
    const overlay = document.getElementById('topo-fullscreen-overlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeTopoFullscreen();
        });
    }
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

        if (document.startViewTransition) {
            document.startViewTransition(applyToggle);
        } else {
            applyToggle();
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
    const container = document.querySelector('#view-agent .overflow-y-auto');
    if (!container) return;
    container.addEventListener('scroll', () => {
        const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
        autoScroll = atBottom;
    });
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
          <p class="text-secondary-text text-xs font-display font-bold uppercase tracking-[0.2em]">AEGIS Ready</p>
          <p class="text-[11px] mono-text" style="color:#333;">Ask anything or configure a mission target →</p>
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
        btn.addEventListener('click', () => loadConversation(conv.id));

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
        loadConversation(conversations[0].id);
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
    const btn = document.getElementById('chat-send-btn');
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
    return document.getElementById('message-stream');
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
          <div class="user-msg-text bg-card border border-border-color p-4 text-sm leading-relaxed whitespace-pre-wrap" style="color:#d1d5db;font-family:'Inter',sans-serif;">${escapeHtml(text)}</div>
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
          <div class="bg-surface border-l-2 border-l-primary border border-border-color p-5">
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
          <div class="bg-surface border-l-2 border-l-primary border border-border-color p-5">
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
    const container = document.querySelector('#view-agent .overflow-y-auto');
    if (container) container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sendChatMessage(text) {
    if (!text.trim()) return;
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

function initChatInput() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
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

    const expandBtn = document.getElementById('chat-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', () => openFullscreenInput(input.value));
    }

    // Fullscreen overlay buttons & keyboard
    const fsOverlay = document.getElementById('input-fullscreen-overlay');
    const fsCancelBtn = document.getElementById('fs-cancel-btn');
    const fsSendBtn = document.getElementById('fs-send-btn');
    const fsTa = document.getElementById('input-fullscreen-textarea');

    if (fsCancelBtn) fsCancelBtn.addEventListener('click', () => closeFullscreenInput(false));
    if (fsSendBtn) fsSendBtn.addEventListener('click', () => closeFullscreenInput(true));
    if (fsOverlay) {
        fsOverlay.addEventListener('click', (e) => {
            if (e.target === fsOverlay) closeFullscreenInput(false);
        });
    }
    if (fsTa) {
        fsTa.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) closeFullscreenInput(true);
            if (e.key === 'Escape') closeFullscreenInput(false);
        });
    }
}

// ─── Ollama Status & Model Selector ──────────────────────────────────────────

let availableModels = [];
let activeModel = '';
let activeProvider = 'ollama';  // 'ollama' | 'lmstudio'
let ollamaBaseUrl = 'http://127.0.0.1:11434';

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
    const prefix = activeProvider === 'lmstudio' ? '[LMS] ' : '';
    if (lbl) lbl.textContent = activeModel ? prefix + activeModel : '—';
}

function populateModelDropdown() {
    // Header dropdown
    const list = document.getElementById('model-dropdown-list');
    if (list) {
        list.innerHTML = '';

        const hasOllama = availableModels.length > 0;
        const hasLMS = lmStudioModels.length > 0;

        if (!hasOllama && !hasLMS) {
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
        if (data.openrouter_api_key) {
            const keyInput = document.getElementById('cfg-openrouter-key');
            if (keyInput) keyInput.value = data.openrouter_api_key;
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

    const url      = document.getElementById('cfg-ollama-url')?.value?.trim()    || ollamaBaseUrl;
    const model    = document.getElementById('cfg-ollama-model')?.value?.trim()  || activeModel;
    const apiKey   = document.getElementById('cfg-openrouter-key')?.value?.trim() || '';
    const lmsUrl   = document.getElementById('cfg-lmstudio-url')?.value?.trim()   || lmStudioBaseUrl;
    const lmsModel = document.getElementById('cfg-lmstudio-model')?.value?.trim() || lmStudioModel;

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
        if (apiKey) {
            await fetch('/api/v1/settings/openrouter_api_key', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: apiKey }),
            });
        }
        ollamaBaseUrl = url;
        lmStudioBaseUrl = lmsUrl;
        lmStudioModel = lmsModel;
        if (activeProvider === 'ollama') activeModel = model;
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
    initModelSelector();
    initCfgModelDropdown();
    initLMStudioModelDropdown();
    initConfigSave();
    initScrollTracking();
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

// Extend the existing ws.onmessage to handle session events
const _origWsConnect = wsConnect;
wsConnect = function () {
    _origWsConnect();
    // Patch onmessage after connect
    const _origOnOpen = ws ? ws.onopen : null;
    // We'll override onmessage in a wrapper below
};

// Override ws message handler to also handle session events
function patchWsSessionHandler() {
    if (!ws) return;
    const originalOnMessage = ws.onmessage;
    ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }

        // Handle session events before calling original handler
        if (msg.type === 'session_event') {
            handleSessionEvent(msg);
            return;
        }
        if (msg.type === 'session_done') {
            handleSessionDone(msg);
            return;
        }
        if (msg.type === 'session_error') {
            handleSessionError(msg);
            return;
        }
        if (msg.type === 'session_subscribed') {
            return;
        }

        // Fall through to original handler
        if (originalOnMessage) originalOnMessage(event);
    };
}

function handleSessionEvent(msg) {
    const event = msg.event;
    const data = msg.data || {};

    // Update phase progress bar
    if (event === 'start') {
        setPhaseActive(1);
        updateMissionStatusHeader('running', msg.session_id);
    } else if (event === 'reasoning') {
        appendConsoleLine(`[REASONING] ${data.thought || data.action || ''}`, 'text-secondary-text');
    } else if (event === 'tool_call') {
        appendConsoleToolCall(data);
    } else if (event === 'tool_result') {
        appendConsoleToolResult(data);
    } else if (event === 'phase_change' || event === 'discovery') {
        updatePhaseFromEvent(data);
    } else if (event === 'kill_switch') {
        showToast('Emergency stop activated');
        updateMissionStatusHeader('stopped', msg.session_id);
    } else if (event === 'max_iterations') {
        showToast('Max iterations reached — mission finishing');
    } else if (event === 'error') {
        appendConsoleLine(`[ERROR] ${data.error || ''}`, 'text-danger');
    }

    // Refresh stats counters
    if (activeMissionId) {
        refreshMissionStats(activeMissionId);
    }
}

function handleSessionDone(msg) {
    setPhaseActive(5);
    updateMissionStatusHeader('done', msg.session_id);
    stopMissionPoll();
    showToast('Mission complete');
    appendConsoleLine('[SESSION] Agent finished — report available in the Report tab', 'text-primary');

    // Update stat counters from final counts
    if (msg.hosts !== undefined) setStatValue('stat-hosts', msg.hosts);
    if (msg.vulns !== undefined) setStatValue('stat-vulns', msg.vulns);
    if (msg.exploits !== undefined) setStatValue('stat-ports', msg.exploits + '+ exploits');

    // Reload sessions in selects
    loadSessionsForSelects();
}

function handleSessionError(msg) {
    updateMissionStatusHeader('error', msg.session_id);
    stopMissionPoll();
    showToast('Mission error: ' + (msg.error || 'unknown'), true);
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

    if (!target) {
        showToast('Enter a target IP or CIDR range');
        if (targetInput) targetInput.focus();
        return;
    }

    if (startBtn) { startBtn.textContent = 'Starting...'; startBtn.disabled = true; }

    try {
        const res = await fetch('/api/v1/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, mode }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Start failed');
        }
        const data = await res.json();
        activeMissionId = data.session_id;
        missionStartTime = Date.now();

        // Update UI
        updateMissionStatusHeader('running', activeMissionId);
        resetMissionStats();
        setPhaseActive(1);
        clearConsoleOutput();
        appendConsoleLine(`[SESSION] Started: ${activeMissionId}`, 'text-primary');
        appendConsoleLine(`[TARGET]  ${target}  [MODE] ${mode.toUpperCase()}`, 'text-secondary-text');

        // Subscribe to session events via WebSocket
        if (ws && wsReady) {
            ws.send(JSON.stringify({ type: 'subscribe_session', session_id: activeMissionId }));
            patchWsSessionHandler();
        }

        // Start polling for DB-backed stats
        startMissionPoll(activeMissionId);
        startMissionUptime();

        // Switch to agent view
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
                    updateMissionStatusHeader('stopped', activeMissionId);
                    stopMissionPoll();
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

function startMissionUptime() {
    if (missionUptimeHandle) clearInterval(missionUptimeHandle);
    missionUptimeHandle = setInterval(() => {
        if (!missionStartTime) return;
        const elapsed = Math.floor((Date.now() - missionStartTime) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        const uptimeEl = document.getElementById('stat-uptime');
        if (uptimeEl) uptimeEl.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

async function refreshMissionStats(sessionId) {
    try {
        const res = await fetch(`/api/v1/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();

        setStatValue('stat-vulns', data.vulns_found ?? '—');
        setStatValue('stat-hosts', data.hosts_found ?? '—');
        setStatValue('stat-ports', data.ports_found ?? '—');

        // Update phase bar based on agent's attack_phase
        updatePhaseFromSessionStatus(data.status);

        // Stop polling if session is done/error
        if (data.status === 'done' || data.status === 'error') {
            stopMissionPoll();
            updateMissionStatusHeader(data.status, sessionId);
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
    setStatValue('stat-uptime', '00:00:00');
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
        'EXPLOITATION': 4, 'DONE': 5,
    };
    const n = phaseMap[phase.toUpperCase()];
    if (n) setPhaseActive(n);
}

function updatePhaseFromSessionStatus(status) {
    if (status === 'running') setPhaseActive(1);
    else if (status === 'done') setPhaseActive(5);
}

// ─── Mission status header ─────────────────────────────────────────────────────

function updateMissionStatusHeader(status, sessionId) {
    const dot = document.getElementById('mission-status-dot');
    const text = document.getElementById('mission-status-text');
    const short = sessionId ? sessionId.slice(0, 8) : '';

    const statusMap = {
        running: { color: 'bg-primary', label: `Mission Active · ${short}` },
        done:    { color: 'bg-primary', label: `Mission Done · ${short}` },
        stopped: { color: 'bg-danger', label: `Mission Stopped · ${short}` },
        error:   { color: 'bg-danger', label: `Mission Error · ${short}` },
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
    const bash = document.getElementById('console-bash');
    if (bash) bash.innerHTML = '';
}

function appendConsoleLine(text, colorClass = 'text-primary') {
    const bash = document.getElementById('console-bash');
    if (!bash) return;
    const line = document.createElement('div');
    line.className = colorClass;
    line.textContent = text;
    bash.appendChild(line);
    bash.scrollTop = bash.scrollHeight;
}

function appendConsoleToolCall(data) {
    const tool = data.tool_name || data.action || '';
    const target = data.target_ip || '';
    const ts = new Date().toLocaleTimeString();
    appendConsoleLine(`[${ts}] TOOL_CALL: ${tool}${target ? ' → ' + target : ''}`, 'text-slate-300');
    if (data.params) {
        appendConsoleLine(`         params: ${JSON.stringify(data.params)}`, 'text-secondary-text');
    }
}

function appendConsoleToolResult(data) {
    const success = data.success !== false;
    const color = success ? 'text-primary' : 'text-danger';
    appendConsoleLine(`         result: ${success ? 'OK' : 'FAILED'} ${data.summary || ''}`, color);
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
                const ts = s.created_at ? new Date(s.created_at * 1000).toLocaleDateString() : '';
                opt.textContent = `${s.id.slice(0, 8)} · ${s.target} · ${s.status.toUpperCase()} · ${ts}`;
                auditSelect.appendChild(opt);
            });
            if (currentVal) auditSelect.value = currentVal;
        }

        // Auto-set active mission if sessions exist with running status
        if (!activeMissionId) {
            const running = sessions.find(s => s.is_running);
            if (running) {
                activeMissionId = running.id;
                missionStartTime = Date.now() - ((running.updated_at - running.created_at) * 1000);
                updateMissionStatusHeader('running', running.id);
                patchWsSessionHandler();
                if (ws && wsReady) {
                    ws.send(JSON.stringify({ type: 'subscribe_session', session_id: running.id }));
                }
                startMissionPoll(running.id);
                startMissionUptime();
            }
        }

        // Populate report session select (report view uses last session by default)
        if (sessions.length > 0 && !activeMissionId) {
            const latest = sessions[0];
            const badge = document.getElementById('report-session-badge');
            if (badge) badge.textContent = `Session ${latest.id.slice(0, 8).toUpperCase()}`;
        }

    } catch { /* ignore */ }
}

// ─── Audit Log View ────────────────────────────────────────────────────────────

let auditCurrentFilter = 'ALL';

function initAuditView() {
    const sessionSelect = document.getElementById('audit-session-select');
    const searchInput = document.getElementById('audit-search-input');
    const filterBtns = document.querySelectorAll('.audit-filter-btn');

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
            auditCurrentFilter = btn.dataset.filter || 'ALL';
            loadAuditLogs();
        });
    });

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
    const filter = auditCurrentFilter !== 'ALL' ? auditCurrentFilter : '';

    const params = new URLSearchParams();
    if (sessionId) params.set('session_id', sessionId);
    if (filter) params.set('event_type', filter);
    if (search) params.set('search', search);
    params.set('limit', '200');

    try {
        const res = await fetch(`/api/v1/audit?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        const entries = data.entries || [];

        if (tbody) {
            if (entries.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-secondary-text text-xs mono-text">No audit log entries found</td></tr>`;
            } else {
                tbody.innerHTML = entries.map(e => buildAuditRow(e)).join('');
            }
        }
        if (countEl) countEl.textContent = `Showing ${entries.length} entries`;

    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-danger text-xs">Failed to load audit logs</td></tr>`;
    }
}

function buildAuditRow(entry) {
    const ts = entry.created_at
        ? new Date(entry.created_at * 1000).toISOString().replace('T', ' ').slice(0, 19)
        : '—';
    const sid = entry.session_id ? entry.session_id.slice(0, 8).toUpperCase() : '—';
    const event = entry.event_type || '—';
    const tool = entry.tool_name || (entry.details ? JSON.stringify(entry.details).slice(0, 60) : '—');
    const target = entry.target || '—';

    const eventColor = getAuditEventColor(event);
    const statusBadge = getAuditStatusBadge(event);

    return `<tr class="border-b border-border-color hover:bg-surface transition-colors${event.includes('KILL') || event.includes('BLOCK') ? ' bg-danger/5' : ''}">
      <td class="px-6 py-3 text-secondary-text">${escapeHtml(ts)}</td>
      <td class="px-4 py-3 text-slate-400">${escapeHtml(sid)}</td>
      <td class="px-4 py-3"><span class="${eventColor} font-bold">${escapeHtml(event)}</span></td>
      <td class="px-4 py-3 text-slate-300">${escapeHtml(tool)}</td>
      <td class="px-4 py-3 text-slate-300">${escapeHtml(target)}</td>
      <td class="px-4 py-3">${statusBadge}</td>
    </tr>`;
}

function getAuditEventColor(event) {
    if (event.includes('KILL') || event.includes('BLOCK') || event.includes('ERROR')) return 'text-danger';
    if (event.includes('START') || event.includes('SUCCESS') || event.includes('OK')) return 'text-primary';
    if (event.includes('END') || event.includes('DONE')) return 'text-secondary-text';
    return 'text-slate-300';
}

function getAuditStatusBadge(event) {
    if (event.includes('KILL') || event.includes('BLOCK')) {
        return '<span class="px-2 py-0.5 bg-danger/10 border border-danger/20 text-danger text-[8px] font-bold uppercase">BLOCKED</span>';
    }
    if (event.includes('ERROR')) {
        return '<span class="px-2 py-0.5 bg-danger/10 border border-danger/20 text-danger text-[8px] font-bold uppercase">ERROR</span>';
    }
    if (event.includes('SUCCESS') || event.includes('START')) {
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
    const htmlBtnBottom = document.getElementById('export-html-btn-bottom');
    const pdfBtnBottom = document.getElementById('download-pdf-btn-bottom');

    if (genBtn) genBtn.addEventListener('click', generateReport);
    if (htmlBtn) htmlBtn.addEventListener('click', exportReportHTML);
    if (pdfBtn) pdfBtn.addEventListener('click', downloadReportPDF);
    if (htmlBtnBottom) htmlBtnBottom.addEventListener('click', exportReportHTML);
    if (pdfBtnBottom) pdfBtnBottom.addEventListener('click', downloadReportPDF);

    // Load report when switching to report view
    const reportNavItem = document.querySelector('[data-view="report"]');
    if (reportNavItem) {
        reportNavItem.addEventListener('click', () => {
            if (!reportSessionId && activeMissionId) {
                reportSessionId = activeMissionId;
                updateReportBadge(reportSessionId);
            }
        });
    }
}

async function generateReport() {
    const sid = reportSessionId || activeMissionId;
    if (!sid) {
        showToast('No session selected — start a mission first');
        return;
    }
    reportSessionId = sid;
    updateReportBadge(sid);

    const btn = document.getElementById('generate-report-btn');
    if (btn) { btn.querySelector('span').textContent = 'hourglass_empty'; btn.style.opacity = '0.6'; }

    try {
        const res = await fetch(`/api/v1/sessions/${sid}/report/html`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        injectReportContent(html);
        showToast('Report generated');
    } catch (err) {
        showToast('Report generation failed: ' + err.message, true);
    } finally {
        if (btn) { btn.querySelector('span').textContent = 'refresh'; btn.style.opacity = ''; }
    }
}

function injectReportContent(htmlString) {
    const container = document.getElementById('report-content');
    if (!container) return;

    // Parse the generated HTML and extract body content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const body = doc.body;

    // If the template returns a full HTML page, extract body inner HTML
    // Otherwise use it directly
    if (body && body.innerHTML.trim()) {
        // Wrap in a styled iframe-like container for isolation
        container.innerHTML = `<div class="bg-white text-black p-8 overflow-auto min-h-[400px] border border-border-color">
            <div class="report-html-content">${body.innerHTML}</div>
        </div>`;
    } else {
        container.innerHTML = `<div class="text-secondary-text text-xs p-8">Report content is empty</div>`;
    }
}

function exportReportHTML() {
    const sid = reportSessionId || activeMissionId;
    if (!sid) { showToast('No session to export'); return; }
    window.open(`/api/v1/sessions/${sid}/report/html`, '_blank');
}

function downloadReportPDF() {
    const sid = reportSessionId || activeMissionId;
    if (!sid) { showToast('No session — start a mission first'); return; }
    window.open(`/api/v1/sessions/${sid}/report/pdf`, '_blank');
}

function updateReportBadge(sessionId) {
    const badge = document.getElementById('report-session-badge');
    if (badge && sessionId) badge.textContent = `Session ${sessionId.slice(0, 8).toUpperCase()}`;
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
