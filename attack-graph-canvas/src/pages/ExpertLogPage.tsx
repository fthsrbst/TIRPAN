import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useSessionBundle } from "@/hooks/useAttackGraphData";
import { getSessions, getSessionEvents, getAudit } from "@/lib/api";
import {
  Terminal, ArrowLeft, Clock, Cpu, Wrench,
  ChevronDown, ChevronRight, RefreshCw, Download, Layers,
  ScrollText, Shield,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type EventCategory = "tool" | "agent" | "scan" | "exploit" | "session" | "error" | "finding";

const EVENT_CATEGORIES: { id: EventCategory; label: string }[] = [
  { id: "tool", label: "Tools" },
  { id: "agent", label: "Agent / phase" },
  { id: "scan", label: "Scan" },
  { id: "exploit", label: "Exploit" },
  { id: "session", label: "Session" },
  { id: "error", label: "Errors" },
  { id: "finding", label: "Findings" },
];

function eventMatchesCategory(ev: AgentEvent, cat: EventCategory): boolean {
  const type = (ev.event_type || "").toLowerCase();
  switch (cat) {
    case "tool":
      return type.includes("tool");
    case "agent":
      return type === "agent" || type === "phase" || type === "phase_change" || type === "reasoning";
    case "scan":
      return type.includes("scan");
    case "exploit":
      return type.includes("exploit");
    case "session":
      return type.includes("session");
    case "error":
      return type === "error" || type.includes("error") || type.includes("fail");
    case "finding":
      return type.includes("finding") || type.includes("vuln");
    default:
      return false;
  }
}

interface AgentEvent {
  id: string | number;
  event_type: string;
  data: any;
  created_at: number;
  iteration?: number;
}

interface SessionInfo {
  id: string;
  target?: string;
  name?: string;
  status?: string;
  created_at?: number;
}

const TYPE_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  scan:         { border: "border-success/40",      bg: "bg-success/5",      label: "text-success" },
  exploit:      { border: "border-accent/40",        bg: "bg-accent/5",       label: "text-accent" },
  finding:      { border: "border-warning/40",       bg: "bg-warning/5",      label: "text-warning" },
  session:      { border: "border-primary/40",       bg: "bg-primary/5",      label: "text-primary" },
  phase:        { border: "border-border/40",        bg: "bg-muted/10",       label: "text-muted-foreground" },
  agent:        { border: "border-foreground/20",    bg: "bg-muted/5",        label: "text-foreground" },
  tool_call:    { border: "border-warning/50",       bg: "bg-warning/5",      label: "text-warning" },
  tool_result:  { border: "border-success/30",       bg: "bg-success/5",      label: "text-success/80" },
  reasoning:    { border: "border-warning/40",       bg: "bg-warning/5",      label: "text-warning" },
  error:        { border: "border-destructive/40",   bg: "bg-destructive/5",  label: "text-destructive" },
  safety_block: { border: "border-primary/40",       bg: "bg-primary/5",      label: "text-primary" },
};

function getStyle(type: string) {
  return TYPE_COLORS[type.toLowerCase()] || TYPE_COLORS.agent;
}

function truncate(s: string | undefined | null, n = 280): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function safeStr(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function csvEscape(v: any): string {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const EXPORT_FIELDS = ["id", "event_type", "created_at", "iteration", "data_summary"] as const;

function eventToExportRow(ev: AgentEvent): Record<string, string> {
  const d = ev.data || {};
  let summary = "";
  if (typeof d.message === "string") summary = d.message;
  else if (typeof d.tool_name === "string") summary = d.tool_name;
  else if (typeof d.tool === "string") summary = d.tool;
  else if (typeof d.content === "string") summary = truncate(d.content, 200);
  else if (typeof d.output === "string") summary = truncate(d.output, 200);
  else summary = safeStr(d).slice(0, 200);

  return {
    id: String(ev.id ?? ""),
    event_type: ev.event_type ?? "",
    created_at: ev.created_at ? new Date(ev.created_at * 1000).toISOString() : "",
    iteration: String(ev.iteration ?? ""),
    data_summary: summary,
  };
}

function exportCSV(events: AgentEvent[], sessionLabel: string) {
  const BOM = "\uFEFF";
  const SEP = ";";
  const header = EXPORT_FIELDS.map(csvEscape).join(SEP);
  const rows = events.map((ev) => {
    const row = eventToExportRow(ev);
    return EXPORT_FIELDS.map((f) => csvEscape(row[f])).join(SEP);
  });
  const csv = BOM + [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `expert-log-${sessionLabel}-${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportJSON(events: AgentEvent[], sessionLabel: string) {
  const rows = events.map(eventToExportRow);
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  downloadBlob(blob, `expert-log-${sessionLabel}-${new Date().toISOString().slice(0, 10)}.json`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EventRow({ ev }: { ev: AgentEvent }) {
  const [expanded, setExpanded] = useState(false);
  const rawType = (ev.event_type || "agent").toLowerCase();
  const style = getStyle(rawType);
  const timeStr = ev.created_at ? new Date(ev.created_at * 1000).toLocaleTimeString() : "";
  const d = ev.data || {};
  const isToolCall = rawType === "tool_call";
  const isToolResult = rawType === "tool_result";
  const isAgent = rawType === "agent" || rawType === "phase" || rawType === "phase_change" || rawType === "reasoning";

  let summary = "";
  if (typeof d.message === "string" && d.message) summary = d.message;
  else if (typeof d.tool_name === "string" && d.tool_name) {
    const inp = d.input ? truncate(safeStr(d.input), 50) : "";
    summary = d.tool_name + (inp ? "(" + inp + ")" : "");
  } else if (typeof d.tool === "string" && d.tool) {
    const inp = d.input ? truncate(safeStr(d.input), 50) : "";
    summary = d.tool + (inp ? "(" + inp + ")" : "");
  } else if (typeof d.content === "string" && d.content) summary = truncate(d.content, 200);
  else if (typeof d.situation === "string" && d.situation) summary = truncate(d.situation, 200);
  else if (typeof d.reasoning === "string" && d.reasoning) summary = truncate(d.reasoning, 200);
  else if (typeof d.phase === "string" && d.phase) summary = "Phase: " + d.phase;
  else if (typeof d.stage === "string" && d.stage) summary = "Phase: " + d.stage;
  else if (typeof d.name === "string" && d.name) summary = d.name;
  else if (typeof d.output === "string" && d.output) summary = truncate(d.output, 200);
  else if (typeof d.result === "string" && d.result) summary = truncate(d.result, 200);
  else if (typeof d.error === "string" && d.error) summary = "Error: " + truncate(d.error, 200);
  else if (typeof d.finding === "string" && d.finding) summary = truncate(d.finding, 200);

  const detailStr = safeStr(d);

  return (
    <div className={`border-l-2 ${style.border} ${style.bg} rounded-r-lg mb-1.5`}>
      <button
        className="w-full flex items-start gap-2.5 px-3 py-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5 shrink-0">
          {isToolCall ? (
            <Wrench className={`w-3.5 h-3.5 ${style.label}`} />
          ) : isToolResult ? (
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${style.label.replace("text-", "bg-")}`} />
          ) : isAgent ? (
            <Cpu className={`w-3.5 h-3.5 ${style.label}`} />
          ) : (
            <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${style.label.replace("text-", "bg-")}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-muted-foreground">{timeStr}</span>
            <span className={`text-[9px] font-mono uppercase tracking-wider font-bold ${style.label}`}>{ev.event_type}</span>
            {ev.iteration != null && <span className="text-[9px] text-muted-foreground font-mono">iter {ev.iteration}</span>}
          </div>
          {summary ? (
            <p className="text-[11px] text-foreground/80 font-mono mt-0.5 truncate">{summary}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground/60 font-mono mt-0.5 truncate">{truncate(detailStr, 200)}</p>
          )}
        </div>
        <div className="shrink-0 mt-0.5">
          {expanded
            ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground" />
          }
        </div>
      </button>
      {expanded && detailStr && (
        <div className="px-3 pb-3">
          <pre className="text-[10px] font-mono text-foreground/90 whitespace-pre-wrap break-all bg-muted/30 rounded-lg p-2.5 max-h-[400px] overflow-auto">{detailStr}</pre>
        </div>
      )}
    </div>
  );
}

export default function ExpertLogPage() {
  const bundle = useSessionBundle();
  const [searchParams] = useSearchParams();

  const { data: sessions = [] } = useQuery<SessionInfo[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 10000,
  });

  const [manualSid, setManualSid] = useState<string>("");
  const effectiveSid = manualSid || bundle.sessionId;

  const { data: eventsRaw, isLoading, refetch } = useQuery({
    queryKey: ["session-events", effectiveSid],
    queryFn: () => getSessionEvents(effectiveSid!, 2000),
    enabled: !!effectiveSid,
    refetchInterval: 5000,
  });

  const allEvents: AgentEvent[] = (() => {
    if (!eventsRaw) return [];
    if (Array.isArray(eventsRaw)) return eventsRaw;
    if (eventsRaw.events && Array.isArray(eventsRaw.events)) return eventsRaw.events;
    return [];
  })();

  const [mode, setMode] = useState<"events" | "audit">("events");
  const [eventCategorySet, setEventCategorySet] = useState<Set<EventCategory>>(() => new Set());
  const [minIteration, setMinIteration] = useState<number | "">("");
  const [auditTypeSet, setAuditTypeSet] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [elapsed, setElapsed] = useState(bundle.dynamicGraph.elapsedSeconds || 0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const sid = searchParams.get("session");
    if (sid) setManualSid(sid);
    const view = searchParams.get("view");
    if (view === "audit" || view === "events") setMode(view);
  }, [searchParams]);

  const { data: auditRaw, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-log", effectiveSid],
    queryFn: () => getAudit(),
    enabled: mode === "audit",
    refetchInterval: 5000,
  });

  const auditEntries: any[] = useMemo(() => {
    if (!auditRaw) return [];
    if (Array.isArray(auditRaw)) return auditRaw;
    if (auditRaw.entries && Array.isArray(auditRaw.entries)) return auditRaw.entries;
    if (auditRaw.audit_log && Array.isArray(auditRaw.audit_log)) return auditRaw.audit_log;
    return [];
  }, [auditRaw]);

  const auditTypesInData = useMemo(() => {
    const ts = new Set<string>();
    auditEntries.forEach((entry: any) => {
      const t = String(entry.event_type ?? entry.action ?? entry.type ?? "audit").trim() || "audit";
      ts.add(t);
    });
    return [...ts].sort((a, b) => a.localeCompare(b));
  }, [auditEntries]);

  const filteredAudit = useMemo(() => {
    return auditEntries.filter((entry: any) => {
      if (effectiveSid) {
        if (String(entry.session_id ?? "") !== String(effectiveSid)) return false;
      }
      if (search) {
        const hay = JSON.stringify(entry).toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      if (auditTypeSet.size > 0) {
        const rowType = String(entry.event_type ?? entry.action ?? entry.type ?? "audit").trim() || "audit";
        if (!auditTypeSet.has(rowType)) return false;
      }
      return true;
    });
  }, [auditEntries, search, effectiveSid, auditTypeSet]);

  useEffect(() => {
    if (!bundle.dynamicGraph.isRunning || !bundle.dynamicGraph.startTime) {
      setElapsed(bundle.dynamicGraph.elapsedSeconds || 0);
      return;
    }
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.round(Date.now() / 1000 - bundle.dynamicGraph.startTime)));
    }, 1000);
    return () => clearInterval(id);
  }, [bundle.dynamicGraph.isRunning, bundle.dynamicGraph.startTime, bundle.dynamicGraph.elapsedSeconds]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  const currentSession = sessions.find((s) => s.id === effectiveSid);
  const sessionLabel = currentSession
    ? (currentSession.name || currentSession.target || currentSession.id?.slice(0, 8) || "unknown")
    : (effectiveSid?.slice(0, 8) || "none");

  const minIterEffective = minIteration === "" ? null : Number(minIteration);

  const filtered = useMemo(() => {
    return allEvents.filter((ev) => {
      if (eventCategorySet.size > 0) {
        const ok = [...eventCategorySet].some((c) => eventMatchesCategory(ev, c));
        if (!ok) return false;
      }
      if (minIterEffective != null && Number.isFinite(minIterEffective) && ev.iteration != null && ev.iteration < minIterEffective) {
        return false;
      }
      if (search) {
        const hay = JSON.stringify(ev).toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [allEvents, eventCategorySet, minIterEffective, search]);

  const clearAllFacets = useCallback(() => {
    setEventCategorySet(new Set());
    setAuditTypeSet(new Set());
    setMinIteration("");
  }, []);

  const eventModeChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    eventCategorySet.forEach((c) => {
      const meta = EVENT_CATEGORIES.find((x) => x.id === c);
      chips.push({
        id: `cat-${c}`,
        label: meta?.label ?? c,
        onRemove: () => setEventCategorySet((prev) => toggleInSet(prev, c)),
      });
    });
    if (minIterEffective != null && Number.isFinite(minIterEffective)) {
      chips.push({
        id: "iter",
        label: `Iteration ≥ ${minIterEffective}`,
        onRemove: () => setMinIteration(""),
      });
    }
    return chips;
  }, [eventCategorySet, minIterEffective]);

  const auditModeChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    auditTypeSet.forEach((t) => {
      chips.push({
        id: `audit-${t}`,
        label: `Type: ${t}`,
        onRemove: () => setAuditTypeSet((prev) => toggleInSet(prev, t)),
      });
    });
    return chips;
  }, [auditTypeSet]);

  const filterChipsDisplay = mode === "audit" ? auditModeChips : eventModeChips;

  const activeFacetCount = useMemo(() => {
    let n = mode === "audit" ? auditTypeSet.size : eventCategorySet.size;
    if (mode === "events" && minIterEffective != null && Number.isFinite(minIterEffective)) n += 1;
    return n;
  }, [mode, auditTypeSet, eventCategorySet, minIterEffective]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered.length, autoScroll]);

  const toolEvents = filtered.filter((ev) => (ev.event_type || "").toLowerCase().includes("tool"));
  const agentEvents = filtered.filter((ev) => {
    const t = (ev.event_type || "").toLowerCase();
    return t === "agent" || t === "phase" || t === "phase_change" || t === "reasoning";
  });
  const otherEvents = filtered.filter((ev) => {
    const t = (ev.event_type || "").toLowerCase();
    return !t.includes("tool") && t !== "agent" && t !== "phase" && t !== "phase_change" && t !== "reasoning";
  });

  const useSplitView =
    mode === "events" &&
    eventCategorySet.size === 0 &&
    (minIterEffective == null || !Number.isFinite(minIterEffective)) &&
    (toolEvents.length > 0 || agentEvents.length > 0);

  return (
    <PageShell
      title="Expert Log"
      subtitle={`${currentSession?.target || bundle.dynamicGraph.target || "No active session"} · ${mm}:${ss} elapsed`}
    >
      <div className="flex flex-col h-full gap-3 min-h-0">
        <div className="shrink-0 node-card !p-2.5">
          <ListFilterToolbar
            className="[&_input]:font-mono [&_button]:font-mono"
            leading={
              <>
                <Link
                  to="/attack-graph"
                  className="flex items-center gap-1.5 text-[11px] font-mono bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-full border border-border/50 transition-colors shrink-0 h-9"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Attack Graph
                </Link>
                <div className="flex items-center gap-0.5 bg-card border border-border rounded-full px-1 py-0.5 shrink-0 h-9">
                  <button
                    type="button"
                    onClick={() => setMode("events")}
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors h-7 inline-flex items-center ${
                      mode === "events" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Terminal className="w-3 h-3 inline mr-1" /> Events
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("audit")}
                    className={`text-[10px] font-mono px-2.5 py-1 rounded-full transition-colors h-7 inline-flex items-center ${
                      mode === "audit" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ScrollText className="w-3 h-3 inline mr-1" /> Audit
                  </button>
                </div>
              </>
            }
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={mode === "audit" ? "Search audit log..." : "Search events..."}
            betweenSearchAndFilters={
              <div className="relative shrink-0">
                <Layers className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  value={manualSid}
                  onChange={(e) => setManualSid(e.target.value)}
                  className="pl-7 pr-6 h-9 text-[11px] font-mono bg-card border border-border rounded-full appearance-none focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer max-w-[200px] sm:max-w-[240px]"
                >
                  <option value="">Auto (running session)</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.target || s.id?.slice(0, 8)} {s.status === "running" ? "●" : ""} · {s.id?.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            }
            activeFacetCount={activeFacetCount}
            chips={filterChipsDisplay}
            onClearAllFacets={clearAllFacets}
            summary={
              mode === "audit"
                ? `${filteredAudit.length} audit entries (${auditEntries.length} loaded)`
                : `${filtered.length} events (${allEvents.length} loaded)`
            }
            trailingActions={
              <>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="flex items-center gap-1.5 text-[10px] font-mono bg-muted hover:bg-muted/80 px-2.5 py-1.5 rounded-full border border-border/50 transition-colors h-9"
                  title="Refresh"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`text-[10px] font-mono px-2.5 py-1.5 rounded-full border transition-colors h-9 ${
                    autoScroll ? "bg-accent/10 text-accent border-accent/30" : "bg-muted text-muted-foreground border-border/50"
                  }`}
                >
                  Auto-scroll {autoScroll ? "on" : "off"}
                </button>
                {mode === "events" && filtered.length > 0 ? (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => exportCSV(filtered, sessionLabel)}
                      className="flex items-center gap-1 text-[10px] font-mono bg-muted hover:bg-muted/80 px-2.5 py-1.5 rounded-full border border-border/50 transition-colors h-9"
                      title="Export CSV"
                    >
                      <Download className="w-3 h-3" /> CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => exportJSON(filtered, sessionLabel)}
                      className="flex items-center gap-1 text-[10px] font-mono bg-muted hover:bg-muted/80 px-2.5 py-1.5 rounded-full border border-border/50 transition-colors h-9"
                      title="Export JSON"
                    >
                      <Download className="w-3 h-3" /> JSON
                    </button>
                  </div>
                ) : null}
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-card/60 px-2.5 py-1.5 rounded-full border border-border/30 h-9">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span className="whitespace-nowrap">
                    {mode === "audit" ? filteredAudit.length : filtered.length}{" "}
                    {mode === "audit" ? "entries" : "events"}
                  </span>
                </div>
              </>
            }
            panelClassName="w-[320px]"
            filterPanel={
              mode === "audit" ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Entry type</p>
                  {auditTypesInData.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No audit entries loaded.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {auditTypesInData.map((t) => (
                        <div key={t} className="flex items-center gap-2">
                          <Checkbox
                            id={`audit-type-${t}`}
                            checked={auditTypeSet.has(t)}
                            onCheckedChange={() => setAuditTypeSet((prev) => toggleInSet(prev, t))}
                          />
                          <Label htmlFor={`audit-type-${t}`} className="text-xs font-normal font-mono truncate cursor-pointer">
                            {t}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">Multiple types combine with OR. Empty selection = show all.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Event categories</p>
                    <div className="grid grid-cols-1 gap-2">
                      {EVENT_CATEGORIES.map(({ id: catId, label }) => (
                        <div key={catId} className="flex items-center gap-2">
                          <Checkbox
                            id={`ev-cat-${catId}`}
                            checked={eventCategorySet.has(catId)}
                            onCheckedChange={() => setEventCategorySet((prev) => toggleInSet(prev, catId))}
                          />
                          <Label htmlFor={`ev-cat-${catId}`} className="text-xs font-normal cursor-pointer">
                            {label}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">OR within categories. Leave empty for all.</p>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Minimum iteration</Label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Any"
                      value={minIteration}
                      onChange={(e) => setMinIteration(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs font-mono"
                    />
                  </div>
                </div>
              )
            }
          />
        </div>

        {/* Content */}
        {mode === "audit" ? (
          auditLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground text-sm font-mono">Loading audit logs...</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div
                className="flex-1 overflow-auto bg-card/40 rounded-2xl border border-border/50 p-4"
                onScroll={() => setAutoScroll(false)}
              >
                {filteredAudit.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm font-mono">No audit log entries found.</p>
                  </div>
                ) : (
                  filteredAudit.map((entry: any, i: number) => {
                    const ts = entry.created_at
                      ? new Date(entry.created_at * 1000).toLocaleString()
                      : entry.timestamp || "—";
                    const type = entry.event_type || entry.action || entry.type || "audit";
                    const detail = entry.details
                      ? (typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details, null, 2))
                      : entry.message || entry.description || JSON.stringify(entry, null, 2);
                    return (
                      <EventRow
                        key={i}
                        ev={{
                          id: entry.id || i,
                          event_type: type,
                          data: { message: typeof detail === "string" ? detail.slice(0, 300) : detail },
                          created_at: entry.created_at || Date.now() / 1000,
                          iteration: entry.iteration,
                        }}
                      />
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          )
        ) : isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted-foreground text-sm font-mono">Loading events...</p>
          </div>
        ) : useSplitView ? (
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <Wrench className="w-3.5 h-3.5 text-warning" />
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground">TOOL OUTPUT</span>
                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono ml-auto">{toolEvents.length + otherEvents.length}</span>
              </div>
              <div
                className="flex-1 overflow-auto bg-card/40 rounded-2xl border border-border/50 p-3"
                onScroll={() => setAutoScroll(false)}
              >
                {[...otherEvents, ...toolEvents].length === 0 ? (
                  <p className="text-muted-foreground text-[11px] font-mono text-center py-8">No tool events yet</p>
                ) : (
                  [...otherEvents, ...toolEvents].map((ev, i) => (
                    <EventRow key={ev.id ?? i} ev={ev} />
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <Cpu className="w-3.5 h-3.5 text-foreground" />
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground">AGENT MESSAGES</span>
                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono ml-auto">{agentEvents.length}</span>
              </div>
              <div
                className="flex-1 overflow-auto bg-card/40 rounded-2xl border border-border/50 p-3"
                onScroll={() => setAutoScroll(false)}
              >
                {agentEvents.length === 0 ? (
                  <p className="text-muted-foreground text-[11px] font-mono text-center py-8">No agent messages yet</p>
                ) : (
                  agentEvents.map((ev, i) => (
                    <EventRow key={ev.id ?? i} ev={ev} />
                  ))
                )}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <div
              className="flex-1 overflow-auto bg-card/40 rounded-2xl border border-border/50 p-4"
              onScroll={() => setAutoScroll(false)}
            >
              {filtered.length === 0 ? (
                <div className="text-center py-12">
                  <Terminal className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm font-mono">
                    {allEvents.length === 0
                      ? "No events captured yet. Start a mission to see agent activity."
                      : "No events match the current filter."}
                  </p>
                </div>
              ) : (
                filtered.map((ev, i) => <EventRow key={ev.id ?? i} ev={ev} />)
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}