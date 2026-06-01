import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Pause, Square, Terminal, Lightbulb, Bell, SlidersHorizontal, X, Loader2, OctagonMinus, Maximize2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { killSession, pauseSession, resumeSession } from "@/lib/api";
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

  return (
    <div className="relative">
      <div className="flex items-center gap-3 bg-card rounded-full p-2 pl-3 border border-border/50 shadow-[var(--shadow-card)] w-full min-w-0">
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
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>Real-time attack path analytics.</p>
                <p>Events captured: {events.length}</p>
              </div>
            </PopupPanel>
          )}
          {popup === "alerts" && (
            <PopupPanel title="Alerts" icon={Bell} onClose={() => setPopup(null)}>
              <div className="space-y-2">
                {events.slice(-6).map((ev: TimelineEvent, i: number) => (
                  <div key={i} className="text-[11px] border-l-2 border-border pl-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{ev.time}</span>
                      <span className="uppercase text-[9px] tracking-wider">{ev.type}</span>
                    </div>
                    <div className="text-foreground font-medium">{ev.label}</div>
                    <div className="text-muted-foreground">{ev.detail}</div>
                  </div>
                ))}
                {!events.length && <p className="text-muted-foreground text-[11px] italic">No alerts yet.</p>}
              </div>
            </PopupPanel>
          )}
          {popup === "settings" && (
            <PopupPanel title="Mission Settings" icon={SlidersHorizontal} onClose={() => setPopup(null)}>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>Adjust scan speed, scope, and notification preferences.</p>
              </div>
            </PopupPanel>
          )}
        </div>
      </div>
    </div>
  );
};
