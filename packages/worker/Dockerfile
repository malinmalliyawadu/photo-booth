# The worker (the jobs loop, camera, printer, sync) as an image. It runs
# from TypeScript source through tsx, exactly as on the controller, and
# carries the seed layouts (templates/) and the fake camera's samples.
# It applies the migrations and the seed on start; see
# docker-compose.coolify.yml for how the app waits for it.
#
#   docker build -f packages/worker/Dockerfile -t booth-worker .

FROM node:24-alpine
RUN npm install -g pnpm@11.18.0
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/worker/package.json packages/worker/
RUN pnpm install --frozen-lockfile --filter @booth/worker...

COPY packages/core packages/core
COPY packages/db packages/db
COPY packages/worker packages/worker
COPY templates templates

ENV NODE_ENV=production BOOTH_DATA_DIR=/data WORKER_PORT=3101
# The base image's `node` user (uid 1000) in every image, so the shared
# data volume has one owner.
RUN mkdir /data && chown node:node /data
USER node
WORKDIR /repo/packages/worker
# /health listens on 127.0.0.1 only, so the check names it rather than
# localhost, which busybox wget would try as ::1 first.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3101/health > /dev/null || exit 1
CMD ["node_modules/.bin/tsx", "src/main.ts"]
