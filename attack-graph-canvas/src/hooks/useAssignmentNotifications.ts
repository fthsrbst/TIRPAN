/**
 * Kullanıcıya atanan yeni görevleri tespit edip sağ altta Sonner toast bildirimi gösterir.
 *
 * Strateji:
 *   - Her 5 saniyede getSessions() zaten Overview'de polling yapıyor.
 *   - Bu hook ayrıca sessions listesini izler; önceki snapshot ile karşılaştırarak
 *     `assigned_to === user.id` olan ve daha önce görmediğimiz session'ları bulur.
 *   - Görülen ID'leri localStorage'da saklar (oturum boyunca tekrar bildirim çıkmaz).
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
      toast("Yeni Görev Atandı", {
        description: `"${s.target || s.id}" görevi size atandı.`,
        duration: 6000,
        action: {
          label: "Göreve Git",
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
