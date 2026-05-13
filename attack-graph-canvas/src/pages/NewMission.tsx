import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/attack/PageShell";
import { isDemoMode } from "@/lib/demoMode";
import { createSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/utils";
import {
  Target,
  Play,
  Loader2,
  Shield,
  Zap,
  Globe,
  Plus,
  Trash2,
  Radio,
  Gauge,
  ScanSearch,
  Network,
  AlertTriangle,
  FolderOpen,
  RotateCcw,
  KeyRound,
  Terminal,
  Database,
  Wifi,
  Monitor,
  Settings2,
  MousePointerClick,
  EyeOff,
  ArrowLeft,
  Server,
  Users,
} from "lucide-react";

type TabId = "target" | "mode" | "credentials" | "safety" | "advanced";

const TABS: { id: TabId; label: string; icon: typeof Target }[] = [
  { id: "target", label: "Target & Brief", icon: Target },
  { id: "mode", label: "Mode & Speed", icon: Zap },
  { id: "credentials", label: "Credentials", icon: KeyRound },
  { id: "safety", label: "Safety", icon: Shield },
  { id: "advanced", label: "Advanced", icon: Settings2 },
];

const MODES = [
  {
    id: "scan_only",
    label: "Scan Only",
    desc: "No exploits. Reconnaissance only — map hosts, ports, services, vulnerabilities.",
    icon: Radio,
  },
  {
    id: "ask_before_exploit",
    label: "Ask Before Exploit",
    desc: "Full recon + exploit capability with operator confirmation before each exploit attempt.",
    icon: MousePointerClick,
  },
  {
    id: "full_auto",
    label: "Full Auto",
    desc: "Autonomous recon + exploit chain. No human approval required.",
    icon: Zap,
  },
  {
    id: "v2_auto",
    label: "Multi-agent orchestration",
    desc: "Coordinated specialist agents run recon, analysis, and actions under central orchestration.",
    icon: Users,
  },
];

const SPEEDS = [
  { id: "stealth", label: "Stealth", desc: "Slow, quiet (-T2)", icon: EyeOff },
  { id: "normal", label: "Normal", desc: "Balanced timing (-T3)", icon: Gauge },
  { id: "fast", label: "Fast", desc: "Aggressive timing (-T4)", icon: Zap },
];

const SCAN_TYPES = [
  { id: "syn", label: "SYN", desc: "Half-open TCP scan", icon: Network },
  { id: "connect", label: "Connect", desc: "Full TCP handshake", icon: Globe },
  { id: "udp", label: "UDP", desc: "UDP port scan", icon: Wifi },
  { id: "full", label: "Full", desc: "Comprehensive scan", icon: ScanSearch },
];

const PORT_PRESETS: { label: string; value: string }[] = [
  { label: "Quick (top 100)", value: "top100" },
  { label: "Top 1000", value: "top1000" },
  { label: "All ports", value: "1-65535" },
  { label: "Well-known", value: "1-1024" },
];

const CRED_TYPES = [
  { id: "ssh", label: "SSH", icon: Terminal, fields: ["username", "password", "host"] },
  { id: "smb", label: "SMB", icon: Server, fields: ["username", "password", "domain", "host"] },
  { id: "snmp", label: "SNMP", icon: Network, fields: ["community", "host", "version"] },
  { id: "db", label: "Database", icon: Database, fields: ["username", "password", "host", "port", "db_type"] },
  { id: "web", label: "Web", icon: Monitor, fields: ["username", "password", "url"] },
];

const AGENT_TYPES = [
  "brain",
  "scanner",
  "exploit",
  "webapp",
  "postexploit",
  "lateral",
  "reporting",
  "osint",
] as const;

interface CredentialRow {
  type: string;
  username: string;
  password: string;
  host: string;
  domain: string;
  community: string;
  version: string;
  port: string;
  db_type: string;
  url: string;
}

interface AgentModel {
  provider: string;
  model: string;
}

const NewMission = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Tab ─────────────────────────────────────────
  const [tab, setTab] = useState<TabId>("target");

  // ── Target tab ──────────────────────────────────
  const [target, setTarget] = useState("");
  const [additionalTargets, setAdditionalTargets] = useState<string[]>([""]);
  const [scopeNotes, setScopeNotes] = useState("");
  const [missionName, setMissionName] = useState("");

  // ── Mode tab ────────────────────────────────────
  const [mode, setMode] = useState("scan_only");
  const [speedProfile, setSpeedProfile] = useState("normal");
  const [scanType, setScanType] = useState("syn");
  const [portRange, setPortRange] = useState("1-65535");
  const [versionDetection, setVersionDetection] = useState(true);
  const [osDetection, setOsDetection] = useState(false);
  const [nmapSudo, setNmapSudo] = useState(false);
  const [nmapScripts, setNmapScripts] = useState("");
  const [aggressiveScan, setAggressiveScan] = useState(false);

  // ── Credentials tab ─────────────────────────────
  const [credRows, setCredRows] = useState<CredentialRow[]>([
    { type: "ssh", username: "", password: "", host: "", domain: "", community: "", version: "", port: "", db_type: "", url: "" },
  ]);
  const [selectedSavedIds, setSelectedSavedIds] = useState<string[]>([]);

  // ── Safety tab ──────────────────────────────────
  const [allowedCidr, setAllowedCidr] = useState("0.0.0.0/0");
  const [portMin, setPortMin] = useState(1);
  const [portMax, setPortMax] = useState(65535);
  const [excludedIps, setExcludedIps] = useState("");
  const [excludedPorts, setExcludedPorts] = useState("");
  const [allowExploit, setAllowExploit] = useState(true);
  const [blockDos, setBlockDos] = useState(true);
  const [blockDestructive, setBlockDestructive] = useState(true);
  const [maxSeverity, setMaxSeverity] = useState("CRITICAL");
  const [timeLimit, setTimeLimit] = useState(7200);
  const [rateLimit, setRateLimit] = useState(50);
  const [allowPostExploit, setAllowPostExploit] = useState(false);
  const [allowLateral, setAllowLateral] = useState(false);
  const [allowDockerEscape, setAllowDockerEscape] = useState(false);
  const [allowBrowserRecon, setAllowBrowserRecon] = useState(false);

  // ── Advanced tab ────────────────────────────────
  const [agentModels, setAgentModels] = useState<Record<string, AgentModel>>({});
  const [toolPermissions, setToolPermissions] = useState<Record<string, boolean>>({});
  const [objectives, setObjectives] = useState("");
  const [knownTech, setKnownTech] = useState("");
  const [confirmEveryStep, setConfirmEveryStep] = useState(false);
  const [missionNotes, setMissionNotes] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");

  // ── Submit state ────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Demo mode: pre-fill default values ──────────
  useEffect(() => {
    if (!isDemoMode()) return;
    setTarget("192.168.56.101");
    setMissionName("Metasploitable 2 Lab (Demo)");
    setScopeNotes("Intentionally vulnerable VM — Metasploitable 2. Authorized for testing.");
    setMode("full_auto");
    setSpeedProfile("normal");
    setScanType("syn");
    setPortRange("1-65535");
    setVersionDetection(true);
    setOsDetection(true);
    setAllowExploit(true);
    setAllowPostExploit(true);
    setAllowLateral(false);
    setBlockDos(true);
    setBlockDestructive(true);
    setMaxSeverity("CRITICAL");
    setAllowedCidr("192.168.56.0/24");
    setObjectives("Gain root access\nDocument all CVEs\nDump credentials");
    setKnownTech("Linux, vsftpd, Samba, MySQL, Distcc");
    setCredRows([{
      type: "ssh",
      username: "msfadmin",
      password: "msfadmin",
      host: "192.168.56.101",
      domain: "",
      community: "",
      version: "",
      port: "22",
      db_type: "",
      url: "",
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data fetching ───────────────────────────────
  const { data: credData } = useQuery<{ id: string; type: string; username: string; host: string }[]>({
    queryKey: ["credentials-list"],
    queryFn: () => api.get("/credentials"),
  });

  const { data: toolsData } = useQuery<{ tools: { name: string; available: boolean }[] }>({
    queryKey: ["tools-status"],
    queryFn: () => api.get("/tools/status"),
  });

  const { data: settingsData } = useQuery<Record<string, unknown>>({
    queryKey: ["settings"],
    queryFn: () => api.get("/settings"),
  });

  const { data: ollamaStatus } = useQuery<{ online: boolean; models: string[]; current: string }>({
    queryKey: ["ollama-status"],
    queryFn: () => api.get("/ollama/status"),
    staleTime: 30000,
  });

  const { data: lmstudioStatus } = useQuery<{ online: boolean; models: string[]; current: string }>({
    queryKey: ["lmstudio-status"],
    queryFn: () => api.get("/lmstudio/status"),
    staleTime: 30000,
  });

  useEffect(() => {
    if (toolsData?.tools && !Object.keys(toolPermissions).length) {
      const perms: Record<string, boolean> = {};
      toolsData.tools.forEach((t) => {
        perms[t.name] = true;
      });
      setToolPermissions(perms);
    }
  }, [toolsData]);

  // ── Derived ─────────────────────────────────────
  const modeDescription = useMemo(() => {
    return MODES.find((m) => m.id === mode)?.desc || "";
  }, [mode]);

  // Collect all available models grouped by provider
  const availableModels = useMemo(() => {
    const entries: { provider: string; model: string; label: string }[] = [];
    if (ollamaStatus?.online) {
      (ollamaStatus.models || []).forEach((m) => entries.push({ provider: "ollama", model: m, label: `Ollama: ${m}` }));
    }
    if (lmstudioStatus?.online) {
      (lmstudioStatus.models || []).forEach((m) => entries.push({ provider: "lmstudio", model: m, label: `LM Studio: ${m}` }));
    }
    return entries;
  }, [ollamaStatus, lmstudioStatus]);

  // ── Helpers ─────────────────────────────────────
  const addTargetRow = () => setAdditionalTargets((p) => [...p, ""]);
  const removeTargetRow = (i: number) => setAdditionalTargets((p) => p.filter((_, idx) => idx !== i));
  const updateTargetRow = (i: number, v: string) =>
    setAdditionalTargets((p) => p.map((t, idx) => (idx === i ? v : t)));

  const addCredRow = () =>
    setCredRows((p) => [
      ...p,
      { type: "ssh", username: "", password: "", host: "", domain: "", community: "", version: "", port: "", db_type: "", url: "" },
    ]);
  const removeCredRow = (i: number) => setCredRows((p) => p.filter((_, idx) => idx !== i));
  const updateCredRow = (i: number, key: keyof CredentialRow, v: string) =>
    setCredRows((p) => p.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

  const toggleCredType = (i: number, type: string) => {
    setCredRows((p) =>
      p.map((r, idx) =>
        idx === i
          ? { type, username: "", password: "", host: "", domain: "", community: "", version: "", port: "", db_type: "", url: "" }
          : r
      )
    );
  };

  const toggleSavedCred = (id: string) => {
    setSelectedSavedIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const toggleTool = (name: string) => {
    setToolPermissions((p) => ({ ...p, [name]: !p[name] }));
  };

  const setAgentModel = (agentType: string, field: "provider" | "model", value: string) => {
    setAgentModels((p) => ({
      ...p,
      [agentType]: { ...(p[agentType] || { provider: "", model: "" }), [field]: value },
    }));
  };
  const clearAgentModel = (agentType: string) => {
    setAgentModels((p) => {
      const next = { ...p };
      delete next[agentType];
      return next;
    });
  };

  const loadGlobalDefaults = () => {
    if (settingsData) {
      const am = settingsData["agent_models"] as Record<string, { provider: string; model: string }> | undefined;
      if (am) {
        const mapped: Record<string, AgentModel> = {};
        for (const [key, val] of Object.entries(am)) {
          if (val && typeof val === "object") {
            mapped[key] = { provider: val.provider || "", model: val.model || "" };
          }
        }
        setAgentModels(mapped);
      }
      const gp = settingsData["provider"] as string | undefined;
      const gm = settingsData["model"] as string | undefined;
      if (gp) setProvider(gp);
      if (gm) setModel(gm);
    }
  };

  // ── Submit ──────────────────────────────────────
  const launchMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/sessions", body),
    onSuccess: async () => {
      try {
        await api.post("/settings/last_mission_config", buildPayload());
      } catch {}
      qc.invalidateQueries({ queryKey: ["sessions"] });
      navigate("/missions");
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to launch mission");
    },
    onSettled: () => setSaving(false),
  });

  const buildPayload = (): Record<string, unknown> => {
    const cidr = portMin === 1 && portMax === 65535 ? allowedCidr : allowedCidr;

    return {
      target: target.trim(),
      mode,
      mission_name: missionName.trim() || undefined,

      additional_targets: additionalTargets.filter((t) => t.trim()),
      scope_notes: scopeNotes.trim() || undefined,

      speed_profile: speedProfile,
      scan_type: scanType,
      port_range: portRange,
      os_detection: osDetection,
      version_detection: versionDetection,
      nmap_sudo: nmapSudo,
      nmap_scripts: nmapScripts.trim() || undefined,
      aggressive_scan: aggressiveScan,

      credential_ids: selectedSavedIds,
      credentials: credRows
        .filter((r) => r.username || r.password || r.community)
        .map((r) => {
          const base: Record<string, string> = { type: r.type };
          if (r.username) base["username"] = r.username;
          if (r.password) base["password"] = r.password;
          if (r.host) base["host"] = r.host;
          if (r.domain) base["domain"] = r.domain;
          if (r.community) base["community"] = r.community;
          if (r.version) base["version"] = r.version;
          if (r.port) base["port"] = r.port;
          if (r.db_type) base["db_type"] = r.db_type;
          if (r.url) base["url"] = r.url;
          return base;
        }),

      allowed_cidr: cidr || undefined,
      allow_exploit: allowExploit,
      block_dos: blockDos,
      block_destructive: blockDestructive,
      max_severity: maxSeverity || undefined,
      time_limit: timeLimit || undefined,
      rate_limit: rateLimit || undefined,
      excluded_targets: excludedIps ? excludedIps.split(",").map((s) => s.trim()).filter(Boolean) : [],
      excluded_ports: excludedPorts ? excludedPorts.split(",").map((s) => s.trim()).filter(Boolean) : [],

      allow_post_exploitation: allowPostExploit,
      allow_lateral_movement: allowLateral,
      allow_docker_escape: allowDockerEscape,
      allow_browser_recon: allowBrowserRecon,
      allow_persistence: false,
      v3_features: true,

      agent_models: Object.keys(agentModels).length > 0 ? agentModels : undefined,

      objectives: objectives
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      known_tech: knownTech
        ? knownTech.split(",").map((s) => s.trim()).filter(Boolean)
        : [],

      confirm_every_step: confirmEveryStep,
      notes: missionNotes.trim() || undefined,

      provider: provider || undefined,
      model: model || undefined,
    };
  };

  const handleSubmit = useCallback(async () => {
    if (!target.trim() && !missionName.trim() && additionalTargets.filter((t) => t.trim()).length === 0) {
      setError("At least a primary target, mission name, or additional target is required.");
      return;
    }
    setSaving(true);
    setError("");

    if (isDemoMode()) {
      try {
        await createSession({ target: target.trim() || "192.168.56.101", mode });
        qc.invalidateQueries({ queryKey: ["sessions"] });
        navigate("/attack-graph");
      } catch {
        setError("Demo launch failed.");
        setSaving(false);
      }
      return;
    }

    launchMut.mutate(buildPayload());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, missionName, additionalTargets, mode, launchMut, qc, navigate]);

  // ── Render helpers ──────────────────────────────
  const fieldLabel = (text: string, desc?: string) => (
    <div className="mb-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{text}</Label>
      {desc && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{desc}</p>}
    </div>
  );

  return (
    <PageShell title="New Mission" subtitle="Configure and launch pentest session">
      <div className="flex flex-col h-full gap-0 max-w-4xl mx-auto w-full">
        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-4 shrink-0 bg-card/60 backdrop-blur rounded-full p-1.5 border border-border/50 self-start">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pill-tab ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <t.icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto node-card !p-6 mb-3 min-h-0">
          {/* ── TARGET ──────────────────────────────── */}
          {tab === "target" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Target & Mission Brief</h3>
                <p className="text-sm text-muted-foreground">Define your target scope, mission identity, and objectives.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  {fieldLabel("Primary Target", "IP, CIDR, domain, or hostname (required)")}
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="corp.local, 192.168.1.0/24, example.com"
                      className="pl-10"
                      autoComplete="off"
                      name="tirpan-target"
                    />
                  </div>
                </div>

                <div>
                  {fieldLabel("Mission Name", "Optional display name for this session")}
                  <Input
                    value={missionName}
                    onChange={(e) => setMissionName(e.target.value)}
                    placeholder="Q2 Internal Network Assessment"
                    autoComplete="off"
                    name="tirpan-mission-name"
                  />
                </div>

                <div>
                  {fieldLabel("Scope Notes", "Constraints, environment, etc.")}
                  <Input
                    value={scopeNotes}
                    onChange={(e) => setScopeNotes(e.target.value)}
                    placeholder="Internal only. No production during business hours."
                    autoComplete="off"
                    name="tirpan-scope"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  {fieldLabel("Additional Targets", "IPs, CIDRs, or hostnames to include")}
                  <button
                    type="button"
                    onClick={addTargetRow}
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-2">
                  {additionalTargets.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={t}
                        onChange={(e) => updateTargetRow(i, e.target.value)}
                        placeholder="192.168.2.0/24"
                        autoComplete="off"
                        name={`tirpan-addtarget-${i}`}
                      />
                      {additionalTargets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeTargetRow(i)}
                          className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Mission objectives & brief — moved from Advanced */}
              <div>
                {fieldLabel("Mission Objectives", "One per line. Empty = maximum enumeration mode.")}
                <Textarea
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                  placeholder={`find flag.txt\ndump /etc/shadow\nachieve root on all hosts`}
                  rows={3}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
              </div>

              <div>
                {fieldLabel("Mission Briefing / Notes", "Additional context and instructions for AI agents")}
                <Textarea
                  value={missionNotes}
                  onChange={(e) => setMissionNotes(e.target.value)}
                  placeholder="This is an authorized internal pentest. Focus on web application vulnerabilities and lateral movement paths..."
                  rows={3}
                  autoComplete="off"
                />
              </div>

              <div>
                {fieldLabel("Known Technologies", "Comma-separated tech stack hints")}
                <Input
                  value={knownTech}
                  onChange={(e) => setKnownTech(e.target.value)}
                  placeholder="nginx, postgresql, django, redis"
                  autoComplete="off"
                  name="tirpan-knowntech"
                />
              </div>
            </div>
          )}

          {/* ── MODE & SPEED ────────────────────────── */}
          {tab === "mode" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Operation Mode</h3>
                <p className="text-sm text-muted-foreground">Choose how aggressive and autonomous the pentest should be.</p>
              </div>

              <div>
                {fieldLabel("Mode")}
                <div className="grid grid-cols-4 gap-2">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        mode === m.id
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border/50 bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <m.icon className={`w-4 h-4 mb-1.5 ${mode === m.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{m.desc}</div>
                    </button>
                  ))}
                </div>
                {modeDescription && (
                  <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Selected: </span>
                    {modeDescription}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                {fieldLabel("Speed Profile", "Scan timing aggressiveness")}
                <div className="grid grid-cols-3 gap-2">
                  {SPEEDS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSpeedProfile(s.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        speedProfile === s.id
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border/50 bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <s.icon className={`w-4 h-4 mb-1.5 ${speedProfile === s.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                {fieldLabel("Scan Type", "TCP/UDP scan technique")}
                <div className="grid grid-cols-4 gap-2">
                  {SCAN_TYPES.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setScanType(st.id)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        scanType === st.id
                          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                          : "border-border/50 bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <st.icon className={`w-4 h-4 mx-auto mb-1 ${scanType === st.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-xs font-medium">{st.label}</div>
                      <div className="text-[10px] text-muted-foreground">{st.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                {fieldLabel("Port Range", "Which ports to scan")}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {PORT_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPortRange(p.value)}
                        className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${
                          portRange === p.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={portRange}
                    onChange={(e) => setPortRange(e.target.value)}
                    placeholder="1-65535 or T:1-1024,U:53,161"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={versionDetection} onCheckedChange={setVersionDetection} />
                  <Label className="text-xs">Version Detection</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={osDetection} onCheckedChange={setOsDetection} />
                  <Label className="text-xs">OS Detection (-O)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={nmapSudo} onCheckedChange={setNmapSudo} />
                  <Label className="text-xs">Run with sudo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={aggressiveScan} onCheckedChange={setAggressiveScan} />
                  <Label className="text-xs">Aggressive (-A)</Label>
                </div>
              </div>

              <div>
                {fieldLabel("NSE Scripts", "Nmap script engine (e.g. vuln, default, safe, or script names)")}
                <Input
                  value={nmapScripts}
                  onChange={(e) => setNmapScripts(e.target.value)}
                  placeholder="vuln,safe  or  http-title,ssl-cert"
                  className="font-mono text-xs"
                  autoComplete="off"
                  name="tirpan-nmap-scripts"
                />
              </div>
            </div>
          )}

          {/* ── CREDENTIALS ──────────────────────────── */}
          {tab === "credentials" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Authentication Credentials</h3>
                <p className="text-sm text-muted-foreground">
                  Provide credentials for authenticated scanning and exploitation. These are encrypted at rest.
                </p>
              </div>

              {/* Manual entry */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  {fieldLabel("Manual Credentials")}
                  <button
                    type="button"
                    onClick={addCredRow}
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"
                  >
                    <Plus className="w-3 h-3" /> Add Credential
                  </button>
                </div>
                <div className="space-y-3">
                  {credRows.map((r, i) => {
                    const typeDef = CRED_TYPES.find((ct) => ct.id === r.type) || CRED_TYPES[0];
                    return (
                      <div key={i} className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {typeDef.icon && <typeDef.icon className="w-4 h-4 text-muted-foreground" />}
                            <div className="flex gap-1">
                              {CRED_TYPES.map((ct) => (
                                <button
                                  key={ct.id}
                                  type="button"
                                  onClick={() => toggleCredType(i, ct.id)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
                                    r.type === ct.id
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                                  }`}
                                >
                                  {ct.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {credRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeCredRow(i)}
                              className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {typeDef.fields.map((f) => (
                            <div key={f}>
                              <Label className="text-[10px] text-muted-foreground uppercase">{f}</Label>
                              <Input
                                value={(r as any)[f] || ""}
                                onChange={(e) => updateCredRow(i, f as keyof CredentialRow, e.target.value)}
                                placeholder={f}
                                type={f === "password" ? "password" : "text"}
                                className="h-8 text-xs"
                                autoComplete={f === "password" ? "new-password" : "off"}
                                name={`tirpan-cred-${i}-${f}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Saved credentials */}
              <div>
                {fieldLabel("Saved Credentials", "Attach existing credentials from your vault")}
                {credData && credData.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {credData.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleSavedCred(c.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left text-xs transition-colors ${
                          selectedSavedIds.includes(c.id)
                            ? "bg-primary/10 border border-primary/30"
                            : "bg-muted/30 border border-border/50 hover:bg-muted/50"
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${
                            selectedSavedIds.includes(c.id) ? "bg-primary border-primary" : "border-muted-foreground/30"
                          }`}
                        >
                          {selectedSavedIds.includes(c.id) && (
                            <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{c.username || "Unknown"}</div>
                          <div className="text-[10px] text-muted-foreground">{c.host || "—"} &middot; {(c.type || "").toUpperCase()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FolderOpen className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs">No saved credentials found.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SAFETY ──────────────────────────────── */}
          {tab === "safety" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Safety & Boundaries</h3>
                <p className="text-sm text-muted-foreground">Configure operational safety limits and exploit permissions.</p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  {fieldLabel("CIDR Range", "Allowed network range")}
                  <Input
                    value={allowedCidr}
                    onChange={(e) => setAllowedCidr(e.target.value)}
                    placeholder="0.0.0.0/0"
                  />
                </div>
                <div>
                  {fieldLabel("Port Range (Min - Max)")}
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={portMin}
                      onChange={(e) => setPortMin(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-muted-foreground text-sm">—</span>
                    <Input
                      type="number"
                      value={portMax}
                      onChange={(e) => setPortMax(Number(e.target.value))}
                      className="w-24"
                    />
                  </div>
                </div>
                <div>
                  {fieldLabel("Excluded IPs", "Comma-separated")}
                  <Input
                    value={excludedIps}
                    onChange={(e) => setExcludedIps(e.target.value)}
                    placeholder="192.168.1.1, 10.0.0.5"
                  />
                </div>
                <div>
                  {fieldLabel("Excluded Ports", "Comma-separated")}
                  <Input
                    value={excludedPorts}
                    onChange={(e) => setExcludedPorts(e.target.value)}
                    placeholder="23, 25, 5900"
                  />
                </div>
              </div>

              <Separator />

              <div>
                {fieldLabel("Exploit Permissions")}
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Allow exploit phase</Label>
                      <p className="text-[10px] text-muted-foreground">Enable post-scan exploitation</p>
                    </div>
                    <Switch checked={allowExploit} onCheckedChange={setAllowExploit} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Block DoS exploits</Label>
                      <p className="text-[10px] text-muted-foreground">Prevent denial-of-service attacks</p>
                    </div>
                    <Switch checked={blockDos} onCheckedChange={setBlockDos} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Block destructive actions</Label>
                      <p className="text-[10px] text-muted-foreground">Prevent irreversible actions (wipe, format, destroy)</p>
                    </div>
                    <Switch checked={blockDestructive} onCheckedChange={setBlockDestructive} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Post-exploitation</Label>
                      <p className="text-[10px] text-muted-foreground">Allow post-exploitation modules (cred dumping, etc.)</p>
                    </div>
                    <Switch checked={allowPostExploit} onCheckedChange={setAllowPostExploit} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Lateral movement</Label>
                      <p className="text-[10px] text-muted-foreground">Allow pivoting to other hosts</p>
                    </div>
                    <Switch checked={allowLateral} onCheckedChange={setAllowLateral} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Docker escape</Label>
                      <p className="text-[10px] text-muted-foreground">Allow container breakout attempts</p>
                    </div>
                    <Switch checked={allowDockerEscape} onCheckedChange={setAllowDockerEscape} />
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <div>
                      <Label className="text-sm">Browser recon</Label>
                      <p className="text-[10px] text-muted-foreground">Allow browser-based reconnaissance</p>
                    </div>
                    <Switch checked={allowBrowserRecon} onCheckedChange={setAllowBrowserRecon} />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-4">
                <div>
                  {fieldLabel("Max Severity", "Highest vulnerability severity to act on")}
                  <Select value={maxSeverity} onValueChange={setMaxSeverity}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {fieldLabel("Time Limit (seconds)", "0 = unlimited")}
                  <Input
                    type="number"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(Number(e.target.value))}
                    placeholder="7200"
                  />
                </div>
                <div>
                  {fieldLabel("Rate Limit (req/s)", "Maximum requests per second")}
                  <Input
                    type="number"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(Number(e.target.value))}
                    placeholder="50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── ADVANCED ──────────────────────────────── */}
          {tab === "advanced" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Advanced Configuration</h3>
                <p className="text-sm text-muted-foreground">Fine-tune agent behavior, tools, and mission objectives.</p>
              </div>

              {/* Agent model overrides */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  {fieldLabel("Per-Agent Model Overrides", "Specify provider+model per agent type")}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadGlobalDefaults}
                    className="gap-1.5 text-[10px]"
                  >
                    <FolderOpen className="w-3 h-3" />
                    Load Defaults
                  </Button>
                </div>
                <div className="space-y-2">
                  {AGENT_TYPES.map((at) => {
                    const am = agentModels[at] || { provider: "", model: "" };
                    const hasOverride = !!(am?.provider || am?.model);
                    return (
                      <div
                        key={at}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                          hasOverride ? "border-primary/30 bg-primary/5" : "border-border/30 bg-muted/10"
                        }`}
                      >
                        <div className="w-20 shrink-0">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            {at === "webapp" ? "Web App" : at === "postexploit" ? "Post-Exploit" : at === "osint" ? "OSINT" : at.charAt(0).toUpperCase() + at.slice(1)}
                          </Label>
                        </div>
                        <Select
                          value={am.provider || ""}
                          onValueChange={(v) => setAgentModel(at, "provider", v)}
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="Provider" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ollama">Ollama</SelectItem>
                            <SelectItem value="lmstudio">LM Studio</SelectItem>
                            <SelectItem value="openrouter">OpenRouter</SelectItem>
                            <SelectItem value="opencode_go">OpenCode Go</SelectItem>
                          </SelectContent>
                        </Select>
                        {availableModels.length > 0 ? (
                          <Select
                            value={am.model || ""}
                            onValueChange={(v) => setAgentModel(at, "model", v)}
                          >
                            <SelectTrigger className="h-8 text-xs flex-1">
                              <SelectValue placeholder="Model seç" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableModels
                                .filter((m) => !am.provider || m.provider === am.provider)
                                .map((m) => (
                                  <SelectItem key={`${m.provider}:${m.model}`} value={m.model}>
                                    <span className="font-mono">{m.model}</span>
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={am.model || ""}
                            onChange={(e) => setAgentModel(at, "model", e.target.value)}
                            placeholder="e.g. llama3:8b"
                            className="h-8 text-xs flex-1"
                            autoComplete="off"
                            name={`tirpan-agent-model-${at}`}
                          />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => clearAgentModel(at)}
                          className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive shrink-0"
                          disabled={!hasOverride}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Tool permissions */}
              <div>
                {fieldLabel("Tool Permissions", "Enable or disable specific tools for this mission")}
                {toolsData?.tools ? (
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {toolsData.tools.map((t) => (
                      <div
                        key={t.name}
                        className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{t.name.replace(/_/g, " ")}</div>
                          <div className="text-[10px] text-muted-foreground">{t.available ? "Available" : "Unavailable"}</div>
                        </div>
                        <Switch
                          checked={toolPermissions[t.name] !== false}
                          onCheckedChange={() => toggleTool(t.name)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Loading tool status...
                  </div>
                )}
              </div>

              <Separator />

              {/* Provider / Model */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {fieldLabel("Global Provider", "Default LLM provider for this mission")}
                  <Select value={provider} onValueChange={(v) => { setProvider(v); setModel(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Use system default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="lmstudio">LM Studio</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="opencode_go">OpenCode Go</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {fieldLabel("Global Model", "Default model for this mission")}
                  {availableModels.filter((m) => !provider || m.provider === provider).length > 0 ? (
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Model seç" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableModels
                          .filter((m) => !provider || m.provider === provider)
                          .map((m) => (
                            <SelectItem key={`${m.provider}:${m.model}`} value={m.model}>
                              <span className="font-mono text-xs">{m.model}</span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. gpt-4-turbo"
                      autoComplete="off"
                      name="tirpan-global-model"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={confirmEveryStep} onCheckedChange={setConfirmEveryStep} />
                <div>
                  <Label className="text-sm">Confirm every step</Label>
                  <p className="text-[10px] text-muted-foreground">Require operator confirmation before each action</p>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="mt-6 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between shrink-0 node-card !p-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/missions")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Cancel
          </Button>

          <div className="flex items-center gap-3">
            <div className="text-[10px] text-muted-foreground">
              {target || missionName ? `Target: ${target || missionName}` : "No target set"}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="gap-2 px-6"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Launch Mission
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

export default NewMission;
