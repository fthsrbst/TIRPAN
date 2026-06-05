import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSessionEvents } from "@/lib/api";
import { X, ChevronDown, ChevronRight } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentEvent {
  id: string;
  event_type: string;
  data: any;
  created_at: number;
}

// ─── Event card renderers ─────────────────────────────────────────────────────

function fmtTs(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function truncate(s: string, n = 280): string {
  return s && s.length > n ? s.slice(0, n) + "…" : (s || "");
}

function ExpandableCard({
  label,
  labelColor,
  borderColor,
  ts,
  summary,
  detail,
}: {
  label: string;
  labelColor: string;
  borderColor: string;
  ts: number;
  summary: string;
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md mb-1.5 overflow-hidden" style={{ borderLeft: `3px solid ${borderColor}`, background: "hsl(var(--card))" }}>
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => detail && setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: labelColor }}>{label}</span>
            <span className="text-[9px] text-muted-foreground font-mono ml-auto shrink-0">{fmtTs(ts)}</span>
          </div>
          <p className="text-[11px] text-muted-foreground font-mono leading-relaxed break-all">{summary}</p>
        </div>
        {detail && (
          <span className="shrink-0 text-muted-foreground mt-0.5">
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        )}
      </div>
      {open && detail && (
        <pre className="px-3 pb-2 text-[10px] font-mono text-muted-foreground/70 whitespace-pre-wrap break-all border-t border-border/30 pt-2 max-h-48 overflow-y-auto">
          {detail}
        </pre>
      )}
    </div>
  );
}

function ReasoningCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const parts = [d.situation, d.hypothesis, d.decision, d.thought, d.reasoning, d.action].filter(Boolean);
  const summary = truncate(parts[0] || "Reasoning…", 200);
  const detail = parts.length > 1 ? parts.map((p, i) => {
    const labels = ["Situation", "Hypothesis", "Decision", "Thought", "Reasoning", "Action"];
    return `[${labels[i] || ""}]\n${p}`;
  }).join("\n\n") : parts[0];
  return (
    <ExpandableCard
      label="Reasoning"
      labelColor="#eab308"
      borderColor="rgba(234,179,8,0.6)"
      ts={ev.created_at}
      summary={summary}
      detail={detail}
    />
  );
}

function ToolCallCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const toolName = d.tool || d.tool_name || d.name || "tool";
  const inputStr = d.input ? (typeof d.input === "string" ? d.input : JSON.stringify(d.input, null, 2)) : "";
  return (
    <ExpandableCard
      label={`Tool · ${toolName}`}
      labelColor="#f97316"
      borderColor="rgba(249,115,22,0.5)"
      ts={ev.created_at}
      summary={inputStr ? truncate(inputStr, 140) : "Calling tool…"}
      detail={inputStr}
    />
  );
}

function ToolResultCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const output = d.output || d.result || d.content || "";
  const outputStr = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return (
    <ExpandableCard
      label="Tool Result"
      labelColor="hsl(var(--muted-foreground))"
      borderColor="hsl(var(--border))"
      ts={ev.created_at}
      summary={truncate(outputStr, 140)}
      detail={outputStr.length > 140 ? outputStr : undefined}
    />
  );
}

const _RISK_BORDER: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", info: "#60a5fa",
};

const _PHASE_LABELS: Record<string, string> = {
  reconnaissance: "Recon", scanning: "Scan", exploitation: "Exploit",
  post_exploitation: "Post-Exploit", lateral_movement: "Lateral",
  exfiltration: "Exfil", impact: "Impact", other: "Other",
};

function FindingCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const cls = (d._cls || {}) as Record<string, any>;

  const riskLevel: string   = cls.risk_level    || (d.cvss_score >= 9 ? "critical" : d.cvss_score >= 7 ? "high" : "medium");
  const attackPhase: string = cls.attack_phase   || "";
  const assetCat: string    = cls.asset_category || "";
  const ttps: string[]      = Array.isArray(cls.mitre_ttps) ? cls.mitre_ttps : [];
  const summary: string     = cls.summary        || d.message || d.finding || d.description || JSON.stringify(d);
  const cvss: number | undefined = d.cvss_score;

  const borderColor = _RISK_BORDER[riskLevel] || "#ef4444";

  return (
    <div className="rounded-md mb-1.5 overflow-hidden" style={{ borderLeft: `3px solid ${borderColor}`, background: "hsl(var(--card))" }}>
      <div className="px-3 py-2">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-red-400">Finding</span>

          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide"
            style={{ color: borderColor, background: `${borderColor}20` }}>
            {riskLevel}
          </span>

          {attackPhase && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-semibold">
              {_PHASE_LABELS[attackPhase] || attackPhase}
            </span>
          )}

          {assetCat && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground/80">
              {assetCat.replace(/_/g, " ")}
            </span>
          )}

          {cvss !== undefined && cvss > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground">CVSS {cvss}</span>
          )}

          {ttps.map((t) => (
            <span key={t} className="text-[9px] px-1.5 py-0.5 rounded font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20">
              {t}
            </span>
          ))}

          <span className="text-[9px] text-muted-foreground font-mono ml-auto shrink-0">{fmtTs(ev.created_at)}</span>
        </div>

        {/* Summary text */}
        <p className="text-[11px] text-red-300/80 font-mono leading-relaxed break-all">{truncate(summary, 240)}</p>

        {cls.source === "rule" && (
          <div className="mt-0.5 text-[9px] text-muted-foreground/40 italic">auto-classified</div>
        )}
      </div>
    </div>
  );
}

function PhaseCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const phase = d.phase || d.stage || d.name || "Phase change";
  return (
    <div className="rounded-md mb-1.5 px-3 py-2" style={{ borderLeft: "3px solid #22c55e", background: "hsl(var(--card))" }}>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-green-400">Phase</span>
        <span className="text-[11px] font-mono text-green-300/90">{phase}</span>
        <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
      </div>
    </div>
  );
}

function SafetyCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const reason = d.reason || d.message || "Blocked";
  return (
    <ExpandableCard
      label="Safety Block"
      labelColor="#a855f7"
      borderColor="rgba(168,85,247,0.5)"
      ts={ev.created_at}
      summary={truncate(reason, 160)}
    />
  );
}

function ErrorCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const msg = d.error || d.message || JSON.stringify(d);
  return (
    <ExpandableCard
      label="Error"
      labelColor="#ef4444"
      borderColor="rgba(239,68,68,0.5)"
      ts={ev.created_at}
      summary={truncate(msg, 200)}
    />
  );
}

function ActionCard({ ev }: { ev: AgentEvent }) {
  const d = ev.data || {};
  const action = d.action || d.command || d.tool || "";
  const result = d.result || d.output || "";
  const success = d.success !== undefined ? d.success : d.result !== undefined;
  return (
    <ExpandableCard
      label={`Action${success ? " ✓" : ""}`}
      labelColor={success ? "#22c55e" : "hsl(var(--muted-foreground))"}
      borderColor={success ? "rgba(34,197,94,0.4)" : "hsl(var(--border))"}
      ts={ev.created_at}
      summary={action ? truncate(action, 140) : "Action"}
      detail={result ? (typeof result === "string" ? result : JSON.stringify(result, null, 2)) : undefined}
    />
  );
}

function EventCard({ ev }: { ev: AgentEvent }) {
  switch (ev.event_type) {
    case "reasoning":     return <ReasoningCard ev={ev} />;
    case "tool_call":     return <ToolCallCard ev={ev} />;
    case "tool_result":   return <ToolResultCard ev={ev} />;
    case "finding":       return <FindingCard ev={ev} />;
    case "phase_change":  return <PhaseCard ev={ev} />;
    case "safety_block":  return <SafetyCard ev={ev} />;
    case "error":         return <ErrorCard ev={ev} />;
    case "action":        return <ActionCard ev={ev} />;
    default:
      return (
        <div className="rounded-md mb-1.5 px-3 py-2 border-l-2 border-border bg-card">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{ev.event_type}</span>
            <span className="text-[9px] text-muted-foreground font-mono ml-auto">{fmtTs(ev.created_at)}</span>
          </div>
          <p className="text-[11px] font-mono text-muted-foreground break-all">{truncate(JSON.stringify(ev.data), 160)}</p>
        </div>
      );
  }
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const FILTER_TYPES = ["all", "reasoning", "tool_call", "finding", "phase_change", "error", "safety_block"] as const;
type Filter = typeof FILTER_TYPES[number];

// ─── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export const AgentHistoryPanel = ({ open, onClose }: Props) => {
  // Multi-select filter: empty set = "All" (combine reasoning + tool_call, etc.)
  const [filters, setFilters] = useState<Set<Filter>>(() => new Set());
  const toggleFilter = (key: Filter) => {
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

  // Find current session
  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    enabled: open,
  });
  const target = (sessions as any[]).find((s) => s.is_running || s.status === "running") || (sessions as any[])[0] || null;

  // Fetch events
  const { data: eventsData } = useQuery({
    queryKey: ["session-events", target?.id],
    queryFn: () => getSessionEvents(target!.id),
    enabled: !!target?.id && open,
    refetchInterval: target?.is_running ? 3000 : false,
  });

  const allEvents: AgentEvent[] = (eventsData as any)?.events || (Array.isArray(eventsData) ? eventsData : []);
  const filtered = filters.size === 0 ? allEvents : allEvents.filter((e) => filters.has(e.event_type as Filter));

  // Auto-scroll on new events
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

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-[420px] max-w-[95vw] h-full bg-background border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <div>
            <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Agent History</div>
            {target && (
              <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                {target.target || "session"} · {allEvents.length} events
                {target.is_running && (
                  <span className="ml-2 inline-flex items-center gap-1 text-accent">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />live
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-border shrink-0 overflow-x-auto">
          {FILTER_TYPES.map((f) => (
            <button
              key={f}
              onClick={() => toggleFilter(f)}
              className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest transition-colors ${
                (f === "all" ? filters.size === 0 : filters.has(f))
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {f === "all" ? `All (${allEvents.length})` : f.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Events list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2"
          onScroll={handleScroll}
        >
          {!target ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <div className="text-sm font-mono">No session found</div>
              <div className="text-[11px]">Start a mission to see agent events</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <div className="text-sm font-mono">No events yet</div>
              {target.is_running && <div className="text-[11px] animate-pulse">Waiting for agent activity…</div>}
            </div>
          ) : (
            filtered.map((ev) => <EventCard key={ev.id} ev={ev} />)
          )}
          <div ref={bottomRef} />
        </div>

        {/* Auto-scroll toggle */}
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
            className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-mono shadow-lg hover:bg-primary/90 transition-colors"
          >
            <ChevronDown className="w-3 h-3" /> Jump to latest
          </button>
        )}
      </div>
    </div>
  );
};
