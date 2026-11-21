# ---------------------------------------------------------------------------
# Web image: build the Vite app, then serve it with nginx (which also proxies
# /api to the FastAPI service). Build context is the repository root.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Production images never fall back to the browser-side demo dataset.
ARG VITE_ALLOW_OFFLINE_DEMO=false
ENV VITE_ALLOW_OFFLINE_DEMO=$VITE_ALLOW_OFFLINE_DEMO

# ONLYOFFICE editor (Phase 2 plumbing). The flag defaults to false, so a build
# without these args behaves exactly like today.
ARG VITE_ONLYOFFICE_ENABLED=false
ENV VITE_ONLYOFFICE_ENABLED=$VITE_ONLYOFFICE_ENABLED

# Same-origin virtual path served by this nginx (see infra/nginx/default.conf).
ARG VITE_ONLYOFFICE_URL=/onlyoffice
ENV VITE_ONLYOFFICE_URL=$VITE_ONLYOFFICE_URL

ARG VITE_OFFICE_LOAD_TIMEOUT_MS=20000
ENV VITE_OFFICE_LOAD_TIMEOUT_MS=$VITE_OFFICE_LOAD_TIMEOUT_MS

RUN npm run build

FROM nginx:1.27-alpine AS runtime

ENV TZ=Africa/Cairo

RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
