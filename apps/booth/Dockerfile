# The booth app (kiosk, admin, slideshow, the session API and /media)
# as an image. The build context is the repository root so the
# workspace packages it imports as TypeScript source are in reach; see
# docker-compose.coolify.yml for how it runs next to the worker.
#
#   docker build -f apps/booth/Dockerfile -t booth-app .

FROM node:24-alpine AS build
RUN npm install -g pnpm@11.18.0
WORKDIR /repo

# Manifests first, so the install layer survives source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/booth/package.json apps/booth/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter @booth/booth...

COPY packages/core packages/core
COPY packages/db packages/db
COPY apps/booth apps/booth
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN pnpm --filter @booth/booth build

# `output: "standalone"` traces the server and its native modules (sharp,
# pg) into .next/standalone; public/ and the static assets go beside it.
FROM node:24-alpine AS run
# HOSTNAME "::" binds IPv6 and IPv4 at once, so a health check that
# resolves localhost to ::1 (busybox wget does) reaches the server.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=:: PORT=3100 BOOTH_DATA_DIR=/data
WORKDIR /app
# The base image's `node` user (uid 1000) in every image, so the shared
# data volume has one owner.
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /repo/apps/booth/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/booth/.next/static ./apps/booth/.next/static
COPY --from=build --chown=node:node /repo/apps/booth/public ./apps/booth/public
USER node
EXPOSE 3100
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3100/api/snapshot > /dev/null || exit 1
CMD ["node", "apps/booth/server.js"]
