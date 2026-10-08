# The gallery on Coolify. The build context is the repository root, so
# the workspace packages the gallery imports as TypeScript source are
# in reach; in Coolify that is Base Directory "/" and Dockerfile
# Location "/apps/gallery/Dockerfile".
#
#   docker build -f apps/gallery/Dockerfile -t booth-gallery .
#   docker run --rm -p 3200:3200 booth-gallery
#
# Only the gallery and @booth/core go in. The booth app, the worker and
# the db package stay on the controller.

FROM node:24-alpine AS build
RUN npm install -g pnpm@11.18.0
WORKDIR /repo

# Manifests first, so the install layer survives source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/gallery/package.json apps/gallery/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter @booth/gallery...

COPY packages/core packages/core
COPY apps/gallery apps/gallery
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @booth/gallery build

# `output: "standalone"` traces exactly the files the server needs into
# .next/standalone; the static assets are copied in beside it.
FROM node:24-alpine AS run
# HOSTNAME "::" binds IPv6 and IPv4 at once, so a health check that
# resolves localhost to ::1 (busybox wget does) reaches the server.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=:: PORT=3200
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/gallery/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/gallery/.next/static ./apps/gallery/.next/static
USER node
EXPOSE 3200
CMD ["node", "apps/gallery/server.js"]
