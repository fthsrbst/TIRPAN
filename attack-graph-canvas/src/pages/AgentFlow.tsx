import { useState, useMemo } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { AgentFlowStream } from "@/components/attack/AgentFlowStream";
import { TirpanChat } from "@/components/attack/TirpanChat";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { MessageSquare, Radio, ShieldAlert, ChevronDown, ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/attack/UserAvatar";

const CVSS_COLOR = (cvss: number) =>
  cvss >= 9 ? "text-destructive" : cvss >= 7 ? "text-warning" : cvss >= 4 ? "text-accent" : "text-muted-foreground";

const CVSS_BG = (cvss: number) =>
  cvss >= 9 ? "bg-destructive/10" : cvss >= 7 ? "bg-warning/10" : cvss >= 4 ? "bg-accent/10" : "bg-muted/40";

const AgentFlow = () => {
  const { selectedSessionId } = useSessionContext();
  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });
  const [picked, setPicked] = useState<string>("auto");
  const [chatOpen, setChatOpen] = useState(true);
  const [vulnsOpen, setVulnsOpen] = useState(true);
  const [vulnsExpanded, setVulnsExpanded] = useState(false);

  const autoResolved = useMemo(
    () => (sessions as any[]).find((s) => s.is_running || s.status === "running") || (sessions as any[])[0] || null,
    [sessions],
  );

  const effectiveId: string | null =
    selectedSessionId || (picked !== "auto" ? picked : autoResolved?.id) || null;

  const session = useMemo(
    () => (sessions as any[]).find((s) => s.id === effectiveId) || (effectiveId === autoResolved?.id ? autoResolved : null),
    [sessions, effectiveId, autoResolved],
  );

  const running = !!(session?.is_running || session?.status === "running");

  const { data: sessionData } = useQuery({
    queryKey: ["session-detail", effectiveId],
    queryFn: () => getSession(effectiveId!),
    enabled: !!effectiveId,
    refetchInterval: running ? 8000 : 30000,
    staleTime: 5000,
  });

  const vulns: any[] = useMemo(() => {
    const raw: any[] = sessionData?.vulnerabilities || [];
    return [...raw].sort((a, b) => (b.cvss_score || 0) - (a.cvss_score || 0));
  }, [sessionData]);

  const criticalCount = vulns.filter((v) => (v.cvss_score || 0) >= 7).length;
  const visibleVulns = vulnsExpanded ? vulns : vulns.slice(0, 5);

  return (
    <PageShell
      title="Agent Flow"
      subtitle="Live reasoning stream, tool calls & results — plus a direct ops chat"
      contentScrollable={false}
    >
      <div className="flex flex-col h-full min-h-0 gap-3">
        {/* Control bar */}
        <div className="shrink-0 flex items-center gap-3 flex-wrap">
          {selectedSessionId && session ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-full bg-accent/10 text-accent text-xs font-medium">
              <Radio className="w-3.5 h-3.5" />
              <span className="truncate max-w-[260px]">{sessionDisplayLabel(session) || session.target || effectiveId}</span>
              <span className="text-[10px] text-muted-foreground">(pinned)</span>
            </div>
          ) : (
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="h-9 rounded-full bg-muted border border-border text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary max-w-[280px]"
            >
              <option value="auto">Auto — latest running session</option>
              {(sessions as any[]).map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.target || s.id) + (s.is_running || s.status === "running" ? " · live" : "")}
                </option>
              ))}
            </select>
          )}

          {session && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${running ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                {session.status || "idle"}
              </span>
              {session.mode && <span className="hidden md:inline">mode: {session.mode}</span>}
            </div>
          )}

          {session?.operator && (
            <div
              className="flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full bg-muted/50 border border-border/50"
              title={`Operator: ${session.operator.name}`}
            >
              <UserAvatar name={session.operator.name} avatar={session.operator.avatar} role={session.operator.role} size={26} ring />
              <div className="leading-tight">
                <div className="text-[11px] font-medium truncate max-w-[120px]">{session.operator.name}</div>
                <div className="text-[9px] text-muted-foreground">{session.operator.role_label || session.operator.role}</div>
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!vulnsOpen && (
              <button
                onClick={() => setVulnsOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Vulnerabilities
                {vulns.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${criticalCount > 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    {vulns.length}
                  </span>
                )}
              </button>
            )}
            {!chatOpen && (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Open chat
              </button>
            )}
          </div>
        </div>

        {/* Flow + vuln panel + chat */}
        <div className="flex-1 min-h-0 flex gap-3">
          <AgentFlowStream className="flex-1 min-w-0" sessionId={effectiveId} session={session} />

          {/* Vulnerabilities panel */}
          {vulnsOpen && (
            <div className="w-[240px] shrink-0 flex flex-col node-card !p-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-card/60 shrink-0">
                <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${criticalCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                <span className="text-[10px] font-bold tracking-widest text-muted-foreground flex-1">VULNERABILITIES</span>
                {vulns.length > 0 && (
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${criticalCount > 0 ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    {vulns.length}
                  </span>
                )}
                <button
                  onClick={() => setVulnsOpen(false)}
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>

              {/* Stats row */}
              {vulns.length > 0 && (
                <div className="grid grid-cols-3 gap-px bg-border/30 border-b border-border/30 shrink-0">
                  {[
                    { label: "Critical", value: vulns.filter(v => (v.cvss_score||0) >= 9).length, color: "text-destructive" },
                    { label: "High", value: vulns.filter(v => (v.cvss_score||0) >= 7 && (v.cvss_score||0) < 9).length, color: "text-warning" },
                    { label: "Medium", value: vulns.filter(v => (v.cvss_score||0) >= 4 && (v.cvss_score||0) < 7).length, color: "text-accent" },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col items-center py-2 bg-card/40">
                      <span className={`font-display font-bold text-lg leading-none ${s.value > 0 ? s.color : "text-muted-foreground/40"}`}>{s.value}</span>
                      <span className="text-[8px] text-muted-foreground mt-0.5">{s.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Vuln list */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {vulns.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 px-4 py-8 text-center">
                    <ShieldAlert className="w-6 h-6 text-muted-foreground/30" />
                    <p className="text-[10px] text-muted-foreground italic">
                      {effectiveId ? "No vulnerabilities found yet" : "Select a session to see findings"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {visibleVulns.map((v: any, i: number) => {
                      const cvss = v.cvss_score || 0;
                      return (
                        <div key={i} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/20 transition-colors">
                          <span className={`text-[9px] font-bold font-mono shrink-0 mt-0.5 px-1.5 py-0.5 rounded ${CVSS_BG(cvss)} ${CVSS_COLOR(cvss)}`}>
                            {cvss.toFixed(1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-mono leading-tight truncate text-foreground/90" title={v.title || v.cve}>
                              {v.title || v.cve || "Bilinmeyen"}
                            </div>
                            <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
                              {v.host_ip && <span className="font-mono">{v.host_ip}</span>}
                              {v.exploit_type && <span className="ml-1 opacity-60">· {v.exploit_type}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Show more / less */}
              {vulns.length > 5 && (
                <button
                  onClick={() => setVulnsExpanded((p) => !p)}
                  className="shrink-0 flex items-center justify-center gap-1 py-2 text-[9px] text-muted-foreground hover:text-foreground border-t border-border/30 hover:bg-muted/20 transition-colors"
                >
                  {vulnsExpanded ? <ChevronRight className="w-3 h-3 rotate-[-90deg]" /> : <ChevronDown className="w-3 h-3" />}
                  {vulnsExpanded ? "Show less" : `+${vulns.length - 5} more`}
                </button>
              )}
            </div>
          )}

          {chatOpen && (
            <TirpanChat className="w-[300px] md:w-[360px] lg:w-[400px] shrink-0" onClose={() => setChatOpen(false)} />
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default AgentFlow;
