import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession, getSessionEvents } from "@/lib/api";
import { isDemoMode } from "@/lib/demoMode";

export type NodeStatus = "pending" | "active" | "completed";

export interface CanvasNode {
  id: string;
  type: "start" | "attacker" | "action" | "host" | "tool" | "agent" | "milestone" | "vuln" | "session_node";
  x: number;
  y: number;
  label: string;
  subtitle?: string;
  status: NodeStatus;
  data?: any;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "next" | "scan" | "exploit" | "lateral" | "discover" | "spawn" | "tool_call" | "leads_to";
  label?: string;
}

export interface GraphView {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface DynamicGraphData {
  topology: GraphView;
  attackPath: GraphView;
  isRunning: boolean;
  target: string;
  selectedHost: string | null;
  isDemoMode: boolean;
  startTime: number;
  elapsedSeconds: number;
}

export interface AttackGraphData {
  sessionId: string | null;
  isRunning: boolean;
  isDemoMode: boolean;
  target: string;
  subdomainDiscovery: { status: NodeStatus; count: number; time: string };
  portScan: { status: NodeStatus; openPorts: number; topPorts: { num: number; service: string }[]; hosts: number; time: string };
  webFoothold: { status: NodeStatus; ip: string; server: string; risk: string; time: string };
  ssh: { status: NodeStatus; userAtHost: string; time: string };
  credDump: { status: NodeStatus; total: number; domainAdmins: number; localAdmins: number; users: number; time: string };
  kerberoast: { status: NodeStatus; crackable: number; time: string };
  bloodhound: { status: NodeStatus; pathsFound: number; time: string };
  privesc: { status: NodeStatus; user: string; risk: number; time: string };
  lateral: { status: NodeStatus; hostCount: number; time: string };
  domainAdmin: { status: NodeStatus; user: string; time: string };
  alert: { status: NodeStatus; score: number; target: string; time: string };
}

export interface InsightData {
  riskScore: number;
  riskLabel: "Critical" | "High" | "Medium" | "Low" | "—";
  riskTrend: number[];
  openAttackPaths: number;
  criticalFindings: number;
  highFindings: number;
  compromisedHosts: number;
  totalHosts: number;
  totalVulns: number;
  successfulExploits: number;
  attackVectors: { label: string; pct: number }[];
  pathTrend: number[];
}

export interface SessionDetails {
  isRunning: boolean;
  target: string;
  elapsedSeconds: number;
  startTime: number;
  hosts: {
    ip: string;
    os: string;
    compromised: boolean;
    sessionLevel: number;
    openPorts: number;
    shellAccess: boolean;
  }[];
  openPorts: {
    num: number;
    service: string;
    version: string;
    host: string;
    state: string;
  }[];
  vulnerabilities: {
    title: string;
    cvss: number;
    host: string;
    exploitType: string;
  }[];
  recentExploits: {
    module: string;
    host: string;
    port: number;
    success: boolean;
    sessionOpened: boolean;
    ml_success_prob?: number;
    ts: number;
  }[];
}

export interface TimelineStep {
  label: string;
  time: string;
  done: boolean;
  active: boolean;
  count?: number;
}

export interface TimelineData {
  currentTime: string;
  sessionDate: string;
  steps: TimelineStep[];
  events?: TimelineEvent[];
}

export interface TimelineEvent {
  time: string;
  label: string;
  detail: string;
  type: "scan" | "exploit" | "finding" | "session" | "phase" | "agent";
}

export interface SessionGraphBundle {
  graph: AttackGraphData;
  dynamicGraph: DynamicGraphData;
  insights: InsightData;
  timeline: TimelineData;
  details: SessionDetails;
  sessionId: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

function fmtTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function matchMod(module: string, ...kws: string[]): boolean {
  const m = module.toLowerCase();
  return kws.some((k) => m.includes(k));
}

// ─── Layout Constants ────────────────────────────────────────────────────────

const CARD_W = 230;
const CARD_H = 140;
const HOST_W = 240;
const HOST_H = 150;
const ROW_DY = 210;
const EXPLOIT_GAP = 14;

// Main path center column
const MAIN_X = 280;
const CENTER_X = MAIN_X + CARD_W / 2; // 395
const RIGHT_X = MAIN_X + CARD_W + 50; // 560 — right branch start
const MICRO_W = 170;
const MICRO_H = 48;

// ─── Topology Graph Builder ──────────────────────────────────────────────────

function buildTopology(session: any): GraphView {
  if (!session || typeof session !== "object") {
    return { nodes: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 600, maxY: 400 } };
  }

  const mc: any = session.mission_context || {};
  const scanResults: any[] = session.scan_results || [];
  const exploits: any[] = session.exploit_results || [];
  const vulns: any[] = session.vulnerabilities || [];
  const v2Sessions: any[] = Array.isArray(mc.active_sessions) ? mc.active_sessions : [];

  const hostMap = new Map<string, any>();
  if (mc.hosts && typeof mc.hosts === "object") {
    for (const [ip, host] of Object.entries(mc.hosts)) {
      if (host && typeof host === "object" && !hostMap.has(ip)) hostMap.set(ip, host);
    }
  }
  for (const sr of scanResults) {
    for (const host of sr.hosts || []) {
      if (host && typeof host === "object" && host.ip && !hostMap.has(host.ip)) hostMap.set(host.ip, host);
    }
  }
  const allHosts = [...hostMap.values()].filter((h) => h && typeof h === "object");

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  nodes.push({ id: "attacker", type: "attacker", x: 300, y: 30, label: "TIRPAN", subtitle: session.target || "", status: "completed" });

  const cols = Math.min(3, Math.max(1, allHosts.length));
  allHosts.forEach((host: any, i: number) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const hx = 40 + col * (HOST_W + 40);
    const hy = 140 + row * (HOST_H + 60);

    const compromised = v2Sessions.some((s: any) => s.host_ip === host.ip) || exploits.some((e: any) => e.success && e.host_ip === host.ip);
    const sessionLevel = Math.max(0, ...v2Sessions.filter((s: any) => s.host_ip === host.ip).map((s: any) => s.privilege_level || 0));
    const openPorts = (host.ports || []).filter((p: any) => p.state === "open").length;
    const vCount = vulns.filter((v: any) => v.host_ip === host.ip).length;
    const eTotal = exploits.filter((e: any) => e.host_ip === host.ip).length;
    const eSuccess = exploits.filter((e: any) => e.host_ip === host.ip && e.success).length;

    nodes.push({
      id: `host-${host.ip}`,
      type: "host",
      x: hx,
      y: hy,
      label: host.ip,
      subtitle: host.os_type || host.os || "Unknown OS",
      status: compromised ? "completed" : "pending",
      data: { host, compromised, sessionLevel, openPorts, vulnCount: vCount, exploitCount: { total: eTotal, success: eSuccess }, exploitTotal: eTotal, exploitSuccess: eSuccess },
    });
    edges.push({ id: `e-att-${host.ip}`, source: "attacker", target: `host-${host.ip}`, type: "scan" });
  });

  const v2AttackGraph = mc.attack_graph || { edges: [] };
  (v2AttackGraph.edges || []).forEach((e: any, i: number) => {
    if (e.edge_type === "lateral") {
      edges.push({ id: `e-lat-${i}`, source: `host-${e.from_node}`, target: `host-${e.to_node}`, type: "lateral", label: e.description });
    }
  });

  const maxX = Math.max(600, ...nodes.map((n) => n.x + HOST_W));
  const maxY = Math.max(400, ...nodes.map((n) => n.y + HOST_H));

  return { nodes, edges, bounds: { minX: 0, minY: 0, maxX: maxX + 40, maxY: maxY + 40 } };
}

// ─── OS detection helper ─────────────────────────────────────────────────────

function detectOS(host: any): "linux" | "windows" | "unknown" {
  const os = (host?.os_type || host?.os || "").toLowerCase();
  if (os.includes("windows") || os.includes("win")) return "windows";
  if (os.includes("linux") || os.includes("ubuntu") || os.includes("debian") || os.includes("centos") || os.includes("unix")) return "linux";
  return "unknown";
}

function credToolFor(os: "linux" | "windows" | "unknown"): string {
  if (os === "linux") return "hashdump/shadow";
  if (os === "windows") return "mimikatz";
  return "cred-harvester";
}

function privescToolFor(os: "linux" | "windows" | "unknown"): string {
  if (os === "linux") return "sudo/kernel-exploit";
  if (os === "windows") return "local_exploit_suggester";
  return "privesc";
}

function postRootLabelFor(os: "linux" | "windows" | "unknown"): string {
  if (os === "windows") return "Domain Admin";
  return "Root Access";
}

function mitreFor(nodeId: string): string {
  const map: Record<string, string> = {
    portscan: "T1046 Network Service Discovery",
    searchsploit: "T1595 Active Scanning",
    creddump: "T1003 Credential Dumping",
    privesc: "T1068 Exploitation for Privilege Escalation",
    domainadmin: "T1078 Valid Accounts",
  };
  return map[nodeId] ?? "";
}

// Minor positional jitter so nodes don't look pixel-perfect rigid
function jitter(base: number, seed: string, amplitude = 18): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return base + ((h % (amplitude * 2)) - amplitude);
}

// ─── 2D Attack Path Graph Builder ────────────────────────────────────────────

function buildAttackPath(session: any, hostIp: string | null): GraphView {
  if (!session || typeof session !== "object" || !hostIp) {
    return { nodes: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 400, maxY: 300 } };
  }

  const isRunning = !!(session.is_running || session.status === "running");
  const scanResults: any[] = session.scan_results || [];
  const vulns: any[] = session.vulnerabilities || [];
  const exploits: any[] = session.exploit_results || [];
  const mc: any = session.mission_context || {};

  const hostMap = new Map<string, any>();
  if (mc.hosts && typeof mc.hosts === "object") {
    for (const [ip, host] of Object.entries(mc.hosts)) {
      if (host && typeof host === "object" && !hostMap.has(ip)) hostMap.set(ip, host);
    }
  }
  for (const sr of scanResults) {
    for (const host of sr.hosts || []) {
      if (host && typeof host === "object" && host.ip && !hostMap.has(host.ip)) hostMap.set(host.ip, host);
    }
  }
  const targetHost = hostMap.get(hostIp);
  if (!targetHost) {
    return { nodes: [], edges: [], bounds: { minX: 0, minY: 0, maxX: 400, maxY: 300 } };
  }

  const v2Sessions: any[] = Array.isArray(mc.active_sessions) ? mc.active_sessions : [];
  const hostVulns = vulns.filter((v: any) => v.host_ip === hostIp);
  const hostExploits = exploits.filter((e: any) => e.host_ip === hostIp);
  const hostScan = scanResults.find((sr: any) => (sr.hosts || []).some((h: any) => h.ip === hostIp));
  const hostPorts = (targetHost.ports || []).filter((p: any) => p.state === "open");
  const hostOS = detectOS(targetHost);

  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  let cy = 40;

  // ── START
  nodes.push({ id: "start", type: "start", x: CENTER_X - 65, y: cy, label: "START", status: "completed" });
  cy += 80;

  // ── TIRPAN
  nodes.push({
    id: "attacker", type: "attacker",
    x: CENTER_X - 50, y: cy,
    label: "TIRPAN", subtitle: hostIp,
    status: isRunning ? "active" : "completed",
  });
  edges.push({ id: "e-start-att", source: "start", target: "attacker", type: "next" });
  let lastId = "attacker";
  cy += 120;

  // ── PORT SCAN
  const portsDone = !!hostScan;
  const portList = hostPorts.slice(0, 6).map((p: any) => `${p.number}/${p.service || "?"}`).join("  ·  ");
  const portScanStatus: NodeStatus = portsDone ? "completed" : isRunning ? "active" : "pending";

  nodes.push({
    id: "portscan", type: "action",
    x: jitter(MAIN_X, "portscan", 8), y: cy,
    label: "Port Scan",
    subtitle: portsDone ? `${hostPorts.length} open port${hostPorts.length !== 1 ? "s" : ""} · nmap` : "Scanning…",
    status: portScanStatus,
    data: { ports: hostPorts, portList, hostCount: 1, tool: "nmap", mitre: mitreFor("portscan") },
  });
  edges.push({ id: "e-att-ps", source: lastId, target: "portscan", type: "next" });
  lastId = "portscan";

  // Port detail micro-nodes (right branch)
  const shownPorts = hostPorts.slice(0, 5);
  shownPorts.forEach((p: any, i: number) => {
    const pid = `port-${i}`;
    nodes.push({
      id: pid, type: "tool",
      x: RIGHT_X, y: cy + i * (MICRO_H + 10),
      label: `${p.number}/${p.service || "?"}`,
      subtitle: p.version ? p.version.slice(0, 22) : (p.state || "open"),
      status: "completed",
      data: { port: p.number, service: p.service, version: p.version },
    });
    edges.push({ id: `e-ps-p${i}`, source: "portscan", target: pid, type: "tool_call" });
  });

  // Advance cy past whichever is taller: main card or right-branch micro-nodes
  {
    const microBottom = shownPorts.length > 0 ? (shownPorts.length - 1) * (MICRO_H + 10) + MICRO_H : 0;
    cy += Math.max(ROW_DY, CARD_H + 40, microBottom + 40);
  }

  // ── VULN / SEARCHSPLOIT SCAN
  const vulnsDone = hostVulns.length > 0;
  if (vulnsDone || isRunning) {
    const vsStatus: NodeStatus = vulnsDone ? "completed" : isRunning ? "active" : "pending";
    nodes.push({
      id: "searchsploit", type: "action",
      x: jitter(MAIN_X, "searchsploit", 8), y: cy,
      label: "Vulnerability Scan",
      subtitle: vulnsDone ? `${hostVulns.length} vuln${hostVulns.length !== 1 ? "s" : ""} · searchsploit` : "Searching exploits…",
      status: vsStatus,
      data: { vulns: hostVulns, tool: "searchsploit", mitre: mitreFor("searchsploit") },
    });
    edges.push({ id: "e-ps-vs", source: lastId, target: "searchsploit", type: "next" });
    lastId = "searchsploit";

    // Vuln micro-nodes (right branch)
    const shownVulns = hostVulns.slice(0, 4);
    shownVulns.forEach((v: any, i: number) => {
      const vid = `vuln-${i}`;
      const cvss = v.cvss_score || 0;
      nodes.push({
        id: vid, type: "vuln",
        x: RIGHT_X, y: cy + i * (MICRO_H + 10),
        label: v.cve || v.title?.slice(0, 20) || "Vulnerability",
        subtitle: `CVSS ${cvss.toFixed(1)} · ${v.exploit_type || "unknown"}`,
        status: "completed",
        data: v,
      });
      edges.push({ id: `e-vs-v${i}`, source: "searchsploit", target: vid, type: "leads_to" });
    });

    {
      const microBottom = shownVulns.length > 0 ? (shownVulns.length - 1) * (MICRO_H + 10) + MICRO_H : 0;
      cy += Math.max(ROW_DY, CARD_H + 40, microBottom + 40);
    }
  }

  // ── EXPLOITS — horizontal row (max 2 per row, leave room for session nodes on right)
  const MAX_PER_ROW = 2;
  const hasSession = v2Sessions.some((s: any) => s.host_ip === hostIp) || hostExploits.some((e: any) => e.success);

  if (hostExploits.length > 0 || isRunning) {
    if (hostExploits.length === 0) {
      // Running but no results yet
      nodes.push({
        id: "exploit-pending", type: "action",
        x: MAIN_X, y: cy,
        label: "Exploit Attempt",
        subtitle: "Trying modules…",
        status: "active",
        data: {},
      });
      edges.push({ id: "e-vs-exp", source: lastId, target: "exploit-pending", type: "next" });
      lastId = "exploit-pending";
      cy += ROW_DY;
    } else {
      let lastSuccessId = lastId;
      const rowCount = Math.ceil(hostExploits.length / MAX_PER_ROW);

      for (let row = 0; row < rowCount; row++) {
        const rowExps = hostExploits.slice(row * MAX_PER_ROW, (row + 1) * MAX_PER_ROW);
        const totalRowW = rowExps.length * CARD_W + (rowExps.length - 1) * EXPLOIT_GAP;
        const rowStartX = Math.max(20, CENTER_X - totalRowW / 2);

        rowExps.forEach((exp: any, j: number) => {
          const expIdx = row * MAX_PER_ROW + j;
          const expId = `exploit-${expIdx}`;
          const modLabel = exp.module ? exp.module.split("/").pop() || exp.module : "Exploit";
          const expX = rowStartX + j * (CARD_W + EXPLOIT_GAP);
          const expStatus: NodeStatus = exp.success ? "completed" : "pending";

          nodes.push({
            id: expId, type: "action",
            x: expX, y: cy,
            label: modLabel,
            subtitle: exp.success
              ? `✓ Port ${exp.port} · ${exp.session_type || "shell"}`
              : `✗ Port ${exp.port} · failed`,
            status: expStatus,
            data: {
              module: exp.module,
              port: exp.port,
              success: exp.success,
              sessionOpened: exp.session_opened,
              sessionType: exp.session_type,
              output: exp.output?.slice(0, 120),
              tool: exp.module?.startsWith("exploit/") ? "metasploit" : (exp.module ? exp.module.split("/")[0] : "exploit"),
              mitre: "T1190 Exploit Public-Facing Application",
              os: hostOS,
            },
          });
          edges.push({
            id: `e-${lastSuccessId}-${expId}`,
            source: j === 0 ? lastSuccessId : `exploit-${expIdx - 1}`,
            target: expId,
            type: exp.success ? "exploit" : "next",
          });

          // Session node branching right from successful exploit
          if (exp.session_opened || exp.success) {
            const sessId = `session-${expIdx}`;
            const sessX = expX + CARD_W + 40;
            nodes.push({
              id: sessId, type: "session_node",
              x: sessX, y: cy,
              label: "Session",
              subtitle: exp.session_type || "meterpreter",
              status: "completed",
              data: { sessionId: exp.session_id, type: exp.session_type, host: hostIp },
            });
            edges.push({ id: `e-sess-${expIdx}`, source: expId, target: sessId, type: "exploit" });
          }

          if (exp.success) lastSuccessId = expId;
        });

        cy += ROW_DY;
      }

      lastId = lastSuccessId;
    }
  }

  // ── CREDENTIAL DUMP
  if (hasSession || isRunning) {
    const credCount = mc.credentials_count || 0;
    const credDone = hasSession && credCount > 0;
    const _credTool = credToolFor(hostOS);
    nodes.push({
      id: "creddump", type: "action",
      x: jitter(MAIN_X, "creddump", 8), y: cy,
      label: "Credential Dump",
      subtitle: credDone ? `${credCount} credential${credCount !== 1 ? "s" : ""} · ${_credTool}` : "Harvesting creds…",
      status: credDone ? "completed" : isRunning ? "active" : "pending",
      data: { credCount, tool: _credTool, mitre: mitreFor("creddump"), os: hostOS },
    });
    edges.push({ id: `e-${lastId}-creddump`, source: lastId, target: "creddump", type: "next" });
    lastId = "creddump";
    cy += ROW_DY;
  }

  // ── PRIVILEGE ESCALATION
  const hostSession = v2Sessions.find((s: any) => s.host_ip === hostIp);
  const hasPriv = hostSession && (hostSession.privilege_level || 0) >= 2;
  if (hasPriv || isRunning) {
    const privUser = hostSession?.username || "SYSTEM";
    const _privTool = privescToolFor(hostOS);
    nodes.push({
      id: "privesc", type: "action",
      x: jitter(MAIN_X, "privesc", 8), y: cy,
      label: "Privilege Escalation",
      subtitle: hasPriv ? `→ ${privUser}` : "Escalating…",
      status: hasPriv ? "completed" : isRunning ? "active" : "pending",
      data: { user: privUser, tool: _privTool, mitre: mitreFor("privesc"), os: hostOS },
    });
    edges.push({ id: `e-${lastId}-privesc`, source: lastId, target: "privesc", type: "next" });
    lastId = "privesc";
    cy += ROW_DY;
  }

  // ── DOMAIN ADMIN
  const hasDA = hostSession && (hostSession.privilege_level || 0) >= 3;
  if (hasDA) {
    const _postRootLabel = postRootLabelFor(hostOS);
    const _postTool = hostOS === "windows" ? "dcsync" : "root-shell";
    nodes.push({
      id: "domainadmin", type: "action",
      x: jitter(MAIN_X, "domainadmin", 8), y: cy,
      label: _postRootLabel,
      subtitle: hostSession?.username || (hostOS === "linux" ? "root" : "Administrator"),
      status: "completed",
      data: { user: hostSession?.username, tool: _postTool, mitre: mitreFor("domainadmin"), os: hostOS },
    });
    edges.push({ id: `e-${lastId}-da`, source: lastId, target: "domainadmin", type: "exploit" });
    cy += ROW_DY;
  }

  // ── LOOT CARDS from mission_context.loot (right-branch)
  const hostLoot: any[] = Array.isArray(mc.loot)
    ? mc.loot.filter((l: any) => !l.source_host || l.source_host === hostIp)
    : [];
  if (hostLoot.length > 0 && nodes.some((n) => n.id === "domainadmin" || n.id === "privesc")) {
    const lootAnchor = nodes.find((n) => n.id === "domainadmin") || nodes.find((n) => n.id === "privesc");
    if (lootAnchor) {
      hostLoot.slice(0, 4).forEach((l: any, i: number) => {
        const lid = `loot-${i}`;
        nodes.push({
          id: lid, type: "tool",
          x: RIGHT_X, y: lootAnchor.y + i * (MICRO_H + 10),
          label: l.loot_type === "flag" ? `🚩 ${l.description?.slice(0, 18) || "flag"}` : (l.description?.slice(0, 22) || "loot"),
          subtitle: l.content?.slice(0, 24) || l.file_path?.slice(0, 24) || "",
          status: "completed",
          data: { ...l, mitre: "T1005 Data from Local System" },
        });
        edges.push({ id: `e-loot-${i}`, source: lootAnchor.id, target: lid, type: "leads_to" });
      });
    }
  }

  const maxNodeX = Math.max(800, ...nodes.map((n) => n.x + (n.type === "tool" || n.type === "vuln" || n.type === "session_node" ? MICRO_W : CARD_W) + 20));
  const maxNodeY = cy + 100;

  return { nodes, edges, bounds: { minX: 0, minY: 0, maxX: maxNodeX, maxY: maxNodeY } };
}

// ─── Session Details Builder ─────────────────────────────────────────────────

function buildDetails(session: any): SessionDetails {
  const isRunning = !!(session.is_running || session.status === "running");
  const scanResults: any[] = session.scan_results || [];
  const exploits: any[] = session.exploit_results || [];
  const vulns: any[] = session.vulnerabilities || [];
  const mc: any = session.mission_context || {};
  const v2Sessions: any[] = Array.isArray(mc.active_sessions) ? mc.active_sessions : [];
  const sessionStart = session.created_at || 0;
  const elapsed = sessionStart ? Math.round(Date.now() / 1000 - sessionStart) : 0;

  const hostMap = new Map<string, any>();
  if (mc.hosts && typeof mc.hosts === "object") {
    for (const [ip, host] of Object.entries(mc.hosts)) {
      if (host && typeof host === "object" && !hostMap.has(ip)) hostMap.set(ip, host);
    }
  }
  for (const sr of scanResults) {
    for (const host of sr.hosts || []) {
      if (host && typeof host === "object" && host.ip && !hostMap.has(host.ip)) hostMap.set(host.ip, host);
    }
  }

  const hosts = [...hostMap.values()].filter(Boolean).map((h: any) => {
    const compromised = v2Sessions.some((s: any) => s.host_ip === h.ip) || exploits.some((e: any) => e.success && e.host_ip === h.ip);
    const sessionLevel = Math.max(0, ...v2Sessions.filter((s: any) => s.host_ip === h.ip).map((s: any) => s.privilege_level || 0));
    const openPorts = (h.ports || []).filter((p: any) => p.state === "open").length;
    const shellAccess = v2Sessions.some((s: any) => s.host_ip === h.ip && (s.privilege_level || 0) >= 1);
    return { ip: h.ip, os: h.os_type || h.os || "Unknown", compromised, sessionLevel, openPorts, shellAccess };
  });

  const openPortsMap = new Map<string, { num: number; service: string; version: string; host: string; state: string }>();
  for (const sr of scanResults) {
    for (const host of sr.hosts || []) {
      for (const p of host.ports || []) {
        const key = `${host.ip}:${p.number}`;
        if (!openPortsMap.has(key) && p.state === "open") {
          openPortsMap.set(key, {
            num: p.number,
            service: p.service || "unknown",
            version: p.version || "",
            host: host.ip,
            state: p.state,
          });
        }
      }
    }
  }
  const openPorts = [...openPortsMap.values()].sort((a, b) => a.num - b.num);

  const vulnerabilities = vulns.map((v: any) => ({
    title: v.title || v.cve || "Vulnerability",
    cvss: v.cvss_score || 0,
    host: v.host_ip || "",
    exploitType: v.exploit_type || "unknown",
  })).sort((a: any, b: any) => b.cvss - a.cvss);

  const recentExploits = exploits
    .filter((e: any) => e.host_ip)
    .sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0))
    .slice(0, 20)
    .map((e: any) => ({
      module: e.module ? e.module.split("/").pop() || e.module : "exploit",
      host: e.host_ip,
      port: e.port || 0,
      success: !!e.success,
      sessionOpened: !!e.session_opened,
      ml_success_prob: (e.ml_success_prob !== undefined && e.ml_success_prob !== null && Number(e.ml_success_prob) >= 0)
        ? Number(e.ml_success_prob)
        : undefined,
      ts: e.created_at || 0,
    }));

  return { isRunning, target: session.target || "", elapsedSeconds: elapsed, startTime: sessionStart, hosts, openPorts, vulnerabilities, recentExploits };
}

// ─── Legacy graph builder ────────────────────────────────────────────────────

function buildBundle(session: any, selectedHost?: string | null): SessionGraphBundle {
  const isRunning = !!(session.is_running || session.status === "running");
  const scanResults: any[] = session.scan_results || [];
  const vulns: any[] = session.vulnerabilities || [];
  const exploits: any[] = session.exploit_results || [];
  const mc: any = session.mission_context || {};

  const hostMap = new Map<string, any>();
  if (mc.hosts && typeof mc.hosts === "object") {
    for (const [ip, host] of Object.entries(mc.hosts)) {
      if (host && typeof host === "object" && !hostMap.has(ip)) hostMap.set(ip, host);
    }
  }
  for (const sr of scanResults) {
    for (const host of sr.hosts || []) {
      if (host && typeof host === "object" && host.ip && !hostMap.has(host.ip)) hostMap.set(host.ip, host);
    }
  }
  const allHosts = [...hostMap.values()].filter((h) => h && typeof h === "object");
  const portMap = new Map<number, string>();
  let lastScanTs = 0;
  for (const sr of scanResults) {
    if ((sr.created_at || 0) > lastScanTs) lastScanTs = sr.created_at;
    for (const host of sr.hosts || []) {
      for (const p of host.ports || []) {
        if (p.state === "open" && (!portMap.has(p.number) || portMap.get(p.number) === "unknown")) {
          portMap.set(p.number, p.service || "unknown");
        }
      }
    }
  }
  const topPorts = [...portMap.entries()].slice(0, 5).map(([num, service]) => ({ num, service }));
  const hasScanData = allHosts.length > 0 || portMap.size > 0;

  const subdomainCount = mc.subdomains?.length || 0;
  const hasSubdomains = subdomainCount > 0;

  const webPorts = [80, 443, 8080, 8443, 8000, 3000];
  const webHosts = allHosts.filter((h) => (h.ports || []).some((p: any) => webPorts.includes(p.number) && p.state === "open"));
  const webHost = webHosts[0] || null;
  const webExploit = exploits.find((e) => webPorts.includes(e.port) || matchMod(e.module || "", "sql", "web", "http", "lfi", "rfi", "xss", "php"));
  const hasWebData = webHosts.length > 0 || !!webExploit;
  const webCompleted = !!(webExploit?.success);
  const webPortEntry = webHost ? (webHost.ports || []).find((p: any) => webPorts.includes(p.number) && p.state === "open") : null;
  const webHighVuln = vulns.some((v) => (v.service?.toLowerCase().includes("http") || ["sqli", "rfi", "lfi", "xss"].includes((v.exploit_type || "").toLowerCase())) && v.cvss_score >= 7);

  const v2Sessions: any[] = mc.active_sessions || [];
  const v2Credentials = mc.credentials_count || 0;

  const sshExploit = exploits.find((e) => e.port === 22 || matchMod(e.module || "", "ssh_login", "ssh_brute", "ssh_enum", "/ssh/"));
  const sshHost = allHosts.find((h) => (h.ports || []).some((p: any) => p.number === 22 && p.state === "open"));
  const v2SSH = v2Sessions.some((s: any) => s.session_type === "ssh" || s.session_type === "shell");
  const hasSSH = !!(sshExploit?.success || sshHost || v2SSH);

  const credExploit = exploits.find((e) => matchMod(e.module || "", "cred", "dump", "mimikatz", "hashdump", "secretsdump", "lsass", "sam_dump"));
  const hasCredDump = !!(credExploit?.success || v2Credentials > 0);
  let credTotal = 0, credDA = 0, credLA = 0, credUsers = 0;
  if (credExploit?.success) {
    const out = credExploit.output || "";
    const daMatch = out.match(/domain\s+admin[s]?\s*[:\-]?\s*(\d+)/i);
    const laMatch = out.match(/local\s+admin[s]?\s*[:\-]?\s*(\d+)/i);
    credDA = daMatch ? parseInt(daMatch[1]) : 0;
    credLA = laMatch ? parseInt(laMatch[1]) : 0;
    const numMatch = out.match(/(\d+)\s+credential/i);
    credTotal = numMatch ? parseInt(numMatch[1]) : (credDA + credLA > 0 ? credDA + credLA + 10 : 1);
    credUsers = Math.max(0, credTotal - credDA - credLA);
  } else if (v2Credentials > 0) {
    credTotal = v2Credentials; credDA = Math.min(2, v2Credentials); credLA = Math.min(6, Math.max(0, v2Credentials - credDA)); credUsers = Math.max(0, v2Credentials - credDA - credLA);
  }

  const kerbExploit = exploits.find((e) => matchMod(e.module || "", "kerberoast", "kerberos", "spn", "rubeus", "getuserspn", "kerberoasting"));
  const kerbVuln = vulns.find((v) => matchMod(v.title || "", "kerberoast", "kerberos", "spn"));
  const hasKerberoast = !!(kerbExploit || kerbVuln);
  const kerbCrackable = (() => { if (!kerbExploit) return kerbVuln ? 1 : 0; const m = (kerbExploit.output || "").match(/(\d+)\s+(?:hash|ticket|account)/i); return m ? parseInt(m[1]) : 1; })();

  const bloodExploit = exploits.find((e) => matchMod(e.module || "", "bloodhound", "sharphound", "ad_path", "ldap_enum", "ldapdomaindump", "adidns"));
  const hasBloodhound = !!bloodExploit;

  const privescExploit = exploits.find((e) => matchMod(e.module || "", "privesc", "escalat", "token", "juicy", "printspoofer", "roguepotato", "local_exploit", "suggester", "sweetpotato", "godpotato", "suid"));
  const v2Privesc = v2Sessions.some((s: any) => (s.privilege_level || 0) >= 2);
  const hasPrivesc = !!(privescExploit?.success || v2Privesc);
  const privUser = privescExploit?.success ? (privescExploit.output?.match(/NT AUTHORITY\\\w+/)?.[0] || privescExploit.output?.match(/root/i)?.[0] || "SYSTEM") : v2Privesc ? (v2Sessions.find((s: any) => (s.privilege_level || 0) >= 2)?.username || "SYSTEM") : "—";
  const privRisk = hasPrivesc ? 85 : 0;

  const lateralExploits = exploits.filter((e) => matchMod(e.module || "", "lateral", "psexec", "wmi", "psremot", "smb_exec", "winrm", "at_command", "dcom"));
  const successLateral = lateralExploits.filter((e) => e.success);
  const v2Lateral = (mc.attack_graph?.edges || []).some((e: any) => e.edge_type === "lateral");
  const hasLateral = successLateral.length > 0 || v2Lateral;
  const lateralHosts = [...new Set(successLateral.map((e) => e.host_ip))];

  const daExploit = exploits.find((e) => { const m = (e.module || "").toLowerCase(); const o = (e.output || "").toLowerCase(); return m.includes("dcsync") || m.includes("golden_ticket") || m.includes("domain_admin") || o.includes("domain admin") || (e.success && o.includes("nt authority\\system")) || (e.success && o.includes("administrator")); });
  const v2DA = v2Sessions.some((s: any) => (s.privilege_level || 0) >= 3);
  const hasDomainAdmin = !!(daExploit?.success || v2DA);
  const hasAlert = hasDomainAdmin;

  const completed = [hasSubdomains, hasScanData, hasWebData || webCompleted, hasSSH, hasCredDump, hasKerberoast, hasBloodhound, hasPrivesc, hasLateral, hasDomainAdmin, hasAlert];
  const lastDone = completed.lastIndexOf(true);
  const nextActive = isRunning ? lastDone + 1 : -1;
  const st = (idx: number, done: boolean): NodeStatus => { if (done) return "completed"; if (idx === nextActive) return "active"; return "pending"; };
  const ets = (e: any) => relTime(e?.created_at || 0);
  const relCreated = session.created_at ? relTime(session.created_at) : "";

  const graph: AttackGraphData = {
    sessionId: session.id, isRunning, isDemoMode: false, target: session.target || "",
    subdomainDiscovery: { status: st(0, hasSubdomains), count: subdomainCount, time: hasSubdomains ? relCreated : "" },
    portScan: { status: st(1, hasScanData), openPorts: portMap.size, topPorts, hosts: allHosts.length, time: lastScanTs ? relTime(lastScanTs) : "" },
    webFoothold: { status: st(2, hasWebData || webCompleted), ip: webHost?.ip || "—", server: webPortEntry?.version || (webPortEntry ? `port ${webPortEntry.number}` : "—"), risk: hasWebData ? (webHighVuln ? "High" : "Low") : "—", time: ets(webExploit) },
    ssh: { status: st(3, hasSSH), userAtHost: sshExploit?.success ? `user@${sshExploit.host_ip}` : sshHost ? `user@${sshHost.ip}` : "—", time: ets(sshExploit) },
    credDump: { status: st(4, hasCredDump), total: credTotal, domainAdmins: credDA, localAdmins: credLA, users: credUsers, time: ets(credExploit) },
    kerberoast: { status: st(5, hasKerberoast), crackable: kerbCrackable, time: ets(kerbExploit) },
    bloodhound: { status: st(6, hasBloodhound), pathsFound: hasBloodhound ? 1 : 0, time: ets(bloodExploit) },
    privesc: { status: st(7, hasPrivesc), user: privUser, risk: privRisk, time: ets(privescExploit) },
    lateral: { status: st(8, hasLateral), hostCount: lateralHosts.length, time: successLateral[0] ? ets(successLateral[0]) : "" },
    domainAdmin: { status: st(9, hasDomainAdmin), user: daExploit?.success ? "corp.local\\Administrator" : "—", time: ets(daExploit) },
    alert: { status: st(10, hasAlert), score: hasAlert ? 92 : 0, target: (session.target || "—").split("/")[0].split(" ")[0], time: ets(daExploit) },
  };

  const maxCvss = vulns.reduce((acc: number, v: any) => Math.max(acc, v.cvss_score || 0), 0);
  const riskScore = maxCvss > 0 ? Math.round(maxCvss * 10) : hasDomainAdmin ? 92 : hasPrivesc ? 75 : hasSSH ? 50 : hasScanData ? 20 : 0;
  const riskLabel = riskScore >= 90 ? "Critical" : riskScore >= 70 ? "High" : riskScore >= 40 ? "Medium" : riskScore > 0 ? "Low" : "—";
  const cvssTimeline = vulns.slice().sort((a: any, b: any) => (a.created_at || 0) - (b.created_at || 0)).map((v: any) => Math.round((v.cvss_score || 0) * 10));
  const riskTrend = cvssTimeline.length >= 2 ? cvssTimeline.slice(-8) : [0, 0, 0, riskScore / 4, riskScore / 2, riskScore * 0.75, riskScore * 0.9, riskScore];
  // CVSS standard severity buckets so dashboard counts match the PDF/HTML report
  // (reporting/cvss.py): CRITICAL = 9.0-10.0, HIGH = 7.0-8.9. The old code counted
  // cvss>=7 as "critical", which merged HIGH into CRITICAL and disagreed with the
  // report (test16: dashboard said ~8-14 "critical", report said 3). Keep them
  // separate and aligned.
  const criticalFindings = vulns.filter((v: any) => (v.cvss_score || 0) >= 9.0).length;
  const highFindings = vulns.filter((v: any) => (v.cvss_score || 0) >= 7.0 && (v.cvss_score || 0) < 9.0).length;
  const compromisedHosts = new Set(exploits.filter((e: any) => e.success).map((e: any) => e.host_ip)).size;
  const successfulExploits = exploits.filter((e: any) => e.success).length;
  const openAttackPaths = new Set(exploits.filter((e: any) => e.session_opened).map((e: any) => e.host_ip)).size || (hasScanData ? 1 : 0);
  const webExpCount = exploits.filter((e: any) => webPorts.includes(e.port) || matchMod(e.module || "", "sql", "web", "http")).length;
  const credExpCount = exploits.filter((e: any) => matchMod(e.module || "", "cred", "dump", "mimikatz", "password", "brute")).length;
  const latExpCount = exploits.filter((e: any) => matchMod(e.module || "", "lateral", "psexec", "wmi", "smb_exec")).length;
  const privExpCount = exploits.filter((e: any) => matchMod(e.module || "", "privesc", "escalat", "token", "juicy")).length;
  const totalVec = webExpCount + credExpCount + latExpCount + privExpCount || 1;
  const attackVectors = [
    { label: "Web Exploitation", pct: Math.round((webExpCount / totalVec) * 100) },
    { label: "Credential Abuse", pct: Math.round((credExpCount / totalVec) * 100) },
    { label: "Lateral Movement", pct: Math.round((latExpCount / totalVec) * 100) },
    { label: "Privilege Escalation", pct: Math.round((privExpCount / totalVec) * 100) },
  ];
  const pathTrendRaw = exploits.filter((e: any) => e.success && e.created_at).sort((a: any, b: any) => a.created_at - b.created_at).map((_e: any, i: number, arr: any[]) => Math.round(((i + 1) / arr.length) * riskScore));
  const pathTrend = pathTrendRaw.length >= 2 ? pathTrendRaw.slice(-10) : [0, 5, 10, 15, 20, 30, 40, riskScore * 0.5, riskScore * 0.75, riskScore];

  const insights: InsightData = { riskScore, riskLabel: riskLabel as InsightData["riskLabel"], riskTrend, openAttackPaths, criticalFindings, highFindings, compromisedHosts, totalHosts: allHosts.length, totalVulns: vulns.length, successfulExploits, attackVectors, pathTrend };

  const sessionStart = session.created_at || 0;
  const elapsed = sessionStart ? Math.round(Date.now() / 1000 - sessionStart) : 0;
  const stepsConfig: { label: string; done: boolean; ts: number; count?: number }[] = [
    { label: "Recon", done: hasScanData, ts: lastScanTs },
    { label: "Port Scan", done: hasScanData, ts: lastScanTs, count: portMap.size },
    { label: "Web Foothold", done: hasWebData || webCompleted, ts: webExploit?.created_at || 0 },
    { label: "Cred Dump", done: hasCredDump, ts: credExploit?.created_at || 0 },
    { label: "Privilege Esc.", done: hasPrivesc, ts: privescExploit?.created_at || 0, count: privRisk },
    { label: "Lateral Move", done: hasLateral, ts: successLateral[0]?.created_at || 0, count: lateralHosts.length || undefined },
    { label: "Domain Admin", done: hasDomainAdmin, ts: daExploit?.created_at || 0 },
  ];
  const lastDoneIdx = stepsConfig.map((s) => s.done).lastIndexOf(true);
  const timelineSteps: TimelineStep[] = stepsConfig.map((s, i) => ({ label: s.label, time: s.done && s.ts ? fmtTime(s.ts) : "—", done: s.done, active: !s.done && i === lastDoneIdx + 1 && isRunning, count: s.count }));

  const timelineEvents: TimelineEvent[] = [];
  for (const e of exploits.filter((e: any) => e.created_at).sort((a: any, b: any) => a.created_at - b.created_at)) {
    let type: TimelineEvent["type"] = "exploit";
    let label = e.module ? e.module.split("/").pop() : "Exploit";
    if (e.success && e.session_opened) { type = "session"; label = `Session opened`; }
    timelineEvents.push({ time: fmtTime(e.created_at), label, detail: `${e.host_ip}:${e.port} ${e.module || ""}`, type });
  }
  for (const s of scanResults.filter((s: any) => s.created_at).sort((a: any, b: any) => a.created_at - b.created_at)) {
    timelineEvents.push({ time: fmtTime(s.created_at), label: "Port Scan", detail: s.target || session.target || "", type: "scan" });
  }

  const now = Date.now() / 1000;
  const timeline: TimelineData = { currentTime: fmtTime(now), sessionDate: fmtDate(sessionStart || now), steps: timelineSteps, events: timelineEvents };
  const topology = buildTopology(session);
  const attackPath = buildAttackPath(session, selectedHost || allHosts[0]?.ip || null);
  const details = buildDetails(session);

  const dynamicGraph: DynamicGraphData = {
    topology,
    attackPath,
    isRunning,
    target: session.target || "",
    selectedHost: selectedHost || allHosts[0]?.ip || null,
    isDemoMode: false,
    startTime: sessionStart,
    elapsedSeconds: elapsed,
  };

  return { graph, dynamicGraph, insights, timeline, details, sessionId: session.id };
}

// ─── Demo bundle ──────────────────────────────────────────────────────────────

const DEMO: SessionGraphBundle = {
  graph: {
    sessionId: null, isRunning: false, isDemoMode: true, target: "corp.local",
    subdomainDiscovery: { status: "completed", count: 142, time: "1m ago" },
    portScan: { status: "completed", openPorts: 26, topPorts: [{ num: 22, service: "SSH" }, { num: 80, service: "HTTP" }, { num: 443, service: "HTTPS" }, { num: 3389, service: "RDP" }, { num: 53, service: "DNS" }], hosts: 5, time: "2m ago" },
    webFoothold: { status: "completed", ip: "10.0.0.25", server: "IIS 10.0", risk: "Low", time: "4m ago" },
    ssh: { status: "completed", userAtHost: "user@10.0.0.25", time: "4m ago" },
    credDump: { status: "completed", total: 18, domainAdmins: 2, localAdmins: 6, users: 10, time: "6m ago" },
    kerberoast: { status: "completed", crackable: 3, time: "7m ago" },
    bloodhound: { status: "completed", pathsFound: 1, time: "6m ago" },
    privesc: { status: "completed", user: "NT AUTHORITY\\SYSTEM", risk: 85, time: "8m ago" },
    lateral: { status: "completed", hostCount: 4, time: "10m ago" },
    domainAdmin: { status: "completed", user: "corp.local\\Administrator", time: "11m ago" },
    alert: { status: "completed", score: 92, target: "corp.local", time: "11m ago" },
  },
  dynamicGraph: {
    topology: {
      nodes: [
        { id: "attacker", type: "attacker", x: 300, y: 30, label: "TIRPAN", subtitle: "corp.local", status: "completed" },
        { id: "host-10.0.0.10", type: "host", x: 40, y: 140, label: "10.0.0.10", subtitle: "Windows Server 2019", status: "completed", data: { compromised: true, sessionLevel: 1, openPorts: 3, vulnCount: 2, exploitCount: { total: 1, success: 1 } } },
        { id: "host-10.0.0.20", type: "host", x: 320, y: 140, label: "10.0.0.20", subtitle: "Ubuntu 22.04", status: "completed", data: { compromised: false, sessionLevel: 0, openPorts: 2, vulnCount: 1, exploitCount: { total: 1, success: 0 } } },
        { id: "host-10.0.0.30", type: "host", x: 40, y: 340, label: "10.0.0.30", subtitle: "Windows 10", status: "completed", data: { compromised: true, sessionLevel: 2, openPorts: 2, vulnCount: 3, exploitCount: { total: 2, success: 2 } } },
        { id: "host-10.0.0.50", type: "host", x: 320, y: 340, label: "10.0.0.50", subtitle: "Windows Server 2016", status: "completed", data: { compromised: true, sessionLevel: 3, openPorts: 3, vulnCount: 1, exploitCount: { total: 1, success: 1 } } },
      ],
      edges: [
        { id: "e-att-10.0.0.10", source: "attacker", target: "host-10.0.0.10", type: "scan" },
        { id: "e-att-10.0.0.20", source: "attacker", target: "host-10.0.0.20", type: "scan" },
        { id: "e-att-10.0.0.30", source: "attacker", target: "host-10.0.0.30", type: "scan" },
        { id: "e-att-10.0.0.50", source: "attacker", target: "host-10.0.0.50", type: "scan" },
        { id: "e-lat-0", source: "host-10.0.0.30", target: "host-10.0.0.50", type: "lateral" },
      ],
      bounds: { minX: 0, minY: 0, maxX: 620, maxY: 560 },
    },
    attackPath: {
      nodes: [
        { id: "start", type: "start", x: CENTER_X - 65, y: 40, label: "START", status: "completed" },
        { id: "attacker", type: "attacker", x: CENTER_X - 50, y: 120, label: "TIRPAN", subtitle: "10.0.0.10", status: "completed" },
        { id: "portscan", type: "action", x: MAIN_X, y: 260, label: "Port Scan", subtitle: "3 open ports · nmap", status: "completed", data: { tool: "nmap" } },
        { id: "port-0", type: "tool", x: RIGHT_X, y: 260, label: "80/http", subtitle: "IIS 10.0.17763", status: "completed" },
        { id: "port-1", type: "tool", x: RIGHT_X, y: 318, label: "443/https", subtitle: "TLS 1.2", status: "completed" },
        { id: "port-2", type: "tool", x: RIGHT_X, y: 376, label: "3389/rdp", subtitle: "Windows RDP", status: "completed" },
        { id: "searchsploit", type: "action", x: MAIN_X, y: 470, label: "Vulnerability Scan", subtitle: "2 vulns · searchsploit", status: "completed", data: { tool: "searchsploit" } },
        { id: "vuln-0", type: "vuln", x: RIGHT_X, y: 470, label: "CVE-2021-44228", subtitle: "CVSS 10.0 · rce", status: "completed" },
        { id: "vuln-1", type: "vuln", x: RIGHT_X, y: 528, label: "MS17-010", subtitle: "CVSS 9.3 · smb", status: "completed" },
        { id: "exploit-0", type: "action", x: MAIN_X, y: 680, label: "struts2_code_exec", subtitle: "✓ Port 80 · meterpreter", status: "completed", data: { tool: "metasploit", success: true } },
        { id: "session-0", type: "session_node", x: RIGHT_X, y: 680, label: "Session", subtitle: "meterpreter", status: "completed" },
        { id: "creddump", type: "action", x: MAIN_X, y: 890, label: "Credential Dump", subtitle: "18 credentials · mimikatz", status: "completed", data: { tool: "mimikatz" } },
      ],
      edges: [
        { id: "e-start-att", source: "start", target: "attacker", type: "next" },
        { id: "e-att-ps", source: "attacker", target: "portscan", type: "next" },
        { id: "e-ps-p0", source: "portscan", target: "port-0", type: "tool_call" },
        { id: "e-ps-p1", source: "portscan", target: "port-1", type: "tool_call" },
        { id: "e-ps-p2", source: "portscan", target: "port-2", type: "tool_call" },
        { id: "e-ps-vs", source: "portscan", target: "searchsploit", type: "next" },
        { id: "e-vs-v0", source: "searchsploit", target: "vuln-0", type: "leads_to" },
        { id: "e-vs-v1", source: "searchsploit", target: "vuln-1", type: "leads_to" },
        { id: "e-vs-exp", source: "searchsploit", target: "exploit-0", type: "next" },
        { id: "e-exp-sess", source: "exploit-0", target: "session-0", type: "exploit" },
        { id: "e-exp-cd", source: "exploit-0", target: "creddump", type: "next" },
      ],
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 1100 },
    },
    isRunning: false,
    target: "corp.local",
    selectedHost: "10.0.0.10",
    isDemoMode: true,
    startTime: Date.now() / 1000 - 660,
    elapsedSeconds: 660,
  },
  insights: {
    riskScore: 92, riskLabel: "Critical", riskTrend: [60, 65, 70, 68, 75, 80, 85, 92],
    openAttackPaths: 2, criticalFindings: 3, highFindings: 6, compromisedHosts: 4, totalHosts: 5, totalVulns: 14,
    successfulExploits: 7,
    attackVectors: [
      { label: "Web Exploitation", pct: 42 },
      { label: "Credential Abuse", pct: 28 },
      { label: "Lateral Movement", pct: 18 },
      { label: "Privilege Escalation", pct: 12 },
    ],
    pathTrend: [20, 35, 30, 50, 45, 70, 65, 85, 80, 92],
  },
  details: {
    isRunning: false,
    target: "corp.local",
    elapsedSeconds: 660,
    startTime: Date.now() / 1000 - 660,
    hosts: [
      { ip: "10.0.0.10", os: "Windows Server 2019", compromised: true, sessionLevel: 1, openPorts: 3, shellAccess: true },
      { ip: "10.0.0.20", os: "Ubuntu 22.04", compromised: false, sessionLevel: 0, openPorts: 2, shellAccess: false },
      { ip: "10.0.0.30", os: "Windows 10", compromised: true, sessionLevel: 2, openPorts: 2, shellAccess: true },
      { ip: "10.0.0.50", os: "Windows Server 2016", compromised: true, sessionLevel: 3, openPorts: 3, shellAccess: true },
    ],
    openPorts: [
      { num: 22, service: "ssh", version: "OpenSSH 8.9", host: "10.0.0.20", state: "open" },
      { num: 80, service: "http", version: "IIS 10.0.17763", host: "10.0.0.10", state: "open" },
      { num: 88, service: "kerberos", version: "", host: "10.0.0.50", state: "open" },
      { num: 389, service: "ldap", version: "AD LDAP", host: "10.0.0.50", state: "open" },
      { num: 443, service: "https", version: "TLS 1.2", host: "10.0.0.10", state: "open" },
      { num: 445, service: "smb", version: "Windows SMB", host: "10.0.0.30", state: "open" },
      { num: 3389, service: "rdp", version: "MS RDP", host: "10.0.0.10", state: "open" },
      { num: 8080, service: "http-alt", version: "Tomcat 9.0", host: "10.0.0.20", state: "open" },
    ],
    vulnerabilities: [
      { title: "CVE-2021-44228", cvss: 10.0, host: "10.0.0.10", exploitType: "rce" },
      { title: "MS17-010 EternalBlue", cvss: 9.3, host: "10.0.0.30", exploitType: "smb" },
      { title: "CVE-2020-1472 Zerologon", cvss: 10.0, host: "10.0.0.50", exploitType: "privesc" },
      { title: "Weak SSH Password", cvss: 7.5, host: "10.0.0.20", exploitType: "brute" },
    ],
    recentExploits: [
      { module: "struts2_code_exec", host: "10.0.0.10", port: 80, success: true, sessionOpened: true, ts: Date.now() / 1000 - 400 },
      { module: "ms17_010_eternalblue", host: "10.0.0.30", port: 445, success: true, sessionOpened: true, ts: Date.now() / 1000 - 300 },
      { module: "ssh_login", host: "10.0.0.20", port: 22, success: false, sessionOpened: false, ts: Date.now() / 1000 - 250 },
      { module: "psexec", host: "10.0.0.50", port: 445, success: true, sessionOpened: true, ts: Date.now() / 1000 - 200 },
    ],
  },
  timeline: {
    currentTime: fmtTime(Date.now() / 1000), sessionDate: fmtDate(Date.now() / 1000),
    steps: [
      { label: "Recon", time: "13:55", done: true, active: false },
      { label: "Port Scan", time: "13:57", done: true, active: false, count: 26 },
      { label: "Web Foothold", time: "13:59", done: true, active: false },
      { label: "Cred Dump", time: "14:01", done: true, active: false },
      { label: "Privilege Esc.", time: "14:05", done: true, active: false, count: 85 },
      { label: "Lateral Move", time: "14:07", done: true, active: false, count: 4 },
      { label: "Domain Admin", time: "14:11", done: true, active: false },
    ],
    events: [
      { time: "13:57", label: "Port Scan", detail: "192.168.10.0/24", type: "scan" },
      { time: "13:59", label: "struts2_code_exec", detail: "10.0.0.10:80", type: "exploit" },
      { time: "14:01", label: "Session opened", detail: "10.0.0.10 meterpreter", type: "session" },
    ],
  },
  sessionId: null,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

function pickBestSession(sessions: any[]): any | null {
  if (!sessions.length) return null;
  // 1. Running session first
  const running = sessions.find((s) => s.is_running || s.status === "running");
  if (running) return running;
  // 2. Session with most data (exploits + vulns + scan_results)
  const scored = sessions.map((s) => ({
    s,
    score:
      (s.exploit_results?.length || s.exploits_run || 0) * 3 +
      (s.vulnerabilities?.length || s.vulns_found || 0) * 2 +
      (s.scan_results?.length || 0),
  }));
  scored.sort((a, b) => b.score - a.score || (b.s.created_at || 0) - (a.s.created_at || 0));
  return scored[0]?.s || null;
}

export function useSessionBundle(selectedHost?: string | null, sessionIdOverride?: string | null): SessionGraphBundle {
  const demoMode = isDemoMode();

  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: demoMode ? 2000 : 5000,
  });

  const target = sessionIdOverride
    ? ((sessions as any[]).find((s: any) => s.id === sessionIdOverride) || null)
    : pickBestSession(sessions as any[]);

  const isRunningTarget = target?.is_running || target?.status === "running";

  const { data: detail } = useQuery({
    queryKey: ["session-detail", target?.id],
    queryFn: () => getSession(target!.id),
    enabled: !!target?.id,
    refetchInterval: isRunningTarget ? (demoMode ? 1500 : 4000) : false,
  });

  if (!detail) return DEMO;
  if (demoMode) return buildBundle(detail, selectedHost);
  return buildBundle(detail, selectedHost);
}

export function useSessionEvents(sid: string | null) {
  return useQuery({
    queryKey: ["session-events", sid],
    queryFn: () => getSessionEvents(sid!, 500),
    enabled: !!sid,
    refetchInterval: 5000,
  });
}

export function useAttackGraphData(): AttackGraphData {
  return useSessionBundle().graph;
}
