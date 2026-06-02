import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/attack/PageShell";
import { Sparkline } from "@/components/attack/Sparkline";
import { StatCard } from "@/components/attack/StatCard";
import { EmptyState } from "@/components/attack/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession, getSystemStats, getUsageSummary } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AttackGraph } from "@/components/attack/AttackGraph";
import { Donut } from "@/components/attack/Donut";
import { AgentChatPanel } from "@/components/attack/AgentChatPanel";
import { useSessionBundle } from "@/hooks/useAttackGraphData";
import { useSessionContext } from "@/lib/SessionContext";
import { usePermissions } from "@/lib/permissions";
import { useAssignmentNotifications } from "@/hooks/useAssignmentNotifications";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/utils";
import {
  Activity, Target, Shield, AlertTriangle, Zap, Clock, Cpu, HardDrive, Radio, Play, Server, Bug, Globe, Wifi, ClipboardList,
  ChevronDown, ChevronRight, TrendingUp, BarChart3, PieChart, Layers, Timer, Flame, Skull, Network, LockOpen,
  MessageSquare, Settings, Eye, EyeOff, GripVertical, ArrowUp, ArrowDown, RotateCcw, X,
  DollarSign, Coins, Wallet,
} from "lucide-react";

/** Compact token formatter: 2454700 → "2.45M", 1820 → "1.8k". */
function fmtTokens(n: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

type SectionKey =
  | "analytics"
  | "vuln_intel"
  | "exploit_stats"
  | "host_discovery"
  | "mission_perf"
  | "live_feed"
  | "active_missions"
  | "recent_completions"
  | "my_assignments";

interface SectionConfig {
  key: SectionKey;
  title: string;
  defaultOpen: boolean;
  visible: boolean;
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  { key: "analytics", title: "Analytics Overview", defaultOpen: true, visible: true },
  { key: "vuln_intel", title: "Vulnerability Intelligence", defaultOpen: true, visible: true },
  { key: "exploit_stats", title: "Exploit Statistics", defaultOpen: true, visible: true },
  { key: "host_discovery", title: "Host Discovery & Services", defaultOpen: true, visible: true },
  { key: "mission_perf", title: "Mission Performance", defaultOpen: false, visible: true },
  { key: "live_feed", title: "Live Feed & System Resources", defaultOpen: true, visible: true },
  { key: "active_missions", title: "Active Missions", defaultOpen: true, visible: true },
  { key: "recent_completions", title: "Recent Completions", defaultOpen: false, visible: true },
  { key: "my_assignments", title: "My Assignments", defaultOpen: true, visible: true },
];

function getStorageKey(userId: string | undefined) {
  return `tirpan_dashboard_layout_${userId || "anon"}`;
}

function loadLayout(userId: string | undefined): SectionConfig[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const saved: SectionConfig[] = JSON.parse(raw);
      const savedKeys = new Set(saved.map((s) => s.key));
      const merged = DEFAULT_SECTIONS.map((d) => {
        const s = saved.find((x) => x.key === d.key);
        return s ? { ...d, ...s } : { ...d };
      });
      const extra = saved.filter((s) => !savedKeys.has(s.key) && DEFAULT_SECTIONS.every((d) => d.key !== s.key));
      return [...merged, ...extra];
    }
  } catch {}
  return [...DEFAULT_SECTIONS];
}

function saveLayout(userId: string | undefined, sections: SectionConfig[]) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(sections));
  } catch {}
}

const Overview = () => {
  const navigate = useNavigate();
  const { selectedSessionId, setSelectedSessionId } = useSessionContext();
  const perms = usePermissions();
  const { user } = useAuth();
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [graphPanelOpen, setGraphPanelOpen] = useState(false);
  // false = agent-left graph-right | true = graph-left agent-right
  const [swapPanels, setSwapPanels] = useState(() => {
    try { return localStorage.getItem(`tirpan_panel_swap_${user?.id || "anon"}`) === "1"; } catch { return false; }
  });
  const persistSwap = useCallback((v: boolean) => {
    setSwapPanels(v);
    try { localStorage.setItem(`tirpan_panel_swap_${user?.id || "anon"}`, v ? "1" : "0"); } catch {}
  }, [user?.id]);
  const [sections, setSections] = useState<SectionConfig[]>(() => loadLayout(user?.id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Pointer-based drag reorder (replaces native HTML5 drag — no ghost image, animated).
  const [drag, setDrag] = useState<{ from: number; to: number; delta: number } | null>(null);
  const dragMeta = useRef<{ startY: number; centers: number[]; unit: number } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    sections.forEach((s) => { init[s.key] = s.defaultOpen; });
    return init;
  });

  const persistSections = useCallback((next: SectionConfig[]) => {
    setSections(next);
    saveLayout(user?.id, next);
  }, [user?.id]);

  const toggleVisibility = useCallback((key: SectionKey) => {
    const next = sections.map((s) => s.key === key ? { ...s, visible: !s.visible } : s);
    persistSections(next);
  }, [sections, persistSections]);

  const moveSection = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...sections];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistSections(next);
  }, [sections, persistSections]);

  const resetLayout = useCallback(() => {
    persistSections([...DEFAULT_SECTIONS]);
    const init: Record<string, boolean> = {};
    DEFAULT_SECTIONS.forEach((s) => { init[s.key] = s.defaultOpen; });
    setOpenSections(init);
  }, [persistSections]);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Start a pointer drag from a section header. We measure the live geometry of
  // every row once, then translate the active row with the pointer and slide the
  // others out of the way via CSS transitions — a smooth, ghost-image-free reorder.
  const beginDrag = useCallback((index: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rects = sections.map((_, i) => {
      const r = itemRefs.current[i]?.getBoundingClientRect();
      return r ? { top: r.top, height: r.height } : { top: 0, height: 0 };
    });
    const centers = rects.map((r) => r.top + r.height / 2);
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - (rects[0].top + rects[0].height)) : 16;
    dragMeta.current = { startY: e.clientY, centers, unit: rects[index].height + gap };
    setDrag({ from: index, to: index, delta: 0 });
  }, [sections]);

  useEffect(() => {
    if (!drag) return;
    const from = drag.from;
    const onMove = (e: PointerEvent) => {
      const m = dragMeta.current;
      if (!m) return;
      const delta = e.clientY - m.startY;
      const activeCenter = m.centers[from] + delta;
      let to = 0;
      m.centers.forEach((c, i) => { if (i !== from && c < activeCenter) to++; });
      setDrag((d) => (d ? { ...d, delta, to } : d));
    };
    const onUp = () => {
      setDrag((d) => {
        if (d && d.from !== d.to) moveSection(d.from, d.to);
        return null;
      });
      dragMeta.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag?.from, moveSection]);

  const itemStyle = useCallback((i: number): React.CSSProperties => {
    if (!drag) return {};
    if (i === drag.from) {
      return {
        transform: `translateY(${drag.delta}px) scale(1.015)`,
        transition: "none",
        position: "relative",
        zIndex: 50,
        cursor: "grabbing",
        boxShadow: "0 12px 32px -8px hsl(var(--primary) / 0.35)",
      };
    }
    const unit = dragMeta.current?.unit ?? 0;
    let shift = 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = -unit;
    else if (drag.from > drag.to && i >= drag.to && i < drag.from) shift = unit;
    return {
      transform: `translateY(${shift}px)`,
      transition: "transform 220ms cubic-bezier(0.2, 0, 0, 1)",
      position: "relative",
      zIndex: 1,
    };
  }, [drag]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  // The /sessions list only carries summary counts — the nested vulnerabilities,
  // scan_results and exploit_results arrays live on the per-session detail
  // endpoint. Fetch those so the Vulnerability / Exploit / Host-Discovery panels
  // actually have data to render instead of showing "No data" forever.
  const sessionIdsKey = useMemo(() => (sessions as any[]).map((s: any) => s.id).join(","), [sessions]);
  const { data: detailedSessions = [], isLoading: detailsLoading } = useQuery({
    queryKey: ["sessions-detail-aggregate", sessionIdsKey],
    queryFn: async () => {
      const results = await Promise.all(
        (sessions as any[]).map((s: any) => getSession(s.id).catch(() => null)),
      );
      return results.filter(Boolean) as any[];
    },
    enabled: (sessions as any[]).length > 0,
    refetchInterval: 8000,
  });

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
  const { data: usage } = useQuery({
    queryKey: ["usage-summary"],
    queryFn: () => getUsageSummary("month"),
    refetchInterval: 5000,
  });
  const { lastMessage, send, ready } = useWebSocket();

  useEffect(() => {
    if (!ready || !resolvedWsSessionId) return;
    send({ type: "subscribe_session", session_id: resolvedWsSessionId });
    return () => { send({ type: "unsubscribe_session", session_id: resolvedWsSessionId }); };
  }, [ready, resolvedWsSessionId, send]);

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
    liveEventsRef.current = [entry, ...liveEventsRef.current].slice(0, 10);
    setLiveEvents([...liveEventsRef.current]);
  }, [lastMessage]);

  const stats = useMemo(() => {
    // Summary counts come from the lightweight /sessions list (always present).
    const arr = sessions as any[];
    const active = arr.filter((s: any) => s.status === "running").length;
    const paused = arr.filter((s: any) => s.status === "paused").length;
    const hosts = arr.reduce((sum: number, s: any) => sum + (s.hosts_found || 0), 0);
    const vulns = arr.reduce((sum: number, s: any) => sum + (s.vulns_found || 0), 0);
    const exploited = arr.reduce((sum: number, s: any) => sum + (s.exploits_run || 0), 0);
    const total = arr.length;
    const done = arr.filter((s: any) => s.status === "done").length;
    const errors = arr.filter((s: any) => s.status === "error").length;
    const successRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avgVulns = total > 0 ? (vulns / total).toFixed(1) : "0";
    const avgExploits = total > 0 ? (exploited / total).toFixed(1) : "0";
    const durations = arr.filter((s: any) => s.finished_at && s.created_at).map((s: any) => s.finished_at - s.created_at);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length / 60) : 0;
    const maxDuration = durations.length > 0 ? Math.round(Math.max(...durations) / 60) : 0;
    const minDuration = durations.length > 0 ? Math.round(Math.min(...durations) / 60) : 0;
    const sessionsByStatus: Record<string, number> = {};
    arr.forEach((s: any) => { sessionsByStatus[s.status || "unknown"] = (sessionsByStatus[s.status || "unknown"] || 0) + 1; });

    // Deep analytics need the per-session detail payloads (nested arrays).
    const det = detailedSessions as any[];
    const allVulns: any[] = [];
    det.forEach((s: any) => { if (Array.isArray(s.vulnerabilities)) allVulns.push(...s.vulnerabilities); });
    const vulnByType: Record<string, number> = {};
    const topCves: { cve: string; title: string; cvss: number; host: string }[] = [];
    allVulns.forEach((v: any) => {
      const t = v.exploit_type || v.category || "other";
      vulnByType[t] = (vulnByType[t] || 0) + 1;
      if (v.cve || v.cvss_score >= 7) topCves.push({ cve: v.cve || "N/A", title: v.title || "Untitled", cvss: v.cvss_score || 0, host: v.host_ip || "?" });
    });
    topCves.sort((a, b) => b.cvss - a.cvss);
    const criticalVulns = allVulns.filter((v: any) => v.cvss_score >= 9).length;
    const highVulns = allVulns.filter((v: any) => v.cvss_score >= 7 && v.cvss_score < 9).length;
    const medVulns = allVulns.filter((v: any) => v.cvss_score >= 4 && v.cvss_score < 7).length;
    const lowVulns = allVulns.filter((v: any) => v.cvss_score < 4).length;
    // Fall back to the summary count while details are still loading so the
    // donuts / ratios have a sensible denominator.
    const totalFindings = allVulns.length || vulns;

    const allExploits: any[] = [];
    det.forEach((s: any) => { if (Array.isArray(s.exploit_results)) allExploits.push(...s.exploit_results); });
    const successfulExploits = allExploits.filter((e: any) => e.success).length;
    const exploitSuccessRate = allExploits.length > 0 ? Math.round((successfulExploits / allExploits.length) * 100) : 0;
    const totalExploits = allExploits.length || exploited;
    const exploitRate = totalFindings > 0 ? Math.round((totalExploits / totalFindings) * 100) : 0;
    const exploitByType: Record<string, { total: number; success: number }> = {};
    allExploits.forEach((e: any) => {
      const mod = (e.module || "unknown").split("/").filter(Boolean)[1] || e.module || "other";
      if (!exploitByType[mod]) exploitByType[mod] = { total: 0, success: 0 };
      exploitByType[mod].total++;
      if (e.success) exploitByType[mod].success++;
    });

    const allHosts: any[] = [];
    det.forEach((s: any) => { if (Array.isArray(s.scan_results)) s.scan_results.forEach((sr: any) => { if (Array.isArray(sr.hosts)) allHosts.push(...sr.hosts); }); });
    const osDist: Record<string, number> = {};
    const svcDist: Record<string, number> = {};
    let totalOpenPorts = 0;
    allHosts.forEach((h: any) => {
      const os = h.os_type || h.os || "Unknown";
      osDist[os] = (osDist[os] || 0) + 1;
      if (Array.isArray(h.ports)) h.ports.forEach((p: any) => { if (p.state === "open") { totalOpenPorts++; svcDist[p.service || "unknown"] = (svcDist[p.service || "unknown"] || 0) + 1; } });
    });
    const topServices = Object.entries(svcDist).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const osEntries = Object.entries(osDist).sort((a, b) => b[1] - a[1]);
    const hostsScanned = allHosts.length || hosts;

    return { active, paused, hosts, vulns, exploited, total, done, errors, successRate, avgVulns, avgExploits, avgDuration, maxDuration, minDuration, totalFindings, totalExploits, exploitRate, criticalVulns, highVulns, medVulns, lowVulns, vulnByType, topCves: topCves.slice(0, 10), exploitSuccessRate, exploitByType, allExploits: allExploits.length, osEntries, topServices, totalOpenPorts, hostsScanned, sessionsByStatus };
  }, [sessions, detailedSessions]);

  // Real trend series for the headline sparklines, derived from session history
  // (chronological) instead of the previous hard-coded placeholder arrays.
  const sparks = useMemo(() => {
    const ordered = [...(sessions as any[])].sort((a: any, b: any) => (a.created_at || 0) - (b.created_at || 0));
    if (ordered.length < 2) return null;
    let cM = 0, cH = 0, cV = 0, cE = 0;
    const missions: number[] = [], hosts: number[] = [], vulns: number[] = [], exploits: number[] = [];
    const findings: number[] = [], success: number[] = [], durations: number[] = [];
    const doneCum: number[] = [], errorCum: number[] = [];
    let doneSoFar = 0, errSoFar = 0;
    ordered.forEach((s: any, i: number) => {
      cM += 1; cH += s.hosts_found || 0; cV += s.vulns_found || 0; cE += s.exploits_run || 0;
      missions.push(cM); hosts.push(cH); vulns.push(cV); exploits.push(cE);
      findings.push(s.vulns_found || 0);
      if (s.status === "done") doneSoFar += 1;
      if (s.status === "error") errSoFar += 1;
      doneCum.push(doneSoFar); errorCum.push(errSoFar);
      success.push(Math.round((doneSoFar / (i + 1)) * 100));
      if (s.finished_at && s.created_at) durations.push(Math.round((s.finished_at - s.created_at) / 60));
    });
    const tail = (a: number[]) => a.slice(-8);
    return {
      missions: tail(missions), hosts: tail(hosts), vulns: tail(vulns), exploits: tail(exploits),
      findings: tail(findings), success: tail(success),
      done: tail(doneCum), errors: tail(errorCum),
      durations: durations.length >= 2 ? tail(durations) : undefined,
    };
  }, [sessions]);

  const severityDist = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    (sessions as any[]).forEach((s: any) => {
      const v = s.vulns_found || 0, e = s.exploits_run || 0;
      if (e > 0 && v > 5) critical++; else if (e > 0 || v > 3) high++; else if (v > 0) medium++; else low++;
    });
    const total = sessions.length || 1;
    return [
      { name: "Critical", count: critical, pct: Math.round((critical / total) * 100), color: "destructive" },
      { name: "High", count: high, pct: Math.round((high / total) * 100), color: "warning" },
      { name: "Medium", count: medium, pct: Math.round((medium / total) * 100), color: "accent" },
      { name: "Low", count: low, pct: Math.round((low / total) * 100), color: "success" },
    ];
  }, [sessions]);

  const topTargets = useMemo(
    () =>
      (sessions as any[])
        .map((s: any) => ({ id: s.id, name: s.target || s.name || "Untitled", hosts: s.hosts_found || 0, vulns: s.vulns_found || 0 }))
        .sort((a: any, b: any) => b.hosts - a.hosts || b.vulns - a.vulns)
        .slice(0, 5),
    [sessions],
  );

  const activeMissions = useMemo(() => (sessions as any[]).filter((s: any) => s.status === "running" || s.status === "paused"), [sessions]);
  const recentMissions = useMemo(() => (sessions as any[]).filter((s: any) => s.status === "done" || s.status === "error").sort((a: any, b: any) => (b.finished_at || b.created_at || 0) - (a.finished_at || a.created_at || 0)).slice(0, 8), [sessions]);
  const assignedToMe = useMemo(() => (sessions as any[]).filter((s: any) => s.assigned_to && s.assigned_to === perms.user?.id), [sessions, perms.user]);

  const drillHostFromPreview = useCallback((hostIp: string) => {
    if (!hostIp.trim()) return;
    const sid = bundle.sessionId;
    if (!sid || bundle.dynamicGraph?.isDemoMode) return;
    setSelectedSessionId(sid);
    navigate("/attack-graph", { state: { drillHostIp: hostIp } });
  }, [bundle.sessionId, bundle.dynamicGraph?.isDemoMode, setSelectedSessionId, navigate]);

  const vulnTypeColors: Record<string, string> = { rce: "text-destructive", privesc: "text-warning", auth_bypass: "text-accent", exposure: "text-muted-foreground", info_disclosure: "text-primary", relay: "text-success", other: "text-muted-foreground" };

  const sectionContent: Record<SectionKey, React.ReactNode> = {
    analytics: (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Target} label="Total Missions" value={stats.total} accent="primary" spark={sparks?.missions} hint="All engagements" onClick={() => navigate("/missions")} />
            <StatCard icon={Play} label="Active" value={stats.active} accent="accent" sublabel={`${stats.paused} paused`} hint="Running missions" onClick={() => navigate("/missions")} />
            <StatCard icon={Server} label="Hosts Found" value={stats.hosts} accent="primary" spark={sparks?.hosts} hint="Discovered hosts" onClick={() => navigate("/hosts")} />
            <StatCard icon={Bug} label="Vulnerabilities" value={stats.vulns} accent="warning" spark={sparks?.vulns} hint="Total findings" onClick={() => navigate("/findings")} />
            <StatCard icon={Flame} label="Exploits Run" value={stats.exploited} accent="destructive" spark={sparks?.exploits} hint="Exploit attempts" onClick={() => navigate("/exploits")} />
            <StatCard icon={Shield} label="Success Rate" value={`${stats.successRate}%`} accent="success" progress={stats.successRate} spark={sparks?.success} hint="Completed / total" />
            <StatCard icon={BarChart3} label="Avg Findings" value={stats.avgVulns} accent="primary" spark={sparks?.findings} hint="Per mission" />
            <StatCard icon={Timer} label="Avg Duration" value={`${stats.avgDuration}m`} accent="muted" spark={sparks?.durations} hint="Mean runtime" />
            <StatCard icon={DollarSign} label="Total Cost" value={`$${(usage?.cost_usd ?? 0).toFixed(2)}`} accent="success" sublabel={usage?.is_estimated ? "~estimated" : "this month"} hint="LLM spend this month" />
            <StatCard icon={Coins} label="Total Tokens" value={fmtTokens(usage?.total_tokens ?? 0)} accent="primary" sublabel="this month" hint="Prompt + completion tokens" />
            <StatCard icon={Wallet} label="Avg $ / Mission" value={`$${(usage?.avg_cost_per_mission ?? 0).toFixed(2)}`} accent="accent" sublabel={`${usage?.missions ?? 0} missions`} hint="Mean cost per mission" />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4">
          <h4 className="font-display font-bold text-sm mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Severity Distribution</h4>
          {stats.total === 0 ? (
            <EmptyState icon={Shield} title="No missions yet" hint="Launch a scan to see severity breakdowns here." compact />
          ) : (
            <div className="space-y-3">
              {severityDist.map((v) => (<div key={v.name}><div className="flex justify-between text-xs mb-1"><span className={`text-${v.color}`}>{v.name}</span><span className="text-muted-foreground">{v.count} sessions</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full bg-${v.color}`} style={{ width: `${v.pct}%` }} /></div></div>))}
            </div>
          )}
        </div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4">
          <h4 className="font-display font-bold text-sm mb-3 flex items-center gap-2"><Target className="w-4 h-4" /> Top Targets</h4>
          {topTargets.length === 0 ? (
            <EmptyState icon={Target} title="No targets yet" hint="Discovered targets ranked by host count will appear here." compact />
          ) : (
            <div className="space-y-2">
              {topTargets.map((t: any, i: number) => (
                <button key={t.id || i} onClick={() => { if (t.id) setSelectedSessionId(t.id); navigate("/hosts"); }} className="w-full flex items-center justify-between p-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-xs text-left"><div className="flex items-center gap-3 min-w-0"><span className="w-5 h-5 shrink-0 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">{i + 1}</span><span className="truncate">{t.name}</span></div><div className="flex items-center gap-4 text-muted-foreground shrink-0"><span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {t.hosts}</span><span className="flex items-center gap-1"><Bug className="w-3 h-3" /> {t.vulns}</span></div></button>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-12 node-card !p-4">
          <h4 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Spend by Model
            {usage?.is_estimated && <span className="text-[10px] font-normal text-muted-foreground">(~estimated)</span>}
          </h4>
          {(!usage?.by_model || usage.by_model.length === 0) ? (
            <EmptyState icon={DollarSign} title="No LLM usage yet" hint="Run a mission to see per-model token spend here." compact />
          ) : (
            <div className="space-y-2">
              {(() => {
                const maxCost = Math.max(...usage.by_model.map((x: any) => x.cost_usd || 0), 0.0001);
                return usage.by_model.map((m: any) => {
                  const tokens = (m.prompt_tokens || 0) + (m.completion_tokens || 0);
                  const pct = ((m.cost_usd || 0) / maxCost) * 100;
                  return (
                    <div key={`${m.model}-${m.provider}`}>
                      <div className="flex justify-between text-xs mb-1 gap-2">
                        <span className="truncate font-mono">{m.model}<span className="text-muted-foreground"> · {m.provider}</span></span>
                        <span className="text-muted-foreground shrink-0">${(m.cost_usd || 0).toFixed(4)} · {fmtTokens(tokens)} tok</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-success" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    ),
    vuln_intel: (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6 md:col-span-3 node-card !p-4 flex flex-col items-center justify-center text-center"><Donut value={stats.criticalVulns} max={Math.max(stats.totalFindings, 1)} label={String(stats.criticalVulns)} sublabel="Critical" color="hsl(var(--destructive))" /><div className="text-[9px] text-destructive uppercase tracking-wider mt-2">CVSS 9.0+</div></div>
        <div className="col-span-6 md:col-span-3 node-card !p-4 flex flex-col items-center justify-center text-center"><Donut value={stats.highVulns} max={Math.max(stats.totalFindings, 1)} label={String(stats.highVulns)} sublabel="High" color="hsl(var(--warning))" /><div className="text-[9px] text-warning uppercase tracking-wider mt-2">CVSS 7.0-8.9</div></div>
        <div className="col-span-6 md:col-span-3 node-card !p-4 flex flex-col items-center justify-center text-center"><Donut value={stats.medVulns} max={Math.max(stats.totalFindings, 1)} label={String(stats.medVulns)} sublabel="Medium" color="hsl(var(--accent))" /><div className="text-[9px] text-accent uppercase tracking-wider mt-2">CVSS 4.0-6.9</div></div>
        <div className="col-span-6 md:col-span-3 node-card !p-4 flex flex-col items-center justify-center text-center"><Donut value={stats.lowVulns} max={Math.max(stats.totalFindings, 1)} label={String(stats.lowVulns)} sublabel="Low" color="hsl(var(--success))" /><div className="text-[9px] text-success uppercase tracking-wider mt-2">CVSS 0.0-3.9</div></div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4">
          <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Layers className="w-3 h-3" /> Vulnerability Types</h5>
          {Object.keys(stats.vulnByType).length === 0 ? (
            <div className="text-muted-foreground text-xs text-center py-4">{detailsLoading ? "Aggregating session details…" : "No data"}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(stats.vulnByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                const pct = stats.totalFindings > 0 ? Math.min(Math.round((count / stats.totalFindings) * 100), 100) : 0;
                const colorCls = vulnTypeColors[type] || "text-foreground";
                const bgCls = colorCls.replace("text-", "bg-");
                const borderCls = colorCls.replace("text-", "border-");
                return (
                  <div key={type} className={`flex flex-col gap-2 p-3 rounded-xl border ${borderCls}/30 bg-card/50`}>
                    <div className="flex items-start justify-between gap-1">
                      <span className={`text-[10px] font-semibold capitalize leading-tight ${colorCls}`}>{type.replace(/_/g, " ")}</span>
                      <span className={`text-base font-display font-bold leading-none ${colorCls}`}>{count}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div className={`h-full rounded-full ${bgCls}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4"><h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Skull className="w-3 h-3" /> Top CVEs by Severity</h5><div className="space-y-1.5">{stats.topCves.length === 0 && <div className="text-muted-foreground text-xs text-center py-2">{detailsLoading ? "Aggregating session details…" : "No CVEs"}</div>}{stats.topCves.map((c, i) => (<div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/15"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${c.cvss >= 9 ? "bg-destructive/15 text-destructive" : c.cvss >= 7 ? "bg-warning/15 text-warning" : "bg-accent/15 text-accent"}`}>{c.cvss.toFixed(1)}</span><span className="font-mono text-[10px] text-muted-foreground w-20 shrink-0">{c.cve}</span><span className="flex-1 truncate">{c.title}</span><span className="text-muted-foreground shrink-0">{c.host}</span></div>))}</div></div>
      </div>
    ),
    exploit_stats: (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-4 node-card !p-4 text-center"><div className="font-display font-bold text-3xl text-destructive">{stats.allExploits}</div><div className="text-[10px] text-muted-foreground mt-1">Total Exploits Attempted</div><div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-destructive" style={{ width: "100%" }} /></div></div>
        <div className="col-span-12 sm:col-span-4 node-card !p-4 text-center"><div className="font-display font-bold text-3xl text-success">{stats.exploitSuccessRate}%</div><div className="text-[10px] text-muted-foreground mt-1">Exploit Success Rate</div><div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-success" style={{ width: `${stats.exploitSuccessRate}%` }} /></div></div>
        <div className="col-span-12 sm:col-span-4 node-card !p-4 text-center"><div className="font-display font-bold text-3xl">{stats.exploitRate}%</div><div className="text-[10px] text-muted-foreground mt-1">Finding to Exploit Ratio</div><div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-accent" style={{ width: `${stats.exploitRate}%` }} /></div></div>
        <div className="col-span-12 node-card !p-4"><h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><LockOpen className="w-3 h-3" /> Exploit Modules Breakdown</h5><div className="space-y-2">{Object.entries(stats.exploitByType).sort((a, b) => b[1].total - a[1].total).map(([mod, data]) => { const rate = data.total > 0 ? Math.round((data.success / data.total) * 100) : 0; return (<div key={mod} className="flex items-center gap-3 text-xs p-2 rounded-lg bg-muted/15"><span className="font-mono text-[10px] w-40 truncate shrink-0">{mod}</span><div className="flex-1 flex items-center gap-2"><div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-success" style={{ width: `${rate}%` }} /></div><span className="text-success w-8 text-right shrink-0">{rate}%</span></div><span className="text-muted-foreground shrink-0">{data.success}/{data.total}</span></div>); })}{Object.keys(stats.exploitByType).length === 0 && <div className="text-muted-foreground text-xs text-center py-2">{detailsLoading ? "Aggregating session details…" : "No exploit data"}</div>}</div></div>
      </div>
    ),
    host_discovery: (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 node-card !p-4"><h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><PieChart className="w-3 h-3" /> OS Distribution</h5><div className="space-y-2">{stats.osEntries.length === 0 && <div className="text-muted-foreground text-xs text-center py-2">{detailsLoading ? "Aggregating session details…" : "No host data"}</div>}{stats.osEntries.map(([os, count]) => { const pct = stats.hostsScanned > 0 ? Math.round((count / stats.hostsScanned) * 100) : 0; return (<div key={os} className="flex items-center gap-3 text-xs"><span className="w-24 truncate">{os}</span><div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} /></div><span className="text-muted-foreground shrink-0">{count}</span></div>); })}</div></div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4"><h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5"><Server className="w-3 h-3" /> Top Services</h5><div className="space-y-2">{stats.topServices.length === 0 && <div className="text-muted-foreground text-xs text-center py-2">{detailsLoading ? "Aggregating session details…" : "No service data"}</div>}{stats.topServices.map(([svc, count]) => (<div key={svc} className="flex items-center gap-3 text-xs"><span className="font-mono text-[10px] w-16 shrink-0">{svc}</span><div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${Math.min((count / stats.totalOpenPorts) * 100, 100)}%` }} /></div><span className="text-muted-foreground shrink-0">{count}</span></div>))}</div></div>
      </div>
    ),
    mission_perf: (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-4 node-card !p-4 text-center"><div className="font-display font-bold text-3xl text-success">{stats.done}</div><div className="text-[10px] text-muted-foreground mt-1">Completed</div>{sparks?.done && <Sparkline data={sparks.done} height={20} color="hsl(var(--success))" />}</div>
        <div className="col-span-12 sm:col-span-4 node-card !p-4 text-center"><div className="font-display font-bold text-3xl text-destructive">{stats.errors}</div><div className="text-[10px] text-muted-foreground mt-1">Failed</div>{sparks?.errors && <Sparkline data={sparks.errors} height={20} color="hsl(var(--destructive))" />}</div>
        <div className="col-span-12 sm:col-span-4 node-card !p-4 text-center"><div className="font-display font-bold text-3xl">{stats.avgDuration}m</div><div className="text-[10px] text-muted-foreground mt-1">Avg Duration</div>{sparks?.durations && <Sparkline data={sparks.durations} height={20} color="hsl(var(--muted-foreground))" />}</div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4"><h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Duration Stats</h5><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Average</span><span className="font-mono">{stats.avgDuration} min</span></div><div className="flex justify-between"><span className="text-muted-foreground">Minimum</span><span className="font-mono">{stats.minDuration} min</span></div><div className="flex justify-between"><span className="text-muted-foreground">Maximum</span><span className="font-mono">{stats.maxDuration} min</span></div><div className="flex justify-between"><span className="text-muted-foreground">Avg Vulns / Session</span><span className="font-mono">{stats.avgVulns}</span></div><div className="flex justify-between"><span className="text-muted-foreground">Avg Exploits / Session</span><span className="font-mono">{stats.avgExploits}</span></div></div></div>
        <div className="col-span-12 lg:col-span-6 node-card !p-4"><h5 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Session Status Breakdown</h5><div className="space-y-2">{Object.entries(stats.sessionsByStatus).map(([status, count]) => { const colors: Record<string, string> = { running: "text-accent", done: "text-success", paused: "text-warning", error: "text-destructive", queued: "text-muted-foreground" }; const bgColors: Record<string, string> = { running: "bg-accent", done: "bg-success", paused: "bg-warning", error: "bg-destructive", queued: "bg-muted" }; return (<div key={status} className="flex items-center gap-3 text-xs"><span className={`capitalize ${colors[status] || "text-foreground"}`}>{status}</span><div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full ${bgColors[status] || "bg-primary"}`} style={{ width: `${stats.total > 0 ? (count / stats.total) * 100 : 0}%` }} /></div><span className="text-muted-foreground shrink-0">{count}</span></div>); })}</div></div>
      </div>
    ),
    live_feed: (
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 node-card !p-4"><h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Live Events</h4><div className="space-y-2">{liveEvents.map((e: any, i: number) => (<div key={i} className="flex items-start gap-2 text-[11px]"><Clock className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" /><div className="font-mono text-muted-foreground">{e.time}</div><div className={`flex-1 border-l-2 pl-2 border-${e.sev} truncate`}>{e.text}</div></div>))}</div></div>
        <div className="col-span-12 lg:col-span-5 node-card !p-4"><h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">System Resources</h4><div className="space-y-3"><div><div className="flex justify-between text-xs mb-1"><span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> CPU</span><span className="text-muted-foreground">{sysStats?.cpu ?? "--"}%</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-accent" style={{ width: `${Math.min(sysStats?.cpu ?? 0, 100)}%` }} /></div></div><div><div className="flex justify-between text-xs mb-1"><span className="flex items-center gap-1.5"><HardDrive className="w-3 h-3" /> RAM</span><span className="text-muted-foreground">{sysStats?.ram_used_gb ?? "--"} / {sysStats?.ram_total_gb ?? "--"} GB</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-warning" style={{ width: `${sysStats ? Math.min((sysStats.ram_used_gb / sysStats.ram_total_gb) * 100, 100) : 0}%` }} /></div></div>{sysStats?.gpu != null && (<div><div className="flex justify-between text-xs mb-1"><span className="flex items-center gap-1.5"><Wifi className="w-3 h-3" /> GPU</span><span className="text-muted-foreground">{sysStats.gpu}%</span></div><div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary opacity-70" style={{ width: `${Math.min(sysStats.gpu, 100)}%` }} /></div></div>)}<div className="text-[10px] text-muted-foreground pt-1 flex justify-between"><span>Tokens: {((sysStats?.tokens ?? 0) / 1000).toFixed(1)}k</span><span>Sessions: {stats.total}</span></div></div></div>
      </div>
    ),
    active_missions: (
      <div className="col-span-12">
        {activeMissions.length === 0 && <div className="text-xs text-muted-foreground text-center py-4 node-card">No active missions.</div>}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {activeMissions.map((m: any) => { const sev = m.vulns_found > 5 ? "destructive" : m.exploits_run > 0 ? "warning" : "success"; return (<button key={m.id} onClick={() => setSelectedSessionId(m.id)} className={`border rounded-xl p-3 text-left transition-all ${resolvedWsSessionId === m.id ? "border-primary bg-primary/5" : "border-border/40 hover:border-border"}`}><div className="flex items-center justify-between mb-2"><div className="text-xs font-medium truncate">{m.target || m.id}</div><span className={`text-[9px] px-2 py-0.5 rounded-full bg-${sev}/15 text-${sev} uppercase`}>{m.status}</span></div><div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2"><span>{m.hosts_found || 0} hosts</span><span>{m.vulns_found || 0} vulns</span><span>{m.exploits_run || 0} exploits</span></div><div className="h-1 rounded-full bg-muted overflow-hidden"><div className={`h-full bg-${sev}`} style={{ width: `${Math.min((m.vulns_found || 0) * 8, 100)}%` }} /></div></button>); })}
        </div>
      </div>
    ),
    recent_completions: (
      <div className="col-span-12 node-card !p-4">
        {recentMissions.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No completed missions yet.</div>}
        <div className="space-y-2">
          {recentMissions.map((m: any) => { const isDone = m.status === "done"; const dateStr = m.finished_at ? new Date(m.finished_at * 1000).toLocaleDateString() : "--"; const dur = m.finished_at && m.created_at ? Math.round((m.finished_at - m.created_at) / 60) : 0; return (<div key={m.id} className="flex items-center gap-3 text-xs p-2 rounded-lg hover:bg-muted/10 transition-colors"><span className={`w-2 h-2 rounded-full shrink-0 ${isDone ? "bg-success" : "bg-destructive"}`} /><span className="flex-1 truncate font-medium">{m.target || m.id}</span><span className="text-muted-foreground shrink-0">{m.vulns_found || 0}v</span><span className="text-muted-foreground shrink-0">{m.exploits_run || 0}e</span><span className="text-muted-foreground shrink-0">{dur}m</span><span className="text-muted-foreground font-mono shrink-0">{dateStr}</span></div>); })}
        </div>
      </div>
    ),
    my_assignments: (
      <div className="col-span-12">
        {assignedToMe.length === 0 ? <div className="text-xs text-muted-foreground text-center py-4 node-card">Nothing assigned to you yet.</div> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {assignedToMe.map((m: any) => { const statusColor = m.status === "running" ? "success" : m.status === "paused" ? "warning" : m.status === "error" ? "destructive" : "muted-foreground"; return (<button key={m.id} onClick={() => { setSelectedSessionId(m.id); navigate("/missions"); }} className={`border rounded-xl p-3 text-left transition-all hover:border-primary/60 hover:bg-primary/5 ${resolvedWsSessionId === m.id ? "border-primary bg-primary/5" : "border-border/40"}`}><div className="flex items-center justify-between mb-1.5"><span className="text-xs font-medium truncate flex-1">{m.target || m.id}</span><span className={`text-[9px] px-2 py-0.5 rounded-full bg-${statusColor}/15 text-${statusColor} uppercase ml-2 shrink-0`}>{m.status}</span></div><div className="text-[10px] text-muted-foreground flex items-center gap-3"><span>{m.hosts_found || 0} hosts</span><span>{m.vulns_found || 0} findings</span></div></button>); })}
          </div>
        )}
      </div>
    ),
  };

  const sectionMeta: Record<SectionKey, { icon: React.ReactNode; badge?: React.ReactNode }> = {
    analytics: { icon: <Activity className="w-4 h-4 text-accent" /> },
    vuln_intel: { icon: <AlertTriangle className="w-4 h-4 text-warning" />, badge: <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning font-semibold ml-2">{stats.totalFindings} total</span> },
    exploit_stats: { icon: <Flame className="w-4 h-4 text-destructive" />, badge: <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive font-semibold ml-2">{stats.exploitSuccessRate}% success</span> },
    host_discovery: { icon: <Network className="w-4 h-4 text-primary" />, badge: <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold ml-2">{stats.totalOpenPorts} open ports</span> },
    mission_perf: { icon: <TrendingUp className="w-4 h-4 text-success" />, badge: <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold ml-2">{stats.successRate}% success</span> },
    live_feed: { icon: <Zap className="w-4 h-4 text-accent" />, badge: <span className={`ml-2 w-1.5 h-1.5 rounded-full ${ready ? "bg-success animate-pulse" : "bg-muted"}`} /> },
    active_missions: { icon: <Play className="w-4 h-4 text-accent" />, badge: <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold ml-2">{activeMissions.length} running</span> },
    recent_completions: { icon: <Shield className="w-4 h-4" /> },
    my_assignments: { icon: <ClipboardList className="w-4 h-4 text-primary" />, badge: assignedToMe.length > 0 ? <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">{assignedToMe.length}</span> : undefined },
  };

  const visibleSections = sections.filter((s) => s.visible);

  const dashGraphPanel = (
    <div className="w-[440px] max-w-[42vw] h-full flex flex-col node-card !p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-accent" />
          <span className="font-display font-bold text-sm">Attack Graph</span>
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />Live</span>
        </div>
        <button onClick={() => setGraphPanelOpen(false)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted text-muted-foreground" title="Close Attack Graph"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex-1 min-h-0 relative">
        <AttackGraph data={bundle.dynamicGraph} activeView="topology" focusedSessionId={bundle.sessionId} onSelectHost={drillHostFromPreview} hostSelectHint="Open in Attack Graph" />
      </div>
    </div>
  );

  const agentPanel = agentPanelOpen
    ? <AgentChatPanel open={agentPanelOpen} onClose={() => setAgentPanelOpen(false)} />
    : undefined;
  const graphPanel = graphPanelOpen ? dashGraphPanel : undefined;

  return (
    <PageShell
      title="Dashboard"
      subtitle="Mission control & live operations"
      leftPanel={swapPanels ? graphPanel : agentPanel}
      rightPanel={swapPanels ? agentPanel : graphPanel}
    >

      {/* Inline customize banner — panel controls + done/reset */}
      {settingsOpen && (
        <div className="mb-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <span className="text-[10px] uppercase tracking-widest text-primary font-bold shrink-0 flex items-center gap-1.5"><Settings className="w-3 h-3" /> Customize Mode</span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">Drag section headers to reorder · toggle eye to show/hide</span>
          {/* Panel position controls */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-muted-foreground">Panels:</span>
            <button
              onClick={() => persistSwap(!swapPanels)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted text-xs transition-colors"
              title="Swap Agent Feed and Attack Graph sides"
            >
              <MessageSquare className="w-3 h-3 text-primary" />
              <span className="text-[10px]">{swapPanels ? "Right" : "Left"}</span>
              <span className="text-muted-foreground">⇄</span>
              <Radio className="w-3 h-3 text-accent" />
              <span className="text-[10px]">{swapPanels ? "Left" : "Right"}</span>
            </button>
          </div>
          <button
            onClick={resetLayout}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={() => setSettingsOpen(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            Done
          </button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAgentPanelOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${agentPanelOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            title={agentPanelOpen ? "Hide Agent Feed" : "Show Agent Feed"}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Agent Feed</span>
            <span className={`w-1.5 h-1.5 rounded-full ${agentPanelOpen ? "bg-success animate-pulse" : "bg-muted-foreground/40"}`} />
          </button>
          <button
            onClick={() => setGraphPanelOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${graphPanelOpen ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
            title={graphPanelOpen ? "Hide Attack Graph" : "Show Attack Graph"}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Attack Graph</span>
          </button>
        </div>
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs ${settingsOpen ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          title="Customize dashboard layout"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Customize</span>
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4 p-1 h-full">
        {(settingsOpen ? sections : visibleSections).map((sec, idx) => {
          const isOpen = openSections[sec.key] !== false;
          const meta = sectionMeta[sec.key];
          return (
            <Collapsible
              key={sec.key}
              ref={settingsOpen ? ((el: HTMLDivElement | null) => { itemRefs.current[idx] = el; }) : undefined}
              open={settingsOpen ? false : (isOpen && sec.visible)}
              onOpenChange={() => { if (!settingsOpen) toggleSection(sec.key); }}
              className={`col-span-12 ${settingsOpen && !sec.visible ? "opacity-40" : ""}`}
              style={settingsOpen ? itemStyle(idx) : undefined}
            >
              <div
                className={`flex items-center gap-2 mb-3 select-none group
                  ${settingsOpen
                    ? `rounded-xl px-3 py-2 border touch-none cursor-grab active:cursor-grabbing transition-colors ${drag?.from === idx ? "ring-2 ring-primary border-primary/60 bg-primary/10" : "border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-border"}`
                    : "cursor-pointer transition-all"}`}
                onPointerDown={settingsOpen ? (e) => beginDrag(idx, e) : undefined}
                onClick={() => { if (!settingsOpen) toggleSection(sec.key); }}
              >
                {settingsOpen
                  ? <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                  : isOpen
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                }
                {meta?.icon}
                <h3 className="font-display font-bold text-sm group-hover:text-foreground/90 transition-colors flex-1">{sec.title}</h3>
                {!settingsOpen && meta?.badge}
                {settingsOpen && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); toggleVisibility(sec.key); }}
                    className="ml-auto p-1 rounded-lg hover:bg-muted transition-colors shrink-0"
                    title={sec.visible ? "Hide section" : "Show section"}
                  >
                    {sec.visible ? <Eye className="w-3.5 h-3.5 text-muted-foreground" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground/40" />}
                  </button>
                )}
              </div>
              <CollapsibleContent>
                <div>{sectionContent[sec.key]}</div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </PageShell>
  );
};

export default Overview;