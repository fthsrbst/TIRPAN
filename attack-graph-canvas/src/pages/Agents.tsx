import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSessionAgents, getSessionEvents } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { Bot, Cpu, Eye, Hammer, KeyRound, Network, Shield, Zap, Activity, Clock, Hash, Terminal, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const iconMap: Record<string, any> = { recon: Eye, scanner: Network, exploit: Hammer, credential: KeyRound, privesc: Shield, lateral: Zap };
const agentTypeLabels: Record<string, string> = {
  scanner: "Scanner", exploit: "Exploit", post_exploit: "Post-Exploit", webapp: "WebApp",
  osint: "OSINT", lateral: "Lateral Movement", reporting: "Reporting", brain: "Brain",
};

const Agents = () => {
  const [selectedSid, setSelectedSid] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusSet, setStatusSet] = useState<Set<string>>(() => new Set());
  const [agentTypeSet, setAgentTypeSet] = useState<Set<string>>(() => new Set());
  const [minTasks, setMinTasks] = useState<number | "">("");
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const { selectedSessionId } = useSessionContext();

  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });

  const effectiveSid = selectedSessionId || (selectedSid !== "all" ? selectedSid : null);

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ["session-agents", effectiveSid],
    queryFn: () => getSessionAgents(effectiveSid!),
    enabled: !!effectiveSid,
  });

  const agents = useMemo(() => (agentsData?.agents || []), [agentsData]);

  const agentTypesInData = useMemo(() => {
    const ts = new Set<string>();
    agents.forEach((a: any) => {
      if (a.agent_type) ts.add(String(a.agent_type));
    });
    return [...ts].sort();
  }, [agents]);

  const agentStatusesInData = useMemo(() => {
    const ts = new Set<string>();
    agents.forEach((a: any) => {
      ts.add(String(a.status || "idle").toLowerCase());
    });
    return [...ts].sort();
  }, [agents]);

  const { data: eventsData } = useQuery({
    queryKey: ["session-events-agent", effectiveSid],
    queryFn: () => getSessionEvents(effectiveSid!),
    enabled: !!effectiveSid && !!selectedAgent,
  });
  const sessionEvents = (eventsData?.events || []).slice(0, 200);

  const filtered = useMemo(() => {
    const minT = minTasks === "" ? null : Number(minTasks);
    return agents.filter((a: any) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (a.agent_type || "").toLowerCase().includes(q) ||
        (a.id || "").toLowerCase().includes(q) ||
        (a.target || "").toLowerCase().includes(q);
      const st = String(a.status || "idle").toLowerCase();
      const matchesStatus = statusSet.size === 0 || statusSet.has(st);
      const at = String(a.agent_type || "");
      const matchesType = agentTypeSet.size === 0 || agentTypeSet.has(at);
      const tasks = a.findings?.length ?? 0;
      const matchesTasks = minT == null || !Number.isFinite(minT) || tasks >= minT;
      return matchesSearch && matchesStatus && matchesType && matchesTasks;
    });
  }, [agents, search, statusSet, agentTypeSet, minTasks]);

  const clearAllFacets = useCallback(() => {
    setStatusSet(new Set());
    setAgentTypeSet(new Set());
    setMinTasks("");
  }, []);

  const filterChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    statusSet.forEach((s) => {
      chips.push({
        id: `st-${s}`,
        label: `Status: ${s}`,
        onRemove: () => setStatusSet((prev) => toggleInSet(prev, s)),
      });
    });
    agentTypeSet.forEach((t) => {
      chips.push({
        id: `ty-${t}`,
        label: `Type: ${t}`,
        onRemove: () => setAgentTypeSet((prev) => toggleInSet(prev, t)),
      });
    });
    if (minTasks !== "" && Number.isFinite(Number(minTasks))) {
      chips.push({
        id: "min-task",
        label: `Tasks ≥ ${minTasks}`,
        onRemove: () => setMinTasks(""),
      });
    }
    return chips;
  }, [statusSet, agentTypeSet, minTasks]);

  const activeFacetCount = useMemo(() => {
    let n = statusSet.size + agentTypeSet.size;
    if (minTasks !== "" && Number.isFinite(Number(minTasks))) n += 1;
    return n;
  }, [statusSet, agentTypeSet, minTasks]);

  function agentDisplayName(a: any): string {
    return a.id ? a.id.slice(0, 12) : (a.agent_type || "Agent");
  }

  function agentTypeLabel(a: any): string {
    return agentTypeLabels[a.agent_type] || a.agent_type || "Autonomous Agent";
  }

  function computeLoad(a: any): number {
    if (a.iterations == null) return 0;
    const max = 20;
    return Math.min(100, Math.floor((a.iterations / max) * 100));
  }

  function computeTasks(a: any): number {
    return a.findings?.length ?? 0;
  }

  // Filter events relevant to the selected agent
  const agentEvents = useMemo(() => {
    if (!selectedAgent) return [];
    return sessionEvents.filter((ev: any) => {
      const d = ev.data || {};
      return (d.agent_type === selectedAgent.agent_type || d.agent_id === selectedAgent.id || ev.agent_type === selectedAgent.agent_type);
    });
  }, [sessionEvents, selectedAgent]);

  function eventDescription(ev: any): string {
    const d = ev.data || {};
    if (typeof d.message === "string" && d.message) return d.message;
    if (typeof d.tool_name === "string" && d.tool_name) {
      const inp = d.input ? (typeof d.input === "string" ? d.input.slice(0, 60) : JSON.stringify(d.input).slice(0, 60)) : "";
      return `${d.tool_name}${inp ? ": " + inp : ""}`;
    }
    if (typeof d.tool === "string" && d.tool) {
      const inp = d.input ? (typeof d.input === "string" ? d.input.slice(0, 60) : JSON.stringify(d.input).slice(0, 60)) : "";
      return `${d.tool}${inp ? ": " + inp : ""}`;
    }
    if (typeof d.content === "string" && d.content) return d.content.slice(0, 120);
    if (typeof d.output === "string" && d.output) return "Output: " + d.output.slice(0, 120);
    if (typeof d.result === "string" && d.result) return "Result: " + d.result.slice(0, 120);
    if (typeof d.phase === "string" && d.phase) return "Phase: " + d.phase;
    if (typeof d.error === "string" && d.error) return "Error: " + d.error.slice(0, 120);
    if (typeof d.finding === "string" && d.finding) return "Found: " + d.finding.slice(0, 120);
    if (ev.event_type) return ev.event_type.replace(/_/g, " ");
    return JSON.stringify(d).slice(0, 120);
  }

  return (
    <PageShell title="AI Agents" subtitle="Autonomous pentest agent fleet">
      <div className="flex h-full gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto scrollbar-gutter-stable">
          <div className="node-card !p-3">
            <ListFilterToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search agents..."
              activeFacetCount={activeFacetCount}
              chips={filterChips}
              onClearAllFacets={clearAllFacets}
              summary={`${filtered.length} of ${agents.length} agents`}
              betweenSearchAndFilters={
                !selectedSessionId ? (
                  <select
                    value={selectedSid}
                    onChange={(e) => setSelectedSid(e.target.value)}
                    className="h-9 shrink-0 rounded-full bg-muted border border-border text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary max-w-[200px]"
                  >
                    <option value="all">Select a session</option>
                    {sessions.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.target || s.id}
                      </option>
                    ))}
                  </select>
                ) : undefined
              }
              filterPanel={
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                    {agentStatusesInData.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No agents loaded.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {agentStatusesInData.map((s) => (
                          <div key={s} className="flex items-center gap-2">
                            <Checkbox
                              id={`ag-st-${s}`}
                              checked={statusSet.has(s)}
                              onCheckedChange={() => setStatusSet((prev) => toggleInSet(prev, s))}
                            />
                            <Label htmlFor={`ag-st-${s}`} className="text-xs font-normal capitalize cursor-pointer">
                              {s}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">Empty = any status.</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Agent type</p>
                    {agentTypesInData.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No types.</p>
                    ) : (
                      <div className="space-y-2 max-h-44 overflow-y-auto">
                        {agentTypesInData.map((t) => (
                          <div key={t} className="flex items-center gap-2">
                            <Checkbox
                              id={`ag-type-${t}`}
                              checked={agentTypeSet.has(t)}
                              onCheckedChange={() => setAgentTypeSet((prev) => toggleInSet(prev, t))}
                            />
                            <Label htmlFor={`ag-type-${t}`} className="text-xs font-normal font-mono truncate cursor-pointer">
                              {t}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Min tasks (findings)</Label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Any"
                      value={minTasks}
                      onChange={(e) => setMinTasks(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    />
                  </div>
                </div>
              }
            />
          </div>
        <div className={`grid gap-4 ${selectedAgent ? 'grid-cols-2' : 'grid-cols-3'} overflow-y-auto scrollbar-gutter-stable`}>
          {isLoading&&<div className="text-xs text-muted-foreground col-span-3 text-center py-8">Loading agents...</div>}
          {!isLoading&&!effectiveSid&&<div className="text-xs text-muted-foreground col-span-3 text-center py-8">Select a session to view agents.</div>}
          {!isLoading&&effectiveSid&&filtered.length===0&&<div className="text-xs text-muted-foreground col-span-3 text-center py-8">No agents found.</div>}
          {filtered.map((a:any,idx:number)=>{
            const typeKey=(a.agent_type||"recon").toLowerCase();
            const Icon=iconMap[Object.keys(iconMap).find(k=>typeKey.includes(k))||"recon"]||Eye;
            const status=a.status||"idle";
            const color=status==="running"||status==="active"?"accent":status==="failed"||status==="error"?"destructive":status==="done"?"success":"muted";
            const load=computeLoad(a);
            const tasks=computeTasks(a);
            const isSelected = selectedAgent === a;
            return(
              <button key={idx} onClick={() => setSelectedAgent(isSelected ? null : a)} className={`node-card !p-5 text-left w-full min-w-0 transition-all hover:opacity-90 ${isSelected ? "ring-2 ring-inset ring-primary bg-primary/5" : ""}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3"><div className="relative"><div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center"><Icon className="w-5 h-5"/></div>{status==="running"&&<span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-success border-2 border-card animate-pulse"/>}</div>
                    <div className="min-w-0"><div className="font-display font-bold text-base flex items-center gap-2"><span className="truncate">{agentDisplayName(a)}</span><Bot className="w-3 h-3 text-muted-foreground shrink-0"/></div><div className="text-[11px] text-muted-foreground truncate">{agentTypeLabel(a)}</div></div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-${color}/15 text-${color==="muted"?"muted-foreground":color}`}>{status}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4"><div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasks</div><div className="font-display font-bold text-2xl">{tasks}</div></div><div><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Iterations</div><div className="font-display font-bold text-2xl">{a.iterations||0}</div></div></div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3"><div className={`h-full bg-${color==="muted"?"muted-foreground":color}`} style={{width:`${load}%`}}/></div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono min-w-0"><Cpu className="w-3 h-3 shrink-0"/><span className="truncate">{agentTypeLabel(a)}{a.target?` → ${a.target}`:""}</span></div>
              </button>
            );
          })}
        </div>
        </div>
        {selectedAgent && (
          <div className="w-[380px] shrink-0 node-card !p-5 overflow-y-auto scrollbar-gutter-stable relative flex flex-col gap-4">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-base">Agent Detail</h3>
              <button onClick={() => setSelectedAgent(null)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"><Bot className="w-5 h-5" /></div>
              <div>
                <div className="font-display font-bold text-sm">{agentDisplayName(selectedAgent)}</div>
                <div className="text-[11px] text-muted-foreground">{agentTypeLabel(selectedAgent)}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Activity className="w-3 h-3" /> Status</div>
                <div className="font-display font-bold text-sm capitalize">{selectedAgent.status || "idle"}</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Clock className="w-3 h-3" /> Tasks Done</div>
                <div className="font-display font-bold text-sm">{computeTasks(selectedAgent)}</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Cpu className="w-3 h-3" /> Agent Type</div>
                <div className="font-display font-bold text-xs truncate">{agentTypeLabel(selectedAgent)}</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Hash className="w-3 h-3" /> ID</div>
                <div className="font-display font-bold text-xs font-mono truncate">{selectedAgent.id?.slice(0, 12) || "—"}</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-1.5">Progress</div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-accent" style={{width:`${computeLoad(selectedAgent)}%`}} /></div>
                <span className="text-xs font-mono text-muted-foreground">{selectedAgent.iterations||0} iters</span>
              </div>
            </div>
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Terminal className="w-3 h-3" /> Recent Activity</h4>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {agentEvents.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground text-center py-4">No recent activity recorded.</div>
                ) : (
                  agentEvents.slice(0, 15).map((evt: any, i: number) => {
                    const ts = evt.created_at ? new Date(evt.created_at * 1000).toLocaleTimeString() : "—";
                    const desc = eventDescription(evt);
                    return (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 text-[11px]">
                        <div className="w-1 h-1 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{desc}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{ts}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default Agents;
