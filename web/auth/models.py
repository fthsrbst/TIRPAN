from __future__ import annotations

import re
import time
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# ── Rol tanımları ──────────────────────────────────────────────────────────────
# owner   → süper admin (şirketi yönetir, silinemez/düşürülemez admin tarafından)
# admin   → takım yöneticisi (davet gönderir, rol atar — owner hariç)
# analyst → operatör (pentest session'ı oluşturur ve yönetir)
# viewer  → salt-okunur (sonuçları görür, session oluşturamaz)

ROLE_LABELS = {
    "owner":   "Owner",
    "admin":   "Admin",
    "analyst": "Analyst",
    "viewer":  "Viewer",
}

ROLE_HIERARCHY: dict[str, int] = {
    "owner":   40,
    "admin":   30,
    "analyst": 20,
    "viewer":  10,
}

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


# ── Kullanıcı kayıt / giriş ────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str = Field(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    full_name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)

    # Kayıt yöntemi (üçü de opsiyonel):
    # - org_name verilirse → yeni org kur, owner ol
    # - invite_token verilirse → davete katıl (role davetten gelir)
    # - ikisi de yoksa → org'suz bireysel hesap, analyst rolü
    invite_token: str | None = Field(default=None, description="Davet tokeni ile org'a katıl")
    org_name: str | None = Field(default=None, min_length=2, max_length=100, description="Yeni org oluştur ve owner ol")

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Şifre en az bir büyük harf içermelidir")
        if not any(c.isdigit() for c in v):
            raise ValueError("Şifre en az bir rakam içermelidir")
        return v


class UserLogin(BaseModel):
    email: str
    password: str
    remember_me: bool = False

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _EMAIL_RE.match(v):
            raise ValueError("Geçersiz email formatı")
        return v.lower()


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    role_label: str
    is_active: bool
    created_at: float
    org_id: str | None = None

    @classmethod
    def from_row(cls, row: dict) -> "UserResponse":
        role = row.get("role", "viewer")
        return cls(
            id=row["id"],
            email=row["email"],
            full_name=row.get("full_name") or row.get("username") or "",
            role=role,
            role_label=ROLE_LABELS.get(role, role.capitalize()),
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
            org_id=row.get("org_id"),
        )


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleUpdate(BaseModel):
    role: Literal["owner", "admin", "analyst", "viewer"]


# ── Organizasyon ───────────────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    allowed_email_domain: str = Field(default="", description="Ör: acme.com — bu domainle otomatik katılım")


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    owner_id: str | None
    allowed_email_domain: str
    created_at: float

    @classmethod
    def from_row(cls, row: dict) -> "OrgResponse":
        return cls(
            id=row["id"],
            name=row["name"],
            slug=row.get("slug", ""),
            plan=row.get("plan", "free"),
            owner_id=row.get("owner_id"),
            allowed_email_domain=row.get("allowed_email_domain", ""),
            created_at=row["created_at"],
        )


class OrgUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    allowed_email_domain: str | None = None


# ── Davet ─────────────────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    role: Literal["admin", "analyst", "viewer"] = "viewer"
    email: str = Field(default="", description="Opsiyonel — belirli bir kişiye özel davet")
    expire_hours: int = Field(default=72, ge=1, le=720)


class InviteResponse(BaseModel):
    id: str
    token: str
    org_id: str
    role: str
    role_label: str
    invited_by: str
    email: str
    expires_at: float
    used_at: float | None
    created_at: float
    is_valid: bool

    @classmethod
    def from_row(cls, row: dict) -> "InviteResponse":
        role = row.get("role", "viewer")
        now = time.time()
        return cls(
            id=row["id"],
            token=row["token"],
            org_id=row["org_id"],
            role=role,
            role_label=ROLE_LABELS.get(role, role.capitalize()),
            invited_by=row["invited_by"],
            email=row.get("email", ""),
            expires_at=row["expires_at"],
            used_at=row.get("used_at"),
            created_at=row["created_at"],
            is_valid=row.get("used_at") is None and row["expires_at"] > now,
        )


class InvitePreview(BaseModel):
    """Kamuya açık davet önizlemesi — token geçerlilik kontrolü için."""
    org_id: str
    org_name: str
    role: str
    role_label: str
    email: str
    expires_at: float
    is_valid: bool


class InviteJoin(BaseModel):
    """Mevcut kullanıcı için davet tokeni ile org'a katılım."""
    invite_token: str
