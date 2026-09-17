"""Account management.

    uv run python -m app.cli create-user --email you@example.com --name "Dr. Name"
    uv run python -m app.cli set-password --email you@example.com

Add --password-stdin to read the password from standard input instead of prompting.
"""

import argparse
import getpass
import sys

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import User
from app.security import MIN_PASSWORD_LENGTH, hash_password


def _prompt_password(from_stdin: bool) -> str:
    if from_stdin:
        password = sys.stdin.readline().rstrip("\n")
        if len(password) < MIN_PASSWORD_LENGTH:
            sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
        return password
    password = getpass.getpass(f"Password (min {MIN_PASSWORD_LENGTH} chars): ")
    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if getpass.getpass("Repeat password: ") != password:
        sys.exit("Passwords do not match.")
    return password


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create-user")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    create.add_argument("--password-stdin", action="store_true")
    reset = sub.add_parser("set-password")
    reset.add_argument("--email", required=True)
    reset.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args()

    email = args.email.strip().lower()
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(func.lower(User.email) == email))
        if args.command == "create-user":
            if existing:
                sys.exit(f"User {email} already exists.")
            password_hash = hash_password(_prompt_password(args.password_stdin))
            db.add(User(email=email, full_name=args.name.strip(), password_hash=password_hash))
            db.commit()
            print(f"Created {email}.")
        else:
            if not existing:
                sys.exit(f"No user {email}.")
            existing.password_hash = hash_password(_prompt_password(args.password_stdin))
            db.commit()
            print(f"Password updated for {email}.")


if __name__ == "__main__":
    main()
