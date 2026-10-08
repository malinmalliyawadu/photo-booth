# Photo booth

Tap the iPad, pick a layout and a filter, pose, print, scan. Runs on a
mini PC at the venue or on Coolify; the gallery is online.

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

## Filters

On the review screen a guest picks a filter for their photos: colour,
black & white, vintage, faded or pop. The photos on disk stay as the
camera took them; the look is applied where they are drawn and, from
phase 2, baked into the print. Choose which filters to offer on
`/admin`; with only one, nothing is asked.

## Using the iPad's own camera

Set the camera to **iPad** on `/admin`. The kiosk then takes the photos
with the iPad's front camera; no DSLR needed. Once per iPad:

1. Install `ops/certs/ca.crt` (open `http://booth.local/ca.crt`), then
   trust it in Settings › General › About › Certificate Trust Settings.
   Safari only gives a page the camera over https. Not needed on the
   Coolify deployment, whose certificate Safari already trusts.
2. Open the kiosk in Safari, then aA › Website Settings › Camera ›
   **Allow**, so Safari never asks mid-countdown.
3. Turn the brightness up and Auto-Lock off; the white screen is the flash.
4. Stand the iPad in landscape and start Guided Access.

The camera card on `/admin` shows what the iPad reports: the camera and
its resolution, a warning if it is interrupted or too small for a sharp
print, and "Not heard from the iPad" if the kiosk is closed.
