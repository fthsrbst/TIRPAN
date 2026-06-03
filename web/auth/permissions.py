"""
Org-scoped RBAC permission matrix.

The four roles (owner > admin > analyst > viewer) keep a fixed hierarchy, but an
org admin/owner can toggle individual capabilities per role from
Settings → Roles & Permissions. Those overrides are stored on the organization
(`role_permissions_json`) and merged over the defaults below.

This module is the single source of truth for the *defaults* and the merge
logic; the frontend mirror lives in attack-graph-canvas/src/lib/permissions.ts.
`owner` is always granted everything and cannot be reduced by an override.
"""

from __future__ import annotations

# Overridable capability keys (kept in sync with permissions.ts).
PERMISSION_KEYS: list[str] = [
    "canCreateMission",
    "canDeleteMission",
    "canKillMission",
    "canPauseMission",
    "canAssignMission",
    "canUseTerminal",
    "canViewCredentials",
    "canInjectMessage",
    "canViewReports",
    "canInviteMembers",
    "canChangeRoles",
    "canManageBudgets",
]

_ANALYST_DEFAULTS = {
    "canCreateMission": True,
    "canDeleteMission": True,
    "canKillMission": True,
    "canPauseMission": True,
    "canAssignMission": False,
    "canUseTerminal": True,
    "canViewCredentials": True,
    "canInjectMessage": True,
    "canViewReports": True,
    "canInviteMembers": False,
    "canChangeRoles": False,
    "canManageBudgets": False,
}

DEFAULT_PERMISSIONS: dict[str, dict[str, bool]] = {
    "owner":   {k: True for k in PERMISSION_KEYS},
    "admin":   {k: True for k in PERMISSION_KEYS},
    "analyst": dict(_ANALYST_DEFAULTS),
    "viewer":  {k: (k == "canViewReports") for k in PERMISSION_KEYS},
}


def effective_permissions(role: str, override: dict | None) -> dict[str, bool]:
    """Merge an org's override matrix over the role defaults."""
    base = dict(DEFAULT_PERMISSIONS.get(role, DEFAULT_PERMISSIONS["viewer"]))
    if role == "owner":
        return base  # owner is non-reducible
    role_override = (override or {}).get(role) or {}
    for key in PERMISSION_KEYS:
        if key in role_override:
            base[key] = bool(role_override[key])
    return base


def has_permission(role: str, perm: str, override: dict | None) -> bool:
    return bool(effective_permissions(role, override).get(perm, False))
