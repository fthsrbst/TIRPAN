import { useMemo, useState } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { StatCard } from "@/components/attack/StatCard";
import { ExportMenu } from "@/components/attack/ExportMenu";
import { EmptyState } from "@/components/attack/EmptyState";
import { exportCSV, exportJSON } from "@/lib/exportData";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { Grid3x3, Crosshair, Layers, Flame, ExternalLink } from "lucide-react";

// ── ATT&CK enterprise tactics (column order) ────────────────────────────────
type Tactic =
  | "reconnaissance" | "resource-development" | "initial-access" | "execution"
  | "persistence" | "privilege-escalation" | "defense-evasion" | "credential-access"
  | "discovery" | "lateral-movement" | "collection" | "command-and-control"
  | "exfiltration" | "impact" | "other";

const TACTIC_ORDER: { key: Tactic; label: string }[] = [
  { key: "reconnaissance", label: "Reconnaissance" },
  { key: "resource-development", label: "Resource Dev" },
  { key: "initial-access", label: "Initial Access" },
  { key: "execution", label: "Execution" },
  { key: "persistence", label: "Persistence" },
  { key: "privilege-escalation", label: "Priv Escalation" },
  { key: "defense-evasion", label: "Defense Evasion" },
  { key: "credential-access", label: "Credential Access" },
  { key: "discovery", label: "Discovery" },
  { key: "lateral-movement", label: "Lateral Movement" },
  { key: "collection", label: "Collection" },
  { key: "command-and-control", label: "Command & Control" },
  { key: "exfiltration", label: "Exfiltration" },
  { key: "impact", label: "Impact" },
  { key: "other", label: "Other" },
];

// Curated technique → {name, tactic} map covering techniques common to autonomous
// pentest engagements. Sub-techniques (T1003.001) fall back to their base id.
const TECHNIQUES: Record<string, { name: string; tactic: Tactic }> = {
  T1595: { name: "Active Scanning", tactic: "reconnaissance" },
  T1592: { name: "Gather Victim Host Information", tactic: "reconnaissance" },
  T1590: { name: "Gather Victim Network Information", tactic: "reconnaissance" },
  T1589: { name: "Gather Victim Identity Information", tactic: "reconnaissance" },
  T1587: { name: "Develop Capabilities", tactic: "resource-development" },
  T1588: { name: "Obtain Capabilities", tactic: "resource-development" },
  T1190: { name: "Exploit Public-Facing Application", tactic: "initial-access" },
  T1133: { name: "External Remote Services", tactic: "initial-access" },
  T1078: { name: "Valid Accounts", tactic: "initial-access" },
  T1566: { name: "Phishing", tactic: "initial-access" },
  T1059: { name: "Command and Scripting Interpreter", tactic: "execution" },
  T1203: { name: "Exploitation for Client Execution", tactic: "execution" },
  T1569: { name: "System Services", tactic: "execution" },
  T1053: { name: "Scheduled Task/Job", tactic: "execution" },
  T1098: { name: "Account Manipulation", tactic: "persistence" },
  T1136: { name: "Create Account", tactic: "persistence" },
  T1505: { name: "Server Software Component", tactic: "persistence" },
  T1547: { name: "Boot or Logon Autostart Execution", tactic: "persistence" },
  T1068: { name: "Exploitation for Privilege Escalation", tactic: "privilege-escalation" },
  T1134: { name: "Access Token Manipulation", tactic: "privilege-escalation" },
  T1484: { name: "Domain Policy Modification", tactic: "privilege-escalation" },
  T1548: { name: "Abuse Elevation Control Mechanism", tactic: "privilege-escalation" },
  T1070: { name: "Indicator Removal", tactic: "defense-evasion" },
  T1027: { name: "Obfuscated Files or Information", tactic: "defense-evasion" },
  T1562: { name: "Impair Defenses", tactic: "defense-evasion" },
  T1140: { name: "Deobfuscate/Decode Files", tactic: "defense-evasion" },
  T1003: { name: "OS Credential Dumping", tactic: "credential-access" },
  T1110: { name: "Brute Force", tactic: "credential-access" },
  T1558: { name: "Steal or Forge Kerberos Tickets", tactic: "credential-access" },
  T1555: { name: "Credentials from Password Stores", tactic: "credential-access" },
  T1552: { name: "Unsecured Credentials", tactic: "credential-access" },
  T1557: { name: "Adversary-in-the-Middle", tactic: "credential-access" },
  T1046: { name: "Network Service Discovery", tactic: "discovery" },
  T1018: { name: "Remote System Discovery", tactic: "discovery" },
  T1087: { name: "Account Discovery", tactic: "discovery" },
  T1083: { name: "File and Directory Discovery", tactic: "discovery" },
  T1082: { name: "System Information Discovery", tactic: "discovery" },
  T1135: { name: "Network Share Discovery", tactic: "discovery" },
  T1021: { name: "Remote Services", tactic: "lateral-movement" },
  T1570: { name: "Lateral Tool Transfer", tactic: "lateral-movement" },
  T1210: { name: "Exploitation of Remote Services", tactic: "lateral-movement" },
  T1550: { name: "Use Alternate Authentication Material", tactic: "lateral-movement" },
  T1005: { name: "Data from Local System", tactic: "collection" },
  T1039: { name: "Data from Network Shared Drive", tactic: "collection" },
  T1213: { name: "Data from Information Repositories", tactic: "collection" },
  T1071: { name: "Application Layer Protocol", tactic: "command-and-control" },
  T1572: { name: "Protocol Tunneling", tactic: "command-and-control" },
  T1090: { name: "Proxy", tactic: "command-and-control" },
  T1105: { name: "Ingress Tool Transfer", tactic: "command-and-control" },
  T1041: { name: "Exfiltration Over C2 Channel", tactic: "exfiltration" },
  T1048: { name: "Exfiltration Over Alternative Protocol", tactic: "exfiltration" },
  T1486: { name: "Data Encrypted for Impact", tactic: "impact" },
  T1490: { name: "Inhibit System Recovery", tactic: "impact" },
  T1498: { name: "Network Denial of Service", tactic: "impact" },
  T1485: { name: "Data Destruction", tactic: "impact" },
};

function baseId(ttp: string): string {
  return (ttp || "").trim().toUpperCase().split(".")[0];
}

function lookup(ttp: string): { id: string; name: string; tactic: Tactic } {
  const id = baseId(ttp);
  const t = TECHNIQUES[id];
  return { id, name: t?.name || id, tactic: t?.tactic || "other" };
}

// Heuristic mapping when a finding carries no ML-classified TTPs.
function heuristicFindingTtps(v: any): string[] {
  const et = (v.exploit_type || "").toLowerCase();
  const svc = (v.service || "").toLowerCase();
  const out = new Set<string>();
  if (et === "rce" || et === "webapps" || svc.includes("http") || svc.includes("web")) out.add("T1190");
  if (et === "remote") out.add("T1210");
  if (et === "privesc") out.add("T1068");
  if (et === "auth_bypass") out.add("T1078");
  if (et === "relay" || svc.includes("smb")) out.add("T1557");
  if (et === "info_disclosure" || et === "exposure") out.add("T1046");
  if (svc.includes("ssh") || svc.includes("ftp") || svc.includes("rdp") || svc.includes("telnet")) out.add("T1110");
  if (svc.includes("ldap") || svc.includes("kerberos")) out.add("T1558");
  if (out.size === 0) out.add("T1595");
  return [...out];
}

function exploitTtp(module: string): string {
  const m = (module || "").toLowerCase();
  if (m.includes("mimikatz") || m.includes("hashdump") || m.includes("secretsdump") || m.includes("lsass") || m.includes("sam")) return "T1003";
  if (m.includes("kerberoast") || m.includes("getuserspn") || m.includes("kerberos")) return "T1558";
  if (m.includes("psexec") || m.includes("wmiexec") || m.includes("winrm") || m.includes("smb_exec") || m.includes("dcom")) return "T1021";
  if (m.includes("brute") || m.includes("login")) return "T1110";
  if (m.includes("local_exploit") || m.includes("privesc") || m.includes("suggester") || m.includes("potato")) return "T1068";
  if (m.includes("ssh")) return "T1021";
  return "T1190";
}

interface TechAgg {
  id: string;
  name: string;
  tactic: Tactic;
  count: number;
  maxCvss: number;
  ml: boolean;
}

const AttackMatrix = () => {
  const [selectedSid, setSelectedSid] = useState<string>("all");
  const { selectedSessionId } = useSessionContext();

  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });

  const effectiveSid = selectedSessionId || (selectedSid !== "all" ? selectedSid : null);
  const isAggregate = !selectedSessionId && selectedSid === "all";

  const { data: detailed = [], isLoading } = useQuery({
    queryKey: ["matrix-detail", effectiveSid, (sessions as any[]).map((s: any) => s.id).join(",")],
    queryFn: async () => {
      if (effectiveSid) {
        const r = await getSession(effectiveSid).catch(() => null);
        return r ? [r] : [];
      }
      const results = await Promise.all((sessions as any[]).map((s: any) => getSession(s.id).catch(() => null)));
      return results.filter(Boolean) as any[];
    },
    enabled: effectiveSid != null || (isAggregate && (sessions as any[]).length > 0),
  });

  const { techMap, findingsMapped, mlCount } = useMemo(() => {
    const map = new Map<string, TechAgg>();
    let mapped = 0;
    let ml = 0;
    const bump = (ttp: string, cvss: number, isMl: boolean) => {
      const { id, name, tactic } = lookup(ttp);
      if (!id) return;
      const cur = map.get(id) || { id, name, tactic, count: 0, maxCvss: 0, ml: false };
      cur.count += 1;
      cur.maxCvss = Math.max(cur.maxCvss, cvss || 0);
      cur.ml = cur.ml || isMl;
      map.set(id, cur);
    };
    (detailed as any[]).forEach((s: any) => {
      (s.vulnerabilities || []).forEach((v: any) => {
        const cvss = parseFloat(v.cvss_score) || 0;
        const mlTtps: string[] = v._cls?.mitre_ttps || [];
        if (mlTtps.length) {
          ml += 1;
          mlTtps.forEach((t) => bump(t, cvss, true));
        } else {
          heuristicFindingTtps(v).forEach((t) => bump(t, cvss, false));
        }
        mapped += 1;
      });
      (s.exploit_results || []).forEach((e: any) => {
        bump(exploitTtp(e.module || ""), e.success ? 8 : 4, false);
      });
    });
    return { techMap: map, findingsMapped: mapped, mlCount: ml };
  }, [detailed]);

  const byTactic = useMemo(() => {
    const groups: Record<Tactic, TechAgg[]> = {} as any;
    TACTIC_ORDER.forEach((t) => (groups[t.key] = []));
    [...techMap.values()].forEach((t) => { (groups[t.tactic] ||= []).push(t); });
    Object.values(groups).forEach((arr) => arr.sort((a, b) => b.count - a.count || b.maxCvss - a.maxCvss));
    return groups;
  }, [techMap]);

  const activeTactics = useMemo(() => TACTIC_ORDER.filter((t) => (byTactic[t.key] || []).length > 0), [byTactic]);
  const totalTechniques = techMap.size;
  const topTech = useMemo(() => [...techMap.values()].sort((a, b) => b.count - a.count)[0], [techMap]);

  const exportRows = useMemo(
    () =>
      [...techMap.values()]
        .sort((a, b) => b.count - a.count)
        .map((t) => ({
          technique_id: t.id,
          technique: t.name,
          tactic: t.tactic,
          observations: t.count,
          max_cvss: t.maxCvss,
          ml_classified: t.ml ? "yes" : "no",
        })),
    [techMap],
  );

  const scopeLabel = selectedSessionId
    ? ((sessions as any[]).find((s: any) => s.id === selectedSessionId)?.target || "current session")
    : isAggregate
      ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
      : ((sessions as any[]).find((s: any) => s.id === selectedSid)?.target || "selected session");

  const cellColor = (t: TechAgg) => {
    if (t.maxCvss >= 9) return "border-destructive/40 bg-destructive/10 hover:bg-destructive/20";
    if (t.maxCvss >= 7) return "border-warning/40 bg-warning/10 hover:bg-warning/20";
    if (t.count > 0) return "border-accent/40 bg-accent/10 hover:bg-accent/20";
    return "border-border bg-muted/20 hover:bg-muted/40";
  };

  return (
    <PageShell title="ATT&CK Matrix" subtitle="MITRE ATT&CK coverage across engagements">
      <div className="flex flex-col h-full gap-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
          <StatCard icon={Grid3x3} label="Techniques" value={totalTechniques} accent="primary" sublabel={scopeLabel} />
          <StatCard icon={Layers} label="Tactics Covered" value={activeTactics.filter((t) => t.key !== "other").length} accent="accent" sublabel={`of ${TACTIC_ORDER.length - 1}`} />
          <StatCard icon={Crosshair} label="Findings Mapped" value={findingsMapped} accent="warning" sublabel={`${mlCount} ML-classified`} />
          <StatCard icon={Flame} label="Top Technique" value={topTech?.id || "—"} accent="destructive" sublabel={topTech ? `${topTech.name.slice(0, 22)}` : "no data"} />
        </div>

        {/* Scope selector */}
        {!selectedSessionId && (
          <div className="node-card !p-3 shrink-0 flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Scope</span>
            <select
              value={selectedSid}
              onChange={(e) => setSelectedSid(e.target.value)}
              className="h-9 rounded-full bg-muted border border-border text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary max-w-[240px]"
            >
              <option value="all">All sessions</option>
              {(sessions as any[]).map((s: any) => (
                <option key={s.id} value={s.id}>{s.target || s.id}</option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive/40 border border-destructive/40" /> Critical</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warning/40 border border-warning/40" /> High</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-accent/40 border border-accent/40" /> Observed</span>
              </div>
              <ExportMenu
                count={exportRows.length}
                onExportCsv={() => exportCSV("attack-matrix", exportRows)}
                onExportJson={() => exportJSON("attack-matrix", exportRows)}
              />
            </div>
          </div>
        )}

        {/* Matrix */}
        <div className="node-card !p-0 flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <EmptyState icon={Grid3x3} title="Mapping techniques…" hint="Aggregating findings across sessions." />
          ) : totalTechniques === 0 ? (
            <EmptyState icon={Grid3x3} title="No techniques observed" hint="Run a scan with findings to populate the ATT&CK matrix." />
          ) : (
            <div className="h-full overflow-auto p-3">
              <div className="flex gap-2 min-w-max h-full">
                {activeTactics.map((tac) => {
                  const techs = byTactic[tac.key] || [];
                  return (
                    <div key={tac.key} className="w-[180px] shrink-0 flex flex-col">
                      <div className="sticky top-0 z-10 bg-card pb-2">
                        <div className="text-[11px] font-bold text-foreground/90 leading-tight">{tac.label}</div>
                        <div className="text-[9px] text-muted-foreground">{techs.length} technique{techs.length === 1 ? "" : "s"}</div>
                        <div className="h-0.5 mt-1 rounded-full bg-primary/40" />
                      </div>
                      <div className="space-y-1.5">
                        {techs.map((t) => (
                          <a
                            key={t.id}
                            href={`https://attack.mitre.org/techniques/${t.id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block rounded-lg border p-2 transition-colors group ${cellColor(t)}`}
                            title={`${t.id} — ${t.name}\n${t.count} observation${t.count === 1 ? "" : "s"} · max CVSS ${t.maxCvss.toFixed(1)}`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[10px] font-bold">{t.id}</span>
                              <span className="flex items-center gap-1 shrink-0">
                                {t.ml && <span className="text-[7px] font-bold px-1 rounded bg-violet-500/20 text-violet-300">ML</span>}
                                <span className="text-[10px] font-bold tabular-nums">{t.count}</span>
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{t.name}</div>
                            <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors mt-1" />
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default AttackMatrix;
