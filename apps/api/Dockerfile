# API image: FastAPI + psycopg + LibreOffice for Word/Excel -> PDF conversion.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Africa/Cairo

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-writer \
        libreoffice-calc \
        fonts-noto-core \
        fonts-noto-extra \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
