import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/attack/PageShell";
import { Sparkline } from "@/components/attack/Sparkline";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSystemStats } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AttackGraph } from "@/components/attack/AttackGraph";
import { Donut } from "@/components/attack/Donut";
import { AgentChatPanel } from "@/components/attack/AgentChatPanel";
import { useSessionBundle } from "@/hooks/useAttackGraphData";
import { useSessionContext } from "@/lib/SessionContext";
import { usePermissions } from "@/lib/permissions";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import {
  Activity, Target, Shield, AlertTriangle, Zap, Clock, Cpu, HardDrive, Radio, Play, Pause, Server, Bug, Globe, Wifi, ClipboardList,
} from "lucide-react";

const Overview = () => {
  const navigate = useNavigate();
  const { selectedSessionId, setSelectedSessionId } = useSessionContext();
  const perms = usePermissions();
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const { data: sessions = [], isLoading: sLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  // Assignment toasts — sessions poll every ~5s on Overview
  useAssignmentNotifications(sessions as any[]);

  const resolvedWsSessionId = useMemo(() => {
    const list = sessions as any[];
    if (!list.length) return "";
    if (selectedSessionId) return selectedSessionId;
    const running = list.find((s: any) => s.is_running || s.status === "running");
    return (running?.id || list[0]?.id || "") as string;
  }, [selectedSessionId, sessions]);

  const bundle = useSessionBundle(null, selectedSessionId);
  const { data: sysStats } = useQuery({
    queryKey: ["system-stats"],
    queryFn: getSystemStats,
    refetchInterval: 10000,
  });
  const { lastMessage, send, ready } = useWebSocket();

  // Subscribe to effective session for live events (explicit pick or auto: running → first)
  useEffect(() => {
    if (!ready || !resolvedWsSessionId) return;
    send({ type: "subscribe_session", session_id: resolvedWsSessionId });
    return () => {
      send({ type: "unsubscribe_session", session_id: resolvedWsSessionId });
    };
  }, [ready, resolvedWsSessionId, send]);

  // Rolling live events list (last 6)
  const liveEventsRef = useRef<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([
    { time: "--:--", text: "Waiting for events...", sev: "muted", ts: 0 },
  ]);

  useEffect(() => {
    if (!lastMessage?.type) return;
    const t = lastMessage.type;
    if (t === "ping" || t === "pong" || t === "token" || t === "session_subscribed") return;

    let text = "";
    let sev = "muted";
    if (t === "finding") { text = lastMessage.content || "New finding"; sev = "destructive"; }
    else if (t === "tool_result") { text = `Tool: ${(lastMessage.content || "").slice(0, 50)}`; sev = "warning"; }
    else if (t === "reasoning") { text = `Agent: ${(lastMessage.content || "").slice(0, 50)}`; sev = "accent"; }
    else if (t === "phase_change") { text = `Phase: ${lastMessage.content || ""}`; sev = "accent"; }
    else if (t === "shell_open") { text = "Shell opened"; sev = "warning"; }
    else if (t === "agent_done") { text = "Agent done"; sev = "success"; }
    else { text = `${t}: ${(lastMessage.content || "").slice(0, 40)}`; }

    if (!text) return;
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const entry = { time, text, sev, ts: Date.now() };
    liveEventsRef.current = [entry, ...liveEventsRef.current].slice(0, 6);
    setLiveEvents([...liveEventsRef.current]);
  }, [lastMessage]);

  const stats = useMemo(() => {
    const active = (sessions as any[]).filter((s: any) => s.status === "running").length;
    const hosts = (sessions as any[]).reduce((sum: number, s: any) => sum + (s.hosts_found || 0), 0);
    const vulns = (sessions as any[]).reduce((sum: number, s: any) => sum + (s.vulns_found || 0), 0);
    const exploited = (sessions as any[]).reduce((sum: number, s: any) => sum + (s.exploits_run || 0), 0);
    const total = sessions.length;
    const done = (sessions as any[]).filter((s: any) => s.status === "done").length;
    const successRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avgVulns = total > 0 ? ((sessions as any[]).reduce((sum: number, s: any) => sum + (s.vulns_found || 0), 0) / total).toFixed(1) : "0";
    const avgExploits = total > 0 ? ((sessions as any[]).reduce((sum: number, s: any) => sum + (s.exploits_run || 0), 0) / total).toFixed(1) : "0";
    const durations = (sessions as any[])
      .filter((s: any) => s.finished_at && s.created_at)
      .map((s: any) => s.finished_at - s.created_at);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length / 60) : 0;
    return { active, hosts, vulns, exploited, total, successRate, avgVulns, avgExploits, avgDuration };
  }, [sessions]);

  const severityDist = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    (sessions as any[]).forEach((s: any) => {
      const v = s.vulns_found || 0;
      const e = s.exploits_run || 0;
      if (e > 0 && v > 5) critical++;
      else if (e > 0 || v > 3) high++;
      else if (v > 0) medium++;
      else low++;
    });
    const total = sessions.length || 1;
    return [
      { name: "Critical", count: critical, pct: Math.round((critical / total) * 100), color: "destructive" },
      { name: "High", count: high, pct: Math.round((high / total) * 100), color: "warning" },
      { name: "Medium", count: medium, pct: Math.round((medium / total) * 100), color: "accent" },
      { name: "Low", count: low, pct: Math.round((low / total) * 100), color: "success" },
    ];
  }, [sessions]);

  const activeMissions = useMemo(
    () => (sessions as any[]).filter((s: any) => s.status === "running" || s.status === "paused"),
    [sessions]
  );

  const recentMissions = useMemo(
    () => (sessions as any[])
      .filter((s: any) => s.status === "done" || s.status === "error")
      .sort((a: any, b: any) => (b.finished_at || b.created_at || 0) - (a.finished_at || a.created_at || 0))
      .slice(0, 5),
    [sessions]
  );

  // Sessions assigned to the current user
  const assignedToMe = useMemo(
    () => (sessions as any[]).filter((s: any) => s.assigned_to && s.assigned_to === perms.user?.id),
    [sessions, perms.user]
  );

  const drillHostFromPreview = useCallback(
    (hostIp: string) => {
      if (!hostIp.trim()) return;
      const sid = bundle.sessionId;
      const isDemo = bundle.dynamicGraph?.isDemoMode;
      if (!sid || isDemo) return;
      setSelectedSessionId(sid);
      navigate("/attack-graph", { state: { drillHostIp: hostIp } });
    },
    [bundle.sessionId, bundle.dynamicGraph?.isDemoMode, setSelectedSessionId, navigate]
  );

  // Viewer için sade (read-only) KPI seti — exploit detayları gizli
  const viewerKPIs = [
    { label: "Active Missions", value: String(stats.active), color: "text-accent",   spark: [40, 60, 50, 80, 70, 90, 85] },
    { label: "Hosts Found",     value: String(stats.hosts),  color: "",              spark: [20, 40, 35, 60, 70, 85, 90] },
    { label: "Findings",        value: String(stats.vulns),  color: "text-warning",  spark: [80, 70, 75, 60, 50, 45, 40] },
    { label: "Total Missions",  value: String(stats.total),  color: "text-success",  spark: [50, 65, 70, 80, 85, 90, 95] },
  ];

  return (
    <PageShell
      title="Dashboard"
      subtitle="Mission control &amp; live operations"
      leftPanel={agentPanelOpen ? <AgentChatPanel open={agentPanelOpen} onClose={() => setAgentPanelOpen(false)} /> : undefined}
    >
      <div className="grid grid-cols-12 gap-4 p-1 h-full">

        {/* KPI Row — viewer için exploit içermeyen sade metrikler, diğerleri normal */}
        {perms.isViewer ? (
          viewerKPIs.map((k) => (
            <div key={k.label} className="col-span-3 node-card !p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">{k.label}</div>
              <div className={`font-display font-bold text-4xl ${k.color}`}>{k.value}</div>
              <Sparkline data={k.spark} height={28} />
            </div>
          ))
        ) : (
          <>
            <div className="col-span-3 node-card !p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Active Missions</div>
              <div className="font-display font-bold text-4xl text-accent">{stats.active}</div>
              <Sparkline data={[40, 60, 50, 80, 70, 90, 85]} height={28} />
            </div>
            <div className="col-span-3 node-card !p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Hosts Found</div>
              <div className="font-display font-bold text-4xl">{stats.hosts}</div>
              <Sparkline data={[20, 40, 35, 60, 70, 85, 90]} height={28} />
            </div>
            <div className="col-span-3 node-card !p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Vulnerabilities</div>
              <div className="font-display font-bold text-4xl text-warning">{stats.vulns}</div>
              <Sparkline data={[80, 70, 75, 60, 50, 45, 40]} height={28} />
            </div>
            <div className="col-span-3 node-card !p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Success Rate</div>
              <div className="font-display font-bold text-4xl text-success">{stats.successRate}%</div>
              <Sparkline data={[50, 65, 70, 80, 85, 90, 95]} height={28} />
            </div>
          </>
        )}

        {/* Attack Graph Cutout - Large */}
        <div className="col-span-8 node-card !p-0 overflow-hidden relative" style={{ minHeight: 380 }}>
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-card/80 backdrop-blur px-2 py-1 rounded-full">
              Attack Graph Preview
            </span>
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
          <AttackGraph
            data={bundle.dynamicGraph}
            activeView="topology"
            focusedSessionId={bundle.sessionId}
            onSelectHost={drillHostFromPreview}
            hostSelectHint="Open in Attack Graph →"
          />
        </div>

        {/* System Stats & Live Feed */}
        <div className="col-span-4 flex flex-col gap-4">
          <div className="node-card !p-4">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Zap className="w-3 h-3 text-accent" /> Live Feed
              <span className={`ml-auto w-1.5 h-1.5 rounded-full ${ready ? "bg-success animate-pulse" : "bg-muted"}`} />
            </h4>
            <div className="space-y-2">
              {liveEvents.map((e: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <Clock className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="font-mono text-muted-foreground">{e.time}</div>
                  <div className={`flex-1 border-l-2 pl-2 border-${e.sev} truncate`}>{e.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="node-card !p-4 flex-1">
            <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">System Resources</h4>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> CPU</span>
                  <span className="text-muted-foreground">{sysStats?.cpu ?? "--"}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${Math.min(sysStats?.cpu ?? 0, 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="flex items-center gap-1.5"><HardDrive className="w-3 h-3" /> RAM</span>
                  <span className="text-muted-foreground">{sysStats?.ram_used_gb ?? "--"} / {sysStats?.ram_total_gb ?? "--"} GB</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-warning" style={{ width: `${sysStats ? Math.min((sysStats.ram_used_gb / sysStats.ram_total_gb) * 100, 100) : 0}%` }} />
                </div>
              </div>
              {sysStats?.gpu != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5"><Wifi className="w-3 h-3" /> GPU</span>
                    <span className="text-muted-foreground">{sysStats.gpu}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary opacity-70" style={{ width: `${Math.min(sysStats.gpu, 100)}%` }} />
                  </div>
                </div>
              )}
              <div className="text-[10px] text-muted-foreground pt-1 flex justify-between">
                <span>Tokens: {((sysStats?.tokens ?? 0) / 1000).toFixed(1)}k</span>
                <span>Sessions: {stats.total}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Active Missions */}
        <div className="col-span-8 node-card !p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-display font-bold text-sm">Active Missions</h4>
            <span className="text-[10px] text-muted-foreground">{activeMissions.length} running</span>
          </div>
          {activeMissions.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">No active missions.</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {activeMissions.map((m: any) => {
              const sev = m.vulns_found > 5 ? "destructive" : m.exploits_run > 0 ? "warning" : "success";
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedSessionId(m.id)}
                  className={`border rounded-xl p-3 text-left transition-all ${resolvedWsSessionId === m.id ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium truncate">{m.target || m.id}</div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full bg-${sev}/15 text-${sev} uppercase`}>{m.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
                    <span>{m.hosts_found || 0} hosts</span>
                    <span>{m.vulns_found || 0} vulns</span>
                    <span>{m.exploits_run || 0} exploits</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full bg-${sev}`} style={{ width: `${Math.min((m.vulns_found || 0) * 8, 100)}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Completed Missions */}
        <div className="col-span-4 node-card !p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-display font-bold text-sm">Recent Completions</h4>
          </div>
          {recentMissions.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">No completed missions yet.</div>
          )}
          <div className="space-y-2">
            {recentMissions.map((m: any) => {
              const isDone = m.status === "done";
              const dateStr = m.finished_at
                ? new Date(m.finished_at * 1000).toLocaleDateString()
                : "—";
              return (
                <div key={m.id} className="flex items-center gap-3 text-xs">
                  <span className={`w-2 h-2 rounded-full ${isDone ? "bg-success" : "bg-destructive"}`} />
                  <span className="flex-1 truncate">{m.target || m.id}</span>
                  <span className="text-muted-foreground font-mono">{dateStr}</span>
                  <span className="text-muted-foreground">{m.vulns_found || 0}v</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* My assignments — all roles */}
        <div className="col-span-12 node-card !p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h4 className="font-display font-bold text-sm">My assignments</h4>
            {assignedToMe.length > 0 && (
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                {assignedToMe.length} {assignedToMe.length === 1 ? "mission" : "missions"}
              </span>
            )}
          </div>
          {assignedToMe.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-4">Nothing assigned to you yet.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {assignedToMe.map((m: any) => {
                const statusColor =
                  m.status === "running" ? "success" :
                  m.status === "paused"  ? "warning" :
                  m.status === "error"   ? "destructive" : "muted-foreground";
                return (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedSessionId(m.id); navigate("/missions"); }}
                    className={`border rounded-xl p-3 text-left transition-all hover:border-primary/60 hover:bg-primary/5 ${
                      resolvedWsSessionId === m.id ? "border-primary bg-primary/5" : "border-border/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium truncate flex-1">{m.target || m.id}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full bg-${statusColor}/15 text-${statusColor} uppercase ml-2 shrink-0`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-3">
                      <span>{m.hosts_found || 0} hosts</span>
                      <span>{m.vulns_found || 0} findings</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Analytics: Aggregate KPIs */}
        <div className="col-span-12 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-display font-bold text-base">Analytics Overview</h3>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Missions", value: String(stats.total), icon: Target },
              { label: "Success Rate", value: `${stats.successRate}%`, icon: Shield },
              { label: "Avg Findings", value: stats.avgVulns, icon: Activity },
              { label: "Avg Duration", value: `${stats.avgDuration}m`, icon: Clock },
            ].map((k) => (
              <div key={k.label} className="node-card !p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <k.icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="font-display font-bold text-2xl">{k.value}</div>
                <div className="text-[10px] text-muted-foreground">{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Severity Distribution */}
        <div className="col-span-6 node-card !p-4">
          <h4 className="font-display font-bold text-sm mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Severity Distribution</h4>
          <div className="space-y-3">
            {severityDist.length === 0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
            {severityDist.map((v) => (
              <div key={v.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={`text-${v.color}`}>{v.name}</span>
                  <span className="text-muted-foreground">{v.count} missions</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full bg-${v.color}`} style={{ width: `${v.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Targets */}
        <div className="col-span-6 node-card !p-4">
          <h4 className="font-display font-bold text-sm mb-3 flex items-center gap-2"><Target className="w-4 h-4" /> Top Targets</h4>
          <div className="space-y-2">
            {(sessions as any[])
              .map((s: any) => ({ name: s.target || "Untitled", hosts: s.hosts_found || 0, vulns: s.vulns_found || 0 }))
              .sort((a: any, b: any) => b.hosts - a.hosts)
              .slice(0, 5)
              .length === 0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
            {(sessions as any[])
              .map((s: any) => ({ name: s.target || "Untitled", hosts: s.hosts_found || 0, vulns: s.vulns_found || 0 }))
              .sort((a: any, b: any) => b.hosts - a.hosts)
              .slice(0, 5)
              .map((t: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                    <span className="truncate max-w-[140px]">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {t.hosts}</span>
                    <span className="flex items-center gap-1"><Bug className="w-3 h-3" /> {t.vulns}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default Overview;
