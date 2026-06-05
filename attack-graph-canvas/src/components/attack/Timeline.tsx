import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Pause, Square, Terminal, Lightbulb, Bell, SlidersHorizontal, X, Loader2, OctagonMinus, Maximize2, Plus, Target, Bug, Server, Zap, Search, ListTodo, GitBranch, FileText, CalendarClock, AlertCircle, Radio, CheckCircle2, Grid3x3, Activity, Key } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { killSession, pauseSession, resumeSession, getSessions } from "@/lib/api";
import { openCommandPalette } from "@/lib/commandPalette";
import type { TimelineData, TimelineEvent } from "@/hooks/useAttackGraphData";
import { useSessionBundle } from "@/hooks/useAttackGraphData";
import { useSessionContext } from "@/lib/SessionContext";
import { LiveTerminalPanel } from "@/components/attack/LiveTerminalPanel";
import { usePermissions } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface TimelineProps {
  data?: TimelineData;
  sessionId?: string | null;
  isRunning?: boolean;
  target?: string;
  isDemoMode?: boolean;
  /** Örn. attack graph: alt panelde terminal varsayılan açık */
  defaultOpenPopup?: string | null;
}

const PopupPanel = ({
  title,
  icon: Icon,
  children,
  onClose,
  wide,
  bodyClassName,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  bodyClassName?: string;
}) => (
  <div
    className={`absolute bottom-14 right-0 z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden ${
      wide ? "w-[min(540px,96vw)]" : "w-[360px]"
    }`}
  >
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent" />
        <span className="font-display font-semibold text-xs">{title}</span>
      </div>
      <button onClick={onClose} className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center">
        <X className="w-3 h-3" />
      </button>
    </div>
    <div className={bodyClassName ?? "max-h-[300px] overflow-auto p-3"}>{children}</div>
  </div>
);

const DockStat = ({ icon: Icon, value, label }: { icon: any; value: string; label: string }) => (
  <div className="flex items-center gap-1.5 shrink-0">
    <div className="w-6 h-6 rounded-full bg-muted/50 border border-border/40 flex items-center justify-center shrink-0">
      <Icon className="w-3 h-3 text-accent" />
    </div>
    <span className="text-sm font-display font-bold text-foreground tabular-nums leading-none">{value}</span>
    <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">{label}</span>
  </div>
);

const DockBtn = ({ icon: Icon, label, hint, accent, onClick }: { icon: any; label: string; hint?: string; accent?: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-1.5 shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors",
      accent ? "bg-accent/15 text-accent hover:bg-accent/25" : "bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted",
    )}
    title={hint ? `${label} (${hint})` : label}
  >
    <Icon className="w-3.5 h-3.5 shrink-0" />
    <span className="whitespace-nowrap">{label}</span>
    {hint && <kbd className="ml-0.5 text-[9px] font-mono px-1 py-0.5 rounded bg-background/40 border border-border/40 leading-none">{hint}</kbd>}
  </button>
);

/** Aktif görev yokken pipeline'ın yerinde dönen, çok-bilgili/aksiyonlu şerit. */
const RotatingDock = ({ slides }: { slides: React.ReactNode[] }) => {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  if (!slides.length) return null;
  const safeIdx = idx % slides.length;

  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div key={safeIdx} className="flex-1 min-w-0 flex items-center gap-3.5 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-500">
        {slides[safeIdx]}
      </div>
      {slides.length > 1 && (
        <div className="flex items-center gap-1 shrink-0 pr-1">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`View ${i + 1}`}
              className={cn("h-1.5 rounded-full transition-all", i === safeIdx ? "w-4 bg-accent" : "w-1.5 bg-border/50 hover:bg-border")}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Timeline = ({
  data,
  sessionId,
  isRunning: isRunningProp,
  target,
  isDemoMode,
  defaultOpenPopup = null,
}: TimelineProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const perms = usePermissions();
  const [popup, setPopup] = useState<string | null>(defaultOpenPopup);
  const shellDisabled = !!isDemoMode || !perms.canUseTerminal;

  // When no explicit data/session is provided (e.g. PageShell default), auto-connect
  // to the globally selected or best-running session via context.
  const { selectedSessionId: ctxSid } = useSessionContext();
  const ctxBundle = useSessionBundle(null, sessionId ?? ctxSid);
  // Use passed data when provided (attack-graph page), otherwise fall back to context bundle
  const resolvedData: TimelineData | undefined = data ?? ctxBundle.timeline;
  const resolvedSessionId = sessionId ?? ctxBundle.sessionId ?? ctxSid;
  const resolvedIsRunning = isRunningProp ?? ctxBundle.dynamicGraph?.isRunning;
  const resolvedTarget = target ?? ctxBundle.dynamicGraph?.target;

  // Aggregate session stats for the "no active mission" rotating info strip.
  const { data: allSessions = [] } = useQuery<any[]>({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  // ── Terminal popup resize ────────────────────────
  const [termSize, setTermSize] = useState({ w: 560, h: 440 });
  const termSizeRef = useRef(termSize);
  termSizeRef.current = termSize;
  const termPopupRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const resizeDirRef = useRef<"w" | "h" | "both">("both");
  const resizeOriginRef = useRef({ x: 0, y: 0, w: 560, h: 440 });

  // Global mouse events for resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { x, y, w, h } = resizeOriginRef.current;
      const dir = resizeDirRef.current;
      setTermSize({
        w: dir === "h" ? w : Math.max(360, Math.min(window.innerWidth * 0.95, w + (x - e.clientX))),
        h: dir === "w" ? h : Math.max(260, Math.min(window.innerHeight * 0.88, h + (y - e.clientY))),
      });
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback((e: React.MouseEvent, dir: "w" | "h" | "both") => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    resizeDirRef.current = dir;
    const { w, h } = termSizeRef.current;
    resizeOriginRef.current = { x: e.clientX, y: e.clientY, w, h };
    document.body.style.cursor = dir === "w" ? "ew-resize" : dir === "h" ? "ns-resize" : "nw-resize";
    document.body.style.userSelect = "none";
  }, []);

  // Click-outside to close popup
  useEffect(() => {
    if (popup !== "terminal") return;
    let handler: ((e: MouseEvent) => void) | null = null;
    const timer = setTimeout(() => {
      handler = (e: MouseEvent) => {
        if (termPopupRef.current && !termPopupRef.current.contains(e.target as Node)) {
          setPopup(null);
        }
      };
      document.addEventListener("mousedown", handler);
    }, 160);
    return () => {
      clearTimeout(timer);
      if (handler) document.removeEventListener("mousedown", handler);
    };
  }, [popup]);

  // Listen for "collapse from TerminalPage" signal
  useEffect(() => {
    if (localStorage.getItem("tirpan_open_terminal_popup") === "1") {
      localStorage.removeItem("tirpan_open_terminal_popup");
      setPopup("terminal");
    }
  }, []);

  const steps = resolvedData?.steps?.length ? resolvedData.steps : [
    { label: "Recon", time: "—", done: false, active: false },
    { label: "Port Scan", time: "—", done: false, active: false },
    { label: "Web Foothold", time: "—", done: false, active: false },
    { label: "Cred Dump", time: "—", done: false, active: false },
    { label: "Privilege Esc.", time: "—", done: false, active: false },
    { label: "Lateral Move", time: "—", done: false, active: false },
    { label: "Domain Admin", time: "—", done: false, active: false },
  ];

  const currentTime = resolvedData?.currentTime || "—";
  const sessionDate = resolvedData?.sessionDate || "—";
  const events = resolvedData?.events || [];

  // Use resolved values (from props or context-derived bundle)
  const isRunning = resolvedIsRunning !== undefined ? resolvedIsRunning : steps.some((s) => s.active);
  const hasSession = !!resolvedSessionId;

  const onMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["session-detail"] });
  };

  const killMut = useMutation({
    mutationFn: async () => {
      if (!resolvedSessionId) throw new Error("No session");
      return killSession(resolvedSessionId);
    },
    onSuccess: onMutationSuccess,
  });

  const pauseMut = useMutation({
    mutationFn: async () => {
      if (!resolvedSessionId) throw new Error("No session");
      return pauseSession(resolvedSessionId);
    },
    onSuccess: onMutationSuccess,
  });

  const resumeMut = useMutation({
    mutationFn: async () => {
      if (!resolvedSessionId) throw new Error("No session");
      return resumeSession(resolvedSessionId);
    },
    onSuccess: onMutationSuccess,
  });

  const isMutating = killMut.isPending || pauseMut.isPending || resumeMut.isPending;

  // ── Empty state: no running mission AND nothing explicitly selected ──
  const hasExplicitSelection = !!(sessionId ?? ctxSid);
  const showEmpty = !data && !hasExplicitSelection && !resolvedIsRunning;

  const sessionsArr = allSessions as any[];
  const sum = (key: string) => sessionsArr.reduce((acc, s) => acc + (Number(s?.[key]) || 0), 0);
  const fmtNum = (n: number) => (n > 999 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const runningCount = sessionsArr.filter((s) => s?.is_running || s?.status === "running").length;
  const stats = {
    missions: fmtNum(sessionsArr.length),
    running: fmtNum(runningCount),
    findings: fmtNum(sum("vulns_found")),
    hosts: fmtNum(sum("hosts_found")),
    exploits: fmtNum(sum("exploits_run")),
    done: fmtNum(Math.max(0, sessionsArr.length - runningCount)),
  };
  const dockSlides: React.ReactNode[] = [
    <div key="stats" className="w-full flex items-center justify-between gap-2">
      <DockStat icon={Target} value={stats.missions} label="missions" />
      <DockStat icon={Radio} value={stats.running} label="active" />
      <DockStat icon={Bug} value={stats.findings} label="findings" />
      <DockStat icon={Server} value={stats.hosts} label="hosts" />
      <DockStat icon={Zap} value={stats.exploits} label="exploits" />
      <DockStat icon={CheckCircle2} value={stats.done} label="done" />
    </div>,
    <div key="nav" className="w-full flex items-center justify-between gap-2">
      <DockBtn icon={ListTodo} label="Missions" onClick={() => navigate("/missions")} />
      <DockBtn icon={GitBranch} label="Attack Graph" onClick={() => navigate("/attack-graph")} />
      <DockBtn icon={Server} label="Hosts" onClick={() => navigate("/hosts")} />
      <DockBtn icon={AlertCircle} label="Findings" onClick={() => navigate("/findings")} />
      <DockBtn icon={FileText} label="Reports" onClick={() => navigate("/reports")} />
      <DockBtn icon={Grid3x3} label="ATT&CK" onClick={() => navigate("/attack-matrix")} />
    </div>,
    <div key="tools" className="w-full flex items-center justify-between gap-2">
      <DockBtn icon={Search} label="Search" hint="⌘K" accent onClick={openCommandPalette} />
      <DockBtn icon={Terminal} label="Terminal" onClick={() => navigate("/terminal")} />
      <DockBtn icon={CalendarClock} label="Scheduled" onClick={() => navigate("/scheduled-scans")} />
      <DockBtn icon={Key} label="Credentials" onClick={() => navigate("/credentials")} />
      <DockBtn icon={SlidersHorizontal} label="Settings" onClick={() => navigate("/settings")} />
    </div>,
  ];

  return (
    <div className="relative">
      <div className="flex items-center gap-3 bg-card rounded-full p-2 pl-3 border border-border/50 shadow-[var(--shadow-card)] w-full min-w-0">
        {showEmpty ? (
          /* No active/selected mission → New Mission CTA + rotating data/action dock */
          <div className="flex-1 min-w-0 flex items-center gap-3 pl-1">
            {perms.canCreateMission ? (
              <button
                onClick={() => navigate("/missions/new")}
                className="flex items-center gap-2 shrink-0 h-9 pl-2.5 pr-4 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                title="Start a new mission"
              >
                <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center"><Plus className="w-4 h-4" /></span>
                <span className="text-xs font-semibold whitespace-nowrap">New Mission</span>
              </button>
            ) : (
              <span className="shrink-0 text-[9px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/30">No active mission</span>
            )}
            <div className="w-px h-6 bg-border/40 shrink-0" />
            <RotatingDock slides={dockSlides} />
          </div>
        ) : (
        <>
        {/* Session controls */}
        <div className="flex items-center gap-1 shrink-0">
          {isMutating ? (
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : isRunning ? (
            <>
              <button
                onClick={() => hasSession && pauseMut.mutate()}
                disabled={!hasSession}
                className="w-9 h-9 rounded-full bg-warning/10 text-warning hover:bg-warning/20 flex items-center justify-center transition-colors disabled:opacity-40"
                title="Pause"
              >
                <Pause className="w-4 h-4" />
              </button>
              <button
                onClick={() => hasSession && killMut.mutate()}
                disabled={!hasSession}
                className="w-9 h-9 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition-colors disabled:opacity-40"
                title="Stop"
              >
                <Square className="w-4 h-4" />
              </button>
              <button
                onClick={() => hasSession && killMut.mutate()}
                disabled={!hasSession}
                className="w-9 h-9 rounded-full bg-destructive/20 text-destructive hover:bg-destructive/30 flex items-center justify-center transition-colors disabled:opacity-40"
                title="Emergency Stop"
              >
                <OctagonMinus className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => hasSession && resumeMut.mutate()}
                disabled={!hasSession}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  hasSession ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground opacity-40"
                }`}
                title="Resume"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
            </>
          )}
        </div>

        {/* Status indicator */}
        <div className="text-xs leading-tight shrink-0 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full shrink-0 ${
              isRunning
                ? "bg-accent/10 text-accent border border-accent/30"
                : hasSession
                ? "bg-warning/10 text-warning border border-warning/30"
                : "bg-muted text-muted-foreground border border-border/30"
            }`}>
              {isMutating ? "…" : isRunning ? "running" : hasSession ? "paused" : "idle"}
            </span>
            {isDemoMode && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground/60 border border-border/20 shrink-0">demo</span>
            )}
          </div>
          {resolvedTarget ? (
            <div className="font-display font-bold text-sm truncate max-w-[140px] flex items-center gap-1.5 mt-0.5">
              {resolvedTarget}
              {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />}
            </div>
          ) : (
            <div className="font-display font-bold text-sm flex items-center gap-1.5 text-muted-foreground/40 mt-0.5">
              {currentTime}
            </div>
          )}
          <div className="text-muted-foreground/60 text-[10px]">{sessionDate}</div>
        </div>

        {/* Timeline steps */}
        <div className="flex-1 min-w-0 flex items-center px-4">
          {steps.map((s, i) => (
            <div key={`${s.label}-${i}`} className="contents">
              {i > 0 && (
                <div className={`flex-1 min-w-3 border-t-2 border-dotted mx-1 ${s.done ? "border-accent/50" : "border-border/30"}`} />
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="relative shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    s.done ? "bg-accent" : s.active ? "bg-primary ring-2 ring-primary/20 animate-pulse" : "bg-card border border-border/50"
                  }`}>
                    {s.done && (
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="hsl(var(--accent-foreground))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                    {s.active && <Loader2 className="w-2.5 h-2.5 text-primary-foreground animate-spin" />}
                    {!s.done && !s.active && <span className="w-1 h-1 rounded-full bg-border/50" />}
                  </div>
                  {s.count !== undefined && s.count > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-foreground text-background text-[8px] font-bold flex items-center justify-center leading-none">{s.count > 99 ? "99+" : s.count}</span>
                  )}
                </div>
                <div className="leading-tight">
                  <div className={`text-[11px] font-medium whitespace-nowrap ${
                    s.active ? "text-primary font-semibold" : s.done ? "text-foreground" : "text-muted-foreground/50"
                  }`}>{s.label}</div>
                  {s.time !== "—" && (
                    <div className={`text-[9px] font-mono tabular-nums ${s.done || s.active ? "text-muted-foreground" : "text-muted-foreground/30"}`}>{s.time}</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        </>
        )}

        {/* Right toolbar */}
        <div className="relative flex items-center gap-0.5 bg-primary rounded-full p-1 shrink-0">
          {[
            { key: "terminal", Icon: Terminal, label: "Terminal" },
            { key: "insights", Icon: Lightbulb, label: "Insights" },
            { key: "alerts", Icon: Bell, label: "Alerts" },
            { key: "settings", Icon: SlidersHorizontal, label: "Settings" },
          ].map(({ key, Icon, label }) => (
            <button
              key={key}
              onClick={() => setPopup(popup === key ? null : key)}
              className="relative w-9 h-9 rounded-full text-primary-foreground hover:bg-white/10 flex items-center justify-center transition-colors"
              title={label}
            >
              <Icon className="w-4 h-4" />
              {key === "alerts" && events.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-accent text-[8px] font-bold text-accent-foreground flex items-center justify-center">{Math.min(events.length, 9)}</span>
              )}
            </button>
          ))}

          {/* Live Terminal — always mounted so tabs/PTY survive popup close */}
          <div
            ref={termPopupRef}
            className={cn(
              "fixed z-[60] flex flex-col bg-card border border-border rounded-2xl shadow-2xl transition-opacity duration-150",
              popup === "terminal" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            )}
            style={
              popup === "terminal"
                ? { bottom: 58, right: 12, width: termSize.w, height: termSize.h, overflow: "hidden" }
                : { position: "fixed", left: -99999, top: 0, width: termSize.w, height: termSize.h, overflow: "hidden" }
            }
            aria-hidden={popup !== "terminal"}
          >
            {/* ── Resize handles ─────────────────────── */}
            {/* top edge */}
            <div
              className="absolute top-0 left-7 right-0 h-1.5 cursor-ns-resize z-20 hover:bg-primary/15 transition-colors"
              onMouseDown={(e) => startResize(e, "h")}
            />
            {/* left edge */}
            <div
              className="absolute top-7 left-0 w-1.5 bottom-0 cursor-ew-resize z-20 hover:bg-primary/15 transition-colors"
              onMouseDown={(e) => startResize(e, "w")}
            />
            {/* top-left corner — both axes */}
            <div
              className="absolute top-0 left-0 w-7 h-7 cursor-nw-resize z-30 flex items-center justify-center group"
              onMouseDown={(e) => startResize(e, "both")}
              title="Drag to resize"
            >
              <svg viewBox="0 0 9 9" className="w-2.5 h-2.5 text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors">
                <circle cx="1.5" cy="1.5" r="0.9" fill="currentColor" />
                <circle cx="4.5" cy="1.5" r="0.9" fill="currentColor" />
                <circle cx="7.5" cy="1.5" r="0.9" fill="currentColor" />
                <circle cx="1.5" cy="4.5" r="0.9" fill="currentColor" />
                <circle cx="4.5" cy="4.5" r="0.9" fill="currentColor" />
                <circle cx="1.5" cy="7.5" r="0.9" fill="currentColor" />
              </svg>
            </div>

            {/* ── Header ─────────────────────────────── */}
            <div className="flex items-center justify-between pl-8 pr-3 py-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-accent" />
                <span className="font-display font-semibold text-xs">Live Terminal</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => { navigate("/terminal"); setPopup(null); }}
                  className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center"
                  title="Open full Terminal page"
                >
                  <Maximize2 className="w-3 h-3 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => setPopup(null)}
                  className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center"
                  aria-label="Close panel"
                >
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* ── Body ───────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col">
              <LiveTerminalPanel
                missionSessionId={resolvedSessionId}
                autoOpen={!shellDisabled}
                disabled={shellDisabled}
                compact
                panelVisible={popup === "terminal"}
              />
            </div>
          </div>

          {popup === "insights" && (
            <PopupPanel title="Quick Insights" icon={Lightbulb} onClose={() => setPopup(null)}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Missions", value: stats.missions, icon: Target },
                    { label: "Active", value: stats.running, icon: Radio },
                    { label: "Findings", value: stats.findings, icon: Bug },
                    { label: "Hosts", value: stats.hosts, icon: Server },
                    { label: "Exploits", value: stats.exploits, icon: Zap },
                    { label: "Done", value: stats.done, icon: CheckCircle2 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex flex-col items-center justify-center gap-1 p-2 rounded-xl bg-muted/30">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-display font-bold text-xl leading-none">{value}</span>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
                    </div>
                  ))}
                </div>
                {events.length > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5">Recent Events</div>
                    <div className="space-y-1.5">
                      {[...events].reverse().slice(0, 3).map((ev: TimelineEvent, i: number) => (
                        <div key={i} className="text-[10px] flex items-start gap-2 border-l-2 border-accent/40 pl-2">
                          <span className="text-muted-foreground shrink-0 font-mono">{ev.time}</span>
                          <span className="text-foreground">{ev.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {events.length === 0 && (
                  <p className="text-[11px] text-muted-foreground italic text-center py-1">No events yet. Start a mission to see activity.</p>
                )}
              </div>
            </PopupPanel>
          )}
          {popup === "alerts" && (
            <PopupPanel title="Alerts" icon={Bell} onClose={() => setPopup(null)}>
              <div className="space-y-2">
                {events.slice(-6).reverse().map((ev: TimelineEvent, i: number) => {
                  const severityColor =
                    ev.type === "exploit" ? "border-destructive/60" :
                    ev.type === "vuln" ? "border-warning/60" :
                    ev.type === "shell" ? "border-accent/60" : "border-border";
                  return (
                    <div key={i} className={`text-[11px] border-l-2 ${severityColor} pl-2`}>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span className="font-mono">{ev.time}</span>
                        <span className={`uppercase text-[9px] tracking-wider px-1.5 py-0.5 rounded-full ${
                          ev.type === "exploit" ? "bg-destructive/10 text-destructive" :
                          ev.type === "vuln" ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>{ev.type}</span>
                      </div>
                      <div className="text-foreground font-medium mt-0.5">{ev.label}</div>
                      {ev.detail && <div className="text-muted-foreground text-[10px] mt-0.5 truncate">{ev.detail}</div>}
                    </div>
                  );
                })}
                {!events.length && <p className="text-muted-foreground text-[11px] italic text-center py-2">No alerts yet.</p>}
              </div>
            </PopupPanel>
          )}
          {popup === "settings" && (
            <PopupPanel title="Quick Actions" icon={SlidersHorizontal} onClose={() => setPopup(null)}>
              <div className="space-y-3">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Navigate To</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { label: "Settings", icon: SlidersHorizontal, to: "/settings" },
                    { label: "Terminal", icon: Terminal, to: "/terminal" },
                    { label: "Missions", icon: ListTodo, to: "/missions" },
                    { label: "Scheduled", icon: CalendarClock, to: "/scheduled-scans" },
                    { label: "Findings", icon: Activity, to: "/findings" },
                    { label: "Hosts", icon: Server, to: "/hosts" },
                  ] as const).map(({ label, icon: Icon, to }) => (
                    <button
                      key={label}
                      onClick={() => { navigate(to); setPopup(null); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 hover:bg-muted text-xs transition-colors text-left"
                    >
                      <Icon className="w-3.5 h-3.5 text-accent shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
                <div className="pt-1 border-t border-border/50">
                  <button
                    onClick={() => { navigate("/settings"); setPopup(null); }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Open Full Settings
                  </button>
                </div>
              </div>
            </PopupPanel>
          )}
        </div>
      </div>
    </div>
  );
};
