import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkline } from "./Sparkline";
import type { InsightData, SessionDetails } from "@/hooks/useAttackGraphData";
import { Clock, Server, Globe, Shield, Zap, ChevronDown, ChevronRight, Cpu, ExternalLink } from "lucide-react";
import { getMlSuggestions } from "@/lib/api";

interface InsightsPanelProps {
  data: InsightData;
  details: SessionDetails;
  sessionId?: string;
}

function SectionHeader({
  title,
  count,
  open,
  onToggle,
  badge,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full text-[10px] font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-2"
    >
      <span className="flex items-center gap-1.5">{title}{badge}</span>
      <div className="flex items-center gap-1.5">
        {count !== undefined && (
          <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{count}</span>
        )}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </div>
    </button>
  );
}

// ── Exploit success probability badge ─────────────────────────────────────────
function SuccessProbBadge({ prob }: { prob?: number }) {
  if (prob === undefined || prob === null) return null;
  const pct = Math.round(prob * 100);
  const color = pct >= 70 ? "text-green-400" : pct >= 40 ? "text-yellow-400" : "text-muted-foreground";
  const bg    = pct >= 70 ? "bg-green-500/10" : pct >= 40 ? "bg-yellow-500/10" : "bg-muted/40";
  return (
    <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${color} ${bg}`}
      title={`ML exploit success probability: ${pct}%`}>
      {pct}%
    </span>
  );
}

// ── TTP confidence bar ─────────────────────────────────────────────────────────
function ConfidenceBar({ value, color = "bg-violet-500" }: { value: number; color?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground shrink-0 w-7 text-right">{pct}%</span>
    </div>
  );
}

const TACTIC_COLORS: Record<string, string> = {
  "reconnaissance":      "bg-purple-500",
  "resource-development":"bg-purple-500",
  "initial-access":      "bg-red-500",
  "execution":           "bg-orange-500",
  "persistence":         "bg-yellow-500",
  "privilege-escalation":"bg-amber-500",
  "defense-evasion":     "bg-lime-500",
  "credential-access":   "bg-green-500",
  "discovery":           "bg-teal-500",
  "lateral-movement":    "bg-cyan-500",
  "collection":          "bg-blue-500",
  "command-and-control": "bg-indigo-500",
  "exfiltration":        "bg-violet-500",
  "impact":              "bg-rose-500",
};

export const InsightsPanel = ({ data, details, sessionId }: InsightsPanelProps) => {
  const [elapsed, setElapsed] = useState(details.elapsedSeconds);
  const [openSections, setOpenSections] = useState({
    hosts:       true,
    ports:       true,
    vulns:       false,
    exploits:    false,
    mlPaths:     true,
  });

  // Live elapsed timer
  useEffect(() => {
    setElapsed(details.elapsedSeconds);
    if (!details.isRunning || !details.startTime) return;
    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.round(Date.now() / 1000 - details.startTime)));
    }, 1000);
    return () => clearInterval(id);
  }, [details.isRunning, details.startTime, details.elapsedSeconds]);

  const hh = elapsed >= 3600 ? String(Math.floor(elapsed / 3600)).padStart(2, "0") : "";
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const timeDisplay = elapsed >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;

  const toggle = (key: keyof typeof openSections) =>
    setOpenSections((p) => ({ ...p, [key]: !p[key] }));

  const insights = [
    { label: "Open Attack Paths", value: String(data.openAttackPaths), delta: data.openAttackPaths > 0 ? `${data.openAttackPaths} active` : "None" },
    { label: "Critical Findings", value: String(data.criticalFindings), delta: data.highFindings > 0 ? `+${data.highFindings} high` : data.criticalFindings > 0 ? "CVSS 9.0+" : "Clean" },
    { label: "Compromised Hosts", value: String(data.compromisedHosts), delta: `${data.totalHosts} total` },
  ];

  // ── ML Suggestions query ─────────────────────────────────────────────────
  const { data: mlData } = useQuery({
    queryKey: ["ml-suggestions", sessionId],
    queryFn: () => getMlSuggestions(sessionId!, 8),
    enabled: !!sessionId,
    // Refetch every 8s while running (phase advances), every 60s when idle
    refetchInterval: details.isRunning ? 8000 : 60000,
    staleTime: 5000,   // session değişince hemen yeni data çek
  });

  const mlSuggestions: any[] = mlData?.suggestions || [];
  const mlPhase: string = mlData?.current_phase || "";
  const mlContext: any = mlData?.context || {};
  const mlPhaseSource: string = mlContext.phase_source || "";

  return (
    <div className="flex flex-col gap-3 w-[280px] shrink-0 overflow-y-auto max-h-full pr-0.5">
      {/* Stat chips row */}
      <div className="grid grid-cols-2 gap-2 shrink-0">
        <div className="node-card !p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground">VULNERABILITIES</span>
          <div className="flex items-baseline gap-1">
            <span className={`font-display font-bold text-2xl leading-none ${data.totalVulns > 0 ? "text-destructive" : "text-foreground"}`}>{data.totalVulns}</span>
            {(data.criticalFindings > 0 || data.highFindings > 0) && (
              <span className="text-[9px] font-mono">
                {data.criticalFindings > 0 && <span className="text-destructive/70">{data.criticalFindings} critical</span>}
                {data.criticalFindings > 0 && data.highFindings > 0 && <span className="text-muted-foreground"> · </span>}
                {data.highFindings > 0 && <span className="text-warning/80">{data.highFindings} high</span>}
              </span>
            )}
          </div>
        </div>
        <div className="node-card !p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold tracking-widests text-muted-foreground">OPEN PORTS</span>
          <div className="flex items-baseline gap-1">
            <span className={`font-display font-bold text-2xl leading-none ${details.openPorts.length > 0 ? "text-warning" : "text-foreground"}`}>{details.openPorts.length}</span>
            <span className="text-[9px] font-mono text-muted-foreground">{details.hosts.length} hosts</span>
          </div>
        </div>
        <div className="node-card !p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground">COMPROMISED</span>
          <div className="flex items-baseline gap-1">
            <span className={`font-display font-bold text-2xl leading-none ${data.compromisedHosts > 0 ? "text-accent" : "text-foreground"}`}>{data.compromisedHosts}</span>
            <span className="text-[9px] font-mono text-muted-foreground">/ {data.totalHosts}</span>
          </div>
        </div>
        <div className="node-card !p-3 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold tracking-widest text-muted-foreground">ATTACK PATHS</span>
          <div className="flex items-baseline gap-1">
            <span className={`font-display font-bold text-2xl leading-none ${data.openAttackPaths > 0 ? "text-violet-400" : "text-foreground"}`}>{data.openAttackPaths}</span>
            <span className="text-[9px] font-mono text-muted-foreground">active</span>
          </div>
        </div>
      </div>

      {/* Timer card */}
      <div className="node-card !p-4 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Clock className={`w-3.5 h-3.5 ${details.isRunning ? "text-accent animate-pulse" : "text-muted-foreground"}`} />
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground">SESSION TIME</span>
          {details.isRunning && (
            <span className="ml-auto text-[9px] font-mono bg-accent/10 text-accent px-1.5 py-0.5 rounded-full border border-accent/30 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />
              live
            </span>
          )}
        </div>
        <div className="font-display font-bold text-3xl tracking-tight text-foreground">{timeDisplay}</div>
        {details.target && (
          <div className="text-[10px] text-muted-foreground font-mono mt-1 truncate">{details.target}</div>
        )}
      </div>

      {/* Risk + insights */}
      <div className="node-card !p-4 shrink-0">
        <h4 className="text-[10px] font-bold tracking-widest text-muted-foreground mb-3">RISK SCORE</h4>
        <div className="flex items-end gap-2 mb-1">
          <span className={`font-display font-bold text-4xl ${data.riskScore >= 70 ? "text-destructive" : data.riskScore >= 40 ? "text-warning" : "text-foreground"}`}>
            {data.riskScore}
          </span>
          <span className="text-sm text-muted-foreground mb-1">/100</span>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
            data.riskLabel === "Critical" ? "bg-destructive/10 text-destructive border border-destructive/30" :
            data.riskLabel === "High"     ? "bg-warning/10 text-warning border border-warning/30" :
            data.riskLabel === "Medium"   ? "bg-accent/10 text-accent border border-accent/30" :
            "bg-muted text-muted-foreground"
          }`}>{data.riskLabel}</span>
        </div>
        <Sparkline
          data={data.riskTrend.length >= 2 ? data.riskTrend : [0, data.riskScore / 4, data.riskScore / 2, data.riskScore * 0.75, data.riskScore]}
          color={data.riskScore >= 70 ? "hsl(var(--destructive))" : "hsl(var(--accent))"}
          fill
          height={32}
        />
        <div className="space-y-2 mt-3">
          {insights.map((i) => (
            <div key={i.label} className="flex items-baseline justify-between">
              <span className="text-[10px] text-muted-foreground">{i.label}</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display font-bold text-base">{i.value}</span>
                <span className="text-[9px] text-muted-foreground">{i.delta}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hosts section */}
      <div className="node-card !p-4 shrink-0">
        <SectionHeader title="HOSTS" count={details.hosts.length} open={openSections.hosts} onToggle={() => toggle("hosts")} />
        {openSections.hosts && (
          <div className="space-y-1.5">
            {details.hosts.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No hosts discovered yet</p>
            ) : (
              details.hosts.map((h) => (
                <div key={h.ip} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.compromised ? (h.sessionLevel >= 3 ? "bg-destructive" : h.sessionLevel >= 2 ? "bg-warning" : "bg-accent") : "bg-muted-foreground/40"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono font-semibold">{h.ip}</div>
                    <div className="text-[9px] text-muted-foreground truncate">{h.os}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {h.shellAccess && (
                      <span className="text-[8px] font-mono bg-accent/10 text-accent px-1 py-0.5 rounded">shell</span>
                    )}
                    <span className="text-[9px] font-mono text-muted-foreground">{h.openPorts}p</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Ports section */}
      <div className="node-card !p-4 shrink-0">
        <SectionHeader title="OPEN PORTS" count={details.openPorts.length} open={openSections.ports} onToggle={() => toggle("ports")} />
        {openSections.ports && (
          <div className="space-y-1">
            {details.openPorts.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No ports found yet</p>
            ) : (
              details.openPorts.slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span className="text-[9px] font-mono text-accent w-10 shrink-0">{p.num}</span>
                  <span className="text-[9px] font-mono text-foreground flex-1 truncate">{p.service}</span>
                  <span className="text-[9px] font-mono text-muted-foreground shrink-0 max-w-[80px] truncate">{p.host}</span>
                </div>
              ))
            )}
            {details.openPorts.length > 10 && (
              <p className="text-[9px] text-muted-foreground pt-1">+{details.openPorts.length - 10} more</p>
            )}
          </div>
        )}
      </div>

      {/* Vulnerabilities section */}
      <div className="node-card !p-4 shrink-0">
        <SectionHeader title="VULNERABILITIES" count={details.vulnerabilities.length} open={openSections.vulns} onToggle={() => toggle("vulns")} />
        {openSections.vulns && (
          <div className="space-y-1.5">
            {details.vulnerabilities.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No vulnerabilities found yet</p>
            ) : (
              details.vulnerabilities.slice(0, 8).map((v: any, i) => (
                <div key={i} className="flex items-start gap-2 py-1 border-b border-border/30 last:border-0">
                  <span className={`text-[9px] font-bold font-mono shrink-0 mt-0.5 ${v.cvss >= 9 ? "text-destructive" : v.cvss >= 7 ? "text-warning" : "text-muted-foreground"}`}>
                    {v.cvss.toFixed(1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono truncate">{v.title}</div>
                    <div className="text-[9px] text-muted-foreground">{v.host} · {v.exploitType}</div>
                    {/* TTP chips from ML classification */}
                    {(v._cls?.mitre_ttps || []).length > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-0.5">
                        {(v._cls.mitre_ttps as string[]).slice(0, 3).map((ttp) => (
                          <a key={ttp} href={`https://attack.mitre.org/techniques/${ttp.replace(".", "/")}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-[8px] font-mono px-1 py-0.5 rounded bg-violet-500/10 text-violet-400 hover:bg-violet-500/20">
                            {ttp}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Recent exploits */}
      <div className="node-card !p-4 shrink-0">
        <SectionHeader title="RECENT EXPLOITS" count={details.recentExploits.length} open={openSections.exploits} onToggle={() => toggle("exploits")} />
        {openSections.exploits && (
          <div className="space-y-1.5">
            {details.recentExploits.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">No exploits attempted yet</p>
            ) : (
              details.recentExploits.slice(0, 8).map((e: any, i) => (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.success ? (e.sessionOpened ? "bg-accent" : "bg-success") : "bg-destructive/60"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono truncate">{e.module}</div>
                    <div className="text-[9px] text-muted-foreground">{e.host}:{e.port}</div>
                  </div>
                  {/* ML exploit success probability */}
                  <SuccessProbBadge prob={e.ml_success_prob} />
                  {e.sessionOpened && (
                    <span className="text-[8px] font-mono bg-accent/10 text-accent px-1 py-0.5 rounded shrink-0">session</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ML Suggested Next Steps */}
      <div className="node-card !p-4 shrink-0">
        <SectionHeader
          title="NEXT ATTACK STEPS"
          count={mlSuggestions.length}
          open={openSections.mlPaths}
          onToggle={() => toggle("mlPaths")}
          badge={
            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-bold bg-violet-500/15 text-violet-400 ml-1">
              <Cpu className="w-2 h-2" />AI
            </span>
          }
        />
        {openSections.mlPaths && (
          <div className="space-y-2">
            {/* Current phase context */}
            {mlPhase && (
              <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-border/30">
                <span className="text-[9px] text-muted-foreground">Phase:</span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent capitalize">
                  {mlPhase.replace(/_/g, " ")}
                </span>
                {mlPhaseSource === "inferred" && (
                  <span className="text-[8px] text-muted-foreground/60 italic">auto-detected</span>
                )}
                <span className="text-[8px] text-muted-foreground ml-auto italic">MITRE ATT&CK</span>
              </div>
            )}
            {mlSuggestions.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">
                {sessionId ? "Scan a target to get AI recommendations" : "Select a session to see suggestions"}
              </p>
            ) : (
              <>
                <p className="text-[9px] text-muted-foreground mb-2">
                  Recommended techniques for the next phase, based on discovered services and attack history.
                </p>
                {mlSuggestions.map((s: any, idx: number) => {
                  const barColor = TACTIC_COLORS[s.tactic] || "bg-violet-500";
                  const tacticLabel = s.tactic.replace(/-/g, " ");
                  return (
                    <div key={s.ttp_id} className="group flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
                      {/* Rank + ID */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <span className="text-[8px] text-muted-foreground/50 font-mono w-4 text-center">
                          {idx + 1}
                        </span>
                        <a
                          href={s.url || `https://attack.mitre.org/techniques/${s.ttp_id.replace(".", "/")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors group-hover:ring-1 ring-primary/20"
                          title={`Open MITRE ATT&CK page for ${s.ttp_id}`}
                        >
                          {s.ttp_id}
                          <ExternalLink className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      </div>
                      {/* Name + tactic + confidence */}
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold text-foreground/90 truncate leading-tight">
                          {s.ttp_name}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className={`text-[7px] font-mono uppercase px-1 py-0.5 rounded ${barColor}/20 text-foreground/60`}>
                            {tacticLabel}
                          </span>
                        </div>
                        <ConfidenceBar value={s.confidence} color={barColor} />
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Attack vectors */}
      <div className="node-card !p-4 shrink-0">
        <h4 className="text-[10px] font-bold tracking-widest text-muted-foreground mb-3">ATTACK VECTORS</h4>
        <div className="space-y-2">
          {data.attackVectors.map((v) => (
            <div key={v.label}>
              <div className="flex justify-between text-[10px] mb-1">
                <span className="text-muted-foreground">{v.label}</span>
                <span className="font-mono">{v.pct}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${v.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
