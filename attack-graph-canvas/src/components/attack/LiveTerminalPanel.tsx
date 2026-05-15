import { useState, useRef, useEffect, useCallback, type MutableRefObject } from "react";
import { useWebSocket, type WSMessage } from "@/hooks/useWebSocket";
import {
  Square,
  Plus,
  Columns2,
  Rows2,
  Maximize2,
  Copy,
  Eraser,
  X,
  MonitorPlay,
} from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { terminalStore } from "@/lib/terminalStore";

const MAX_TERMS = 8;

export interface LiveTerminalPanelProps {
  missionSessionId?: string | null;
  autoOpen?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** false iken panel gizli olsa da mount kalır (Timeline'da popup kapatılınca state sıfırlanmasın). */
  panelVisible?: boolean;
}

type SessionRow = {
  localId: string;
  backendId: string | null;
  title: string;
};

type SplitState = { mode: "v" | "h"; a: string; b: string };

function xtermOptions(compact: boolean) {
  return {
    cursorBlink: true,
    fontSize: compact ? 11 : 12,
    lineHeight: 1.2,
    fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
    scrollback: 5000,
    theme: {
      background: "#0a0a0a",
      foreground: "#e4e4e7",
      cursor: "#a3e635",
      cursorAccent: "#0a0a0a",
      selectionForeground: "#fafafa",
      selectionBackground: "#3f3f46aa",
      black: "#0a0a0a",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#e879f9",
      cyan: "#22d3ee",
      white: "#e4e4e7",
      brightBlack: "#71717a",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde047",
      brightBlue: "#93c5fd",
      brightMagenta: "#f0abfc",
      brightCyan: "#67e8f9",
      brightWhite: "#fafafa",
    },
  } as const;
}

/** Compute initial state — load from global store if available, else create fresh. */
function computeInitState() {
  const saved = terminalStore.load();
  if (saved?.sessions?.length) {
    return {
      sessions: saved.sessions.map(s => ({
        localId: s.localId,
        backendId: null as string | null,
        title: s.title,
      })),
      activeLocalId: saved.activeLocalId,
      split: saved.split as SplitState | null,
      restoredIds: new Set(saved.sessions.map(s => s.localId)),
    };
  }
  const id = crypto.randomUUID();
  return {
    sessions: [{ localId: id, backendId: null as string | null, title: "TTY 1" }],
    activeLocalId: id,
    split: null as SplitState | null,
    restoredIds: new Set<string>(),
  };
}

export const LiveTerminalPanel = ({
  autoOpen = false,
  disabled = false,
  compact = false,
  panelVisible = true,
}: LiveTerminalPanelProps) => {
  // Stable init — only computed once per component lifetime
  const initRef = useRef<ReturnType<typeof computeInitState> | null>(null);
  if (!initRef.current) initRef.current = computeInitState();
  const init = initRef.current;

  const [sessions, setSessions] = useState<SessionRow[]>(init.sessions);
  const [activeLocalId, setActiveLocalId] = useState(init.activeLocalId);
  const [split, setSplit] = useState<SplitState | null>(init.split);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const focusedLocalIdRef     = useRef(init.activeLocalId);
  const activeLocalIdRef      = useRef(activeLocalId);
  activeLocalIdRef.current    = activeLocalId;
  const sessionsRef           = useRef(sessions);
  sessionsRef.current         = sessions;
  const splitRef              = useRef(split);
  splitRef.current            = split;

  const autoOpenSentRef       = useRef(false);
  /** IDs that need a shell opened as soon as their XTermPane registers. */
  const pendingAutoOpenRef    = useRef<Set<string>>(new Set(init.restoredIds));
  const backendToLocalRef     = useRef<Map<string, string>>(new Map());
  const termsRef              = useRef<Map<string, { term: Terminal; fit: FitAddon }>>(new Map());
  const sessionBackendRef     = useRef<Map<string, string | null>>(new Map());
  const resizeTimerRef        = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingOutputRef      = useRef<Map<string, string[]>>(new Map());
  const sendRef               = useRef<(msg: WSMessage) => void>(() => {});

  useEffect(() => {
    sessions.forEach(s => sessionBackendRef.current.set(s.localId, s.backendId));
  }, [sessions]);

  const syncBackendForLocal = useCallback((localId: string, backendId: string | null) => {
    const prevBid = sessionBackendRef.current.get(localId);
    if (prevBid && prevBid !== backendId) {
      backendToLocalRef.current.delete(prevBid);
    }
    sessionBackendRef.current.set(localId, backendId);
    setSessions(prev => prev.map(s => s.localId === localId ? { ...s, backendId } : s));
    if (backendId) {
      backendToLocalRef.current.set(backendId, localId);
    }
  }, []);

  const detachBackend = useCallback((backendId: string) => {
    const localId = backendToLocalRef.current.get(backendId);
    if (localId) {
      backendToLocalRef.current.delete(backendId);
      syncBackendForLocal(localId, null);
    }
  }, [syncBackendForLocal]);

  const pushFitResize = useCallback((localId: string) => {
    const entry = termsRef.current.get(localId);
    const bid   = sessionBackendRef.current.get(localId);
    if (!entry || !bid) return;
    const { term, fit } = entry;
    try {
      fit.fit();
      sendRef.current({ type: "terminal_resize", terminal_id: bid, rows: term.rows, cols: term.cols });
    } catch { /* ignore */ }
  }, []);

  const onWsMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "terminal_opened": {
        const handle = String(msg.client_handle || "");
        const tid    = String(msg.terminal_id   || "");
        if (handle) {
          backendToLocalRef.current.set(tid, handle);
          syncBackendForLocal(handle, tid);
          const te = termsRef.current.get(handle);
          if (te) { te.term.reset(); requestAnimationFrame(() => pushFitResize(handle)); }
        } else if (tid) {
          const pending = sessionsRef.current.find(s => !s.backendId);
          if (pending) {
            backendToLocalRef.current.set(tid, pending.localId);
            syncBackendForLocal(pending.localId, tid);
            const te = termsRef.current.get(pending.localId);
            if (te) { te.term.reset(); requestAnimationFrame(() => pushFitResize(pending.localId)); }
          }
        }
        break;
      }
      case "terminal_output": {
        const bid     = String(msg.terminal_id || "");
        const localId = backendToLocalRef.current.get(bid);
        if (!localId) return;
        const data = typeof msg.data === "string" ? msg.data : "";
        const te   = termsRef.current.get(localId);
        if (te) {
          te.term.write(data);
        } else {
          const q = pendingOutputRef.current.get(localId) ?? [];
          q.push(data);
          pendingOutputRef.current.set(localId, q);
        }
        break;
      }
      case "terminal_exit": {
        const bid     = String(msg.terminal_id || "");
        const localId = backendToLocalRef.current.get(bid);
        if (!localId) break;
        termsRef.current.get(localId)?.term.write("\r\n\x1b[33m[Process exited]\x1b[0m\r\n");
        backendToLocalRef.current.delete(bid);
        syncBackendForLocal(localId, null);
        break;
      }
      case "terminal_error": {
        const m = String(msg.message ?? "Unknown error");
        const h = String(msg.client_handle || "");
        if (h && termsRef.current.has(h)) {
          termsRef.current.get(h)!.term.write(`\r\n\x1b[31m[Error: ${m}]\x1b[0m\r\n`);
          break;
        }
        const bid    = String(msg.terminal_id || "");
        const lid    = bid ? backendToLocalRef.current.get(bid) : undefined;
        const target = lid || activeLocalIdRef.current;
        termsRef.current.get(target)?.term.write(`\r\n\x1b[31m[Error: ${m}]\x1b[0m\r\n`);
        break;
      }
      case "terminal_closed": {
        const bid = String(msg.terminal_id || "");
        if (bid) detachBackend(bid);
        break;
      }
      default: break;
    }
  }, [detachBackend, pushFitResize, syncBackendForLocal]);

  const { ready, send } = useWebSocket(undefined, { onMessage: onWsMessage });
  sendRef.current = send;

  const terminalSessionId = "operator-local";

  const openShellFor = useCallback((localId: string) => {
    if (!ready || disabled) return;
    const { term, fit } = termsRef.current.get(localId) || {};
    let rows = compact ? 22 : 28;
    let cols = compact ? 90 : 110;
    if (term && fit) {
      try { fit.fit(); rows = term.rows; cols = term.cols; } catch { /* defaults */ }
    }
    send({ type: "terminal_open", session_id: terminalSessionId, shell: "bash", rows, cols, client_handle: localId });
  }, [ready, disabled, compact, send]);

  const closeBackendFor = useCallback((localId: string) => {
    const bid = sessionBackendRef.current.get(localId);
    if (bid && ready) send({ type: "terminal_close", terminal_id: bid });
    backendToLocalRef.current.forEach((v, k) => {
      if (v === localId) backendToLocalRef.current.delete(k);
    });
    syncBackendForLocal(localId, null);
    termsRef.current.get(localId)?.term.clear();
  }, [ready, send, syncBackendForLocal]);

  // Auto-open: open shells for ALL pending sessions once WS is ready
  useEffect(() => {
    if (!autoOpen || disabled) return;
    if (!ready || autoOpenSentRef.current) return;
    autoOpenSentRef.current = true;
    // Try those already mounted; the rest will auto-open when XTermPane registers
    sessionsRef.current.forEach(s => {
      if (!s.backendId) {
        if (termsRef.current.has(s.localId)) {
          pendingAutoOpenRef.current.delete(s.localId);
          openShellFor(s.localId);
        } else {
          pendingAutoOpenRef.current.add(s.localId);
        }
      }
    });
  }, [autoOpen, disabled, ready, openShellFor]);

  useEffect(() => {
    if (!split) return;
    const ok = (id: string) => sessions.some(s => s.localId === id);
    if (!ok(split.a) || !ok(split.b)) setSplit(null);
  }, [sessions, split]);

  const scheduleFit = useCallback((localId: string) => {
    const prev = resizeTimerRef.current.get(localId);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      resizeTimerRef.current.delete(localId);
      pushFitResize(localId);
    }, 100);
    resizeTimerRef.current.set(localId, t);
  }, [pushFitResize]);

  const flushPendingFor = useCallback((localId: string) => {
    const te = termsRef.current.get(localId);
    const q  = pendingOutputRef.current.get(localId);
    if (!te || !q?.length) return;
    for (const c of q) te.term.write(c);
    pendingOutputRef.current.delete(localId);
  }, []);

  const registerTerminal = useCallback((localId: string, term: Terminal, fit: FitAddon) => {
    termsRef.current.set(localId, { term, fit });
    term.onData(data => {
      const bid = sessionBackendRef.current.get(localId);
      if (bid) sendRef.current({ type: "terminal_input", terminal_id: bid, data });
    });
    flushPendingFor(localId);
    // Auto-open shell if this tab was just created or restored
    if (pendingAutoOpenRef.current.has(localId)) {
      pendingAutoOpenRef.current.delete(localId);
      setTimeout(() => openShellFor(localId), 60);
    }
  }, [flushPendingFor, openShellFor]);

  const unregisterTerminal = useCallback((localId: string) => {
    termsRef.current.delete(localId);
    const t = resizeTimerRef.current.get(localId);
    if (t) clearTimeout(t);
    resizeTimerRef.current.delete(localId);
  }, []);

  const addTab = useCallback(() => {
    if (sessions.length >= MAX_TERMS) return;
    const id = crypto.randomUUID();
    pendingAutoOpenRef.current.add(id);
    setSessions(prev => [...prev, { localId: id, backendId: null, title: `TTY ${prev.length + 1}` }]);
    setActiveLocalId(id);
  }, [sessions.length]);

  const removeTab = useCallback((localId: string) => {
    if (sessions.length <= 1) return;
    closeBackendFor(localId);
    setSessions(prev => {
      const next = prev.filter(s => s.localId !== localId);
      if (!next.find(s => s.localId === activeLocalIdRef.current)) {
        setActiveLocalId(next[0]?.localId ?? init.sessions[0].localId);
      }
      return next;
    });
    setSplit(sp => {
      if (!sp) return sp;
      if (sp.a === localId || sp.b === localId) return null;
      return sp;
    });
  }, [sessions.length, closeBackendFor, init.sessions]);

  const renameTab = useCallback((localId: string, title: string) => {
    const trimmed = title.trim();
    if (trimmed) setSessions(prev => prev.map(s => s.localId === localId ? { ...s, title: trimmed } : s));
    setEditingTabId(null);
  }, []);

  const beginSplit = useCallback((mode: "v" | "h") => {
    const left = activeLocalId;
    let right = sessions.find(s => s.localId !== left)?.localId;
    if (!right) {
      if (sessions.length >= MAX_TERMS) return;
      const id = crypto.randomUUID();
      pendingAutoOpenRef.current.add(id);
      setSessions(prev => [...prev, { localId: id, backendId: null, title: `TTY ${prev.length + 1}` }]);
      right = id;
    }
    // Also open left pane if it has no backend yet
    const leftSess = sessions.find(s => s.localId === left);
    if (leftSess && !leftSess.backendId) pendingAutoOpenRef.current.add(left);
    setSplit({ mode, a: left, b: right! });
  }, [activeLocalId, sessions]);

  const copySelection = useCallback(() => {
    const term = termsRef.current.get(focusedLocalIdRef.current)?.term;
    if (!term) return;
    const t = term.getSelection() || "";
    if (t) void navigator.clipboard.writeText(t);
  }, []);

  const clearActiveBuffer = useCallback(() => {
    termsRef.current.get(focusedLocalIdRef.current)?.term.clear();
  }, []);

  // Save state & close PTYs on unmount
  useEffect(() => {
    return () => {
      resizeTimerRef.current.forEach(t => clearTimeout(t));
      terminalStore.save({
        sessions:      sessionsRef.current,
        activeLocalId: activeLocalIdRef.current,
        split:         splitRef.current,
      });
      sessionsRef.current.forEach(s => {
        if (s.backendId) sendRef.current({ type: "terminal_close", terminal_id: s.backendId });
      });
    };
  }, []);

  const activeConnected = sessions.find(s => s.localId === activeLocalId)?.backendId;

  useEffect(() => {
    requestAnimationFrame(() => {
      scheduleFit(activeLocalId);
      if (split) { scheduleFit(split.a); scheduleFit(split.b); }
    });
  }, [activeLocalId, split, scheduleFit]);

  useEffect(() => {
    if (!panelVisible) return;
    requestAnimationFrame(() => {
      sessionsRef.current.forEach(s => scheduleFit(s.localId));
      if (split) { scheduleFit(split.a); scheduleFit(split.b); }
    });
  }, [panelVisible, split, scheduleFit]);

  const toolbarBtn = "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono border border-border/60 bg-card/80 hover:bg-muted text-foreground disabled:opacity-40 disabled:pointer-events-none shrink-0";

  if (disabled) {
    return (
      <div className={`text-[11px] font-mono text-muted-foreground space-y-2 ${compact ? "py-1" : ""}`}>
        <p>Live shell is not available in demo mode or for this account role.</p>
        <p className="text-accent/80">Use an analyst session or exit demo mode.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full min-h-0 ${compact ? "gap-2" : "gap-3"}`}>
      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className={`flex flex-col gap-2 shrink-0 ${compact ? "" : "node-card !p-3"}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {activeConnected ? (
            <button type="button" onClick={() => closeBackendFor(activeLocalId)} className={toolbarBtn} title="Close shell (active tab)">
              <Square className="w-3 h-3 shrink-0" /> Close shell
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openShellFor(activeLocalId)}
              disabled={!ready}
              className={`${toolbarBtn} bg-primary text-primary-foreground border-primary hover:opacity-90`}
              title="Open PTY on active tab"
            >
              <MonitorPlay className="w-3 h-3 shrink-0" /> Open shell
            </button>
          )}

          <span className="w-px h-4 bg-border shrink-0 mx-0.5" aria-hidden />

          <button type="button" onClick={addTab} disabled={sessions.length >= MAX_TERMS} className={toolbarBtn} title="New tab">
            <Plus className="w-3 h-3 shrink-0" /> Tab
          </button>
          <button type="button" onClick={() => beginSplit("v")} className={toolbarBtn} title="Split: two columns">
            <Columns2 className="w-3 h-3 shrink-0" /> Split ↔
          </button>
          <button type="button" onClick={() => beginSplit("h")} className={toolbarBtn} title="Split: stacked rows">
            <Rows2 className="w-3 h-3 shrink-0" /> Split ↕
          </button>
          <button type="button" onClick={() => setSplit(null)} disabled={!split} className={toolbarBtn} title="Single pane">
            <Maximize2 className="w-3 h-3 shrink-0" /> Single
          </button>

          <span className="w-px h-4 bg-border shrink-0 mx-0.5" aria-hidden />

          <button type="button" onClick={copySelection} className={toolbarBtn} title="Copy selection">
            <Copy className="w-3 h-3 shrink-0" /> Copy
          </button>
          <button type="button" onClick={clearActiveBuffer} className={toolbarBtn} title="Clear buffer">
            <Eraser className="w-3 h-3 shrink-0" /> Clear
          </button>

          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${ready ? "bg-accent" : "bg-destructive"}`} />
            <span className="truncate max-w-[140px]">{ready ? `WS · ${sessions.length}/${MAX_TERMS}` : "Connecting…"}</span>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────── */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar pb-0.5 border-b border-border/40">
          {sessions.map(s => {
            const on     = !!s.backendId;
            const active = s.localId === activeLocalId;
            const editing = editingTabId === s.localId;
            return (
              <div
                key={s.localId}
                className={`group flex items-center gap-0.5 shrink-0 rounded-t-md border border-b-0 px-2 py-1 text-[10px] font-mono cursor-pointer ${
                  active ? "bg-card border-border text-foreground" : "bg-transparent border-transparent text-muted-foreground hover:bg-card/50"
                }`}
              >
                <button
                  type="button"
                  className="flex items-center gap-1 min-w-0"
                  onClick={() => { setActiveLocalId(s.localId); focusedLocalIdRef.current = s.localId; }}
                  title={s.title}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${on ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  {editing ? (
                    <input
                      autoFocus
                      className="bg-transparent outline-none text-[10px] font-mono w-16 border-b border-primary"
                      value={editingTitle}
                      onChange={e => setEditingTitle(e.target.value)}
                      onBlur={() => renameTab(s.localId, editingTitle)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); renameTab(s.localId, editingTitle); }
                        if (e.key === "Escape") setEditingTabId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="truncate max-w-[80px]"
                      onDoubleClick={e => {
                        e.stopPropagation();
                        setEditingTabId(s.localId);
                        setEditingTitle(s.title);
                      }}
                      title="Double-click to rename"
                    >
                      {s.title}
                    </span>
                  )}
                </button>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100 p-0.5 rounded"
                    onClick={e => { e.stopPropagation(); removeTab(s.localId); }}
                    title="Close tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Terminal area ─────────────────────────────────── */}
      <div
        className="flex-1 min-h-0 rounded-2xl border border-border/50 overflow-hidden bg-[#0a0a0a] flex flex-col"
        style={{ minHeight: compact ? 160 : 240 }}
      >
        {/* macOS-style traffic lights */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 shrink-0 bg-[#0f0f0f]">
          <span className="w-2 h-2 rounded-full bg-red-500/90" />
          <span className="w-2 h-2 rounded-full bg-amber-400/90" />
          <span className="w-2 h-2 rounded-full bg-emerald-500/90" />
          <span className="ml-2 text-[10px] font-mono text-zinc-500 truncate">
            {split ? "Split view" : "Single"} · bash / xterm
          </span>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {/* Single pane */}
          {!split && (
            <div className="flex-1 min-h-0 relative">
              {sessions.map(s => (
                <div
                  key={s.localId}
                  className={
                    activeLocalId === s.localId
                      ? "absolute inset-0 z-10 flex flex-col min-h-0"
                      : "absolute inset-0 z-0 flex flex-col min-h-0 opacity-0 pointer-events-none select-none"
                  }
                >
                  <XTermPane
                    localId={s.localId}
                    compact={compact}
                    focusRef={focusedLocalIdRef}
                    registerTerminal={registerTerminal}
                    unregisterTerminal={unregisterTerminal}
                    scheduleFit={scheduleFit}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Split pane */}
          {split && (
            <div className={`flex-1 min-h-0 flex gap-1 p-1 ${split.mode === "v" ? "flex-row" : "flex-col"}`}>
              {[split.a, split.b].map(lid => (
                <div
                  key={lid}
                  className={`min-h-0 border border-white/5 rounded-lg overflow-hidden bg-black/40 ${
                    split.mode === "v" ? "flex-1 w-1/2" : "flex-1 h-1/2"
                  }`}
                  onMouseDown={() => { focusedLocalIdRef.current = lid; setActiveLocalId(lid); }}
                >
                  <XTermPane
                    localId={lid}
                    compact={compact}
                    focusRef={focusedLocalIdRef}
                    registerTerminal={registerTerminal}
                    unregisterTerminal={unregisterTerminal}
                    scheduleFit={scheduleFit}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .xterm-viewport-host .xterm { padding: 6px 8px; height: 100%; }
        .xterm-viewport-host .xterm-viewport { overflow-y: auto !important; }
      `}</style>
    </div>
  );
};

function XTermPane({
  localId,
  compact,
  focusRef,
  registerTerminal,
  unregisterTerminal,
  scheduleFit,
}: {
  localId: string;
  compact: boolean;
  focusRef: MutableRefObject<string>;
  registerTerminal: (id: string, t: Terminal, f: FitAddon) => void;
  unregisterTerminal: (id: string) => void;
  scheduleFit: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({ ...xtermOptions(compact) });
    const fit  = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    registerTerminal(localId, term, fit);

    const el = containerRef.current;
    const ro = new ResizeObserver(() => scheduleFit(localId));
    ro.observe(el);

    return () => {
      ro.disconnect();
      unregisterTerminal(localId);
      term.dispose();
    };
  }, [localId, compact, registerTerminal, unregisterTerminal, scheduleFit]);

  return (
    <div
      className="flex-1 min-h-0 w-full xterm-viewport-host flex flex-col"
      onMouseDown={() => { focusRef.current = localId; }}
    >
      <div ref={containerRef} className="flex-1 min-h-0 w-full" />
    </div>
  );
}
