from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, status

from database.repositories import InvitationRepository, OrganizationRepository, UserRepository
from web.auth.models import (
    InviteCreate,
    InviteJoin,
    InvitePreview,
    InviteResponse,
    OrgCreate,
    OrgResponse,
    OrgUpdate,
    RoleUpdate,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
    ROLE_HIERARCHY,
)
from web.auth.service import hash_password, verify_password, create_access_token
from web.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_repo = UserRepository()
_org_repo = OrganizationRepository()
_inv_repo = InvitationRepository()

_DUMMY_HASH = "$2b$12$KIXFakeHashToPreventTimingAttackXXXXXXXXXXXXXXXXXXXXX"


# ── Kayıt ─────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=Token, status_code=201)
async def register(body: UserCreate):
    """
    İki kayıt yolu:
    1. `org_name` → Yeni şirket/organizasyon oluştur, ilk kullanıcı **owner** olur.
    2. `invite_token` → Mevcut bir org'a davet bağlantısıyla katıl.

    Her ikisi de sağlanmazsa hata döner.
    """
    # Üç mod: org kur | davete katıl | org'suz bireysel hesap

    if await _repo.email_exists(body.email):
        raise HTTPException(status_code=409, detail="This email is already registered.")

    hashed = hash_password(body.password)

    # ── Senaryo 1: Mevcut org'a davet ile katılım ────────────────────────────
    if body.invite_token:
        invite = await _inv_repo.get_by_token(body.invite_token)
        if not invite:
            raise HTTPException(status_code=404, detail="Invalid invitation link.")
        if invite["used_at"] is not None:
            raise HTTPException(status_code=410, detail="This invitation link has already been used.")
        if invite["expires_at"] < time.time():
            raise HTTPException(status_code=410, detail="This invitation link has expired.")

        # E-posta kısıtlaması varsa kontrol et
        if invite["email"] and invite["email"] != body.email.lower():
            raise HTTPException(
                status_code=403,
                detail=f"This invitation is only valid for '{invite['email']}'.",
            )

        # Org domain kısıtlaması
        org = await _org_repo.get(invite["org_id"])
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found.")
        if org.get("allowed_email_domain"):
            user_domain = body.email.lower().split("@")[-1]
            if user_domain != org["allowed_email_domain"]:
                raise HTTPException(
                    status_code=403,
                    detail=f"This organization only allows email addresses ending with @{org['allowed_email_domain']}.",
                )

        user_row = await _repo.create(
            email=body.email,
            full_name=body.full_name,
            hashed_password=hashed,
            role=invite["role"],
            org_id=invite["org_id"],
        )
        await _inv_repo.mark_used(body.invite_token)

    # ── Senaryo 2: Yeni organizasyon oluştur, owner ol ───────────────────────
    elif body.org_name:
        user_row = await _repo.create(
            email=body.email,
            full_name=body.full_name,
            hashed_password=hashed,
            role="owner",
        )
        org = await _org_repo.create(
            name=body.org_name,
            owner_id=user_row["id"],
        )
        await _repo.set_org(user_row["id"], org["id"])
        user_row = await _repo.get_by_id(user_row["id"])

    # ── Senaryo 3: Org'suz bireysel hesap → analyst ───────────────────────────
    else:
        user_row = await _repo.create(
            email=body.email,
            full_name=body.full_name,
            hashed_password=hashed,
            role="analyst",
        )

    token = create_access_token({"sub": user_row["id"], "role": user_row["role"]})
    return Token(access_token=token, user=UserResponse.from_row(user_row))


# ── Giriş ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=Token)
async def login(body: UserLogin):
    user = await _repo.get_by_email(body.email)
    candidate_hash = user["hashed_password"] if user else _DUMMY_HASH
    if not verify_password(body.password, candidate_hash) or not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    await _repo.update_last_login(user["id"])
    token = create_access_token(
        {"sub": user["id"], "role": user["role"]},
        remember_me=body.remember_me,
    )
    return Token(access_token=token, user=UserResponse.from_row(user))


# ── Mevcut kullanıcı ──────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse.from_row(current_user)


# ── Kullanıcı yönetimi (owner / admin) ───────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
async def list_users(current_user: dict = Depends(require_role("owner", "admin"))):
    """Kendi org'undaki tüm kullanıcıları listeler."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="This account is not linked to an organization.")
    rows = await _repo.list_by_org(org_id)
    return [UserResponse.from_row(r) for r in rows]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot change your own role.")

    target = await _repo.get_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    # Org izolasyonu — sadece kendi org üyeleri yönetilebilir
    if target.get("org_id") != current_user.get("org_id"):
        raise HTTPException(status_code=403, detail="This user belongs to a different organization.")

    # Admin, owner rolü atayamaz; sadece owner yapabilir
    if body.role == "owner" and current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only an owner may assign the owner role to another user.")

    # Admin, kendisinden üst roldeki birini düşüremez
    target_level = ROLE_HIERARCHY.get(target["role"], 0)
    current_level = ROLE_HIERARCHY.get(current_user["role"], 0)
    if target_level >= current_level and current_user["role"] != "owner":
        raise HTTPException(
            status_code=403,
            detail="You cannot change the role of a user at your level or higher.",
        )

    await _repo.update_role(user_id, body.role)
    row = await _repo.get_by_id(user_id)
    return UserResponse.from_row(row)


@router.patch("/users/{user_id}/active", response_model=UserResponse)
async def update_user_active(
    user_id: str,
    is_active: bool,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")

    target = await _repo.get_by_id(user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.get("org_id") != current_user.get("org_id"):
        raise HTTPException(status_code=403, detail="This user belongs to a different organization.")

    # Admin, owner'ı devre dışı bırakamaz
    if target["role"] == "owner" and current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only an owner may deactivate another owner.")

    await _repo.update_active(user_id, is_active)
    row = await _repo.get_by_id(user_id)
    return UserResponse.from_row(row)


# ── Organizasyon ──────────────────────────────────────────────────────────────

@router.get("/org", response_model=OrgResponse)
async def get_my_org(current_user: dict = Depends(get_current_user)):
    """Giriş yapan kullanıcının organizasyon bilgilerini döner."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=404, detail="This account is not linked to an organization yet.")
    org = await _org_repo.get(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return OrgResponse.from_row(org)


@router.patch("/org", response_model=OrgResponse)
async def update_org(
    body: OrgUpdate,
    current_user: dict = Depends(require_role("owner")),
):
    """Org bilgilerini güncelle — sadece owner."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="This account is not linked to an organization.")
    await _org_repo.update(
        org_id,
        name=body.name,
        allowed_email_domain=body.allowed_email_domain,
    )
    org = await _org_repo.get(org_id)
    return OrgResponse.from_row(org)


@router.post("/org", response_model=Token, status_code=201)
async def create_org_for_existing_user(
    body: OrgCreate,
    current_user: dict = Depends(get_current_user),
):
    """Mevcut kullanıcı için yeni org oluştur — sadece org'suz hesaplar."""
    if current_user.get("org_id"):
        raise HTTPException(status_code=400, detail="You are already part of an organization.")
    user_id = current_user["id"]
    org = await _org_repo.create(name=body.name, owner_id=user_id)
    await _repo.set_org(user_id, org["id"])
    await _repo.update_role(user_id, "owner")
    user_row = await _repo.get_by_id(user_id)
    token = create_access_token({"sub": user_row["id"], "role": user_row["role"]})
    return Token(access_token=token, user=UserResponse.from_row(user_row))


@router.post("/org/join", response_model=Token)
async def join_org_with_invite(
    body: InviteJoin,
    current_user: dict = Depends(get_current_user),
):
    """Davet tokeni ile mevcut kullanıcıyı bir org'a ekle."""
    if current_user.get("org_id"):
        raise HTTPException(status_code=400, detail="You are already part of an organization.")
    invite = await _inv_repo.get_by_token(body.invite_token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invitation link.")
    if invite["used_at"] is not None:
        raise HTTPException(status_code=410, detail="This invitation link has already been used.")
    if invite["expires_at"] < time.time():
        raise HTTPException(status_code=410, detail="This invitation link has expired.")
    if invite["email"] and invite["email"] != current_user["email"]:
        raise HTTPException(status_code=403, detail=f"This invitation is only valid for '{invite['email']}'.")
    org = await _org_repo.get(invite["org_id"])
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    if org.get("allowed_email_domain"):
        user_domain = current_user["email"].lower().split("@")[-1]
        if user_domain != org["allowed_email_domain"]:
            raise HTTPException(
                status_code=403,
                detail=f"This organization only allows @{org['allowed_email_domain']} addresses.",
            )
    await _repo.set_org(current_user["id"], invite["org_id"])
    await _repo.update_role(current_user["id"], invite["role"])
    await _inv_repo.mark_used(body.invite_token)
    user_row = await _repo.get_by_id(current_user["id"])
    token = create_access_token({"sub": user_row["id"], "role": user_row["role"]})
    return Token(access_token=token, user=UserResponse.from_row(user_row))


# ── Davetler ──────────────────────────────────────────────────────────────────

@router.post("/org/invitations", response_model=InviteResponse, status_code=201)
async def create_invitation(
    body: InviteCreate,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    """
    Org'a yeni üye davet et.
    - owner: her rolü davet edebilir (owner dahil)
    - admin: analyst ve viewer davet edebilir
    """
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="This account is not linked to an organization.")

    # Admin, owner rolünde davet gönderemez
    if body.role == "owner" and current_user["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only an owner may send invitations for the owner role.")

    # Admin sadece kendi rolünün altını davet edebilir
    if current_user["role"] == "admin" and body.role == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot invite other admins; an owner must do that.")

    invite = await _inv_repo.create(
        org_id=org_id,
        invited_by=current_user["id"],
        role=body.role,
        email=body.email,
        expire_hours=body.expire_hours,
    )
    return InviteResponse.from_row(invite)


@router.get("/org/invitations", response_model=list[InviteResponse])
async def list_invitations(current_user: dict = Depends(require_role("owner", "admin"))):
    """Org'un tüm davetlerini listeler."""
    org_id = current_user.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="This account is not linked to an organization.")
    rows = await _inv_repo.list_for_org(org_id)
    return [InviteResponse.from_row(r) for r in rows]


@router.delete("/org/invitations/{invite_id}", status_code=204)
async def revoke_invitation(
    invite_id: str,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    """Kullanılmamış bir daveti iptal et."""
    org_id = current_user.get("org_id")
    invite = await _inv_repo.get_by_id(invite_id)
    if not invite or invite["org_id"] != org_id:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if invite.get("used_at"):
        raise HTTPException(status_code=409, detail="Used invitations cannot be revoked.")
    await _inv_repo.revoke(invite_id)


@router.get("/invitations/{token}", response_model=InvitePreview)
async def preview_invitation(token: str):
    """
    Herkes erişebilir — kayıt ekranında davet bilgilerini göstermek için kullanılır.
    Hassas bilgi içermez (token'ı zaten biliyorlar).
    """
    invite = await _inv_repo.get_by_token(token)
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or unknown invitation link.")

    org = await _org_repo.get(invite["org_id"])
    org_name = org["name"] if org else "Unknown"

    from web.auth.models import ROLE_LABELS
    role = invite.get("role", "viewer")
    now = time.time()
    return InvitePreview(
        org_id=invite["org_id"],
        org_name=org_name,
        role=role,
        role_label=ROLE_LABELS.get(role, role.capitalize()),
        email=invite.get("email", ""),
        expires_at=invite["expires_at"],
        is_valid=invite.get("used_at") is None and invite["expires_at"] > now,
    )
