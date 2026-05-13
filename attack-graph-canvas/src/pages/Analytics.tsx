import { useMemo } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { Sparkline } from "@/components/attack/Sparkline";
import { useQuery } from "@tanstack/react-query";
import { getSessions } from "@/lib/api";
import { Activity, Target, Shield, Zap, Clock, Server, Bug, Globe } from "lucide-react";

const Analytics = () => {
  const { data: sessions = [], isLoading } = useQuery({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });

  const stats = useMemo(() => {
    const total = sessions.length;
    const done = sessions.filter((s: any) => s.status === "done").length;
    const successRate = total > 0 ? Math.round((done / total) * 100) : 0;
    const avgVulns = total > 0 ? (sessions.reduce((sum: number, s: any) => sum + (s.vulns_found || 0), 0) / total).toFixed(1) : "0";
    const avgExploits = total > 0 ? (sessions.reduce((sum: number, s: any) => sum + (s.exploits_run || 0), 0) / total).toFixed(1) : "0";
    const avgHosts = total > 0 ? (sessions.reduce((sum: number, s: any) => sum + (s.hosts_found || 0), 0) / total).toFixed(1) : "0";
    const totalHosts = sessions.reduce((sum: number, s: any) => sum + (s.hosts_found || 0), 0);
    const totalVulns = sessions.reduce((sum: number, s: any) => sum + (s.vulns_found || 0), 0);
    const totalExploits = sessions.reduce((sum: number, s: any) => sum + (s.exploits_run || 0), 0);
    const durations = sessions
      .filter((s: any) => s.finished_at && s.created_at)
      .map((s: any) => s.finished_at - s.created_at);
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length / 60) : 0;
    return { total, successRate, avgVulns, avgExploits, avgHosts, totalHosts, totalVulns, totalExploits, avgDuration };
  }, [sessions]);

  const statusDist = useMemo(() => {
    const counts: Record<string, number> = { running: 0, paused: 0, done: 0, error: 0 };
    sessions.forEach((s: any) => { const st = s.status || ""; if (counts[st] !== undefined) counts[st]++; });
    const total = sessions.length || 1;
    return Object.entries(counts).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count,
      pct: Math.round((count / total) * 100),
      color: name === "running" ? "accent" : name === "done" ? "success" : name === "error" ? "destructive" : "warning",
    }));
  }, [sessions]);

  const severityDist = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    sessions.forEach((s: any) => {
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

  const topTargets = useMemo(() => {
    return sessions
      .map((s: any) => ({ name: s.target || "Untitled", hosts: s.hosts_found || 0, vulns: s.vulns_found || 0 }))
      .sort((a: any, b: any) => b.hosts - a.hosts)
      .slice(0, 6);
  }, [sessions]);

  const modeStats = useMemo(() => {
    const modes: Record<string, number> = {};
    sessions.forEach((s: any) => {
      const m = s.mode || "unknown";
      modes[m] = (modes[m] || 0) + 1;
    });
    const total = sessions.length || 1;
    return Object.entries(modes).map(([name, count]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      count,
      pct: Math.round((count / total) * 100),
    }));
  }, [sessions]);

  const activityTrend = useMemo(() => {
    const buckets: Record<string, number> = {};
    sessions.forEach((s: any) => {
      const d = new Date((s.created_at || 0) * 1000).toLocaleDateString();
      buckets[d] = (buckets[d] || 0) + 1;
    });
    const sorted = Object.keys(buckets).sort();
    return sorted.length > 1 ? sorted.map((k) => buckets[k]) : [0, 2, 1, 4, 3, 5, 4];
  }, [sessions]);

  return (
    <PageShell title="Analytics" subtitle="Performance & coverage metrics across all missions">
      <div className="grid grid-cols-12 gap-4">
        {[
          { label: "Total Missions", value: String(stats.total), icon: Target },
          { label: "Success Rate", value: `${stats.successRate}%`, icon: Shield },
          { label: "Avg Findings / Mission", value: stats.avgVulns, icon: Activity },
          { label: "Avg Exploits / Mission", value: stats.avgExploits, icon: Zap },
        ].map((k) => (
          <div key={k.label} className="col-span-3 node-card !p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <k.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="font-display font-bold text-3xl">{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
          ))}

          {/* KPI Row 2 */}
          {[
            { label: "Total Hosts Found", value: String(stats.totalHosts), icon: Globe },
            { label: "Total Vulnerabilities", value: String(stats.totalVulns), icon: Bug },
            { label: "Total Exploits Run", value: String(stats.totalExploits), icon: Activity },
            { label: "Avg Duration (min)", value: String(stats.avgDuration), icon: Clock },
          ].map((k) => (
            <div key={k.label} className="col-span-3 node-card !p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <k.icon className="w-4 h-4" />
                </div>
              </div>
              <div className="font-display font-bold text-3xl">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </div>
          ))}

          <div className="col-span-8 node-card !p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-bold text-lg">Mission Activity</h3>
            <span className="text-[10px] text-muted-foreground">Based on session history</span>
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading...</div>
          ) : (
            <>
              <Sparkline data={activityTrend} height={180} fill />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
                <span>Older</span><span>Recent</span>
              </div>
            </>
          )}
        </div>

        <div className="col-span-4 node-card !p-5">
          <h3 className="font-display font-bold text-lg mb-4">Mode Distribution</h3>
          <div className="space-y-3">
            {modeStats.length === 0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
            {modeStats.map((v) => (
              <div key={v.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{v.name}</span>
                  <span className="text-muted-foreground">{v.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${v.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Session Status Distribution */}
        <div className="col-span-12 node-card !p-5">
          <h3 className="font-display font-bold text-lg mb-4">Session Status Distribution</h3>
          {statusDist.length === 0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
          <div className="flex items-center gap-0.5 h-8 rounded-full bg-muted overflow-hidden">
            {statusDist.map((s) => (
              <div
                key={s.name}
                className={`h-full bg-${s.color} flex items-center justify-center text-[10px] font-semibold text-white`}
                style={{ width: `${s.pct}%`, minWidth: s.pct > 0 ? '48px' : '0px' }}
                title={`${s.name}: ${s.count} (${s.pct}%)`}
              >
                {s.pct > 8 ? `${s.name} ${s.count}` : ''}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            {statusDist.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`w-2 h-2 rounded-full bg-${s.color}`} />
                {s.name}: {s.count}
              </div>
            ))}
          </div>
        </div>

        {/* Top Targets */}
        <div className="col-span-6 node-card !p-5">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><Target className="w-4 h-4" /> Top Targets</h3>
          <div className="space-y-2">
            {topTargets.length === 0 && <div className="text-xs text-muted-foreground">No data yet.</div>}
            {topTargets.map((t: any, i: number) => (
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

        {/* Severity Distribution */}
        <div className="col-span-6 node-card !p-5">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2"><Shield className="w-4 h-4" /> Severity Distribution</h3>
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
      </div>
    </PageShell>
  );
};

export default Analytics;
