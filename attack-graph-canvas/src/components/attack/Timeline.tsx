import { useState } from "react";
import { Play, Pause, Square, Terminal, Lightbulb, Bell, SlidersHorizontal, X, Loader2, OctagonMinus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { killSession, pauseSession, resumeSession } from "@/lib/api";
import type { TimelineData, TimelineEvent } from "@/hooks/useAttackGraphData";

interface TimelineProps {
  data?: TimelineData;
  sessionId?: string | null;
  isRunning?: boolean;
  target?: string;
  isDemoMode?: boolean;
}

const PopupPanel = ({ title, icon: Icon, children, onClose }: { title: string; icon: any; children: React.ReactNode; onClose: () => void }) => (
  <div className="absolute bottom-14 right-0 z-50 w-[360px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-accent" />
        <span className="font-display font-semibold text-xs">{title}</span>
      </div>
      <button onClick={onClose} className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center">
        <X className="w-3 h-3" />
      </button>
    </div>
    <div className="max-h-[300px] overflow-auto p-3">{children}</div>
  </div>
);

export const Timeline = ({ data, sessionId, isRunning: isRunningProp, target, isDemoMode }: TimelineProps) => {
  const queryClient = useQueryClient();
  const [popup, setPopup] = useState<string | null>(null);

  const steps = data?.steps?.length ? data.steps : [
    { label: "Recon", time: "—", done: false, active: false },
    { label: "Port Scan", time: "—", done: false, active: false },
    { label: "Web Foothold", time: "—", done: false, active: false },
    { label: "Cred Dump", time: "—", done: false, active: false },
    { label: "Privilege Esc.", time: "—", done: false, active: false },
    { label: "Lateral Move", time: "—", done: false, active: false },
    { label: "Domain Admin", time: "—", done: false, active: false },
  ];

  const currentTime = data?.currentTime || "—";
  const sessionDate = data?.sessionDate || "—";
  const events = data?.events || [];

  // Use the prop if provided (from parent with accurate session data), otherwise derive from steps
  const isRunning = isRunningProp !== undefined ? isRunningProp : steps.some((s) => s.active);
  const hasSession = !!sessionId;

  const onMutationSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["session-detail"] });
  };

  const killMut = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session");
      return killSession(sessionId);
    },
    onSuccess: onMutationSuccess,
  });

  const pauseMut = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session");
      return pauseSession(sessionId);
    },
    onSuccess: onMutationSuccess,
  });

  const resumeMut = useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No session");
      return resumeSession(sessionId);
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
          {target ? (
            <div className="font-display font-bold text-sm truncate max-w-[140px] flex items-center gap-1.5 mt-0.5">
              {target}
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

          {popup === "terminal" && (
            <PopupPanel title="Live Terminal" icon={Terminal} onClose={() => setPopup(null)}>
              <div className="text-[11px] font-mono text-muted-foreground space-y-1">
                <p>Connect to active agent sessions to run commands.</p>
                <p className="text-accent">Session: {sessionId?.slice(0, 8) || "—"}</p>
              </div>
            </PopupPanel>
          )}
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
