from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from database.repositories import UserRepository
from web.auth.models import UserCreate, UserLogin, UserResponse, Token, RoleUpdate
from web.auth.service import hash_password, verify_password, create_access_token
from web.auth.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
_repo = UserRepository()

_DUMMY_HASH = "$2b$12$KIXFakeHashToPreventTimingAttackXXXXXXXXXXXXXXXXXXXXXXX"


@router.post("/register", response_model=Token, status_code=201)
async def register(body: UserCreate):
    if await _repo.email_exists(body.email):
        raise HTTPException(status_code=409, detail="Bu email zaten kayıtlı")

    user_row = await _repo.create(
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role="viewer",
    )
    token = create_access_token({"sub": user_row["id"], "role": user_row["role"]})
    return Token(access_token=token, user=UserResponse.from_row(user_row))


@router.post("/login", response_model=Token)
async def login(body: UserLogin):
    user = await _repo.get_by_email(body.email)
    candidate_hash = user["hashed_password"] if user else _DUMMY_HASH
    if not verify_password(body.password, candidate_hash) or not user:
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Hesap devre dışı bırakıldı")

    await _repo.update_last_login(user["id"])
    token = create_access_token(
        {"sub": user["id"], "role": user["role"]},
        remember_me=body.remember_me,
    )
    return Token(access_token=token, user=UserResponse.from_row(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse.from_row(current_user)


@router.get("/users", response_model=list[UserResponse])
async def list_users(_: dict = Depends(require_role("owner", "admin"))):
    rows = await _repo.list_all()
    return [UserResponse.from_row(r) for r in rows]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    body: RoleUpdate,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Kendi rolünüzü değiştiremezsiniz")
    updated = await _repo.update_role(user_id, body.role)
    if not updated:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    row = await _repo.get_by_id(user_id)
    return UserResponse.from_row(row)


@router.patch("/users/{user_id}/active", response_model=UserResponse)
async def update_user_active(
    user_id: str,
    is_active: bool,
    current_user: dict = Depends(require_role("owner", "admin")),
):
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Kendinizi devre dışı bırakamazsınız")
    updated = await _repo.update_active(user_id, is_active)
    if not updated:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    row = await _repo.get_by_id(user_id)
    return UserResponse.from_row(row)
