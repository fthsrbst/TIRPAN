/**
 * Detects new sessions assigned to the current user and shows bottom-right Sonner toasts.
 *
 * Overview polls sessions every ~5s; this hook compares snapshots, finds rows where
 * `assigned_to === user.id` was not seen before, and records IDs in localStorage so
 * the same assignment is not notified repeatedly in one browser session.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePermissions } from "@/lib/permissions";

const SEEN_KEY = "tirpan_seen_assignments";

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markSeen(ids: string[]) {
  const current = getSeenIds();
  ids.forEach((id) => current.add(id));
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...current]));
  } catch {}
}

export function useAssignmentNotifications(sessions: any[]) {
  const perms = usePermissions();
  const seenRef = useRef<Set<string>>(getSeenIds());

  useEffect(() => {
    if (!perms.user?.id || !sessions.length) return;

    const userId = perms.user.id;
    const newlyAssigned = sessions.filter(
      (s: any) =>
        s.assigned_to === userId &&
        !seenRef.current.has(s.id as string)
    );

    if (!newlyAssigned.length) return;

    newlyAssigned.forEach((s: any) => {
      toast("New assignment", {
        description: `Mission "${s.target || s.id}" was assigned to you.`,
        duration: 6000,
        action: {
          label: "Open Missions",
          onClick: () => {
            window.location.href = "/normal/missions";
          },
        },
      });
      seenRef.current.add(s.id as string);
    });

    markSeen(newlyAssigned.map((s: any) => s.id as string));
  }, [sessions, perms.user?.id]);
}
