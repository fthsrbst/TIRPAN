import { useMemo, useState } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getScanProfiles, getSessions } from "@/lib/api";
import { GitBranch, Play, Clock, CheckCircle2, Settings2, Plus, Save, Link, X } from "lucide-react";

const Pipelines = () => {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", mode: "scan_only", scan_type: "", speed_profile: "", port_range: "" });
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignMission, setAssignMission] = useState("");

  const { data: profiles = [], isLoading } = useQuery({ queryKey: ["scan-profiles"], queryFn: getScanProfiles });
  const { data: sessions = [] } = useQuery({ queryKey: ["sessions"], queryFn: getSessions });

  const createMut = useMutation({
    mutationFn: (body: any) => fetch("/api/v1/scan-profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scan-profiles"] }); setShowForm(false); setForm({ name: "", description: "", mode: "scan_only", scan_type: "", speed_profile: "", port_range: "" }); },
  });

  const handleSave = () => {
    if (!form.name) return;
    createMut.mutate({ name: form.name, description: form.description, config: { mode: form.mode, scan_type: form.scan_type, speed_profile: form.speed_profile, port_range: form.port_range } });
  };

  return (
    <PageShell title="Pipelines" subtitle="Reusable scan & attack chain templates">
      <div className="space-y-4">
        {/* New Pipeline Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> New Pipeline
          </button>
        </div>

        {/* Creation Form */}
        {showForm && (
          <div className="node-card !p-5 space-y-3">
            <h3 className="font-display font-bold text-base">Create Pipeline</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-9 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Description</label>
                <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full h-9 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Mode</label>
                <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
                  className="w-full h-9 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="scan_only">Scan Only</option>
                  <option value="ask_before_exploit">Ask Before Exploit</option>
                  <option value="full_auto">Full Auto</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Scan Type</label>
                <input type="text" value={form.scan_type} onChange={(e) => setForm({ ...form, scan_type: e.target.value })}
                  className="w-full h-9 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Speed Profile</label>
                <input type="text" value={form.speed_profile} onChange={(e) => setForm({ ...form, speed_profile: e.target.value })}
                  className="w-full h-9 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 block">Port Range</label>
                <input type="text" value={form.port_range} onChange={(e) => setForm({ ...form, port_range: e.target.value })}
                  className="w-full h-9 px-3 rounded-full bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleSave} disabled={!form.name || createMut.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
                <Save className="w-3.5 h-3.5" /> Save Pipeline
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-full border border-border text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {isLoading && <div className="text-xs text-muted-foreground text-center py-8">Loading pipelines...</div>}
        {!isLoading && profiles.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">No scan profiles configured.</div>
        )}
        {profiles.map((p: any) => {
          const config = p.config || {};
          const steps = [
            config.mode,
            config.scan_type,
            config.speed_profile,
          ].filter(Boolean);
          return (
            <div key={p.id} className="node-card !p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base">{p.name}</h3>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ID: {p.id?.slice(0, 8)}</span>
                      {p.description && <span>{p.description}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {assigningId === p.id ? (
                    <div className="flex items-center gap-1.5">
                      <select value={assignMission} onChange={(e) => setAssignMission(e.target.value)}
                        className="h-8 px-2 rounded-full bg-muted border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary">
                        <option value="">Select mission</option>
                        {sessions.map((s: any) => (<option key={s.id} value={s.id}>{s.target || s.id}</option>))}
                      </select>
                      <button onClick={() => { /* assignment logic here */ setAssigningId(null); }}
                        className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:opacity-90" disabled={!assignMission}>
                        <Link className="w-3 h-3" />
                      </button>
                      <button onClick={() => setAssigningId(null)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAssigningId(p.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Link className="w-3 h-3" /> Assign
                    </button>
                  )}
                  <button className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90">
                    <Play className="w-4 h-4" />
                  </button>
                  <button className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted">
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {steps.length > 0 ? steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-xs">
                      <CheckCircle2 className="w-3 h-3 text-success" />
                      {String(s).replace(/_/g, " ")}
                    </div>
                    {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
                  </div>
                )) : (
                  <span className="text-[11px] text-muted-foreground">No configuration steps available.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
};

export default Pipelines;
