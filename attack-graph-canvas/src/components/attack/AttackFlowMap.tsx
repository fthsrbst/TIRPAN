import { useRef, useState, useCallback, useEffect } from "react";
import type { SessionDetails } from "@/hooks/useAttackGraphData";
import { Zap, ArrowRightLeft } from "lucide-react";

interface AttackFlowMapProps {
  details: SessionDetails;
  topology?: any;
  onSelectHost?: (hostIp: string) => void;
}

interface FlowNode {
  id: string;
  label: string;
  os: string;
  sessionLevel: number;
  activities: string[];
  entryMethod?: string;
  entryPort?: number;
  isAttacker?: boolean;
  isDomainAdmin?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FlowEdge {
  from: string;
  to: string;
  method: string;
  port?: number;
  isLateral: boolean;
}

const NODE_W = 180;
const BASE_NODE_H = 108;
const ATTACKER_W = 140;
const ATTACKER_H = 54;
const COL_GAP = 120;
const ROW_GAP = 72;
const TOP_PAD = 40;

function buildFlow(
  details: SessionDetails,
  topology?: any
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  nodes.push({
    id: "tirpan",
    label: "TIRPAN",
    os: details.target || "Attacker",
    sessionLevel: 0,
    activities: [],
    isAttacker: true,
    x: 0, y: 0, w: ATTACKER_W, h: ATTACKER_H,
  });

  const firstExploit = new Map<string, typeof details.recentExploits[0]>();
  for (const exp of [...details.recentExploits].reverse()) {
    if (!exp.success) continue;
    if (!firstExploit.has(exp.host)) firstExploit.set(exp.host, exp);
  }

  const topoEdges: { from: string; to: string; label: string }[] = [];
  if (topology?.edges) {
    for (const e of topology.edges) {
      if (e.type === "lateral") {
        topoEdges.push({
          from: e.source.replace("host-", ""),
          to: e.target.replace("host-", ""),
          label: e.label || "lateral",
        });
      }
    }
  }

  const compromised = details.hosts
    .filter((h) => h.compromised)
    .sort((a, b) => b.sessionLevel - a.sessionLevel);

  for (const host of compromised) {
    const hostExploits = details.recentExploits.filter((e) => e.host === host.ip && e.success);
    const activities: string[] = [];
    if (hostExploits.length > 0)
      activities.push(`${hostExploits.length} exploit${hostExploits.length > 1 ? "s" : ""}`);
    if (host.sessionLevel >= 1) activities.push("shell");
    if (host.sessionLevel >= 2) activities.push("privesc");
    if (host.sessionLevel >= 3) activities.push("domain admin");
    const credExploit = details.recentExploits.find(
      (e) => e.host === host.ip && e.module.toLowerCase().includes("mim")
    );
    if (credExploit || details.vulnerabilities.some((v) => v.host === host.ip))
      activities.push("cred dump");

    const entry = firstExploit.get(host.ip);
    const uniq = [...new Set(activities)];
    const badgeRows = Math.max(0, Math.ceil(uniq.length / 3) - 1);
    const nodeH = BASE_NODE_H + badgeRows * 20;

    nodes.push({
      id: host.ip,
      label: host.ip,
      os: host.os,
      sessionLevel: host.sessionLevel,
      activities: uniq,
      entryMethod: entry?.module,
      entryPort: entry?.port,
      isDomainAdmin: host.sessionLevel >= 3,
      x: 0, y: 0, w: NODE_W, h: nodeH,
    });
  }

  for (const host of compromised) {
    const isLateralTarget = topoEdges.some((e) => e.to === host.ip);
    if (!isLateralTarget) {
      const entry = firstExploit.get(host.ip);
      edges.push({
        from: "tirpan",
        to: host.ip,
        method: entry?.module || "exploit",
        port: entry?.port,
        isLateral: false,
      });
    }
  }

  for (const te of topoEdges) {
    edges.push({ from: te.from, to: te.to, method: te.label, isLateral: true });
  }

  // ── Column layout: build chains starting from direct children of tirpan
  const visited = new Set<string>();

  function buildChain(startId: string): string[] {
    const chain = [startId];
    visited.add(startId);
    for (const e of edges.filter((e) => e.from === startId && e.isLateral)) {
      if (!visited.has(e.to)) chain.push(...buildChain(e.to));
    }
    return chain;
  }

  const directChildren = edges.filter((e) => e.from === "tirpan").map((e) => e.to);
  const columns: string[][] = [];
  for (const child of directChildren) {
    if (!visited.has(child)) columns.push(buildChain(child));
  }

  const totalCols = columns.length;
  const totalW = Math.max(ATTACKER_W, totalCols * NODE_W + Math.max(0, totalCols - 1) * COL_GAP);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const tirpan = nodeMap.get("tirpan")!;
  tirpan.x = totalW / 2 - ATTACKER_W / 2;
  tirpan.y = TOP_PAD;

  const colStartY = TOP_PAD + ATTACKER_H + ROW_GAP + 20;
  columns.forEach((chain, ci) => {
    const colX = ci * (NODE_W + COL_GAP);
    let rowY = colStartY;
    for (const hostId of chain) {
      const n = nodeMap.get(hostId);
      if (n) {
        n.x = colX;
        n.y = rowY;
        rowY += n.h + ROW_GAP + 20;
      }
    }
  });

  return { nodes, edges };
}

function ActivityBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    shell: "bg-accent/15 text-accent border-accent/30",
    privesc: "bg-warning/15 text-warning border-warning/30",
    "cred dump": "bg-primary/15 text-primary border-primary/30",
    "domain admin": "bg-destructive/15 text-destructive border-destructive/30",
  };
  const cls = map[label] || "bg-muted text-muted-foreground border-border/30";
  return (
    <span className={`text-[8px] font-mono border px-1.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function SessionBadge({ level }: { level: number }) {
  if (level === 0) return null;
  const cfg =
    level >= 3
      ? { label: "DA", cls: "bg-destructive text-white" }
      : level >= 2
      ? { label: "S2", cls: "bg-warning text-warning-foreground" }
      : { label: "S1", cls: "bg-accent text-accent-foreground" };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── SVG arrows ───────────────────────────────────────────────────────────────

function FlowArrows({
  edges,
  nodeMap,
}: {
  edges: FlowEdge[];
  nodeMap: Map<string, FlowNode>;
}) {
  return (
    <>
      {edges.map((edge, i) => {
        const src = nodeMap.get(edge.from);
        const tgt = nodeMap.get(edge.to);
        if (!src || !tgt) return null;

        const x1 = src.x + src.w / 2;
        const y1 = src.y + src.h;
        const x2 = tgt.x + tgt.w / 2;
        const y2 = tgt.y;
        const midY = y1 + (y2 - y1) * 0.45;
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        const color = edge.isLateral ? "#eab308" : "hsl(var(--accent))";
        const markerId = `arr-flow-${i}`;
        const lx = (x1 + x2) / 2;
        const ly = y1 + (y2 - y1) * 0.5 - 12;
        const methodLabel = (edge.method.split("/").pop() || edge.method).slice(0, 16);

        return (
          <g key={i}>
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            </defs>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={edge.isLateral ? 2 : 1.5}
              strokeDasharray={edge.isLateral ? "6 3" : undefined}
              opacity={0.9}
              markerEnd={`url(#${markerId})`}
            />
            {/* Label pill */}
            <rect
              x={lx - 46}
              y={ly - 1}
              width={92}
              height={18}
              rx={9}
              fill={edge.isLateral ? "hsl(var(--background) / 0.85)" : "hsl(var(--background) / 0.85)"}
              stroke={color}
              strokeWidth={0.8}
              opacity={0.95}
            />
            <text
              x={lx}
              y={ly + 11}
              textAnchor="middle"
              fill={color}
              fontSize="8"
              fontFamily="monospace"
              opacity={1}
            >
              {edge.isLateral ? "↔ " : "⚡ "}
              {methodLabel}
              {edge.port ? `:${edge.port}` : ""}
            </text>
          </g>
        );
      })}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AttackFlowMap({ details, topology, onSelectHost }: AttackFlowMapProps) {
  const { nodes, edges } = buildFlow(details, topology);
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 40, y: 20, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const maxX = Math.max(600, ...nodes.map((n) => n.x + n.w + 20));
  const maxY = Math.max(400, ...nodes.map((n) => n.y + n.h + 20));

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(width / (maxX + 80), height / (maxY + 80), 1);
    setTransform({
      x: Math.max(20, (width - maxX * scale) / 2),
      y: 20,
      scale: Math.max(scale, 0.2),
    });
  }, [maxX, maxY]);

  useEffect(() => {
    fitView();
  }, [fitView]);

  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = cx - rect.left;
    const my = cy - rect.top;
    setTransform((t) => {
      const ns = Math.max(0.15, Math.min(3, t.scale * factor));
      return {
        x: mx - (mx - t.x) * (ns / t.scale),
        y: my - (my - t.y) * (ns / t.scale),
        scale: ns,
      };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [applyZoom]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    },
    [transform.x, transform.y]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setTransform((t) => ({
        ...t,
        x: dragStart.current.tx + (e.clientX - dragStart.current.x),
        y: dragStart.current.ty + (e.clientY - dragStart.current.y),
      }));
    },
    [dragging]
  );

  const onMouseUp = useCallback(() => setDragging(false), []);

  if (nodes.length <= 1) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground/40 text-[11px] font-mono">
        No attack flow yet — start a mission
      </div>
    );
  }

  const tf = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;
  const tirpan = nodeMap.get("tirpan")!;

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden select-none bg-card/10"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
    >
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
        <button
          onClick={(e) => applyZoom(1.2, e.clientX, e.clientY)}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted text-sm font-bold transition-colors"
        >+</button>
        <button
          onClick={(e) => applyZoom(0.8, e.clientX, e.clientY)}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted text-sm font-bold transition-colors"
        >−</button>
        <button
          onClick={fitView}
          className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted text-[11px] transition-colors"
          title="Fit"
        >⌂</button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[9px] font-mono text-muted-foreground bg-card/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-border/30">
        <span className="flex items-center gap-1">
          <Zap className="w-2.5 h-2.5 text-accent" />
          Exploit
        </span>
        <span className="flex items-center gap-1">
          <ArrowRightLeft className="w-2.5 h-2.5 text-yellow-400" />
          Lateral
        </span>
        {onSelectHost && (
          <span className="text-accent/50">· click to drill down</span>
        )}
      </div>

      {/* Canvas */}
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: tf, willChange: "transform" }}
      >
        {/* SVG arrows behind nodes */}
        <svg
          width={maxX + 60}
          height={maxY + 60}
          className="absolute top-0 left-0 pointer-events-none overflow-visible"
          style={{ zIndex: 0 }}
        >
          <FlowArrows edges={edges} nodeMap={nodeMap} />
        </svg>

        {/* TIRPAN node */}
        <div
          className="absolute bg-primary border-2 border-accent rounded-xl flex flex-col items-center justify-center"
          style={{ left: tirpan.x, top: tirpan.y, width: tirpan.w, height: tirpan.h, zIndex: 1 }}
        >
          <div className="text-xs font-bold text-primary-foreground font-mono">TIRPAN</div>
          <div className="text-[9px] text-primary-foreground/60 font-mono truncate px-2 text-center">
            {tirpan.os}
          </div>
        </div>

        {/* Host nodes */}
        {nodes
          .filter((n) => !n.isAttacker)
          .map((node) => {
            const borderCls = node.isDomainAdmin
              ? "border-destructive bg-destructive/5"
              : node.sessionLevel >= 2
              ? "border-warning bg-warning/5"
              : node.sessionLevel >= 1
              ? "border-accent bg-accent/5"
              : "border-border bg-card";

            return (
              <div
                key={node.id}
                className={`absolute rounded-xl border-2 p-3 transition-all ${borderCls} ${
                  onSelectHost
                    ? "cursor-pointer hover:scale-[1.03] hover:shadow-lg hover:shadow-accent/10"
                    : ""
                }`}
                style={{ left: node.x, top: node.y, width: node.w, zIndex: 1 }}
                onClick={
                  onSelectHost
                    ? (e) => { e.stopPropagation(); onSelectHost(node.id); }
                    : undefined
                }
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-mono font-bold truncate">{node.label}</span>
                  <SessionBadge level={node.sessionLevel} />
                </div>
                <div className="text-[9px] text-muted-foreground font-mono mb-2 truncate">
                  {node.os}
                </div>
                <div className="flex flex-wrap gap-1">
                  {node.activities.map((a) => (
                    <ActivityBadge key={a} label={a} />
                  ))}
                </div>
                {onSelectHost && (
                  <div className="mt-2 pt-1.5 border-t border-border/30 text-[8px] text-accent/50 font-mono text-center">
                    click to drill down →
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
