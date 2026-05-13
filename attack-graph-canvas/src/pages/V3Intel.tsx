import { useState } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { useSessionContext } from "@/lib/SessionContext";
import { api } from "@/lib/utils";
import {
  Brain,
  RefreshCw,
  Search,
  Database,
  GitBranch,
  RotateCcw,
  BookOpen,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";

type V3Panel = "rag" | "kg" | "replay" | "lesson" | "opsec";

interface RAGResult {
  source: string;
  chunk_text: string;
  score: number;
}

interface KGNode {
  id: string;
  type: string;
}

interface KGSummary {
  summary_text: string;
  node_count: number;
  edge_count: number;
  nodes: KGNode[];
}

interface ReplayStats {
  total_calls: number;
  total_cost_usd: number;
  failure_calls: number;
  top_tools: {
    tool_name: string;
    call_count: number;
    avg_duration: number;
    total_cost: number;
  }[];
}

interface OpsecAlert {
  severity: string;
  message: string;
  alert_type?: string;
  tool?: string;
  ts?: number;
}

const PANELS: { id: V3Panel; label: string; icon: typeof Brain }[] = [
  { id: "rag", label: "RAG", icon: Database },
  { id: "kg", label: "KG", icon: GitBranch },
  { id: "replay", label: "REPLAY", icon: RotateCcw },
  { id: "lesson", label: "REFLEXION", icon: BookOpen },
  { id: "opsec", label: "OPSEC", icon: ShieldAlert },
];

export default function V3IntelPage() {
  const { selectedSessionId } = useSessionContext();
  const [panel, setPanel] = useState<V3Panel>("rag");

  // ── RAG state ──────────────────────────────────────────────────
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<RAGResult[]>([]);
  const [ragStats, setRagStats] = useState<Record<string, unknown> | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState("");

  // ── KG state ───────────────────────────────────────────────────
  const [kgSummary, setKgSummary] = useState<KGSummary | null>(null);
  const [kgLoading, setKgLoading] = useState(false);

  // ── Replay state ───────────────────────────────────────────────
  const [replayStats, setReplayStats] = useState<ReplayStats | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);

  // ── Lesson state ───────────────────────────────────────────────
  const [lesson, setLesson] = useState<Record<string, unknown> | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);

  // ── OPSEC state ────────────────────────────────────────────────
  const [opsecAlerts, setOpsecAlerts] = useState<OpsecAlert[]>([]);

  // ── Fetchers ───────────────────────────────────────────────────
  const fetchRagStats = async () => {
    try {
      const d = await api.get("/v3/rag/stats");
      setRagStats(d as Record<string, unknown>);
    } catch {
      setRagStats(null);
    }
  };

  const fetchRagQuery = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagError("");
    try {
      const d = await api.post("/v3/rag/query", {
        text: ragQuery,
        k: 5,
        scope: "both",
      });
      setRagResults((d as { results: RAGResult[] }).results || []);
    } catch (e) {
      setRagError(String(e));
      setRagResults([]);
    } finally {
      setRagLoading(false);
    }
  };

  const bootstrapRAG = async () => {
    if (!confirm("Bootstrap RAG KB from souls + playbook? This may take a minute.")) return;
    try {
      const d = await api.post("/v3/rag/bootstrap", {});
      alert((d as { message?: string }).message || "Done");
      fetchRagStats();
    } catch (e) {
      alert("Bootstrap failed: " + e);
    }
  };

  const fetchKgSummary = async () => {
    if (!selectedSessionId) return;
    setKgLoading(true);
    try {
      const d = await api.get(`/v3/sessions/${selectedSessionId}/graph/summary`);
      setKgSummary(d as KGSummary);
    } catch {
      setKgSummary(null);
    } finally {
      setKgLoading(false);
    }
  };

  const fetchReplayStats = async () => {
    if (!selectedSessionId) return;
    setReplayLoading(true);
    try {
      const d = await api.get(`/v3/sessions/${selectedSessionId}/replay`);
      setReplayStats(d as ReplayStats);
    } catch {
      setReplayStats(null);
    } finally {
      setReplayLoading(false);
    }
  };

  const fetchLesson = async () => {
    if (!selectedSessionId) return;
    setLessonLoading(true);
    try {
      const d = await api.get(`/v3/sessions/${selectedSessionId}/lesson`);
      setLesson(d as Record<string, unknown>);
    } catch {
      setLesson(null);
    } finally {
      setLessonLoading(false);
    }
  };

  const refreshAll = () => {
    fetchRagStats();
    fetchKgSummary();
    fetchReplayStats();
    fetchLesson();
  };

  const getSeverityColor = (sev: string) => {
    if (sev === "HIGH") return "text-red-500";
    if (sev === "CRITICAL") return "text-red-600";
    return "text-yellow-500";
  };

  const typeColors: Record<string, string> = {
    host: "bg-blue-500",
    credential: "bg-orange-500",
    vuln: "bg-red-500",
    session: "bg-lime-400",
    domain: "bg-purple-500",
  };

  return (
    <PageShell title="V3 Intel" subtitle="RAG · Knowledge Graph · Replay · Reflexion · OPSEC">
      <div className="flex flex-col h-full gap-4">
        {/* Tab bar */}
        <div className="flex items-center gap-1 shrink-0 border-b border-border/50 pb-2">
          {PANELS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                panel === p.id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              <p.icon className="w-3.5 h-3.5" />
              {p.label}
            </button>
          ))}
          <button
            onClick={refreshAll}
            className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {/* RAG Panel */}
        {panel === "rag" && (
          <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide flex-1">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">RAG Store</span>
              {ragStats && (
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  v{String(ragStats.store_version ?? "?")} · {(ragStats.sqlite_vss_available as boolean) ? "vss ✓" : "fts only"}
                </span>
              )}
              <button onClick={bootstrapRAG} className="ml-auto px-2.5 py-1 text-[10px] border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors uppercase tracking-wider rounded">
                Bootstrap KB
              </button>
              <button onClick={fetchRagStats} className="px-2.5 py-1 text-[10px] border border-border text-muted-foreground hover:text-foreground transition-colors rounded">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {ragStats && (
              <div className="grid grid-cols-3 gap-3">
                {(["total_collections", "total_chunks"] as const).map((key) => (
                  <div key={key} className="border border-border/50 bg-card p-3 rounded-lg">
                    <span className="text-[8px] uppercase tracking-widest text-muted-foreground/60">{key.replace(/_/g, " ")}</span>
                    <p className="text-lg font-bold font-mono text-primary">{String(ragStats[key] ?? "?")}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                className="flex-1 bg-black/40 border border-border text-sm font-mono px-3 py-1.5 rounded outline-none focus:border-primary/60"
                placeholder="Query RAG store (e.g. vsftpd backdoor)…"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchRagQuery()}
              />
              <button onClick={fetchRagQuery} disabled={ragLoading} className="px-3 py-1.5 text-[10px] border border-primary/60 text-primary hover:bg-primary/10 transition-colors uppercase tracking-wider rounded flex items-center gap-1">
                <Search className="w-3 h-3" /> {ragLoading ? "…" : "Query"}
              </button>
            </div>

            {ragError && <p className="text-red-500 text-xs">{ragError}</p>}

            <div className="flex flex-col gap-2">
              {ragResults.map((r, i) => (
                <div key={i} className="border border-border/30 bg-black/40 p-2.5 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] text-primary/70 font-bold">#{i + 1}</span>
                    <span className="text-[9px] text-muted-foreground/60 font-mono">{r.source}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground/40 font-mono">score {r.score.toFixed(3)}</span>
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground/80 leading-relaxed">
                    {r.chunk_text?.slice(0, 300)}
                    {r.chunk_text?.length > 300 ? "…" : ""}
                  </pre>
                </div>
              ))}
              {ragResults.length === 0 && !ragLoading && !ragError && (
                <p className="text-muted-foreground/50 italic text-xs">No results yet.</p>
              )}
            </div>
          </div>
        )}

        {/* KG Panel */}
        {panel === "kg" && (
          <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Knowledge Graph</span>
              {kgSummary && (
                <span className="text-[10px] text-muted-foreground/60 font-mono ml-2">
                  {kgSummary.node_count ?? 0} nodes · {kgSummary.edge_count ?? 0} edges
                </span>
              )}
              <button onClick={fetchKgSummary} className="ml-auto px-2.5 py-1 text-[10px] border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors uppercase tracking-wider rounded">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            <pre className="text-[11px] font-mono text-muted-foreground/80 whitespace-pre-wrap bg-black/40 border border-border/30 p-3 rounded-lg leading-relaxed min-h-[80px]">
              {kgLoading ? "Loading…" : kgSummary ? kgSummary.summary_text || "(empty)" : "No active session."}
            </pre>

            {kgSummary?.nodes && (
              <div className="flex flex-col gap-1">
                {kgSummary.nodes.slice(0, 30).map((n, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 border border-border/20 bg-black/30 rounded">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${typeColors[n.type] || "bg-gray-500"}`} />
                    <span className="text-[9px] font-mono text-muted-foreground w-16 shrink-0">{n.type}</span>
                    <span className="text-[11px] font-mono text-foreground truncate">{n.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Replay Panel */}
        {panel === "replay" && (
          <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Replay Log</span>
              {replayStats && (
                <span className="text-[10px] text-muted-foreground/60 font-mono ml-2">
                  {replayStats.total_calls ?? 0} calls · ${(replayStats.total_cost_usd ?? 0).toFixed(4)} · {replayStats.failure_calls ?? 0} failed
                </span>
              )}
              <button onClick={fetchReplayStats} className="ml-auto px-2.5 py-1 text-[10px] border border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors uppercase tracking-wider rounded">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>

            {replayStats?.top_tools?.length ? (
              <div className="flex flex-col gap-1">
                <div className="flex gap-3 px-2 py-1 text-[9px] uppercase tracking-widest text-muted-foreground/50 border-b border-border/20">
                  <span className="w-32">Tool</span>
                  <span className="w-12">Calls</span>
                  <span className="w-20">Avg (s)</span>
                  <span>Cost</span>
                </div>
                {replayStats.top_tools.map((t, i) => (
                  <div key={i} className="flex gap-3 px-2 py-1 border-b border-border/10 hover:bg-white/5 rounded-sm">
                    <span className="w-32 font-mono text-[11px] text-foreground truncate">{t.tool_name}</span>
                    <span className="w-12 text-[11px] text-muted-foreground">{t.call_count}</span>
                    <span className="w-20 text-[11px] text-muted-foreground">{t.avg_duration.toFixed(2)}s</span>
                    <span className="text-[11px] text-muted-foreground">${t.total_cost.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground/50 italic text-xs">
                {replayLoading ? "Loading…" : selectedSessionId ? "No replay data yet." : "No active session."}
              </p>
            )}
          </div>
        )}

        {/* Reflexion Panel */}
        {panel === "lesson" && (
          <div className="flex flex-col gap-4 overflow-y-auto scrollbar-hide flex-1">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Reflexion / Lesson</span>
            <pre className="text-[11px] font-mono text-muted-foreground/80 whitespace-pre-wrap bg-black/40 border border-border/30 p-3 rounded-lg leading-relaxed min-h-[80px]">
              {lessonLoading ? "Loading…" : lesson ? JSON.stringify(lesson, null, 2) : selectedSessionId ? "Lesson captured at mission end." : "No active session."}
            </pre>
          </div>
        )}

        {/* OPSEC Panel */}
        {panel === "opsec" && (
          <div className="flex flex-col gap-2 overflow-y-auto scrollbar-hide flex-1">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">OPSEC Alerts</span>
            {opsecAlerts.length === 0 && (
              <p className="text-muted-foreground/50 italic text-xs">No alerts yet.</p>
            )}
            {opsecAlerts.map((a, i) => (
              <div key={i} className="flex flex-col gap-0.5 p-2 border border-border/30 rounded-lg bg-card/50">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-3 h-3 ${getSeverityColor(a.severity)}`} />
                  <span className={`text-[10px] font-bold uppercase ${getSeverityColor(a.severity)}`}>{a.severity}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">{a.ts ? new Date(a.ts * 1000).toLocaleTimeString() : new Date().toLocaleTimeString()}</span>
                </div>
                <span className="text-[11px] text-foreground">{a.message || a.alert_type}</span>
                {a.tool && <span className="text-[9px] font-mono text-muted-foreground/50">tool: {a.tool}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}