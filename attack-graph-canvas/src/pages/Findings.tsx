import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { StatCard } from "@/components/attack/StatCard";
import { ExportMenu } from "@/components/attack/ExportMenu";
import { EmptyState } from "@/components/attack/EmptyState";
import { exportCSV, exportJSON } from "@/lib/exportData";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { ShieldAlert, Shield, AlertTriangle, Info, BarChart3, Cpu, Bug, X, ExternalLink, Copy, Server, Target, Layers } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const severityMeta: Record<string, { label: string; color: string; icon: any; scoreMin: number }> = {
  CRITICAL: { label: "Critical", color: "destructive", icon: ShieldAlert, scoreMin: 9.0 },
  HIGH: { label: "High", color: "warning", icon: AlertTriangle, scoreMin: 7.0 },
  MEDIUM: { label: "Medium", color: "accent", icon: Shield, scoreMin: 4.0 },
  LOW: { label: "Low", color: "success", icon: Info, scoreMin: 0.1 },
  NONE: { label: "Info", color: "muted", icon: Info, scoreMin: 0 },
};
const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"];

// Prefer an explicit severity field; otherwise derive it from the CVSS score so
// high-scoring findings aren't all bucketed as "Info" when the backend omits severity.
function effectiveSeverity(v: any): string {
  const raw = (v.severity || "").toUpperCase();
  if (raw && severityMeta[raw]) return raw;
  const cvss = parseFloat(v.cvss_score) || 0;
  if (cvss >= 9.0) return "CRITICAL";
  if (cvss >= 7.0) return "HIGH";
  if (cvss >= 4.0) return "MEDIUM";
  if (cvss >= 0.1) return "LOW";
  return "NONE";
}

// ── Attack-phase inference ─────────────────────────────────────────────────────
// Prefers _cls.attack_phase from ML model; falls back to heuristic when absent.

type AttackPhaseKey =
  | "reconnaissance" | "scanning" | "exploitation"
  | "post_exploitation" | "lateral_movement" | "exfiltration" | "impact" | "other";

const PHASE_META: Record<AttackPhaseKey, { label: string; color: string }> = {
  reconnaissance:   { label: "Recon",        color: "#a855f7" },
  scanning:         { label: "Scanning",      color: "#60a5fa" },
  exploitation:     { label: "Exploit",       color: "#ef4444" },
  post_exploitation:{ label: "Post-Exploit",  color: "#f97316" },
  lateral_movement: { label: "Lateral",       color: "#eab308" },
  exfiltration:     { label: "Exfil",         color: "#ec4899" },
  impact:           { label: "Impact",        color: "#dc2626" },
  other:            { label: "Other",         color: "#6b7280" },
};

const PHASE_KEYS = Object.keys(PHASE_META) as AttackPhaseKey[];

function inferPhase(v: any): AttackPhaseKey {
  // Prefer ML classification
  const clsPhase = v._cls?.attack_phase as AttackPhaseKey | undefined;
  if (clsPhase && PHASE_META[clsPhase]) return clsPhase;
  // Heuristic fallback
  const et  = (v.exploit_type || "").toLowerCase();
  const svc = (v.service       || "").toLowerCase();
  const sev = (v.severity      || "").toUpperCase();
  const cvss = parseFloat(v.cvss_score) || 0;
  if (et === "webapps" || svc.includes("http") || svc.includes("web") || svc.includes("apache") || svc.includes("nginx")) return "exploitation";
  if (et === "remote")  return "exploitation";
  if (et === "local")   return "post_exploitation";
  if (svc.includes("smb") || svc.includes("rdp")) return "lateral_movement";
  if (svc.includes("ssh") || svc.includes("ftp") || svc.includes("telnet")) return "exploitation";
  if (sev === "CRITICAL" || cvss >= 9.0) return "exploitation";
  if (sev === "HIGH"     || cvss >= 7.0) return "exploitation";
  return "scanning";
}

// Asset category label mapping (ML _cls.asset_category → display label)
const ASSET_CAT_LABELS: Record<string, string> = {
  web_application: "Web App",
  authentication:  "Auth",
  data:            "Data",
  network:         "Network",
  service:         "Service",
  operating_system:"OS",
  other:           "Service",
};

function inferAsset(v: any): string {
  // Prefer ML classification
  const clsAsset = v._cls?.asset_category as string | undefined;
  if (clsAsset && ASSET_CAT_LABELS[clsAsset]) return ASSET_CAT_LABELS[clsAsset];
  // Heuristic fallback
  const svc = (v.service || "").toLowerCase();
  if (svc.includes("http") || svc.includes("web") || svc.includes("apache") || svc.includes("nginx") || svc.includes("iis")) return "Web App";
  if (svc.includes("ssh") || svc.includes("ftp") || svc.includes("rdp") || svc.includes("smb") || svc.includes("ldap")) return "Auth";
  if (svc.includes("mysql") || svc.includes("postgres") || svc.includes("mongo") || svc.includes("redis") || svc.includes("mssql")) return "Data";
  if (svc.includes("dns") || svc.includes("snmp") || svc.includes("ntp")) return "Network";
  const et = (v.exploit_type || "").toLowerCase();
  if (et === "webapps") return "Web App";
  if (et === "local")   return "OS";
  return "Service";
}

const ASSET_GROUPS = ["Web App", "Auth", "Data", "Network", "Service", "OS"] as const;

// ── TTP chip component ──────────────────────────────────────────────────────
function TtpChips({ ttps }: { ttps: string[] }) {
  if (!ttps || ttps.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {ttps.slice(0, 4).map((ttp) => (
        <a
          key={ttp}
          href={`https://attack.mitre.org/techniques/${ttp.replace(".", "/")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          title={`MITRE ATT&CK: ${ttp}`}
        >
          {ttp}
        </a>
      ))}
      {ttps.length > 4 && (
        <span className="text-[9px] text-muted-foreground self-center">+{ttps.length - 4}</span>
      )}
    </div>
  );
}

// ── ML badge ────────────────────────────────────────────────────────────────
function MlBadge({ source, confidence }: { source?: string; confidence?: number }) {
  if (source !== "ml") return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold bg-violet-500/15 text-violet-400 ml-1"
      title={`ML classified${confidence ? ` (${Math.round(confidence * 100)}% confidence)` : ""}`}
    >
      <Cpu className="w-2.5 h-2.5" />
      ML
    </span>
  );
}

const Findings = () => {
  const [search, setSearch] = useState("");
  const [severitySet, setSeveritySet] = useState<Set<string>>(() => new Set());
  const [phaseSet, setPhaseSet] = useState<Set<AttackPhaseKey>>(() => new Set());
  const [assetSet, setAssetSet] = useState<Set<string>>(() => new Set());
  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [selectedFinding, setSelectedFinding] = useState<any>(null);
  const { selectedSessionId, selectedSession: ctxSession, isLoading: ctxSessionLoading } = useSessionContext();

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 10000,
  });

  const { data: aggregateFindings = [], isLoading: aggregateFindingsLoading } = useQuery({
    queryKey: ["all-findings-aggregate", sessions.map((s: any) => s.id).join(",")],
    queryFn: async () => {
      if (!sessions || sessions.length === 0) return [];
      const results = await Promise.all(sessions.map((s: any) => getSession(s.id).catch(() => null)));
      return results.flatMap((r: any) => {
        if (!r || !r.vulnerabilities) return [];
        return r.vulnerabilities.map((v: any) => ({ ...v, sessionId: r.id, target: r.target, sessionStatus: r.status }));
      });
    },
    enabled: !selectedSessionId && sessions.length > 0,
  });

  const allFindings = useMemo(() => {
    if (selectedSessionId) {
      if (!ctxSession) return [];
      return (ctxSession.vulnerabilities || []).map((v: any) => ({
        ...v, sessionId: ctxSession.id, target: ctxSession.target, sessionStatus: ctxSession.status,
      }));
    }
    return aggregateFindings;
  }, [selectedSessionId, ctxSession, aggregateFindings]);

  const findingsLoading = selectedSessionId ? ctxSessionLoading : aggregateFindingsLoading;

  // Findings scoped to the active session selection (global context OR the in-page
  // dropdown). All stat cards, facet counts and the table derive from this so they
  // stay in sync with the selected session.
  const sessionScoped = useMemo(() => {
    if (selectedSessionId || selectedSession === "all") return allFindings;
    return allFindings.filter((f: any) => f.sessionId === selectedSession);
  }, [allFindings, selectedSessionId, selectedSession]);

  const filtered = useMemo(() => {
    return sessionScoped
      .filter((f: any) => {
        const sev = effectiveSeverity(f);
        const phase = inferPhase(f);
        const asset = inferAsset(f);
        const mSearch =
          !search ||
          (f.title || "").toLowerCase().includes(search.toLowerCase()) ||
          (f.cve_id || "").toLowerCase().includes(search.toLowerCase()) ||
          (f.service || "").toLowerCase().includes(search.toLowerCase()) ||
          (f.target || "").toLowerCase().includes(search.toLowerCase()) ||
          (f._cls?.mitre_ttps || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()));
        const mSev = severitySet.size === 0 || severitySet.has(sev);
        const mPhase = phaseSet.size === 0 || phaseSet.has(phase);
        const mAsset = assetSet.size === 0 || assetSet.has(asset);
        return mSearch && mSev && mPhase && mAsset;
      })
      .sort(
        (a: any, b: any) =>
          severityOrder.indexOf(effectiveSeverity(a)) - severityOrder.indexOf(effectiveSeverity(b)),
      );
  }, [sessionScoped, search, severitySet, phaseSet, assetSet]);

  const clearAllFacets = useCallback(() => {
    setSeveritySet(new Set());
    setPhaseSet(new Set());
    setAssetSet(new Set());
  }, []);

  const filterChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    severitySet.forEach((sev) => {
      const meta = severityMeta[sev] || severityMeta.NONE;
      chips.push({
        id: `sev-${sev}`,
        label: `Severity: ${meta.label}`,
        onRemove: () => setSeveritySet((prev) => toggleInSet(prev, sev)),
      });
    });
    phaseSet.forEach((p) => {
      chips.push({
        id: `phase-${p}`,
        label: `Phase: ${PHASE_META[p].label}`,
        onRemove: () => setPhaseSet((prev) => toggleInSet(prev, p)),
      });
    });
    assetSet.forEach((a) => {
      chips.push({
        id: `asset-${a}`,
        label: `Asset: ${a}`,
        onRemove: () => setAssetSet((prev) => toggleInSet(prev, a)),
      });
    });
    return chips;
  }, [severitySet, phaseSet, assetSet]);

  const activeFacetCount = useMemo(() => severitySet.size + phaseSet.size + assetSet.size, [severitySet, phaseSet, assetSet]);

  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sessionScoped.forEach((f: any) => {
      const p = inferPhase(f);
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [sessionScoped]);

  const stats = useMemo(() => {
    const counts: Record<string,number> = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0, NONE:0 };
    sessionScoped.forEach((f:any)=>{const s=effectiveSeverity(f);counts[s]=(counts[s]||0)+1});
    return counts;
  }, [sessionScoped]);

  const sparks = useMemo(() => {
    const ordered = [...(sessions as any[])].sort((a: any, b: any) => (a.created_at || 0) - (b.created_at || 0));
    if (ordered.length < 2) return null;
    let cV = 0, cCrit = 0;
    const vTrend: number[] = [], critTrend: number[] = [], avgTrend: number[] = [];
    ordered.forEach((s: any) => {
      cV += s.vulns_found || 0;
      const isCrit = (s.vulns_found || 0) > 5 && (s.exploits_run || 0) > 0;
      if (isCrit) cCrit++;
      vTrend.push(cV); critTrend.push(cCrit); avgTrend.push(s.vulns_found || 0);
    });
    const tail = (a: number[]) => a.slice(-8);
    return { vulns: tail(vTrend), critical: tail(critTrend), perSession: tail(avgTrend) };
  }, [sessions]);

  const mlCount = useMemo(() => sessionScoped.filter((f: any) => f._cls?.source === "ml").length, [sessionScoped]);

  const total = sessionScoped.length;
  const avgCvss = useMemo(() => {
    if (!sessionScoped.length) return 0;
    const sum = sessionScoped.reduce((s: number, f: any) => s + (parseFloat(f.cvss_score) || 0), 0);
    return sum / sessionScoped.length;
  }, [sessionScoped]);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const exploitable = useMemo(
    () => sessionScoped.filter((f: any) => (parseFloat(f.cvss_score) || 0) >= 7.0).length,
    [sessionScoped],
  );

  const exportRows = useMemo(
    () =>
      filtered.map((f: any) => ({
        severity: effectiveSeverity(f),
        title: f.title || "",
        cve: f.cve_id || "",
        cvss: f.cvss_score || 0,
        phase: PHASE_META[inferPhase(f)].label,
        asset: inferAsset(f),
        service: f.service || "",
        target: f.target || "",
        host: f.host_ip || f.host || "",
        mitre_ttps: (f._cls?.mitre_ttps || []).join("; "),
        ml_classified: f._cls?.source === "ml" ? "yes" : "no",
        description: f.description || "",
      })),
    [filtered],
  );

  const copyText = useCallback((text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error("Copy failed"),
    );
  }, []);

  const scopeLabel = selectedSessionId
    ? (ctxSession?.target || "current session")
    : selectedSession === "all"
      ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
      : (sessions.find((s: any) => s.id === selectedSession)?.target || "selected session");

  const isLoading = sessionsLoading || findingsLoading;

  return (
    <PageShell title="Findings" subtitle="Vulnerabilities discovered across engagements">
      <div className="flex h-full gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
          <StatCard
            icon={Bug}
            label="Total Findings"
            value={total}
            accent="primary"
            sublabel={scopeLabel}
            spark={sparks?.vulns}
          />
          <StatCard
            icon={ShieldAlert}
            label="Critical"
            value={stats.CRITICAL || 0}
            accent="destructive"
            progress={pct(stats.CRITICAL || 0)}
            sublabel={`${pct(stats.CRITICAL || 0)}% of findings`}
            spark={sparks?.critical}
          />
          <StatCard
            icon={AlertTriangle}
            label="High"
            value={stats.HIGH || 0}
            accent="warning"
            progress={pct(stats.HIGH || 0)}
            sublabel={`${exploitable} at CVSS ≥ 7`}
          />
          <StatCard
            icon={BarChart3}
            label="Avg CVSS"
            value={avgCvss.toFixed(1)}
            accent="accent"
            progress={Math.min(avgCvss * 10, 100)}
            sublabel="mean severity score"
          />
          <StatCard
            icon={Cpu}
            label="ML-Classified"
            value={mlCount}
            accent="violet"
            progress={pct(mlCount)}
            sublabel={`${pct(mlCount)}% auto-tagged`}
            spark={sparks?.perSession}
          />
        </div>

        <div className="node-card !p-3 shrink-0">
          <ListFilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Title, CVE, service, TTP, target..."
            activeFacetCount={activeFacetCount}
            chips={filterChips}
            onClearAllFacets={clearAllFacets}
            summary={`Showing ${filtered.length} of ${sessionScoped.length} findings`}
            betweenSearchAndFilters={
              !selectedSessionId ? (
                <select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="h-9 shrink-0 rounded-full bg-muted border border-border text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary max-w-[220px]"
                >
                  <option value="all">All sessions</option>
                  {sessions.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.target || s.id}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
            trailingActions={
              <ExportMenu
                count={filtered.length}
                onExportCsv={() => exportCSV("findings", exportRows)}
                onExportJson={() => exportJSON("findings", filtered)}
              />
            }
            panelClassName="w-[300px]"
            filterPanel={
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Severity</p>
                  <div className="grid grid-cols-2 gap-2">
                    {severityOrder.map((sev) => {
                      const meta = severityMeta[sev];
                      return (
                        <div key={sev} className="flex items-center gap-2">
                          <Checkbox
                            id={`find-sev-${sev}`}
                            checked={severitySet.has(sev)}
                            onCheckedChange={() => setSeveritySet((prev) => toggleInSet(prev, sev))}
                          />
                          <Label
                            htmlFor={`find-sev-${sev}`}
                            className={`text-xs font-normal cursor-pointer flex items-center gap-1 text-${meta.color}`}
                          >
                            <meta.icon className="w-3 h-3" />
                            {meta.label}
                            <span className="text-muted-foreground">({stats[sev] || 0})</span>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">OR between severities · empty = all</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Attack phase</p>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {PHASE_KEYS.filter((k) => (phaseCounts[k] || 0) > 0).map((k) => {
                      const meta = PHASE_META[k];
                      return (
                        <div key={k} className="flex items-center gap-2">
                          <Checkbox
                            id={`find-ph-${k}`}
                            checked={phaseSet.has(k)}
                            onCheckedChange={() => setPhaseSet((prev) => toggleInSet(prev, k))}
                          />
                          <Label
                            htmlFor={`find-ph-${k}`}
                            className="text-xs font-normal cursor-pointer"
                            style={{ color: meta.color }}
                          >
                            {meta.label}{" "}
                            <span className="opacity-60">({phaseCounts[k] || 0})</span>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Asset class</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ASSET_GROUPS.map((a) => (
                      <div key={a} className="flex items-center gap-2">
                        <Checkbox
                          id={`find-as-${a}`}
                          checked={assetSet.has(a)}
                          onCheckedChange={() => setAssetSet((prev) => toggleInSet(prev, a))}
                        />
                        <Label htmlFor={`find-as-${a}`} className="text-xs font-normal cursor-pointer">
                          {a}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Between severities/phases/assets: AND. Within one list: OR.</p>
                </div>
              </div>
            }
          />
        </div>
        <div className="flex-1 min-h-0 node-card overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Phase / Asset</th>
                  <th className="px-4 py-3 font-semibold">MITRE TTPs</th>
                  <th className="px-4 py-3 font-semibold">CVE / ID</th>
                  <th className="px-4 py-3 font-semibold">Service</th>
                  <th className="px-4 py-3 font-semibold">Target</th>
                  <th className="px-4 py-3 font-semibold">CVSS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading&&<tr><td colSpan={8} className="px-4 py-8 text-xs text-muted-foreground text-center">Loading findings...</td></tr>}
                {!isLoading&&filtered.length===0&&<tr><td colSpan={8}><EmptyState icon={Bug} title="No findings" hint="Nothing matches the current filters or session scope." compact /></td></tr>}
                {filtered.map((f:any,idx:number)=>{
                  const sev=effectiveSeverity(f);
                  const meta=severityMeta[sev]||severityMeta.NONE;
                  const phase = inferPhase(f);
                  const phaseMeta = PHASE_META[phase];
                  const asset = inferAsset(f);
                  const ttps: string[] = f._cls?.mitre_ttps || [];
                  const clsSource: string | undefined = f._cls?.source;
                  const clsConf: number | undefined = f._cls?.confidence;
                  return(
                    <tr key={`${f.sessionId}-${idx}`} onClick={() => setSelectedFinding(selectedFinding === f ? null : f)} className={`border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer ${selectedFinding === f ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-${meta.color}/15 text-${meta.color}`}>
                          <meta.icon className="w-3 h-3"/>{meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-1">
                          <div>
                            <div className="font-medium text-sm">{f.title}</div>
                            {f.description&&<div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{f.description}</div>}
                          </div>
                          <MlBadge source={clsSource} confidence={clsConf} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                            style={{ color: phaseMeta.color, background: `${phaseMeta.color}18` }}>
                            {phaseMeta.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">{asset}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <TtpChips ttps={ttps} />
                        {ttps.length === 0 && <span className="text-[10px] text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{f.cve_id||"—"}</td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">{f.service||"—"}</td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">{f.target||"—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full bg-${meta.color}`} style={{width:`${Math.min((f.cvss_score||0)*10,100)}%`}}/>
                          </div>
                          <span className="text-[11px] font-mono font-semibold">{f.cvss_score||0}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between shrink-0">
            <span>Showing {filtered.length} of {sessionScoped.length} findings</span>
            <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3"/>{sessions.length} sessions</span>
          </div>
        </div>
        </div>

        {selectedFinding && (() => {
          const f = selectedFinding;
          const sev = effectiveSeverity(f);
          const meta = severityMeta[sev] || severityMeta.NONE;
          const phase = inferPhase(f);
          const phaseMeta = PHASE_META[phase];
          const asset = inferAsset(f);
          const ttps: string[] = f._cls?.mitre_ttps || [];
          const refs: string[] = Array.isArray(f.references) ? f.references : [];
          const remediation = f.remediation || f.solution || f.fix;
          const host = f.host_ip || f.host || f.target_ip;
          const conf = f._cls?.confidence;
          return (
            <div className="w-[380px] shrink-0 node-card !p-5 overflow-y-auto scrollbar-gutter-stable flex flex-col gap-4">
              <div className="flex items-center justify-between shrink-0">
                <h3 className="font-display font-bold text-base">Finding Detail</h3>
                <button onClick={() => setSelectedFinding(null)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>

              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-${meta.color}/15 text-${meta.color}`}><meta.icon className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm leading-snug">{f.title || "Untitled finding"}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-${meta.color}/15 text-${meta.color}`}>{meta.label}</span>
                    {f._cls?.source === "ml" && <MlBadge source={f._cls?.source} confidence={conf} />}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-muted/20">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><BarChart3 className="w-3 h-3" /> CVSS</div>
                  <div className="font-display font-bold text-sm">{f.cvss_score || 0}</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/20">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Layers className="w-3 h-3" /> Phase</div>
                  <div className="font-display font-bold text-xs truncate" style={{ color: phaseMeta.color }}>{phaseMeta.label}</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/20">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Shield className="w-3 h-3" /> Asset</div>
                  <div className="font-display font-bold text-xs truncate">{asset}</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/20">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Server className="w-3 h-3" /> Service</div>
                  <div className="font-display font-bold text-xs truncate">{f.service || "—"}</div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {(f.cve_id) && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1.5"><Target className="w-3 h-3" /> CVE</span>
                    <a href={`https://nvd.nist.gov/vuln/detail/${f.cve_id}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline flex items-center gap-1">{f.cve_id}<ExternalLink className="w-3 h-3" /></a>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-mono truncate max-w-[200px]">{f.target || "—"}</span>
                </div>
                {host && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Host</span>
                    <button onClick={() => copyText(host, "Host")} className="font-mono truncate max-w-[200px] hover:text-primary flex items-center gap-1">{host}<Copy className="w-3 h-3 opacity-60" /></button>
                  </div>
                )}
              </div>

              {ttps.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Target className="w-3 h-3" /> MITRE ATT&CK</h4>
                  <TtpChips ttps={ttps} />
                </div>
              )}

              {f.description && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Description</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{f.description}</p>
                </div>
              )}

              {remediation && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5 flex items-center gap-1.5"><Shield className="w-3 h-3 text-success" /> Remediation</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{remediation}</p>
                </div>
              )}

              {refs.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">References</h4>
                  <div className="space-y-1">
                    {refs.slice(0, 8).map((r: string, i: number) => (
                      <a key={i} href={r} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-primary hover:underline truncate">{r}</a>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => copyText(JSON.stringify(f, null, 2), "Finding JSON")}
                className="mt-auto flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs hover:bg-muted transition-colors shrink-0"
              >
                <Copy className="w-3.5 h-3.5" /> Copy as JSON
              </button>
            </div>
          );
        })()}
      </div>
    </PageShell>
  );
};

export default Findings;
