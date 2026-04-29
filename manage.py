"""
TIRPAN management CLI — create or update the admin user.

Usage:
    python manage.py --email admin@tirpan.local --name "TIRPAN Admin" --password changeme123
"""

import argparse
import asyncio
import sys

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))


async def create_admin(email: str, name: str, password: str) -> None:
    from database.db import init_db
    from database.repositories import UserRepository
    from web.auth.service import hash_password

    await init_db()
    repo = UserRepository()

    existing = await repo.get_by_email(email)
    if existing:
        # Update password & role for existing user
        from database.sqlite_conn import connect
        from database.db import DB_PATH
        import time
        async with connect(DB_PATH) as db:
            await db.execute(
                "UPDATE users SET hashed_password=?, role='owner', is_active=1 WHERE id=?",
                (hash_password(password), existing["id"]),
            )
            await db.commit()
        print(f"[+] Admin updated: {existing['email']} (role=owner)")
        return

    user = await repo.create(
        email=email,
        full_name=name,
        hashed_password=hash_password(password),
        role="owner",
    )
    print(f"[+] Admin created!")
    print(f"    ID:    {user['id']}")
    print(f"    Email: {user['email']}")
    print(f"    Name:  {user['full_name']}")
    print(f"    Role:  {user['role']}")


def main() -> None:
    p = argparse.ArgumentParser(description="TIRPAN management CLI")
    p.add_argument("--email",    required=True, help="Admin email")
    p.add_argument("--name",     default="TIRPAN Admin", help="Display name")
    p.add_argument("--password", required=True, help="Password (min 8 chars)")
    args = p.parse_args()

    if len(args.password) < 8:
        print("[!] Password must be at least 8 characters.")
        sys.exit(1)

    asyncio.run(create_admin(args.email, args.name, args.password))


if __name__ == "__main__":
    main()
