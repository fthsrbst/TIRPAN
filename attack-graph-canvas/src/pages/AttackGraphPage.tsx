import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/attack/PageShell";
import { AttackGraph } from "@/components/attack/AttackGraph";
import { InsightsPanel } from "@/components/attack/InsightsPanel";
import { Timeline } from "@/components/attack/Timeline";
import { AttackFlowMap } from "@/components/attack/AttackFlowMap";
import { AgentChatPanel } from "@/components/attack/AgentChatPanel";
import { useSessionBundle } from "@/hooks/useAttackGraphData";
import { useSessionContext } from "@/lib/SessionContext";
import { getSessions } from "@/lib/api";
import { X, Globe, Server, GitMerge, PanelLeftClose, PanelLeft } from "lucide-react";

interface HostTab {
  id: string;
  label: string;
  hostIp: string | null;
}

const AttackGraphPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<HostTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [elapsedDisplay, setElapsedDisplay] = useState("00:00");
  const [topologySubView, setTopologySubView] = useState<"network" | "flow">("network");
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);

  const drillHostIp = (location.state as { drillHostIp?: string } | null)?.drillHostIp;

  const { selectedSessionId, setSelectedSessionId } = useSessionContext();
  const { data: allSessions = [] } = useQuery<any[]>({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 5000 });

  // Auto-select best session if none selected
  useEffect(() => {
    if (selectedSessionId || !(allSessions as any[]).length) return;
    const running = (allSessions as any[]).find((s: any) => s.is_running || s.status === "running");
    const scored = [...(allSessions as any[])].sort((a: any, b: any) => {
      const score = (s: any) =>
        (s.exploit_results?.length || s.exploits_run || 0) * 3 +
        (s.vulnerabilities?.length || s.vulns_found || 0) * 2 +
        (s.scan_results?.length || 0);
      return score(b) - score(a) || (b.created_at || 0) - (a.created_at || 0);
    });
    const best = running || scored[0];
    if (best?.id) setSelectedSessionId(best.id);
  }, [allSessions, selectedSessionId, setSelectedSessionId]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const selectedHost = activeTab?.hostIp ?? null;

  const bundle = useSessionBundle(selectedHost, selectedSessionId);

  // Timer
  useEffect(() => {
    const update = () => {
      const elapsed =
        bundle.dynamicGraph.isRunning && bundle.dynamicGraph.startTime
          ? Math.max(0, Math.round(Date.now() / 1000 - bundle.dynamicGraph.startTime))
          : bundle.dynamicGraph.elapsedSeconds || 0;
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      setElapsedDisplay(`${mm}:${ss}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [bundle.dynamicGraph.isRunning, bundle.dynamicGraph.startTime, bundle.dynamicGraph.elapsedSeconds]);

  const handleSelectHost = useCallback((hostIp: string) => {
    const tabId = `host-${hostIp}`;
    setTabs((prev) => {
      if (prev.find((t) => t.id === tabId)) return prev;
      return [...prev, { id: tabId, label: hostIp, hostIp }];
    });
    setActiveTabId(tabId);
  }, []);

  useEffect(() => {
    if (!drillHostIp) return;
    handleSelectHost(drillHostIp);
    navigate(location.pathname, { replace: true, state: {} });
  }, [drillHostIp, handleSelectHost, navigate, location.pathname]);

  const closeTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId(null);
  }, [activeTabId]);

  const activeView = activeTabId !== null ? "attackPath" : "topology";

  const subtitle =
    bundle.dynamicGraph.isRunning
      ? `Live · ${bundle.dynamicGraph.target} · ${elapsedDisplay}`
      : bundle.dynamicGraph.target
      ? `${bundle.dynamicGraph.target} · ${elapsedDisplay}`
      : "Autonomous pentest path visualization";

  return (
    <PageShell
      title="Attack Graph"
      subtitle={subtitle}
      contentScrollable={false}
      rightPanel={<InsightsPanel data={bundle.insights} details={bundle.details} sessionId={bundle.sessionId} />}
      leftPanel={agentPanelOpen ? <AgentChatPanel open={agentPanelOpen} onClose={() => setAgentPanelOpen(false)} /> : undefined}
      timeline={
        <Timeline
          data={bundle.timeline}
          sessionId={bundle.sessionId}
          isRunning={bundle.dynamicGraph.isRunning}
          target={bundle.dynamicGraph.target}
          isDemoMode={bundle.dynamicGraph.isDemoMode}
        />
      }
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 bg-card/40 rounded-3xl border border-border/50 overflow-hidden relative flex flex-col">
          {/* Chrome-style tab bar */}
          <div className="flex items-stretch gap-0 bg-card/60 border-b border-border/50 px-2 pt-2 shrink-0">
            {/* Agent panel toggle button */}
            <button
              onClick={() => setAgentPanelOpen(!agentPanelOpen)}
              className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-md transition-colors self-center mr-2 ${
                agentPanelOpen
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {agentPanelOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
              Agent
            </button>

            {/* Network / Attack Flow toggle — always visible */}
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg px-1 py-1 mr-2 self-center">
              <button
                onClick={() => setTopologySubView("network")}
                className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md transition-colors ${
                  topologySubView === "network"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Globe className="w-3 h-3" />
                Network
              </button>
              <button
                onClick={() => setTopologySubView("flow")}
                className={`flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md transition-colors ${
                  topologySubView === "flow"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <GitMerge className="w-3 h-3" />
                Attack Flow
              </button>
            </div>

            {/* Host tabs */}
            <div className="flex items-stretch gap-0.5 flex-1 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`
                      group flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-t-lg border border-b-0 transition-all shrink-0 max-w-[160px]
                      ${isActive
                        ? "bg-card border-border/60 text-foreground shadow-sm"
                        : "bg-transparent border-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground"
                      }
                    `}
                  >
                    <Server className="w-3 h-3 shrink-0 text-accent opacity-80" />
                    <span className="truncate">{tab.label}</span>
                    <span
                      onClick={(e) => closeTab(tab.id, e)}
                      className="ml-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity shrink-0 cursor-pointer"
                    >
                      <X className="w-2 h-2" />
                    </span>
                  </button>
                );
              })}
            </div>

          </div>

          {/* Graph canvas */}
          <div className="flex-1 min-h-0 relative">
            {topologySubView === "flow" && activeTabId === null ? (
              <AttackFlowMap
                details={bundle.details}
                topology={bundle.dynamicGraph.topology}
                onSelectHost={handleSelectHost}
              />
            ) : (
              <AttackGraph
                data={bundle.dynamicGraph}
                activeView={activeView}
                selectedHost={selectedHost}
                onSelectHost={handleSelectHost}
                focusedSessionId={bundle.sessionId}
              />
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default AttackGraphPage;
