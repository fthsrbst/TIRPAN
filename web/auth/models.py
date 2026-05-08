from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# Roles: owner = super-admin, admin = admin, analyst = operator, viewer = read-only
ROLE_LABELS = {
    "owner":   "Owner",
    "admin":   "Admin",
    "analyst": "Analyst",
    "viewer":  "Viewer",
}

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class UserCreate(BaseModel):
    email: str = Field(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    full_name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)

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
    is_active: bool
    created_at: float

    @classmethod
    def from_row(cls, row: dict) -> "UserResponse":
        return cls(
            id=row["id"],
            email=row["email"],
            full_name=row.get("full_name") or row.get("username") or "",
            role=row["role"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
        )


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class RoleUpdate(BaseModel):
    role: Literal["owner", "admin", "analyst", "viewer"]
