import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getReportHtml } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileText, Calendar, Bug, Download, Clock, Target, Activity } from "lucide-react";

const severityFromScore = (vulns: number, exploits: number) => {
  if (exploits > 0 && vulns > 5) return { label: "Critical", color: "destructive" };
  if (exploits > 0 || vulns > 3) return { label: "High", color: "warning" };
  if (vulns > 0) return { label: "Medium", color: "accent" };
  return { label: "Low", color: "success" };
};

const REPORT_STATUSES = ["running", "done", "paused", "error", "idle"] as const;
const SEV_LABELS = ["critical", "high", "medium", "low"] as const;

const Reports = () => {
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusSet, setStatusSet] = useState<Set<string>>(() => new Set());
  const [severitySet, setSeveritySet] = useState<Set<string>>(() => new Set());
  const [minHosts, setMinHosts] = useState<number | "">("");
  const [minVulns, setMinVulns] = useState<number | "">("");
  const { selectedSessionId } = useSessionContext();
  const effectiveSid = selectedSid ?? selectedSessionId;

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const { data: reportHtml, isLoading: reportLoading } = useQuery({
    queryKey: ["report", effectiveSid],
    queryFn: () => getReportHtml(effectiveSid!),
    enabled: !!effectiveSid,
  });

  const filtered = useMemo(() => {
    const minH = minHosts === "" ? null : Number(minHosts);
    const minV = minVulns === "" ? null : Number(minVulns);
    return sessions
      .filter((s: any) => {
        const q = search.toLowerCase();
        const label = sessionDisplayLabel(s).toLowerCase();
        const matchesSearch =
          !q ||
          label.includes(q) ||
          (s.target && s.target.toLowerCase().includes(q)) ||
          (s.id && s.id.toLowerCase().includes(q));
        const st = s.status || "idle";
        const matchesStatus = statusSet.size === 0 || statusSet.has(st);
        const sev = severityFromScore(s.vulns_found || 0, s.exploits_run || 0);
        const sevKey = sev.label.toLowerCase();
        const matchesSeverity = severitySet.size === 0 || severitySet.has(sevKey);
        const hCount = s.hosts_found ?? 0;
        const vCount = s.vulns_found ?? 0;
        const matchesMinH = minH == null || !Number.isFinite(minH) || hCount >= minH;
        const matchesMinV = minV == null || !Number.isFinite(minV) || vCount >= minV;
        return matchesSearch && matchesStatus && matchesSeverity && matchesMinH && matchesMinV;
      })
      .sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0));
  }, [sessions, search, statusSet, severitySet, minHosts, minVulns]);

  const clearAllFacets = useCallback(() => {
    setStatusSet(new Set());
    setSeveritySet(new Set());
    setMinHosts("");
    setMinVulns("");
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
    severitySet.forEach((sev) => {
      chips.push({
        id: `sev-${sev}`,
        label: `Severity: ${sev}`,
        onRemove: () => setSeveritySet((prev) => toggleInSet(prev, sev)),
      });
    });
    if (minHosts !== "" && Number.isFinite(Number(minHosts))) {
      chips.push({
        id: "min-h",
        label: `Hosts ≥ ${minHosts}`,
        onRemove: () => setMinHosts(""),
      });
    }
    if (minVulns !== "" && Number.isFinite(Number(minVulns))) {
      chips.push({
        id: "min-v",
        label: `Vulns ≥ ${minVulns}`,
        onRemove: () => setMinVulns(""),
      });
    }
    return chips;
  }, [statusSet, severitySet, minHosts, minVulns]);

  const activeFacetCount = useMemo(() => {
    let n = statusSet.size + severitySet.size;
    if (minHosts !== "" && Number.isFinite(Number(minHosts))) n += 1;
    if (minVulns !== "" && Number.isFinite(Number(minVulns))) n += 1;
    return n;
  }, [statusSet, severitySet, minHosts, minVulns]);

  const selectedSession = useMemo(
    () => sessions.find((s: any) => s.id === effectiveSid),
    [sessions, effectiveSid]
  );

  const handleDownloadHtml = () => {
    if (!reportHtml || !effectiveSid) return;
    const blob = new Blob([reportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${effectiveSid}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!effectiveSid) return;
    setPdfLoading(true);
    try {
      const token = localStorage.getItem("tirpan_token") || sessionStorage.getItem("tirpan_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/v1/sessions/${effectiveSid}/report/pdf`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${effectiveSid}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
    }
    setPdfLoading(false);
  };

  return (
    <PageShell title="Reports" subtitle="Generated engagement deliverables">
      <div className="flex h-full gap-4">
        {/* Left Panel */}
        <div className="w-[340px] shrink-0 flex flex-col gap-3 h-full">
          <div className="node-card !p-3 shrink-0">
            <ListFilterToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search reports..."
              activeFacetCount={activeFacetCount}
              chips={filterChips}
              onClearAllFacets={clearAllFacets}
              summary={`${filtered.length} of ${sessions.length} sessions`}
              panelClassName="w-[300px]"
              filterPanel={
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Status</p>
                    <div className="grid grid-cols-2 gap-2">
                      {REPORT_STATUSES.map((st) => (
                        <div key={st} className="flex items-center gap-2">
                          <Checkbox
                            id={`r-st-${st}`}
                            checked={statusSet.has(st)}
                            onCheckedChange={() => setStatusSet((prev) => toggleInSet(prev, st))}
                          />
                          <Label htmlFor={`r-st-${st}`} className="text-xs font-normal capitalize cursor-pointer">
                            {st}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Risk / severity</p>
                    <div className="grid grid-cols-2 gap-2">
                      {SEV_LABELS.map((sev) => (
                        <div key={sev} className="flex items-center gap-2">
                          <Checkbox
                            id={`r-sev-${sev}`}
                            checked={severitySet.has(sev)}
                            onCheckedChange={() => setSeveritySet((prev) => toggleInSet(prev, sev))}
                          />
                          <Label htmlFor={`r-sev-${sev}`} className="text-xs font-normal capitalize cursor-pointer">
                            {sev}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">Empty = all</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Min hosts</Label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Any"
                        value={minHosts}
                        onChange={(e) => setMinHosts(e.target.value === "" ? "" : Number(e.target.value))}
                        className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs"
                      />
                    </div>
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
                  </div>
                </div>
              }
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-gutter-stable space-y-2 px-1.5 py-1">
            {isLoading && (
              <div className="text-xs text-muted-foreground text-center py-8">Loading sessions...</div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">No reports found.</div>
            )}
            {filtered.map((s: any) => {
              const sev = severityFromScore(s.vulns_found || 0, s.exploits_run || 0);
              const dateStr = s.created_at
                ? new Date(s.created_at * 1000).toLocaleDateString()
                : "Unknown";
              const isActive = effectiveSid === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSid(s.id)}
                  className={`node-card !p-4 w-full text-left transition-all hover:opacity-90 ${
                    isActive ? "ring-2 ring-inset ring-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-${sev.color}/15 text-${sev.color}`}
                    >
                      {sev.label}
                    </span>
                  </div>
                  <h3 className="font-display font-bold text-sm leading-tight mb-1 truncate">
                    {sessionDisplayLabel(s) || s.target || s.id}
                  </h3>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/40">
                    <span className="flex items-center gap-1">
                      <Target className="w-3 h-3" /> {s.hosts_found || 0} hosts
                    </span>
                    <span className="flex items-center gap-1">
                      <Bug className="w-3 h-3" /> {s.vulns_found || 0} vulns
                    </span>
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3" /> {s.exploits_run || 0} exploits
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 min-w-0 node-card overflow-hidden flex flex-col relative">
          {effectiveSid && selectedSession ? (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
                <div className="min-w-0">
                  <h2 className="font-display font-bold text-base truncate">
                    {selectedSession.target || selectedSession.id}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedSession.status} · {new Date((selectedSession.created_at || 0) * 1000).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={handleDownloadHtml}
                    className="flex items-center gap-2 px-3 py-2 rounded-full border border-border text-xs font-medium hover:bg-muted"
                  >
                    <Download className="w-3.5 h-3.5" /> HTML
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={pdfLoading}
                    className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {pdfLoading ? "Oluşturuluyor..." : "PDF İndir"}
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 relative bg-background">
                {reportLoading ? (
                  <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                    Loading report...
                  </div>
                ) : (
                  <iframe
                    title="Report"
                    srcDoc={reportHtml || "<html><body style='background:#000;color:#fff;padding:20px;'>No report content.</body></html>"}
                    className="w-full h-full border-0"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <FileText className="w-10 h-10 opacity-20" />
              <p className="text-sm">Select a report from the left panel to view details.</p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default Reports;
