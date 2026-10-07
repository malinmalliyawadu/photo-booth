# Photo booth

Tap the iPad, pick a layout, pose, print, scan. Runs on a mini PC at the
venue with no internet; the gallery catches up later.

See `CLAUDE.md` for the architecture, the state machine and the decisions.

## Run it locally

```bash
docker compose up -d          # Postgres on 5436
cp .env.example .env          # then set ADMIN_PASSWORD
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # https://localhost:3100 + the worker
```

Your browser will warn about the certificate until you trust
`ops/certs/ca.crt`. The kiosk is `/`, the attendant's page is `/admin`,
the TV is `/slideshow`.

```bash
pnpm test        # unit tests
pnpm e2e         # Playwright, against the running stack
```

## Layouts

Design at 148 x 100 mm in Canva, paint every photo slot solid `#FF00FF`,
export a PNG at 300 dpi, upload it on `/admin`. Add a JSON sidecar when
two slots share a shot:

```json
{ "shots": [1, 1, 2, 2, 3, 3] }
```
