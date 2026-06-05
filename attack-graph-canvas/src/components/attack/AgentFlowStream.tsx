import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSessionEvents, injectSession } from "@/lib/api";
import { useWebSocket, type WSMessage } from "@/hooks/useWebSocket";
import { ExportMenu } from "@/components/attack/ExportMenu";
import { exportCSV, exportJSON } from "@/lib/exportData";
import { toast } from "sonner";
import {
  Bot, Wrench, Terminal, AlertTriangle, Shield, Zap, Eye, Cpu, CheckCircle,
  Search, Copy, Check, Map, ArrowDown, KeyRound, FileText, Send, MessageSquarePlus,
} from "lucide-react";

// ── Event model ──────────────────────────────────────────────────────────────
export interface FlowEvent {
  id: string;
  event_type: string;
  data: Record<string, unknown> & { _cls?: Record<string, unknown> };
  created_at: number; // unix seconds
}

let _seq = 0;
const uid = () => `f${Date.now().toString(36)}_${(_seq++).toString(36)}`;

function fmtTs(sec: number): string {
  if (!sec) return "";
  return new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function asStr(v: unknown, pretty = true): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try { return JSON.stringify(v, null, pretty ? 2 : 0); } catch { return String(v); }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function sig(eventType: string, data: unknown): string {
  return `${eventType}|${asStr(data, false)}`;
}

function normalizeBase(raw: unknown): FlowEvent[] {
  const arr: any[] = (raw as any)?.events || (Array.isArray(raw) ? (raw as any[]) : []);
  return arr.map((e: any) => ({
    id: String(e.id ?? uid()),
    event_type: e.event_type || e.type || "event",
    data: e.data ?? (e.content != null ? { message: e.content } : {}),
    created_at: Number(e.created_at) || 0,
  }));
}

// ── Type metadata (icon + tailwind accent + minimap color) ───────────────────
type Accent = "accent" | "warning" | "blue" | "destructive" | "success" | "purple" | "muted" | "primary";

const ACCENT_TEXT: Record<Accent, string> = {
  accent: "text-accent", warning: "text-warning", blue: "text-blue-400",
  destructive: "text-destructive", success: "text-success", purple: "text-purple-400",
  muted: "text-muted-foreground", primary: "text-primary",
};
const ACCENT_BG: Record<Accent, string> = {
  accent: "bg-accent/5 border-accent/15", warning: "bg-warning/5 border-warning/20",
  blue: "bg-blue-500/5 border-blue-500/20", destructive: "bg-destructive/5 border-destructive/20",
  success: "bg-success/5 border-success/20", purple: "bg-purple-500/5 border-purple-500/20",
  muted: "bg-muted/30 border-border/30", primary: "bg-primary/5 border-primary/20",
};
const ACCENT_ICON: Record<Accent, string> = {
  accent: "bg-accent/10 text-accent", warning: "bg-warning/10 text-warning",
  blue: "bg-blue-500/10 text-blue-400", destructive: "bg-destructive/10 text-destructive",
  success: "bg-success/10 text-success", purple: "bg-purple-500/10 text-purple-400",
  muted: "bg-muted/40 text-muted-foreground", primary: "bg-primary/10 text-primary",
};
const ACCENT_COLOR: Record<Accent, string> = {
  accent: "hsl(var(--accent))", warning: "hsl(var(--warning))", blue: "#60a5fa",
  destructive: "hsl(var(--destructive))", success: "hsl(var(--success))", purple: "#a78bfa",
  muted: "hsl(var(--muted-foreground))", primary: "hsl(var(--primary))",
};

interface TypeMeta { Icon: typeof Bot; accent: Accent; label: string; }
const TYPE_META: Record<string, TypeMeta> = {
  reasoning:        { Icon: Bot,          accent: "accent",      label: "Reasoning" },
  thought:          { Icon: Bot,          accent: "accent",      label: "Reasoning" },
  tool_call:        { Icon: Wrench,       accent: "warning",     label: "Tool Call" },
  tool_result:      { Icon: Terminal,     accent: "blue",        label: "Tool Result" },
  action:           { Icon: Zap,          accent: "success",     label: "Action" },
  finding:          { Icon: AlertTriangle,accent: "destructive", label: "Finding" },
  phase_change:     { Icon: Zap,          accent: "success",     label: "Phase" },
  safety_block:     { Icon: Shield,       accent: "purple",      label: "Safety Block" },
  error:            { Icon: AlertTriangle,accent: "destructive", label: "Error" },
  shell_open:       { Icon: Terminal,     accent: "warning",     label: "Shell Opened" },
  credential:       { Icon: KeyRound,     accent: "warning",     label: "Credential" },
  agent_spawn:      { Icon: Cpu,          accent: "primary",     label: "Agent Spawned" },
  agent_start:      { Icon: Cpu,          accent: "primary",     label: "Agent Started" },
  agent_done:       { Icon: CheckCircle,  accent: "success",     label: "Agent Done" },
  agent_complete:   { Icon: CheckCircle,  accent: "success",     label: "Complete" },
  generate_report:  { Icon: FileText,     accent: "primary",     label: "Report" },
  report:           { Icon: FileText,     accent: "primary",     label: "Report" },
  injected:         { Icon: Send,         accent: "accent",      label: "Operator" },
  operator_response:{ Icon: Bot,          accent: "accent",      label: "Acknowledged" },
  _default:         { Icon: Eye,          accent: "muted",       label: "Event" },
};
const metaFor = (t: string): TypeMeta => TYPE_META[t] || TYPE_META._default;

function humanize(t: string): string {
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
const labelFor = (t: string): string => TYPE_META[t]?.label || humanize(t);

// Internal/metadata keys that are routing info, not content worth showing.
const META_KEYS = new Set(["agent_id", "agent_type", "mission_id", "session_id", "iteration", "timestamp", "ts", "_cls"]);

// ── Filters ───────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: "all",          label: "All",       match: (_: string) => true },
  { key: "reasoning",    label: "Reasoning", match: (t: string) => t === "reasoning" || t === "thought" },
  { key: "tool_call",    label: "Tool Calls",match: (t: string) => t === "tool_call" },
  { key: "tool_result",  label: "Results",   match: (t: string) => t === "tool_result" || t === "action" },
  { key: "finding",      label: "Findings",  match: (t: string) => t === "finding" },
  { key: "phase_change", label: "Phases",    match: (t: string) => t === "phase_change" },
  { key: "safety_block", label: "Safety",    match: (t: string) => t === "safety_block" },
  { key: "error",        label: "Errors",    match: (t: string) => t === "error" },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

// ── Copy button ─────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      title="Copy"
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); })}
      className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
    >
      {done ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// Collapsible <pre> block for long tool input/output.
function CodeBlock({ text, open: openProp }: { text: string; open: boolean }) {
  const [open, setOpen] = useState(openProp);
  useEffect(() => setOpen(openProp), [openProp]);
  const long = text.length > 200;
  return (
    <>
      <pre className={`mt-1 text-[10px] font-mono text-muted-foreground/90 whitespace-pre-wrap break-all bg-muted/30 rounded-lg p-2 overflow-y-auto ${open ? "max-h-72" : "max-h-16"}`}>
        {text}
      </pre>
      {long && (
        <button onClick={() => setOpen((v) => !v)} className="text-[10px] text-muted-foreground hover:text-foreground mt-0.5">
          {open ? "Collapse" : "Expand"}
        </button>
      )}
    </>
  );
}

// ── Phase divider ────────────────────────────────────────────────────────────
function PhaseDivider({ ev }: { ev: FlowEvent }) {
  const d = ev.data;
  const phase = String(d.phase || d.stage || d.name || d.message || "Phase change");
  return (
    <div className="flex items-center gap-3 py-2" data-flow-id={ev.id} data-flow-type="phase_change">
      <div className="flex-1 h-px bg-success/30" />
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-[10px] font-bold uppercase tracking-wide border border-success/20 shrink-0">
        <Zap className="w-3 h-3" /> {phase}
      </span>
      <span className="text-[9px] text-muted-foreground font-mono shrink-0">{fmtTs(ev.created_at)}</span>
      <div className="flex-1 h-px bg-success/30" />
    </div>
  );
}

// ── Generic flow bubble ───────────────────────────────────────────────────────
function FlowBubble({ ev, expandedAll }: { ev: FlowEvent; expandedAll: boolean }) {
  if (ev.event_type === "phase_change") return <PhaseDivider ev={ev} />;

  const meta = metaFor(ev.event_type);
  const d = ev.data || {};

  return (
    <div className="flex gap-2 py-0.5" data-flow-id={ev.id} data-flow-type={ev.event_type}>
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${ACCENT_ICON[meta.accent]}`}>
        <meta.Icon className="w-3.5 h-3.5" />
      </div>
      <div className={`flex-1 min-w-0 rounded-2xl rounded-tl-sm border px-3 py-2 ${ACCENT_BG[meta.accent]} group`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${ACCENT_TEXT[meta.accent]}`}>{labelFor(ev.event_type)}</span>
          {ev.event_type === "tool_result" && d.success != null && (
            <span className={`text-[9px] font-bold ${d.success ? "text-success" : "text-destructive"}`}>{d.success ? "✓" : "✗"}</span>
          )}
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
          <span className="opacity-0 group-hover:opacity-100 transition-opacity"><CopyBtn text={asStr(d)} /></span>
        </div>
        <BubbleBody ev={ev} expandedAll={expandedAll} />
      </div>
    </div>
  );
}

function BubbleBody({ ev, expandedAll }: { ev: FlowEvent; expandedAll: boolean }) {
  const d = ev.data || {};
  const t = ev.event_type;

  if (t === "reasoning" || t === "thought") {
    const labels: [string, string][] = [
      ["situation", "Situation"], ["hypothesis", "Hypothesis"], ["decision", "Decision"],
      ["thought", "Thought"], ["reasoning", "Reasoning"], ["plan", "Plan"], ["action", "Next Action"],
    ];
    const parts = labels.filter(([k]) => d[k]).map(([k, lbl]) => [lbl, String(d[k])] as [string, string]);
    const phase = d.attack_phase ? String(d.attack_phase) : "";
    if (parts.length === 0) {
      return <p className="text-[12px] text-foreground/90 leading-relaxed break-words">{String(d.message || "Thinking…")}</p>;
    }
    return (
      <div className="space-y-1.5">
        {phase && <span className="inline-block text-[9px] font-mono text-accent/80 bg-accent/10 rounded px-1.5 py-0.5">{phase}</span>}
        {parts.map(([lbl, val], i) => (
          <div key={i} className="pl-2 border-l-2 border-accent/30">
            <div className="text-[9px] text-accent font-bold uppercase tracking-wide">{lbl}</div>
            <p className="text-[12px] text-foreground/85 leading-relaxed break-words whitespace-pre-wrap">{val}</p>
          </div>
        ))}
      </div>
    );
  }

  if (t === "tool_call") {
    const name = String(d.tool || d.tool_name || d.name || "tool");
    const input = d.input ?? d.params ?? d.arguments;
    const inputStr = input != null ? asStr(input) : "";
    return (
      <>
        <div className="font-mono text-[12px] font-bold text-warning break-all">{name}</div>
        {inputStr ? <CodeBlock text={inputStr} open={expandedAll} /> : <p className="text-[11px] text-muted-foreground italic mt-0.5">running…</p>}
      </>
    );
  }

  if (t === "tool_result") {
    const out = d.output ?? d.result ?? d.content ?? d.error ?? d.message;
    const tool = d.tool || d.tool_name;
    const outStr = asStr(out);
    return (
      <>
        {tool ? <div className="font-mono text-[11px] text-blue-400/80 mb-0.5 break-all">{String(tool)}</div> : null}
        {outStr ? <CodeBlock text={outStr} open={expandedAll} /> : <p className="text-[11px] text-muted-foreground italic">no output</p>}
      </>
    );
  }

  if (t === "finding") {
    const cls = (d._cls || {}) as Record<string, any>;
    const ttps: string[] = Array.isArray(cls.mitre_ttps) ? cls.mitre_ttps : [];
    const summary = String(cls.summary || d.message || d.finding || d.description || d.title || asStr(d));
    // Prefer structured fields; otherwise infer severity from CVSS-in-text / keywords.
    let cvss = Number(d.cvss_score ?? 0);
    if (!cvss) { const m = summary.match(/CVSS[:\s]*([0-9]+(?:\.[0-9]+)?)/i); if (m) cvss = parseFloat(m[1]); }
    let risk = String(cls.risk_level || "").toLowerCase();
    if (!risk) {
      const low = summary.toLowerCase();
      if (cvss >= 9 || /\bcritical\b/.test(low)) risk = "critical";
      else if (cvss >= 7 || /\bhigh\b/.test(low)) risk = "high";
      else if (cvss >= 4 || /\bmedium\b/.test(low)) risk = "medium";
      else if (/\blow\b/.test(low)) risk = "low";
      else risk = "info";
    }
    const riskCls: Record<string, string> = {
      critical: "text-red-400 bg-red-500/15", high: "text-orange-400 bg-orange-500/15",
      medium: "text-yellow-400 bg-yellow-500/15", low: "text-green-400 bg-green-500/15", info: "text-blue-400 bg-blue-500/15",
    };
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase ${riskCls[risk] || riskCls.info}`}>{risk}</span>
          {cvss > 0 && <span className="text-[9px] font-mono bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded-full">CVSS {cvss}</span>}
        </div>
        <p className="text-[12px] text-foreground/85 leading-relaxed break-words">{summary}</p>
        {ttps.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {ttps.map((tp) => (
              <span key={tp} className="px-1.5 py-0.5 rounded text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20">{tp}</span>
            ))}
          </div>
        )}
      </>
    );
  }

  if (t === "action") {
    const action = String(d.action || d.command || d.tool || d.message || "");
    const resultStr = asStr(d.result ?? d.output);
    return (
      <>
        <p className="text-[12px] font-mono text-foreground/85 break-all">{action}</p>
        {resultStr ? <CodeBlock text={resultStr} open={expandedAll} /> : null}
      </>
    );
  }

  // safety_block / error / shell_open / agent_* / report / default
  const primary = d.reason ?? d.error ?? d.message ?? d.content ?? d.summary ?? d.narrative ?? d.text ?? d.path ?? d.report_path;
  if (primary != null && typeof primary !== "object" && String(primary).trim()) {
    return <p className="text-[12px] text-foreground/85 leading-relaxed break-words whitespace-pre-wrap">{truncate(String(primary), 1200)}</p>;
  }
  // No obvious text field — render a clean key/value summary of scalar fields
  // (drops routing metadata like agent_id) instead of dumping raw JSON.
  const entries = Object.entries(d).filter(
    ([k, v]) => !META_KEYS.has(k) && v != null && v !== "" && typeof v !== "object",
  );
  if (entries.length === 0) {
    const js = asStr(d);
    return js && js !== "{}"
      ? <CodeBlock text={js} open={expandedAll} />
      : <p className="text-[11px] text-muted-foreground italic">no detail</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1 text-[10px] font-mono rounded-md bg-muted/40 px-1.5 py-0.5">
          <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
          <span className="text-foreground/90 font-bold">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

// ── Minimap ─────────────────────────────────────────────────────────────────────
function FlowMinimap({
  scrollRef, recomputeKey,
}: { scrollRef: React.RefObject<HTMLDivElement>; recomputeKey: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<{ top: number; h: number; color: string }[]>([]);
  const [view, setView] = useState({ top: 0, h: 1 });
  const draggingRef = useRef(false);

  const updateView = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sh = el.scrollHeight || 1;
    setView({ top: el.scrollTop / sh, h: Math.min(1, el.clientHeight / sh) });
  }, [scrollRef]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sh = el.scrollHeight || 1;
    const cRect = el.getBoundingClientRect();
    const nodes = el.querySelectorAll<HTMLElement>("[data-flow-id]");
    const ms: { top: number; h: number; color: string }[] = [];
    nodes.forEach((n) => {
      const r = n.getBoundingClientRect();
      const top = (r.top - cRect.top) + el.scrollTop;
      const accent = (metaFor(n.dataset.flowType || "_default").accent);
      ms.push({ top: top / sh, h: Math.max(r.height / sh, 0.005), color: ACCENT_COLOR[accent] });
    });
    setMarkers(ms);
    updateView();
  }, [scrollRef, updateView]);

  useLayoutEffect(() => { measure(); }, [measure, recomputeKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(updateView); };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [scrollRef, measure, updateView]);

  const seekTo = useCallback((clientY: number, smooth: boolean) => {
    const rail = railRef.current;
    const el = scrollRef.current;
    if (!rail || !el) return;
    const rect = rail.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    el.scrollTo({ top: f * el.scrollHeight - el.clientHeight / 2, behavior: smooth ? "smooth" : "auto" });
  }, [scrollRef]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (draggingRef.current) seekTo(e.clientY, false); };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [seekTo]);

  return (
    <div
      ref={railRef}
      onPointerDown={(e) => { draggingRef.current = true; seekTo(e.clientY, true); }}
      className="relative w-12 shrink-0 ml-1 rounded-lg bg-muted/25 border border-border/40 cursor-pointer overflow-hidden select-none"
      title="Minimap — click or drag to navigate"
    >
      {markers.map((m, i) => (
        <div
          key={i}
          className="absolute left-1 right-1 rounded-[1px]"
          style={{ top: `${m.top * 100}%`, height: `calc(${m.h * 100}% )`, minHeight: 2, background: m.color, opacity: 0.55 }}
        />
      ))}
      {/* Viewport indicator */}
      <div
        className="absolute left-0 right-0 bg-primary/15 border-y border-primary/50 pointer-events-none"
        style={{ top: `${view.top * 100}%`, height: `${view.h * 100}%` }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  sessionId: string | null;
  session?: any;
  className?: string;
}

export const AgentFlowStream = ({ sessionId, session, className = "" }: Props) => {
  // Multi-select: an empty set means "All". Selecting several keys (e.g.
  // reasoning + tool_call) shows the union of those event types.
  const [filterKeys, setFilterKeys] = useState<Set<FilterKey>>(() => new Set());
  const toggleFilter = (key: FilterKey) => {
    setFilterKeys((prev) => {
      if (key === "all") return new Set();
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedAll, setExpandedAll] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [injectText, setInjectText] = useState("");
  const [injecting, setInjecting] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const [live, setLive] = useState<FlowEvent[]>([]);
  const liveTokensRef = useRef("");
  const [liveTokens, setLiveTokens] = useState("");

  const running = !!(session?.is_running || session?.status === "running");

  // Full history (stable ids) — refetch lightly while running as a safety net.
  const { data: baseData, isLoading } = useQuery({
    queryKey: ["flow-events", sessionId],
    queryFn: () => getSessionEvents(sessionId!),
    enabled: !!sessionId,
    refetchInterval: running ? 8000 : false,
  });
  const baseEvents = useMemo(() => normalizeBase(baseData), [baseData]);

  // Reset all local stream state when the watched session changes.
  useEffect(() => {
    seenRef.current = new Set();
    setLive([]);
    liveTokensRef.current = "";
    setLiveTokens("");
  }, [sessionId]);

  // Fold base history into the seen-set and drop any live duplicates.
  useEffect(() => {
    if (!baseEvents.length) return;
    const baseSigs = new Set(baseEvents.map((e) => sig(e.event_type, e.data)));
    setLive((prev) => prev.filter((e) => !baseSigs.has(sig(e.event_type, e.data))));
    baseSigs.forEach((s) => seenRef.current.add(s));
  }, [baseEvents]);

  // WebSocket: subscribe to the session's live event stream.
  const onWs = useCallback((msg: WSMessage) => {
    if (msg.type !== "session_event") return;
    const evType = String(msg.event || "");
    const data = (msg.data as Record<string, unknown>) || {};

    if (evType === "llm_thinking_start" || evType === "llm_reflecting_start") {
      liveTokensRef.current = "";
      setLiveTokens("");
      return;
    }
    if (evType === "llm_token") {
      liveTokensRef.current += String((data as any).token ?? (data as any).content ?? "");
      setLiveTokens(liveTokensRef.current);
      return;
    }
    // Structured event — the model finished a thought, clear the live buffer.
    liveTokensRef.current = "";
    setLiveTokens("");
    const s = sig(evType, data);
    if (seenRef.current.has(s)) return;
    seenRef.current.add(s);
    setLive((prev) => [...prev, { id: uid(), event_type: evType, data, created_at: Date.now() / 1000 }]);
  }, []);

  const { ready, send } = useWebSocket(undefined, { onMessage: onWs });

  useEffect(() => {
    if (!ready || !sessionId) return;
    send({ type: "subscribe_session", session_id: sessionId });
    return () => { send({ type: "unsubscribe_session", session_id: sessionId }); };
  }, [ready, sessionId, send]);

  const allEvents = useMemo(() => [...baseEvents, ...live], [baseEvents, live]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTERS) c[f.key] = allEvents.filter((e) => f.match(e.event_type)).length;
    return c;
  }, [allEvents]);

  const filtered = useMemo(() => {
    const active = FILTERS.filter((x) => x.key !== "all" && filterKeys.has(x.key));
    const q = search.trim().toLowerCase();
    return allEvents.filter((e) => {
      if (active.length > 0 && !active.some((f) => f.match(e.event_type))) return false;
      if (!q) return true;
      return (e.event_type + " " + asStr(e.data, false)).toLowerCase().includes(q);
    });
  }, [allEvents, filterKeys, search]);

  // Auto-scroll to newest as events / tokens stream in.
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [filtered.length, liveTokens, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom !== autoScroll) setAutoScroll(atBottom);
  };

  // Operator intervention — inject a message into the running agent's loop.
  const doInject = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = injectText.trim();
    if (!text || !sessionId || injecting) return;
    setInjecting(true);
    try {
      const r = await injectSession(sessionId, text);
      if (r?.ok) {
        toast.success("Instruction sent to agent");
        setInjectText("");
        setAutoScroll(true);
      } else {
        toast.error("Agent isn't running — can't intervene right now");
      }
    } catch {
      toast.error("Failed to send instruction");
    } finally {
      setInjecting(false);
    }
  };

  const exportRows = useMemo(
    () => filtered.map((e) => ({
      time: e.created_at ? new Date(e.created_at * 1000).toISOString() : "",
      type: e.event_type,
      content: asStr(e.data, false),
    })),
    [filtered],
  );

  const recomputeKey = `${filtered.length}:${expandedAll}:${[...filterKeys].sort().join(",")}:${search}:${liveTokens.length > 0 ? "t" : ""}`;

  return (
    <div className={`node-card !p-0 flex flex-col h-full min-h-0 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-display font-bold tracking-tight">Live Agent Flow</div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">
              {sessionId ? <>{session?.target || "session"} · {allEvents.length} events</> : "No session selected"}
              {running && (
                <span className="ml-2 inline-flex items-center gap-1 text-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> live
                </span>
              )}
              {sessionId && !ready && <span className="ml-2 text-destructive">offline</span>}
            </div>
          </div>
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flow…"
              className="h-8 w-40 rounded-full bg-muted/50 border border-border/50 text-xs pl-8 pr-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button
            onClick={() => setExpandedAll((v) => !v)}
            title={expandedAll ? "Collapse all" : "Expand all"}
            className={`h-8 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wide border transition-colors shrink-0 ${expandedAll ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {expandedAll ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={() => setShowMinimap((v) => !v)}
            title="Toggle minimap"
            className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors shrink-0 ${showMinimap ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <Map className="w-3.5 h-3.5" />
          </button>
          <ExportMenu count={filtered.length} onExportCsv={() => exportCSV("agent-flow", exportRows)} onExportJson={() => exportJSON("agent-flow", filtered)} />
        </div>

        {/* Filter chips */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => {
            const active = f.key === "all" ? filterKeys.size === 0 : filterKeys.has(f.key);
            const n = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
              >
                {f.label}{n > 0 && <span className="ml-1 opacity-60">{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body: stream + minimap */}
      <div className="relative flex-1 min-h-0 flex">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-1">
          {!sessionId ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-12 text-center">
              <Cpu className="w-10 h-10 opacity-20" />
              <div className="text-sm font-mono">No session selected</div>
              <div className="text-[11px]">Pick a session above to watch its agent flow.</div>
            </div>
          ) : isLoading && allEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <div className="text-sm font-mono">Loading flow…</div>
            </div>
          ) : filtered.length === 0 && !liveTokens ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-12 text-center">
              <Search className="w-10 h-10 opacity-20" />
              <div className="text-sm font-mono">{search || filterKeys.size > 0 ? "No matching events" : "No events yet"}</div>
              {running && !search && filterKeys.size === 0 && <div className="text-[11px] animate-pulse">Waiting for agent activity…</div>}
            </div>
          ) : (
            <>
              {filtered.map((ev) => <FlowBubble key={ev.id} ev={ev} expandedAll={expandedAll} />)}
              {liveTokens && (
                <div className="flex gap-2 py-0.5">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-accent/10 text-accent">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm border border-dashed border-accent/30 bg-accent/[0.03] px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-accent inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Streaming
                      </span>
                    </div>
                    <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{liveTokens}<span className="inline-block w-1.5 h-3 ml-0.5 bg-accent/70 animate-pulse align-middle" /></pre>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {showMinimap && allEvents.length > 0 && <FlowMinimap scrollRef={scrollRef} recomputeKey={recomputeKey} />}

        {!autoScroll && (
          <button
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono shadow-lg hover:bg-primary/90 transition-colors"
          >
            <ArrowDown className="w-3 h-3" /> Jump to latest
          </button>
        )}
      </div>

      {/* Operator intervention — inject instructions into the running agent */}
      {sessionId && (
        <form onSubmit={doInject} className="shrink-0 border-t border-border/50 px-2 py-2 flex items-center gap-2">
          <MessageSquarePlus className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />
          <input
            value={injectText}
            onChange={(e) => setInjectText(e.target.value)}
            placeholder={running ? "Intervene — send an instruction to the running agent…" : "Agent not running — start a mission to intervene"}
            disabled={!running || injecting}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none px-1 py-1.5 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!running || !injectText.trim() || injecting}
            title="Send instruction to agent"
            className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center disabled:opacity-30 hover:opacity-90 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
};

export default AgentFlowStream;
