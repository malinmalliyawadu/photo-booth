#!/usr/bin/env bash
# Makes a private certificate authority and issues the controller's
# certificate from it, so every screen on the booth Wi-Fi talks HTTPS.
#
# Safari refuses getUserMedia outside a secure context and the booth is
# served from a private IP, so this is not optional: the iPad camera
# fallback exists on the night only if the iPad trusts this CA.
#
# Idempotent: keeps an existing CA, reissues the server certificate
# only when asked (--reissue) or when it is missing. Needs openssl.
#
#   ops/ca.sh                       # localhost + booth.local
#   BOOTH_HOSTS="booth.local,192.168.8.10" ops/ca.sh --reissue
#
# Output, under ops/certs/ (gitignored):
#   ca.crt      install this on the iPad (AirDrop it, then Settings >
#               General > VPN & Device Management > install; then
#               Settings > General > About > Certificate Trust Settings
#               > enable full trust)
#   ca.key      stays on the controller
#   booth.crt   the server certificate, with the hosts below as SANs
#   booth.key   the server key
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$here/certs"
hosts="${BOOTH_HOSTS:-localhost,booth.local,127.0.0.1}"
reissue=false
[[ "${1:-}" == "--reissue" ]] && reissue=true

mkdir -p "$out"
chmod 700 "$out"

if [[ ! -f "$out/ca.key" ]]; then
  echo "Creating the booth CA"
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$out/ca.key" -out "$out/ca.crt" -days 3650 \
    -subj "/CN=Photo booth CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 "$out/ca.key"
  reissue=true
fi

if [[ ! -f "$out/booth.crt" ]]; then
  reissue=true
fi

if [[ "$reissue" == true ]]; then
  echo "Issuing the controller certificate for: $hosts"
  san=""
  IFS=',' read -ra parts <<< "$hosts"
  for h in "${parts[@]}"; do
    h="$(echo "$h" | xargs)"
    if [[ "$h" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      san="${san:+$san,}IP:$h"
    else
      san="${san:+$san,}DNS:$h"
    fi
  done
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$out/booth.key" -out "$out/booth.csr" \
    -subj "/CN=Photo booth" 2>/dev/null
  ext="$(mktemp)"
  cat > "$ext" <<EXT
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
EXT
  openssl x509 -req -in "$out/booth.csr" -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial \
    -out "$out/booth.crt" -days 825 -extfile "$ext" 2>/dev/null
  rm -f "$ext" "$out/booth.csr"
  chmod 600 "$out/booth.key"
fi

echo "CA:          $out/ca.crt"
echo "Certificate: $out/booth.crt"
openssl x509 -in "$out/booth.crt" -noout -ext subjectAltName | tail -1 | sed 's/^ */SANs:        /'
