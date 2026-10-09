#!/usr/bin/env bash
# Puts the booth on the tailnet over HTTPS. `tailscale serve` answers at
# https://<machine>.<tailnet>.ts.net with a certificate Safari already
# trusts and hands each request to the app on 127.0.0.1:3100, which
# `pnpm start` runs. The iPad, signed in to the same tailnet, opens that
# address: no certificate to install, and on the same Wi-Fi Tailscale
# connects the two directly, so a guest's session stays on the local
# network.
#
# Once per controller; Tailscale keeps the setting across restarts.
# Needs Tailscale installed and signed in, with HTTPS certificates on
# for the tailnet (admin console, DNS, HTTPS Certificates).
#
#   ops/tailscale.sh                 # at this machine's tailnet name
#   ops/tailscale.sh --name booth    # as booth.<tailnet>.ts.net; the OS keeps its own name
#   ops/tailscale.sh --off           # stop serving the booth
set -euo pipefail

ts="$(command -v tailscale || true)"
[[ -n "$ts" ]] || ts=/Applications/Tailscale.app/Contents/MacOS/Tailscale
if [[ ! -x "$ts" ]]; then
  echo "Tailscale is not installed: https://tailscale.com/download" >&2
  exit 1
fi

name=""
off=false
while (($#)); do
  case "$1" in
    --name) name="${2:?--name needs a name}"; shift 2 ;;
    --off) off=true; shift ;;
    *) echo "Unknown option $1: see the top of $0" >&2; exit 1 ;;
  esac
done

if $off; then
  "$ts" serve --https=443 off
  echo "The booth is off the tailnet"
  exit 0
fi

# The tailnet's view of this machine: whether it is signed in, and the
# name its certificate is for.
tailnet() {
  "$ts" status --json | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const j = JSON.parse(s);
      console.log(j.BackendState, (j.CertDomains ?? [])[0] ?? "-");
    });'
}

read -r state domain < <(tailnet)
if [[ "$state" != Running ]]; then
  echo "Tailscale is $state: sign in to it, then run this again." >&2
  exit 1
fi

if [[ -n "$name" ]]; then
  # The machine's name on the tailnet only: macOS or Linux keeps its own.
  "$ts" set --hostname="$name"
  for _ in {1..20}; do
    read -r state domain < <(tailnet)
    [[ "$domain" == "$name".* ]] && break
    sleep 0.5
  done
fi

if [[ "$domain" == - ]]; then
  echo "The tailnet has no HTTPS certificates: turn them on at https://login.tailscale.com/admin/dns, then run this again." >&2
  exit 1
fi

"$ts" serve --bg --https=443 http://127.0.0.1:3100

# The certificate is issued on the first request; ask for it now rather
# than on the iPad's first visit.
curl -s -o /dev/null --max-time 60 "https://$domain/" || true

echo
echo "The booth is at https://$domain"
echo "Open it on the iPad, signed in to Tailscale, while pnpm start runs."
