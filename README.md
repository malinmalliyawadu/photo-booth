# Photo booth

Tap the iPad, pick a layout and a filter, pose, print, scan. Runs on a
mini PC or a Mac at the venue, or on Coolify; the photos go to the
event's own site, where guests' phone photos land too.

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

The four layouts in `templates/` are placeholders, drawn by
`pnpm assets` and loaded by the seed the first time it sees each file.
The seed never loads a file twice, so when a placeholder changes, a
database that already has it keeps the old artwork until you replace
it on `/admin`: delete the layout, then upload the new PNG from
`templates/` under the same name (with `04-double-strip.json` as the
sidecar for the double strip). Uploads join the end of the list, so
replace all four in file order to keep the picker's order. A layout
that sessions were taken with is retired rather than removed, so those
sessions still show the artwork they were taken with.

## Filters

On the review screen a guest picks a filter for their photos: colour,
black & white, vintage, faded or pop. The photos on disk stay as the
camera took them; the look is applied where they are drawn and baked
into the print and the gallery photo. Choose which filters to offer on
`/admin`; with only one, nothing is asked.

## The gallery

The booth has no gallery of its own. Each finished session is sent to
the event's site, so the booth's prints sit in the same album as the
photos guests upload from their phones, and the QR code on the kiosk
links to that site's page for the session. Three variables in `.env`
say where (`GALLERY_SYNC_URL`, `GALLERY_SYNC_TOKEN`,
`GALLERY_SESSION_URL`; see `.env.example`). For the wedding they point
at the wedding-planner app's `/api/booth/photos` and `/i/booth/{id}`.
Leave them unset and the print is the copy. The "Sync" card on `/admin`
says whether the site is reachable, and every finished session has a
"send again" button there.

## The printer

A Canon SELPHY CP1300, through CUPS: on a Linux controller over USB
with Gutenprint, on a Mac by AirPrint over the Wi-Fi (Gutenprint has
no macOS build, so a Mac cannot drive it over USB). For AirPrint, join
the printer to the same Wi-Fi as the Mac from its own menu (Wi-Fi
settings) first. Once per controller, with the printer on:

```bash
sudo ops/printer.sh
```

Then set `BOOTH_PRINTER=cups` in `.env`, restart the worker and run:

```bash
pnpm print:test
```

The test card has a coloured frame at 1 to 10 mm from each edge;
borderless printing trims a little off every side, and the outermost
frame left whole is how far in a layout's photos and words must stay
(`SAFE_MARGIN_MM`, 4 mm until a real card says otherwise).

A KP-108IN pack is three ink cassettes of 36 prints and 108 postcards,
and the paper tray holds 18, so the tray needs refilling twice per
cassette. `/admin` counts both down: tap **Tray refilled** after loading
paper and **New ink cassette** after changing it. At zero the booth
skips the print and the kiosk says it needs a refill; the guest's
photos are safe and **Reprint** sends them again. The printer card
says what the printer reports (out of paper, a jam, unplugged or off
the Wi-Fi), and a print the printer refuses fails within seconds with
that reason rather than holding up the guests behind it.

The paper goes back and forth out of the back of the printer four
times per card (yellow, magenta, cyan, the overcoat), so leave a
postcard's length clear behind it. A card takes about a minute.

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
