#!/usr/bin/env bash
# Sets the SELPHY CP1300 up as a CUPS queue on the controller: over
# USB, through Gutenprint's dye-sub driver, on postcard paper, with an
# error policy that fails the one print rather than stopping the queue
# (a stopped queue holds every guest's print behind it until someone
# runs cupsenable; a failed print says why on the kiosk and admin, and
# admin can print it again).
#
# Run once per controller, with the printer plugged in and switched on.
# Debian or Raspberry Pi OS; it installs what is missing.
#
#   sudo ops/printer.sh            # the queue is called SELPHY
#   sudo ops/printer.sh BOOTH2     # or name it
#
# Then set BOOTH_PRINTER=cups in .env (and BOOTH_PRINTER_QUEUE, if the
# queue is not SELPHY) and run `pnpm print:test`.
set -euo pipefail

queue="${1:-SELPHY}"

if [[ $EUID -ne 0 ]]; then
  echo "Run it with sudo: it installs packages and adds a printer." >&2
  exit 1
fi

if command -v apt-get >/dev/null; then
  apt-get update -qq
  # fonts-dejavu-core is for the test print's labels; nothing else draws text.
  apt-get install -y --no-install-recommends cups cups-client cups-filters printer-driver-gutenprint fonts-dejavu-core
fi
for tool in lpadmin lpinfo lpoptions lpstat; do
  command -v "$tool" >/dev/null || { echo "$tool is missing: install CUPS and Gutenprint 5.3, then run this again." >&2; exit 1; }
done
systemctl enable --now cups >/dev/null 2>&1 || true

# Gutenprint's own USB backend (gutenprint53+usb://canon-cp1300/...)
# speaks the SELPHY's protocol; CUPS's generic usb:// one does not.
# Network backends are skipped: they take seconds and find nothing here.
uri="$(lpinfo --exclude-schemes dnssd,snmp,socket,lpd,ipp,ipps,http,https,smb -v 2>/dev/null \
  | awk '{print $2}' | grep -iE '^gutenprint[0-9]*\+usb://canon-cp1300(/|$)' | head -n1 || true)"
if [[ -z "$uri" ]]; then
  echo "No SELPHY CP1300 on USB. Is it plugged in and switched on? These are the devices CUPS can see:" >&2
  lpinfo -v >&2 || true
  exit 1
fi

model="$(lpinfo -m 2>/dev/null | awk '{print $1}' | grep -iE '://canon-cp1300/expert$' | head -n1 || true)"
[[ -n "$model" ]] || model="$(lpinfo -m 2>/dev/null | awk '{print $1}' | grep -iE '://canon-cp1300/' | head -n1 || true)"
if [[ -z "$model" ]]; then
  echo "Gutenprint has no driver for the CP1300: it needs Gutenprint 5.3 or later." >&2
  exit 1
fi

echo "Adding $queue: $uri with $model"
lpadmin -p "$queue" -E -v "$uri" -m "$model" \
  -D "Canon SELPHY CP1300" -L "Photo booth" \
  -o printer-error-policy=abort-job \
  -o printer-is-shared=false

# Postcard: 100 x 148 mm, which Gutenprint calls Postcard (or by its size in points).
sizes="$(lpoptions -p "$queue" -l | awk -F': ' '/^PageSize/ {print $2}' | tr ' ' '\n' | sed 's/^\*//')"
size="$(grep -ixE 'postcard' <<<"$sizes" | head -n1 || true)"
[[ -n "$size" ]] || size="$(grep -ixE 'w28[34]h42[01]' <<<"$sizes" | head -n1 || true)"
if [[ -z "$size" ]]; then
  echo "The driver offers no postcard size. It offers:" >&2
  echo "$sizes" >&2
  exit 1
fi
lpadmin -p "$queue" -o PageSize="$size"

echo
lpstat -l -p "$queue"
echo
echo "Done: $queue prints on $size. Next:"
echo "  1. BOOTH_PRINTER=cups in .env$([[ "$queue" != SELPHY ]] && echo " and BOOTH_PRINTER_QUEUE=$queue")"
echo "  2. pnpm print:test, and read the safe margin off the card"
