# ---------------------------------------------------------------------------
# SMD-HR API image — multi-stage production build.
#
#   builder : Python dependencies in an isolated virtual environment
#   runtime : slim runtime + LibreOffice (Word/Excel -> PDF) + pg_dump
#
# Build context: apps/api
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Africa/Cairo \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# LibreOffice converts uploaded company documents to PDF; postgresql-client
# provides pg_dump for the scheduled backup job run by the worker.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        libreoffice-calc \
        fonts-noto-core \
        fonts-noto-extra \
        postgresql-client \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv

COPY . .

RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
