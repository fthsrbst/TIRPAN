import { useRef, useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSessions, getSession } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface NetNode {
  id: string;
  type: "attacker" | "host";
  label: string;
  sublabel: string;
  x: number;
  y: number;
  exploited: boolean;
  sessionOpened: boolean;
  portCount: number;
  exploitCount: number;
  failedCount: number;
}

interface NetEdge {
  id: string;
  from: string;
  to: string;
  kind: "scan" | "success" | "failed" | "lateral";
  module?: string;
}

interface NetworkGraph {
  nodes: NetNode[];
  edges: NetEdge[];
  isRunning: boolean;
  isDemoMode: boolean;
  target: string;
}

// ─── Layout constants ────────────────────────────────────────────────────────

const CX = 480;
const TIRPAN_Y = 80;
const HOST_ROW_Y = 300;
const ROW_SPACING = 200;
const MAX_PER_ROW = 6;
const HOST_COL_SPACING = 145;

function placeHosts(hosts: Omit<NetNode, "x" | "y">[]): NetNode[] {
  return hosts.map((h, i) => {
    const row = Math.floor(i / MAX_PER_ROW);
    const col = i % MAX_PER_ROW;
    const inRow = Math.min(hosts.length - row * MAX_PER_ROW, MAX_PER_ROW);
    const rowStartX = CX - ((inRow - 1) * HOST_COL_SPACING) / 2;
    return { ...h, x: rowStartX + col * HOST_COL_SPACING, y: HOST_ROW_Y + row * ROW_SPACING };
  });
}

// ─── Data builder ────────────────────────────────────────────────────────────

function buildNetwork(session: any): NetworkGraph {
  const scanResults: any[] = session.scan_results || [];
  const exploits: any[] = session.exploit_results || [];
  const isRunning = !!(session.is_running || session.status === "running");

  // Build host index
  const hostIndex = new Map<string, { ip: string; os: string; portCount: number; exploited: boolean; sessionOpened: boolean; exploitCount: number; failedCount: number }>();

  for (const sr of scanResults) {
    for (const host of sr.hosts || []) {
      const existing = hostIndex.get(host.ip);
      const ports = (host.ports || []).filter((p: any) => p.state === "open");
      if (!existing) {
        hostIndex.set(host.ip, { ip: host.ip, os: host.os || "", portCount: ports.length, exploited: false, sessionOpened: false, exploitCount: 0, failedCount: 0 });
      } else if (ports.length > existing.portCount) {
        existing.portCount = ports.length;
      }
    }
  }

  // Add hosts that only appear in exploit results
  for (const e of exploits) {
    if (e.host_ip && !hostIndex.has(e.host_ip)) {
      hostIndex.set(e.host_ip, { ip: e.host_ip, os: "", portCount: 0, exploited: false, sessionOpened: false, exploitCount: 0, failedCount: 0 });
    }
    const h = hostIndex.get(e.host_ip);
    if (h) {
      if (e.success) { h.exploited = true; h.exploitCount++; }
      else h.failedCount++;
      if (e.session_opened) h.sessionOpened = true;
    }
  }

  const hostList = [...hostIndex.values()];
  const hostNodes = placeHosts(
    hostList.map((h) => ({
      id: h.ip,
      type: "host" as const,
      label: h.ip,
      sublabel: h.os ? h.os.split(" ").slice(0, 2).join(" ") : `${h.portCount} open port${h.portCount !== 1 ? "s" : ""}`,
      exploited: h.exploited,
      sessionOpened: h.sessionOpened,
      portCount: h.portCount,
      exploitCount: h.exploitCount,
      failedCount: h.failedCount,
    }))
  );

  const nodes: NetNode[] = [
    {
      id: "tirpan",
      type: "attacker",
      label: "TIRPAN",
      sublabel: session.target || "Attacker",
      x: CX,
      y: TIRPAN_Y,
      exploited: false,
      sessionOpened: false,
      portCount: 0,
      exploitCount: 0,
      failedCount: 0,
    },
    ...hostNodes,
  ];

  const nodeSet = new Set(nodes.map((n) => n.id));

  // Scan edges (TIRPAN → every host)
  const edges: NetEdge[] = hostNodes.map((h) => ({
    id: `scan-${h.id}`,
    from: "tirpan",
    to: h.id,
    kind: "scan" as const,
  }));

  // Exploit edges (deduplicated per host)
  const exploitKeys = new Set<string>();
  for (const e of exploits) {
    if (!e.host_ip || !nodeSet.has(e.host_ip)) continue;
    const fromId = e.source_ip && e.source_ip !== e.host_ip && nodeSet.has(e.source_ip) ? e.source_ip : "tirpan";
    const key = `${fromId}-${e.host_ip}-${e.success ? "ok" : "fail"}`;
    if (exploitKeys.has(key)) continue;
    exploitKeys.add(key);
    edges.push({
      id: `exp-${e.host_ip}-${e.created_at}`,
      from: fromId,
      to: e.host_ip,
      kind: fromId !== "tirpan" ? "lateral" : e.success ? "success" : "failed",
      module: e.module,
    });
  }

  return { nodes, edges, isRunning, isDemoMode: false, target: session.target || "" };
}

// ─── Demo graph ───────────────────────────────────────────────────────────────

const DEMO_SESSION = {
  target: "corp.local",
  is_running: false,
  scan_results: [{ hosts: [
    { ip: "10.0.0.10", os: "Windows Server 2019", ports: [{ number: 80, state: "open" }, { number: 443, state: "open" }, { number: 3389, state: "open" }] },
    { ip: "10.0.0.20", os: "Ubuntu 22.04", ports: [{ number: 22, state: "open" }, { number: 8080, state: "open" }] },
    { ip: "10.0.0.30", os: "Windows 10", ports: [{ number: 445, state: "open" }, { number: 3389, state: "open" }] },
    { ip: "10.0.0.40", os: "CentOS 7", ports: [{ number: 22, state: "open" }, { number: 3306, state: "open" }] },
    { ip: "10.0.0.50", os: "Windows Server 2016", ports: [{ number: 445, state: "open" }, { number: 88, state: "open" }, { number: 389, state: "open" }] },
  ]}],
  exploit_results: [
    { host_ip: "10.0.0.10", module: "exploit/multi/http/struts2_code_exec", port: 80, success: true, session_opened: true, created_at: 1 },
    { host_ip: "10.0.0.20", module: "auxiliary/scanner/ssh/ssh_login", port: 22, success: true, session_opened: false, created_at: 2 },
    { host_ip: "10.0.0.30", module: "exploit/windows/smb/ms17_010_eternalblue", port: 445, success: true, session_opened: true, source_ip: "10.0.0.10", created_at: 3 },
    { host_ip: "10.0.0.40", module: "exploit/linux/mysql/mysql_yassl_getname", port: 3306, success: false, session_opened: false, created_at: 4 },
    { host_ip: "10.0.0.50", module: "exploit/windows/smb/psexec", port: 445, success: true, session_opened: true, source_ip: "10.0.0.30", created_at: 5 },
  ],
};

// ─── SVG helpers ─────────────────────────────────────────────────────────────

function curved(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Add slight horizontal bow for non-scan edges
  const cx = mx + dy * 0.25;
  const cy = my - dx * 0.1;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

const EDGE_COLORS = {
  scan:    "hsl(var(--muted-foreground) / 0.3)",
  success: "hsl(var(--accent))",
  failed:  "hsl(var(--destructive) / 0.6)",
  lateral: "hsl(48 96% 53% / 0.8)",
};

const EDGE_WIDTHS = {
  scan: 1,
  success: 2,
  failed: 1.5,
  lateral: 2.5,
};

// ─── Node rendering ───────────────────────────────────────────────────────────

const NODE_R = 38;
const ATTACKER_W = 100;
const ATTACKER_H = 44;

function AttackerNode({ node, isRunning }: { node: NetNode; isRunning: boolean }) {
  const rx = node.x - ATTACKER_W / 2;
  const ry = node.y - ATTACKER_H / 2;
  return (
    <g>
      <rect
        x={rx} y={ry}
        width={ATTACKER_W} height={ATTACKER_H}
        rx={8}
        fill="hsl(var(--primary))"
        stroke="hsl(var(--accent))"
        strokeWidth="1.5"
      />
      {isRunning && (
        <rect
          x={rx - 2} y={ry - 2}
          width={ATTACKER_W + 4} height={ATTACKER_H + 4}
          rx={10}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="1"
          opacity="0.4"
        >
          <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
        </rect>
      )}
      <text x={node.x} y={node.y - 4} textAnchor="middle" fill="hsl(var(--primary-foreground))" fontSize="12" fontWeight="700" fontFamily="monospace">
        {node.label}
      </text>
      <text x={node.x} y={node.y + 10} textAnchor="middle" fill="hsl(var(--primary-foreground) / 0.6)" fontSize="9" fontFamily="monospace">
        {node.sublabel.length > 18 ? node.sublabel.slice(0, 18) + "…" : node.sublabel}
      </text>
    </g>
  );
}

function HostNode({ node, isRunning }: { node: NetNode; isRunning: boolean }) {
  const fillColor = node.sessionOpened
    ? "hsl(var(--accent) / 0.25)"
    : node.exploited
    ? "hsl(var(--accent) / 0.12)"
    : "hsl(var(--card))";

  const strokeColor = node.sessionOpened
    ? "hsl(var(--accent))"
    : node.exploited
    ? "hsl(var(--accent) / 0.6)"
    : node.failedCount > 0
    ? "hsl(var(--destructive) / 0.5)"
    : "hsl(var(--border))";

  return (
    <g>
      <circle
        cx={node.x} cy={node.y}
        r={NODE_R}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={node.sessionOpened ? 2 : 1.5}
      />
      {node.sessionOpened && isRunning && (
        <circle
          cx={node.x} cy={node.y}
          r={NODE_R + 4}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth="1"
          opacity="0.3"
        >
          <animate attributeName="r" values={`${NODE_R + 2};${NODE_R + 10};${NODE_R + 2}`} dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2.5s" repeatCount="indefinite" />
        </circle>
      )}
      {/* IP address */}
      <text x={node.x} y={node.y - 4} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="10" fontWeight="600" fontFamily="monospace">
        {node.label}
      </text>
      {/* sublabel */}
      <text x={node.x} y={node.y + 9} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="8" fontFamily="monospace">
        {node.sublabel.length > 18 ? node.sublabel.slice(0, 18) + "…" : node.sublabel}
      </text>
      {/* Session badge */}
      {node.sessionOpened && (
        <g transform={`translate(${node.x + NODE_R - 10}, ${node.y - NODE_R + 10})`}>
          <circle r="8" fill="hsl(var(--accent))" />
          <text textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--accent-foreground))" fontSize="8" fontWeight="700">S</text>
        </g>
      )}
      {/* Exploit count badge */}
      {node.exploitCount > 0 && !node.sessionOpened && (
        <g transform={`translate(${node.x + NODE_R - 10}, ${node.y - NODE_R + 10})`}>
          <circle r="8" fill="hsl(var(--accent) / 0.7)" />
          <text textAnchor="middle" dominantBaseline="middle" fill="hsl(var(--accent-foreground))" fontSize="8" fontWeight="700">
            {node.exploitCount > 9 ? "9+" : node.exploitCount}
          </text>
        </g>
      )}
      {/* Failed-only badge */}
      {node.exploitCount === 0 && node.failedCount > 0 && (
        <g transform={`translate(${node.x + NODE_R - 10}, ${node.y - NODE_R + 10})`}>
          <circle r="8" fill="hsl(var(--destructive) / 0.7)" />
          <text textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="9" fontWeight="700">✕</text>
        </g>
      )}
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const DynamicAttackGraph = ({ onOpenHistory }: { onOpenHistory?: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 960, h: 600 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, vx: 0, vy: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: NetNode } | null>(null);

  // Sync viewBox size to container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setViewBox((v) => ({ ...v, w: width, h: height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Data ──
  const { data: sessions = [] } = useQuery<any[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });
  const target = (sessions as any[]).find((s) => s.is_running || s.status === "running") || (sessions as any[])[0] || null;
  const { data: detail } = useQuery({
    queryKey: ["session-detail", target?.id],
    queryFn: () => getSession(target!.id),
    enabled: !!target?.id,
    refetchInterval: target?.is_running ? 4000 : false,
  });

  const net: NetworkGraph = detail ? buildNetwork(detail) : buildNetwork(DEMO_SESSION);

  const nodeMap = new Map(net.nodes.map((n) => [n.id, n]));

  // ── Pan/Zoom ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    setViewBox((v) => {
      const nw = Math.max(400, Math.min(2000, v.w * factor));
      const nh = Math.max(300, Math.min(1500, v.h * factor));
      const dx = (v.w - nw) / 2;
      const dy = (v.h - nh) / 2;
      return { x: v.x + dx, y: v.y + dy, w: nw, h: nh };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y });
  }, [viewBox]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const ratio = viewBox.w / (containerRef.current?.clientWidth || viewBox.w);
    const dx = (e.clientX - dragStart.x) * ratio;
    const dy = (e.clientY - dragStart.y) * ratio;
    setViewBox((v) => ({ ...v, x: dragStart.vx - dx, y: dragStart.vy - dy }));
  }, [dragging, dragStart, viewBox.w]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      {/* Status badge */}
      {net.isDemoMode ? (
        <div className="absolute top-3 right-3 z-10 text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded-full">demo</div>
      ) : net.isRunning ? (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[10px] font-mono bg-accent/10 text-accent px-2 py-0.5 rounded-full border border-accent/30">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          live · {net.target}
        </div>
      ) : (
        <div className="absolute top-3 right-3 z-10 text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded-full">
          {net.target}
        </div>
      )}

      {/* History button */}
      {onOpenHistory && (
        <button
          onClick={onOpenHistory}
          className="absolute top-3 left-3 z-10 flex items-center gap-1.5 text-[10px] font-mono bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 rounded-full border border-border/50 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 12h18M3 6h18M3 18h12" strokeLinecap="round" />
          </svg>
          Agent History
        </button>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[9px] font-mono text-muted-foreground bg-card/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-border/30">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.scan }} />Scan</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.success }} />Exploit</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.lateral }} />Lateral</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.failed }} />Failed</span>
      </div>

      <svg
        width="100%"
        height="100%"
        viewBox={vbStr}
        style={{ display: "block" }}
      >
        <defs>
          <marker id="arr-success" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--accent))" />
          </marker>
          <marker id="arr-failed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--destructive) / 0.6)" />
          </marker>
          <marker id="arr-lateral" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(48 96% 53% / 0.8)" />
          </marker>
          <marker id="arr-scan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground) / 0.3)" />
          </marker>
        </defs>

        {/* Edges */}
        {net.edges.map((edge) => {
          const from = nodeMap.get(edge.from);
          const to = nodeMap.get(edge.to);
          if (!from || !to) return null;

          // Adjust start/end points to node borders
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const fromR = from.type === "attacker" ? ATTACKER_H / 2 : NODE_R;
          const toR = to.type === "attacker" ? ATTACKER_H / 2 : NODE_R + 2;
          const x1 = from.x + (dx / len) * fromR;
          const y1 = from.y + (dy / len) * fromR;
          const x2 = to.x - (dx / len) * toR;
          const y2 = to.y - (dy / len) * toR;

          const isScan = edge.kind === "scan";
          return (
            <path
              key={edge.id}
              d={isScan ? `M ${x1} ${y1} L ${x2} ${y2}` : curved(x1, y1, x2, y2)}
              fill="none"
              stroke={EDGE_COLORS[edge.kind]}
              strokeWidth={EDGE_WIDTHS[edge.kind]}
              strokeDasharray={isScan ? "4 5" : undefined}
              markerEnd={`url(#arr-${edge.kind})`}
              opacity={isScan ? 0.6 : 1}
            />
          );
        })}

        {/* Nodes */}
        {net.nodes.map((node) =>
          node.type === "attacker" ? (
            <g
              key={node.id}
              onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, node })}
              onMouseLeave={() => setTooltip(null)}
            >
              <AttackerNode node={node} isRunning={net.isRunning} />
            </g>
          ) : (
            <g
              key={node.id}
              onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, node })}
              onMouseLeave={() => setTooltip(null)}
            >
              <HostNode node={node} isRunning={net.isRunning} />
            </g>
          )
        )}

        {/* Empty state */}
        {net.nodes.length <= 1 && (
          <g>
            <text x={CX} y={HOST_ROW_Y - 30} textAnchor="middle" fill="hsl(var(--muted-foreground) / 0.3)" fontSize="13" fontFamily="monospace" fontWeight="700">TIRPAN</text>
            <text x={CX} y={HOST_ROW_Y - 10} textAnchor="middle" fill="hsl(var(--muted-foreground) / 0.2)" fontSize="10" fontFamily="monospace">Waiting for scan results…</text>
            <text x={CX} y={HOST_ROW_Y + 10} textAnchor="middle" fill="hsl(var(--muted-foreground) / 0.15)" fontSize="9" fontFamily="monospace">Start a mission to see the attack graph</text>
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-card border border-border/60 rounded-lg shadow-lg px-3 py-2 text-[11px] font-mono min-w-[160px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.node.type === "attacker" ? (
            <>
              <div className="font-bold text-accent mb-1">TIRPAN Attacker</div>
              <div className="text-muted-foreground">{tooltip.node.sublabel}</div>
            </>
          ) : (
            <>
              <div className="font-bold text-foreground mb-1">{tooltip.node.label}</div>
              {tooltip.node.sublabel && <div className="text-muted-foreground mb-1">{tooltip.node.sublabel}</div>}
              <div className="flex gap-3 mt-1.5">
                <span className="text-accent">{tooltip.node.exploitCount} success</span>
                {tooltip.node.failedCount > 0 && <span className="text-destructive">{tooltip.node.failedCount} failed</span>}
                {tooltip.node.sessionOpened && <span className="text-accent font-bold">● Session</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
