import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/lib/SessionContext";
import { ThemeInit } from "@/lib/ThemeInit";
import { api } from "@/lib/utils";
import Overview from "./pages/Overview";
import Missions from "./pages/Missions";
import AttackGraphPage from "./pages/AttackGraphPage";
import ExpertLogPage from "./pages/ExpertLogPage";
import Agents from "./pages/Agents";
import AgentFlow from "./pages/AgentFlow";
import Hosts from "./pages/Hosts";
import Findings from "./pages/Findings";
import Credentials from "./pages/Credentials";
import Reports from "./pages/Reports";
import Pipelines from "./pages/Pipelines";
import TerminalPage from "./pages/TerminalPage";
import Exploits from "./pages/Exploits";
import AttackMatrix from "./pages/AttackMatrix";
import SettingsPage from "./pages/SettingsPage";
import NewMission from "./pages/NewMission";
import ScheduledScans from "./pages/ScheduledScans";
import V3IntelPage from "./pages/V3Intel";
import NotFound from "./pages/NotFound.tsx";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import InvitePage from "./pages/InvitePage";
import TeamPage from "./pages/TeamPage";
import ProfilePage from "./pages/ProfilePage";
import DemoEntry from "./pages/DemoEntry";
import ProtectedRoute from "./components/ProtectedRoute";
import { CommandPalette } from "./components/attack/CommandPalette";
import { nextOccurrence, type Recurrence, type ScheduledMission } from "./pages/ScheduledScans";

const SCHED_KEY   = "tirpan_scheduled_missions";
const HISTORY_KEY = "tirpan_sched_history";
const NOTIF_KEY   = "tirpan_notifications";
const NOTIF_SENT  = "tirpan_notif_sent"; // tracks "missionId:thresholdMin" already notified

/** Push a notification to localStorage */
function pushNotif(notif: { type: "approaching" | "launched" | "failed"; title: string; body: string }) {
  try {
    const arr = JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]");
    arr.unshift({ id: `n_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, ...notif, at: new Date().toISOString(), read: false });
    localStorage.setItem(NOTIF_KEY, JSON.stringify(arr.slice(0, 50)));
    window.dispatchEvent(new Event("tirpan-notif"));
  } catch { /* ignore */ }
}

/** Check if a notification for mission+threshold has already been sent */
function notifSentKey(id: string, threshold: number) { return `${id}:${threshold}`; }
function wasNotifSent(id: string, threshold: number): boolean {
  try { const s = JSON.parse(localStorage.getItem(NOTIF_SENT) || "{}"); return !!s[notifSentKey(id, threshold)]; } catch { return false; }
}
function markNotifSent(id: string, threshold: number) {
  try {
    const s = JSON.parse(localStorage.getItem(NOTIF_SENT) || "{}");
    s[notifSentKey(id, threshold)] = 1;
    // Prune old entries (keep at most 200)
    const keys = Object.keys(s);
    if (keys.length > 200) keys.slice(0, keys.length - 200).forEach(k => delete s[k]);
    localStorage.setItem(NOTIF_SENT, JSON.stringify(s));
  } catch { /* ignore */ }
}

/** Is this hour inside the blackout window? */
function inBlackout(r: Recurrence): boolean {
  if (r.blackoutStart == null || r.blackoutEnd == null) return false;
  const h = new Date().getHours();
  if (r.blackoutStart <= r.blackoutEnd) return h >= r.blackoutStart && h < r.blackoutEnd;
  return h >= r.blackoutStart || h < r.blackoutEnd; // wraps midnight
}

// ── Global schedule auto-launcher ────────────────────────────────────────────
function ScheduleTicker() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const tick = async () => {
      let stored: ScheduledMission[];
      try { stored = JSON.parse(localStorage.getItem(SCHED_KEY) || "[]"); } catch { return; }

      const now = Date.now();

      // ── Approach notifications (30 min and 5 min) ──
      for (const m of stored) {
        const msUntil = new Date(m.scheduledAt).getTime() - now;
        const label = m.name || m.target || "Scan";
        for (const threshold of [30, 5]) {
          const windowMs = threshold * 60_000;
          const inWindow = msUntil > 0 && msUntil <= windowMs + 30_000 && msUntil > windowMs - 30_000;
          if (inWindow && !wasNotifSent(m.id, threshold)) {
            markNotifSent(m.id, threshold);
            pushNotif({ type: "approaching", title: threshold === 30 ? "Scan in 30 minutes" : "⚡ Scan in 5 minutes", body: `${label} → ${m.target || ""}` });
          }
        }
      }

      const due = stored.filter(m => new Date(m.scheduledAt).getTime() <= now);
      if (due.length === 0) return;

      let history: object[];
      try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { history = []; }

      const stillPending: ScheduledMission[] = stored.filter(m => new Date(m.scheduledAt).getTime() > now);

      for (const mission of due) {
        const rec = mission.recurrence;
        const isRecurring = rec && rec.type !== "once";

        // ── Blackout: skip this tick, re-schedule to next occurrence ──
        if (isRecurring && rec && inBlackout(rec)) {
          const next = nextOccurrence(rec, now + 60_000);
          if (next) stillPending.push({ ...mission, scheduledAt: next.toISOString(), recurrence: { ...rec, runsCompleted: rec.runsCompleted ?? 0 } });
          continue;
        }

        // ── Max runs reached → drop ──
        const runsCompleted = (rec?.runsCompleted ?? 0) + 1;
        if (isRecurring && rec?.maxRuns != null && runsCompleted > rec.maxRuns) {
          history.unshift({ id: mission.id, name: mission.name, target: mission.target, launchedAt: new Date().toISOString(), status: "skipped", reason: "Max runs reached", recurrent: true });
          continue;
        }

        // ── Launch ──
        try {
          await api.post("/sessions", mission.payload);
          qc.invalidateQueries({ queryKey: ["sessions"] });
          history.unshift({ id: mission.id, name: mission.name, target: mission.target, launchedAt: new Date().toISOString(), status: "launched", recurrent: isRecurring });
          pushNotif({ type: "launched", title: "✓ Scan launched", body: `${mission.name || mission.target || "Scan"} started` });

          // Webhook notification
          if (rec?.webhookUrl) {
            fetch(rec.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "scan_launched", mission: mission.name, target: mission.target, at: new Date().toISOString() }) }).catch(() => {});
          }

          // Schedule next occurrence for recurring missions
          if (isRecurring && rec) {
            const updatedRec: Recurrence = { ...rec, runsCompleted };
            const next = nextOccurrence(updatedRec, now);
            if (next && (rec.maxRuns == null || runsCompleted < rec.maxRuns)) {
              stillPending.push({ ...mission, scheduledAt: next.toISOString(), recurrence: updatedRec });
            }
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : "Error";
          history.unshift({ id: mission.id, name: mission.name, target: mission.target, launchedAt: new Date().toISOString(), status: "failed", error: errMsg, recurrent: isRecurring });
          pushNotif({ type: "failed", title: "✗ Launch failed", body: `${mission.name || mission.target || "Scan"}: ${errMsg}` });
          console.error("[SCHED] Auto-launch failed:", e);

          // Retry on failure
          if (rec?.retryOnFailure && (rec.runsCompleted ?? 0) < (rec.maxRetries ?? 1)) {
            const retryIn = 5 * 60_000; // retry after 5 min
            stillPending.push({ ...mission, scheduledAt: new Date(now + retryIn).toISOString(), recurrence: { ...rec, runsCompleted: (rec.runsCompleted ?? 0) + 1 } });
          } else if (isRecurring && rec) {
            // Still reschedule next occurrence even if this run failed
            const next = nextOccurrence(rec, now);
            if (next) stillPending.push({ ...mission, scheduledAt: next.toISOString(), recurrence: { ...rec, runsCompleted } });
          }
        }
      }

      localStorage.setItem(SCHED_KEY, JSON.stringify(stillPending));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
      if (due.length > 0 && !stillPending.some(m => m.id === due[0]?.id)) navigate("/missions");
    };

    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SessionProvider>
        <ThemeInit />
        <Toaster />
        <Sonner position="bottom-right" richColors />
        <BrowserRouter basename="/normal">
          <ScheduleTicker />
          <CommandPalette />
          <Routes>
            <Route path="/demo" element={<DemoEntry />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/" element={<ProtectedRoute><Overview /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute minRole="admin"><TeamPage /></ProtectedRoute>} />
            <Route path="/missions" element={<ProtectedRoute><Missions /></ProtectedRoute>} />
            <Route path="/attack-graph" element={<ProtectedRoute><AttackGraphPage /></ProtectedRoute>} />
            <Route path="/expert-log" element={<ProtectedRoute><ExpertLogPage /></ProtectedRoute>} />
            <Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
            <Route path="/agent-flow" element={<ProtectedRoute minRole="analyst"><AgentFlow /></ProtectedRoute>} />
            <Route path="/hosts" element={<ProtectedRoute><Hosts /></ProtectedRoute>} />
            <Route path="/findings" element={<ProtectedRoute><Findings /></ProtectedRoute>} />
            <Route path="/credentials" element={<ProtectedRoute><Credentials /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/pipelines" element={<ProtectedRoute><Pipelines /></ProtectedRoute>} />
            <Route path="/terminal" element={<ProtectedRoute minRole="analyst"><TerminalPage /></ProtectedRoute>} />
            <Route path="/exploits" element={<ProtectedRoute><Exploits /></ProtectedRoute>} />
            <Route path="/attack-matrix" element={<ProtectedRoute><AttackMatrix /></ProtectedRoute>} />
            <Route path="/v3-intel" element={<ProtectedRoute><V3IntelPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/missions/new" element={<ProtectedRoute minRole="analyst"><NewMission /></ProtectedRoute>} />
            <Route path="/scheduled-scans" element={<ProtectedRoute><ScheduledScans /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
