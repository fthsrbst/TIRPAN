from __future__ import annotations

from datetime import datetime, timezone, timedelta

import bcrypt
from jose import jwt, JWTError

from config import settings


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(payload: dict, remember_me: bool = False) -> str:
    data = payload.copy()
    # remember_me = 30 days, otherwise use configured expiry (default 8h)
    minutes = 60 * 24 * 30 if remember_me else settings.token_expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    data["exp"] = expire
    data["remember"] = remember_me
    return jwt.encode(data, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """Decode and validate JWT. Raises JWTError on invalid/expired tokens."""
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
