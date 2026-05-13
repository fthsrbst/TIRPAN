import { useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { ListFilterToolbar, type FilterChipModel } from "@/components/attack/ListFilterToolbar";
import { toggleInSet } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSessionCredentialsHarvested } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { KeyRound, Shield, User, Crown, Eye, EyeOff } from "lucide-react";
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

  const { data: credData, isLoading } = useQuery({
    queryKey: ["session-creds", effectiveSid],
    queryFn: () => getSessionCredentialsHarvested(effectiveSid!),
    enabled: !!effectiveSid,
  });

  const credentials = useMemo(() => (credData?.credentials || []), [credData]);

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

  const typeIcon = (t: string) => {
    const l = (t||"").toLowerCase();
    if (l.includes("domain")||l.includes("admin")) return { icon: Crown, color: "destructive" };
    if (l.includes("admin")||l.includes("service")) return { icon: Shield, color: "warning" };
    return { icon: User, color: "accent" };
  };

  return (
    <PageShell title="Credentials" subtitle="Harvested authentication material">
      <div className="flex flex-col h-full gap-4">
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
                    <option value="all">Select a session</option>
                    {sessions.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.target || s.id}
                      </option>
                    ))}
                  </select>
                ) : undefined
              }
              trailingActions={
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted shrink-0 h-9"
                >
                  {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {show ? "Mask" : "Reveal"}
                </button>
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
        <div className="flex gap-2 shrink-0 text-[10px] text-muted-foreground px-1">
          <span>{credentials.length} total in session</span>
        </div>
        <div className="node-card !p-0 overflow-hidden flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
              <tr><th className="text-left px-5 py-3 font-medium">Identity</th><th className="text-left px-3 py-3 font-medium">Type</th><th className="text-left px-3 py-3 font-medium">Hash / Password</th><th className="text-left px-5 py-3 font-medium">Host</th></tr>
            </thead>
            <tbody>
              {isLoading&&<tr><td colSpan={4} className="px-5 py-8 text-xs text-muted-foreground text-center">Loading...</td></tr>}
              {!isLoading&&!effectiveSid&&<tr><td colSpan={4} className="px-5 py-8 text-xs text-muted-foreground text-center">Select a session to view credentials.</td></tr>}
              {!isLoading&&effectiveSid&&filtered.length===0&&<tr><td colSpan={4} className="px-5 py-8 text-xs text-muted-foreground text-center">No credentials found.</td></tr>}
              {filtered.map((c:any,i:number)=>{const{icon:Icon,color}=typeIcon(c.type||"");const secret=c.hash||c.password||"—";return(
                <tr key={i} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg bg-${color}/15 text-${color} flex items-center justify-center`}><Icon className="w-4 h-4"/></div><span className="font-mono text-xs">{c.username||c.user||"Unknown"}</span></div></td>
                  <td className="px-3 py-4"><span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-${color}/15 text-${color}`}>{c.type||"User"}</span></td>
                  <td className="px-3 py-4 font-mono text-[11px] text-muted-foreground">{show?secret:"•".repeat(Math.min(secret.length,28))}</td>
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
