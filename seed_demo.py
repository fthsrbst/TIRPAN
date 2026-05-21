"""
Demo hesapları oluştur:
  owner@demo.tirpan  → Owner
  admin@demo.tirpan  → Admin
  analyst@demo.tirpan → Analyst
  viewer@demo.tirpan  → Viewer

Organizasyon: TIRPAN Demo
Şifre (hepsi): Demo1234!

Kullanım:
    python seed_demo.py
"""

import asyncio
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))

USERS = [
    {"email": "owner@demo.tirpan",   "full_name": "Demo Owner",   "role": "owner"},
    {"email": "admin@demo.tirpan",   "full_name": "Demo Admin",   "role": "admin"},
    {"email": "analyst@demo.tirpan", "full_name": "Demo Analyst", "role": "analyst"},
    {"email": "viewer@demo.tirpan",  "full_name": "Demo Viewer",  "role": "viewer"},
]
ORG_NAME = "TIRPAN Demo"
PASSWORD = "Demo1234!"


async def main() -> None:
    from database.db import init_db
    from database.repositories import UserRepository, OrganizationRepository
    from web.auth.service import hash_password

    await init_db()
    user_repo = UserRepository()
    org_repo = OrganizationRepository()

    hashed = hash_password(PASSWORD)

    # Org zaten var mı?
    existing_org = await org_repo.get_by_slug("tirpan-demo")

    # Owner'ı bul veya oluştur
    owner_data = USERS[0]
    owner = await user_repo.get_by_email(owner_data["email"])
    if owner:
        print(f"[~] Zaten mevcut: {owner['email']} (atlanıyor)")
    else:
        owner = await user_repo.create(
            email=owner_data["email"],
            full_name=owner_data["full_name"],
            hashed_password=hashed,
            role="owner",
        )
        print(f"[+] Oluşturuldu: {owner['email']} (owner)")

    # Org oluştur (yoksa)
    if existing_org:
        org = existing_org
        print(f"[~] Org zaten mevcut: {org['name']} ({org['id']})")
    else:
        org = await org_repo.create(name=ORG_NAME, owner_id=owner["id"])
        print(f"[+] Org oluşturuldu: {org['name']} ({org['id']})")

    # Owner'a org ata (yoksa)
    if not owner.get("org_id"):
        await user_repo.set_org(owner["id"], org["id"])
        print(f"    → {owner['email']} org'a eklendi")

    # Diğer kullanıcıları oluştur
    for u in USERS[1:]:
        existing = await user_repo.get_by_email(u["email"])
        if existing:
            print(f"[~] Zaten mevcut: {existing['email']} (atlanıyor)")
            continue
        user = await user_repo.create(
            email=u["email"],
            full_name=u["full_name"],
            hashed_password=hashed,
            role=u["role"],
            org_id=org["id"],
        )
        print(f"[+] Oluşturuldu: {user['email']} ({user['role']})")

    print("\n✓ Demo hesapları hazır.")
    print(f"  Organizasyon : {ORG_NAME}")
    print(f"  Şifre        : {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
