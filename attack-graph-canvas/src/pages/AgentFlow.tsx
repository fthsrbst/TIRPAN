import { useState, useMemo } from "react";
import { PageShell } from "@/components/attack/PageShell";
import { AgentFlowStream } from "@/components/attack/AgentFlowStream";
import { TirpanChat } from "@/components/attack/TirpanChat";
import { useQuery } from "@tanstack/react-query";
import { getSessions } from "@/lib/api";
import { useSessionContext } from "@/lib/SessionContext";
import { sessionDisplayLabel } from "@/lib/sessionDisplay";
import { MessageSquare, Radio, X } from "lucide-react";

const AgentFlow = () => {
  const { selectedSessionId } = useSessionContext();
  const { data: sessions = [] } = useQuery<any[]>({ queryKey: ["sessions"], queryFn: getSessions, refetchInterval: 10000 });
  const [picked, setPicked] = useState<string>("auto");
  const [chatOpen, setChatOpen] = useState(true);

  const autoResolved = useMemo(
    () => (sessions as any[]).find((s) => s.is_running || s.status === "running") || (sessions as any[])[0] || null,
    [sessions],
  );

  const effectiveId: string | null =
    selectedSessionId || (picked !== "auto" ? picked : autoResolved?.id) || null;

  const session = useMemo(
    () => (sessions as any[]).find((s) => s.id === effectiveId) || (effectiveId === autoResolved?.id ? autoResolved : null),
    [sessions, effectiveId, autoResolved],
  );

  const running = !!(session?.is_running || session?.status === "running");

  return (
    <PageShell
      title="Agent Flow"
      subtitle="Live reasoning stream, tool calls & results — plus a direct ops chat"
      contentScrollable={false}
    >
      <div className="flex flex-col h-full min-h-0 gap-3">
        {/* Control bar */}
        <div className="shrink-0 flex items-center gap-3 flex-wrap">
          {selectedSessionId && session ? (
            <div className="flex items-center gap-2 h-9 px-3 rounded-full bg-accent/10 text-accent text-xs font-medium">
              <Radio className="w-3.5 h-3.5" />
              <span className="truncate max-w-[260px]">{sessionDisplayLabel(session) || session.target || effectiveId}</span>
              <span className="text-[10px] text-muted-foreground">(pinned)</span>
            </div>
          ) : (
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="h-9 rounded-full bg-muted border border-border text-xs px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary max-w-[280px]"
            >
              <option value="auto">Auto — latest running session</option>
              {(sessions as any[]).map((s) => (
                <option key={s.id} value={s.id}>
                  {(s.target || s.id) + (s.is_running || s.status === "running" ? " · live" : "")}
                </option>
              ))}
            </select>
          )}

          {session && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${running ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                {session.status || "idle"}
              </span>
              {session.mode && <span className="hidden md:inline">mode: {session.mode}</span>}
            </div>
          )}

          <div className="ml-auto">
            {!chatOpen && (
              <button
                onClick={() => setChatOpen(true)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-border/60 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Open chat
              </button>
            )}
          </div>
        </div>

        {/* Flow + chat */}
        <div className="flex-1 min-h-0 flex gap-3">
          <AgentFlowStream className="flex-1 min-w-0" sessionId={effectiveId} session={session} />
          {chatOpen && (
            <TirpanChat className="w-[300px] md:w-[360px] lg:w-[400px] shrink-0" onClose={() => setChatOpen(false)} />
          )}
        </div>
      </div>
    </PageShell>
  );
};

export default AgentFlow;
