#!/usr/bin/env bash
# Sets the SELPHY CP1300 up as a CUPS queue on the controller, on
# postcard paper, with an error policy that fails the one print rather
# than stopping the queue (a stopped queue holds every guest's print
# behind it until someone runs cupsenable; a failed print says why on
# the kiosk and admin, and admin can print it again).
#
# On Debian or Raspberry Pi OS: over USB, through Gutenprint's dye-sub
# driver; it installs what is missing. On macOS: by AirPrint over the
# Wi-Fi, with no driver at all. Gutenprint has had no macOS build since
# 2024, and macOS takes no third-party USB printer backend, so a Mac
# cannot drive the SELPHY over USB.
#
# Run once per controller, with the printer switched on: plugged in on
# Linux; on a Mac, joined to the same Wi-Fi as the Mac (SELPHY's menu,
# Wi-Fi settings).
#
#   sudo ops/printer.sh            # the queue is called SELPHY
#   sudo ops/printer.sh BOOTH2     # or name it
#
# Then set BOOTH_PRINTER=cups in .env (and BOOTH_PRINTER_QUEUE, if the
# queue is not SELPHY) and run `pnpm print:test`.
set -euo pipefail

queue="${1:-SELPHY}"
mac=false
[[ "$(uname -s)" == Darwin ]] && mac=true

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
$mac || systemctl enable --now cups >/dev/null 2>&1 || true

if $mac; then
  # The printer's own IPP service, as ipp://<its name>.local:631/ipp/print.
  # The worker asks the same address how the printer is, so plain IPP,
  # not ipps (the printer's certificate is self-signed), and a name
  # rather than an address, so a new address from the router does not
  # lose it.
  echo "Looking for the SELPHY on the Wi-Fi"
  uri="$(ippfind _ipp._tcp -T 10 --name '[Ss][Ee][Ll][Pp][Hh][Yy]|[Cc][Pp]1300' --print 2>/dev/null | grep '^ipp://' | head -n1 || true)"
  if [[ -z "$uri" ]]; then
    echo "No SELPHY on the Wi-Fi. Is it switched on and joined to the same Wi-Fi as this Mac? These are the printers here:" >&2
    ippfind _ipp._tcp -T 5 --print-name 2>/dev/null >&2 || true
    exit 1
  fi
  # Driverless: CUPS asks the printer what it can do and writes the queue's description from that.
  model=everywhere
else
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
fi

echo "Adding $queue: $uri with $model"
lpadmin -p "$queue" -E -v "$uri" -m "$model" \
  -D "Canon SELPHY CP1300" -L "Photo booth" \
  -o printer-error-policy=abort-job \
  -o printer-is-shared=false

# Postcard: 100 x 148 mm, which CUPS and Gutenprint call Postcard (or
# name by its size in points). Borderless where the driver lists it
# apart, as a driverless queue does (Postcard.Borderless); Gutenprint's
# dye-sub postcard is borderless already.
sizes="$(lpoptions -p "$queue" -l | awk -F': ' '/^PageSize/ {print $2}' | tr ' ' '\n' | sed 's/^\*//')"
postcard='(postcard|jpn_hagaki_100x148mm|w28[34]h42[01])'
size="$(grep -ixE "$postcard\.(borderless|fullbleed)" <<<"$sizes" | head -n1 || true)"
[[ -n "$size" ]] || size="$(grep -ixE "$postcard" <<<"$sizes" | head -n1 || true)"
if [[ -z "$size" ]]; then
  echo "The driver offers no postcard size. It offers:" >&2
  echo "$sizes" >&2
  exit 1
fi
if $mac && ! grep -qiE '\.(borderless|fullbleed)$' <<<"$size"; then
  echo "Warning: the printer offers no borderless postcard, so the prints will have a white border." >&2
fi
lpadmin -p "$queue" -o PageSize="$size"

echo
lpstat -l -p "$queue"
echo
echo "Done: $queue prints on $size. Next:"
echo "  1. BOOTH_PRINTER=cups in .env$([[ "$queue" != SELPHY ]] && echo " and BOOTH_PRINTER_QUEUE=$queue")"
echo "  2. pnpm print:test, and read the safe margin off the card"
