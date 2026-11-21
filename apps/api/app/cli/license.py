"""Developer CLI for licence fingerprints, generation and verification.

    python -m app.cli.license hardware-id
    python -m app.cli.license generate --client "شركة ..." --hardware-id <hex> \
        --issued 2026-11-21 --expires 2027-11-21 --out license.json
    python -m app.cli.license verify --file license.json

The signing key is read from ``--signing-key`` or ``LICENSE_SIGNING_KEY`` and is
never printed.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

from app.core.config import settings
from app.services.license import (
    LicensePayload,
    build_file,
    check_license,
    current_hardware_id,
    parse_payload,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli.license")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("hardware-id", help="print this server's licence fingerprint")

    generate = sub.add_parser("generate", help="write a licence.json file")
    generate.add_argument("--client", required=True, help="client name (1..160)")
    generate.add_argument("--hardware-id", default="", help="64-hex fingerprint of the client")
    generate.add_argument("--issued", default="", help="ISO date YYYY-MM-DD (default: today)")
    generate.add_argument("--expires", default="", help="ISO date YYYY-MM-DD (default: +365 days)")
    generate.add_argument("--out", default="license.json", help="output path")
    generate.add_argument("--self", action="store_true", help="use this machine's fingerprint")
    generate.add_argument("--signing-key", default="", help="overrides LICENSE_SIGNING_KEY (never printed)")
    generate.add_argument("--license-id", default="", help="optional UUID for tracking")

    verify = sub.add_parser("verify", help="verify a licence.json file")
    verify.add_argument("--file", default="license.json")
    verify.add_argument("--signing-key", default="", help="overrides LICENSE_SIGNING_KEY (never printed)")
    return parser


def _resolve_key(cli_key: str) -> str:
    return cli_key or settings.license_signing_key


def main(argv: list[str] | None = None) -> int:
    # Arabic output on Windows consoles (cp1252 by default).
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = _parser().parse_args(argv)

    if args.command == "hardware-id":
        print(current_hardware_id())
        return 0

    if args.command == "generate":
        today = date.today()
        try:
            issued = date.fromisoformat(args.issued) if args.issued else today
            expires = date.fromisoformat(args.expires) if args.expires else today + timedelta(days=365)
        except ValueError:
            print("التاريخ غير صالح؛ استخدم الصيغة YYYY-MM-DD.")
            return 2

        if args.self or not args.hardware_id:
            hardware_id = current_hardware_id()
        else:
            hardware_id = args.hardware_id.strip().lower()
        if len(hardware_id) != 64 or any(ch not in "0123456789abcdef" for ch in hardware_id):
            print("بصمة العتاد يجب أن تكون 64 حرف hex صغير.")
            return 2

        payload = LicensePayload(
            client_name=args.client,
            hardware_id=hardware_id,
            issued_at=issued,
            expires_at=expires,
            license_id=args.license_id or None,
        )
        try:
            target = build_file(payload, _resolve_key(args.signing_key), Path(args.out))
        except OSError as exc:
            print(f"تعذّر كتابة الملف: {exc}")
            return 2
        print(f"تم إنشاء {target}")
        return 0

    # verify
    path = Path(args.file)
    if not path.is_file():
        print("ملف الترخيص غير موجود.")
        return 2
    try:
        payload = parse_payload(
            path.read_text(encoding="utf-8"), _resolve_key(args.signing_key), ""
        )
    except (OSError, ValueError, TypeError) as exc:
        print(f"الترخيص غير صالح: {type(exc).__name__}")
        return 2

    state = check_license(path=path, signing_key=_resolve_key(args.signing_key))
    print(
        f"العميل: {payload.client_name} · الانتهاء: {payload.expires_at.isoformat()} · "
        f"الحالة: {state.status}"
    )
    return 0 if state.status in {"active", "expiring", "not_yet_valid"} else 2


if __name__ == "__main__":  # pragma: no cover - exercised via subprocess in tests
    raise SystemExit(main())
