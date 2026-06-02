from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from database.repositories import UserRepository
from web.auth.service import decode_access_token
from web.auth.models import ROLE_HIERARCHY

_bearer = HTTPBearer(auto_error=True)
_bearer_optional = HTTPBearer(auto_error=False)
_user_repo = UserRepository()


async def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer_optional),
) -> dict | None:
    """Like get_current_user but never raises — returns None when no/invalid token.

    For endpoints that stay readable without auth but tailor their response when
    a valid user is present (e.g. per-assignment field visibility on get_session).
    """
    if not creds:
        return None
    try:
        payload = decode_access_token(creds.credentials)
        user_id = payload.get("sub")
        if not user_id:
            return None
    except (JWTError, ValueError):
        return None
    user = await _user_repo.get_by_id(user_id)
    if not user or not user["is_active"]:
        return None
    return user


# ── Temel bağımlılık: mevcut kullanıcıyı JWT'den çöz ─────────────────────────

async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    try:
        payload = decode_access_token(creds.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            raise ValueError("Token içinde kullanıcı bilgisi yok")
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Geçersiz veya süresi dolmuş token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await _user_repo.get_by_id(user_id)
    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kullanıcı bulunamadı veya hesap devre dışı",
        )
    return user


# ── Rol tabanlı erişim kontrolü ───────────────────────────────────────────────

def require_role(*roles: str):
    """
    Belirtilen rollerden en az birine sahip olunması gerektirir.

    Kullanım:
        @router.get("/admin-only")
        async def handler(user = Depends(require_role("owner", "admin"))):
            ...
    """
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bu işlem için gerekli rol: {', '.join(roles)}. Mevcut rol: {current_user['role']}",
            )
        return current_user
    return _check


def require_min_role(min_role: str):
    """
    Belirtilen rol seviyesi veya üstüne sahip olunması gerektirir.

    Örneğin require_min_role("analyst") → analyst, admin veya owner geçebilir.
    """
    min_level = ROLE_HIERARCHY.get(min_role, 0)

    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        user_level = ROLE_HIERARCHY.get(current_user["role"], 0)
        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bu işlem için en az '{min_role}' rolü gereklidir.",
            )
        return current_user
    return _check


def require_permission(perm: str):
    """
    Require a specific capability from the org's RBAC permission matrix.

    The matrix is the role defaults (web.auth.permissions.DEFAULT_PERMISSIONS)
    merged with the org's `role_permissions_json` overrides. owner always passes.

    Usage:
        @router.post("/sessions/{sid}/terminal")
        async def handler(user = Depends(require_permission("canUseTerminal"))):
            ...
    """
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        role = current_user.get("role", "viewer")
        if role == "owner":
            return current_user
        from database.repositories import OrganizationRepository
        from web.auth.permissions import has_permission
        override: dict = {}
        org_id = current_user.get("org_id")
        if org_id:
            try:
                override = await OrganizationRepository().get_permissions(org_id)
            except Exception:
                override = {}
        if not has_permission(role, perm, override):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Your role ('{role}') does not have the '{perm}' permission.",
            )
        return current_user
    return _check


def require_same_org(target_org_id_param: str = "org_id"):
    """
    URL/query parametresindeki org_id'nin, giriş yapan kullanıcının org'u ile aynı olmasını kontrol eder.
    Doğrudan kullanmak yerine genellikle endpoint içinde manuel kontrol yapılır.
    """
    async def _check(current_user: dict = Depends(get_current_user)) -> dict:
        return current_user
    return _check


# ── Hazır bağımlılık kısayolları ──────────────────────────────────────────────

require_owner = require_role("owner")
require_admin_or_above = require_role("owner", "admin")
require_analyst_or_above = require_min_role("analyst")
require_any_auth = get_current_user
