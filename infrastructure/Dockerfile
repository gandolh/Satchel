# Satchel's API (Fastify + SQLite).
#
# Build context is the REPO ROOT (one root lockfile covers shared, server, web
# and cli). Multi-stage: the TypeScript compiler and the native build toolchain
# live in build stages and never reach the runtime image. The web app is a
# static site that vps-deploy builds and ships separately; the CLI runs on the
# owner's machine. Neither is in this image.
#
#   docker compose -f infrastructure/docker-compose.yml up satchel-api
#
# ── Why this container runs as root ─────────────────────────────────────────
#
# It looks alarming and is not. On the VPS this runs under a ROOTLESS Docker
# daemon owned by an unprivileged account, where the container's uid 0 maps to
# that account's own uid on the host — so "root" here is already a normal
# unprivileged user out there, and a container escape lands on an account with
# no sudo and no docker group.
#
# It has to be uid 0 specifically because /data is a BIND MOUNT of the host's
# /srv/satchel-api/data, which holds the message database. Under rootless
# Docker only container-root maps back to the owning account; a non-root
# in-container user maps to a subuid the host sees as a stranger, and the
# service could not write its own database.

# ---------------------------------------------------------------------------
# deps — full workspace install, with the toolchain native modules may need
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
# better-sqlite3 13 ships Node-API prebuilds including linuxmusl-x64, so this is
# a fallback rather than the normal path — but a version bump that drops the
# musl prebuild would otherwise fail the build with a cryptic node-gyp error.
RUN apk add --no-cache python3 make g++
WORKDIR /app
# Manifests first, for layer caching: one root lockfile, one npm ci. Every
# workspace manifest is needed because `npm ci` validates the lockfile against
# every workspace the root package.json declares and bails on a missing one.
COPY package.json package-lock.json .npmrc tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY cli/package.json ./cli/
RUN npm ci

# ---------------------------------------------------------------------------
# builder — compile shared and the server (tsc -b → shared/dist, server/dist)
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY shared ./shared
COPY server ./server
# server/tsconfig.json references shared, so this builds both, in order.
RUN npx tsc -b server

# ---------------------------------------------------------------------------
# proddeps — runtime dependencies only, native modules built here
# ---------------------------------------------------------------------------
FROM node:24-alpine AS proddeps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
COPY cli/package.json ./cli/
# Scoped to the server workspace: unscoped this would also install whatever the
# web app grows (React and its tree), which the server never runs.
RUN npm ci --omit=dev -w @satchel/server --include-workspace-root
# Drop native build intermediates and the prebuilds for operating systems this
# image can never be.
#
# Deliberately a BLACKLIST of foreign platforms rather than a whitelist of the
# ones to keep: better-sqlite3 ships prebuilds as FILES
# (`prebuilds/linuxmusl-x64.node`), not directories, and a whitelist written
# against bare names silently deletes all of them, leaving an image that builds
# clean and crash-loops on a missing better_sqlite3.node.
RUN cd node_modules \
 && find . -name '*.o' -delete \
 && find . -type d -name obj.target -prune -exec rm -rf {} + \
 && rm -rf better-sqlite3/deps better-sqlite3/src \
 && find . -type d -name prebuilds -exec sh -c \
      'rm -f "$1"/darwin-*.node "$1"/win32-*.node "$1"/android-*.node' _ {} \;

# ---------------------------------------------------------------------------
# prod — slim runtime: no compiler, no test code, no TypeScript
# ---------------------------------------------------------------------------
FROM node:24-alpine AS prod
LABEL org.opencontainers.image.title="Satchel" \
      org.opencontainers.image.description="Satchel API: messages and the Ideas inbox"
# wget, for the healthcheck below, ships in node:alpine's busybox.
WORKDIR /app
COPY --from=proddeps /app/node_modules ./node_modules
COPY package.json ./
# node_modules/@satchel/shared is a symlink to ../shared, so shared must sit at
# /app/shared with its manifest and compiled output.
COPY shared/package.json ./shared/
COPY --from=builder /app/shared/dist ./shared/dist
COPY server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
# tsc compiles src/**/* including the tests. They import a runner that
# --omit=dev never installed, so shipping them is dead weight.
RUN find ./server/dist ./shared/dist \( -name '*.test.js' -o -name '*.test.js.map' -o -name '*.test.d.ts' \) -delete
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8795 \
    DATA_DIR=/data
# The message database. A BIND MOUNT on the VPS (the host's
# /srv/satchel-api/data), so it survives every deploy.
VOLUME /data
EXPOSE 8795
# Shell form, so it follows the runtime PORT rather than a baked constant.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
CMD ["node", "server/dist/index.js"]
