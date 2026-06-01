import { PageShell } from "@/components/attack/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  Shield,
  Wifi,
  Key,
  Server,
  Network,
  ChevronRight,
  Loader2,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Zap,
  AlertTriangle,
  Bug,
  Lock,
  Sliders,
  Brain,
  Upload,
  FolderOpen,
} from "lucide-react";
// Eye kept for password toggle buttons
import { useState, useEffect, useCallback } from "react";
import { api, useAuth } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import ModelPicker from "@/components/attack/ModelPicker";
import AgentModelsTab from "@/components/attack/AgentModelsTab";

type Tab =
  | "llm"
  | "safety"
  | "msf"
  | "nmap"
  | "credentials"
  | "scan-profiles"
  | "agent-models"
  | "ml-models";

const tabs: { id: Tab; label: string; icon: typeof Cpu }[] = [
  { id: "llm", label: "LLM Provider", icon: Cpu },
  { id: "safety", label: "Safety", icon: Shield },
  { id: "msf", label: "Metasploit", icon: Bug },
  { id: "nmap", label: "Nmap", icon: Network },
  { id: "credentials", label: "Credentials", icon: Key },
  { id: "scan-profiles", label: "Scan Profiles", icon: Zap },
  { id: "agent-models", label: "Agent Models", icon: Brain },
  { id: "ml-models", label: "ML Models", icon: Cpu },
];

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama",
  lmstudio: "LM Studio",
  openrouter: "OpenRouter",
  opencode_go: "OpenCode Go",
  anthropic: "Anthropic",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="font-display font-bold text-lg tracking-tight">{title}</h3>
      {children}
    </div>
  );
}

function FieldRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0 w-[280px]">{children}</div>
    </div>
  );
}

function StatusDot({ online, label }: { online: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={`w-2 h-2 rounded-full ${online ? "bg-success animate-pulse" : "bg-destructive"}`}
      />
      <span className="text-muted-foreground">{label || (online ? "Online" : "Offline")}</span>
    </span>
  );
}


const SettingsPage = () => {
  const { user, isLoggedIn, logout } = useAuth();
  const perms = usePermissions();
  const [tab, setTab] = useState<Tab>("llm");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const flash = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const openModelPickerFor = (onSelect: (model: string, provider: string) => void, filter?: string[]) => {
    setModelPickerOnSelect(() => onSelect);
    setModelPickerFilter(filter || null);
    setModelPickerOpen(true);
  };

  // ── LLM state ──────────────────────────────────────
  const [activeProvider, setActiveProvider] = useState("ollama");
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaOnline, setOllamaOnline] = useState(false);
  const [lmstudioUrl, setLmstudioUrl] = useState("http://127.0.0.1:1234");
  const [lmstudioModel, setLmstudioModel] = useState("");
  const [lmstudioModels, setLmstudioModels] = useState<string[]>([]);
  const [lmstudioOnline, setLmstudioOnline] = useState(false);
  const [orApiKey, setOrApiKey] = useState("");
  const [orHasApiKey, setOrHasApiKey] = useState(false);
  const [orModel, setOrModel] = useState("");
  const [orModels, setOrModels] = useState<string[]>([]);
  const [ocgApiKey, setOcgApiKey] = useState("");
  const [ocgHasApiKey, setOcgHasApiKey] = useState(false);
  const [ocgModel, setOcgModel] = useState("");
  const [ocgModels, setOcgModels] = useState<string[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerOnSelect, setModelPickerOnSelect] = useState<((model: string, provider: string) => void) | null>(null);
  const [modelPickerFilter, setModelPickerFilter] = useState<string[] | null>(null);

  // ── Per-operation: Reports LLM override ("" provider = inherit global) ──
  const [reportingProvider, setReportingProvider] = useState("");
  const [reportingModel, setReportingModel] = useState("");

  // ── Agent Models state
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});

  // ── ML Models state
  const [mlStatus, setMlStatus] = useState<any>(null);
  const [mlMetrics, setMlMetrics] = useState<any>(null);
  const [mlTraining, setMlTraining] = useState(false);

  // ── Brain-injection toggles (persisted via /api/v1/settings) ──
  // These mirror what's surfaced in the Pro-Mode ML Engine sidebar so the
  // operator can flip them from either UI; the Brain reads them once per
  // iteration via app_settings.{ml_inject_attack_path,
  // ml_inject_exploit_pred, spawn_max_parallel, default_password_wordlist}.
  const [mlInjectAttackPath, setMlInjectAttackPath] = useState(true);
  const [mlInjectExploitPred, setMlInjectExploitPred] = useState(true);
  const [spawnMaxParallel, setSpawnMaxParallel] = useState(3);
  const [defaultPasswordWordlist, setDefaultPasswordWordlist] = useState("");
  const [allowAskOperatorInAuto, setAllowAskOperatorInAuto] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── Safety state ────────────────────────────────────
  const [safety, setSafety] = useState({
    allowed_cidr: "0.0.0.0/0",
    allowed_port_min: 1,
    allowed_port_max: 65535,
    excluded_ips: "",
    excluded_ports: "",
    allow_exploit: true,
    block_dos_exploits: true,
    block_destructive: true,
    max_severity: "CRITICAL",
    session_max_seconds: 7200,
    max_requests_per_second: 50,
    allow_persistence: false,
    v3_features: true,
  });

  // ── MSF state ──────────────────────────────────────
  const [msf, setMsf] = useState({ host: "127.0.0.1", port: 55553, password: "", ssl: false });

  // ── Nmap state ─────────────────────────────────────
  const [nmapSudo, setNmapSudo] = useState(false);
  const [nmapPlatform, setNmapPlatform] = useState("");
  const [nmapElevated, setNmapElevated] = useState(false);
  const [sudoPassword, setSudoPassword] = useState("");
  const [sudoHasPassword, setSudoHasPassword] = useState(false);
  const [showSudoPw, setShowSudoPw] = useState(false);

  // ── Branding state ─────────────────────────────────
  const [brandingName, setBrandingName] = useState("");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingHasLogo, setBrandingHasLogo] = useState(false);

  // ── Password visibility ────────────────────────────
  const [showOrKey, setShowOrKey] = useState(false);
  const [showOcgKey, setShowOcgKey] = useState(false);
  const [showMsfPw, setShowMsfPw] = useState(false);


  // ── Loaders ────────────────────────────────────────
  const loadLLM = useCallback(async () => {
    try {
      const [oll, lms, orr, ocg] = await Promise.all([
        api.get<{ online: boolean; models: string[]; current: string }>("/ollama/status").catch(() => null),
        api.get<{ online: boolean; models: string[]; current: string }>("/lmstudio/status").catch(() => null),
        api.get<{ cloud_model: string; has_api_key: boolean }>("/config/openrouter").catch(() => null),
        api.get<{ model: string; has_api_key: boolean }>("/config/opencode-go").catch(() => null),
      ]);
      if (oll) {
        setOllamaOnline(oll.online);
        setOllamaModels(oll.models || []);
        setOllamaModel(oll.current || "");
      }
      if (lms) {
        setLmstudioOnline(lms.online);
        setLmstudioModels(lms.models || []);
        setLmstudioModel(lms.current || "");
      }
      if (orr) {
        setOrHasApiKey(orr.has_api_key);
        setOrModel(orr.cloud_model || "");
        if (orr.api_key) setOrApiKey(orr.api_key);
      }
      if (ocg) {
        setOcgHasApiKey(ocg.has_api_key);
        setOcgModel(ocg.model || "");
        if (ocg.api_key) setOcgApiKey(ocg.api_key);
      }
      const settings = await api.get<Record<string, string>>("/settings").catch(() => ({}));
      setActiveProvider(settings.active_provider || "ollama");
      if (settings.ollama_base_url) setOllamaUrl(settings.ollama_base_url);
      if (settings.lmstudio_base_url) setLmstudioUrl(settings.lmstudio_base_url);
      if (settings.opencode_go_api_key) setOcgApiKey(settings.opencode_go_api_key);
      const rep = await api.get<{ provider: string; model: string }>("/config/reporting-llm").catch(() => null);
      if (rep) {
        setReportingProvider(rep.provider || "");
        setReportingModel(rep.model || "");
      }
    } catch {}
  }, []);

  const loadSafety = useCallback(async () => {
    try {
      const s = await api.get<typeof safety>("/config/safety");
      setSafety(s);
    } catch {}
  }, []);

  const loadMsf = useCallback(async () => {
    try {
      const m = await api.get<{ host: string; port: number; ssl: boolean }>("/config/msf");
      setMsf({ ...msf, host: m.host, port: m.port, ssl: m.ssl });
    } catch {}
  }, []);

  const loadNmap = useCallback(async () => {
    try {
      const n = await api.get<{ nmap_sudo: boolean; platform: string; is_elevated: boolean }>("/config/nmap");
      setNmapSudo(n.nmap_sudo);
      setNmapPlatform(n.platform);
      setNmapElevated(n.is_elevated);
      const s = await api.get<{ has_password: boolean }>("/config/sudo").catch(() => null);
      if (s) setSudoHasPassword(s.has_password);
    } catch {}
  }, []);

  const loadBranding = useCallback(async () => {
    try {
      const b = await api.get<{ company_name: string; logo_url: string; has_logo: boolean }>("/config/branding");
      setBrandingName(b.company_name);
      setBrandingLogoUrl(b.logo_url);
      setBrandingHasLogo(b.has_logo);
    } catch {}
  }, []);

  const loadMlStatus = useCallback(async () => {
    try {
      const [status, metrics, allSettings] = await Promise.all([
        api.get<any>("/ml/status").catch(() => null),
        api.get<any>("/ml/metrics").catch(() => null),
        api.get<any>("/settings").catch(() => null),
      ]);
      if (status) setMlStatus(status);
      if (metrics) setMlMetrics(metrics);
      // Settings cascade — defaults match server-side fallbacks so the UI
      // never shows misleading "off" toggles when the key just isn't set.
      if (allSettings) {
        setMlInjectAttackPath(allSettings.ml_inject_attack_path !== false);
        setMlInjectExploitPred(allSettings.ml_inject_exploit_pred !== false);
        setSpawnMaxParallel(
          Number.isFinite(Number(allSettings.spawn_max_parallel))
            ? Number(allSettings.spawn_max_parallel)
            : 3
        );
        setDefaultPasswordWordlist(String(allSettings.default_password_wordlist ?? ""));
        setAllowAskOperatorInAuto(allSettings.allow_ask_operator_in_auto === true);
      }
    } catch {}
  }, []);

  // Generic saver for the simple key/value settings the Brain reads.
  // Each save is independent — no batch endpoint, on purpose: a typo in one
  // key shouldn't roll back the others.
  const saveBrainSetting = async (key: string, value: unknown) => {
    try {
      await api.put(`/settings/${encodeURIComponent(key)}`, { value });
      flash("ok", `${key} saved`);
    } catch (e: unknown) {
      flash("err", String(e));
    }
  };

  const loadAgentModels = useCallback(async () => {
    try {
      const r = await api.get<any>("/settings");
      const raw = r.agent_models;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const normalized: Record<string, string> = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (typeof val === "object" && val !== null && "provider" in val && "model" in val) {
            normalized[key] = `${(val as any).provider}:${(val as any).model}`;
          } else {
            normalized[key] = String(val);
          }
        }
        setAgentModels(normalized);
      }
    } catch {}
  }, []);

  const fetchOrModels = async () => {
    try {
      const r = await api.get<{ models: string[] }>("/openrouter/models");
      setOrModels(r.models || []);
    } catch {}
  };

  const fetchOllamaStatus = async () => {
    try {
      const r = await api.get<{ online: boolean; models: string[]; current: string }>(
        `/ollama/status?base_url=${encodeURIComponent(ollamaUrl)}`
      );
      setOllamaOnline(r.online);
      setOllamaModels(r.models || []);
    } catch {}
  };

  const fetchLmstudioStatus = async () => {
    try {
      const r = await api.get<{ online: boolean; models: string[]; current: string }>(
        `/lmstudio/status?base_url=${encodeURIComponent(lmstudioUrl)}`
      );
      setLmstudioOnline(r.online);
      setLmstudioModels(r.models || []);
    } catch {}
  };

  const fetchOcgModels = async () => {
    try {
      const r = await api.get<{ models: string[] }>("/opencode-go/models");
      setOcgModels(r.models || []);
    } catch {}
  };

  useEffect(() => {
    if (tab === "llm") loadLLM();
    if (tab === "safety") loadSafety();
    if (tab === "msf") loadMsf();
    if (tab === "nmap") loadNmap();
    if (tab === "agent-models") loadAgentModels();
    if (tab === "ml-models") loadMlStatus();
  }, [tab, loadLLM, loadSafety, loadMsf, loadNmap, loadBranding, loadAgentModels, loadMlStatus]);

  // ── Save handlers ───────────────────────────────────

  const saveOllama = async () => {
    setSaving(true);
    try {
      await api.post("/config/ollama", { base_url: ollamaUrl, model: ollamaModel });
      await api.put("/settings/active_provider", { value: "ollama" });
      setActiveProvider("ollama");
      flash("ok", "Ollama settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveLmstudio = async () => {
    setSaving(true);
    try {
      await api.post("/config/lmstudio", { base_url: lmstudioUrl, model: lmstudioModel });
      await api.put("/settings/active_provider", { value: "lmstudio" });
      setActiveProvider("lmstudio");
      flash("ok", "LM Studio settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveOpenRouter = async () => {
    setSaving(true);
    try {
      await api.post("/config/openrouter", { api_key: orApiKey, cloud_model: orModel });
      await api.put("/settings/active_provider", { value: "openrouter" });
      setActiveProvider("openrouter");
      flash("ok", "OpenRouter settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveOpenCodeGo = async () => {
    setSaving(true);
    try {
      await api.post("/config/opencode-go", { api_key: ocgApiKey, model: ocgModel });
      await api.put("/settings/active_provider", { value: "opencode_go" });
      setActiveProvider("opencode_go");
      flash("ok", "OpenCode Go settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveReportingLLM = async () => {
    setSaving(true);
    try {
      await api.post("/config/reporting-llm", { provider: reportingProvider, model: reportingModel });
      flash("ok", reportingProvider ? "Report LLM override saved" : "Reports now follow the global provider");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveSafety = async () => {
    setSaving(true);
    try {
      await api.post("/config/safety", safety);
      flash("ok", "Safety settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveMsf = async () => {
    setSaving(true);
    try {
      await api.post("/config/msf", { host: msf.host, port: msf.port, password: msf.password, ssl: msf.ssl });
      flash("ok", "Metasploit settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveNmap = async () => {
    setSaving(true);
    try {
      await api.post("/config/nmap", { nmap_sudo: nmapSudo });
      if (sudoPassword) {
        await api.post("/config/sudo", { password: sudoPassword });
        setSudoHasPassword(true);
        setSudoPassword("");
      }
      flash("ok", "Nmap settings saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      await api.post("/config/branding", { company_name: brandingName });
      flash("ok", "Branding saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("tirpan_token");
      const res = await fetch("/api/v1/config/branding/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setBrandingLogoUrl(data.logo_url);
      setBrandingHasLogo(true);
      flash("ok", "Logo uploaded");
    } catch (err: unknown) { flash("err", String(err)); }
    setSaving(false);
  };

  const deleteLogo = async () => {
    setSaving(true);
    try {
      await api.delete("/config/branding/logo");
      setBrandingHasLogo(false);
      setBrandingLogoUrl("");
      flash("ok", "Logo deleted");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveAgentModels = async () => {
    setSaving(true);
    try {
      await api.put("/settings/agent_models", { value: JSON.stringify(agentModels) });
      flash("ok", "Agent models saved");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };


  return (
    <PageShell title="Settings" subtitle="Workspace & operator configuration">
      {msg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2 ${
            msg.type === "ok" ? "bg-success/15 text-success border border-success/30" : "bg-destructive/15 text-destructive border border-destructive/30"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 h-full min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="col-span-3 node-card !p-3 flex flex-col gap-1 overflow-y-auto">
          {tabs.filter((t) => t.id !== "agent-models" || perms.isAdmin).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.id === "llm" && (
                <Badge variant={activeProvider === "ollama" ? "default" : "secondary"} className="ml-auto text-[9px] px-1.5">
                  {activeProvider === "opencode_go" ? "OCG" : activeProvider.slice(0, 3).toUpperCase()}
                </Badge>
              )}
            </button>
          ))}
          {isLoggedIn && (
            <>
              <Separator className="my-2" />
              <button
                onClick={logout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </>
          )}
        </nav>

        {/* Content */}
        <div className="col-span-9 node-card !p-6 overflow-y-auto">
          {/* ── LLM PROVIDER ───────────────────────────── */}
          {tab === "llm" && (
            <div className="space-y-6">
              <Section title="LLM Provider">
                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Cpu className="w-4 h-4 text-primary" />
                    Global provider —
                    <span className="font-display font-bold text-primary">
                      {PROVIDER_LABELS[activeProvider] || activeProvider}
                    </span>
                    <span className="text-muted-foreground font-normal">
                      {activeProvider === "ollama" && ollamaModel ? `· ${ollamaModel}` : ""}
                      {activeProvider === "lmstudio" && lmstudioModel ? `· ${lmstudioModel}` : ""}
                      {activeProvider === "openrouter" && orModel ? `· ${orModel}` : ""}
                      {activeProvider === "opencode_go" && ocgModel ? `· ${ocgModel}` : ""}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1.5 leading-relaxed">
                    This provider &amp; model are used for <strong>everything</strong> — chat, scans, and reports —
                    unless you override a specific operation below (Reports) or per scan-agent (Agent Models tab).
                    Selecting a provider and clicking <strong>Save</strong> applies it instantly; nothing is ever
                    forced onto a model you didn&apos;t choose.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      { id: "ollama", label: "Ollama", desc: " Local LLM" },
                      { id: "lmstudio", label: "LM Studio", desc: " Local GUI" },
                      { id: "openrouter", label: "OpenRouter", desc: " Cloud API" },
                      { id: "opencode_go", label: "OpenCode Go", desc: " Cloud API" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveProvider(p.id)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        activeProvider === p.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.label}
                      <span className="block text-[10px] opacity-70">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </Section>

              <Separator />

              {activeProvider === "ollama" && (
                <Section title="Ollama">
                  <div className="flex items-center justify-between mb-3">
                    <StatusDot online={ollamaOnline} />
                    <Button variant="outline" size="sm" onClick={fetchOllamaStatus} className="gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh Status
                    </Button>
                  </div>
                  <FieldRow label="Base URL" desc="Ollama server URL">
                    <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Model" desc="Ollama model to use">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => openModelPickerFor((model, provider) => {
                        setOllamaModel(model);
                      }, ["ollama"])}
                    >
                      {ollamaModel || "Click to select model..."}
                    </Button>
                  </FieldRow>
                  <Button onClick={saveOllama} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </Section>
              )}

              {activeProvider === "lmstudio" && (
                <Section title="LM Studio">
                  <div className="flex items-center justify-between mb-3">
                    <StatusDot online={lmstudioOnline} />
                    <Button variant="outline" size="sm" onClick={fetchLmstudioStatus} className="gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refresh Status
                    </Button>
                  </div>
                  <FieldRow label="Base URL" desc="LM Studio server URL">
                    <Input value={lmstudioUrl} onChange={(e) => setLmstudioUrl(e.target.value)} placeholder="http://127.0.0.1:1234" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Model" desc="LM Studio model to use">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => openModelPickerFor((model, provider) => {
                        setLmstudioModel(model);
                      }, ["lmstudio"])}
                    >
                      {lmstudioModel || "Click to select model..."}
                    </Button>
                  </FieldRow>
                  <Button onClick={saveLmstudio} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </Section>
              )}

              {activeProvider === "openrouter" && (
                <Section title="OpenRouter">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot online={orHasApiKey} label={orHasApiKey ? "API key configured" : "No API key"} />
                    <Button variant="outline" size="sm" onClick={fetchOrModels} className="gap-1.5 ml-auto">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Fetch Models
                    </Button>
                  </div>
                  <FieldRow label="API Key" desc="OpenRouter API key">
                    <div className="relative">
                      <Input
                        value={orApiKey}
                        onChange={(e) => setOrApiKey(e.target.value)}
                        type={showOrKey ? "text" : "password"}
                        placeholder={orHasApiKey ? "••••••••••••• (saved)" : "sk-or-..."}
                        autoComplete="new-password"
                        name="tirpan-or-key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOrKey(!showOrKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showOrKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FieldRow>
                  <FieldRow label="Cloud Model" desc="Cloud model to use">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => openModelPickerFor((model, provider) => {
                        setOrModel(model);
                      }, ["openrouter"])}
                    >
                      {orModel || "Click to select model..."}
                    </Button>
                  </FieldRow>
                  <Button onClick={saveOpenRouter} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </Section>
              )}

              {activeProvider === "opencode_go" && (
                <Section title="OpenCode Go">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot online={ocgHasApiKey} label={ocgHasApiKey ? "API key configured" : "No API key"} />
                    <Button variant="outline" size="sm" onClick={fetchOcgModels} className="gap-1.5 ml-auto">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Fetch Models
                    </Button>
                  </div>
                  <FieldRow label="API Key" desc="OpenCode Go API key">
                    <div className="relative">
                      <Input
                        value={ocgApiKey}
                        onChange={(e) => setOcgApiKey(e.target.value)}
                        type={showOcgKey ? "text" : "password"}
                        placeholder={ocgHasApiKey ? "••••••••••••• (saved)" : "oc-go-..."}
                        autoComplete="new-password"
                        name="tirpan-ocg-key"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOcgKey(!showOcgKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showOcgKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FieldRow>
                  <FieldRow label="Model" desc="Model to use">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => openModelPickerFor((model, provider) => {
                        setOcgModel(model);
                      }, ["opencode_go"])}
                    >
                      {ocgModel || "Click to select model..."}
                    </Button>
                  </FieldRow>
                  <Button onClick={saveOpenCodeGo} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </Section>
              )}

              <Separator />

              {/* ── Per-operation override: Reports ───────────────── */}
              <Section title="Reports LLM (per-operation override)">
                <p className="text-sm text-muted-foreground mb-3">
                  Choose which model writes report remediation guidance. Leave on{" "}
                  <strong>Inherit global</strong> to use the provider above, or pick a dedicated
                  (e.g. cheaper) model just for reports — your scans and chat stay on the global provider.
                </p>
                <FieldRow label="Report provider" desc="Used only for report AI synthesis">
                  <Select
                    value={reportingProvider || "__inherit__"}
                    onValueChange={(v) => {
                      const p = v === "__inherit__" ? "" : v;
                      setReportingProvider(p);
                      setReportingModel("");
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__inherit__">
                        Inherit global ({PROVIDER_LABELS[activeProvider] || activeProvider})
                      </SelectItem>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="lmstudio">LM Studio</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="opencode_go">OpenCode Go</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                {reportingProvider && (
                  <FieldRow label="Report model" desc="Model for this provider (blank = provider default)">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      onClick={() => openModelPickerFor((model) => setReportingModel(model), [reportingProvider])}
                    >
                      {reportingModel || "Click to select model..."}
                    </Button>
                  </FieldRow>
                )}
                <Button onClick={saveReportingLLM} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Report LLM
                </Button>
              </Section>
            </div>
          )}

          {/* ── SAFETY ───────────────────────────────── */}
          {tab === "safety" && (
            <div className="space-y-6">
              <Section title="Safety Limits">
                <p className="text-sm text-muted-foreground mb-2">
                  Configure pentest boundaries and safety rules.
                </p>
                <FieldRow label="Allowed CIDR" desc="Allowed IP range for scanning (CIDR)">
                  <Input value={safety.allowed_cidr} onChange={(e) => setSafety({ ...safety, allowed_cidr: e.target.value })} />
                </FieldRow>
                <FieldRow label="Port range" desc="Minimum and maximum port numbers">
                  <div className="flex gap-2">
                    <Input type="number" value={safety.allowed_port_min} onChange={(e) => setSafety({ ...safety, allowed_port_min: Number(e.target.value) })} className="w-24" />
                    <span className="text-muted-foreground self-center">—</span>
                    <Input type="number" value={safety.allowed_port_max} onChange={(e) => setSafety({ ...safety, allowed_port_max: Number(e.target.value) })} className="w-24" />
                  </div>
                </FieldRow>
                <FieldRow label="Excluded IPs" desc="Comma-separated">
                  <Input value={safety.excluded_ips} onChange={(e) => setSafety({ ...safety, excluded_ips: e.target.value })} placeholder="192.168.1.1, 10.0.0.5" />
                </FieldRow>
                <FieldRow label="Excluded ports" desc="Comma-separated">
                  <Input value={safety.excluded_ports} onChange={(e) => setSafety({ ...safety, excluded_ports: e.target.value })} placeholder="23, 25, 5900" />
                </FieldRow>
                <FieldRow label="Max severity" desc="Assessment runs up to this finding severity">
                  <Select value={safety.max_severity} onValueChange={(v) => setSafety({ ...safety, max_severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Time limit (seconds)" desc="0 = unlimited">
                  <Input type="number" value={safety.session_max_seconds} onChange={(e) => setSafety({ ...safety, session_max_seconds: Number(e.target.value) })} />
                </FieldRow>
                <FieldRow label="Rate limit (req/s)" desc="Maximum requests per second">
                  <Input type="number" value={safety.max_requests_per_second} onChange={(e) => setSafety({ ...safety, max_requests_per_second: Number(e.target.value) })} />
                </FieldRow>
              </Section>

              <Separator />

              <Section title="Exploit controls">
                <FieldRow label="Allow exploitation" desc="Enables the exploitation phase after scanning">
                  <Switch checked={safety.allow_exploit} onCheckedChange={(v) => setSafety({ ...safety, allow_exploit: v })} />
                </FieldRow>
                <FieldRow label="Block DoS exploits" desc="Avoids denial-of-service style payloads">
                  <Switch checked={safety.block_dos_exploits} onCheckedChange={(v) => setSafety({ ...safety, block_dos_exploits: v })} />
                </FieldRow>
                <FieldRow label="Block destructive actions" desc="Blocks irreversible actions such as wiping data">
                  <Switch checked={safety.block_destructive} onCheckedChange={(v) => setSafety({ ...safety, block_destructive: v })} />
                </FieldRow>
              </Section>

              <Button onClick={saveSafety} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Safety Settings
              </Button>
            </div>
          )}

          {/* ── METASPLOIT ───────────────────────────── */}
          {tab === "msf" && (
            <div className="space-y-6">
              <Section title="Metasploit RPC">
                <p className="text-sm text-muted-foreground mb-2">
                  Configure host, port, and password for msfrpcd.
                </p>
                <FieldRow label="Host" desc="msfrpcd host">
                  <Input value={msf.host} onChange={(e) => setMsf({ ...msf, host: e.target.value })} autoComplete="off" />
                </FieldRow>
                <FieldRow label="Port" desc="msfrpcd port">
                  <Input type="number" value={msf.port} onChange={(e) => setMsf({ ...msf, port: Number(e.target.value) })} autoComplete="off" />
                </FieldRow>
                <FieldRow label="Password" desc="msfrpcd password">
                  <div className="relative">
                    <Input
                      value={msf.password}
                      onChange={(e) => setMsf({ ...msf, password: e.target.value })}
                      type={showMsfPw ? "text" : "password"}
                      placeholder="msfrpcd password"
                      autoComplete="new-password"
                      name="tirpan-msf-pw"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMsfPw(!showMsfPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showMsfPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FieldRow>
                <FieldRow label="SSL" desc="Connect over TLS">
                  <Switch checked={msf.ssl} onCheckedChange={(v) => setMsf({ ...msf, ssl: v })} />
                </FieldRow>
              </Section>
              <Button onClick={saveMsf} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Metasploit Settings
              </Button>
            </div>
          )}

          {/* ── NMAP ─────────────────────────────────── */}
          {tab === "nmap" && (
            <div className="space-y-6">
              <Section title="Nmap">
                <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-muted/50 border border-border/50">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Platform:</span>{" "}
                    <span className="font-medium">{nmapPlatform || "—"} </span>
                    <span className="ml-3 text-muted-foreground">Privileges:</span>{" "}
                    <span className="font-medium">{nmapElevated ? "Root / Admin" : "Normal user"}</span>
                  </div>
                </div>
                <FieldRow label="Run with sudo" desc="Recommended for OS detection and SYN scans">
                  <Switch checked={nmapSudo} onCheckedChange={setNmapSudo} />
                </FieldRow>
                <FieldRow
                  label="Sudo password"
                  desc={sudoHasPassword ? "Password stored (enter a new one to update)" : "Required for nmap, masscan and other root-only tools"}
                >
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showSudoPw ? "text" : "password"}
                        placeholder={sudoHasPassword ? "••••••••" : "Enter sudo password…"}
                        value={sudoPassword}
                        onChange={(e) => setSudoPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-9 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSudoPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showSudoPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {sudoHasPassword && (
                      <span className="text-[10px] text-success font-mono shrink-0">✓ saved</span>
                    )}
                  </div>
                </FieldRow>
              </Section>
              <Button onClick={saveNmap} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Nmap Settings
              </Button>
            </div>
          )}

          {/* ── CREDENTIALS ──────────────────────────── */}
          {tab === "credentials" && (
            <div className="space-y-6">
              <Section title="Credentials">
                <p className="text-sm text-muted-foreground mb-4">
                  Manage credentials for SSH, SMB, SNMP, and other protocols.
                  Expert mode exposes more detailed controls.
                </p>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Lock className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Manage credentials in Expert mode</p>
                  <a href="/" className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    Expert Mode →
                  </a>
                </div>
              </Section>

              <Separator />

              {/* ── Default password wordlist ── */}
              <Section title="Default password wordlist">
                <p className="text-sm text-muted-foreground mb-4">
                  Wordlist used by hydra / medusa / crackmapexec when no per-call wordlist is
                  specified. Drop a file, pick one from disk, or type an absolute path manually.
                  Leave empty for auto-detection (rockyou.txt → SecLists → metasploit defaults →
                  embedded 50-password fallback).
                </p>

                {/* Drag-and-drop zone */}
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 mb-3 text-center transition-colors cursor-pointer ${
                    dragOver
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:border-primary/50 hover:bg-muted/20"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      setDefaultPasswordWordlist(file.path ?? file.name);
                    }
                  }}
                  onClick={() => document.getElementById("wordlist-file-input")?.click()}
                >
                  <input
                    id="wordlist-file-input"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setDefaultPasswordWordlist((file as File & { path?: string }).path ?? file.name);
                        e.target.value = "";
                      }
                    }}
                  />
                  <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop a wordlist file here, or{" "}
                    <span className="text-primary underline underline-offset-2">click to browse</span>
                  </p>
                  {defaultPasswordWordlist && (
                    <p className="mt-2 text-xs font-mono text-foreground/80 truncate max-w-full">
                      {defaultPasswordWordlist}
                    </p>
                  )}
                </div>

                {/* Manual path input */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={defaultPasswordWordlist}
                    onChange={(e) => setDefaultPasswordWordlist(e.target.value)}
                    placeholder="/usr/share/wordlists/rockyou.txt"
                    className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono"
                  />
                  <Button
                    onClick={() => saveBrainSetting("default_password_wordlist", defaultPasswordWordlist.trim())}
                    size="sm"
                    className="gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </Button>
                </div>
              </Section>
            </div>
          )}

          {/* ── SCAN PROFILES ─────────────────────────── */}
          {tab === "scan-profiles" && (
            <div className="space-y-6">
              <Section title="Scan profiles">
                <p className="text-sm text-muted-foreground mb-4">
                  Create reusable scan templates. Expert mode offers more options.
                </p>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Sliders className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Manage profiles in Expert mode</p>
                  <a href="/" className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    Expert Mode →
                  </a>
                </div>
              </Section>
            </div>
          )}

          {/* ── AGENT MODELS ─────────────────────────── */}
          {tab === "agent-models" && (
            <AgentModelsTab
              agentModels={agentModels}
              saving={saving}
              onOpenPicker={openModelPickerFor}
              onModelChange={(key, value) =>
                setAgentModels((prev) => ({ ...prev, [key]: value }))
              }
              onModelClear={(key) =>
                setAgentModels((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                })
              }
              onSave={saveAgentModels}
            />
          )}

          {/* ── ML MODELS ────────────────────────────── */}
          {tab === "ml-models" && (
            <div className="space-y-6">
              <Section title="ML Models">
                <p className="text-sm text-muted-foreground mb-4">
                  Lightweight XGBoost models — no GPU required. Trained on NVD CVEs, MITRE ATT&CK and Exploit-DB.
                </p>

                {/* Model status cards */}
                <div className="grid grid-cols-1 gap-3">
                  {[
                    {
                      key: "finding_classifier",
                      label: "Finding Classifier",
                      desc: "Labels vulnerabilities: risk level, attack phase, asset category, MITRE TTPs",
                      metrics: mlMetrics?.finding_classifier,
                    },
                    {
                      key: "exploit_predictor",
                      label: "Exploit Success Predictor",
                      desc: "Estimates P(success) for each exploit before it is attempted",
                      metrics: mlMetrics?.exploit_predictor,
                    },
                    {
                      key: "attack_path",
                      label: "Attack Path Suggester",
                      desc: "Recommends next MITRE ATT&CK techniques based on current phase and services",
                      metrics: mlMetrics?.attack_path,
                    },
                  ].map(({ key, label, desc, metrics }) => {
                    const available = mlStatus?.models?.[key]?.available ?? false;
                    const trainingStatus = mlStatus?.training?.status;
                    return (
                      <div
                        key={key}
                        className={`rounded-xl border p-4 transition-colors ${
                          available ? "border-success/30 bg-success/5" : "border-border/50 bg-muted/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  available ? "bg-success" : "bg-muted-foreground/40"
                                }`}
                              />
                              <span className="text-sm font-semibold">{label}</span>
                              {available && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                        </div>

                        {/* Metrics */}
                        {metrics && !metrics.error && (
                          <div className="mt-3 flex flex-wrap gap-3">
                            {metrics.accuracy !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {(metrics.accuracy * 100).toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">Accuracy</div>
                              </div>
                            )}
                            {metrics.f1_macro !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {(metrics.f1_macro * 100).toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">F1 Macro</div>
                              </div>
                            )}
                            {metrics.roc_auc !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {(metrics.roc_auc * 100).toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">ROC AUC</div>
                              </div>
                            )}
                            {metrics.attack_phase?.accuracy !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {(metrics.attack_phase.accuracy * 100).toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">Phase Acc</div>
                              </div>
                            )}
                            {metrics.asset_category?.f1_macro !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {(metrics.asset_category.f1_macro * 100).toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted-foreground">Asset F1</div>
                              </div>
                            )}
                            {metrics.techniques !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">{metrics.techniques}</div>
                                <div className="text-[10px] text-muted-foreground">Techniques</div>
                              </div>
                            )}
                            {metrics.train_samples !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {(metrics.train_samples / 1000).toFixed(0)}k
                                </div>
                                <div className="text-[10px] text-muted-foreground">Train samples</div>
                              </div>
                            )}
                            {metrics.train_time_s !== undefined && (
                              <div className="text-center">
                                <div className="text-base font-mono font-bold text-foreground">
                                  {metrics.train_time_s > 60
                                    ? `${(metrics.train_time_s / 60).toFixed(1)}m`
                                    : `${metrics.train_time_s}s`}
                                </div>
                                <div className="text-[10px] text-muted-foreground">Train time</div>
                              </div>
                            )}
                          </div>
                        )}

                        {metrics?.error && (
                          <div className="mt-2 text-[11px] text-destructive font-mono">{metrics.error}</div>
                        )}

                        {!available && (
                          <div className="mt-2 text-[11px] text-muted-foreground italic">
                            Model not trained yet — click "Train All Models" below.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Separator />

              {/* ── Brain Injection ─────────────────────────────────────── */}
              {/* These three settings shape what the Brain agent sees in its
                  system prompt each iteration. Operator toggles them here so
                  the same controls work in both Normal and Pro mode. */}
              <Section title="Brain Injection">
                <p className="text-sm text-muted-foreground mb-4">
                  Controls which ML-derived signals the Brain agent receives each iteration,
                  plus the orchestrator's parallel-spawn cap.
                </p>

                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/50 bg-muted/10 cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Attack-path TTPs</div>
                      <div className="text-xs text-muted-foreground">
                        Renders the NEXT-STEP MITRE TTP suggestions block in the Brain's prompt.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mlInjectAttackPath}
                      onChange={(e) => {
                        setMlInjectAttackPath(e.target.checked);
                        saveBrainSetting("ml_inject_attack_path", e.target.checked);
                      }}
                      className="w-4 h-4 accent-primary"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/50 bg-muted/10 cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Exploit prediction</div>
                      <div className="text-xs text-muted-foreground">
                        Passes per-module success probability to the Brain prompt and tags each
                        spawned exploit child with <code className="text-[10px]">[ml_success_prob=…]</code>.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={mlInjectExploitPred}
                      onChange={(e) => {
                        setMlInjectExploitPred(e.target.checked);
                        saveBrainSetting("ml_inject_exploit_pred", e.target.checked);
                      }}
                      className="w-4 h-4 accent-primary"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/50 bg-muted/10">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Parallel spawn cap</div>
                      <div className="text-xs text-muted-foreground">
                        Hard limit on concurrent child agents. test3 forensics: 18 spawned at once
                        starved the LLM queue and 9 timed out. Default 3, safe range 2–6.
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={16}
                      value={spawnMaxParallel}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(16, parseInt(e.target.value, 10) || 3));
                        setSpawnMaxParallel(v);
                        saveBrainSetting("spawn_max_parallel", v);
                      }}
                      className="w-20 bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono text-center"
                    />
                  </div>

                  <label className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/50 bg-muted/10 cursor-pointer">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Allow ask_operator in auto mode</div>
                      <div className="text-xs text-muted-foreground">
                        Off by default — there's no human listener in v2_auto so the Brain just
                        burns an iteration waiting. Turn on only if you'll actually be answering.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={allowAskOperatorInAuto}
                      onChange={(e) => {
                        setAllowAskOperatorInAuto(e.target.checked);
                        saveBrainSetting("allow_ask_operator_in_auto", e.target.checked);
                      }}
                      className="w-4 h-4 accent-primary"
                    />
                  </label>
                </div>
              </Section>

              <Separator />

              <Section title="Training">
                <p className="text-sm text-muted-foreground mb-4">
                  Downloads NVD CVE feeds, MITRE ATT&CK and Exploit-DB, then trains all three models.
                  Takes 5–15 minutes on first run (data is cached afterwards).
                </p>

                {mlStatus?.training?.status === "running" && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 mb-4 text-sm text-accent">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Training in progress… please wait.
                  </div>
                )}
                {mlStatus?.training?.status === "done" && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-success/10 border border-success/30 mb-4 text-sm text-success">
                    Training complete.
                  </div>
                )}
                {mlStatus?.training?.error && (
                  <div className="px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 mb-4 text-xs text-destructive font-mono">
                    {mlStatus.training.error}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    onClick={async () => {
                      setMlTraining(true);
                      try {
                        await api.post("/ml/train", {});
                        flash("ok", "ML training started in background");
                        setTimeout(loadMlStatus, 2000);
                      } catch (e: unknown) {
                        flash("err", String(e));
                      }
                      setMlTraining(false);
                    }}
                    disabled={mlTraining || mlStatus?.training?.status === "running"}
                    className="gap-2"
                  >
                    {mlTraining ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Cpu className="w-4 h-4" />
                    )}
                    Train All Models
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadMlStatus} className="gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Refresh Status
                  </Button>
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
      {modelPickerOpen && (
        <ModelPicker
          isOpen={modelPickerOpen}
          onClose={() => setModelPickerOpen(false)}
          providers={[
            { key: "ollama", label: "Ollama", models: ollamaModels, online: ollamaOnline },
            { key: "lmstudio", label: "LM Studio", models: lmstudioModels, online: lmstudioOnline },
            { key: "openrouter", label: "OpenRouter", models: orModels, online: orHasApiKey },
            { key: "opencode_go", label: "OpenCode Go", models: ocgModels.length ? ocgModels : (ocgModel ? [ocgModel] : []), online: ocgHasApiKey },
          ].filter((p) => !modelPickerFilter || modelPickerFilter.includes(p.key))}
          onSelect={(model, provider) => {
            modelPickerOnSelect?.(model, provider);
            setModelPickerOpen(false);
          }}
        />
      )}
    </PageShell>
  );
};

export default SettingsPage;