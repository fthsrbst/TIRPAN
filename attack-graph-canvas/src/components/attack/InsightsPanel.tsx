import { useState, useEffect } from "react";
import { Sparkline } from "./Sparkline";
import type { InsightData, SessionDetails } from "@/hooks/useAttackGraphData";
import { Clock, Server, Globe, Shield, Zap, ChevronDown, ChevronRight } from "lucide-react";

interface InsightsPanelProps {
  data: InsightData;
  details: SessionDetails;
}

function SectionHeader({
  title,
  count,
  open,
  onToggle,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full text-[10px] font-bold tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-2"
    >
      <span>{title}</span>
      <div className="flex items-center gap-1.5">
        {count !== undefined && (
          <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{count}</span>
        )}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </div>
    </button>
  );
}

export const InsightsPanel = ({ data, details }: InsightsPanelProps) => {
  const [elapsed, setElapsed] = useState(details.elapsedSeconds);
  const [openSections, setOpenSections] = useState({
    hosts: true,
    ports: true,
    vulns: false,
    exploits: false,
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
    { label: "Critical Findings", value: String(data.criticalFindings), delta: data.criticalFindings > 0 ? "High severity" : "Clean" },
    { label: "Compromised Hosts", value: String(data.compromisedHosts), delta: `${data.totalHosts} total` },
  ];

  return (
    <div className="flex flex-col gap-3 w-[280px] shrink-0 overflow-y-auto max-h-full pr-0.5">
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
              details.vulnerabilities.slice(0, 8).map((v, i) => (
                <div key={i} className="flex items-start gap-2 py-1 border-b border-border/30 last:border-0">
                  <span className={`text-[9px] font-bold font-mono shrink-0 mt-0.5 ${v.cvss >= 9 ? "text-destructive" : v.cvss >= 7 ? "text-warning" : "text-muted-foreground"}`}>
                    {v.cvss.toFixed(1)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono truncate">{v.title}</div>
                    <div className="text-[9px] text-muted-foreground">{v.host} · {v.exploitType}</div>
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
              details.recentExploits.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.success ? (e.sessionOpened ? "bg-accent" : "bg-success") : "bg-destructive/60"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-mono truncate">{e.module}</div>
                    <div className="text-[9px] text-muted-foreground">{e.host}:{e.port}</div>
                  </div>
                  {e.sessionOpened && (
                    <span className="text-[8px] font-mono bg-accent/10 text-accent px-1 py-0.5 rounded shrink-0">session</span>
                  )}
                </div>
              ))
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
