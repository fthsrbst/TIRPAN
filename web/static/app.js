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
    const container = document.getElementById('chat-scroll-area');
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
                    <div class="border-l-2 border-yellow-500/50 bg-surface pl-4 pr-4 py-2 font-mono text-xs">
                        <div class="flex items-center gap-2 text-yellow-400/80 font-bold text-[10px] uppercase tracking-widest mb-1">
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
        clearMissionFeed();
        renderMissionStart(data.target || '', data.mode || '');
        appendConsoleLine(`[START] Target: ${data.target || ''} · Mode: ${data.mode || ''}`, 'text-primary');

    } else if (event === 'llm_thinking_start') {
        setAgentStatus('reasoning');
        startAgentStreamCard('thinking');

    } else if (event === 'llm_reflecting_start') {
        setAgentStatus('reflecting');
        startAgentStreamCard('reflecting');

    } else if (event === 'llm_token') {
        appendAgentStreamToken(data.token || '');

    } else if (event === 'reasoning') {
        setAgentStatus('reasoning', data.action ? `→ ${data.action}` : '');
        finalizeAgentStreamCard();
        renderMissionReasoning(data);
        updatePhaseFromEvent(data);
        appendConsoleLine(`[THINK] ${data.thought || data.action || ''}`, 'text-secondary-text');
        if (data.action) {
            appendConsoleLine(`[ACTION] → ${data.action}`, 'text-slate-400');
        }

    } else if (event === 'tool_call') {
        const toolName = data.tool || data.tool_name || data.action || '';
        setAgentStatus('acting', toolName);
        renderMissionToolCall(data);
        appendConsoleToolCall(data);

    } else if (event === 'tool_result') {
        setAgentStatus('reasoning');
        renderMissionToolResult(data);
        appendConsoleToolResult(data);

    } else if (event === 'reflection') {
        setAgentStatus('reflecting');
        finalizeAgentStreamCard();
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

    } else if (event === 'phase_change' || event === 'discovery') {
        updatePhaseFromEvent(data);

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

    } else if (event === 'injected') {
        appendConsoleLine(`[INJECT] Operator instruction added to agent memory`, 'text-yellow-400');

    } else if (event === 'operator_response') {
        const thought = data.thought || '';
        appendMissionCard(`
            <div class="border-l-2 border-primary/60 bg-primary/5 pl-4 pr-4 py-3 font-mono text-xs">
                <div class="flex items-center gap-2 text-primary/80 font-bold text-[10px] uppercase tracking-widest mb-1.5">
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
        hosts: counts.hosts,
        vulns: counts.vulns,
        exploits: counts.exploits,
    });
    appendConsoleLine('[SESSION] Agent finished — report available in the Report tab', 'text-primary');

    if (counts.hosts    !== undefined) setStatValue('stat-hosts', counts.hosts);
    if (counts.vulns    !== undefined) setStatValue('stat-vulns', counts.vulns);
    if (counts.exploits !== undefined) setStatValue('stat-ports', counts.exploits);

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

        // Update UI
        updateMissionStatusHeader('running', activeMissionId, target);
        resetMissionStats();
        resetPhaseBar();
        setPhaseActive(1);
        clearConsoleOutput();
        clearMissionFeed();
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
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(seconds % 60)).padStart(2, '0');
    setStatValue('stat-uptime', `${h}:${m}:${s}`);
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

        setStatValue('stat-vulns', data.vulns_found ?? '—');
        setStatValue('stat-hosts', data.hosts_found ?? '—');
        setStatValue('stat-ports', data.ports_found ?? '—');

        // Update phase bar based on agent's attack_phase
        updatePhaseFromSessionStatus(data.status);

        // Stop polling if session is finished
        if (data.status === 'done' || data.status === 'error' || data.status === 'stopped') {
            stopMissionPoll();
            stopMissionUptime();
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

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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
        feed.className = 'flex flex-col gap-2 w-full';
        stream.appendChild(feed);
    }
    return feed;
}

function appendMissionCard(html) {
    const feed = getMissionFeed();
    if (!feed) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    if (wrapper.firstChild) feed.appendChild(wrapper.firstChild);
    // Scroll the overflow parent
    const stream = document.getElementById('message-stream');
    const scrollEl = stream ? stream.parentElement : null;
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
}

function clearMissionFeed() {
    const feed = document.getElementById('mission-feed');
    if (feed) feed.remove();
    _missionIteration = 0;
    const emptyState = document.getElementById('agent-empty-state');
    if (emptyState) emptyState.style.display = '';
}

function renderMissionStart(target, mode) {
    const ts = new Date().toLocaleTimeString();
    appendMissionCard(`
        <div class="border border-primary/30 bg-primary/5 px-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 text-primary font-bold mb-1">
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings:'FILL' 1;">rocket_launch</span>
                MISSION STARTED &nbsp;·&nbsp; ${ts}
            </div>
            <div class="text-secondary-text">TARGET &nbsp;<span class="text-slate-200">${_esc(target)}</span> &nbsp;&nbsp; MODE &nbsp;<span class="text-slate-200">${_esc(mode).toUpperCase()}</span></div>
        </div>
    `);
}

// ── Agent LLM Streaming ──────────────────────────────────────────────────────

let _agentStreamEl = null;   // the live streaming card element
let _agentStreamBody = null; // the <pre> inside it that receives tokens

function startAgentStreamCard(mode) {
    finalizeAgentStreamCard(); // close any previous open card
    const isReflect = mode === 'reflecting';
    const borderColor = isReflect ? 'border-purple-500/40' : 'border-yellow-500/30';
    const labelColor  = isReflect ? 'text-purple-400/70' : 'text-yellow-400/70';
    const icon        = isReflect ? 'lightbulb' : 'psychology';
    const label       = isReflect ? 'REFLECTING' : 'THINKING';

    const wrapper = document.createElement('div');
    wrapper.className = 'mission-card-wrapper';
    wrapper.innerHTML = `
        <div class="border-l-2 ${borderColor} bg-surface pl-4 pr-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 ${labelColor} font-bold text-[10px] uppercase tracking-widest mb-2">
                <span class="material-symbols-outlined text-[13px]">${icon}</span>
                ${label}
                <span class="inline-block w-1.5 h-3 bg-current ml-1 animate-pulse" id="agent-stream-cursor"></span>
            </div>
            <pre id="agent-stream-body" class="text-secondary-text text-[10px] leading-relaxed whitespace-pre-wrap break-all max-h-64 overflow-y-auto"></pre>
        </div>`;

    const feed = getMissionFeed();
    if (feed) {
        feed.appendChild(wrapper);
        _agentStreamEl = wrapper;
        _agentStreamBody = wrapper.querySelector('#agent-stream-body');
        const scrollEl = document.getElementById('message-stream');
        if (scrollEl && scrollEl.parentElement) scrollEl.parentElement.scrollTop = scrollEl.parentElement.scrollHeight;
    }
}

function appendAgentStreamToken(token) {
    if (!_agentStreamBody) return;
    _agentStreamBody.textContent += token;
    // Auto-scroll the card itself if it's overflowing
    _agentStreamBody.scrollTop = _agentStreamBody.scrollHeight;
    // Auto-scroll the page
    const scrollEl = document.getElementById('message-stream');
    if (scrollEl && scrollEl.parentElement) scrollEl.parentElement.scrollTop = scrollEl.parentElement.scrollHeight;
}

function finalizeAgentStreamCard() {
    if (!_agentStreamEl) return;
    // Remove the blinking cursor
    const cursor = _agentStreamEl.querySelector('#agent-stream-cursor');
    if (cursor) cursor.remove();
    _agentStreamEl = null;
    _agentStreamBody = null;
}

function renderMissionReasoning(data) {
    _missionIteration++;
    const thought   = _esc(data.thought || '');
    const reasoning = _esc(data.reasoning || '');
    const action    = _esc(data.action || '');
    appendMissionCard(`
        <div class="border-l-2 border-yellow-500/50 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 text-yellow-400/80 font-bold text-[10px] uppercase tracking-widest mb-2">
                <span class="material-symbols-outlined text-[13px]">psychology</span>
                REASONING &nbsp;·&nbsp; Iteration ${_missionIteration}
            </div>
            ${thought    ? `<div class="text-slate-300 leading-relaxed mb-2 whitespace-pre-wrap">${thought}</div>` : ''}
            ${reasoning  ? `<div class="text-secondary-text text-[11px] leading-relaxed mb-2 whitespace-pre-wrap italic">${reasoning}</div>` : ''}
            ${action     ? `<div class="text-primary text-[11px] font-bold mt-1">→ &nbsp;${action}</div>` : ''}
        </div>
    `);
}

function renderMissionToolCall(data) {
    const tool      = _esc(data.tool || '');
    const paramsStr = _esc(JSON.stringify(data.params || {}, null, 2));
    appendMissionCard(`
        <div class="border-l-2 border-blue-500/50 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 text-blue-400/80 font-bold text-[10px] uppercase tracking-widest mb-2">
                <span class="material-symbols-outlined text-[13px]">terminal</span>
                TOOL CALL
            </div>
            <div class="text-primary font-bold mb-1">▶ &nbsp;${tool}</div>
            <pre class="text-secondary-text text-[10px] overflow-x-auto whitespace-pre-wrap break-all">${paramsStr}</pre>
        </div>
    `);
}

function renderMissionToolResult(data) {
    const tool    = _esc(data.tool || '');
    const success = data.success !== false;
    const output  = _esc(data.output || data.error || '');
    const border  = success ? 'border-primary/50' : 'border-danger/50';
    const color   = success ? 'text-primary' : 'text-danger';
    const icon    = success ? 'check_circle' : 'error';
    const label   = success ? 'OK' : 'FAILED';
    appendMissionCard(`
        <div class="border-l-2 ${border} bg-surface pl-4 pr-4 py-3 font-mono text-xs">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 ${color} font-bold text-[10px] uppercase tracking-widest">
                    <span class="material-symbols-outlined text-[13px]" style="font-variation-settings:'FILL' 1;">${icon}</span>
                    RESULT: ${tool}
                </div>
                <span class="${color} font-bold text-[10px]">${label}</span>
            </div>
            ${output ? `<pre class="text-secondary-text text-[10px] overflow-x-auto max-h-48 whitespace-pre-wrap break-all">${output}</pre>` : ''}
        </div>
    `);
}

function renderMissionReflection(data) {
    const content = _esc(data.content || '');
    if (!content) return;
    appendMissionCard(`
        <div class="border-l-2 border-purple-500/40 bg-surface pl-4 pr-4 py-2 font-mono text-xs">
            <div class="flex items-center gap-2 text-purple-400/60 font-bold text-[10px] uppercase tracking-widest mb-1">
                <span class="material-symbols-outlined text-[12px]">lightbulb</span>
                REFLECTION
            </div>
            <div class="text-secondary-text text-[11px] italic leading-relaxed whitespace-pre-wrap">${content}</div>
        </div>
    `);
}

function renderMissionSafetyBlock(data) {
    const reason = _esc(data.reason || '');
    const tool   = _esc(data.tool || '');
    appendMissionCard(`
        <div class="border-l-2 border-orange-500/60 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 text-orange-400 font-bold text-[10px] uppercase tracking-widest mb-1">
                <span class="material-symbols-outlined text-[13px]">shield</span>
                SAFETY BLOCK${tool ? ' · ' + tool : ''}
            </div>
            <div class="text-orange-300/80 text-[11px]">${reason}</div>
        </div>
    `);
}

function renderMissionError(data) {
    const msg = _esc(data.error || 'Unknown error');
    appendMissionCard(`
        <div class="border-l-2 border-danger/60 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
            <div class="flex items-center gap-2 text-danger font-bold text-[10px] uppercase tracking-widest mb-1">
                <span class="material-symbols-outlined text-[13px]">error</span>
                ERROR
            </div>
            <div class="text-danger/80 text-[11px] whitespace-pre-wrap">${msg}</div>
        </div>
    `);
}

function renderMissionDone(data) {
    const ts = new Date().toLocaleTimeString();
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
            <div class="mt-3 text-center text-secondary-text text-[11px]">
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

        // Update stats
        setStatValue('stat-vulns', session.vulns_found ?? '—');
        setStatValue('stat-hosts', session.hosts_found ?? '—');
        setStatValue('stat-ports', session.ports_found ?? '—');

        // Switch to agent view
        switchView('agent');
        clearMissionFeed();

        if (isRunning) {
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
            const agentStatus = (effectiveStatus === 'error' || effectiveStatus === 'stopped') ? 'error' : 'done';
            setAgentStatus(agentStatus, `${missionDisplayName} — historical`);
            syncInputMode();

            // Try to replay stored events; fall back to summary view
            try {
                const evRes = await fetch(`/api/v1/sessions/${sessionId}/events`);
                const evData = evRes.ok ? await evRes.json() : null;
                if (evData && evData.events && evData.events.length > 0) {
                    renderMissionStart(session.target, session.mode);
                    evData.events.forEach(ev => replaySessionEvent(ev.event_type, ev.data));
                } else {
                    renderHistoricalSession(session);
                }
            } catch {
                renderHistoricalSession(session);
            }
        }

    } catch (err) {
        showToast('Error loading session: ' + err.message);
    }
}

function replaySessionEvent(event, data) {
    switch (event) {
        case 'reasoning':
            _missionIteration++;
            renderMissionReasoning(data);
            updatePhaseFromEvent(data);
            break;
        case 'tool_call':
            renderMissionToolCall(data);
            break;
        case 'tool_result':
            renderMissionToolResult(data);
            break;
        case 'reflection':
            renderMissionReflection(data);
            break;
        case 'safety_block':
            renderMissionSafetyBlock(data);
            break;
        case 'error':
            renderMissionError(data);
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
            <div class="border-l-2 border-primary/30 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
                <div class="flex items-center gap-2 text-primary/60 font-bold text-[10px] uppercase tracking-widest mb-2">
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
            <div class="border-l-2 border-danger/40 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
                <div class="flex items-center gap-2 text-danger/80 font-bold text-[10px] uppercase tracking-widest mb-2">
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
            <div class="border-l-2 border-orange-500/40 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
                <div class="flex items-center gap-2 text-orange-400/80 font-bold text-[10px] uppercase tracking-widest mb-2">
                    <span class="material-symbols-outlined text-[13px]">bolt</span>
                    EXPLOIT RESULTS · ${session.exploit_results.length} attempts
                </div>
                ${items}
            </div>
        `);
    }

    if (!session.scan_results?.length && !session.vulnerabilities?.length && !session.exploit_results?.length) {
        appendMissionCard(`
            <div class="border-l-2 border-border-color/40 bg-surface pl-4 pr-4 py-3 font-mono text-xs">
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
                <input type="checkbox" class="accent-primary" value="${c.id}" onchange="_advToggleSavedCred(${c.id}, this.checked)"/>
                <span class="font-mono">${_escHtml(c.name)}</span>
                <span class="text-secondary-text ml-1">[${_escHtml(c.cred_type)}]</span>
                <button onclick="_advDeleteSavedCred(${c.id}, this)" class="ml-auto text-secondary-text hover:text-danger transition-colors">
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
}

function _advCollectConfig() {
    const nse = [];
    document.querySelectorAll('[data-nse]:checked').forEach(cb => nse.push(cb.dataset.nse));
    const customScripts = document.getElementById('adv-custom-scripts').value.trim();
    if (customScripts) nse.push(...customScripts.split(',').map(s => s.trim()).filter(Boolean));

    return {
        mission_name: document.getElementById('adv-mission-name').value.trim(),
        target_type: document.getElementById('adv-target-type').value,
        speed_profile: _advGetSpeedProfile(),
        scan_type: _advGetScanType(),
        port_range: document.getElementById('adv-port-range').value.trim() || '1-1024',
        nse_categories: nse,
        os_detection: document.getElementById('adv-os-detect').checked,
        version_detection: document.getElementById('adv-version-detect').checked,
        allow_exploitation: document.getElementById('pol-allow-exploit').checked,
        allow_post_exploitation: document.getElementById('pol-allow-post').checked,
        allow_lateral_movement: document.getElementById('pol-allow-lateral').checked,
        allow_docker_escape: document.getElementById('pol-allow-docker').checked,
        allow_browser_recon: document.getElementById('pol-allow-browser').checked,
        mode: _advGetMode(),
        notes: (document.getElementById('adv-mission-briefing') || {}).value || '',
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
    const payload = {
        target: primaryTarget,
        mode: cfg.mode,
        port_range: cfg.port_range,
        provider: window.activeProvider || 'anthropic',
        model: window.activeModel || undefined,
        mission_name: cfg.mission_name || undefined,
        target_type: cfg.target_type !== 'auto' ? cfg.target_type : undefined,
        additional_targets: additionalTargets.length > 0 ? additionalTargets : undefined,
        excluded_targets: excludedTargets.length > 0 ? excludedTargets : undefined,
        speed_profile: cfg.speed_profile,
        scan_type: cfg.scan_type,
        nse_categories: cfg.nse_categories.length > 0 ? cfg.nse_categories : undefined,
        os_detection: cfg.os_detection,
        version_detection: cfg.version_detection,
        allow_post_exploitation: cfg.allow_post_exploitation,
        allow_lateral_movement: cfg.allow_lateral_movement,
        allow_docker_escape: cfg.allow_docker_escape,
        allow_browser_recon: cfg.allow_browser_recon,
        known_tech: knownTech || undefined,
        scope_notes: scopeNotes || undefined,
        notes: cfg.notes || undefined,
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

    closeAdvModal();

    try {
        const res = await fetch('/api/v1/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Start failed');
        }
        const data = await res.json();

        // Replicate session startup logic from startMission()
        activeMissionId = data.session_id;
        viewingSessionId = activeMissionId;
        missionStartTime = Date.now();
        missionPaused = false;

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
