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
  User,
  Brain,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { api, useAuth } from "@/lib/utils";
import ModelPicker from "@/components/attack/ModelPicker";
import AgentModelsTab from "@/components/attack/AgentModelsTab";

type Tab =
  | "llm"
  | "safety"
  | "msf"
  | "nmap"
  | "credentials"
  | "scan-profiles"
  | "branding"
  | "profile"
  | "agent-models";

const tabs: { id: Tab; label: string; icon: typeof Cpu }[] = [
  { id: "llm", label: "LLM Provider", icon: Cpu },
  { id: "safety", label: "Safety", icon: Shield },
  { id: "msf", label: "Metasploit", icon: Bug },
  { id: "nmap", label: "Nmap", icon: Network },
  { id: "credentials", label: "Credentials", icon: Key },
  { id: "scan-profiles", label: "Scan Profiles", icon: Zap },
  { id: "branding", label: "Branding", icon: Eye },
  { id: "profile", label: "Profile", icon: User },
  { id: "agent-models", label: "Agent Models", icon: Brain },
];

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

  // ── Agent Models state
  const [agentModels, setAgentModels] = useState<Record<string, string>>({});

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

  // ── Branding state ─────────────────────────────────
  const [brandingName, setBrandingName] = useState("");
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingHasLogo, setBrandingHasLogo] = useState(false);

  // ── Password visibility ────────────────────────────
  const [showOrKey, setShowOrKey] = useState(false);
  const [showOcgKey, setShowOcgKey] = useState(false);
  const [showMsfPw, setShowMsfPw] = useState(false);

  // ── Profile edit state ─────────────────────────────
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

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
    if (tab === "branding") loadBranding();
    if (tab === "agent-models") loadAgentModels();
  }, [tab, loadLLM, loadSafety, loadMsf, loadNmap, loadBranding, loadAgentModels]);

  // ── Save handlers ───────────────────────────────────

  const saveOllama = async () => {
    setSaving(true);
    try {
      await api.post("/config/ollama", { base_url: ollamaUrl, model: ollamaModel });
      await api.put("/settings/active_provider", { value: "ollama" });
      setActiveProvider("ollama");
      flash("ok", "Ollama ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveLmstudio = async () => {
    setSaving(true);
    try {
      await api.post("/config/lmstudio", { base_url: lmstudioUrl, model: lmstudioModel });
      await api.put("/settings/active_provider", { value: "lmstudio" });
      setActiveProvider("lmstudio");
      flash("ok", "LM Studio ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveOpenRouter = async () => {
    setSaving(true);
    try {
      await api.post("/config/openrouter", { api_key: orApiKey, cloud_model: orModel });
      await api.put("/settings/active_provider", { value: "openrouter" });
      setActiveProvider("openrouter");
      flash("ok", "OpenRouter ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveOpenCodeGo = async () => {
    setSaving(true);
    try {
      await api.post("/config/opencode-go", { api_key: ocgApiKey, model: ocgModel });
      await api.put("/settings/active_provider", { value: "opencode_go" });
      setActiveProvider("opencode_go");
      flash("ok", "OpenCode Go ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveSafety = async () => {
    setSaving(true);
    try {
      await api.post("/config/safety", safety);
      flash("ok", "Guvenlik ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveMsf = async () => {
    setSaving(true);
    try {
      await api.post("/config/msf", { host: msf.host, port: msf.port, password: msf.password, ssl: msf.ssl });
      flash("ok", "Metasploit ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveNmap = async () => {
    setSaving(true);
    try {
      await api.post("/config/nmap", { nmap_sudo: nmapSudo });
      flash("ok", "Nmap ayarlari kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveBranding = async () => {
    setSaving(true);
    try {
      await api.post("/config/branding", { company_name: brandingName });
      flash("ok", "Branding kaydedildi");
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
      flash("ok", "Logo yuklendi");
    } catch (err: unknown) { flash("err", String(err)); }
    setSaving(false);
  };

  const deleteLogo = async () => {
    setSaving(true);
    try {
      await api.delete("/config/branding/logo");
      setBrandingHasLogo(false);
      setBrandingLogoUrl("");
      flash("ok", "Logo silindi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveAgentModels = async () => {
    setSaving(true);
    try {
      await api.put("/settings/agent_models", { value: JSON.stringify(agentModels) });
      flash("ok", "Agent modelleri kaydedildi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const saveProfile = async () => {
    if (!profileName && !profileEmail) return;
    setSaving(true);
    try {
      const body: any = {};
      if (profileName) body.full_name = profileName;
      if (profileEmail) body.email = profileEmail;
      const res = await api.put<{ token?: string; user?: any }>("/auth/me", body);
      if (res.user) {
        const stored = JSON.parse(localStorage.getItem("tirpan_user") || "{}");
        const updated = { ...stored, ...res.user };
        localStorage.setItem("tirpan_user", JSON.stringify(updated));
      }
      setProfileName("");
      setProfileEmail("");
      flash("ok", "Profil guncellendi");
    } catch (e: unknown) { flash("err", String(e)); }
    setSaving(false);
  };

  const changePassword = async () => {
    if (!currentPassword || !newPassword) {
      flash("err", "Mevcut ve yeni sifre gerekli");
      return;
    }
    if (newPassword !== confirmPassword) {
      flash("err", "Yeni sifreler eslesmiyor");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      flash("ok", "Sifre degistirildi");
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
          {tabs.map((t) => (
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
                <p className="text-sm text-muted-foreground mb-4">
                  Saldirilar icin kullanilacak yapay zeka saglayicisini secin.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {(
                    [
                      { id: "ollama", label: "Ollama", desc: " Lokal LLM" },
                      { id: "lmstudio", label: "LM Studio", desc: " Lokal GUI" },
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
                      Durumu Yenile
                    </Button>
                  </div>
                  <FieldRow label="Base URL" desc="Ollama sunucu adresi">
                    <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Model" desc="Kullanilacak Ollama modeli">
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
                    Kaydet
                  </Button>
                </Section>
              )}

              {activeProvider === "lmstudio" && (
                <Section title="LM Studio">
                  <div className="flex items-center justify-between mb-3">
                    <StatusDot online={lmstudioOnline} />
                    <Button variant="outline" size="sm" onClick={fetchLmstudioStatus} className="gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Durumu Yenile
                    </Button>
                  </div>
                  <FieldRow label="Base URL" desc="LM Studio sunucu adresi">
                    <Input value={lmstudioUrl} onChange={(e) => setLmstudioUrl(e.target.value)} placeholder="http://127.0.0.1:1234" autoComplete="off" />
                  </FieldRow>
                  <FieldRow label="Model" desc="Kullanilacak LM Studio modeli">
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
                    Kaydet
                  </Button>
                </Section>
              )}

              {activeProvider === "openrouter" && (
                <Section title="OpenRouter">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot online={orHasApiKey} label={orHasApiKey ? "API Key mevcut" : "API Key yok"} />
                    <Button variant="outline" size="sm" onClick={fetchOrModels} className="gap-1.5 ml-auto">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Modelleri Getir
                    </Button>
                  </div>
                  <FieldRow label="API Key" desc="OpenRouter API anahtari">
                    <div className="relative">
                      <Input
                        value={orApiKey}
                        onChange={(e) => setOrApiKey(e.target.value)}
                        type={showOrKey ? "text" : "password"}
                        placeholder={orHasApiKey ? "••••••••••••• (kayıtlı)" : "sk-or-..."}
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
                  <FieldRow label="Cloud Model" desc="Kullanilacak bulut modeli">
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
                    Kaydet
                  </Button>
                </Section>
              )}

              {activeProvider === "opencode_go" && (
                <Section title="OpenCode Go">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusDot online={ocgHasApiKey} label={ocgHasApiKey ? "API Key mevcut" : "API Key yok"} />
                    <Button variant="outline" size="sm" onClick={fetchOcgModels} className="gap-1.5 ml-auto">
                      <RefreshCw className="w-3.5 h-3.5" />
                      Modelleri Getir
                    </Button>
                  </div>
                  <FieldRow label="API Key" desc="OpenCode Go API anahtari">
                    <div className="relative">
                      <Input
                        value={ocgApiKey}
                        onChange={(e) => setOcgApiKey(e.target.value)}
                        type={showOcgKey ? "text" : "password"}
                        placeholder={ocgHasApiKey ? "••••••••••••• (kayıtlı)" : "oc-go-..."}
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
                  <FieldRow label="Model" desc="Kullanilacak model">
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
                    Kaydet
                  </Button>
                </Section>
              )}
            </div>
          )}

          {/* ── SAFETY ───────────────────────────────── */}
          {tab === "safety" && (
            <div className="space-y-6">
              <Section title="Guvenlik Ayarlari">
                <p className="text-sm text-muted-foreground mb-2">
                  Pentest sinirlarini ve guvenlik kurallarini yapilandirin.
                </p>
                <FieldRow label="Izin Verilen CIDR" desc="Taranabilecek IP araligi">
                  <Input value={safety.allowed_cidr} onChange={(e) => setSafety({ ...safety, allowed_cidr: e.target.value })} />
                </FieldRow>
                <FieldRow label="Port Araligi" desc="Minimum ve maksimum port numaralari">
                  <div className="flex gap-2">
                    <Input type="number" value={safety.allowed_port_min} onChange={(e) => setSafety({ ...safety, allowed_port_min: Number(e.target.value) })} className="w-24" />
                    <span className="text-muted-foreground self-center">—</span>
                    <Input type="number" value={safety.allowed_port_max} onChange={(e) => setSafety({ ...safety, allowed_port_max: Number(e.target.value) })} className="w-24" />
                  </div>
                </FieldRow>
                <FieldRow label="Dis birakilan IP'ler" desc="Virgul ile ayirin">
                  <Input value={safety.excluded_ips} onChange={(e) => setSafety({ ...safety, excluded_ips: e.target.value })} placeholder="192.168.1.1, 10.0.0.5" />
                </FieldRow>
                <FieldRow label="Dis birakilan Portlar" desc="Virgul ile ayirin">
                  <Input value={safety.excluded_ports} onChange={(e) => setSafety({ ...safety, excluded_ports: e.target.value })} placeholder="23, 25, 5900" />
                </FieldRow>
                <FieldRow label="Maksimum Severity" desc="Bu seviyeye kadar zafiyetler taranir">
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
                <FieldRow label="Sure limiti (saniye)" desc="0 = sinirsiz">
                  <Input type="number" value={safety.session_max_seconds} onChange={(e) => setSafety({ ...safety, session_max_seconds: Number(e.target.value) })} />
                </FieldRow>
                <FieldRow label="Hiz limiti (req/s)" desc="Saniyede maksimum istek">
                  <Input type="number" value={safety.max_requests_per_second} onChange={(e) => setSafety({ ...safety, max_requests_per_second: Number(e.target.value) })} />
                </FieldRow>
              </Section>

              <Separator />

              <Section title="Exploit Kontrolleri">
                <FieldRow label="Exploit izni ver" desc="Tarama sonrasi exploit asamasini etkinlestirir">
                  <Switch checked={safety.allow_exploit} onCheckedChange={(v) => setSafety({ ...safety, allow_exploit: v })} />
                </FieldRow>
                <FieldRow label="DoS exploitlerini engelle" desc="Servis disi birakma saldirilarini onler">
                  <Switch checked={safety.block_dos_exploits} onCheckedChange={(v) => setSafety({ ...safety, block_dos_exploits: v })} />
                </FieldRow>
                <FieldRow label="Yikici eylemleri engelle" desc="Veri silme, format gibi geri alinamaz islemleri onler">
                  <Switch checked={safety.block_destructive} onCheckedChange={(v) => setSafety({ ...safety, block_destructive: v })} />
                </FieldRow>
              </Section>

              <Separator />

              <Section title="V3 Architecture">
                <FieldRow label="V3 mimarisini etkinlestir" desc="SquadLeaders, VerifierAgent, CriticAgent, RAG, KnowledgeGraph, DynamicModelRouter">
                  <Switch checked={safety.v3_features} onCheckedChange={(v) => setSafety({ ...safety, v3_features: v })} />
                </FieldRow>
                <FieldRow label="Persistence izni ver" desc="⚠ Agent backdoor kurar (cron, SSH key, systemd, registry). Sadece sahip olunan lab sistemlerinde etkinlestirin.">
                  <Switch checked={safety.allow_persistence} onCheckedChange={(v) => setSafety({ ...safety, allow_persistence: v })} />
                </FieldRow>
              </Section>

              <Button onClick={saveSafety} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guvenlik Ayarlarini Kaydet
              </Button>
            </div>
          )}

          {/* ── METASPLOIT ───────────────────────────── */}
          {tab === "msf" && (
            <div className="space-y-6">
              <Section title="Metasploit RPC Yapilandirmasi">
                <p className="text-sm text-muted-foreground mb-2">
                  Msfrpcd baglantisi icin host, port ve sifre ayarlarini yapin.
                </p>
                <FieldRow label="Host" desc="msfrpcd adresi">
                  <Input value={msf.host} onChange={(e) => setMsf({ ...msf, host: e.target.value })} autoComplete="off" />
                </FieldRow>
                <FieldRow label="Port" desc="msfrpcd portu">
                  <Input type="number" value={msf.port} onChange={(e) => setMsf({ ...msf, port: Number(e.target.value) })} autoComplete="off" />
                </FieldRow>
                <FieldRow label="Sifre" desc="msfrpcd sifresi">
                  <div className="relative">
                    <Input
                      value={msf.password}
                      onChange={(e) => setMsf({ ...msf, password: e.target.value })}
                      type={showMsfPw ? "text" : "password"}
                      placeholder="msfrpcd sifresi"
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
                <FieldRow label="SSL" desc="SSL ile baglan">
                  <Switch checked={msf.ssl} onCheckedChange={(v) => setMsf({ ...msf, ssl: v })} />
                </FieldRow>
              </Section>
              <Button onClick={saveMsf} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Metasploit Ayarlarini Kaydet
              </Button>
            </div>
          )}

          {/* ── NMAP ─────────────────────────────────── */}
          {tab === "nmap" && (
            <div className="space-y-6">
              <Section title="Nmap Yapilandirmasi">
                <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-muted/50 border border-border/50">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Platform:</span>{" "}
                    <span className="font-medium">{nmapPlatform || "—"} </span>
                    <span className="ml-3 text-muted-foreground">Yetki:</span>{" "}
                    <span className="font-medium">{nmapElevated ? "Root / Admin" : "Normal user"}</span>
                  </div>
                </div>
                <FieldRow label="Sudo ile calistir" desc="OS tespiti ve SYN taramalari icin gerekli">
                  <Switch checked={nmapSudo} onCheckedChange={setNmapSudo} />
                </FieldRow>
              </Section>
              <Button onClick={saveNmap} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Nmap Ayarlarini Kaydet
              </Button>
            </div>
          )}

          {/* ── CREDENTIALS ──────────────────────────── */}
          {tab === "credentials" && (
            <div className="space-y-6">
              <Section title="Kimlik Bilgileri">
                <p className="text-sm text-muted-foreground mb-4">
                  SSH, SMB, SNMP ve diger protokoller icin kimlik bilgilerini yonetin.
                  Bu sayfa expert modda daha detayli yonetilebilir.
                </p>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Lock className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Credential yonetimi expert moddan yapilir</p>
                  <a href="/" className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    Expert Mode →
                  </a>
                </div>
              </Section>
            </div>
          )}

          {/* ── SCAN PROFILES ─────────────────────────── */}
          {tab === "scan-profiles" && (
            <div className="space-y-6">
              <Section title="Tarama Profilleri">
                <p className="text-sm text-muted-foreground mb-4">
                  Yeniden kullanilabilir tarama sablonlari olusturun. Expert modda daha fazla secenek mevcuttur.
                </p>
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Sliders className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">Profil yonetimi expert moddan yapilir</p>
                  <a href="/" className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                    Expert Mode →
                  </a>
                </div>
              </Section>
            </div>
          )}

          {/* ── BRANDING ─────────────────────────────── */}
          {tab === "branding" && (
            <div className="space-y-6">
              <Section title="Branding">
                <FieldRow label="Sirket Adi" desc="Raporlarda gosterilecek isim">
                  <Input value={brandingName} onChange={(e) => setBrandingName(e.target.value)} placeholder="Tirpan" />
                </FieldRow>
                <FieldRow label="Logo" desc="Raporlarda gosterilecek logo">
                  <div className="flex items-center gap-3">
                    {brandingHasLogo && brandingLogoUrl && (
                      <img src={brandingLogoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain border border-border" />
                    )}
                    <label className="cursor-pointer px-3 py-2 rounded-xl bg-muted border border-border text-sm hover:bg-muted/80 transition-colors">
                      Yukle
                      <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={uploadLogo} className="hidden" />
                    </label>
                    {brandingHasLogo && (
                      <Button variant="outline" size="sm" onClick={deleteLogo} className="text-destructive">
                        Sil
                      </Button>
                    )}
                  </div>
                </FieldRow>
              </Section>
              <Button onClick={saveBranding} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Branding Kaydet
              </Button>
            </div>
          )}

          {/* ── PROFILE ─────────────────────────────── */}
          {tab === "profile" && (
            <div className="space-y-6">
              <Section title="Profil">
                {isLoggedIn ? (
                  <>
                    <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-muted/50 border border-border/50">
                      <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-display font-bold text-lg">
                        {(user?.full_name || "U")[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-display font-bold">{user?.full_name}</div>
                        <div className="text-sm text-muted-foreground">{user?.email}</div>
                        <Badge variant="secondary" className="mt-1">{user?.role}</Badge>
                      </div>
                    </div>

                    <Separator />

                    <Section title="Edit Profile">
                      <FieldRow label="Full Name" desc="Change your display name">
                        <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder={user?.full_name || "Full name"} autoComplete="off" name="tirpan-fullname" />
                      </FieldRow>
                      <FieldRow label="Email" desc="Change your email address">
                        <Input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} placeholder={user?.email || "Email"} type="email" autoComplete="off" name="tirpan-email" />
                      </FieldRow>
                    </Section>

                    <Separator />

                    <Section title="Change Password">
                      <FieldRow label="Current Password" desc="Enter your current password">
                        <div className="relative">
                          <Input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type={showCurrentPw ? "text" : "password"} placeholder="Current password" autoComplete="current-password" name="tirpan-cur-pw" />
                          <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FieldRow>
                      <FieldRow label="New Password" desc="Enter new password">
                        <div className="relative">
                          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type={showNewPw ? "text" : "password"} placeholder="New password" autoComplete="new-password" name="tirpan-new-pw" />
                          <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FieldRow>
                      <FieldRow label="Confirm Password" desc="Re-enter new password">
                        <div className="relative">
                          <Input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type={showConfirmPw ? "text" : "password"} placeholder="Confirm new password" autoComplete="new-password" name="tirpan-confirm-pw" />
                          <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FieldRow>
                      <Button onClick={saveProfile} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Profile
                      </Button>
                      <Button onClick={changePassword} disabled={saving} className="gap-2 ml-3">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        Change Password
                      </Button>
                    </Section>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Lock className="w-12 h-12 mb-3 opacity-30" />
                    <p className="text-sm">Profil bilgilerinizi gormek icin giris yapin</p>
                    <a href="/normal/login" className="mt-3 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                      Giris Yap
                    </a>
                  </div>
                )}
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