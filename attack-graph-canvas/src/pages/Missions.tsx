import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSessions, killSession, pauseSession, resumeSession, deleteSession, renameSession } from "@/lib/api";
import { api } from "@/lib/utils";
import { useSessionContext } from "@/lib/SessionContext";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { usePermissions, canActOnSession } from "@/lib/permissions";
import {
  Play, Pause, Square, Trash2, Target, Activity, Bug,
  Server, AlertTriangle, Globe, RefreshCw, FileText, Pencil, ScrollText, Shield,
  Plus, UserCheck,
} from "lucide-react";

const MISSION_STATUSES = ["running", "paused", "done", "error", "idle"] as const;
type RiskBand = "low" | "medium" | "high" | "critical";

const Missions = () => {
  const navigate = useNavigate();
  const perms = usePermissions();
  const [search, setSearch] = useState("");
  const [statusSet, setStatusSet] = useState<Set<string>>(() => new Set());
  const [riskSet, setRiskSet] = useState<Set<RiskBand>>(() => new Set());
  const [minVulns, setMinVulns] = useState<number | "">("");
  const [minExploits, setMinExploits] = useState<number | "">("");
  const { selectedSessionId, setSelectedSessionId, selectedSession, isLoading: detailLoading } = useSessionContext();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const qc = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const killMut = useMutation({ mutationFn: killSession, onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  const pauseMut = useMutation({ mutationFn: pauseSession, onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  const resumeMut = useMutation({ mutationFn: resumeSession, onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  const deleteMut = useMutation({ mutationFn: deleteSession, onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); if (selectedSessionId) setSelectedSessionId(null); } });
  const renameMut = useMutation({
    mutationFn: ({ sid, name }: { sid: string; name: string }) => renameSession(sid, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      if (selectedSessionId) qc.invalidateQueries({ queryKey: ["session-detail", selectedSessionId] });
    },
  });

  const riskBand = useCallback((s: any): RiskBand => {
    const v = s.vulnerabilities?.length || s.vulns_found || 0;
    const e = s.exploit_results?.length || s.exploits_run || 0;
    if (e > 0 && v > 5) return "critical";
    if (e > 0 || v > 3) return "high";
    if (v > 0) return "medium";
    return "low";
  }, []);

  const filtered = useMemo(() => {
    const minV = minVulns === "" ? null : Number(minVulns);
    const minE = minExploits === "" ? null : Number(minExploits);
    return sessions
      .filter((s: any) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          sessionDisplayLabel(s).toLowerCase().includes(q) ||
          (s.target || "").toLowerCase().includes(q) ||
          (s.id || "").toLowerCase().includes(q);
        const st = s.status || "idle";
        const matchesStatus = statusSet.size === 0 || statusSet.has(st);
        const band = riskBand(s);
        const matchesRisk = riskSet.size === 0 || riskSet.has(band);
        const vCount = s.vulns_found ?? s.vulnerabilities?.length ?? 0;
        const eCount = s.exploits_run ?? s.exploit_results?.length ?? 0;
        const matchesMinV = minV == null || !Number.isFinite(minV) || vCount >= minV;
        const matchesMinE = minE == null || !Number.isFinite(minE) || eCount >= minE;
        return matchesSearch && matchesStatus && matchesRisk && matchesMinV && matchesMinE;
      })
      .sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0));
  }, [sessions, search, statusSet, riskSet, minVulns, minExploits, riskBand]);

  const clearAllFacets = useCallback(() => {
    setStatusSet(new Set());
    setRiskSet(new Set());
    setMinVulns("");
    setMinExploits("");
  }, []);

  const filterChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    statusSet.forEach((st) => {
      chips.push({
        id: `st-${st}`,
        label: `Status: ${st}`,
        onRemove: () => setStatusSet((prev) => toggleInSet(prev, st)),
      });
    });
    riskSet.forEach((r) => {
      chips.push({
        id: `risk-${r}`,
        label: `Risk: ${r}`,
        onRemove: () => setRiskSet((prev) => toggleInSet(prev, r)),
      });
    });
    if (minVulns !== "" && Number.isFinite(Number(minVulns))) {
      chips.push({
        id: "min-v",
        label: `Vulns ≥ ${minVulns}`,
        onRemove: () => setMinVulns(""),
      });
    }
    if (minExploits !== "" && Number.isFinite(Number(minExploits))) {
      chips.push({
        id: "min-e",
        label: `Exploits ≥ ${minExploits}`,
        onRemove: () => setMinExploits(""),
      });
    }
    return chips;
  }, [statusSet, riskSet, minVulns, minExploits]);

  const activeFacetCount = useMemo(() => {
    let n = statusSet.size + riskSet.size;
    if (minVulns !== "" && Number.isFinite(Number(minVulns))) n += 1;
    if (minExploits !== "" && Number.isFinite(Number(minExploits))) n += 1;
    return n;
  }, [statusSet, riskSet, minVulns, minExploits]);

  const colorFor = (s: string) => {
    switch (s) {
      case "running": return "accent";
      case "done": return "success";
      case "error": return "destructive";
      case "paused": return "warning";
      default: return "muted";
    }
  };

  const riskScore = (s: any) => {
    const band = riskBand(s);
    const map: Record<RiskBand, { label: string; color: string }> = {
      critical: { label: "Critical", color: "destructive" },
      high: { label: "High", color: "warning" },
      medium: { label: "Medium", color: "accent" },
      low: { label: "Low", color: "success" },
    };
    return map[band];
  };

  return (
    <PageShell title="Missions" subtitle="Pentest mission management &amp; details">
      <div className="flex h-full gap-4">
        {/* Left Panel */}
        <div className="w-[360px] shrink-0 flex flex-col gap-3 h-full">
          <div className="node-card !p-3 shrink-0">
            <ListFilterToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search missions..."
              activeFacetCount={activeFacetCount}
              chips={filterChips}
              onClearAllFacets={clearAllFacets}
              summary={`${filtered.length} of ${sessions.length} missions`}
              trailingActions={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => qc.invalidateQueries({ queryKey: ["sessions"] })}
                    className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                  {perms.canCreateMission && (
                    <button
                      type="button"
                      onClick={() => navigate("/missions/new")}
                      className="flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1.5 text-[11px] font-medium hover:opacity-90"
                    >
                      <Plus className="w-3 h-3" /> New
                    </button>
                  )}
                </div>
              }
              panelClassName="w-[300px]"
              filterPanel={
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                    <div className="grid grid-cols-2 gap-2">
                      {MISSION_STATUSES.map((st) => (
                        <div key={st} className="flex items-center gap-2">
                          <Checkbox
                            id={`m-st-${st}`}
                            checked={statusSet.has(st)}
                            onCheckedChange={() => setStatusSet((prev) => toggleInSet(prev, st))}
                          />
                          <Label htmlFor={`m-st-${st}`} className="text-xs font-normal capitalize cursor-pointer">
                            {st}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">None selected = all statuses</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Risk band</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["critical", "high", "medium", "low"] as RiskBand[]).map((r) => (
                        <div key={r} className="flex items-center gap-2">
                          <Checkbox
                            id={`m-risk-${r}`}
                            checked={riskSet.has(r)}
                            onCheckedChange={() => setRiskSet((prev) => toggleInSet(prev, r))}
                          />
                          <Label htmlFor={`m-risk-${r}`} className="text-xs font-normal capitalize cursor-pointer">
                            {r}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">None selected = all bands</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Min vulns</Label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Any"
                        value={minVulns}
                        onChange={(e) => setMinVulns(e.target.value === "" ? "" : Number(e.target.value))}
                        className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Min exploits</Label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Any"
                        value={minExploits}
                        onChange={(e) => setMinExploits(e.target.value === "" ? "" : Number(e.target.value))}
                        className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              }
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-gutter-stable space-y-2 px-1.5 py-1">
            {isLoading && <div className="text-xs text-muted-foreground text-center py-8">Loading...</div>}
            {!isLoading && filtered.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">No missions found.</div>}
            {filtered.map((s: any) => {
              const c = colorFor(s.status);
              const dateStr = s.created_at ? new Date(s.created_at * 1000).toLocaleDateString() : "—";
              const isActive = selectedSessionId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSessionId(isActive ? null : s.id)}
                  className={`node-card !p-4 w-full text-left transition-all hover:opacity-90 ${
                    isActive ? "ring-2 ring-inset ring-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className={`w-10 h-10 rounded-xl bg-${c}/15 text-${c} flex items-center justify-center shrink-0`}>
                      <Target className="w-4 h-4" />
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-${c}/15 text-${c}`}>
                      {s.status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                      {s.status}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-sm leading-tight mb-1 truncate">{sessionDisplayLabel(s) || "Untitled"}</h3>
                  <div className="text-[10px] font-mono text-muted-foreground mb-2">{s.id?.slice(0, 12)}</div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> {s.hosts_found || 0}</span>
                    <span className="flex items-center gap-1"><Bug className="w-3 h-3" /> {s.vulns_found || 0}</span>
                    <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {s.exploits_run || 0}</span>
                    <span className="ml-auto text-muted-foreground">{dateStr}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 min-w-0 node-card overflow-hidden flex flex-col relative">
          {!selectedSessionId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <Target className="w-10 h-10 opacity-20" />
              <p className="text-sm">Select a mission to view details.</p>
            </div>
          ) : detailLoading ? (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading mission details...</div>
          ) : selectedSession ? (
            <div className="flex flex-col h-full overflow-y-auto scrollbar-gutter-stable">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
                <div className="min-w-0 flex-1">
                  {renamingId === selectedSessionId ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 h-8 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { renameMut.mutate({ sid: selectedSessionId!, name: renameValue }); setRenamingId(null); }
                          if (e.key === "Escape") { setRenamingId(null); }
                        }}
                      />
                      <button onClick={() => { renameMut.mutate({ sid: selectedSessionId!, name: renameValue }); setRenamingId(null); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">Save</button>
                      <button onClick={() => setRenamingId(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setRenamingId(selectedSessionId);
                        setRenameValue(sessionDisplayLabel(selectedSession) || selectedSessionId || "");
                      }}
                      className="group min-w-0 text-left hover:opacity-70 transition-opacity"
                    >
                      <h2 className="font-display font-bold text-lg truncate flex items-center gap-2">{sessionDisplayLabel(selectedSession) || selectedSessionId}<Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" /></h2>
                    </button>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                    <span className="font-mono">{selectedSessionId?.slice(0, 16)}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] uppercase bg-${colorFor(selectedSession.status || "idle")}/15 text-${colorFor(selectedSession.status || "idle")}`}>
                      {selectedSession.status}
                    </span>
                    <span>{selectedSession.mode || "—"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  {canActOnSession(perms, selectedSession) && selectedSession.status === "running" && (
                    <>
                      <button onClick={() => pauseMut.mutate(selectedSessionId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/15 text-warning text-xs font-medium hover:bg-warning/30">
                        <Pause className="w-3 h-3" /> Pause
                      </button>
                      <button onClick={() => killMut.mutate(selectedSessionId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/30">
                        <Square className="w-3 h-3" /> Stop
                      </button>
                    </>
                  )}
                  {canActOnSession(perms, selectedSession) && selectedSession.status === "paused" && (
                    <button onClick={() => resumeMut.mutate(selectedSessionId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/15 text-success text-xs font-medium hover:bg-success/30">
                      <Play className="w-3 h-3" /> Resume
                    </button>
                  )}
                  {canActOnSession(perms, selectedSession) && selectedSession.status !== "running" && selectedSession.status !== "paused" && (
                    <button onClick={() => deleteMut.mutate(selectedSessionId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-xs text-muted-foreground hover:bg-destructive/15 hover:text-destructive">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  )}
                  {/* Atama butonu — sadece admin/owner */}
                  {perms.canAssignMission && (
                    <AssignButton sessionId={selectedSessionId!} currentAssignee={selectedSession.assigned_to} />
                  )}
                </div>
              </div>

              {/* Mission phase stepper — concrete milestones, not a guessed %. */}
              <MissionPhaseStepper sessionId={selectedSessionId!} />

              {/* Details + Expert Log links (events / audit) */}
              <div className="flex items-center gap-1 px-5 py-2 border-b border-border/30 shrink-0">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-primary text-primary-foreground"
                >
                  <FileText className="w-3 h-3" /> Details
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectedSessionId &&
                    navigate(`/expert-log?session=${encodeURIComponent(selectedSessionId)}&view=events`)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <ScrollText className="w-3 h-3" /> Events Log
                </button>
                <button
                  type="button"
                  onClick={() =>
                    selectedSessionId &&
                    navigate(`/expert-log?session=${encodeURIComponent(selectedSessionId)}&view=audit`)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Shield className="w-3 h-3" /> Audit Log
                </button>
              </div>

              <>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-3 p-4 shrink-0">
                {[
                  { label: "Hosts Found", value: selectedSession.hosts_found || 0, sub: "discovered", icon: Globe, color: "accent" },
                  { label: "Open Ports", value: selectedSession.ports_found || 0, sub: "total", icon: Server, color: "accent" },
                  { label: "Vulnerabilities", value: selectedSession.vulns_found || 0, sub: "found", icon: Bug, color: "warning" },
                  { label: "Exploits Run", value: selectedSession.exploits_run || 0, sub: "executed", icon: Activity, color: "destructive" },
                ].map((k) => (
                  <div key={k.label} className="node-card !p-3 !bg-muted/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <k.icon className={`w-3.5 h-3.5 text-${k.color}`} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{k.label}</span>
                    </div>
                    <div className={`font-display font-bold text-2xl text-${k.color}`}>{k.value}</div>
                    <div className="text-[10px] text-muted-foreground">{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Details */}
              <div className="flex-1 px-4 pb-4 space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-muted/20 border border-border/20">
                    <div className="text-muted-foreground mb-1">Created</div>
                    <div>{selectedSession.created_at ? new Date(selectedSession.created_at * 1000).toLocaleString() : "—"}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/20 border border-border/20">
                    <div className="text-muted-foreground mb-1">Finished</div>
                    <div>{selectedSession.finished_at ? new Date(selectedSession.finished_at * 1000).toLocaleString() : "In progress"}</div>
                  </div>
                </div>

                {/* Host List */}
                {selectedSession.scan_results && selectedSession.scan_results.length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
                      <Globe className="w-3 h-3" /> Hosts Discovered
                    </h4>
                    <div className="space-y-1.5">
                      {selectedSession.scan_results.flatMap((sr: any) => (sr.hosts || [])).slice(0, 8).map((h: any, i: number) => {
                        const openPorts = (h.ports || []).filter((p: any) => p.state === "open");
                        return (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-[11px]">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${h.state === "up" ? "bg-success" : "bg-destructive"}`} />
                              <span className="font-mono">{h.ip}</span>
                              <span className="text-muted-foreground">{h.hostname || h.os || ""}</span>
                            </div>
                            <span className="text-muted-foreground">{openPorts.length} ports open</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Vulnerabilities */}
                {selectedSession.vulnerabilities && selectedSession.vulnerabilities.length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
                      <Bug className="w-3 h-3" /> Findings
                    </h4>
                    <div className="space-y-1.5">
                      {selectedSession.vulnerabilities.slice(0, 6).map((v: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-[11px]">
                          <AlertTriangle className={`w-3 h-3 ${(v.cvss_score || 0) >= 7 ? "text-destructive" : "text-warning"}`} />
                          <span className="flex-1 truncate">{v.title}</span>
                          {v.cve_id && <span className="font-mono text-muted-foreground">{v.cve_id}</span>}
                          <span className="font-mono text-muted-foreground">{(v.cvss_score || 0).toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exploits */}
                {selectedSession.exploit_results && selectedSession.exploit_results.length > 0 && (
                  <div>
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
                      <Activity className="w-3 h-3" /> Exploits
                    </h4>
                    <div className="space-y-1.5">
                      {selectedSession.exploit_results.slice(0, 6).map((e: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-[11px]">
                          <span className={`w-1.5 h-1.5 rounded-full ${e.success ? "bg-success" : "bg-destructive"}`} />
                          <span className="flex-1 truncate">{e.module || "Unknown"}</span>
                          <span className="font-mono text-muted-foreground">{e.target_ip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No data available.</div>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default Missions;

// ── Mission Phase Stepper (5-stage milestone tracker) ─────────────────────────
// Honest milestone-based progress (NOT a guessed %). Polls
// /api/v1/sessions/{sid}/progress every 5s and renders a row of 5 pills:
// Recon · Exploit · Foothold · Post-Ex · Report. A pill lights up only when
// the backend reports concrete evidence for that stage; the first not-done
// stage pulses to draw the operator's eye.

type PhaseStage = { id: string; label: string; done: boolean; metric: string };
type PhaseProgressResp = {
  session_id: string;
  status: string;
  current_phase?: string;
  stages: PhaseStage[];
  completed_count: number;
  total: number;
  percent: number;
};

function MissionPhaseStepper({ sessionId }: { sessionId: string }) {
  const { data } = useQuery<PhaseProgressResp>({
    queryKey: ["session-progress", sessionId],
    queryFn: () => api.get<PhaseProgressResp>(`/sessions/${sessionId}/progress`),
    enabled: !!sessionId,
    refetchInterval: 5000,
    staleTime: 3000,
  });
  if (!data) return null;
  const stages = data.stages || [];
  const firstPendingIdx = stages.findIndex((s) => !s.done);
  return (
    <div className="px-5 py-3 border-b border-border/30 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Mission Phase
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {data.completed_count} / {data.total} milestones
          {firstPendingIdx >= 0
            ? ` · current: ${stages[firstPendingIdx]?.label.toLowerCase()}`
            : data.status === "done"
              ? " · mission complete"
              : " · all milestones met"}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {stages.map((s, i) => {
          const isCurrent = i === firstPendingIdx;
          return (
            <div key={s.id} className="flex flex-col items-center gap-1">
              <div
                className={`h-1 w-full rounded-sm transition-colors ${
                  s.done
                    ? "bg-primary"
                    : isCurrent
                      ? "bg-primary/40 animate-pulse"
                      : "bg-muted"
                }`}
              />
              <span
                className={`text-[9px] font-bold uppercase tracking-wider ${
                  s.done ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
              <span className="text-[9px] font-mono text-muted-foreground text-center min-h-[12px]">
                {s.metric}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Atama butonu (admin/owner) ─────────────────────────────────────────────────

function AssignButton({ sessionId, currentAssignee }: { sessionId: string; currentAssignee?: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<{ id: string; full_name: string; email: string; role: string }[]>([]);
  const [selected, setSelected] = useState(currentAssignee || "");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const loadMembers = async () => {
    try {
      const res = await fetch("/api/v1/auth/users", {
        headers: { Authorization: `Bearer ${localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token")}` },
      });
      if (res.ok) setMembers(await res.json());
    } catch {}
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/v1/sessions/${sessionId}/assign`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token")}`,
        },
        body: JSON.stringify({ assigned_to: selected || null }),
      });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      setOpen(false);
    } catch {}
    setSaving(false);
  };

  return (
    <>
      <button
        onClick={loadMembers}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 text-xs text-muted-foreground hover:bg-muted"
        title="Kullanıcıya ata"
      >
        <UserCheck className="w-3 h-3" />
        {currentAssignee ? "Yeniden Ata" : "Ata"}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div className="bg-card rounded-xl border border-border p-5 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-semibold">Mission Ata</h3>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none"
            >
              <option value="">— Atanmamış —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name} ({m.role})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="flex-1 h-9 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">İptal</button>
              <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
