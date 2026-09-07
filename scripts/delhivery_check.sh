#!/usr/bin/env bash
# Verify the Delhivery One connection for the founder's own stores.
#
#   ./scripts/delhivery_check.sh                    # serviceability + rate, origin 110089
#   ./scripts/delhivery_check.sh 400001 110089      # dest pin, origin pin
#   ./scripts/delhivery_check.sh --waybill          # also draws 1 waybill (CONSUMES one)
#   ./scripts/delhivery_check.sh --track 55475310005736
#
# Token comes from .env (YORAKU_DELHIVERY_API_TOKEN) or the environment.
# Read-only apart from --waybill; it never manifests a shipment.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

TOK="${YORAKU_DELHIVERY_API_TOKEN:-}"
[ -n "$TOK" ] || { echo "YORAKU_DELHIVERY_API_TOKEN not set (.env or env)"; exit 1; }
BASE="https://track.delhivery.com"
dl() { curl -sS -m 30 -H "Authorization: Token $TOK" -H "Accept: application/json" "$BASE$1"; }

WAYBILL=0; TRACK=""
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --waybill) WAYBILL=1 ;;
    --track)   TRACK="${2:-}"; shift ;;
    *)         ARGS+=("$1") ;;
  esac
  shift
done
DEST="${ARGS[0]:-110001}"
ORIGIN="${ARGS[1]:-110089}"

if [ -n "$TRACK" ]; then
  echo "── tracking $TRACK"
  dl "/api/v1/packages/json/?waybill=$TRACK"; echo; exit 0
fi

for PIN in "$ORIGIN" "$DEST"; do
  echo "── serviceability $PIN"
  dl "/c/api/pin-codes/json/?filter_codes=$PIN" \
    | tr ',' '\n' | grep -E '"(pin|state_code|district|cod|pre_paid|pickup|is_oda|sort_code)"' || true
done

echo "── rate  $ORIGIN → $DEST  500g prepaid surface"
dl "/api/kinko/v1/invoice/charges/.json?md=E&ss=Delivered&o_pin=$ORIGIN&d_pin=$DEST&cgm=500&pt=Pre-paid" \
  | tr ',' '\n' | grep -E '"(zone|charged_weight|gross_amount|total_amount)"' || true

if [ "$WAYBILL" = "1" ]; then
  echo "── waybill (consumes one from the pool)"
  dl "/waybill/api/bulk/json/?count=1"; echo
fi
echo "── connection OK"
