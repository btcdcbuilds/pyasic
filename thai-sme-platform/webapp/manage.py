"""Platform admin commands.

  python -m webapp.manage create-owner <username> "<Name>" <slug>[,<slug>...]|all [--line U123...]
  python -m webapp.manage list
  python -m webapp.manage reseed [--force]     # load sites/content YAML; --force overwrites DB content
"""

from __future__ import annotations

import argparse
import secrets

from webapp.core import SITES, STORE, seed_from_yaml


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m webapp.manage")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-owner")
    c.add_argument("username")
    c.add_argument("name")
    c.add_argument("slugs")
    c.add_argument("--line", help="owner's LINE user ID for booking alerts")
    sub.add_parser("list")
    r = sub.add_parser("reseed")
    r.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)

    if args.cmd == "create-owner":
        slugs = sorted(SITES) if args.slugs == "all" else [s.strip() for s in args.slugs.split(",") if s.strip()]
        unknown = [s for s in slugs if s not in SITES]
        if unknown:
            print(f"Unknown sites: {unknown}. Known: {sorted(SITES)}")
            return 1
        password = secrets.token_urlsafe(9)
        STORE.create_owner(args.username, args.name, password, slugs, args.line)
        print(f"Owner '{args.username}' created for {slugs}.\nTemporary password: {password}\n"
              "Send it to the owner privately (e.g. LINE), not by email.")
    elif args.cmd == "list":
        for slug in sorted(SITES):
            owners = ", ".join(o["name"] for o in STORE.owners_for_site(slug)) or "-"
            print(f"{slug:28s} {SITES[slug]['industry']:10s} owners: {owners}")
    elif args.cmd == "reseed":
        seed_from_yaml(force=args.force)
        print("Reseeded from YAML" + (" (overwrote existing)" if args.force else " (new sites only)"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
