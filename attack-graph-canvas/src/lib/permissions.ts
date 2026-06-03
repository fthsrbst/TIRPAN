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

import { useQuery } from "@tanstack/react-query";
import { useAuth, ROLE_HIERARCHY, api } from "./utils";
import type { AuthUser } from "./utils";

/** Org-scoped permission matrix: { role: { permKey: bool } }. */
type PermissionMatrix = Record<string, Record<string, boolean>>;

/**
 * Fetch the org's effective permission matrix (defaults merged with the admin's
 * overrides). Deduped across every usePermissions() caller by react-query, so
 * only one request is made app-wide. Returns null until loaded — callers fall
 * back to the built-in role defaults.
 */
function useOrgPermissionMatrix(enabled: boolean): PermissionMatrix | null {
  const { data } = useQuery({
    queryKey: ["org-permissions"],
    queryFn: () => api.get<{ permissions: PermissionMatrix }>("/auth/org/permissions"),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return data?.permissions ?? null;
}

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
  canManageBudgets: boolean;      // kullanıcı bütçe limiti belirleme (owner kısıtlayabilir)
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
  const matrix = useOrgPermissionMatrix(!!user);
  const lv = level(user);

  const role      = user?.role ?? "viewer";
  const isOwner   = role === "owner";
  const isAdmin   = role === "admin" || isOwner;
  const isAnalyst = lv >= (ROLE_HIERARCHY["analyst"] ?? 20);
  const isViewer  = role === "viewer";

  // Resolve a capability: owner always allowed; otherwise the org matrix wins
  // when it specifies the key, falling back to the built-in role default.
  const can = (key: string, def: boolean): boolean => {
    if (isOwner) return true;
    const roleMatrix = matrix?.[role];
    if (roleMatrix && key in roleMatrix) return !!roleMatrix[key];
    return def;
  };

  return {
    canCreateMission:  can("canCreateMission", isAnalyst),
    canDeleteMission:  can("canDeleteMission", isAnalyst),
    canKillMission:    can("canKillMission", isAnalyst),
    canPauseMission:   can("canPauseMission", isAnalyst),
    canAssignMission:  can("canAssignMission", isAdmin),

    canUseTerminal:    can("canUseTerminal", isAnalyst),
    canViewCredentials: can("canViewCredentials", isAnalyst),
    canInjectMessage:  can("canInjectMessage", isAnalyst),

    canViewReports:    can("canViewReports", true),

    canViewTeam:       true,
    canInviteMembers:  can("canInviteMembers", isAdmin),
    canChangeRoles:    can("canChangeRoles", isAdmin),
    canManageBudgets:  can("canManageBudgets", isAdmin),
    canManageOrg:      isOwner,

    role,
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
