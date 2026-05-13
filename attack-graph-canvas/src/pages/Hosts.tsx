import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { Server, Globe, Network, Bug, Pencil, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const Hosts = () => {
  const [selectedSid, setSelectedSid] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stateSet, setStateSet] = useState<Set<string>>(() => new Set());
  const [hasVulnerabilitiesOnly, setHasVulnerabilitiesOnly] = useState(false);
  const [minOpenPorts, setMinOpenPorts] = useState<number | "">("");
  const [selectedHost, setSelectedHost] = useState<any>(null);
  const [editingName, setEditingName] = useState(false);
  const [hostName, setHostName] = useState("");
  const { selectedSessionId, selectedSession } = useSessionContext();

  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });

  const effectiveSid = selectedSessionId || (selectedSid !== "all" ? selectedSid : null);

  const { data: sessionDetails, isLoading } = useQuery({
    queryKey: ["session-detail-hosts", effectiveSid],
    queryFn: () => getSession(effectiveSid!),
    enabled: !!effectiveSid,
  });

  const hosts = useMemo(() => {
    const sid = selectedSessionId ? selectedSession : sessionDetails;
    const scans = sid?.scan_results || [];
    const flatHosts = scans.flatMap((s: any) => s.hosts || []);
    const vulns = sid?.vulnerabilities || [];
    return flatHosts.map((h: any) => ({
      ...h,
      vulnerabilities: vulns.filter((v: any) => v.host === h.ip || v.ip === h.ip || v.target_ip === h.ip),
    }));
  }, [selectedSession, sessionDetails, selectedSessionId]);

  const filtered = useMemo(() => {
    const minP = minOpenPorts === "" ? null : Number(minOpenPorts);
    return hosts.filter((h: any) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (h.ip || "").toLowerCase().includes(q) ||
        (h.hostname || "").toLowerCase().includes(q) ||
        (h.os || "").toLowerCase().includes(q) ||
        (h.ports || []).some((p: any) => (p.service || "").toLowerCase().includes(q));
      const rawState = String(h.state || "unknown").toLowerCase();
      const matchesState = stateSet.size === 0 || stateSet.has(rawState);
      const vulnCount = h.vulnerabilities?.length ?? 0;
      const matchesVuln = !hasVulnerabilitiesOnly || vulnCount > 0;
      const openCount = (h.ports || []).filter((p: any) => p.state === "open").length;
      const matchesPorts = minP == null || !Number.isFinite(minP) || openCount >= minP;
      return matchesSearch && matchesState && matchesVuln && matchesPorts;
    });
  }, [hosts, search, stateSet, hasVulnerabilitiesOnly, minOpenPorts]);

  const clearAllFacets = useCallback(() => {
    setStateSet(new Set());
    setHasVulnerabilitiesOnly(false);
    setMinOpenPorts("");
  }, []);

  const filterChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    stateSet.forEach((s) => {
      chips.push({
        id: `st-${s}`,
        label: `State: ${s}`,
        onRemove: () => setStateSet((prev) => toggleInSet(prev, s)),
      });
    });
    if (hasVulnerabilitiesOnly) {
      chips.push({
        id: "vuln",
        label: "Has vulnerabilities",
        onRemove: () => setHasVulnerabilitiesOnly(false),
      });
    }
    if (minOpenPorts !== "" && Number.isFinite(Number(minOpenPorts))) {
      chips.push({
        id: "ports",
        label: `Open ports ≥ ${minOpenPorts}`,
        onRemove: () => setMinOpenPorts(""),
      });
    }
    return chips;
  }, [stateSet, hasVulnerabilitiesOnly, minOpenPorts]);

  const activeFacetCount = useMemo(() => {
    let n = stateSet.size;
    if (hasVulnerabilitiesOnly) n += 1;
    if (minOpenPorts !== "" && Number.isFinite(Number(minOpenPorts))) n += 1;
    return n;
  }, [stateSet, hasVulnerabilitiesOnly, minOpenPorts]);

  const handleSelectHost = (host: any) => {
    if (selectedHost?.ip === host.ip) {
      setSelectedHost(null);
      setEditingName(false);
    } else {
      setSelectedHost(host);
      setHostName(host.hostname || host.ip || "");
      setEditingName(false);
    }
  };

  const saveHostName = () => {
    if (selectedHost) {
      selectedHost.hostname = hostName || selectedHost.ip;
      setEditingName(false);
    }
  };

  return (
    <PageShell title="Hosts" subtitle="Discovered infrastructure inventory">
      <div className="flex h-full gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto scrollbar-gutter-stable">
          <div className="node-card !p-3">
            <ListFilterToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search hosts..."
              activeFacetCount={activeFacetCount}
              chips={filterChips}
              onClearAllFacets={clearAllFacets}
              summary={`${filtered.length} of ${hosts.length} hosts`}
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
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Host state</p>
                    {["up", "down", "unknown"].map((s) => (
                      <div key={s} className="flex items-center gap-2 mb-2">
                        <Checkbox
                          id={`host-st-${s}`}
                          checked={stateSet.has(s)}
                          onCheckedChange={() =>
                            setStateSet((prev) => toggleInSet(prev, s))
                          }
                        />
                        <Label htmlFor={`host-st-${s}`} className="text-xs font-normal capitalize cursor-pointer">
                          {s}
                        </Label>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground">Match is on normalized state. Empty = all.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="host-vuln-only"
                      checked={hasVulnerabilitiesOnly}
                      onCheckedChange={(c) => setHasVulnerabilitiesOnly(c === true)}
                    />
                    <Label htmlFor="host-vuln-only" className="text-xs font-normal cursor-pointer">
                      Only hosts with vulnerabilities
                    </Label>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Minimum open ports</Label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Any"
                      value={minOpenPorts}
                      onChange={(e) => setMinOpenPorts(e.target.value === "" ? "" : Number(e.target.value))}
                      className="mt-1 w-full h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    />
                  </div>
                </div>
              }
            />
          </div>
          <div className="node-card !p-0 overflow-hidden flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Host</th>
                  <th className="text-left px-3 py-3 font-medium">IP</th>
                  <th className="text-left px-3 py-3 font-medium">OS</th>
                  <th className="text-left px-3 py-3 font-medium">Open Services</th>
                  <th className="text-left px-3 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Ports</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="px-5 py-8 text-xs text-muted-foreground text-center">Loading hosts...</td></tr>}
                {!isLoading && !effectiveSid && (
                  <tr><td colSpan={6} className="px-5 py-8 text-xs text-muted-foreground text-center">{selectedSessionId ? "No host data" : "Select a session to view discovered hosts."}</td></tr>
                )}
                {!isLoading && effectiveSid && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-xs text-muted-foreground text-center">No hosts found.</td></tr>
                )}
                {filtered.map((h: any, idx: number) => {
                  const open = (h.ports || []).filter((p: any) => p.state === "open");
                  const isUp = h.state === "up";
                  const isSelected = selectedHost?.ip === h.ip;
                  return (
                    <tr key={h.ip || idx} onClick={() => handleSelectHost(h)} className={`border-t border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${isSelected ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center"><Server className="w-4 h-4" /></div><span className="font-medium">{h.hostname || "Unknown"}</span></div></td>
                      <td className="px-3 py-4 font-mono text-xs text-muted-foreground">{h.ip}</td>
                      <td className="px-3 py-4 text-xs">{h.os || "Unknown"}</td>
                      <td className="px-3 py-4"><div className="flex flex-wrap gap-1">{open.slice(0,4).map((p:any)=>(<span key={p.number} className="px-2 py-0.5 rounded-full bg-muted text-[10px]">{p.number}/{p.protocol} {p.service}</span>))}{open.length>4&&<span className="px-2 py-0.5 rounded-full bg-muted text-[10px]">+{open.length-4}</span>}</div></td>
                      <td className="px-3 py-4"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${isUp?"bg-success/15 text-success":"bg-muted text-muted-foreground"}`}>{h.state||"unknown"}</span></td>
                      <td className="px-5 py-4 text-right font-display font-bold text-sm">{open.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selectedHost && (
          <div className="w-[380px] shrink-0 node-card !p-5 overflow-y-auto scrollbar-gutter-stable flex flex-col gap-4">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="font-display font-bold text-base">Host Detail</h3>
              <button onClick={() => { setSelectedHost(null); setEditingName(false); }} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center shrink-0"><Server className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-lg bg-muted border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary" autoFocus />
                    <button onClick={saveHostName} className="p-1.5 rounded-lg bg-primary text-primary-foreground"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg bg-muted text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="font-display font-bold text-sm">{selectedHost.hostname || selectedHost.ip || "Unknown"}</div>
                    <button onClick={() => { setHostName(selectedHost.hostname || selectedHost.ip || ""); setEditingName(true); }} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  </div>
                )}
                <div className="text-[11px] font-mono text-muted-foreground">{selectedHost.ip}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Globe className="w-3 h-3" /> OS</div>
                <div className="font-display font-bold text-sm truncate">{selectedHost.os || "Unknown"}</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Network className="w-3 h-3" /> Status</div>
                <div className="font-display font-bold text-sm capitalize">{selectedHost.state || "unknown"}</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Server className="w-3 h-3" /> Open Ports</div>
                <div className="font-display font-bold text-sm">{(selectedHost.ports||[]).filter((p:any)=>p.state==="open").length}</div>
              </div>
              <div className="p-3 rounded-xl bg-muted/20">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Bug className="w-3 h-3" /> Vulns</div>
                <div className="font-display font-bold text-sm">{selectedHost.vulnerabilities?.length || 0}</div>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Network className="w-3 h-3" /> Open Ports & Services</h4>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {(selectedHost.ports||[]).filter((p:any)=>p.state==="open").length === 0 ? (
                  <div className="text-[11px] text-muted-foreground text-center py-4">No open ports.</div>
                ) : (
                  (selectedHost.ports||[]).filter((p:any)=>p.state==="open").map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-accent">{p.number}/{p.protocol}</span>
                        <span>{p.service || "unknown"}</span>
                      </div>
                      {p.version && <span className="text-muted-foreground text-[10px]">{p.version}</span>}
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedHost.vulnerabilities?.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Bug className="w-3 h-3" /> Vulnerabilities</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {selectedHost.vulnerabilities.map((v: any, i: number) => (
                    <div key={i} className="p-2 rounded-lg bg-destructive/5 border border-destructive/15 text-[11px]">
                      <div className="font-medium text-destructive">{v.name || v.title || "Vulnerability"}</div>
                      {v.description && <div className="text-muted-foreground mt-0.5 truncate">{v.description}</div>}
                      {v.severity && <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive mt-1 inline-block">{v.severity}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default Hosts;
