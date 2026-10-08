# Photo booth

A guest taps the iPad, picks a layout and a filter, poses through a
countdown with one shot per photo slot, and gets a QR code to their
photos. One postcard print comes out for the guestbook. The booth has
internet at the venue: the event's own site, where guests upload their
phone photos too, fills with the booth's photos as sessions finish.

Built for a wedding, named without it on purpose: the booth will be
lent to friends' parties, and nothing in the code is specific to one
event beyond the templates and the event name on the admin page.

## The shape of it

One pnpm workspace, no Turborepo. Node 24, TypeScript, Next.js 16 (App
Router, Turbopack), Drizzle with SQL migrations checked in, Tailwind v4,
Vitest for pure modules, Playwright for the kiosk's happy path.

| Path | What it is | Runs on |
| --- | --- | --- |
| `apps/booth` | Next.js: kiosk (`/`), admin (`/admin`), slideshow (`/slideshow`), the session API, the SSE stream, `/media` | The controller, or Coolify |
| `packages/worker` | Node process: camera, compositor, print queue, the gallery sync, the jobs loop | The controller, or Coolify |
| `packages/core` | Pure, tested: session state machine, short IDs, slot detection, print constants, the filter catalogue and its pixel arithmetic, the compositor's geometry, the `Camera` interface, the iPad capture plan and viewfinder crop, the gallery setting and sync plan | The app and the worker |
| `packages/db` | Drizzle schema + migrations, the repositories, the data directory, the snapshot | The app and the worker |
| `templates/` | Layout PNGs and optional JSON sidecars; the seed loads them | Uploaded through admin on the night |
| `ops/` | `ca.sh` (local certificate authority), `Caddyfile`; systemd units and the soak test arrive in phase 6 | The controller |
| `e2e/` | Playwright, against the real app, worker and Postgres | |

Workspace packages are consumed as TypeScript source (`exports` point at
`src/index.ts`, Next has `transpilePackages`), so there is no build step
between a change in `core` and the app seeing it.

**There is no gallery app in this repo.** The gallery is the event's own
site: for the wedding, the wedding-planner app (`~/Projects/wedding-planner`),
whose album already takes guests' phone uploads. The booth pushes each
finished session there and the QR links there; see **The gallery**.

## Commands

- `docker compose up -d` - local Postgres on **5436**
- `cp .env.example .env` then set `ADMIN_PASSWORD`
- `pnpm db:migrate`, `pnpm db:seed` - the seed is idempotent and the worker runs it on start
- `pnpm assets` - regenerates the placeholder templates and sample photos (sharp)
- `pnpm icons` - rasterises `apps/booth/src/app/icon.svg` into the home-screen PNGs; commit them
- `pnpm dev` - booth app over **HTTPS on 3100** plus the worker; `pnpm --filter @booth/booth dev:http` for a browser that will not trust the private CA
- `pnpm test` - Vitest, every pure module
- `pnpm typecheck`, `pnpm lint` - every package
- `pnpm e2e` - Playwright; starts the app and worker if they are not running
- `pnpm db:generate` - a migration from a schema change (never push/sync)

## Hard rules

- **Every schema change is a migration file**, committed, under `packages/db/drizzle/`.
- **Pure modules get unit tests, UI does not.** `packages/core` is pure: no database, no clock, no filesystem. Anything that decides what happens next belongs there.
- **The state machine is the only way a session changes.** `applySessionEvent` in `packages/db/src/sessions.ts` loads the row under a lock, runs `transition`, persists, enqueues effects and NOTIFYs, in one transaction. Route handlers and worker handlers call it; nobody writes `sessions.phase` by hand.
- **Every state change ends with NOTIFY inside the transaction**, so the worker and the SSE stream learn about it on commit and never see a half-written row.
- **The booth has internet, but a session never waits on it.** The gallery sync is a job with an hour of retries; the QR is made on the controller and its link is known before anything is uploaded; fonts are files in the repo. A slow or dropped connection delays the gallery, never the countdown, the review or the print.
- **`/admin` and `/api/admin` stay behind the password.** Anybody on the booth Wi-Fi can reach the controller, and admin can delete sessions and see every photo. `src/proxy.ts` is the gate; `ADMIN_PASSWORD` unset means nobody signs in.
- **Stored paths are relative to the data directory** (`BOOTH_DATA_DIR`), so the directory can move or be restored without touching a row. `resolveData` refuses anything that escapes it.
- **A stored file is never overwritten.** `/media` serves everything as immutable, so `sessionPaths` names a new file on every call (a retake, a recompose) and the row is how it is found again. Reusing a name shows the guest the old photo from Safari's cache.

## The session state machine (`packages/core/src/session.ts`)

```
countdown ─(countdown_elapsed)─▶ capturing ─(shot_taken)─▶ countdown (next shot)
                                     │                 └─▶ review (last shot)
                                     └─(shot_failed)─▶ countdown (retry, 3 attempts) | failed
review ─(filter_chosen | mirror_chosen)─▶ review
       ├─(retake)─▶ countdown (shot 1)
       └─(accepted | timed_out)─▶ composing ─(composed)─▶ delivering ─(finished | timed_out)─▶ done
                                            └─(compose_failed | timed_out)─▶ failed
any active phase ─(cancelled)─▶ abandoned
```

The review comes before the compositor because the review is where the
guest picks the look and the mirror; the JPEGs are made once, from what
was accepted, and the print and the sync follow from `composed`.

`transition(state, event, now)` returns the next state plus **effects**,
which become rows in the `jobs` table: `countdown` (due at the deadline),
`capture`, `compose`, `print`, `sync`, and `timeout` (due later, carrying
the phase and shot it guards). Timing events that arrive late are ignored
as stale; commands in the wrong phase are refused. A guest who walks away
from the review still gets a print and a QR after 60 s; a QR screen
nobody dismissed returns to the attract loop after 90 s. The constants are
`TIMEOUTS_MS`.

There is no "idle" or "pick layout" state in the database: with no active
session the kiosk shows the attract loop and the picker locally, and
`startSession` creates the row already counting down. At most one session
is active; starts are serialised with an advisory lock.

## The `Camera` interface (`packages/core/src/camera.ts`)

```ts
interface Camera {
  readonly kind: "fake" | "gphoto2";
  start(): Promise<void>;          // begin liveview, idempotent
  stop(): Promise<void>;           // release the device
  shoot(destPath: string): Promise<void>;  // stop preview, fire, download, restart preview
  status(): { ok: boolean; detail: string };
}
```

gphoto2 cannot stream liveview and capture a still from two processes,
so `shoot` owns the whole stop-fire-restart cycle and the kiosk shows
"Hold still" from the moment the digits reach zero. `FakeCamera`
returns the sample photos.

## The iPad camera

The **iPad camera is not a `Camera`**: in `ipad` mode the kiosk is the
camera and the worker's capture job only logs that it is waiting.

- `useIpadCamera` holds the front camera open for as long as the booth
  is in iPad mode (not just while posing), so exposure and focus have
  settled and any permission prompt has come and gone before a guest taps. It asks for far
  more than the camera has, so Safari picks its largest mode; it
  reopens a track that ends and reports health to `PUT /api/kiosk/camera`
  every 5 s. In iPad mode the worker leaves the `camera` component alone.
- `planCapture` (`packages/core/src/kiosk-capture.ts`) decides when: the
  frame is taken at the kiosk's own zero (white screen as the flash for
  250 ms, then the read) and held until the snapshot says `capturing`,
  then PUT to `/api/sessions/{id}/shots/{n}`. A frame that cannot be
  read is POSTed to `.../shots/{n}/failed` at once, so the state machine
  retries without waiting out the capturing timeout.
- The photo is the camera's full, unmirrored frame. The preview is
  mirrored with CSS only, so the photo reads the other way round from
  what the guest posed in; a guest who wants it the way the mirror
  showed it flips it on the review screen (see **Filters**).

**What guests see is what the layout keeps.** `viewfinderCrop`
(`packages/core/src/viewfinder.ts`) crops the live preview, in every
camera mode, to the centred cover crop of the slot(s) the shot fills,
which is how `Composite` and the compositor (`placePhotos`) crop the photo.

## How a screen works

Every screen opens `GET /api/events` (Server-Sent Events) and redraws
from each **snapshot**: booth settings, component health, templates, the
active session with its shots, the recent sessions, queue counts. One
shape for the kiosk, admin and the TV. Commands are plain POSTs. The
first message is the current state, so a Safari reload mid-session lands
on the right screen.

`apps/booth/src/lib/bus.ts` holds one Postgres LISTEN per process and
fans out to every stream; notifications are coalesced for 25 ms and a
10 s timer re-reads regardless.

The worker (`packages/worker/src/main.ts`) is one loop over the `jobs`
table: `FOR UPDATE SKIP LOCKED` claims the next due row, the handler
runs, the row is marked done or re-queued with backoff. LISTEN wakes it;
a 250 ms poll catches due countdowns. It reports `worker`, `camera`,
`printer` and `sync` health every 5 s into `components`, serves
`/health` on 3101, and will serve the MJPEG preview there in phase 3.

## The gallery (`packages/core/src/gallery.ts`, `packages/worker/src/gallery.ts`)

The booth is lent to other parties, so it knows nothing about any one
site: it knows how to push a session to a URL with a token, and what
link to put in the QR. Three variables, all optional:

- `GALLERY_SYNC_URL` and `GALLERY_SYNC_TOKEN` (the worker): where each
  finished session is POSTed as multipart form data: `session` (the
  short ID), `takenAt`, `width`, `height`, `photo` (the web JPEG) and
  `thumb`, with the token as a bearer. The gallery keys on `session`,
  so a retry or an admin "send again" replaces its copy. A GET with the
  same header is the reachability check the heartbeat makes once a
  minute, which is the `sync` card on admin.
- `GALLERY_SESSION_URL` (the app): the QR link, with `{id}` where the
  session ID goes (or a prefix it is appended to).

`gallerySetting(env)` reads them and reports half a configuration
instead of guessing; `planSync` decides whether a session is uploaded,
skipped (no gallery, or deleted), composed first (all its photos but
no web JPEG: a session from before the compositor, or one it failed on)
or failed for the queue to retry (misconfigured). **The sync sends the
compositor's web JPEG and thumbnail, never the raw shots**: the look and
the mirror are baked in, and the shots are the camera's own frames.
With no gallery configured a session is simply never `synced`, and the
admin row says so.

The wedding-planner's end is `POST /api/booth/photos` (the token is its
`BOOTH_SYNC_TOKEN`) and the page `/i/booth/{id}`, which shows the print
with a save button, says "on its way" until the sync lands, and 404s
like the rest of its public surface when the site is unpublished or the
couple hid the photo.

## Templates

A layout is a Canva PNG with every photo slot painted `#FF00FF`.
`ingestTemplate` (admin upload and seed alike) decodes it with sharp,
`detectSlots` finds the connected magenta regions (within a colour
distance of 80, so anti-aliased edges count), orders them in reading
order, and `knockOutMarkers` makes them transparent with a one-pixel
halo. Three files are written: the original, the knocked-out overlay at
print size, and the same overlay at screen size. The optional sidecar
maps slots to shots (`{"shots":[1,1,2,2,3,3]}` is the double strip) and
may list text fields, which nothing draws yet: ingesting one adds a
warning, so the words belong in the design.

The PNGs in `templates/` are placeholders from `scripts/make-sample-assets.ts`,
which centres each caption in the band under the photos by measuring the
rendered text, and refuses to write a layout whose caption would come
within `CAPTION_CLEARANCE` of a slot or the frame. **A changed PNG reaches
fresh databases only**: the seed never loads a file name twice, and
replacing a layout in place would redraw the sessions taken with it. An
existing database takes the new artwork as an admin upload after deleting
the old layout, which retires it if sessions used it (the README has the
steps).

## The compositor (`packages/core/src/compositor.ts`, `packages/worker/src/compositor.ts`)

Two renderers draw a session, and they must agree. Until it is
composed, the browser lays the shots under the overlay itself
(`Composite` in `apps/booth/src/components`) using the slot rectangles
as percentages, with the look as CSS: that is the picker and the
review. On `accepted` the worker's `composeSession` makes three JPEGs
with sharp: the postcard (`compositePath`, always landscape at
`PRINT_PX` and 300 dpi, a portrait layout turned a quarter clockwise),
the web photo (`webPath`, 1600 px long edge, the layout's way up) and a
thumbnail (`thumbPath`). From then on `Composite` is given the JPEG
(`composed`) and shows it in the same box: the QR screen, the attract
loop, the slideshow and admin show exactly what was printed and sent.

Core holds every number. `placePhotos` gives each slot a centred cover
crop of its shot (the viewfinder's `coverCrop`) drawn one pixel past
the slot, over the halo `knockOutMarkers` cleared. `applyLook` is the
CSS filter functions as the Filter Effects spec defines them, in sRGB,
clamped after every step and truncated to 8 bits, which is what
Chromium does: the tests hold Chromium's own output for every look and
the compositor lands within one level of it. The worker decodes each
shot once (EXIF-rotated, sRGB), cuts each slot from it, flops it if
mirrored, runs the look, lays the photos on white with the print-size
overlay on top, and writes the three files under fresh names.

The compose job runs only in `composing`; the queue retries a failure
and the last attempt sends `compose_failed`, so the kiosk says so
rather than waiting out the 60 s timeout. A reprint or a "send again"
of a session with photos but no JPEGs composes it on demand.

## Decisions made

- **HTTPS is Caddy's job in production and Next's in dev.** `next start`
  cannot terminate TLS, so `ops/Caddyfile` fronts the app (3100) and the
  worker's preview (3101) on one origin with the certificate from
  `ops/ca.sh`. `pnpm dev` runs `next dev --experimental-https` with the
  same files. The iPad installs `ops/certs/ca.crt` once.
- **The admin password** is one secret in `.env`; the cookie is an HMAC
  of a fixed label under it, so changing the password signs everyone
  out and the browser stores nothing reusable.
- **Phase 1 fakes**: `FakeCamera` cycles sample photos, `FakePrinter`
  waits 1.5 s and the paper counter still comes down.
- **Ports**: Postgres 5436, booth 3100, worker 3101, chosen to stay
  clear of the other projects on this machine.
- **The gallery is the event's site, not an app here.** There was an
  `apps/gallery` stub and a plan for R2 plus a gallery on Coolify; it
  went when the wedding-planner's album turned out to be where guests'
  own photos go, and one album beats two. The booth's end is generic
  (see **The gallery**), so a friend's party can point it anywhere that
  speaks the same POST, or nowhere.
- **The kiosk can run on the internet.** `docker-compose.coolify.yml`
  deploys Postgres, the worker and the booth app to Coolify as one
  resource, and the iPad opens its domain; Coolify's certificate means
  no private CA. `apps/booth/Dockerfile` and `packages/worker/Dockerfile`
  build from the repo root (`.dockerignore` keeps data, certs and `.env`
  out; the app's image copies the traced `standalone` server into a
  `node:24-alpine` runner that binds `::` so a health check against
  `localhost` works whether that resolves to IPv4 or IPv6), share a
  `/data` volume as the same `node` user, and the worker applies
  migrations before the seed so a fresh database needs no manual step. The camera there is
  the iPad's (no USB), the printer is fake, and anyone with the URL
  reaches the kiosk; `/admin` stays behind the password. Pages that
  read runtime secrets must be dynamic, because the image is built
  without them.
- **The kiosk installs to the home screen.** `app/manifest.ts` asks for
  `fullscreen`, which iPadOS shows as standalone with the status bar
  drawn over the page (`black-translucent`); the screens pad around it
  with `pt-safe-*` / `pb-safe-*` (globals.css), which are their usual
  padding in a Safari tab. There is no service worker on purpose: the
  kiosk is useless without the controller, and a cached shell would
  serve a stale kiosk after a deploy. A home-screen app has its own
  camera permission and cookies, separate from Safari's.
- **The dev `.env` lives at the repo root** and is read by the worker,
  the db scripts and (through `next.config.ts`) the app.
- **Delete on request** keeps the session row for the numbering and the
  admin history, removes the shots and files, and drops pending jobs.
- **Deleting a layout** removes it outright when no session used it.
  One that sessions were taken with is retired instead (`deletedAt`):
  switched off, hidden from admin and the picker, unlocked if it was
  the locked one, and kept with its overlay so those sessions still
  draw. The seed records every file it loads in `seeded_templates`, so
  a deleted or renamed seed layout does not come back on the next start.
- **Reprint** is a plain `print` job with `reprint: true`; it does not
  touch the session's phase. **Send again** (`/api/admin/sessions/{id}/sync`)
  is a plain `sync` job the same way.
- **Filters are a look on the session, not on the files.** The guest
  picks one on the review screen, comparing the looks on their own
  photos; the chips are the first shot through each. The tap is a
  `filter_chosen` event, accepted only in `review`, so `sessions.filter`
  changes like everything else does and is fixed once the print is on
  its way. A retake keeps it and poses through it. The shots on disk are
  the camera's own frames. `packages/core/src/filters.ts` is the one
  catalogue: each filter is a `Look` (grayscale, sepia, saturate,
  contrast, brightness) that `cssFilter` turns into CSS for `Composite`
  and the viewfinder, and that `applyLook` applies to pixels for the
  compositor with the same arithmetic, so the print matches the screen.
  Because the choice is made on the review, the JPEGs are composed on
  `accepted`, after it.
  `booth.filters` is which ones the attendant offers; with one on offer
  the review shows no chips and every session gets that one.
  **Mirroring is the same shape**: the "Mirrored" switch beside the
  chips is a `mirror_chosen` event, `sessions.mirrored` is the choice,
  `Composite` draws the photos with `scaleX(-1)` (the overlay stays),
  and the compositor flops them with sharp. Off by default: the
  true frame is what a DSLR gives, and text in the shot reads correctly.

## Phases

1. **The whole interface, nothing hooked up** - done: this repo.
2. **Compositor** - done: print, web and thumbnail JPEGs for any slot count, composed on `accepted` (see **The compositor**). Text fields from the sidecar are not drawn yet.
3. **Real camera** - `GPhoto2Camera`, MJPEG liveview, the stop-shoot-restart cycle, USB reconnect.
4. **Printing** - CUPS (driverless IPP first, Gutenprint second), the queue, the paper counter.
5. **Gallery and QR** - done, ahead of order, as the push to the event's site (see **The gallery**) and the wedding-planner's `/api/booth/photos` and `/i/booth/{id}`.
6. **Hardening** - systemd, a watchdog, recovery after a power cut, the 4-hour soak test.
7. **Polish** - sounds, retake (modelled already, not on the review screen yet), final artwork, whatever the hallway tests turn up.

Phases 3 and 4 are the gated ones and need the hardware in the room by
the end of October 2026. The full dress rehearsal is in February 2027.
