#!/bin/sh
# ---------------------------------------------------------------------------
# API container entrypoint.
#   - waits for PostgreSQL to accept connections
#   - applies Alembic migrations
#   - optionally seeds demo data (SEED_DEMO_ON_START=true)
#   - starts uvicorn
# ---------------------------------------------------------------------------
set -eu

echo "[smd-hr] waiting for the database ..."
python - <<'PY'
import os
import sys
import time

import psycopg

url = os.environ.get("DATABASE_URL", "")
# SQLAlchemy URL -> libpq DSN: postgresql+psycopg://user:pass@host:port/db
dsn = url.replace("postgresql+psycopg://", "postgresql://", 1)
if not dsn:
    print("[smd-hr] DATABASE_URL is not set", file=sys.stderr)
    sys.exit(1)

for attempt in range(1, 61):
    try:
        with psycopg.connect(dsn, connect_timeout=5):
            print(f"[smd-hr] database reachable after {attempt} attempt(s)")
            break
    except Exception as exc:  # noqa: BLE001 - startup retry loop
        print(f"[smd-hr] database not ready ({attempt}/60): {exc}")
        time.sleep(2)
else:
    print("[smd-hr] database did not become ready in time", file=sys.stderr)
    sys.exit(1)
PY

echo "[smd-hr] applying migrations ..."
alembic upgrade head

if [ "${SEED_DEMO_ON_START:-false}" = "true" ]; then
  echo "[smd-hr] seeding demo data ..."
  python -m app.seed --profile demo
fi

echo "[smd-hr] starting API on 0.0.0.0:8000 ..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
