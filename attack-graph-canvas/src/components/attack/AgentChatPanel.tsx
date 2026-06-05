import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSessionEvents } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { Bot, Wrench, AlertTriangle, Shield, Zap, ChevronDown, Search, Eye, Clock, Cpu } from "lucide-react";

interface AgentEvent {
  id: string;
  event_type: string;
  data: any;
  created_at: number;
}

function fmtTs(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncate(s: string, n = 280): string {
  return s && s.length > n ? s.slice(0, n) + "…" : s || "";
}

const FILTER_TYPES = [
  { key: "all", label: "All" },
  { key: "reasoning", label: "Reasoning" },
  { key: "tool_call", label: "Tools" },
  { key: "finding", label: "Findings" },
  { key: "phase_change", label: "Phase" },
  { key: "safety_block", label: "Safety" },
  { key: "error", label: "Errors" },
] as const;

type FilterKey = typeof FILTER_TYPES[number]["key"];

function PhaseBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const phase = d.phase || d.stage || d.name || "Phase change";
  return (
    <div className="flex justify-center py-1">
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success text-[10px] font-bold uppercase tracking-wide border border-success/20">
        <Zap className="w-3 h-3" />
        {phase}
      </span>
    </div>
  );
}

function ErrorBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const msg = d.error || d.message || JSON.stringify(d);
  return (
    <div className="flex gap-2 py-1">
      <div className="w-7 h-7 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-destructive/5 border border-destructive/15 px-3 py-2">
        <div className="text-[10px] font-bold text-destructive mb-0.5">Error</div>
        <p className="text-[11px] text-foreground/80 font-mono leading-relaxed break-all">{truncate(msg, 240)}</p>
      </div>
    </div>
  );
}

function SafetyBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const reason = d.reason || d.message || "Blocked";
  return (
    <div className="flex gap-2 py-1">
      <div className="w-7 h-7 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
        <Shield className="w-3.5 h-3.5 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-purple-500/5 border border-purple-500/15 px-3 py-2">
        <div className="text-[10px] font-bold text-purple-400 mb-0.5">Safety Block</div>
        <p className="text-[11px] text-foreground/80 leading-relaxed break-all">{truncate(reason, 240)}</p>
      </div>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  reconnaissance: "Recon", scanning: "Scan", exploitation: "Exploit",
  post_exploitation: "Post-Exploit", lateral_movement: "Lateral",
  exfiltration: "Exfil", impact: "Impact", other: "Other",
};

const ASSET_LABELS: Record<string, string> = {
  network: "Network", web_application: "Web App", authentication: "Auth",
  operating_system: "OS", service: "Service", data: "Data", other: "Other",
};

const RISK_BORDER: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308",
  low: "#22c55e", info: "#60a5fa",
};

const RISK_BADGE: Record<string, string> = {
  critical: "text-red-400 bg-red-500/15 border border-red-500/30",
  high:     "text-orange-400 bg-orange-500/15 border border-orange-500/30",
  medium:   "text-yellow-400 bg-yellow-500/15 border border-yellow-500/30",
  low:      "text-green-400 bg-green-500/15 border border-green-500/30",
  info:     "text-blue-400 bg-blue-500/15 border border-blue-500/30",
};

const PHASE_BADGE: Record<string, string> = {
  exploitation:      "text-red-400 bg-red-500/10",
  post_exploitation: "text-orange-400 bg-orange-500/10",
  lateral_movement:  "text-yellow-400 bg-yellow-500/10",
  exfiltration:      "text-pink-400 bg-pink-500/10",
  impact:            "text-red-500 bg-red-600/10",
  scanning:          "text-blue-400 bg-blue-500/10",
  reconnaissance:    "text-purple-400 bg-purple-500/10",
  other:             "text-muted-foreground bg-muted/30",
};

function FindingBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const cls = (d._cls || {}) as Record<string, any>;

  const riskLevel: string  = cls.risk_level   || (d.cvss_score >= 9 ? "critical" : d.cvss_score >= 7 ? "high" : d.cvss_score >= 4 ? "medium" : "info");
  const attackPhase: string = cls.attack_phase  || "";
  const assetCat: string   = cls.asset_category || "";
  const ttps: string[]     = Array.isArray(cls.mitre_ttps) ? cls.mitre_ttps : [];
  const summary: string    = cls.summary        || d.message || d.finding || d.description || JSON.stringify(d);
  const cvss: number | undefined = d.cvss_score;

  const borderColor = RISK_BORDER[riskLevel] || RISK_BORDER.info;

  return (
    <div className="flex gap-2 py-1">
      <div className="w-7 h-7 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
      </div>
      <div
        className="flex-1 min-w-0 rounded-2xl rounded-tl-sm border px-3 py-2.5"
        style={{ borderColor: `${borderColor}30`, background: `${borderColor}08` }}
      >
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-[10px] font-bold text-destructive">Finding</span>

          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${RISK_BADGE[riskLevel] || RISK_BADGE.info}`}>
            {riskLevel}
          </span>

          {attackPhase && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${PHASE_BADGE[attackPhase] || PHASE_BADGE.other}`}>
              {PHASE_LABELS[attackPhase] || attackPhase}
            </span>
          )}

          {assetCat && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] text-muted-foreground bg-muted/40">
              {ASSET_LABELS[assetCat] || assetCat}
            </span>
          )}

          {cvss !== undefined && cvss > 0 && (
            <span className="text-[9px] bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded-full font-mono ml-auto">
              CVSS {cvss}
            </span>
          )}
          <span className="text-[9px] text-muted-foreground font-mono">{fmtTs(ev.created_at)}</span>
        </div>

        {/* Summary */}
        <p className="text-[11px] text-foreground/85 leading-relaxed break-words">{truncate(summary, 300)}</p>

        {/* MITRE ATT&CK TTPs */}
        {ttps.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {ttps.map((t) => (
              <span key={t} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20">
                {t}
              </span>
            ))}
          </div>
        )}

        {cls.source === "rule" && (
          <div className="mt-1 text-[9px] text-muted-foreground/40 italic">auto-classified</div>
        )}
      </div>
    </div>
  );
}

function ReasoningBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const parts = [d.situation, d.hypothesis, d.decision, d.thought, d.reasoning, d.action].filter(Boolean);
  const summary = parts[0] || "Thinking…";
  const detail = parts.length > 1 ? parts : null;
  const [open, setOpen] = useState(false);
  const labels = ["Situation", "Hypothesis", "Decision", "Thought", "Reasoning", "Action"];

  return (
    <div className="flex gap-2 py-1">
      <div className="w-7 h-7 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-3.5 h-3.5 text-accent" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-accent/5 border border-accent/15 px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-accent">Agent</span>
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
        </div>
        <p className="text-[12px] text-foreground/90 leading-relaxed">{truncate(summary, 300)}</p>
        {detail && (
          <>
            <button onClick={() => setOpen(!open)} className="text-[10px] text-accent hover:underline mt-1 inline-flex items-center gap-0.5">
              {open ? "Hide details" : "Show reasoning"} <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div className="mt-2 space-y-1.5">
                {parts.map((p, i) => (
                  <div key={i} className="pl-2 border-l-2 border-accent/30">
                    <div className="text-[9px] text-accent font-bold uppercase tracking-wide">{labels[i]}</div>
                    <p className="text-[11px] text-foreground/70 leading-relaxed">{p}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ToolCallBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const toolName = d.tool || d.tool_name || d.name || "tool";
  const input = d.input ? (typeof d.input === "string" ? d.input : JSON.stringify(d.input, null, 2)) : "";
  const [open, setOpen] = useState(false);

  return (
    <div className="flex gap-2 py-1">
      <div className="w-7 h-7 rounded-xl bg-warning/10 flex items-center justify-center shrink-0 mt-0.5">
        <Wrench className="w-3.5 h-3.5 text-warning" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-card border border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-warning font-mono">{toolName}</span>
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
        </div>
        {input ? (
          <>
            <p className="text-[11px] text-foreground/70 font-mono leading-relaxed break-all">{truncate(input, 120)}</p>
            {input.length > 120 && (
              <button onClick={() => setOpen(!open)} className="text-[10px] text-warning hover:underline mt-1">
                {open ? "Hide input" : "Show full input"}
              </button>
            )}
            {open && (
              <pre className="mt-1.5 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all bg-muted/30 rounded-xl p-2 max-h-40 overflow-y-auto">
                {input}
              </pre>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground italic">Running…</p>
        )}
      </div>
    </div>
  );
}

function ToolResultBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const output = d.output || d.result || d.content || "";
  const outputStr = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  const [open, setOpen] = useState(false);

  return (
    <div className="pl-9 py-0.5">
      <div className="rounded-2xl rounded-tl-sm bg-muted/40 border border-border/30 px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Output</span>
          <span className="text-[9px] text-muted-foreground font-mono">{fmtTs(ev.created_at)}</span>
        </div>
        <p className="text-[11px] text-foreground/70 font-mono leading-relaxed break-all">{truncate(outputStr, 140)}</p>
        {outputStr.length > 140 && (
          <>
            <button onClick={() => setOpen(!open)} className="text-[10px] text-muted-foreground hover:text-foreground mt-1">
              {open ? "Collapse" : "Expand"}
            </button>
            {open && (
              <pre className="mt-1.5 text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap break-all bg-muted/30 rounded-xl p-2 max-h-48 overflow-y-auto">
                {outputStr}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBubble({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const action = d.action || d.command || d.tool || "";
  const result = d.result || d.output || "";
  const success = d.success !== undefined ? d.success : d.result !== undefined;
  const [open, setOpen] = useState(false);
  const resultStr = result ? (typeof result === "string" ? result : JSON.stringify(result, null, 2)) : "";

  return (
    <div className="flex gap-2 py-1">
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${success ? "bg-success/10" : "bg-muted/40"}`}>
        <Zap className={`w-3.5 h-3.5 ${success ? "text-success" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-card border border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-bold ${success ? "text-success" : "text-muted-foreground"}`}>
            Action{success ? " ✓" : ""}
          </span>
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
        </div>
        <p className="text-[11px] text-foreground/80 font-mono leading-relaxed break-all">{truncate(action, 160)}</p>
        {resultStr && (
          <>
            <button onClick={() => setOpen(!open)} className="text-[10px] text-muted-foreground hover:text-foreground mt-1">
              {open ? "Hide result" : "Show result"}
            </button>
            {open && (
              <pre className="mt-1.5 text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap break-all bg-muted/30 rounded-xl p-2 max-h-48 overflow-y-auto">
                {resultStr}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DefaultBubble({ ev }: { ev: AgentEvent }) {
  return (
    <div className="flex gap-2 py-1">
      <div className="w-7 h-7 rounded-xl bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-sm bg-muted/30 border border-border/30 px-3 py-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{String(ev.event_type || "event").replace("_", " ")}</span>
          <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
        </div>
        <p className="text-[11px] text-foreground/70 font-mono break-all">{truncate(JSON.stringify(ev.data), 160)}</p>
      </div>
    </div>
  );
}

function EventBubble({ ev }: { ev: AgentEvent }) {
  switch (ev.event_type) {
    case "reasoning":    return <ReasoningBubble ev={ev} />;
    case "tool_call":    return <ToolCallBubble ev={ev} />;
    case "tool_result":  return <ToolResultBubble ev={ev} />;
    case "finding":      return <FindingBubble ev={ev} />;
    case "phase_change": return <PhaseBubble ev={ev} />;
    case "safety_block": return <SafetyBubble ev={ev} />;
    case "error":        return <ErrorBubble ev={ev} />;
    case "action":       return <ActionBubble ev={ev} />;
    default:             return <DefaultBubble ev={ev} />;
  }
}

function DateDivider({ ts }: { ts: number }) {
  const d = new Date(ts * 1000);
  const label = d.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border/40" />
      <span className="text-[9px] font-mono text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export const AgentChatPanel = ({ open, onClose }: Props) => {
  // Multi-select filter: empty set = "All". Lets the operator combine event
  // types (e.g. reasoning + tool_call) instead of one-at-a-time.
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set());
  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => {
      if (key === "all") return new Set();
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { selectedSessionId } = useSessionContext();

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    enabled: open,
  });

  const target = selectedSessionId
    ? ((sessions as any[]).find((s) => s.id === selectedSessionId) ||
       (sessions as any[]).find((s) => s.is_running || s.status === "running") ||
       (sessions as any[])[0] ||
       null)
    : ((sessions as any[]).find((s) => s.is_running || s.status === "running") ||
       (sessions as any[])[0] ||
       null);

  const { data: eventsData } = useQuery({
    queryKey: ["session-events", target?.id],
    queryFn: () => getSessionEvents(target!.id),
    enabled: !!target?.id && open,
    refetchInterval: (target?.is_running || target?.status === "running") ? 3000 : false,
  });

  const rawEvents: any[] = (eventsData as any)?.events || (Array.isArray(eventsData) ? eventsData : []);
  // Normalize event shape: the live API emits { event_type, data } while demo and
  // legacy payloads use { type, content }. Guarantee both fields so a malformed
  // event can never crash the whole panel on an undefined event_type.
  const allEvents: AgentEvent[] = rawEvents.map((e: any) => ({
    ...e,
    event_type: e.event_type || e.type || "event",
    data: e.data ?? (e.content != null ? { message: e.content } : {}),
  }));
  const filtered = filters.size === 0 ? allEvents : allEvents.filter((e) => filters.has(e.event_type as FilterKey));

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered.length, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(atBottom);
  };

  let lastDate = "";

  if (!open) return null;

  return (
    <div className="flex flex-col gap-3 w-[340px] shrink-0 h-full overflow-hidden">
      <div className="node-card !p-3 flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-xl bg-accent/10 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-display font-bold tracking-tight">Agent Feed</div>
          {target && (
            <div className="text-[9px] text-muted-foreground font-mono truncate">
              {target.target || "session"} · {allEvents.length} events
              {target.is_running && (
                <span className="ml-2 inline-flex items-center gap-1 text-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  live
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      </div>

      <div className="flex gap-1 shrink-0 overflow-x-auto no-scrollbar px-0.5">
        {FILTER_TYPES.map((f) => {
          const count = f.key === "all" ? allEvents.length : allEvents.filter((e) => e.event_type === f.key).length;
          const isActive = f.key === "all" ? filters.size === 0 : filters.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {f.label} {count > 0 && <span className="opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 space-y-0.5 pr-0.5"
        onScroll={handleScroll}
      >
        {!target ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-12">
            <Bot className="w-10 h-10 opacity-20" />
            <div className="text-sm font-mono">No session found</div>
            <div className="text-[11px]">Start a mission to see agent activity</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-12">
            <Search className="w-10 h-10 opacity-20" />
            <div className="text-sm font-mono">No events yet</div>
            {target.is_running && <div className="text-[11px] animate-pulse">Waiting for agent activity…</div>}
          </div>
        ) : (
          filtered.map((ev) => {
            const dateStr = new Date(ev.created_at * 1000).toDateString();
            const showDate = dateStr !== lastDate;
            lastDate = dateStr;
            return (
              <div key={ev.id}>
                {showDate && <DateDivider ts={ev.created_at} />}
                <EventBubble ev={ev} />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {!autoScroll && filtered.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono shadow-lg hover:bg-primary/90 transition-colors mx-auto"
        >
          <ChevronDown className="w-3 h-3" /> Jump to latest
        </button>
      )}
    </div>
  );
};