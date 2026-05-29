import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { StatCard } from "@/components/attack/StatCard";
import { ExportMenu } from "@/components/attack/ExportMenu";
import { EmptyState } from "@/components/attack/EmptyState";
import { exportCSV, exportJSON, downloadFile } from "@/lib/exportData";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSessionCredentialsHarvested } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { KeyRound, Shield, User, Crown, Eye, EyeOff, Server, Copy, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const Credentials = () => {
  const [selectedSid, setSelectedSid] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [typeSet, setTypeSet] = useState<Set<string>>(() => new Set());
  const [mustHaveSecret, setMustHaveSecret] = useState(false);
  const [show, setShow] = useState(false);
  const { selectedSessionId } = useSessionContext();

  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });

  const effectiveSid = selectedSessionId || (selectedSid !== "all" ? selectedSid : null);
  const isAggregate = !selectedSessionId && selectedSid === "all";

  const { data: credData, isLoading: singleLoading } = useQuery({
    queryKey: ["session-creds", effectiveSid],
    queryFn: () => getSessionCredentialsHarvested(effectiveSid!),
    enabled: !!effectiveSid,
  });

  const { data: aggCreds = [], isLoading: aggLoading } = useQuery({
    queryKey: ["creds-aggregate", (sessions as any[]).map((s: any) => s.id).join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        (sessions as any[]).map((s: any) => getSessionCredentialsHarvested(s.id).catch(() => null)),
      );
      // The live API returns { credentials: [...] }; demo/mock returns a bare array.
      return results.flatMap((r: any) => (Array.isArray(r) ? r : r?.credentials || []));
    },
    enabled: isAggregate && sessions.length > 0,
  });

  const isLoading = isAggregate ? aggLoading : singleLoading;

  const credentials = useMemo(
    () => (isAggregate ? aggCreds : Array.isArray(credData) ? credData : credData?.credentials || []),
    [isAggregate, aggCreds, credData],
  );

  const scopeLabel = selectedSessionId
    ? ((sessions as any[]).find((s: any) => s.id === selectedSessionId)?.target || "current session")
    : isAggregate
      ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
      : ((sessions as any[]).find((s: any) => s.id === selectedSid)?.target || "selected session");

  const credStats = useMemo(() => {
    const norm = (c: any) => String(c.type || "").toLowerCase();
    const privileged = credentials.filter((c: any) => /domain|admin|root/.test(norm(c))).length;
    const withSecret = credentials.filter((c: any) => {
      const s = String(c.hash || c.password || "").trim();
      return s.length > 0 && s !== "—";
    }).length;
    const hostSet = new Set(
      credentials.map((c: any) => c.host || c.host_pattern).filter(Boolean),
    );
    return { privileged, withSecret, uniqueHosts: hostSet.size, total: credentials.length };
  }, [credentials]);
  const cpct = (n: number) => (credStats.total ? Math.round((n / credStats.total) * 100) : 0);

  // Credential reuse: a secret (password or hash) seen on two or more distinct
  // hosts is a high-value lateral-movement signal worth surfacing.
  const reusedSecrets = useMemo(() => {
    const byHost: Record<string, Set<string>> = {};
    credentials.forEach((c: any) => {
      const secret = String(c.hash || c.password || "").trim();
      if (!secret || secret === "—") return;
      const host = String(c.host || c.host_pattern || c.target || "?");
      (byHost[secret] ||= new Set()).add(host);
    });
    const reused = new Set<string>();
    Object.entries(byHost).forEach(([secret, hosts]) => { if (hosts.size >= 2) reused.add(secret); });
    return reused;
  }, [credentials]);

  const isReused = useCallback((c: any) => {
    const secret = String(c.hash || c.password || "").trim();
    return !!secret && secret !== "—" && reusedSecrets.has(secret);
  }, [reusedSecrets]);

  const reusedCount = useMemo(() => credentials.filter((c: any) => isReused(c)).length, [credentials, isReused]);

  const copyText = useCallback((text: string, what: string) => {
    if (!text || text === "—") return;
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error("Copy failed"));
  }, []);

  const typesInData = useMemo(() => {
    const ts = new Set<string>();
    credentials.forEach((c: any) => {
      ts.add(String(c.type || "User"));
    });
    return [...ts].sort();
  }, [credentials]);

  const filtered = useMemo(() => {
    return credentials.filter((c: any) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (c.username || "").toLowerCase().includes(q) ||
        (c.host || "").toLowerCase().includes(q) ||
        (c.type || "").toLowerCase().includes(q);
      const t = String(c.type || "User");
      const matchesType = typeSet.size === 0 || typeSet.has(t);
      const secret = String(c.hash || c.password || "").trim();
      const matchesSecret = !mustHaveSecret || (secret.length > 0 && secret !== "—");
      return matchesSearch && matchesType && matchesSecret;
    });
  }, [credentials, search, typeSet, mustHaveSecret]);

  const clearAllFacets = useCallback(() => {
    setTypeSet(new Set());
    setMustHaveSecret(false);
  }, []);

  const filterChips: FilterChipModel[] = useMemo(() => {
    const chips: FilterChipModel[] = [];
    typeSet.forEach((t) => {
      chips.push({
        id: `ty-${t}`,
        label: `Type: ${t}`,
        onRemove: () => setTypeSet((prev) => toggleInSet(prev, t)),
      });
    });
    if (mustHaveSecret) {
      chips.push({
        id: "secret",
        label: "Has secret",
        onRemove: () => setMustHaveSecret(false),
      });
    }
    return chips;
  }, [typeSet, mustHaveSecret]);

  const activeFacetCount = useMemo(() => typeSet.size + (mustHaveSecret ? 1 : 0), [typeSet, mustHaveSecret]);

  const exportRows = useMemo(
    () =>
      filtered.map((c: any) => ({
        username: c.username || c.user || "",
        type: c.type || "User",
        secret: c.hash || c.password || "",
        host: c.host || c.host_pattern || c.target || "",
        source: c.source || "",
        reused: isReused(c) ? "yes" : "no",
      })),
    [filtered, isReused],
  );

  const exportHashes = useCallback(() => {
    const lines = filtered
      .map((c: any) => String(c.hash || c.password || "").trim())
      .filter((s: string) => s && s !== "—");
    if (!lines.length) { toast.error("No hashes to export"); return; }
    downloadFile(`tirpan-hashes-${Date.now()}.txt`, lines.join("\n"), "text/plain");
  }, [filtered]);

  const exportUserPass = useCallback(() => {
    const lines = filtered
      .map((c: any) => {
        const s = String(c.hash || c.password || "").trim();
        return s && s !== "—" ? `${c.username || c.user || "user"}:${s}` : null;
      })
      .filter(Boolean) as string[];
    if (!lines.length) { toast.error("No credentials to export"); return; }
    downloadFile(`tirpan-userpass-${Date.now()}.txt`, lines.join("\n"), "text/plain");
  }, [filtered]);

  const typeIcon = (t: string) => {
    const l = (t||"").toLowerCase();
    if (l.includes("domain")||l.includes("admin")) return { icon: Crown, color: "destructive" };
    if (l.includes("admin")||l.includes("service")) return { icon: Shield, color: "warning" };
    return { icon: User, color: "accent" };
  };

  return (
    <PageShell title="Credentials" subtitle="Harvested authentication material">
      <div className="flex flex-col h-full gap-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
          <StatCard
            icon={KeyRound}
            label="Total Credentials"
            value={credStats.total}
            accent="primary"
            sublabel={scopeLabel}
          />
          <StatCard
            icon={Crown}
            label="Privileged"
            value={credStats.privileged}
            accent="destructive"
            progress={cpct(credStats.privileged)}
            sublabel={`${cpct(credStats.privileged)}% admin/domain`}
          />
          <StatCard
            icon={Shield}
            label="With Secret"
            value={credStats.withSecret}
            accent="warning"
            progress={cpct(credStats.withSecret)}
            sublabel="password or hash"
          />
          <StatCard
            icon={Repeat}
            label="Reused"
            value={reusedCount}
            accent={reusedCount > 0 ? "destructive" : "muted"}
            progress={cpct(reusedCount)}
            sublabel="same secret, 2+ hosts"
            hint="Credentials whose password/hash appears on multiple hosts — strong lateral-movement candidates."
          />
          <StatCard
            icon={Server}
            label="Unique Hosts"
            value={credStats.uniqueHosts}
            accent="accent"
            sublabel="distinct sources"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between shrink-0">
          <div className="node-card !p-3 flex-1 min-w-0">
            <ListFilterToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search credentials..."
              activeFacetCount={activeFacetCount}
              chips={filterChips}
              onClearAllFacets={clearAllFacets}
              summary={`${filtered.length} of ${credentials.length} rows`}
              betweenSearchAndFilters={
                !selectedSessionId ? (
                  <select
                    value={selectedSid}
                    onChange={(e) => setSelectedSid(e.target.value)}
                    className="h-9 shrink-0 rounded-full bg-muted border border-border text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary max-w-[200px]"
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
                <>
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted shrink-0 h-9"
                  >
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {show ? "Mask" : "Reveal"}
                  </button>
                  <ExportMenu
                    count={filtered.length}
                    onExportCsv={() => exportCSV("credentials", exportRows)}
                    onExportJson={() => exportJSON("credentials", filtered)}
                    extra={[
                      { label: "Hashes (.txt)", icon: KeyRound, onSelect: exportHashes },
                      { label: "user:pass (.txt)", icon: User, onSelect: exportUserPass },
                    ]}
                  />
                </>
              }
              filterPanel={
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Credential type</p>
                    {typesInData.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No rows.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {typesInData.map((t) => (
                          <div key={t} className="flex items-center gap-2">
                            <Checkbox
                              id={`cred-ty-${t}`}
                              checked={typeSet.has(t)}
                              onCheckedChange={() => setTypeSet((prev) => toggleInSet(prev, t))}
                            />
                            <Label htmlFor={`cred-ty-${t}`} className="text-xs font-normal cursor-pointer">
                              {t}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="cred-secret"
                      checked={mustHaveSecret}
                      onCheckedChange={(c) => setMustHaveSecret(c === true)}
                    />
                    <Label htmlFor="cred-secret" className="text-xs font-normal cursor-pointer">
                      Only rows with password or hash
                    </Label>
                  </div>
                </div>
              }
            />
          </div>
        </div>
        <div className="node-card !p-0 overflow-hidden flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
              <tr><th className="text-left px-5 py-3 font-medium">Identity</th><th className="text-left px-3 py-3 font-medium">Type</th><th className="text-left px-3 py-3 font-medium">Hash / Password</th><th className="text-left px-5 py-3 font-medium">Host</th></tr>
            </thead>
            <tbody>
              {isLoading&&<tr><td colSpan={4} className="px-5 py-8 text-xs text-muted-foreground text-center">Loading...</td></tr>}
              {!isLoading&&!effectiveSid&&!isAggregate&&<tr><td colSpan={4} className="px-5 py-8 text-xs text-muted-foreground text-center">Select a session to view credentials.</td></tr>}
              {!isLoading&&(effectiveSid||isAggregate)&&filtered.length===0&&<tr><td colSpan={4}><EmptyState icon={KeyRound} title="No credentials" hint="No harvested credentials match the current filters or scope." compact /></td></tr>}
              {filtered.map((c:any,i:number)=>{const{icon:Icon,color}=typeIcon(c.type||"");const secret=c.hash||c.password||"—";const hasSecret=!!secret&&secret!=="—";const reused=isReused(c);const uname=c.username||c.user||"Unknown";return(
                <tr key={i} className="group border-t border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-${color}/15 text-${color} flex items-center justify-center shrink-0`}><Icon className="w-4 h-4"/></div>
                      <button onClick={() => copyText(uname, "Username")} className="font-mono text-xs hover:text-primary flex items-center gap-1.5 min-w-0" title="Copy username"><span className="truncate">{uname}</span><Copy className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0" /></button>
                      {reused && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-destructive/15 text-destructive shrink-0" title="This secret is reused across multiple hosts"><Repeat className="w-2.5 h-2.5" />REUSED</span>}
                    </div>
                  </td>
                  <td className="px-3 py-4"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-${color}/15 text-${color}`}>{c.type||"User"}</span></td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[260px]">{show?secret:"•".repeat(Math.min(secret.length,28))}</span>
                      {hasSecret && <button onClick={() => copyText(secret, "Secret")} className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Copy secret"><Copy className="w-3 h-3" /></button>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs font-mono text-muted-foreground">{c.host||c.host_pattern||"—"}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
};

export default Credentials;
