import { useEffect, useRef, useState, useCallback } from "react";
import { Globe, Network, Terminal, Hash, GitFork, Key, Shield, ArrowRight, Crown, Bell, Loader2, Bug, Cpu, Lock, AlertTriangle, ChevronDown } from "lucide-react";
import type { DynamicGraphData, CanvasNode, CanvasEdge, NodeStatus } from "@/hooks/useAttackGraphData";
import { NodeCard } from "./NodeCard";
import { StartBadge } from "./Badges";
import { useSessionContext } from "@/lib/SessionContext";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { useQuery } from "@tanstack/react-query";
import { getSessions } from "@/lib/api";

interface AttackGraphProps {
  data: DynamicGraphData;
  activeView?: "topology" | "attackPath";
  selectedHost?: string | null;
  onSelectHost?: (hostIp: string) => void;
  /** Görünen grafik oturumu; context seçimi boşken (otomatik mod) doğru satırın vurgulanması için kullanılır. */
  focusedSessionId?: string | null;
  /** Host kartı altındaki kısa yönlendirme metni (ör. önizlemede). */
  hostSelectHint?: string;
}

const CARD_W = 230;
const CARD_H = 140;
const HOST_W = 220;
const HOST_H = 130;
const MICRO_W = 170;
const MICRO_H = 48;

const EDGE_COLORS: Record<string, string> = {
  next:      "hsl(var(--foreground) / 0.25)",
  scan:      "hsl(var(--muted-foreground) / 0.4)",
  exploit:   "hsl(var(--accent))",
  lateral:   "hsl(48 96% 53% / 0.9)",
  discover:  "hsl(var(--success))",
  spawn:     "hsl(var(--primary))",
  tool_call: "hsl(var(--warning) / 0.7)",
  leads_to:  "hsl(var(--destructive) / 0.6)",
};

// ─── Action icon map ──────────────────────────────────────────────────────────

function ActionIcon({ label, tool }: { label: string; tool?: string }) {
  const t = (tool || label).toLowerCase();
  let Icon: any = Globe;
  if (t.includes("nmap") || t.includes("port") || t.includes("scan")) Icon = Network;
  else if (t.includes("ssh") || t.includes("terminal")) Icon = Terminal;
  else if (t.includes("cred") || t.includes("dump") || t.includes("mimikatz")) Icon = Key;
  else if (t.includes("kerb")) Icon = Hash;
  else if (t.includes("blood") || t.includes("ldap")) Icon = GitFork;
  else if (t.includes("priv") || t.includes("escal")) Icon = Shield;
  else if (t.includes("lateral") || t.includes("psexec")) Icon = ArrowRight;
  else if (t.includes("admin") || t.includes("domain")) Icon = Crown;
  else if (t.includes("alert")) Icon = Bell;
  else if (t.includes("exploit") || t.includes("metasploit")) Icon = Bug;
  else if (t.includes("vuln") || t.includes("search")) Icon = AlertTriangle;
  else if (t.includes("session")) Icon = Lock;
  return <Icon className="w-4 h-4" />;
}

// ─── Node renderers ───────────────────────────────────────────────────────────

function HostCard({ node, onClick, actionHint }: { node: CanvasNode; onClick?: () => void; actionHint?: string }) {
  const d = node.data || {};
  const compromised = d.compromised;
  const sessionLevel = d.sessionLevel || 0;
  const openPorts = d.openPorts || 0;
  const vulnCount = d.vulnCount || 0;
  const exploitCount = d.exploitCount || {};
  const exploitTotal = exploitCount.total || d.exploitTotal || 0;
  const exploitSuccess = exploitCount.success || d.exploitSuccess || 0;

  const ringColor =
    sessionLevel >= 3 ? "border-destructive shadow-[0_0_12px_rgba(239,68,68,0.2)]"
    : sessionLevel >= 2 ? "border-warning shadow-[0_0_12px_rgba(234,179,8,0.15)]"
    : compromised ? "border-accent shadow-[0_0_12px_rgba(var(--accent),0.15)]"
    : "border-border";

  const badgeColor =
    sessionLevel >= 3 ? "bg-destructive text-white"
    : sessionLevel >= 2 ? "bg-warning text-warning-foreground"
    : compromised ? "bg-accent text-accent-foreground"
    : "bg-muted text-muted-foreground";

  return (
    <div
      className={`absolute bg-card border-2 ${ringColor} rounded-2xl p-3 transition-all ${onClick ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg" : ""}`}
      style={{ left: node.x, top: node.y, width: HOST_W }}
      onMouseDown={(e) => { if (onClick) e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${badgeColor}`}>
          {sessionLevel >= 3 ? "DA" : sessionLevel >= 2 ? "S2" : compromised ? "S1" : "H"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-mono font-bold truncate">{node.label}</div>
          <div className="text-[10px] text-muted-foreground truncate">{node.subtitle}</div>
        </div>
        {compromised && (
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-mono">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          {openPorts} ports
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
          {vulnCount} vulns
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          {exploitSuccess}/{exploitTotal} exp
        </div>
        <div className={`flex items-center gap-1 ${compromised ? "text-accent" : "text-muted-foreground"}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sessionLevel >= 1 ? "bg-accent" : "bg-muted"}`} />
          {sessionLevel >= 1 ? "Shell ✓" : "No shell"}
        </div>
      </div>
      {onClick && (
        <div className="mt-2 pt-2 border-t border-border/40 text-[9px] text-accent/60 font-mono text-center">
          {actionHint || "click to drill down →"}
        </div>
      )}
    </div>
  );
}

function MicroNode({ node }: { node: CanvasNode }) {
  const isAgent = node.type === "agent";
  const isVuln = node.type === "vuln";
  const isSession = node.type === "session_node";

  let bg = "bg-muted/70";
  let border = "border-border/50";
  let textColor = "text-foreground";
  let Icon: any = isAgent ? Cpu : Bug;

  if (isVuln) {
    const cvss = parseFloat(node.data?.cvss_score || node.subtitle?.match(/CVSS (\d+\.?\d*)/)?.[1] || "0");
    if (cvss >= 9) { bg = "bg-destructive/10"; border = "border-destructive/40"; textColor = "text-destructive"; }
    else if (cvss >= 7) { bg = "bg-warning/10"; border = "border-warning/40"; textColor = "text-warning"; }
    else { bg = "bg-muted/70"; border = "border-border/50"; }
    Icon = AlertTriangle;
  } else if (isSession) {
    bg = "bg-accent/10";
    border = "border-accent/50";
    textColor = "text-accent";
    Icon = Lock;
  }

  return (
    <div
      className={`absolute ${bg} border ${border} rounded-xl px-2.5 py-1.5 flex items-start gap-2`}
      style={{ left: node.x, top: node.y, width: MICRO_W }}
    >
      <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${textColor}`} />
      <div className="min-w-0">
        <div className={`text-[10px] font-mono font-semibold truncate ${textColor}`}>{node.label}</div>
        {node.subtitle && <div className="text-[9px] text-muted-foreground truncate">{node.subtitle}</div>}
      </div>
      {node.status === "active" && <Loader2 className="w-2.5 h-2.5 text-accent animate-spin ml-auto shrink-0 mt-0.5" />}
    </div>
  );
}

function AttackerNode({ node }: { node: CanvasNode }) {
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ left: node.x - 50, top: node.y - 22, width: 100, height: 44 }}
    >
      <div className="w-full h-full rounded-xl bg-primary border border-accent flex flex-col items-center justify-center px-2">
        <span className="text-xs font-bold text-primary-foreground font-mono">{node.label}</span>
        {node.subtitle && (
          <span className="text-[9px] text-primary-foreground/60 font-mono truncate w-full text-center">{node.subtitle}</span>
        )}
      </div>
    </div>
  );
}

function StartNode({ node }: { node: CanvasNode }) {
  return (
    <div className="absolute" style={{ left: node.x, top: node.y - 20 }}>
      <StartBadge />
    </div>
  );
}

function ActionNode({ node }: { node: CanvasNode }) {
  const isActive = node.status === "active";
  const tool = node.data?.tool;
  const success = node.data?.success;
  const failed = success === false;

  return (
    <div className="absolute" style={{ left: node.x, top: node.y, width: CARD_W }}>
      <NodeCard
        icon={() => <ActionIcon label={node.label} tool={tool} />}
        title={node.label}
        subtitle={node.subtitle}
        status={node.status}
        data={node.data}
      >
        {/* Tool badge */}
        {tool && (
          <div className="flex items-center gap-1 mb-2">
            <span className="text-[9px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {tool}
            </span>
            {failed && (
              <span className="text-[9px] font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded">failed</span>
            )}
          </div>
        )}

        {/* Port scan result */}
        {node.data?.ports && node.data.ports.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {node.data.ports.slice(0, 4).map((p: any, i: number) => (
              <span key={i} className="text-[9px] font-mono bg-muted rounded px-1 py-0.5 text-muted-foreground">
                {p.number}/{p.service || "?"}
              </span>
            ))}
            {node.data.ports.length > 4 && (
              <span className="text-[9px] font-mono text-muted-foreground">+{node.data.ports.length - 4}</span>
            )}
          </div>
        )}

        {/* Cred count */}
        {node.data?.credCount !== undefined && node.data.credCount > 0 && (
          <div className="flex items-end gap-1 mt-1">
            <span className="font-display font-bold text-2xl">{node.data.credCount}</span>
            <span className="text-[10px] text-muted-foreground mb-0.5">credentials</span>
          </div>
        )}

        {/* Vuln count */}
        {node.data?.vulns && (
          <div className="flex items-end gap-1 mt-1">
            <span className="font-display font-bold text-2xl">{node.data.vulns.length}</span>
            <span className="text-[10px] text-muted-foreground mb-0.5">vulns found</span>
          </div>
        )}

        {/* Priv user */}
        {node.data?.user && (
          <div className="bg-muted rounded-lg p-1.5 mt-1">
            <span className="text-[10px] font-mono">{node.data.user}</span>
          </div>
        )}

        {isActive && (
          <div className="absolute -top-2 -right-2">
            <Loader2 className="w-5 h-5 text-accent animate-spin" />
          </div>
        )}
      </NodeCard>
    </div>
  );
}

// ─── Edge renderer ────────────────────────────────────────────────────────────

function renderEdge(edge: CanvasEdge, nodeMap: Map<string, CanvasNode>) {
  const src = nodeMap.get(edge.source);
  const tgt = nodeMap.get(edge.target);
  if (!src || !tgt) return null;

  const color = EDGE_COLORS[edge.type] || EDGE_COLORS.next;
  const isLateral = edge.type === "lateral";
  const isExploit = edge.type === "exploit";
  const isToolCall = edge.type === "tool_call" || edge.type === "leads_to";
  const isActive = src.status === "active" || tgt.status === "active";
  const strokeWidth = isLateral ? 2.5 : isExploit ? 2 : isActive ? 2 : 1.5;
  const opacity = isToolCall ? 0.5 : isActive ? 1 : 0.7;

  const getCenter = (n: CanvasNode): { x: number; y: number; w: number; h: number } => {
    if (n.type === "host") return { x: n.x + HOST_W / 2, y: n.y + HOST_H / 2, w: HOST_W, h: HOST_H };
    if (n.type === "action") return { x: n.x + CARD_W / 2, y: n.y + CARD_H / 2, w: CARD_W, h: CARD_H };
    if (n.type === "tool" || n.type === "vuln" || n.type === "session_node" || n.type === "agent") return { x: n.x + MICRO_W / 2, y: n.y + MICRO_H / 2, w: MICRO_W, h: MICRO_H };
    if (n.type === "attacker") return { x: n.x, y: n.y, w: 100, h: 44 };
    return { x: n.x, y: n.y, w: 60, h: 30 };
  };

  const sc = getCenter(src);
  const tc = getCenter(tgt);

  // For tool_call/leads_to: connect right edge of source to left edge of target
  let x1 = sc.x, y1 = sc.y, x2 = tc.x, y2 = tc.y;

  if (isToolCall) {
    x1 = src.x + (src.type === "action" ? CARD_W : MICRO_W);
    y1 = src.y + (src.type === "action" ? CARD_H * 0.5 : MICRO_H * 0.5);
    x2 = tgt.x;
    y2 = tgt.y + MICRO_H * 0.5;
  } else if (src.type === "action" || src.type === "attacker" || src.type === "start") {
    x1 = sc.x;
    y1 = src.y + (src.type === "action" ? CARD_H : src.type === "attacker" ? 44 : 30);
  } else if (src.type === "host") {
    x1 = sc.x;
    y1 = sc.y;
  }

  if (!isToolCall) {
    if (tgt.type === "action" || tgt.type === "attacker" || tgt.type === "start") {
      x2 = tc.x;
      y2 = tgt.y;
    } else if (tgt.type === "host") {
      x2 = tc.x;
      y2 = tc.y;
    } else if (tgt.type === "session_node") {
      x2 = tgt.x;
      y2 = tgt.y + MICRO_H * 0.5;
    }
  }

  // Bezier control points
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  let d: string;

  if (isToolCall) {
    const midX = (x1 + x2) / 2;
    d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  } else if (dy > dx * 0.5) {
    // Mostly vertical: standard top-to-bottom bezier
    const cp1y = y1 + Math.min(dy * 0.4, 80);
    const cp2y = y2 - Math.min(dy * 0.4, 80);
    d = `M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`;
  } else {
    // Mostly horizontal: S-curve
    const mx = (x1 + x2) / 2;
    d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }

  return (
    <g key={edge.id}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeDasharray={isLateral ? "6 4" : isToolCall ? "3 4" : undefined}
        markerEnd={`url(#arr-${edge.type})`}
      />
      {edge.label && (
        <text
          x={(x1 + x2) / 2 + 6}
          y={(y1 + y2) / 2 - 5}
          textAnchor="middle"
          fill={color}
          fontSize="9"
          fontFamily="monospace"
          opacity={0.8}
          style={{ pointerEvents: "none" }}
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const AttackGraph = ({
  data,
  activeView = "topology",
  selectedHost,
  onSelectHost,
  focusedSessionId = null,
  hostSelectHint,
}: AttackGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const { selectedSessionId, setSelectedSessionId } = useSessionContext();
  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 5000 });
  const dropdownSelectedId = selectedSessionId ?? focusedSessionId ?? null;
  const badgeSession = dropdownSelectedId ? (sessions as any[]).find((x: any) => x.id === dropdownSelectedId) : null;
  const missionBadgeLabel =
    sessionDisplayLabel(badgeSession) || data.target || selectedSessionId?.slice(0, 8) || focusedSessionId?.slice(0, 8) || "— mission —";

  useEffect(() => {
    if (!showDrop) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDrop]);

  const activeGraph = activeView === "topology" ? data.topology : data.attackPath;

  const fitToContainer = useCallback(() => {
    const el = containerRef.current;
    if (!el || !activeGraph?.bounds) return;
    const { width, height } = el.getBoundingClientRect();
    const bounds = activeGraph.bounds;
    const gw = bounds.maxX + 80;
    const gh = bounds.maxY + 80;
    if (gw <= 0 || gh <= 0 || width <= 0 || height <= 0) return;
    const scale = Math.min(width / gw, height / gh, 1);
    setTransform({
      x: Math.max(20, (width - gw * scale) / 2),
      y: 20,
      scale: Math.max(scale, 0.25),
    });
  }, [activeGraph?.bounds?.maxX, activeGraph?.bounds?.maxY]);

  useEffect(() => {
    fitToContainer();
  }, [fitToContainer]);

  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = cx - rect.left;
    const my = cy - rect.top;
    setTransform((t) => {
      const ns = Math.max(0.15, Math.min(3, t.scale * factor));
      const dx = mx - t.x;
      const dy = my - t.y;
      return { x: mx - dx * (ns / t.scale), y: my - dy * (ns / t.scale), scale: ns };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      /* Mission seçici açıkken tekerlek grafiği zoom’lamasın; liste içinde doğal kaydırma çalışsın */
      const dropRoot = dropRef.current;
      if (dropRoot) {
        const path = typeof e.composedPath === "function" ? e.composedPath() : [];
        const inMissionUi =
          path.some((n) => n === dropRoot) ||
          (e.target instanceof Node && dropRoot.contains(e.target));
        if (inMissionUi) return;
      }
      e.preventDefault();
      applyZoom(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [applyZoom]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform.x, transform.y]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform((t) => ({ ...t, x: dragStart.current.tx + dx, y: dragStart.current.ty + dy }));
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  if (!data || !activeGraph || !activeGraph.nodes) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground/40 text-sm font-mono">Initializing graph…</p>
      </div>
    );
  }

  const nodeMap = new Map(activeGraph.nodes.map((n) => [n.id, n]));
  const tf = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;

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
      {/* Mission selector / status badge */}
      <div ref={dropRef} className="absolute top-3 right-3 z-20">
        {(sessions as any[]).length > 0 ? (
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDrop((v) => !v); }}
              className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                data.isRunning
                  ? "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
                  : "bg-muted/70 text-muted-foreground border-border/40 hover:bg-muted hover:text-foreground"
              }`}
            >
              {data.isRunning && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />}
              <span className="max-w-[120px] truncate">{missionBadgeLabel}</span>
              <ChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-150 ${showDrop ? "rotate-180" : ""}`} />
            </button>

            {showDrop && (
              <div
                className="absolute right-0 top-full mt-1 w-60 flex flex-col max-h-[min(70vh,20rem)] bg-card border border-border/60 rounded-xl shadow-xl overflow-hidden touch-pan-y"
                onWheel={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full shrink-0 text-left px-3 py-2 text-[10px] font-mono text-muted-foreground hover:bg-muted transition-colors border-b border-border/40"
                  onClick={() => { setSelectedSessionId(null); setShowDrop(false); }}
                >
                  — Auto (running session) —
                </button>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                  {(sessions as any[]).map((s: any) => (
                    <button
                      key={s.id}
                      className={`w-full text-left px-3 py-2 text-[10px] font-mono hover:bg-muted transition-colors border-b border-border/20 last:border-0 ${
                        dropdownSelectedId === s.id ? "text-accent bg-accent/5" : "text-foreground"
                      }`}
                      onClick={() => { setSelectedSessionId(s.id); setShowDrop(false); }}
                    >
                      <div className="truncate font-semibold">{sessionDisplayLabel(s)}</div>
                      <div className="text-muted-foreground text-[9px] mt-0.5">{s.status}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : data.isDemoMode ? (
          <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-1 rounded-full">demo</span>
        ) : data.isRunning ? (
          <span className="flex items-center gap-1.5 text-[10px] font-mono bg-accent/10 text-accent px-2.5 py-1 rounded-full border border-accent/30">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            live · {data.target}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2.5 py-1 rounded-full">{data.target || "—"}</span>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[9px] font-mono text-muted-foreground bg-card/70 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-border/30">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.scan }} />Scan</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.exploit }} />Exploit</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS.lateral }} />Lateral</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 dashed rounded" style={{ background: EDGE_COLORS.tool_call }} />Tool</span>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
        <button onClick={(e) => applyZoom(1.2, e.clientX, e.clientY)} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted text-sm font-bold transition-colors">+</button>
        <button onClick={(e) => applyZoom(0.8, e.clientX, e.clientY)} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted text-sm font-bold transition-colors">−</button>
        <button onClick={fitToContainer} className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted text-[11px] transition-colors" title="Fit">⌂</button>
      </div>

      {/* Canvas */}
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: tf, willChange: "transform" }}>
        {/* SVG edges */}
        <svg
          width={activeGraph.bounds.maxX + 200}
          height={activeGraph.bounds.maxY + 200}
          className="absolute top-0 left-0 pointer-events-none overflow-visible"
        >
          <defs>
            {Object.entries(EDGE_COLORS).map(([type, color]) => (
              <marker key={type} id={`arr-${type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>
          {activeGraph.edges.map((e) => renderEdge(e, nodeMap))}
        </svg>

        {/* Nodes */}
        {activeGraph.nodes.map((node) => {
          switch (node.type) {
            case "start":
              return <StartNode key={node.id} node={node} />;
            case "attacker":
              return <AttackerNode key={node.id} node={node} />;
            case "action":
              return <ActionNode key={node.id} node={node} />;
            case "host":
              return (
                <HostCard
                  key={node.id}
                  node={node}
                  onClick={onSelectHost ? () => onSelectHost(node.label) : undefined}
                  actionHint={hostSelectHint}
                />
              );
            case "tool":
            case "vuln":
            case "session_node":
            case "agent":
              return <MicroNode key={node.id} node={node} />;
            default:
              return null;
          }
        })}

        {/* Empty state */}
        {activeGraph.nodes.length <= 1 && (
          <div style={{ position: "absolute", left: 200, top: 150, textAlign: "center" }}>
            <p className="text-muted-foreground/30 text-sm font-mono">Waiting for agent to start…</p>
            <p className="text-muted-foreground/20 text-xs font-mono mt-2">Launch a mission to see the attack graph unfold</p>
          </div>
        )}
      </div>
    </div>
  );
};
