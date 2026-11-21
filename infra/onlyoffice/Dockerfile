# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# SMD-HR — ONLYOFFICE Document Server with Arabic fonts.
#
# The official image ships Latin fonts (and msttcorefonts) but does not guarantee
# the Arabic family used by the SMD-HR UI (Cairo). The web UI, the .docx forms and
# the server-side PDF snapshot generator all use Cairo, so the editor must have
# the same family available or it silently substitutes another font.
#
# Build context: infra/onlyoffice
#   docker compose build onlyoffice
# ---------------------------------------------------------------------------
ARG ONLYOFFICE_IMAGE=onlyoffice/documentserver:10.0.0.1
FROM ${ONLYOFFICE_IMAGE}

# The DS entrypoint regenerates sdkjs/common/AllFonts.js on every start, which
# is what makes the fonts below appear in the editor font list and its
# thumbnails. Keep it enabled.
ENV DEBIAN_FRONTEND=noninteractive \
    GENERATE_FONTS=true

# fontconfig + Noto core (Arabic fallback and symbols). Cairo itself is vendored
# below so the build does not depend on a distro package that may not exist.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fontconfig \
        fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

# Cairo Regular/Bold are static instances generated from the upstream OFL
# variable font (google/fonts). OFL text is kept next to them.
RUN mkdir -p /usr/share/fonts/truetype/custom /usr/share/doc/fonts-cairo
COPY fonts/Cairo-Regular.ttf fonts/Cairo-Bold.ttf /usr/share/fonts/truetype/custom/
COPY fonts/OFL-Cairo.txt /usr/share/doc/fonts-cairo/OFL.txt

# Fail the build if fontconfig cannot see both faces (and Arabic coverage);
# this catches a broken COPY or a corrupted font before the container ever
# reaches UAT. `fc-match` alone is not enough: it silently falls back.
RUN fc-cache -fv \
    && fc-list | grep -qi 'Cairo:style=Regular' \
    && fc-list | grep -qi 'Cairo:style=Bold' \
    && fc-list :charset=0627 | grep -qi 'cairo' \
    && test "$(fc-match -f '%{family}' 'Cairo')" = "Cairo"

# No CMD/ENTRYPOINT override: the base image's entrypoint starts DS services
# and regenerates the font list using GENERATE_FONTS=true.
