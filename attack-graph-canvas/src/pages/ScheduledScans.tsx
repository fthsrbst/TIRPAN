import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/attack/PageShell";
import { api } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarClock, Play, Trash2, Plus, BellRing, Clock,
  Calendar, CheckCircle2, AlertTriangle, Target, Radio,
  Zap, MousePointerClick, Users, X, RefreshCw, Pencil,
  History, RotateCcw, Repeat, ChevronDown, ChevronUp,
  Webhook, ShieldAlert, Timer, Globe, Shield, Network,
  Gauge, EyeOff, Server, Settings2, ArrowLeft, KeyRound,
  Terminal, Database, Monitor, Wifi, ScanSearch, Loader2, FolderOpen,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

// ── Constants ─────────────────────────────────────────────────────────────────
export const SCHED_KEY  = "tirpan_scheduled_missions";
const HISTORY_KEY = "tirpan_sched_history";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Types ─────────────────────────────────────────────────────────────────────
export type RecurrenceType = "once" | "daily" | "weekly" | "biweekly" | "monthly" | "cron";

export interface Recurrence {
  type: RecurrenceType;
  daysOfWeek?: number[];          // 0=Sun…6=Sat, for weekly/biweekly
  dayOfMonth?: number;            // 1–28, for monthly
  hour: number;
  minute: number;
  maxRuns?: number | null;        // null = unlimited
  runsCompleted?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
  webhookUrl?: string;
  blackoutStart?: number | null;  // hour 0–23, null = off
  blackoutEnd?: number | null;
  cronExpr?: string;              // for type=cron
}

export interface ScheduledMission {
  id: string;
  name: string;
  target: string;
  scheduledAt: string;            // next fire time (ISO)
  source?: "normal" | "expert";
  recurrence?: Recurrence;
  payload: Record<string, unknown>;
}

export interface ScheduleHistoryEntry {
  id: string;
  name: string;
  target: string;
  launchedAt: string;
  status: "launched" | "failed";
  error?: string;
  recurrent: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function countdown(iso: string): string | null {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h >= 48) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
  if (h >= 1) return `${h}h ${pad(m)}m`;
  if (m >= 1) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

export function recurrenceLabel(r?: Recurrence): string {
  if (!r || r.type === "once") return "One-time";
  if (r.type === "daily") return "Every day";
  if (r.type === "weekly") {
    if (!r.daysOfWeek?.length) return "Weekly";
    return "Every " + r.daysOfWeek.map(d => DOW_LABELS[d]).join(", ");
  }
  if (r.type === "biweekly") {
    if (!r.daysOfWeek?.length) return "Every 2 weeks";
    return "Every 2 wks · " + r.daysOfWeek.map(d => DOW_LABELS[d]).join(", ");
  }
  if (r.type === "monthly") return `Monthly (day ${r.dayOfMonth ?? 1})`;
  if (r.type === "cron") return `Cron: ${r.cronExpr || "—"}`;
  return "—";
}

/** Compute next fire time after a recurrence fires */
export function nextOccurrence(r: Recurrence, afterMs = Date.now()): Date | null {
  const base = new Date(afterMs);
  base.setSeconds(0, 0);

  if (r.type === "once") return null;

  if (r.type === "daily") {
    const d = new Date(base);
    d.setHours(r.hour, r.minute, 0, 0);
    if (d.getTime() <= afterMs) d.setDate(d.getDate() + 1);
    return d;
  }

  if (r.type === "weekly" || r.type === "biweekly") {
    const step = r.type === "biweekly" ? 14 : 7;
    const days = r.daysOfWeek?.length ? r.daysOfWeek : [1]; // default Mon
    for (let offset = 0; offset < step * 2 + 1; offset++) {
      const d = new Date(base);
      d.setDate(base.getDate() + offset);
      d.setHours(r.hour, r.minute, 0, 0);
      if (days.includes(d.getDay()) && d.getTime() > afterMs) return d;
    }
    return null;
  }

  if (r.type === "monthly") {
    const day = r.dayOfMonth ?? 1;
    const d = new Date(base);
    d.setDate(day);
    d.setHours(r.hour, r.minute, 0, 0);
    if (d.getTime() <= afterMs) { d.setMonth(d.getMonth() + 1); d.setDate(day); }
    return d;
  }

  return null;
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function loadMissions(): ScheduledMission[] {
  try { return JSON.parse(localStorage.getItem(SCHED_KEY) || "[]"); } catch { return []; }
}
function saveMissions(arr: ScheduledMission[]) {
  localStorage.setItem(SCHED_KEY, JSON.stringify(arr));
}
function loadHistory(): ScheduleHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveHistory(arr: ScheduleHistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 100)));
}

// ── Edit modal constants ──────────────────────────────────────────────────────
const EDIT_MODES = [
  { id: "scan_only",          label: "Scan Only",              desc: "No exploits. Reconnaissance only — map hosts, ports, services, vulnerabilities.", icon: Radio },
  { id: "ask_before_exploit", label: "Ask Before Exploit",     desc: "Full recon + exploit capability with operator confirmation before each attempt.", icon: MousePointerClick },
  { id: "full_auto",          label: "Full Auto",              desc: "Autonomous recon + exploit chain. No human approval required.", icon: Zap },
  { id: "v2_auto",            label: "Multi-agent",            desc: "Coordinated specialist agents run recon, analysis, and actions under central orchestration.", icon: Users },
];
const EDIT_SPEEDS = [
  { id: "stealth", label: "Stealth", desc: "Slow, quiet (-T2)", icon: EyeOff },
  { id: "normal",  label: "Normal",  desc: "Balanced timing (-T3)", icon: Gauge },
  { id: "fast",    label: "Fast",    desc: "Aggressive timing (-T4)", icon: Zap },
];
const EDIT_SCAN_TYPES = [
  { id: "syn",     label: "SYN",     desc: "Half-open TCP scan", icon: Network },
  { id: "connect", label: "Connect", desc: "Full TCP handshake",  icon: Globe },
  { id: "udp",     label: "UDP",     desc: "UDP port scan",       icon: ScanSearch },
  { id: "full",    label: "Full",    desc: "Comprehensive scan",  icon: Settings2 },
];
const EDIT_PORT_PRESETS = [
  { label: "Quick (top 100)", value: "top100" },
  { label: "Top 1000",        value: "top1000" },
  { label: "All ports",       value: "1-65535" },
  { label: "Well-known",      value: "1-1024" },
];
const EDIT_CRED_TYPES = [
  { id: "ssh",  label: "SSH",      icon: Terminal, fields: ["username","password","host"] },
  { id: "smb",  label: "SMB",      icon: Server,   fields: ["username","password","domain","host"] },
  { id: "snmp", label: "SNMP",     icon: Network,  fields: ["community","host","version"] },
  { id: "db",   label: "Database", icon: Database, fields: ["username","password","host","port","db_type"] },
  { id: "web",  label: "Web",      icon: Monitor,  fields: ["username","password","url"] },
];
const EDIT_AGENT_TYPES = ["brain","scanner","exploit","webapp","postexploit","lateral","reporting","osint"] as const;

interface EditCredRow { type:string; username:string; password:string; host:string; domain:string; community:string; version:string; port:string; db_type:string; url:string; }
interface EditAgentModel { provider:string; model:string; }

type EditTab = "target" | "mode" | "credentials" | "safety" | "advanced" | "schedule";

// ── EditMissionModal ──────────────────────────────────────────────────────────
interface EditMissionModalProps {
  mission: ScheduledMission;
  onSave: (updated: ScheduledMission) => void;
  onClose: () => void;
}

function EditMissionModal({ mission, onSave, onClose }: EditMissionModalProps) {
  const p = mission.payload;
  const [tab, setTab] = useState<EditTab>("target");

  // ── Data fetching ──────────────────────────────────────────────
  const { data: credData } = useQuery<{ id:string; type:string; username:string; host:string }[]>({
    queryKey: ["credentials-list"], queryFn: () => api.get("/credentials"),
  });
  const { data: toolsData } = useQuery<{ tools: { name:string; available:boolean }[] }>({
    queryKey: ["tools-status"], queryFn: () => api.get("/tools/status"),
  });
  const { data: ollamaStatus } = useQuery<{ online:boolean; models:string[]; current:string }>({
    queryKey: ["ollama-status"], queryFn: () => api.get("/ollama/status"), staleTime: 30000,
  });
  const { data: lmstudioStatus } = useQuery<{ online:boolean; models:string[]; current:string }>({
    queryKey: ["lmstudio-status"], queryFn: () => api.get("/lmstudio/status"), staleTime: 30000,
  });
  const availableModels = useMemo(() => {
    const entries: { provider:string; model:string }[] = [];
    if (ollamaStatus?.online)   (ollamaStatus.models   || []).forEach(m => entries.push({ provider:"ollama",   model:m }));
    if (lmstudioStatus?.online) (lmstudioStatus.models || []).forEach(m => entries.push({ provider:"lmstudio", model:m }));
    return entries;
  }, [ollamaStatus, lmstudioStatus]);

  // ── State ──────────────────────────────────────────────────────
  // Target
  const [target,      setTarget]      = useState(String(p.target || ""));
  const [missionName, setMissionName] = useState(String(p.mission_name || ""));
  const [scopeNotes,  setScopeNotes]  = useState(String(p.scope_notes || ""));
  const [objectives,  setObjectives]  = useState(
    Array.isArray(p.objectives) ? (p.objectives as string[]).join("\n") : String(p.objectives || "")
  );
  const [missionNotes, setMissionNotes] = useState(String((p as Record<string,unknown>).notes || ""));
  const [knownTech,    setKnownTech]    = useState(
    Array.isArray(p.known_tech) ? (p.known_tech as string[]).join(", ") : String((p as Record<string,unknown>).known_tech || "")
  );
  const [additionalTargets, setAdditionalTargets] = useState<string[]>(
    Array.isArray(p.additional_targets) ? (p.additional_targets as string[]) : [""]
  );

  // Mode & Speed
  const [mode,             setMode]             = useState(String(p.mode || "scan_only"));
  const [speedProfile,     setSpeedProfile]     = useState(String(p.speed_profile || "normal"));
  const [scanType,         setScanType]         = useState(String(p.scan_type || "syn"));
  const [portRange,        setPortRange]        = useState(String(p.port_range || "1-65535"));
  const [versionDetection, setVersionDetection] = useState(Boolean(p.version_detection ?? true));
  const [osDetection,      setOsDetection]      = useState(Boolean(p.os_detection ?? false));
  const [nmapSudo,         setNmapSudo]         = useState(Boolean((p as Record<string,unknown>).nmap_sudo ?? false));
  const [aggressiveScan,   setAggressiveScan]   = useState(Boolean((p as Record<string,unknown>).aggressive_scan ?? false));
  const [nmapScripts,      setNmapScripts]      = useState(String((p as Record<string,unknown>).nmap_scripts || ""));

  // Credentials
  const initCredRows = (): EditCredRow[] => {
    const raw = (p as Record<string,unknown>).credentials;
    if (Array.isArray(raw) && raw.length > 0) {
      return (raw as Record<string,string>[]).map(r => ({
        type: r.type || "ssh", username: r.username || "", password: r.password || "",
        host: r.host || "", domain: r.domain || "", community: r.community || "",
        version: r.version || "", port: r.port || "", db_type: r.db_type || "", url: r.url || "",
      }));
    }
    return [{ type:"ssh", username:"", password:"", host:"", domain:"", community:"", version:"", port:"", db_type:"", url:"" }];
  };
  const [credRows,         setCredRows]         = useState<EditCredRow[]>(initCredRows);
  const [selectedSavedIds, setSelectedSavedIds] = useState<string[]>(
    Array.isArray((p as Record<string,unknown>).credential_ids) ? ((p as Record<string,unknown>).credential_ids as string[]) : []
  );
  const [passwordWordlist, setPasswordWordlist] = useState(String((p as Record<string,unknown>).password_wordlist || ""));

  // Safety
  const [allowExploit,     setAllowExploit]     = useState(Boolean(p.allow_exploit ?? true));
  const [allowPostExploit, setAllowPostExploit] = useState(Boolean(p.allow_post_exploitation ?? false));
  const [allowLateral,     setAllowLateral]     = useState(Boolean(p.allow_lateral_movement ?? false));
  const [allowDockerEscape,setAllowDockerEscape]= useState(Boolean((p as Record<string,unknown>).allow_docker_escape ?? false));
  const [allowBrowserRecon,setAllowBrowserRecon]= useState(Boolean((p as Record<string,unknown>).allow_browser_recon ?? false));
  const [blockDos,         setBlockDos]         = useState(Boolean(p.block_dos ?? true));
  const [blockDestructive, setBlockDestructive] = useState(Boolean(p.block_destructive ?? true));
  const [maxSeverity,      setMaxSeverity]      = useState(String((p as Record<string,unknown>).max_severity || "CRITICAL"));
  const [timeLimit,        setTimeLimit]        = useState(Number(p.time_limit || 7200));
  const [rateLimit,        setRateLimit]        = useState(Number(p.rate_limit || 50));
  const [allowedCidr,      setAllowedCidr]      = useState(String((p as Record<string,unknown>).allowed_cidr || "0.0.0.0/0"));
  const [excludedIps,      setExcludedIps]      = useState(
    Array.isArray((p as Record<string,unknown>).excluded_targets) ? ((p as Record<string,unknown>).excluded_targets as string[]).join(", ") : ""
  );
  const [excludedPorts, setExcludedPorts] = useState(
    Array.isArray((p as Record<string,unknown>).excluded_ports) ? ((p as Record<string,unknown>).excluded_ports as string[]).join(", ") : ""
  );

  // Advanced
  const [agentModels,      setAgentModels]      = useState<Record<string,EditAgentModel>>({});
  const [toolPermissions,  setToolPermissions]  = useState<Record<string,boolean>>({});
  const [provider,         setProvider]         = useState(String((p as Record<string,unknown>).provider || ""));
  const [model,            setModel]            = useState(String((p as Record<string,unknown>).model || ""));
  const [confirmEveryStep, setConfirmEveryStep] = useState(Boolean((p as Record<string,unknown>).confirm_every_step ?? false));

  useEffect(() => {
    if (toolsData?.tools && !Object.keys(toolPermissions).length) {
      const perms: Record<string,boolean> = {};
      toolsData.tools.forEach(t => { perms[t.name] = true; });
      setToolPermissions(perms);
    }
  }, [toolsData]);

  // Schedule
  const initDate = () => {
    const d = new Date(mission.scheduledAt);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  };
  const [schedParts,    setSchedParts]    = useState(initDate);
  const [recType,       setRecType]       = useState<RecurrenceType>(mission.recurrence?.type ?? "once");
  const [daysOfWeek,    setDaysOfWeek]    = useState<number[]>(mission.recurrence?.daysOfWeek ?? [1]);
  const [dayOfMonth,    setDayOfMonth]    = useState(mission.recurrence?.dayOfMonth ?? 1);
  const [cronExpr,      setCronExpr]      = useState(mission.recurrence?.cronExpr ?? "0 2 * * 1");
  const [maxRuns,       setMaxRuns]       = useState<number | "">(mission.recurrence?.maxRuns ?? "");
  const [retryOnFail,   setRetryOnFail]   = useState(mission.recurrence?.retryOnFailure ?? false);
  const [maxRetries,    setMaxRetries]    = useState(mission.recurrence?.maxRetries ?? 1);
  const [webhookUrl,    setWebhookUrl]    = useState(mission.recurrence?.webhookUrl ?? "");
  const [blackoutStart, setBlackoutStart] = useState<number | "">(mission.recurrence?.blackoutStart ?? "");
  const [blackoutEnd,   setBlackoutEnd]   = useState<number | "">(mission.recurrence?.blackoutEnd ?? "");
  const [schedAdvanced, setSchedAdvanced] = useState(false);

  const dt = useMemo(
    () => new Date(schedParts.year, schedParts.month - 1, schedParts.day, schedParts.hour, schedParts.minute, 0),
    [schedParts]
  );
  const valid = dt.getTime() > Date.now() + 30_000;
  const cd = valid ? countdown(dt.toISOString()) : null;

  const applyPreset = (ms: number) => {
    const d = new Date(Date.now() + ms); d.setSeconds(0, 0);
    setSchedParts({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: Math.ceil(d.getMinutes() / 5) * 5 % 60 });
  };
  const toggleDow = (d: number) => setDaysOfWeek(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());

  // Credential helpers
  const addCredRow    = () => setCredRows(r => [...r, { type:"ssh", username:"", password:"", host:"", domain:"", community:"", version:"", port:"", db_type:"", url:"" }]);
  const removeCredRow = (i: number) => setCredRows(r => r.filter((_,idx) => idx !== i));
  const updateCredRow = (i: number, key: keyof EditCredRow, v: string) => setCredRows(r => r.map((row,idx) => idx === i ? { ...row, [key]: v } : row));
  const toggleCredType = (i: number, type: string) => setCredRows(r => r.map((row,idx) => idx === i ? { type, username:"", password:"", host:"", domain:"", community:"", version:"", port:"", db_type:"", url:"" } : row));
  const toggleSavedCred = (id: string) => setSelectedSavedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // Agent model helpers
  const setAgentModel  = (at: string, field: "provider"|"model", val: string) => setAgentModels(prev => ({ ...prev, [at]: { ...(prev[at] || { provider:"", model:"" }), [field]: val } }));
  const clearAgentModel = (at: string) => setAgentModels(prev => { const n = { ...prev }; delete n[at]; return n; });

  // Additional targets
  const addTarget    = () => setAdditionalTargets(p => [...p, ""]);
  const removeTarget = (i: number) => setAdditionalTargets(p => p.filter((_,idx) => idx !== i));
  const updateTarget = (i: number, v: string) => setAdditionalTargets(p => p.map((t,idx) => idx === i ? v : t));

  const sel = "w-full h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer";

  const fieldLabel = (text: string, desc?: string) => (
    <div className="mb-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{text}</Label>
      {desc && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{desc}</p>}
    </div>
  );

  const handleSave = () => {
    if (!valid) return;
    const recurrence: Recurrence = {
      type: recType,
      daysOfWeek: (recType === "weekly" || recType === "biweekly") ? daysOfWeek : undefined,
      dayOfMonth: recType === "monthly" ? dayOfMonth : undefined,
      cronExpr: recType === "cron" ? cronExpr : undefined,
      hour: schedParts.hour, minute: schedParts.minute,
      maxRuns: maxRuns === "" ? null : Number(maxRuns),
      runsCompleted: mission.recurrence?.runsCompleted ?? 0,
      retryOnFailure: retryOnFail,
      maxRetries: retryOnFail ? maxRetries : undefined,
      webhookUrl: webhookUrl || undefined,
      blackoutStart: blackoutStart === "" ? null : Number(blackoutStart),
      blackoutEnd: blackoutEnd === "" ? null : Number(blackoutEnd),
    };
    const updatedPayload: Record<string, unknown> = {
      ...mission.payload,
      target: target.trim(),
      mission_name: missionName.trim() || undefined,
      mode, speed_profile: speedProfile, scan_type: scanType, port_range: portRange,
      version_detection: versionDetection, os_detection: osDetection,
      nmap_sudo: nmapSudo, aggressive_scan: aggressiveScan,
      nmap_scripts: nmapScripts.trim() || undefined,
      additional_targets: additionalTargets.filter(t => t.trim()),
      credential_ids: selectedSavedIds,
      credentials: credRows.filter(r => r.username || r.password || r.community).map(r => {
        const base: Record<string,string> = { type: r.type };
        if (r.username)  base.username  = r.username;
        if (r.password)  base.password  = r.password;
        if (r.host)      base.host      = r.host;
        if (r.domain)    base.domain    = r.domain;
        if (r.community) base.community = r.community;
        if (r.version)   base.version   = r.version;
        if (r.port)      base.port      = r.port;
        if (r.db_type)   base.db_type   = r.db_type;
        if (r.url)       base.url       = r.url;
        return base;
      }),
      password_wordlist: passwordWordlist.trim() || undefined,
      allowed_cidr: allowedCidr || undefined,
      allow_exploit: allowExploit, allow_post_exploitation: allowPostExploit,
      allow_lateral_movement: allowLateral, allow_docker_escape: allowDockerEscape,
      allow_browser_recon: allowBrowserRecon,
      block_dos: blockDos, block_destructive: blockDestructive,
      max_severity: maxSeverity || undefined,
      time_limit: timeLimit, rate_limit: rateLimit,
      excluded_targets: excludedIps ? excludedIps.split(",").map(s => s.trim()).filter(Boolean) : [],
      excluded_ports: excludedPorts ? excludedPorts.split(",").map(s => s.trim()).filter(Boolean) : [],
      scope_notes: scopeNotes.trim() || undefined,
      objectives: objectives.split("\n").map(l => l.trim()).filter(Boolean),
      known_tech: knownTech ? knownTech.split(",").map(s => s.trim()).filter(Boolean) : [],
      notes: missionNotes.trim() || undefined,
      agent_models: Object.keys(agentModels).length > 0 ? agentModels : undefined,
      provider: provider || undefined, model: model || undefined,
      confirm_every_step: confirmEveryStep,
    };
    onSave({
      ...mission,
      name: missionName.trim() || target.trim() || mission.name,
      target: target.trim() || mission.target,
      scheduledAt: dt.toISOString(),
      recurrence, payload: updatedPayload,
    });
  };

  const EDIT_TABS: { id: EditTab; label: string; icon: typeof Target }[] = [
    { id: "target",      label: "Target & Brief", icon: Target },
    { id: "mode",        label: "Mode & Speed",   icon: Zap },
    { id: "credentials", label: "Credentials",    icon: KeyRound },
    { id: "safety",      label: "Safety",         icon: Shield },
    { id: "advanced",    label: "Advanced",       icon: Settings2 },
    { id: "schedule",    label: "Schedule",       icon: CalendarClock },
  ];

  // ── Render ──────────────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border/40 shrink-0">
        <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Scheduled Scans
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Pencil className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-foreground truncate max-w-[300px]">{mission.name || mission.target}</span>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-2">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div className="px-6 pt-4 pb-0 shrink-0 border-b border-border/30">
        <div className="flex items-center gap-1 bg-card/60 backdrop-blur rounded-full p-1.5 border border-border/50 self-start w-fit">
          {EDIT_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-6 py-6">

          {/* TARGET & BRIEF */}
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
                    <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="corp.local, 192.168.1.0/24" className="pl-10" autoComplete="off" />
                  </div>
                </div>
                <div>
                  {fieldLabel("Mission Name", "Optional display name for this session")}
                  <Input value={missionName} onChange={e => setMissionName(e.target.value)} placeholder="Q2 Internal Network Assessment" autoComplete="off" />
                </div>
                <div>
                  {fieldLabel("Scope Notes", "Constraints, environment, etc.")}
                  <Input value={scopeNotes} onChange={e => setScopeNotes(e.target.value)} placeholder="Internal only. No production during business hours." autoComplete="off" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  {fieldLabel("Additional Targets", "IPs, CIDRs, or hostnames to include")}
                  <button type="button" onClick={addTarget} className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"><Plus className="w-3 h-3" /> Add</button>
                </div>
                <div className="space-y-2">
                  {additionalTargets.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={t} onChange={e => updateTarget(i, e.target.value)} placeholder="192.168.2.0/24" autoComplete="off" />
                      {additionalTargets.length > 1 && (
                        <button type="button" onClick={() => removeTarget(i)} className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                {fieldLabel("Mission Objectives", "One per line. Empty = maximum enumeration mode.")}
                <Textarea value={objectives} onChange={e => setObjectives(e.target.value)} placeholder={"find flag.txt\ndump /etc/shadow\nachieve root on all hosts"} rows={3} className="font-mono text-xs" autoComplete="off" />
              </div>
              <div>
                {fieldLabel("Mission Briefing / Notes", "Additional context and instructions for AI agents")}
                <Textarea value={missionNotes} onChange={e => setMissionNotes(e.target.value)} placeholder="This is an authorized internal pentest. Focus on web application vulnerabilities..." rows={3} autoComplete="off" />
              </div>
              <div>
                {fieldLabel("Known Technologies", "Comma-separated tech stack hints")}
                <Input value={knownTech} onChange={e => setKnownTech(e.target.value)} placeholder="nginx, postgresql, django, redis" autoComplete="off" />
              </div>
            </div>
          )}

          {/* MODE & SPEED */}
          {tab === "mode" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Operation Mode</h3>
                <p className="text-sm text-muted-foreground">Choose how aggressive and autonomous the pentest should be.</p>
              </div>
              <div>
                {fieldLabel("Mode")}
                <div className="grid grid-cols-4 gap-2">
                  {EDIT_MODES.map(m => (
                    <button key={m.id} type="button" onClick={() => setMode(m.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${mode === m.id ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/50 bg-muted/30 hover:bg-muted/50"}`}>
                      <m.icon className={`w-4 h-4 mb-1.5 ${mode === m.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-xs font-medium">{m.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                {fieldLabel("Speed Profile", "Scan timing aggressiveness")}
                <div className="grid grid-cols-3 gap-2">
                  {EDIT_SPEEDS.map(s => (
                    <button key={s.id} type="button" onClick={() => setSpeedProfile(s.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${speedProfile === s.id ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/50 bg-muted/30 hover:bg-muted/50"}`}>
                      <s.icon className={`w-4 h-4 mb-1.5 ${speedProfile === s.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                {fieldLabel("Scan Type", "TCP/UDP scan technique")}
                <div className="grid grid-cols-4 gap-2">
                  {EDIT_SCAN_TYPES.map(s => (
                    <button key={s.id} type="button" onClick={() => setScanType(s.id)}
                      className={`p-3 rounded-xl border text-center transition-all ${scanType === s.id ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/50 bg-muted/30 hover:bg-muted/50"}`}>
                      <s.icon className={`w-4 h-4 mx-auto mb-1 ${scanType === s.id ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {fieldLabel("Port Range", "Which ports to scan")}
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {EDIT_PORT_PRESETS.map(pr => (
                      <button key={pr.value} type="button" onClick={() => setPortRange(pr.value)}
                        className={`px-3 py-1 rounded-full text-[10px] font-medium transition-colors ${portRange === pr.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {pr.label}
                      </button>
                    ))}
                  </div>
                  <Input value={portRange} onChange={e => setPortRange(e.target.value)} placeholder="1-65535 or T:1-1024,U:53,161" className="font-mono text-xs" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2"><Switch checked={versionDetection} onCheckedChange={setVersionDetection} /><Label className="text-xs">Version Detection</Label></div>
                <div className="flex items-center gap-2"><Switch checked={osDetection} onCheckedChange={setOsDetection} /><Label className="text-xs">OS Detection (-O)</Label></div>
                <div className="flex items-center gap-2"><Switch checked={nmapSudo} onCheckedChange={setNmapSudo} /><Label className="text-xs">Run with sudo</Label></div>
                <div className="flex items-center gap-2"><Switch checked={aggressiveScan} onCheckedChange={setAggressiveScan} /><Label className="text-xs">Aggressive (-A)</Label></div>
              </div>
              <div>
                {fieldLabel("NSE Scripts", "Nmap script engine (e.g. vuln, default, safe, or script names)")}
                <Input value={nmapScripts} onChange={e => setNmapScripts(e.target.value)} placeholder="vuln,safe  or  http-title,ssl-cert" className="font-mono text-xs" autoComplete="off" />
              </div>
            </div>
          )}

          {/* CREDENTIALS */}
          {tab === "credentials" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Authentication Credentials</h3>
                <p className="text-sm text-muted-foreground">Provide credentials for authenticated scanning and exploitation. These are encrypted at rest.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  {fieldLabel("Manual Credentials")}
                  <button type="button" onClick={addCredRow} className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 font-medium"><Plus className="w-3 h-3" /> Add Credential</button>
                </div>
                <div className="space-y-3">
                  {credRows.map((r, i) => {
                    const typeDef = EDIT_CRED_TYPES.find(ct => ct.id === r.type) || EDIT_CRED_TYPES[0];
                    return (
                      <div key={i} className="p-4 rounded-xl border border-border/50 bg-muted/20 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <typeDef.icon className="w-4 h-4 text-muted-foreground" />
                            <div className="flex gap-1">
                              {EDIT_CRED_TYPES.map(ct => (
                                <button key={ct.id} type="button" onClick={() => toggleCredType(i, ct.id)}
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${r.type === ct.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                                  {ct.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {credRows.length > 1 && (
                            <button type="button" onClick={() => removeCredRow(i)} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {typeDef.fields.map(f => (
                            <div key={f}>
                              <Label className="text-[10px] text-muted-foreground uppercase">{f}</Label>
                              <Input value={(r as Record<string,string>)[f] || ""} onChange={e => updateCredRow(i, f as keyof EditCredRow, e.target.value)}
                                placeholder={f} type={f === "password" ? "password" : "text"} className="h-8 text-xs" autoComplete={f === "password" ? "new-password" : "off"} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Separator />
              <div>
                {fieldLabel("Saved Credentials", "Attach existing credentials from your vault")}
                {credData && credData.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {credData.map(c => (
                      <button key={c.id} type="button" onClick={() => toggleSavedCred(c.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left text-xs transition-colors ${selectedSavedIds.includes(c.id) ? "bg-primary/10 border border-primary/30" : "bg-muted/30 border border-border/50 hover:bg-muted/50"}`}>
                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${selectedSavedIds.includes(c.id) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                          {selectedSavedIds.includes(c.id) && <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{c.username || "Unknown"}</div>
                          <div className="text-[10px] text-muted-foreground">{c.host || "—"} · {(c.type || "").toUpperCase()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <FolderOpen className="w-8 h-8 mb-2 opacity-30" /><p className="text-xs">No saved credentials found.</p>
                  </div>
                )}
              </div>
              <Separator />
              <div>
                {fieldLabel("Password Wordlist (this mission only)", "Used by hydra/medusa. Leave empty to use the global Settings default.")}
                <Input value={passwordWordlist} onChange={e => setPasswordWordlist(e.target.value)} placeholder="/usr/share/wordlists/rockyou.txt" className="font-mono text-xs" />
              </div>
            </div>
          )}

          {/* SAFETY */}
          {tab === "safety" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Safety & Boundaries</h3>
                <p className="text-sm text-muted-foreground">Configure operational safety limits and exploit permissions.</p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  {fieldLabel("CIDR Range", "Allowed network range")}
                  <Input value={allowedCidr} onChange={e => setAllowedCidr(e.target.value)} placeholder="0.0.0.0/0" />
                </div>
                <div>
                  {fieldLabel("Max Severity", "Highest vulnerability severity to act on")}
                  <Select value={maxSeverity} onValueChange={setMaxSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  {fieldLabel("Excluded IPs", "Comma-separated")}
                  <Input value={excludedIps} onChange={e => setExcludedIps(e.target.value)} placeholder="192.168.1.1, 10.0.0.5" />
                </div>
                <div>
                  {fieldLabel("Excluded Ports", "Comma-separated")}
                  <Input value={excludedPorts} onChange={e => setExcludedPorts(e.target.value)} placeholder="23, 25, 5900" />
                </div>
              </div>
              <Separator />
              <div>
                {fieldLabel("Exploit Permissions")}
                <div className="space-y-3">
                  {[
                    { checked: allowExploit,      setter: setAllowExploit,      label: "Allow exploit phase",         desc: "Enable post-scan exploitation" },
                    { checked: blockDos,           setter: setBlockDos,           label: "Block DoS exploits",          desc: "Prevent denial-of-service attacks" },
                    { checked: blockDestructive,   setter: setBlockDestructive,   label: "Block destructive actions",   desc: "Prevent irreversible actions (wipe, format, destroy)" },
                    { checked: allowPostExploit,   setter: setAllowPostExploit,   label: "Post-exploitation",           desc: "Allow post-exploitation modules (cred dumping, etc.)" },
                    { checked: allowLateral,       setter: setAllowLateral,       label: "Lateral movement",            desc: "Allow pivoting to other hosts" },
                    { checked: allowDockerEscape,  setter: setAllowDockerEscape,  label: "Docker escape",               desc: "Allow container breakout attempts" },
                    { checked: allowBrowserRecon,  setter: setAllowBrowserRecon,  label: "Browser recon",               desc: "Allow browser-based reconnaissance" },
                  ].map(({ checked, setter, label, desc }) => (
                    <div key={label} className="flex items-center justify-between py-2 border-b border-border/40">
                      <div><Label className="text-sm">{label}</Label><p className="text-[10px] text-muted-foreground">{desc}</p></div>
                      <Switch checked={checked} onCheckedChange={setter} />
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {fieldLabel("Time Limit (seconds)", "0 = unlimited")}
                  <Input type="number" value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} placeholder="7200" />
                </div>
                <div>
                  {fieldLabel("Rate Limit (req/s)", "Maximum requests per second")}
                  <Input type="number" value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))} placeholder="50" />
                </div>
              </div>
            </div>
          )}

          {/* ADVANCED */}
          {tab === "advanced" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Advanced Configuration</h3>
                <p className="text-sm text-muted-foreground">Fine-tune agent behavior, tools, and per-agent model overrides.</p>
              </div>
              <div>
                {fieldLabel("Per-Agent Model Overrides", "Specify provider+model per agent type")}
                <div className="space-y-2 mt-1">
                  {EDIT_AGENT_TYPES.map(at => {
                    const am = agentModels[at] || { provider:"", model:"" };
                    const hasOverride = !!(am?.provider || am?.model);
                    return (
                      <div key={at} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${hasOverride ? "border-primary/30 bg-primary/5" : "border-border/30 bg-muted/10"}`}>
                        <div className="w-20 shrink-0">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            {at === "webapp" ? "Web App" : at === "postexploit" ? "Post-Exploit" : at === "osint" ? "OSINT" : at.charAt(0).toUpperCase() + at.slice(1)}
                          </Label>
                        </div>
                        <Select value={am.provider || ""} onValueChange={v => setAgentModel(at, "provider", v)}>
                          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Provider" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ollama">Ollama</SelectItem>
                            <SelectItem value="lmstudio">LM Studio</SelectItem>
                            <SelectItem value="openrouter">OpenRouter</SelectItem>
                            <SelectItem value="opencode_go">OpenCode Go</SelectItem>
                          </SelectContent>
                        </Select>
                        {availableModels.length > 0 ? (
                          <Select value={am.model || ""} onValueChange={v => setAgentModel(at, "model", v)}>
                            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select model…" /></SelectTrigger>
                            <SelectContent>
                              {availableModels.filter(m => !am.provider || m.provider === am.provider).map(m => (
                                <SelectItem key={`${m.provider}:${m.model}`} value={m.model}><span className="font-mono">{m.model}</span></SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={am.model || ""} onChange={e => setAgentModel(at, "model", e.target.value)} placeholder="e.g. llama3:8b" className="h-8 text-xs flex-1" autoComplete="off" />
                        )}
                        <Button type="button" variant="ghost" size="sm" onClick={() => clearAgentModel(at)} disabled={!hasOverride}
                          className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive shrink-0"><RotateCcw className="w-3 h-3" /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Separator />
              <div>
                {fieldLabel("Tool Permissions", "Enable or disable specific tools for this mission")}
                {toolsData?.tools ? (
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {toolsData.tools.map(t => (
                      <div key={t.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/30">
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{t.name.replace(/_/g, " ")}</div>
                          <div className="text-[10px] text-muted-foreground">{t.available ? "Available" : "Unavailable"}</div>
                        </div>
                        <Switch checked={toolPermissions[t.name] !== false} onCheckedChange={() => setToolPermissions(p => ({ ...p, [t.name]: !p[t.name] }))} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading tool status...</div>
                )}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  {fieldLabel("Global Provider", "Default LLM provider for this mission")}
                  <Select value={provider} onValueChange={v => { setProvider(v); setModel(""); }}>
                    <SelectTrigger><SelectValue placeholder="Use system default" /></SelectTrigger>
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
                  {availableModels.filter(m => !provider || m.provider === provider).length > 0 ? (
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger><SelectValue placeholder="Select model…" /></SelectTrigger>
                      <SelectContent>
                        {availableModels.filter(m => !provider || m.provider === provider).map(m => (
                          <SelectItem key={`${m.provider}:${m.model}`} value={m.model}><span className="font-mono text-xs">{m.model}</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. gpt-4-turbo" autoComplete="off" />
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

          {/* SCHEDULE */}
          {tab === "schedule" && (
            <div className="space-y-5 max-w-xl">
              <div>
                <h3 className="font-display font-bold text-lg mb-1">Schedule Settings</h3>
                <p className="text-sm text-muted-foreground">When and how often this scan should run.</p>
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Zap className="w-3 h-3" /> Quick presets</Label>
                <div className="flex flex-wrap gap-1.5">
                  {([["5m",300_000],["15m",900_000],["30m",1_800_000],["1h",3_600_000],["3h",10_800_000],["6h",21_600_000],["1d",86_400_000]] as [string,number][]).map(([l,ms]) => (
                    <button key={l} type="button" onClick={() => applyPreset(ms)}
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-muted hover:bg-primary/15 hover:text-primary border border-border/40 hover:border-primary/30 transition-all">+{l}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Date</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div><p className="text-[10px] text-muted-foreground mb-1">Day</p>
                      <select value={schedParts.day} onChange={e => setSchedParts(p => ({ ...p, day: Number(e.target.value) }))} className={sel}>
                        {Array.from({ length: daysInMonth(schedParts.year, schedParts.month) }, (_, i) => i + 1).map(d => <option key={d} value={d}>{pad(d)}</option>)}
                      </select>
                    </div>
                    <div><p className="text-[10px] text-muted-foreground mb-1">Month</p>
                      <select value={schedParts.month} onChange={e => setSchedParts(p => ({ ...p, month: Number(e.target.value) }))} className={sel}>
                        {MONTHS.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
                      </select>
                    </div>
                    <div><p className="text-[10px] text-muted-foreground mb-1">Year</p>
                      <select value={schedParts.year} onChange={e => setSchedParts(p => ({ ...p, year: Number(e.target.value) }))} className={sel}>
                        {[0,1,2].map(o => { const y = new Date().getFullYear() + o; return <option key={y} value={y}>{y}</option>; })}
                      </select>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Time</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div><p className="text-[10px] text-muted-foreground mb-1">Hour</p>
                      <select value={schedParts.hour} onChange={e => setSchedParts(p => ({ ...p, hour: Number(e.target.value) }))} className={sel + " font-mono"}>
                        {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:xx</option>)}
                      </select>
                    </div>
                    <div><p className="text-[10px] text-muted-foreground mb-1">Minute</p>
                      <select value={schedParts.minute} onChange={e => setSchedParts(p => ({ ...p, minute: Number(e.target.value) }))} className={sel + " font-mono"}>
                        {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>:{pad(m)}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${valid ? "bg-primary/8 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
                {valid
                  ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /><span>Next run in <strong>{cd}</strong> · {dt.toLocaleString()}</span></>
                  : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>Time is in the past — choose a future time</span></>}
              </div>

              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Repeat className="w-3 h-3" /> Recurrence</Label>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {(["once","daily","weekly","biweekly","monthly","cron"] as RecurrenceType[]).map(t => (
                    <button key={t} type="button" onClick={() => setRecType(t)}
                      className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold transition-all capitalize ${recType === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border"}`}>
                      {t === "biweekly" ? "2 weeks" : t === "cron" ? "Cron" : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
                {(recType === "weekly" || recType === "biweekly") && (
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {DOW_LABELS.map((lbl,i) => (
                      <button key={i} type="button" onClick={() => toggleDow(i)}
                        className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all ${daysOfWeek.includes(i) ? "border-primary bg-primary/15 text-primary" : "border-border/40 bg-muted/30 text-muted-foreground hover:border-border"}`}>
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
                {recType === "monthly" && (
                  <div className="mb-3"><p className="text-[10px] text-muted-foreground mb-1">Day of month:</p>
                    <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} className={sel + " w-32"}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}{d===1?"st":d===2?"nd":d===3?"rd":"th"}</option>)}
                    </select>
                  </div>
                )}
                {recType === "cron" && (
                  <div className="mb-3"><p className="text-[10px] text-muted-foreground mb-1">Cron expression (min hour dom month dow):</p>
                    <Input value={cronExpr} onChange={e => setCronExpr(e.target.value)} placeholder="0 2 * * 1" className="font-mono text-xs h-9" />
                  </div>
                )}
                {recType !== "once" && (
                  <div className="flex items-center gap-3 mt-2">
                    <p className="text-[11px] text-muted-foreground">Max runs:</p>
                    <Input type="number" value={maxRuns} onChange={e => setMaxRuns(e.target.value === "" ? "" : Number(e.target.value))} placeholder="∞ unlimited" className="h-8 text-xs w-28 font-mono" min={1} />
                  </div>
                )}
              </div>

              <div>
                <button type="button" onClick={() => setSchedAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider transition-colors">
                  {schedAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Advanced options
                </button>
                {schedAdvanced && (
                  <div className="mt-3 space-y-4 pl-2 border-l border-border/30">
                    <div className="flex items-start gap-3">
                      <Switch checked={retryOnFail} onCheckedChange={setRetryOnFail} />
                      <div>
                        <Label className="text-xs">Retry on failure</Label>
                        <p className="text-[10px] text-muted-foreground">Re-attempt if the API returns an error</p>
                        {retryOnFail && (
                          <div className="flex items-center gap-2 mt-2">
                            <p className="text-[11px] text-muted-foreground">Max retries:</p>
                            <Input type="number" value={maxRetries} onChange={e => setMaxRetries(Number(e.target.value))} className="h-7 text-xs w-16 font-mono" min={1} max={5} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5"><ShieldAlert className="w-3 h-3 text-muted-foreground" /><Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Blackout window</Label></div>
                      <div className="flex items-center gap-2">
                        <select value={blackoutStart ?? ""} onChange={e => setBlackoutStart(e.target.value === "" ? "" : Number(e.target.value))} className={sel + " w-24"}>
                          <option value="">Off</option>{Array.from({ length: 24 }, (_,h) => <option key={h} value={h}>{pad(h)}:00</option>)}
                        </select>
                        <span className="text-muted-foreground text-xs">→</span>
                        <select value={blackoutEnd ?? ""} onChange={e => setBlackoutEnd(e.target.value === "" ? "" : Number(e.target.value))} className={sel + " w-24"}>
                          <option value="">Off</option>{Array.from({ length: 24 }, (_,h) => <option key={h} value={h}>{pad(h)}:00</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5"><Webhook className="w-3 h-3 text-muted-foreground" /><Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Completion webhook</Label></div>
                      <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://hooks.slack.com/..." className="text-xs h-8 font-mono" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-border/40 shrink-0 bg-card/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </Button>
          {tab !== "schedule" && (
            <span className="text-[10px] text-muted-foreground">
              Schedule: <button onClick={() => setTab("schedule")} className="text-primary underline underline-offset-2">{valid ? `${cd} · ${recurrenceLabel(mission.recurrence)}` : "⚠ set time"}</button>
            </span>
          )}
        </div>
        <Button type="button" disabled={!valid} onClick={handleSave} className="gap-2 px-6">
          <CheckCircle2 className="w-4 h-4" /> Save Changes
        </Button>
      </div>
    </div>,
    document.body
  );
}

// ── SchedModal ────────────────────────────────────────────────────────────────
interface SchedModalProps {
  editItem: ScheduledMission | null;
  onConfirm: (scheduledAt: string, recurrence: Recurrence) => void;
  onClose: () => void;
}

function SchedModal({ editItem, onConfirm, onClose }: SchedModalProps) {
  const initDate = editItem
    ? (() => { const d = new Date(editItem.scheduledAt); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() }; })()
    : (() => { const d = new Date(Date.now() + 3_600_000); return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: Math.ceil(d.getMinutes() / 5) * 5 % 60 }; })();

  const [parts, setParts] = useState(initDate);
  const [recType, setRecType] = useState<RecurrenceType>(editItem?.recurrence?.type ?? "once");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(editItem?.recurrence?.daysOfWeek ?? [1]);
  const [dayOfMonth, setDayOfMonth] = useState(editItem?.recurrence?.dayOfMonth ?? 1);
  const [cronExpr, setCronExpr] = useState(editItem?.recurrence?.cronExpr ?? "0 2 * * 1");
  const [maxRuns, setMaxRuns] = useState<number | "">(editItem?.recurrence?.maxRuns ?? "");
  const [retryOnFail, setRetryOnFail] = useState(editItem?.recurrence?.retryOnFailure ?? false);
  const [maxRetries, setMaxRetries] = useState(editItem?.recurrence?.maxRetries ?? 1);
  const [webhookUrl, setWebhookUrl] = useState(editItem?.recurrence?.webhookUrl ?? "");
  const [blackoutStart, setBlackoutStart] = useState<number | "">(editItem?.recurrence?.blackoutStart ?? "");
  const [blackoutEnd, setBlackoutEnd] = useState<number | "">(editItem?.recurrence?.blackoutEnd ?? "");
  const [advanced, setAdvanced] = useState(false);

  const dt = useMemo(() => new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0), [parts]);
  const valid = dt.getTime() > Date.now() + 30_000;
  const cd = valid ? countdown(dt.toISOString()) : null;

  const applyPreset = (ms: number) => {
    const d = new Date(Date.now() + ms); d.setSeconds(0, 0);
    setParts({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: Math.ceil(d.getMinutes() / 5) * 5 % 60 });
  };

  const toggleDow = (d: number) => setDaysOfWeek(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort());

  const sel = "w-full h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer";

  const buildRecurrence = (): Recurrence => ({
    type: recType,
    daysOfWeek: (recType === "weekly" || recType === "biweekly") ? daysOfWeek : undefined,
    dayOfMonth: recType === "monthly" ? dayOfMonth : undefined,
    cronExpr: recType === "cron" ? cronExpr : undefined,
    hour: parts.hour,
    minute: parts.minute,
    maxRuns: maxRuns === "" ? null : Number(maxRuns),
    runsCompleted: editItem?.recurrence?.runsCompleted ?? 0,
    retryOnFailure: retryOnFail,
    maxRetries: retryOnFail ? maxRetries : undefined,
    webhookUrl: webhookUrl || undefined,
    blackoutStart: blackoutStart === "" ? null : Number(blackoutStart),
    blackoutEnd: blackoutEnd === "" ? null : Number(blackoutEnd),
  });

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm(dt.toISOString(), buildRecurrence());
  };

  const modal = (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 9999 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-white/10 bg-card shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <CalendarClock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base">{editItem ? "Reschedule" : "New Schedule"}</h3>
              {editItem && <p className="text-[11px] text-muted-foreground truncate max-w-[240px]">{editItem.name || editItem.target}</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Quick presets */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Zap className="w-3 h-3" /> Quick presets</Label>
            <div className="flex flex-wrap gap-1.5">
              {([["5m", 300_000], ["15m", 900_000], ["30m", 1_800_000], ["1h", 3_600_000], ["3h", 10_800_000], ["6h", 21_600_000], ["1d", 86_400_000]] as [string, number][]).map(([l, ms]) => (
                <button key={l} type="button" onClick={() => applyPreset(ms)}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-muted hover:bg-primary/15 hover:text-primary border border-border/40 hover:border-primary/30 transition-all">+{l}</button>
              ))}
            </div>
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Date</Label>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Day</p>
                  <select value={parts.day} onChange={e => setParts(p => ({ ...p, day: Number(e.target.value) }))} className={sel}>
                    {Array.from({ length: daysInMonth(parts.year, parts.month) }, (_, i) => i + 1).map(d => <option key={d} value={d}>{pad(d)}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Month</p>
                  <select value={parts.month} onChange={e => setParts(p => ({ ...p, month: Number(e.target.value) }))} className={sel}>
                    {MONTHS.map((mn, i) => <option key={mn} value={i + 1}>{mn}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Year</p>
                  <select value={parts.year} onChange={e => setParts(p => ({ ...p, year: Number(e.target.value) }))} className={sel}>
                    {[0, 1, 2].map(o => { const y = new Date().getFullYear() + o; return <option key={y} value={y}>{y}</option>; })}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Time</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Hour</p>
                  <select value={parts.hour} onChange={e => setParts(p => ({ ...p, hour: Number(e.target.value) }))} className={sel + " font-mono"}>
                    {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:xx</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Minute</p>
                  <select value={parts.minute} onChange={e => setParts(p => ({ ...p, minute: Number(e.target.value) }))} className={sel + " font-mono"}>
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>:{pad(m)}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Validation feedback */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${valid ? "bg-primary/8 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"}`}>
            {valid
              ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /><span>First run in <strong>{cd}</strong> · {dt.toLocaleString()}</span></>
              : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" /><span>Time is in the past — choose a future time</span></>}
          </div>

          {/* Recurrence */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5"><Repeat className="w-3 h-3" /> Recurrence</Label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {(["once", "daily", "weekly", "biweekly", "monthly", "cron"] as RecurrenceType[]).map(t => (
                <button key={t} type="button" onClick={() => setRecType(t)}
                  className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold transition-all capitalize ${recType === t ? "border-primary bg-primary/10 text-primary" : "border-border/50 bg-muted/30 text-muted-foreground hover:border-border"}`}>
                  {t === "biweekly" ? "2 weeks" : t === "cron" ? "Cron" : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Weekly/Biweekly — day selector */}
            {(recType === "weekly" || recType === "biweekly") && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground">Run on days:</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DOW_LABELS.map((lbl, i) => (
                    <button key={i} type="button" onClick={() => toggleDow(i)}
                      className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all ${daysOfWeek.includes(i) ? "border-primary bg-primary/15 text-primary" : "border-border/40 bg-muted/30 text-muted-foreground hover:border-border"}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly — day of month */}
            {recType === "monthly" && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Day of month:</p>
                <select value={dayOfMonth} onChange={e => setDayOfMonth(Number(e.target.value))} className={sel + " w-32"}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}</option>)}
                </select>
              </div>
            )}

            {/* Cron expression */}
            {recType === "cron" && (
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Cron expression (minute hour dom month dow):</p>
                <Input value={cronExpr} onChange={e => setCronExpr(e.target.value)} placeholder="0 2 * * 1" className="font-mono text-xs h-9" />
                <p className="text-[10px] text-muted-foreground/60 mt-1">e.g. <code className="font-mono">0 3 * * 1,5</code> = Mon & Fri at 03:00</p>
              </div>
            )}

            {/* Run count (for recurring) */}
            {recType !== "once" && (
              <div className="mt-3 flex items-center gap-3">
                <p className="text-[11px] text-muted-foreground">Max runs:</p>
                <Input type="number" value={maxRuns} onChange={e => setMaxRuns(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="∞ unlimited" className="h-8 text-xs w-28 font-mono" min={1} />
                <p className="text-[10px] text-muted-foreground/60">Leave empty for unlimited</p>
              </div>
            )}
          </div>

          {/* Advanced section */}
          <div>
            <button type="button" onClick={() => setAdvanced(v => !v)}
              className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground font-bold uppercase tracking-wider transition-colors">
              {advanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Advanced options
            </button>
            {advanced && (
              <div className="mt-3 space-y-4 pl-2 border-l border-border/30">

                {/* Retry */}
                <div className="flex items-start gap-3">
                  <Switch checked={retryOnFail} onCheckedChange={setRetryOnFail} />
                  <div>
                    <Label className="text-xs">Retry on failure</Label>
                    <p className="text-[10px] text-muted-foreground">Re-attempt if the API returns an error</p>
                    {retryOnFail && (
                      <div className="flex items-center gap-2 mt-2">
                        <p className="text-[11px] text-muted-foreground">Max retries:</p>
                        <Input type="number" value={maxRetries} onChange={e => setMaxRetries(Number(e.target.value))} className="h-7 text-xs w-16 font-mono" min={1} max={5} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Blackout window */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="w-3 h-3 text-muted-foreground" />
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Blackout window</Label>
                    <p className="text-[10px] text-muted-foreground/60">(skip scan if within this hour range)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={blackoutStart ?? ""} onChange={e => setBlackoutStart(e.target.value === "" ? "" : Number(e.target.value))} className={sel + " w-24"}>
                      <option value="">Off</option>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}
                    </select>
                    <span className="text-muted-foreground text-xs">→</span>
                    <select value={blackoutEnd ?? ""} onChange={e => setBlackoutEnd(e.target.value === "" ? "" : Number(e.target.value))} className={sel + " w-24"}>
                      <option value="">Off</option>
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad(h)}:00</option>)}
                    </select>
                  </div>
                </div>

                {/* Webhook */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Webhook className="w-3 h-3 text-muted-foreground" />
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Completion webhook</Label>
                  </div>
                  <Input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/..." className="text-xs h-8 font-mono" />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">POST request sent when scan completes</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/30 shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={!valid} onClick={handleConfirm} className="gap-2">
            <CalendarClock className="w-4 h-4" />
            {editItem ? "Update Schedule" : "Confirm Schedule"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Mode UI helpers ───────────────────────────────────────────────────────────
const MODE_LABELS: Record<string, string> = { scan_only: "Scan Only", ask_before_exploit: "Supervised", full_auto: "Full Auto", v2_auto: "Multi-Agent" };
const MODE_ICONS: Record<string, typeof Play> = { scan_only: Radio, ask_before_exploit: MousePointerClick, full_auto: Zap, v2_auto: Users };

// ═══════════════════════════════════════════════════════════════
//  Main page
// ═══════════════════════════════════════════════════════════════
const ScheduledScans = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [missions, setMissions] = useState<ScheduledMission[]>([]);
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduledMission | null>(null);
  const [editMissionOpen, setEditMissionOpen] = useState(false);
  const [editMission, setEditMission] = useState<ScheduledMission | null>(null);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const reload = useCallback(() => { setMissions(loadMissions()); setHistory(loadHistory()); }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 10_000); return () => clearInterval(t); }, []);

  const persist = (arr: ScheduledMission[]) => { saveMissions(arr); setMissions(arr); };
  const persistHistory = (arr: ScheduleHistoryEntry[]) => { saveHistory(arr); setHistory(arr); };

  const cancel = (id: string) => persist(missions.filter(m => m.id !== id));

  const runNow = async (m: ScheduledMission) => {
    setLaunchingId(m.id);
    try {
      await api.post("/sessions", m.payload);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      persistHistory([{ id: m.id, name: m.name, target: m.target, launchedAt: new Date().toISOString(), status: "launched", recurrent: !!(m.recurrence && m.recurrence.type !== "once") }, ...history]);
      persist(missions.filter(x => x.id !== m.id));
      navigate("/missions");
    } catch (e: unknown) {
      persistHistory([{ id: m.id, name: m.name, target: m.target, launchedAt: new Date().toISOString(), status: "failed", error: e instanceof Error ? e.message : "Error", recurrent: !!(m.recurrence && m.recurrence.type !== "once") }, ...history]);
    } finally { setLaunchingId(null); }
  };

  const openEdit = (m: ScheduledMission) => { setEditMission(m); setEditMissionOpen(true); };

  const handleEditSave = (updated: ScheduledMission) => {
    persist(missions.map(m => m.id === updated.id ? updated : m));
    setEditMissionOpen(false);
    setEditMission(null);
  };

  const handleModalConfirm = (scheduledAt: string, recurrence: Recurrence) => {
    if (editTarget) {
      persist(missions.map(m => m.id === editTarget.id ? { ...m, scheduledAt, recurrence } : m));
    }
    setModalOpen(false); setEditTarget(null);
  };

  const sorted = useMemo(() => [...missions].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()), [missions]);

  const stats = useMemo(() => ({
    recurring: missions.filter(m => m.recurrence && m.recurrence.type !== "once").length,
    oneTime: missions.filter(m => !m.recurrence || m.recurrence.type === "once").length,
    overdue: missions.filter(m => !countdown(m.scheduledAt)).length,
  }), [missions]);

  return (
    <PageShell title="Scheduled Scans" subtitle="Automate and manage recurring scan schedules">
      {modalOpen && <SchedModal editItem={editTarget} onConfirm={handleModalConfirm} onClose={() => { setModalOpen(false); setEditTarget(null); }} />}
      {editMissionOpen && editMission && (
        <EditMissionModal mission={editMission} onSave={handleEditSave} onClose={() => { setEditMissionOpen(false); setEditMission(null); }} />
      )}

      <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full">

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {[
            { label: "Pending", value: missions.length, icon: BellRing, color: "text-primary" },
            { label: "Recurring", value: stats.recurring, icon: Repeat, color: "text-blue-400" },
            { label: "One-time", value: stats.oneTime, icon: Timer, color: "text-muted-foreground" },
            { label: "Overdue", value: stats.overdue, icon: AlertTriangle, color: "text-destructive" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="node-card !p-4 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color} shrink-0`} />
              <div>
                <div className={`text-2xl font-display font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Top actions ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={reload} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {stats.overdue > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> {stats.overdue} overdue
              </div>
            )}
          </div>
          <Button onClick={() => navigate("/missions/new")} className="gap-2">
            <Plus className="w-4 h-4" /> New Scheduled Scan
          </Button>
        </div>

        {/* ── Pending schedules ── */}
        <div className="node-card !p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" />
            <span className="font-display font-bold text-sm uppercase tracking-wider">Pending Schedules</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{sorted.length} total</span>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <CalendarClock className="w-10 h-10 opacity-20" />
              <p className="text-sm">No scheduled scans</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/missions/new")} className="gap-1.5 mt-1">
                <Plus className="w-3.5 h-3.5" /> Schedule a Scan
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {sorted.map((m) => {
                const cd = countdown(m.scheduledAt);
                const isPast = !cd;
                const modeKey = String(m.payload?.mode || "scan_only");
                const ModeIcon = MODE_ICONS[modeKey] ?? Radio;
                const isRec = m.recurrence && m.recurrence.type !== "once";
                const isLaunching = launchingId === m.id;

                return (
                  <div key={m.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-muted/10 transition-colors ${isPast ? "bg-destructive/5" : ""}`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${isPast ? "bg-destructive/10 border-destructive/20" : "bg-primary/10 border-primary/20"}`}>
                      <ModeIcon className={`w-4.5 h-4.5 ${isPast ? "text-destructive" : "text-primary"}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-semibold text-sm truncate">{m.name || "Unnamed"}</span>
                        {isRec && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 font-bold flex items-center gap-0.5">
                            <Repeat className="w-2.5 h-2.5" /> {recurrenceLabel(m.recurrence)}
                          </span>
                        )}
                        {m.source === "expert" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold uppercase">Expert</span>
                        )}
                        {m.recurrence?.webhookUrl && (
                          <span title="Webhook configured" className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 flex items-center gap-0.5">
                            <Webhook className="w-2.5 h-2.5" /> webhook
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1 font-mono"><Target className="w-3 h-3" /> {m.target || "—"}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(m.scheduledAt)}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-muted text-[10px]">{MODE_LABELS[modeKey] ?? modeKey}</span>
                        {m.recurrence?.maxRuns && <span className="text-[10px] text-muted-foreground/60">{m.recurrence.runsCompleted ?? 0}/{m.recurrence.maxRuns} runs</span>}
                      </div>
                    </div>

                    {/* Countdown */}
                    <div className={`text-center shrink-0 min-w-[80px] ${isPast ? "text-destructive" : "text-primary"}`}>
                      {isPast ? (
                        <div className="flex items-center gap-1 text-xs font-semibold"><AlertTriangle className="w-3 h-3" /> Overdue</div>
                      ) : (
                        <>
                          <div className="text-base font-display font-bold leading-none font-mono">{cd}</div>
                          <div className="text-[10px] text-muted-foreground">remaining</div>
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => runNow(m)} disabled={isLaunching} title="Launch now"
                        className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 text-primary transition-colors disabled:opacity-50">
                        {isLaunching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => openEdit(m)} title="Edit schedule"
                        className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => cancel(m.id)} title="Cancel"
                        className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Quick-schedule shortcuts ── */}
        <div className="node-card !p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-primary" />
            <span className="font-display font-bold text-sm uppercase tracking-wider">Quick Schedule</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {([["5 min", 300_000], ["15 min", 900_000], ["30 min", 1_800_000], ["1 hour", 3_600_000], ["3 hours", 10_800_000], ["1 day", 86_400_000]] as [string, number][]).map(([label, ms]) => (
              <button key={label} type="button" onClick={() => navigate("/missions/new", { state: { scheduleOffset: ms } })}
                className="flex flex-col items-center gap-1 p-3 rounded-xl border border-border/50 bg-muted/20 hover:border-primary/40 hover:bg-primary/5 transition-all group">
                <Clock className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-xs font-semibold group-hover:text-primary transition-colors">+{label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">Opens New Mission wizard — configure target & mode, then confirm schedule with recurring options</p>
        </div>

        {/* ── History ── */}
        <div className="node-card !p-0 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <span className="font-display font-bold text-sm uppercase tracking-wider">Launch History</span>
              <span className="text-[10px] text-muted-foreground">({history.length})</span>
            </div>
            {history.length > 0 && (
              <button onClick={() => persistHistory([])} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear all
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <History className="w-8 h-8 opacity-20" />
              <p className="text-xs">No launch history yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {history.map((h, idx) => (
                <div key={idx} className="flex items-center gap-4 px-5 py-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${h.status === "launched" ? "bg-green-500/15 text-green-400" : "bg-destructive/15 text-destructive"}`}>
                    {h.status === "launched" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {h.name || "Unnamed"}
                      {h.recurrent && <Repeat className="w-3 h-3 text-blue-400" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span className="font-mono">{h.target || "—"}</span>
                      <span>·</span>
                      <span>{fmtDate(h.launchedAt)}</span>
                      {h.error && <span className="text-destructive">· {h.error}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${h.status === "launched" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                    {h.status === "launched" ? "Launched" : "Failed"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default ScheduledScans;
