import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { ShieldAlert, Shield, AlertTriangle, Info, BarChart3, Cpu } from "lucide-react";
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

  const filtered = useMemo(() => {
    return allFindings
      .filter((f: any) => {
        const sev = (f.severity || "NONE").toUpperCase();
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
        const mSess = selectedSession === "all" || f.sessionId === selectedSession;
        const core = mSearch && mSev && mPhase && mAsset;
        if (selectedSessionId) return core;
        return core && mSess;
      })
      .sort(
        (a: any, b: any) =>
          severityOrder.indexOf((a.severity || "NONE").toUpperCase()) -
          severityOrder.indexOf((b.severity || "NONE").toUpperCase()),
      );
  }, [allFindings, search, severitySet, phaseSet, assetSet, selectedSession, selectedSessionId]);

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
    allFindings.forEach((f: any) => {
      const p = inferPhase(f);
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [allFindings]);

  const stats = useMemo(() => {
    const counts: Record<string,number> = { CRITICAL:0, HIGH:0, MEDIUM:0, LOW:0, NONE:0 };
    allFindings.forEach((f:any)=>{const s=(f.severity||"NONE").toUpperCase();counts[s]=(counts[s]||0)+1});
    return counts;
  }, [allFindings]);

  const mlCount = useMemo(() => allFindings.filter((f: any) => f._cls?.source === "ml").length, [allFindings]);

  const isLoading = sessionsLoading || findingsLoading;

  return (
    <PageShell title="Findings" subtitle="Vulnerabilities discovered across engagements">
      <div className="flex flex-col h-full gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0 node-card !px-3 !py-2 text-[11px] text-muted-foreground">
          {severityOrder.map((sev) => {
            const meta = severityMeta[sev];
            return (
              <span key={sev} className="inline-flex items-center gap-1.5">
                <span className={`font-semibold text-${meta.color}`}>{meta.label}</span>
                <span className="font-mono text-foreground/80">{stats[sev] || 0}</span>
              </span>
            );
          })}
          {mlCount > 0 && (
            <span className="inline-flex items-center gap-1 ml-auto text-violet-400">
              <Cpu className="w-3 h-3" />
              <span className="font-mono">{mlCount}</span>
              <span>ML-classified</span>
            </span>
          )}
        </div>

        <div className="node-card !p-3 shrink-0">
          <ListFilterToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Title, CVE, service, TTP, target..."
            activeFacetCount={activeFacetCount}
            chips={filterChips}
            onClearAllFacets={clearAllFacets}
            summary={`Showing ${filtered.length} of ${allFindings.length} findings`}
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
              <span className="hidden sm:inline text-[11px] text-muted-foreground whitespace-nowrap">
                {sessions.length} sessions
              </span>
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
                {!isLoading&&filtered.length===0&&<tr><td colSpan={8} className="px-4 py-8 text-xs text-muted-foreground text-center">No findings match your filters.</td></tr>}
                {filtered.map((f:any,idx:number)=>{
                  const sev=(f.severity||"NONE").toUpperCase();
                  const meta=severityMeta[sev]||severityMeta.NONE;
                  const phase = inferPhase(f);
                  const phaseMeta = PHASE_META[phase];
                  const asset = inferAsset(f);
                  const ttps: string[] = f._cls?.mitre_ttps || [];
                  const clsSource: string | undefined = f._cls?.source;
                  const clsConf: number | undefined = f._cls?.confidence;
                  return(
                    <tr key={`${f.sessionId}-${idx}`} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
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
            <span>Showing {filtered.length} of {allFindings.length} findings</span>
            <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3"/>{sessions.length} sessions</span>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default Findings;
