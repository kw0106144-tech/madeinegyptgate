#!/usr/bin/env bash
# deploy/rollback-worker.sh — ONE command back to the old site after deploy/cutover-worker.sh: the two catch-all routes
# madeinegyptgate.com/* and www.madeinegyptgate.com/* are given back to the Worker mis-egypt (PUT re-points them in one
# call each; a missing one is created). The specific mis-egypt routes and janna-lookup's /api routes stay (harmless).
# The Worker migate-site and its R2 bucket stay too (no route = not served on the domain). No DNS change.
#
#   CLOUDFLARE_API_TOKEN=… deploy/rollback-worker.sh [--yes]
set -euo pipefail
ZONE="madeinegyptgate.com"; LEGACY="${LEGACY_WORKER:-mis-egypt}"
API="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"
YES=0; for a in "$@"; do case "$a" in --yes|-y) YES=1 ;; esac; done
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "export CLOUDFLARE_API_TOKEN (Zone: Workers Routes: Edit on $ZONE)" >&2; exit 2; }
api() { local m="$1" p="$2"; shift 2; curl -sS --max-time 60 -X "$m" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" ${1:+--data "$1"} "$API$p"; }
py() { python3 -c "$1" "${@:2}"; }
Z=$(api GET "/zones?name=$ZONE" | py 'import json,sys;d=json.load(sys.stdin);print(d["result"][0]["id"] if d.get("result") else "")') || true
[ -n "$Z" ] || { echo "ERROR: this token cannot see the zone $ZONE" >&2; exit 1; }
plan=$(api GET "/zones/$Z/workers/routes" | py '
import json, sys
d = json.load(sys.stdin); zone, legacy = sys.argv[1], sys.argv[2]
by = {r.get("pattern", ""): r for r in d.get("result") or []}
for p in (zone + "/*", "www." + zone + "/*"):
    r = by.get(p)
    print("create - %s" % p if not r else "keep - %s" % p if r.get("script") == legacy else "repoint %s %s" % (r["id"], p))
' "$ZONE" "$LEGACY")
printf '%s\n' "$plan" | sed 's/^/    /'
if [ "$YES" != 1 ]; then printf 'Give both catch-all routes back to %s (the old site answers everything again)? type "yes": ' "$LEGACY"; read -r a; [ "$a" = yes ] || exit 1; fi
while read -r act id p; do
  case "$act" in
    repoint) api PUT "/zones/$Z/workers/routes/$id" "{\"pattern\":\"$p\",\"script\":\"$LEGACY\"}" | py 'import json,sys;sys.exit(0 if json.load(sys.stdin).get("success") else 1)' \
               || { api DELETE "/zones/$Z/workers/routes/$id" >/dev/null; api POST "/zones/$Z/workers/routes" "{\"pattern\":\"$p\",\"script\":\"$LEGACY\"}" >/dev/null; }
             echo "  OK    $p → $LEGACY" ;;
    create) api POST "/zones/$Z/workers/routes" "{\"pattern\":\"$p\",\"script\":\"$LEGACY\"}" | py 'import json,sys;sys.exit(0 if json.load(sys.stdin).get("success") else 1)' \
              && echo "  OK    $p → $LEGACY (created)" || echo "  FAIL  $p: add it by hand (Workers Routes → Add route → $p → $LEGACY)" ;;
  esac
done <<< "$plan"
echo "  the old site answers madeinegyptgate.com again"
