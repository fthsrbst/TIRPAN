import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSession } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { getSessions } from "@/lib/api";
import { Target, Play, X, Loader2, Radio, Shield, Zap, Bug, Globe } from "lucide-react";

interface Props {
  onClose: () => void;
}

const MODES = [
  { id: "full_auto", label: "Full Auto", desc: "Autonomous recon + exploit", icon: Zap },
  { id: "ask_before_exploit", label: "Ask First", desc: "Confirm before exploits", icon: Shield },
  { id: "scan_only", label: "Scan Only", desc: "No exploits — recon only", icon: Radio },
];

const SPEEDS = [
  { id: "fast", label: "Fast (-T4)", desc: "Aggressive timing" },
  { id: "normal", label: "Normal (-T3)", desc: "Balanced" },
  { id: "stealth", label: "Stealth (-T2)", desc: "Slow & quiet" },
];

const NewMissionModal = ({ onClose }: Props) => {
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState("scan_only");
  const [speed, setSpeed] = useState("normal");
  const [scope, setScope] = useState("single");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim()) { setError("Target required"); return; }
    setSaving(true);
    setError("");
    try {
      await createSession({
        target: target.trim(),
        mode,
        speed_profile: speed,
        scope_type: scope,
      });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to start mission");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="node-card !p-0 w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">New Mission</h2>
              <p className="text-[11px] text-muted-foreground">Configure and launch pentest session</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5" autoComplete="off">
          {/* Target */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 block">Target</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="corp.local, 192.168.1.0/24, example.com"
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                autoComplete="off"
                name="tirpan-target"
              />
            </div>
          </div>

          {/* Mode */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 block">Mode</label>
            <div className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    mode === m.id ? "border-primary bg-primary/10" : "border-border/50 bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <m.icon className={`w-4 h-4 mb-1.5 ${mode === m.id ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="text-xs font-medium">{m.label}</div>
                  <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Speed */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 block">Speed Profile</label>
            <div className="flex gap-2">
              {SPEEDS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSpeed(s.id)}
                  className={`flex-1 p-2.5 rounded-xl border text-center transition-all ${
                    speed === s.id ? "border-primary bg-primary/10" : "border-border/50 bg-muted/30 hover:bg-muted/50"
                  }`}
                >
                  <div className="text-xs font-medium">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">{error}</div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !target.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Launch Mission
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewMissionModal;
