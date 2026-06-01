import { useState, useRef, useEffect, useCallback } from "react";
import { useWebSocket, type WSMessage } from "@/hooks/useWebSocket";
import { ModelSelector } from "@/components/attack/TopTabs";
import { isDemoMode } from "@/lib/demoMode";
import { toast } from "sonner";
import {
  MessageSquare, Send, Bot, User, Square, Plus, Wrench, CheckCircle,
  XCircle, Shield, Clock, Copy, Check, X, ChevronDown, Cpu, AlertTriangle,
  History, ChevronLeft,
} from "lucide-react";

// ── Chat item model ────────────────────────────────────────────────────────────
type StatusKind = "thinking" | "tool_call" | "tool_ok" | "tool_fail" | "blocked" | "timeout" | "info";

interface UserItem      { kind: "user";      id: string; text: string; ts: number; }
interface AssistantItem { kind: "assistant"; id: string; text: string; ts: number; }
interface StatusItem    { kind: "status";    id: string; text: string; ts: number; status: StatusKind; }
interface ErrorItem     { kind: "error";     id: string; text: string; ts: number; }
interface ApprovalItem  {
  kind: "approval"; id: string; approvalId: string; tool: string;
  params: Record<string, unknown>; ts: number; resolved?: "approved" | "denied";
}
type ChatItem = UserItem | AssistantItem | StatusItem | ErrorItem | ApprovalItem;

// ── Saved conversation ─────────────────────────────────────────────────────────
interface SavedConvo { id: string; title: string; items: ChatItem[]; startedAt: number; }

const HISTORY_KEY = "tirpan_chat_sessions";
const CURRENT_KEY = "tirpan_chat_current";
const MAX_STORED  = 30;

function loadHistory(): SavedConvo[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(list: SavedConvo[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_STORED))); } catch {}
}
function loadCurrent(): SavedConvo | null {
  try { return JSON.parse(localStorage.getItem(CURRENT_KEY) || "null"); } catch { return null; }
}
function saveCurrent(c: SavedConvo | null) {
  try { localStorage.setItem(CURRENT_KEY, JSON.stringify(c)); } catch {}
}

let _seq = 0;
const uid = () => `c${Date.now().toString(36)}_${(_seq++).toString(36)}`;
const newConvoId = () => `cv${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function deriveTitleFromItems(items: ChatItem[]): string {
  const first = items.find((it) => it.kind === "user");
  if (!first) return "Untitled";
  const text = (first as UserItem).text;
  return text.length > 40 ? text.slice(0, 38) + "…" : text;
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function fmtDate(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Today ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function classifyStatus(text: string): StatusKind {
  const t = text.trimStart();
  if (t.startsWith("💭")) return "thinking";
  if (t.startsWith("⚙")) return "tool_call";
  if (t.startsWith("✓")) return "tool_ok";
  if (t.startsWith("✗")) return "tool_fail";
  if (t.startsWith("⛔")) return "blocked";
  if (t.startsWith("⏱")) return "timeout";
  return "info";
}

const STATUS_META: Record<StatusKind, { Icon: typeof Bot; cls: string; chip: string; label: string }> = {
  thinking:  { Icon: Bot,           cls: "bg-accent/5 border-accent/15",            chip: "text-accent",         label: "Thinking" },
  tool_call: { Icon: Wrench,        cls: "bg-warning/5 border-warning/20",          chip: "text-warning",        label: "Tool" },
  tool_ok:   { Icon: CheckCircle,   cls: "bg-success/5 border-success/20",          chip: "text-success",        label: "Result" },
  tool_fail: { Icon: XCircle,       cls: "bg-destructive/5 border-destructive/20",  chip: "text-destructive",    label: "Failed" },
  blocked:   { Icon: Shield,        cls: "bg-purple-500/5 border-purple-500/20",    chip: "text-purple-400",     label: "Blocked" },
  timeout:   { Icon: Clock,         cls: "bg-muted/40 border-border/40",            chip: "text-muted-foreground", label: "Timeout" },
  info:      { Icon: Cpu,           cls: "bg-muted/30 border-border/30",            chip: "text-muted-foreground", label: "Info" },
};

// ── Lightweight markdown renderer ──────────────────────────────────────────────
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`") && p.length > 2)
      return <code key={i} className="bg-black/40 px-1 py-0.5 rounded text-[10px] font-mono text-primary/90 break-all">{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4)
      return <strong key={i} className="font-bold text-foreground">{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
      return <em key={i} className="italic">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

function MarkdownMsg({ text }: { text: string }) {
  const segments = text.split(/(```[\w]*\n[\s\S]*?```|```[\w]*\n?[\s\S]*?```)/);
  return (
    <div className="space-y-1 text-[12px] leading-relaxed text-foreground/90 break-words">
      {segments.map((seg, si) => {
        const cbMatch = seg.match(/^```([\w]*)\n?([\s\S]*)```$/);
        if (cbMatch) {
          return (
            <pre key={si} className="bg-black/50 rounded-lg p-3 overflow-x-auto text-[11px] font-mono text-green-400/90 my-2 border border-white/5 whitespace-pre-wrap">
              <code>{cbMatch[2].replace(/\n$/, "")}</code>
            </pre>
          );
        }
        const lines = seg.split("\n");
        return (
          <div key={si}>
            {lines.map((line, li) => {
              const h3 = line.match(/^###\s(.+)/);
              if (h3) return <p key={li} className="text-xs font-bold text-foreground mt-2 mb-0.5">{h3[1]}</p>;
              const h2 = line.match(/^##\s(.+)/);
              if (h2) return <p key={li} className="text-sm font-bold text-foreground mt-2 mb-1">{h2[1]}</p>;
              const h1 = line.match(/^#\s(.+)/);
              if (h1) return <p key={li} className="text-base font-bold text-foreground mt-2 mb-1">{h1[1]}</p>;
              const ul = line.match(/^[-*]\s(.+)/);
              if (ul) return <div key={li} className="flex gap-1.5 items-start ml-1"><span className="text-primary shrink-0 mt-0.5 text-[10px]">•</span><span>{renderInline(ul[1])}</span></div>;
              const ol = line.match(/^(\d+)\.\s(.+)/);
              if (ol) return <div key={li} className="flex gap-1.5 items-start ml-1"><span className="text-primary font-mono text-[10px] shrink-0 mt-0.5">{ol[1]}.</span><span>{renderInline(ol[2])}</span></div>;
              if (line === "") return <div key={li} className="h-1.5" />;
              return <div key={li}>{renderInline(line)}</div>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Copy button ─────────────────────────────────────────────────────────────────
function CopyBtn({ text, title = "Copy" }: { text: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
    >
      {done ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Status bubble ────────────────────────────────────────────────────────────────
function StatusBubble({ item }: { item: StatusItem }) {
  const meta = STATUS_META[item.status];
  const [open, setOpen] = useState(false);
  const clean = item.text.replace(/^[💭⚙✓✗⛔⏱]️?\s*/u, "");
  const long = clean.length > 160;
  return (
    <div className="flex gap-2">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${meta.cls}`}>
        <meta.Icon className={`w-3 h-3 ${meta.chip}`} />
      </div>
      <div className={`flex-1 min-w-0 rounded-xl rounded-tl-sm border px-2.5 py-1.5 ${meta.cls}`}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-wide ${meta.chip}`}>{meta.label}</span>
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtClock(item.ts)}</span>
          <CopyBtn text={clean} />
        </div>
        <p className={`text-[11px] font-mono text-foreground/75 leading-relaxed break-words ${!open && long ? "line-clamp-3" : ""}`}>
          {clean}
        </p>
        {long && (
          <button onClick={() => setOpen((v) => !v)} className={`text-[10px] mt-0.5 hover:underline ${meta.chip}`}>
            {open ? "Show less" : "Show more"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Approval bubble ──────────────────────────────────────────────────────────────
function ApprovalBubble({ item, onRespond }: { item: ApprovalItem; onRespond: (id: string, approved: boolean) => void }) {
  const paramStr = (() => {
    try { return JSON.stringify(item.params, null, 2); } catch { return String(item.params); }
  })();
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-warning/10 border border-warning/30">
        <Shield className="w-3 h-3 text-warning" />
      </div>
      <div className="flex-1 min-w-0 rounded-xl rounded-tl-sm border border-warning/30 bg-warning/5 px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-warning">Approval required</span>
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtClock(item.ts)}</span>
        </div>
        <p className="text-[11px] text-foreground/85 mb-1">
          Run tool <span className="font-mono font-bold text-warning">{item.tool}</span>?
        </p>
        {paramStr && paramStr !== "{}" && (
          <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-muted/40 rounded-lg p-2 max-h-32 overflow-y-auto mb-2">
            {paramStr}
          </pre>
        )}
        {item.resolved ? (
          <div className={`text-[10px] font-bold inline-flex items-center gap-1 ${item.resolved === "approved" ? "text-success" : "text-destructive"}`}>
            {item.resolved === "approved" ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {item.resolved === "approved" ? "Approved" : "Denied"}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRespond(item.approvalId, true)}
              className="flex-1 h-7 rounded-lg bg-success/15 text-success text-[11px] font-bold hover:bg-success/25 transition-colors inline-flex items-center justify-center gap-1"
            >
              <Check className="w-3 h-3" /> Approve
            </button>
            <button
              onClick={() => onRespond(item.approvalId, false)}
              className="flex-1 h-7 rounded-lg bg-destructive/15 text-destructive text-[11px] font-bold hover:bg-destructive/25 transition-colors inline-flex items-center justify-center gap-1"
            >
              <X className="w-3 h-3" /> Deny
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History panel ────────────────────────────────────────────────────────────────
function HistoryPanel({
  history,
  currentId,
  onSelect,
  onClose,
}: {
  history: SavedConvo[];
  currentId: string;
  onSelect: (c: SavedConvo) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-card rounded-2xl border border-border/50 shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 shrink-0">
        <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Chat history</span>
        <span className="ml-auto text-[9px] text-muted-foreground">{history.length} conversations</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 gap-2 text-muted-foreground">
            <History className="w-8 h-8 opacity-20" />
            <div className="text-xs">No history yet</div>
          </div>
        ) : (
          history.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/50 transition-colors ${c.id === currentId ? "bg-primary/8" : ""}`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${c.id === currentId ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[11px] font-medium truncate ${c.id === currentId ? "text-primary" : "text-foreground"}`}>{c.title}</div>
                  <div className="text-[9px] text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
                    <span>{fmtDate(c.startedAt)}</span>
                    <span>·</span>
                    <span>{c.items.length} msgs</span>
                  </div>
                </div>
                {c.id === currentId && <span className="text-[8px] text-primary font-bold uppercase shrink-0 mt-0.5">active</span>}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────────
interface Props {
  className?: string;
  onClose?: () => void;
}

export const TirpanChat = ({ className = "", onClose }: Props) => {
  const demo = isDemoMode();

  // ── Conversation state ─────────────────────────────────────
  const [convoId, setConvoId] = useState<string>(() => {
    const cur = loadCurrent();
    return cur?.id ?? newConvoId();
  });
  const [items, setItems] = useState<ChatItem[]>(() => {
    const cur = loadCurrent();
    return cur?.items ?? [];
  });
  const [historyPanel, setHistoryPanel] = useState(false);
  const [viewingConvo, setViewingConvo] = useState<SavedConvo | null>(null); // null = current live

  // ── Stream state ────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [provider, setProvider] = useState("ollama");
  const [model, setModel] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  const streamingRef = useRef("");
  const isStreamingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const convoIdRef = useRef(convoId);
  convoIdRef.current = convoId;

  // ── Persist current conversation to localStorage ─────────────
  useEffect(() => {
    const cur: SavedConvo = {
      id: convoId,
      title: deriveTitleFromItems(items),
      items,
      startedAt: items.length > 0 ? items[0].ts : Date.now(),
    };
    saveCurrent(cur);

    if (items.length > 0) {
      const history = loadHistory();
      const idx = history.findIndex((c) => c.id === convoId);
      if (idx >= 0) history[idx] = cur;
      else history.unshift(cur);
      saveHistory(history);
    }
  }, [items, convoId]);

  const push = useCallback((item: ChatItem) => {
    if (viewingConvo) return; // read-only view — don't push
    setItems((prev) => [...prev, item]);
  }, [viewingConvo]);

  const handleMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "token": {
        if (!isStreamingRef.current) {
          isStreamingRef.current = true;
          setIsStreaming(true);
        }
        streamingRef.current += msg.content || "";
        setStreaming(streamingRef.current);
        break;
      }
      case "status": {
        const text = msg.content || "";
        if (text.trim()) push({ kind: "status", id: uid(), text, ts: Date.now(), status: classifyStatus(text) });
        break;
      }
      case "approval_request": {
        push({
          kind: "approval", id: uid(), approvalId: String(msg.approval_id || ""),
          tool: String(msg.tool || "tool"), params: (msg.params as Record<string, unknown>) || {}, ts: Date.now(),
        });
        break;
      }
      case "message_end": {
        const finalText = streamingRef.current.trim();
        streamingRef.current = "";
        isStreamingRef.current = false;
        setStreaming("");
        setIsStreaming(false);
        if (finalText) push({ kind: "assistant", id: uid(), text: finalText, ts: Date.now() });
        break;
      }
      case "error": {
        streamingRef.current = "";
        isStreamingRef.current = false;
        setStreaming("");
        setIsStreaming(false);
        push({ kind: "error", id: uid(), text: msg.content || "Unknown error", ts: Date.now() });
        break;
      }
      case "conversation_reset":
        setItems([]);
        break;
      default:
        break;
    }
  }, [push]);

  const { ready, send } = useWebSocket(undefined, { onMessage: handleMessage });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, streaming, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  const respondApproval = useCallback((approvalId: string, approved: boolean) => {
    send({ type: "approval_response", approval_id: approvalId, approved });
    setItems((prev) => prev.map((it) =>
      it.kind === "approval" && it.approvalId === approvalId
        ? { ...it, resolved: approved ? "approved" : "denied" }
        : it,
    ));
  }, [send]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !ready || isStreamingRef.current) return;
    if (viewingConvo) { setViewingConvo(null); return; } // exit read-only
    push({ kind: "user", id: uid(), text, ts: Date.now() });
    isStreamingRef.current = true;
    setIsStreaming(true);
    streamingRef.current = "";
    setStreaming("");
    setAutoScroll(true);
    send({ type: "chat", content: text, provider, ...(model ? { model } : {}) });
    setInput("");
  };

  const handleAbort = () => {
    send({ type: "abort" });
    streamingRef.current = "";
    isStreamingRef.current = false;
    setStreaming("");
    setIsStreaming(false);
  };

  const startNewConvo = () => {
    if (isStreamingRef.current) handleAbort();
    send({ type: "new_conversation" });
    const id = newConvoId();
    setConvoId(id);
    setItems([]);
    setViewingConvo(null);
    setHistoryPanel(false);
    toast.success("New conversation started");
  };

  const selectHistoryConvo = (c: SavedConvo) => {
    setViewingConvo(c.id === convoId ? null : c);
    setHistoryPanel(false);
  };

  const displayItems = viewingConvo ? viewingConvo.items : items;
  const isReadOnly = !!viewingConvo;

  return (
    <div className={`relative flex flex-col h-full min-h-0 gap-2 ${className}`}>
      {/* History overlay */}
      {historyPanel && (
        <HistoryPanel
          history={loadHistory()}
          currentId={convoId}
          onSelect={selectHistoryConvo}
          onClose={() => setHistoryPanel(false)}
        />
      )}

      {/* Header */}
      <div className="node-card !p-3 flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-display font-bold tracking-tight flex items-center gap-1.5">
            {viewingConvo ? "Chat history" : "TIRPAN Chat"}
            {!viewingConvo && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ready ? "bg-success animate-pulse" : "bg-destructive"}`} title={ready ? "Connected" : "Disconnected"} />}
          </div>
          <div className="text-[9px] text-muted-foreground truncate">
            {viewingConvo ? viewingConvo.title : "Direct ops chat · runs tools on approval"}
          </div>
        </div>
        {!viewingConvo && <ModelSelector onModelChange={(p, m) => { setProvider(p); setModel(m); }} />}
        <button
          onClick={() => { setHistoryPanel((v) => !v); setViewingConvo(null); }}
          title="Chat history"
          className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors shrink-0"
        >
          <History className="w-4 h-4" />
        </button>
        <button onClick={startNewConvo} title="New conversation" className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors shrink-0">
          <Plus className="w-4 h-4" />
        </button>
        {onClose && (
          <button onClick={onClose} title="Hide chat" className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Read-only banner */}
      {viewingConvo && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-accent/8 border border-accent/20 text-[10px] text-accent font-mono">
          <History className="w-3 h-3 shrink-0" />
          <span className="flex-1 truncate">Viewing: {viewingConvo.title}</span>
          <button onClick={() => setViewingConvo(null)} className="hover:text-foreground transition-colors shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-0.5">
        {displayItems.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-10 px-4 text-center">
            <Bot className="w-9 h-9 opacity-20" />
            <div className="text-sm font-mono">{demo ? "Chat needs a live backend" : "Talk to TIRPAN"}</div>
            <div className="text-[11px] leading-relaxed">
              {demo
                ? "Exit demo mode to chat with the live LLM and run tools."
                : "Ask it to scan a host, run a tool, or reason about a target. It executes tools directly (with your approval)."}
            </div>
          </div>
        )}

        {displayItems.map((it) => {
          if (it.kind === "user") {
            return (
              <div key={it.id} className="flex gap-2 justify-end">
                <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-accent/10 border border-accent/20 px-3 py-2">
                  <p className="text-[12px] text-foreground/90 whitespace-pre-wrap break-words leading-relaxed">{it.text}</p>
                  <div className="text-[9px] text-muted-foreground font-mono mt-0.5 text-right">{fmtClock(it.ts)}</div>
                </div>
                <div className="w-6 h-6 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3 h-3" />
                </div>
              </div>
            );
          }
          if (it.kind === "assistant") {
            return (
              <div key={it.id} className="flex gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0 rounded-xl rounded-tl-sm bg-muted/50 border border-border/40 px-3 py-2 group">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-primary">TIRPAN</span>
                    <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtClock(it.ts)}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity"><CopyBtn text={it.text} /></span>
                  </div>
                  <MarkdownMsg text={it.text} />
                </div>
              </div>
            );
          }
          if (it.kind === "status") return <StatusBubble key={it.id} item={it} />;
          if (it.kind === "approval") return <ApprovalBubble key={it.id} item={it} onRespond={respondApproval} />;
          return (
            <div key={it.id} className="flex gap-2">
              <div className="w-6 h-6 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0 rounded-xl rounded-tl-sm bg-destructive/5 border border-destructive/20 px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wide text-destructive mb-0.5">Error</div>
                <p className="text-[11px] text-foreground/80 font-mono break-words leading-relaxed">{it.text}</p>
              </div>
            </div>
          );
        })}

        {!isReadOnly && isStreaming && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0 rounded-xl rounded-tl-sm bg-muted/50 border border-border/40 px-3 py-2">
              {streaming
                ? <MarkdownMsg text={streaming + "▋"} />
                : <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> working…</span>}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!autoScroll && (
        <button
          onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
          className="shrink-0 mx-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-mono shadow-lg hover:bg-primary/90 transition-colors"
        >
          <ChevronDown className="w-3 h-3" /> Latest
        </button>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 shrink-0 node-card !p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isReadOnly ? "Press ↵ to return to live chat…" :
            demo ? "Unavailable in demo" :
            ready ? (isStreaming ? "Responding…" : "Ask TIRPAN to run something…") : "Connecting…"
          }
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none px-2 py-1.5"
          disabled={!isReadOnly && (!ready || isStreaming || demo)}
        />
        {!isReadOnly && isStreaming ? (
          <button type="button" onClick={handleAbort} title="Stop" className="w-8 h-8 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 animate-pulse shrink-0">
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!isReadOnly && (!ready || !input.trim() || demo)} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 shrink-0">
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </form>
    </div>
  );
};

export default TirpanChat;
