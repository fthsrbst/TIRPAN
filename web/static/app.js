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

// ─── Conversations (localStorage) ────────────────────────────────────────────

let conversations = [];
let activeConvId = null;

function convKey() { return 'aegis_conversations'; }

function loadConversationsFromStorage() {
    try {
        conversations = JSON.parse(localStorage.getItem(convKey()) || '[]');
        activeConvId = localStorage.getItem('aegis_active_conv') || null;
    } catch { conversations = []; activeConvId = null; }
}

function saveConversationsToStorage() {
    localStorage.setItem(convKey(), JSON.stringify(conversations));
    localStorage.setItem('aegis_active_conv', activeConvId || '');
}

function getActiveConv() {
    return conversations.find(c => c.id === activeConvId) || null;
}

function createNewConversation() {
    const id = 'conv_' + Date.now();
    conversations.unshift({ id, title: 'New Chat', createdAt: Date.now(), messages: [] });
    activeConvId = id;
    saveConversationsToStorage();
    renderConversationList();
    resetMessageStream();
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

function loadConversation(convId) {
    activeConvId = convId;
    saveConversationsToStorage();
    renderConversationList();
    const conv = conversations.find(c => c.id === convId);
    const stream = getMessageStream();
    if (!stream) return;
    stream.innerHTML = '';
    if (!conv || !conv.messages.length) { resetMessageStream(); return; }
    conv.messages.forEach(msg => {
        if (msg.role === 'user') appendUserMessageDOM(msg.content);
        else appendAssistantMessageDOM(msg.content);
    });
    autoScroll = true;
    forceScrollToBottom();
}

function renderConversationList() {
    const list = document.getElementById('conversation-list');
    if (!list) return;
    list.innerHTML = '';
    if (!conversations.length) {
        list.innerHTML = '<div class="text-[9px] mono-text text-secondary-text px-2 py-2 opacity-50">No chats yet</div>';
        return;
    }
    conversations.forEach(conv => {
        const btn = document.createElement('button');
        const isActive = conv.id === activeConvId;
        btn.className = [
            'w-full text-left px-2 py-1.5 text-[10px] mono-text truncate transition-colors leading-tight',
            isActive
                ? 'text-primary border-l border-primary bg-primary/5 pl-1.5'
                : 'text-secondary-text hover:text-slate-200 hover:bg-white/5',
        ].join(' ');
        btn.title = conv.title;
        btn.textContent = conv.title;
        btn.addEventListener('click', () => loadConversation(conv.id));
        list.appendChild(btn);
    });
}

function addMessageToConv(role, content) {
    const conv = getActiveConv();
    if (!conv) return;
    conv.messages.push({ role, content });
    // Set title from first user message
    if (role === 'user' && conv.title === 'New Chat') {
        conv.title = content.length > 32 ? content.substring(0, 32) + '…' : content;
        renderConversationList();
    }
    saveConversationsToStorage();
}

function initConversations() {
    loadConversationsFromStorage();
    if (!conversations.length) {
        createNewConversation();
    } else {
        renderConversationList();
        if (activeConvId && conversations.find(c => c.id === activeConvId)) {
            loadConversation(activeConvId);
        } else {
            resetMessageStream();
        }
    }
    const btn = document.getElementById('new-chat-btn');
    if (btn) btn.addEventListener('click', createNewConversation);
}

// ─── WebSocket Chat ───────────────────────────────────────────────────────────

let ws = null;
let wsReady = false;
let currentAssistantEl = null;  // streaming message bubble
let currentAssistantText = '';   // accumulated text for the current stream

function wsConnect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
        wsReady = true;
        setConnectionBadge(true);
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
    el.className = 'flex gap-4 justify-end';
    el.innerHTML = `
        <div class="flex flex-col gap-2 max-w-[80%]">
          <div class="text-[10px] font-bold text-secondary-text uppercase tracking-widest text-right">You</div>
          <div class="bg-card border border-border-color p-4 text-sm leading-relaxed whitespace-pre-wrap" style="color:#d1d5db;font-family:'Inter',sans-serif;">${escapeHtml(text)}</div>
        </div>
        <div class="shrink-0 w-8 h-8 border border-border-color flex items-center justify-center bg-surface">
          <span class="material-symbols-outlined text-secondary-text text-xl">person</span>
        </div>`;
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

function buildAssistantMessageEl(htmlContent) {
    const el = document.createElement('div');
    el.className = 'flex gap-4';
    el.innerHTML = `
        <div class="shrink-0 w-8 h-8 border border-primary flex items-center justify-center bg-surface">
          <span class="material-symbols-outlined text-primary text-xl">psychology</span>
        </div>
        <div class="flex flex-col gap-2 flex-1 min-w-0">
          <div class="text-[10px] font-bold text-secondary-text uppercase tracking-widest">AI Engine • Chat</div>
          <div class="bg-surface border-l-2 border-l-primary border border-border-color p-5">
            <div class="msg-text markdown-content text-sm leading-relaxed text-slate-200">${htmlContent}</div>
          </div>
        </div>`;
    return el;
}

function appendAssistantMessageDOM(markdownText) {
    const stream = getMessageStream();
    if (!stream) return;
    const el = buildAssistantMessageEl(renderMarkdown(markdownText));
    stream.appendChild(el);
    attachCopyButtons(el);
}

function startAssistantMessage() {
    const stream = getMessageStream();
    if (!stream) return null;

    currentAssistantText = '';
    const el = document.createElement('div');
    el.className = 'flex gap-4';
    el.innerHTML = `
        <div class="shrink-0 w-8 h-8 border border-primary flex items-center justify-center bg-surface">
          <span class="material-symbols-outlined text-primary text-xl">psychology</span>
        </div>
        <div class="flex flex-col gap-2 flex-1 min-w-0">
          <div class="text-[10px] font-bold text-secondary-text uppercase tracking-widest">AI Engine • Chat</div>
          <div class="bg-surface border-l-2 border-l-primary border border-border-color p-5">
            <div class="msg-text markdown-content text-sm leading-relaxed"></div>
            <span class="cursor-blink inline-block w-2 h-4 bg-primary ml-0.5 align-middle"></span>
          </div>
        </div>`;
    stream.appendChild(el);
    currentAssistantEl = el;
    scrollToBottom();
    return el;
}

function appendToken(token, msgId) {
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

    // Save to conversation history
    if (currentAssistantText) addMessageToConv('assistant', currentAssistantText);

    currentAssistantEl = null;
    currentAssistantText = '';
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
    addMessageToConv('user', text);
    appendUserMessage(text);
    startAssistantMessage();
    ws.send(JSON.stringify({ type: 'chat', content: text }));
}

function initChatInput() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input) return;

    const doSend = () => {
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        sendChatMessage(text);
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSend();
    });

    if (sendBtn) sendBtn.addEventListener('click', doSend);
}

// ─── Ollama Status & Model Selector ──────────────────────────────────────────

let availableModels = [];
let activeModel = '';
let ollamaBaseUrl = 'http://127.0.0.1:11434';

async function fetchOllamaStatus() {
    try {
        const res = await fetch('/api/v1/ollama/status');
        const data = await res.json();

        const dot = document.getElementById('ollama-dot');
        const label = document.getElementById('ollama-status-text');
        const cfgDot = document.getElementById('cfg-ollama-status-dot');

        if (data.online) {
            availableModels = data.models || [];
            activeModel = data.current || (availableModels[0] ?? '');
            if (!activeModel && availableModels.length) activeModel = availableModels[0];

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

        // Sync config inputs
        const cfgModel = document.getElementById('cfg-ollama-model');
        if (cfgModel && activeModel) cfgModel.value = activeModel;

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
    if (lbl) lbl.textContent = activeModel || '—';
}

function populateModelDropdown() {
    const list = document.getElementById('model-dropdown-list');
    if (!list) return;
    list.innerHTML = '';

    if (!availableModels.length) {
        list.innerHTML = '<div class="px-4 py-2 text-[10px] mono-text text-secondary-text">No models found</div>';
        return;
    }

    availableModels.forEach(model => {
        const item = document.createElement('button');
        item.className = [
            'w-full text-left px-4 py-2 text-[11px] mono-text',
            'hover:bg-primary/10 hover:text-primary transition-colors',
            model === activeModel ? 'text-primary' : 'text-slate-300',
        ].join(' ');
        item.textContent = model;
        if (model === activeModel) {
            item.innerHTML += ' <span class="material-symbols-outlined text-[12px] align-middle ml-1">check</span>';
        }
        item.addEventListener('click', () => selectModel(model));
        list.appendChild(item);
    });
}

function selectModel(model) {
    activeModel = model;
    updateModelLabel();
    populateModelDropdown();
    closeModelDropdown();
    // Persist to backend
    fetch('/api/v1/config/ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: ollamaBaseUrl, model }),
    });
    // Sync config input
    const cfgModel = document.getElementById('cfg-ollama-model');
    if (cfgModel) cfgModel.value = model;
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

// ─── Config Save ─────────────────────────────────────────────────────────────

function initConfigSave() {
    const saveBtn = document.getElementById('save-config-btn');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
        const url = document.getElementById('cfg-ollama-url')?.value?.trim() || ollamaBaseUrl;
        const model = document.getElementById('cfg-ollama-model')?.value?.trim() || activeModel;

        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        try {
            await fetch('/api/v1/config/ollama', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: url, model }),
            });
            activeModel = model;
            updateModelLabel();
            saveBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveBtn.textContent = 'Save Config';
                saveBtn.disabled = false;
            }, 1500);
            // Re-check status with new settings
            await fetchOllamaStatus();
        } catch {
            saveBtn.textContent = 'Error';
            setTimeout(() => {
                saveBtn.textContent = 'Save Config';
                saveBtn.disabled = false;
            }, 1500);
        }
    });
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
    initConfigSave();
    initScrollTracking();
    initConversations();
    wsConnect();
    fetchOllamaStatus();
    setInterval(fetchOllamaStatus, 30000);
});
