/**
 * Merkezi RBAC yetki sistemi.
 *
 * Rol hiyerarşisi (yüksek → düşük):
 *   owner (40) → admin (30) → analyst (20) → viewer (10)
 *
 * Kullanım:
 *   const perms = usePermissions();
 *   if (!perms.canCreateMission) return null;
 */

import { useAuth, ROLE_HIERARCHY } from "./utils";
import type { AuthUser } from "./utils";

export interface Permissions {
  // Mission / Session
  canCreateMission: boolean;
  canDeleteMission: boolean;      // analyst: sadece kendi / admin+owner: hepsi
  canKillMission: boolean;
  canPauseMission: boolean;
  canAssignMission: boolean;      // owner + admin

  // Terminal & araçlar
  canUseTerminal: boolean;
  canViewCredentials: boolean;
  canInjectMessage: boolean;

  // Raporlar & bulgular (herkes görebilir)
  canViewReports: boolean;

  // Takım yönetimi
  canViewTeam: boolean;           // admin+owner: tam, analyst+viewer: sadece üye listesi
  canInviteMembers: boolean;      // admin + owner
  canChangeRoles: boolean;        // admin (altını) + owner (hepsini)
  canManageOrg: boolean;          // owner only

  // Hesap bilgileri
  role: string;
  isOwner: boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
  isViewer: boolean;
  user: AuthUser | null;
}

function level(user: AuthUser | null): number {
  if (!user) return 0;
  return ROLE_HIERARCHY[user.role] ?? 0;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const lv = level(user);

  const isOwner   = user?.role === "owner";
  const isAdmin   = user?.role === "admin" || isOwner;
  const isAnalyst = lv >= (ROLE_HIERARCHY["analyst"] ?? 20);
  const isViewer  = user?.role === "viewer";

  return {
    canCreateMission:  isAnalyst,
    canDeleteMission:  isAnalyst,
    canKillMission:    isAnalyst,
    canPauseMission:   isAnalyst,
    canAssignMission:  isAdmin,

    canUseTerminal:    isAnalyst,
    canViewCredentials: isAnalyst,
    canInjectMessage:  isAnalyst,

    canViewReports:    true,

    canViewTeam:       isAdmin,
    canInviteMembers:  isAdmin,
    canChangeRoles:    isAdmin,
    canManageOrg:      isOwner,

    role:      user?.role ?? "viewer",
    isOwner,
    isAdmin,
    isAnalyst,
    isViewer,
    user,
  };
}

/**
 * Belirli bir session üzerinde işlem yapılıp yapılamayacağını kontrol eder.
 * Analyst: yalnızca created_by === user.id veya assigned_to === user.id olan session'lara müdahale edebilir.
 */
export function canActOnSession(
  perms: Permissions,
  session: { created_by?: string; assigned_to?: string } | null | undefined,
): boolean {
  if (!session) return false;
  if (perms.isAdmin) return true;
  if (!perms.isAnalyst) return false;
  const uid = perms.user?.id;
  return session.created_by === uid || session.assigned_to === uid;
}
