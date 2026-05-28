import React, { useState, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  CalendarClock,
  Calendar,
  Clock,
  X,
  CheckCircle2,
  BellRing,
  Repeat,
} from "lucide-react";
import { type Recurrence, nextOccurrence } from "./ScheduledScans";

const PROFILE_ICONS: Record<string, typeof Target> = {
  Radio, Network, KeyRound, Globe, EyeOff, Zap, Users, Server, Database, Monitor, Wifi, Terminal,
};

const MODE_SHORT: Record<string, string> = {
  scan_only: "Scan Only",
  ask_before_exploit: "Supervised",
  full_auto: "Full Auto",
  v2_auto: "Multi-Agent",
};

type TabId = "target" | "mode" | "credentials" | "safety" | "advanced";


interface ProfileSettings {
  mode: string; speedProfile: string; scanType: string; portRange: string;
  versionDetection: boolean; osDetection: boolean; aggressiveScan: boolean; nmapScripts: string;
  allowExploit: boolean; allowPostExploit: boolean; allowLateral: boolean;
  allowDockerEscape: boolean; allowBrowserRecon: boolean;
  timeLimit: number; rateLimit: number;
  blockDos: boolean; blockDestructive: boolean; maxSeverity: string;
  objectives: string; knownTech: string; scopeNotes: string;
}

interface ScanProfileDef {
  id: string; label: string; desc: string;
  iconName: keyof typeof PROFILE_ICONS;
  color: string; settings: ProfileSettings;
  custom?: boolean;
}

const SCAN_PROFILE_DEFS: ScanProfileDef[] = [
  {
    id: "host_discovery", label: "Host Discovery",
    desc: "Discover live hosts and open ports. Quick and lightweight.",
    iconName: "Radio", color: "blue",
    settings: { mode: "scan_only", speedProfile: "normal", scanType: "syn", portRange: "top100", versionDetection: false, osDetection: false, aggressiveScan: false, nmapScripts: "", allowExploit: false, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 1800, rateLimit: 50, blockDos: true, blockDestructive: true, maxSeverity: "CRITICAL", objectives: "Identify all live hosts\nMap open ports and services", knownTech: "", scopeNotes: "Quick reconnaissance — read-only, no exploitation" },
  },
  {
    id: "basic_network", label: "Basic Network Scan",
    desc: "Full system scan — map hosts, ports, and services. Suitable for any host.",
    iconName: "Network", color: "green",
    settings: { mode: "scan_only", speedProfile: "normal", scanType: "syn", portRange: "top1000", versionDetection: true, osDetection: false, aggressiveScan: false, nmapScripts: "", allowExploit: false, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 3600, rateLimit: 50, blockDos: true, blockDestructive: true, maxSeverity: "CRITICAL", objectives: "Full network map\nIdentify running services and versions\nDetect open management interfaces", knownTech: "", scopeNotes: "Standard network scan — read-only" },
  },
  {
    id: "credentialed_audit", label: "Credentialed Audit",
    desc: "Authenticated scan — enumerate missing patches and misconfigurations.",
    iconName: "KeyRound", color: "amber",
    settings: { mode: "ask_before_exploit", speedProfile: "normal", scanType: "full", portRange: "top1000", versionDetection: true, osDetection: true, aggressiveScan: false, nmapScripts: "default,safe", allowExploit: true, allowPostExploit: true, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 7200, rateLimit: 30, blockDos: true, blockDestructive: true, maxSeverity: "HIGH", objectives: "Enumerate missing patches and CVEs\nIdentify misconfigurations\nCheck for weak or default credentials\nList privilege escalation paths", knownTech: "", scopeNotes: "Authenticated scan — requires valid credentials on target" },
  },
  {
    id: "web_app", label: "Web App Tests",
    desc: "Scan published and unknown web vulnerabilities on web-facing ports.",
    iconName: "Globe", color: "purple",
    settings: { mode: "ask_before_exploit", speedProfile: "normal", scanType: "syn", portRange: "80,443,8080,8443,3000,8000,8888,9000", versionDetection: true, osDetection: false, aggressiveScan: false, nmapScripts: "http-title,http-headers,http-methods,vuln", allowExploit: true, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: true, timeLimit: 3600, rateLimit: 20, blockDos: true, blockDestructive: true, maxSeverity: "CRITICAL", objectives: "Identify web vulnerabilities (OWASP Top 10)\nEnumerate API endpoints and hidden paths\nTest for SQL injection, XSS, SSRF\nCheck authentication and session management", knownTech: "nginx, apache, iis", scopeNotes: "Web application security test — web-facing ports only" },
  },
  {
    id: "stealth_recon", label: "Stealth Recon",
    desc: "Slow, quiet scan to minimize detection. Ideal for sensitive environments.",
    iconName: "EyeOff", color: "slate",
    settings: { mode: "scan_only", speedProfile: "stealth", scanType: "syn", portRange: "top1000", versionDetection: false, osDetection: false, aggressiveScan: false, nmapScripts: "", allowExploit: false, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 14400, rateLimit: 10, blockDos: true, blockDestructive: true, maxSeverity: "CRITICAL", objectives: "Passive network map\nMinimize detection footprint\nAvoid IDS/IPS triggering", knownTech: "", scopeNotes: "Silent scan — production-safe, avoid triggering alarms" },
  },
  {
    id: "full_auto", label: "Full Auto Exploit",
    desc: "Autonomous recon + exploit chain. Maximum coverage, full autonomy.",
    iconName: "Zap", color: "red",
    settings: { mode: "full_auto", speedProfile: "fast", scanType: "syn", portRange: "1-65535", versionDetection: true, osDetection: true, aggressiveScan: false, nmapScripts: "vuln", allowExploit: true, allowPostExploit: true, allowLateral: true, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 7200, rateLimit: 100, blockDos: true, blockDestructive: false, maxSeverity: "CRITICAL", objectives: "Gain root/admin access\nDump credentials and hashes\nDocument all exploited CVEs\nTest lateral movement paths", knownTech: "", scopeNotes: "Full autonomous pentest — authorized lab environment only" },
  },
  {
    id: "ad_audit", label: "Active Directory",
    desc: "Enumerate domain controllers, users, groups, SPNs, and GPOs. Detect Kerberoasting and privilege escalation paths.",
    iconName: "Users", color: "cyan",
    settings: { mode: "ask_before_exploit", speedProfile: "normal", scanType: "syn", portRange: "88,135,139,389,445,464,593,636,3268,3269,5985,9389", versionDetection: true, osDetection: true, aggressiveScan: false, nmapScripts: "ldap-rootdse,smb-security-mode,smb2-security-mode", allowExploit: true, allowPostExploit: true, allowLateral: true, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 7200, rateLimit: 30, blockDos: true, blockDestructive: true, maxSeverity: "CRITICAL", objectives: "Enumerate domain controllers and users\nIdentify Kerberoastable accounts (SPNs)\nCheck for AS-REP roasting candidates\nMap GPO misconfigurations\nFind privilege escalation paths", knownTech: "Windows Server, Active Directory, Kerberos, LDAP", scopeNotes: "Active Directory audit — domain user credentials recommended" },
  },
  {
    id: "external_perimeter", label: "External Perimeter",
    desc: "Assess internet-facing assets — DNS enumeration, certificate transparency, exposed services, and attack surface mapping.",
    iconName: "Server", color: "orange",
    settings: { mode: "scan_only", speedProfile: "normal", scanType: "syn", portRange: "top1000", versionDetection: true, osDetection: false, aggressiveScan: false, nmapScripts: "http-title,ssl-cert,dns-brute", allowExploit: false, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: true, timeLimit: 3600, rateLimit: 30, blockDos: true, blockDestructive: true, maxSeverity: "HIGH", objectives: "Map internet-facing services\nDNS enumeration and subdomain discovery\nCertificate transparency check\nIdentify exposed management interfaces", knownTech: "", scopeNotes: "External attack surface assessment — authorized external testing only" },
  },
  {
    id: "db_enum", label: "Database Enumeration",
    desc: "Find and probe database services — MySQL, MSSQL, PostgreSQL, MongoDB, Redis. Extract schemas and check for weak auth.",
    iconName: "Database", color: "pink",
    settings: { mode: "ask_before_exploit", speedProfile: "normal", scanType: "syn", portRange: "1433,1521,3306,5432,5984,6379,27017,27018,27019,28017", versionDetection: true, osDetection: false, aggressiveScan: false, nmapScripts: "mysql-info,ms-sql-info,pgsql-brute", allowExploit: true, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 3600, rateLimit: 20, blockDos: true, blockDestructive: true, maxSeverity: "HIGH", objectives: "Discover database services\nTest for authentication bypass\nExtract schema information\nCheck for default or weak credentials", knownTech: "MySQL, PostgreSQL, MSSQL, MongoDB, Redis", scopeNotes: "Database enumeration — read-only extraction focus" },
  },
  {
    id: "container_cloud", label: "Container / Cloud",
    desc: "Detect exposed Docker APIs, Kubernetes dashboards, and cloud metadata endpoints. Test for container escape paths.",
    iconName: "Monitor", color: "teal",
    settings: { mode: "ask_before_exploit", speedProfile: "normal", scanType: "syn", portRange: "2375,2376,2377,6443,8001,8080,8443,10250,10255,10256,16443", versionDetection: true, osDetection: false, aggressiveScan: false, nmapScripts: "http-title,ssl-cert", allowExploit: true, allowPostExploit: false, allowLateral: false, allowDockerEscape: true, allowBrowserRecon: false, timeLimit: 3600, rateLimit: 30, blockDos: true, blockDestructive: false, maxSeverity: "CRITICAL", objectives: "Detect exposed Docker/Kubernetes APIs\nTest container escape paths\nEnumerate cloud metadata endpoints\nCheck RBAC misconfigurations", knownTech: "Docker, Kubernetes, containerd", scopeNotes: "Container and cloud security assessment" },
  },
  {
    id: "wireless_recon", label: "Wireless Recon",
    desc: "Map wireless infrastructure — enumerate access points, clients, and rogue devices on 2.4 / 5 GHz bands.",
    iconName: "Wifi", color: "indigo",
    settings: { mode: "scan_only", speedProfile: "stealth", scanType: "udp", portRange: "1900,5353,67,68", versionDetection: false, osDetection: false, aggressiveScan: false, nmapScripts: "", allowExploit: false, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 7200, rateLimit: 10, blockDos: true, blockDestructive: true, maxSeverity: "MEDIUM", objectives: "Map wireless access points\nIdentify rogue devices\nEnumerate client associations", knownTech: "802.11, WPA2, WPA3", scopeNotes: "Wireless infrastructure recon — passive scan mode" },
  },
  {
    id: "iot_ot", label: "IoT / OT Scan",
    desc: "Target industrial and IoT protocols — Modbus, DNP3, BACnet, MQTT, CoAP. Minimal footprint, no disruption.",
    iconName: "Terminal", color: "yellow",
    settings: { mode: "scan_only", speedProfile: "stealth", scanType: "udp", portRange: "102,502,1883,1911,2404,4840,20000,44818,47808", versionDetection: true, osDetection: false, aggressiveScan: false, nmapScripts: "modbus-discover,bacnet-info", allowExploit: false, allowPostExploit: false, allowLateral: false, allowDockerEscape: false, allowBrowserRecon: false, timeLimit: 10800, rateLimit: 5, blockDos: true, blockDestructive: true, maxSeverity: "LOW", objectives: "Identify industrial protocols\nEnumerate IoT/OT devices\nCheck for authentication weaknesses", knownTech: "Modbus, DNP3, BACnet, MQTT", scopeNotes: "Minimal footprint — critical infrastructure, avoid any disruption" },
  },
];

const PROFILE_ICON_COLORS: Record<string, string> = {
  blue:   "bg-blue-500/15 text-blue-400 border-blue-500/25",
  green:  "bg-green-500/15 text-green-400 border-green-500/25",
  amber:  "bg-amber-500/15 text-amber-400 border-amber-500/25",
  purple: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  slate:  "bg-slate-500/15 text-slate-400 border-slate-500/25",
  red:    "bg-red-500/15 text-red-400 border-red-500/25",
  cyan:   "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
  orange: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  pink:   "bg-pink-500/15 text-pink-400 border-pink-500/25",
  teal:   "bg-teal-500/15 text-teal-400 border-teal-500/25",
  indigo: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
  yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
};

const PROFILE_ACCENT_BORDERS: Record<string, string> = {
  blue:   "hover:border-blue-500/40",
  green:  "hover:border-green-500/40",
  amber:  "hover:border-amber-500/40",
  purple: "hover:border-violet-500/40",
  slate:  "hover:border-slate-500/40",
  red:    "hover:border-red-500/40",
  cyan:   "hover:border-cyan-500/40",
  orange: "hover:border-orange-500/40",
  pink:   "hover:border-pink-500/40",
  teal:   "hover:border-teal-500/40",
  indigo: "hover:border-indigo-500/40",
  yellow: "hover:border-yellow-500/40",
};

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

  // ── Scan profile ────────────────────────────────
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [customProfiles, setCustomProfiles] = useState<ScanProfileDef[]>(() => {
    try { return JSON.parse(localStorage.getItem("tirpan_custom_profiles") || "[]"); }
    catch { return []; }
  });
  const [saveProfileOpen, setSaveProfileOpen] = useState(false);
  const [saveProfileName, setSaveProfileName] = useState("");
  const [saveProfileDesc, setSaveProfileDesc] = useState("");
  const [saveProfileIcon, setSaveProfileIcon] = useState("Radio");
  const [saveProfileColor, setSaveProfileColor] = useState("blue");

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
  // Per-mission wordlist override. Empty → server falls through to
  // app_settings.default_password_wordlist → common-path cascade →
  // embedded 50-password fallback (see HydraTool._resolve_passlist).
  const [passwordWordlist, setPasswordWordlist] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");

  // ── Schedule state ───────────────────────────────
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePendingProfile, setSchedulePendingProfile] = useState<string | null>(null);
  const [scheduledMissions, setScheduledMissions] = useState<{ id: string; name: string; target: string; scheduledAt: string; profile?: string; payload: Record<string, unknown> }[]>(() => {
    try { return JSON.parse(localStorage.getItem("tirpan_scheduled_missions") || "[]"); }
    catch { return []; }
  });
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [schedSuccessLabel, setSchedSuccessLabel] = useState("");

  // Custom date-time picker parts (avoids native datetime-local)
  const _initSchedTime = () => {
    const d = new Date(Date.now() + 3600 * 1000);
    d.setSeconds(0, 0);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: Math.ceil(d.getMinutes() / 5) * 5 % 60 };
  };
  const [schedParts, setSchedParts] = useState(_initSchedTime);
  const schedDateTime = useMemo(() => {
    const { year, month, day, hour, minute } = schedParts;
    return new Date(year, month - 1, day, hour, minute, 0);
  }, [schedParts]);
  const schedIsValid = schedDateTime.getTime() > Date.now() + 30_000;

  // Recurrence
  const [schedRecType, setSchedRecType] = useState<Recurrence['type']>('once');
  const [schedDow, setSchedDow] = useState<boolean[]>([false, true, false, false, false, false, false]); // Mon default
  const toggleSchedDow = (i: number) => setSchedDow(prev => {
    const next = [...prev];
    if (next[i] && next.filter(Boolean).length === 1) return prev; // keep ≥1
    next[i] = !next[i];
    return next;
  });

  // ── Submit state ────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Demo mode: pre-fill default values ──────────
  useEffect(() => {
    if (!isDemoMode()) return;
    setStep(2);
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

  // ── Apply scan profile ──────────────────────────
  // Settings-only — no step/navigation side-effects
  const applyProfileSettings = (profileId: string): boolean => {
    const all = [...SCAN_PROFILE_DEFS, ...customProfiles];
    const def = all.find((p) => p.id === profileId);
    if (!def) return false;
    const s = def.settings;
    setMode(s.mode);
    setSpeedProfile(s.speedProfile);
    setScanType(s.scanType);
    setPortRange(s.portRange);
    setVersionDetection(s.versionDetection);
    setOsDetection(s.osDetection);
    setAggressiveScan(s.aggressiveScan);
    setNmapScripts(s.nmapScripts);
    setAllowExploit(s.allowExploit);
    setAllowPostExploit(s.allowPostExploit);
    setAllowLateral(s.allowLateral);
    setAllowDockerEscape(s.allowDockerEscape);
    setAllowBrowserRecon(s.allowBrowserRecon);
    setTimeLimit(s.timeLimit);
    setRateLimit(s.rateLimit);
    setBlockDos(s.blockDos);
    setBlockDestructive(s.blockDestructive);
    setMaxSeverity(s.maxSeverity);
    setObjectives(s.objectives);
    setKnownTech(s.knownTech);
    setScopeNotes(s.scopeNotes);
    setActiveProfile(profileId);
    return true;
  };

  // Full apply — settings + navigate to step 2
  const applyProfile = (profileId: string) => {
    if (applyProfileSettings(profileId)) setStep(2);
  };

  // ── Save / delete custom profile ────────────────
  const saveCustomProfile = () => {
    if (!saveProfileName.trim()) return;
    const id = `custom_${Date.now()}`;
    const newProfile: ScanProfileDef = {
      id, custom: true,
      label: saveProfileName.trim(),
      desc: saveProfileDesc.trim() || "Custom scan profile",
      iconName: saveProfileIcon as keyof typeof PROFILE_ICONS,
      color: saveProfileColor,
      settings: {
        mode, speedProfile, scanType, portRange,
        versionDetection, osDetection, aggressiveScan, nmapScripts,
        allowExploit, allowPostExploit, allowLateral, allowDockerEscape, allowBrowserRecon,
        timeLimit, rateLimit, blockDos, blockDestructive, maxSeverity,
        objectives, knownTech, scopeNotes,
      },
    };
    const updated = [...customProfiles, newProfile];
    setCustomProfiles(updated);
    localStorage.setItem("tirpan_custom_profiles", JSON.stringify(updated));
    setSaveProfileOpen(false);
    setSaveProfileName("");
    setSaveProfileDesc("");
  };

  const deleteCustomProfile = (id: string) => {
    const updated = customProfiles.filter((p) => p.id !== id);
    setCustomProfiles(updated);
    localStorage.setItem("tirpan_custom_profiles", JSON.stringify(updated));
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

      // Per-mission wordlist override; empty → backend cascade kicks in.
      password_wordlist: passwordWordlist.trim() || undefined,

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

  // ── Schedule helpers ─────────────────────────────
  const _openSchedule = () => {
    setSchedParts(_initSchedTime());
    setScheduleOpen(true);
  };

  // Normal mod (Step 1) — profil seç ama step'e gitme, sadece ayarları uygula
  const openScheduleFromProfile = (profileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    applyProfileSettings(profileId);   // step 2'ye GİTMEZ
    setSchedulePendingProfile(profileId);
    _openSchedule();
  };

  // Expert mod (Step 2) — mevcut form ayarlarıyla schedule aç
  const openScheduleFromForm = () => {
    setSchedulePendingProfile(null);
    _openSchedule();
  };

  const handleScheduleConfirm = () => {
    if (!schedIsValid) return;
    const payload = buildPayload();

    // Build recurrence object
    const rec: Recurrence = {
      type: schedRecType,
      hour: schedParts.hour,
      minute: schedParts.minute,
      daysOfWeek: schedRecType === 'weekly'
        ? schedDow.map((on, i) => on ? i : -1).filter(i => i >= 0)
        : undefined,
      dayOfMonth: schedRecType === 'monthly' ? schedParts.day : undefined,
    };

    // For recurring types, resolve proper next occurrence from the selected time
    let scheduledAt = schedDateTime.toISOString();
    if (rec.type !== 'once') {
      const next = nextOccurrence(rec, schedDateTime.getTime() - 60_000);
      if (next) scheduledAt = next.toISOString();
    }

    const label = new Date(scheduledAt).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const recSuffix = rec.type !== 'once'
      ? ` · ${rec.type === 'daily' ? 'Daily' : rec.type === 'weekly' ? 'Weekly' : 'Monthly'}`
      : '';

    const mission = {
      id: `sched_${Date.now()}`,
      name: missionName.trim() || target.trim() || (schedulePendingProfile ? [...SCAN_PROFILE_DEFS, ...customProfiles].find(p => p.id === schedulePendingProfile)?.label : undefined) || "Unnamed Mission",
      target: target.trim(),
      scheduledAt,
      recurrence: rec,
      profile: schedulePendingProfile || activeProfile || undefined,
      source: 'normal' as const,
      payload,
    };
    const updated = [...scheduledMissions, mission];
    setScheduledMissions(updated);
    localStorage.setItem("tirpan_scheduled_missions", JSON.stringify(updated));
    setScheduleOpen(false);
    setSchedSuccessLabel(label + recSuffix);
    setScheduleSuccess(true);
    setTimeout(() => setScheduleSuccess(false), 6000);
  };

  const cancelScheduled = (id: string) => {
    const updated = scheduledMissions.filter((m) => m.id !== id);
    setScheduledMissions(updated);
    localStorage.setItem("tirpan_scheduled_missions", JSON.stringify(updated));
  };

  // Auto-launcher moved to App.tsx (ScheduleTicker) — runs globally on all pages

  // ── Render helpers ──────────────────────────────
  const fieldLabel = (text: string, desc?: string) => (
    <div className="mb-1.5">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{text}</Label>
      {desc && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{desc}</p>}
    </div>
  );

  // ── Custom date-time helpers ─────────────────────
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
  const sp = (v: number) => String(v).padStart(2, "0");

  // Countdown label
  const schedCountdown = useMemo(() => {
    const diff = schedDateTime.getTime() - Date.now();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h >= 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [schedDateTime]);

  // Profile display name for header
  const schedProfileLabel = schedulePendingProfile
    ? [...SCAN_PROFILE_DEFS, ...customProfiles].find(p => p.id === schedulePendingProfile)?.label
    : null;

  // ── Schedule modal (rendered via portal → body level) ──────────
  const scheduleModalContent = scheduleOpen ? (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setScheduleOpen(false); }}
    >
      {/* Full-viewport blur overlay */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />

      {/* Modal card */}
      <div className="relative w-full max-w-[440px] mx-4 rounded-2xl border border-white/10 bg-[hsl(var(--card))] shadow-[0_24px_80px_rgba(0,0,0,0.6)]">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <CalendarClock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base leading-tight">Schedule Scan</h3>
              <p className="text-[11px] text-muted-foreground">
                {schedProfileLabel ? `Profile: ${schedProfileLabel}` : "Auto-launches at the set time"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setScheduleOpen(false)}
            className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5">

          {/* Mission summary pill */}
          <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-muted/25 border border-border/30">
            <div className="flex items-center gap-1.5 text-xs">
              <Target className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Target:</span>
              <span className="font-mono text-foreground">{target.trim() || <span className="italic text-muted-foreground/60">not set</span>}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs ml-auto">
              <Radio className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold border border-primary/20">
                {MODE_SHORT[mode] ?? mode}
              </span>
            </div>
          </div>

          {/* ── Custom date picker ── */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Date
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {/* Day */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Day</p>
                <select
                  value={schedParts.day}
                  onChange={e => setSchedParts(p => ({ ...p, day: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 appearance-none cursor-pointer"
                >
                  {Array.from({ length: daysInMonth(schedParts.year, schedParts.month) }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{sp(d)}</option>
                  ))}
                </select>
              </div>
              {/* Month */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Month</p>
                <select
                  value={schedParts.month}
                  onChange={e => setSchedParts(p => ({ ...p, month: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 appearance-none cursor-pointer"
                >
                  {MONTHS.map((mn, i) => (
                    <option key={mn} value={i + 1}>{mn}</option>
                  ))}
                </select>
              </div>
              {/* Year */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Year</p>
                <select
                  value={schedParts.year}
                  onChange={e => setSchedParts(p => ({ ...p, year: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 appearance-none cursor-pointer"
                >
                  {[0, 1, 2].map(offset => {
                    const y = new Date().getFullYear() + offset;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* ── Custom time picker ── */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Time
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {/* Hour */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Hour</p>
                <select
                  value={schedParts.hour}
                  onChange={e => setSchedParts(p => ({ ...p, hour: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 appearance-none cursor-pointer"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map(h => (
                    <option key={h} value={h}>{sp(h)}:00</option>
                  ))}
                </select>
              </div>
              {/* Minute */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-1">Minute</p>
                <select
                  value={schedParts.minute}
                  onChange={e => setSchedParts(p => ({ ...p, minute: Number(e.target.value) }))}
                  className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 appearance-none cursor-pointer"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                    <option key={m} value={m}>:{sp(m)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Countdown / validation feedback */}
            <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${schedIsValid ? "bg-primary/8 border border-primary/20 text-primary" : "bg-destructive/10 border border-destructive/20 text-destructive"}`}>
              {schedIsValid ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
              {schedIsValid
                ? <>Launches in <strong className="ml-1">{schedCountdown}</strong> &nbsp;·&nbsp; {schedDateTime.toLocaleString()}</>
                : "Selected time is in the past — please choose a future time"}
            </div>
          </div>

          {/* ── Recurrence ── */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-3 flex items-center gap-1.5">
              <Repeat className="w-3 h-3" /> Recurrence
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {(['once', 'daily', 'weekly', 'monthly'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSchedRecType(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${
                    schedRecType === t
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border/40 bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'once' ? 'One-time' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            {schedRecType === 'weekly' && (
              <div className="mt-2 flex gap-1">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleSchedDow(i)}
                    className={`flex-1 py-1.5 rounded text-[10px] font-bold transition-colors ${
                      schedDow[i]
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            {schedRecType !== 'once' && (
              <p className="mt-1.5 text-[10px] text-muted-foreground/70 flex items-center gap-1">
                <Repeat className="w-3 h-3 shrink-0" />
                {schedRecType === 'daily' && `Repeats every day at ${String(schedParts.hour).padStart(2,'0')}:${String(schedParts.minute).padStart(2,'0')}`}
                {schedRecType === 'weekly' && `Repeats on selected days at ${String(schedParts.hour).padStart(2,'0')}:${String(schedParts.minute).padStart(2,'0')}`}
                {schedRecType === 'monthly' && `Repeats on day ${schedParts.day} of each month at ${String(schedParts.hour).padStart(2,'0')}:${String(schedParts.minute).padStart(2,'0')}`}
              </p>
            )}
          </div>

          {/* Quick-select shortcuts */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "+30 min", ms: 30 * 60_000 },
              { label: "+1 hour", ms: 60 * 60_000 },
              { label: "+3 hours", ms: 3 * 60 * 60_000 },
              { label: "+1 day", ms: 24 * 60 * 60_000 },
            ].map(({ label, ms }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const d = new Date(Date.now() + ms);
                  d.setSeconds(0, 0);
                  setSchedParts({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: Math.round(d.getMinutes() / 5) * 5 % 60 });
                }}
                className="px-3 py-1 rounded-full text-[10px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Pending scheduled missions list */}
          {scheduledMissions.length > 0 && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 flex items-center gap-1.5">
                <BellRing className="w-3 h-3" /> Pending Schedules ({scheduledMissions.length})
              </Label>
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {scheduledMissions.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/25 border border-border/30 text-xs">
                    {(m as {recurrence?: {type:string}}).recurrence?.type && (m as {recurrence?: {type:string}}).recurrence?.type !== 'once'
                      ? <Repeat className="w-3 h-3 text-primary shrink-0" />
                      : <BellRing className="w-3 h-3 text-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.name || m.target || "Unnamed"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
                        {new Date(m.scheduledAt).toLocaleString()}
                        {(m as {recurrence?: {type:string}}).recurrence?.type && (m as {recurrence?: {type:string}}).recurrence?.type !== 'once' && (
                          <span className="px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-semibold capitalize">
                            {(m as {recurrence?: {type:string}}).recurrence?.type}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => cancelScheduled(m.id)}
                      className="w-5 h-5 rounded flex items-center justify-center hover:bg-destructive/15 hover:text-destructive text-muted-foreground transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-2 border-t border-border/30">
          <Button type="button" variant="ghost" size="sm" onClick={() => setScheduleOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleScheduleConfirm}
            disabled={!schedIsValid}
            className="gap-2"
          >
            {schedRecType !== 'once' ? <Repeat className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
            {schedRecType !== 'once' ? 'Schedule Recurring' : 'Confirm Schedule'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <PageShell title="New Mission" subtitle="Configure and launch pentest session">
      {/* Schedule modal — rendered at document.body via portal (full-screen blur) */}
      {scheduleOpen && createPortal(scheduleModalContent, document.body)}

      {/* Schedule success toast — also portal so it sits above everything */}
      {scheduleSuccess && createPortal(
        <div className="fixed bottom-6 right-6 z-[9998] flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-primary/30 shadow-2xl">
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-semibold">Scan Scheduled ✓</div>
            <div className="text-[11px] text-muted-foreground">{schedSuccessLabel}</div>
          </div>
          <button type="button" onClick={() => setScheduleSuccess(false)} className="ml-2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>,
        document.body
      )}

      {step === 1 ? (
        /* ── Step 1: Profile Picker ────────────────────────────────── */
        <div className="h-full flex flex-col gap-5 py-1">
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <ScanSearch className="w-5 h-5 text-primary" />
              <h2 className="font-display font-bold text-xl tracking-tight">Step 1 — Choose a Scan Profile</h2>
            </div>
            <p className="text-sm text-muted-foreground pl-7">
              Select a preset to auto-configure all settings, or choose Custom to configure manually.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-4 gap-3 pb-3">
              {[...SCAN_PROFILE_DEFS, ...customProfiles].map((p) => {
                const Icon = PROFILE_ICONS[p.iconName];
                const iconClass = PROFILE_ICON_COLORS[p.color] ?? PROFILE_ICON_COLORS["blue"];
                const accentBorder = PROFILE_ACCENT_BORDERS[p.color] ?? PROFILE_ACCENT_BORDERS["blue"];
                return (
                  <div key={p.id} className="relative group/card">
                    <button
                      type="button"
                      onClick={() => applyProfile(p.id)}
                      className={`w-full h-full min-h-[180px] p-4 rounded-2xl border border-border/50 bg-card text-left transition-colors duration-150 hover:bg-muted/20 ${accentBorder} flex flex-col`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 border shrink-0 ${iconClass}`}>
                        {Icon && <Icon className="w-4 h-4" />}
                      </div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-display font-bold text-sm text-foreground">{p.label}</span>
                        {p.custom && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-semibold uppercase tracking-wide">Custom</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">{p.desc}</div>
                      <div className="space-y-1.5 mt-auto">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wide font-semibold">
                            {MODE_SHORT[p.settings.mode] ?? p.settings.mode}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize font-medium">
                            {p.settings.speedProfile}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase font-medium">
                            {p.settings.scanType}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground font-mono">
                            {p.settings.portRange.length > 14 ? p.settings.portRange.slice(0, 14) + "…" : p.settings.portRange}
                          </span>
                          {p.settings.allowExploit && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium">Exploit</span>
                          )}
                          {p.settings.allowPostExploit && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20 font-medium">Post-Exploit</span>
                          )}
                          {p.settings.allowLateral && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">Lateral</span>
                          )}
                        </div>
                      </div>
                    </button>
                    {/* Schedule button — always visible on hover */}
                    <button
                      type="button"
                      onClick={(e) => openScheduleFromProfile(p.id, e)}
                      title="Schedule this scan"
                      className={`absolute top-2 ${p.custom ? "right-10" : "right-2"} w-6 h-6 rounded-lg bg-muted/80 opacity-0 group-hover/card:opacity-100 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-all`}
                    >
                      <CalendarClock className="w-3 h-3" />
                    </button>
                    {p.custom && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteCustomProfile(p.id); }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-lg bg-muted/80 opacity-0 group-hover/card:opacity-100 flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Custom / Advanced — full width last row */}
              <div className="col-span-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveProfile(null);
                    setMode("scan_only"); setSpeedProfile("normal"); setScanType("syn");
                    setPortRange("1-65535"); setVersionDetection(true); setOsDetection(false);
                    setAggressiveScan(false); setNmapScripts(""); setAllowExploit(false);
                    setAllowPostExploit(false); setAllowLateral(false); setAllowDockerEscape(false);
                    setAllowBrowserRecon(false); setTimeLimit(7200); setRateLimit(50);
                    setBlockDos(true); setBlockDestructive(true); setMaxSeverity("CRITICAL");
                    setObjectives(""); setKnownTech(""); setScopeNotes("");
                    setStep(2);
                  }}
                  className="flex-1 p-4 rounded-2xl border border-dashed border-border/60 bg-transparent hover:bg-muted/20 text-left transition-all flex items-center gap-4 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 group-hover:bg-muted transition-colors">
                    <Settings2 className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-sm">Custom / Advanced</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Configure all settings manually — full control over every scan parameter, safety rule, and agent behaviour
                    </div>
                  </div>
                </button>

                {/* Scheduled missions count chip */}
                {scheduledMissions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(Date.now() + 3600 * 1000);
                      d.setSeconds(0, 0);
                      setScheduleDate(d.toISOString().slice(0, 16));
                      setSchedulePendingProfile(null);
                      setScheduleOpen(true);
                    }}
                    className="flex items-center gap-3 px-5 rounded-2xl border border-primary/25 bg-primary/5 hover:bg-primary/10 transition-colors shrink-0"
                  >
                    <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                      <BellRing className="w-4 h-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-primary">{scheduledMissions.length}</div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">Scheduled</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Step 2: Mission Form ───────────────────────────────────── */
        <div className="flex flex-col h-full gap-0 max-w-4xl mx-auto w-full">
          {/* Profile breadcrumb bar */}
          <div className="flex items-center gap-3 mb-4 shrink-0">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Profiles
            </button>
            {activeProfile && (() => {
              const pd = [...SCAN_PROFILE_DEFS, ...customProfiles].find((p) => p.id === activeProfile);
              const Icon = pd ? PROFILE_ICONS[pd.iconName] : null;
              return pd ? (
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${PROFILE_ICON_COLORS[pd.color]}`}>
                  {Icon && <Icon className="w-3 h-3" />}
                  {pd.label}
                </div>
              ) : null;
            })()}
          </div>

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

              <Separator />

              {/* ── Per-mission password wordlist override ─────────── */}
              {/* Falls through to Settings → ML Models → Default password
                  wordlist, then to the embedded fallback cascade. Empty here
                  means "use whatever the platform default is". */}
              <div>
                {fieldLabel(
                  "Password wordlist (this mission only)",
                  "Used by hydra / medusa when no wordlist is specified per call. Leave empty to use the global Settings default.",
                )}
                <Input
                  value={passwordWordlist}
                  onChange={(e) => setPasswordWordlist(e.target.value)}
                  placeholder="/usr/share/wordlists/rockyou.txt"
                  className="font-mono text-xs"
                />
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
                              <SelectValue placeholder="Select model…" />
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
                        <SelectValue placeholder="Select model…" />
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

        {/* Save as Profile panel */}
        {saveProfileOpen && (
          <div className="shrink-0 node-card !p-4 mb-3 border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-primary" />
              <span className="font-display font-bold text-sm">Save as Profile</span>
              <button type="button" onClick={() => setSaveProfileOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Profile Name *</Label>
                <Input value={saveProfileName} onChange={(e) => setSaveProfileName(e.target.value)} placeholder="My Custom Scan" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Description</Label>
                <Input value={saveProfileDesc} onChange={(e) => setSaveProfileDesc(e.target.value)} placeholder="What this profile does…" className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Icon</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PROFILE_ICONS).map(([k, IconComp]) => (
                    <button
                      key={k}
                      type="button"
                      title={k}
                      onClick={() => setSaveProfileIcon(k)}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                        saveProfileIcon === k
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 border-border/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1 block">Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PROFILE_ICON_COLORS).map(([c, cls]) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => setSaveProfileColor(c)}
                      className={`w-7 h-7 rounded-lg border transition-all ${cls} ${
                        saveProfileColor === c ? "ring-2 ring-offset-1 ring-offset-background ring-foreground/40 scale-110" : "opacity-60 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={saveCustomProfile} disabled={!saveProfileName.trim()} size="sm" className="gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" /> Save Profile
            </Button>
          </div>
        )}

        {/* Bottom bar */}
        <div className="flex items-center justify-between shrink-0 node-card !p-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/missions")}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveProfileOpen((v) => !v)}
              className="gap-2 text-xs"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Save as Profile
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[10px] text-muted-foreground">
              {target || missionName ? `Target: ${target || missionName}` : "No target set"}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={openScheduleFromForm}
              className="gap-2 border-primary/40 bg-primary/8 hover:bg-primary/15 text-primary hover:border-primary/60 font-semibold"
            >
              <CalendarClock className="w-4 h-4" />
              Schedule Scan
              {scheduledMissions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                  {scheduledMissions.length}
                </span>
              )}
            </Button>
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
      )}
    </PageShell>
  );
};

export default NewMission;
