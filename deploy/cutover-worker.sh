#!/usr/bin/env bash
# deploy/cutover-worker.sh — FALLBACK cutover: madeinegyptgate.com served by the Worker "migate-site" (site in R2,
# worker-site/) instead of a Pages project. No DNS change: the apex A record is proxied, so a zone route wins.
#
#   CLOUDFLARE_API_TOKEN=… deploy/cutover-worker.sh            (asks before changing anything; --yes for no prompt)
#
# What it does, in this order (every step is safe to re-run):
#   1. pre-flight: the Worker migate-site exists and its workers.dev URL serves a complete build (/_seo/pages.json),
#      the Worker mis-egypt exists, janna-lookup has its /api/… routes
#   2. adds one specific mis-egypt route per path of deploy/legacy-live.txt, on the apex AND www, if missing (the count follows
#      that file — 6 paths = 12 routes as of deploy 2) — more specific routes win, so /panel.html, /login.html,
#      /api/index.php … keep coming from Hostinger exactly as today
#   3. the two catch-all routes madeinegyptgate.com/* and www.madeinegyptgate.com/*: they are taken away from mis-egypt and
#      given to migate-site in ONE call each (PUT re-points the existing route: two Workers can never hold the same pattern,
#      and there is no moment without a route); a missing catch-all is created for migate-site
#   janna-lookup's /api/<family>/* routes are more specific and stay as they are. mis-egypt itself is never changed.
# Rollback (one command): deploy/rollback-worker.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZONE="madeinegyptgate.com"; ACC="${CLOUDFLARE_ACCOUNT_ID:-88c77c2b7595dd0ce510270175f69143}"
SITE_WORKER="${SITE_WORKER:-migate-site}"; LEGACY="${LEGACY_WORKER:-mis-egypt}"; API_WORKER="janna-lookup"
SITE_URL="${SITE_URL:-https://migate-site.daily-spoonbill.workers.dev}"
API="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"
YES=0; FORCE=0
for a in "$@"; do case "$a" in --yes|-y) YES=1 ;; --force) FORCE=1 ;; -h|--help) sed -n '2,20p' "$0"; exit 0 ;; esac; done
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "export CLOUDFLARE_API_TOKEN (Zone: Workers Routes: Edit on $ZONE, Account: Workers Scripts: Read)" >&2; exit 2; }
api() { local m="$1" p="$2"; shift 2; curl -sS --max-time 60 -X "$m" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" ${1:+--data "$1"} "$API$p"; }
py() { python3 -c "$1" "${@:2}"; }
ok() { printf '  OK    %s\n' "$*"; }; bad() { printf '  FAIL  %s\n' "$*"; }; die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

Z=$(api GET "/zones?name=$ZONE" | py 'import json,sys;d=json.load(sys.stdin);print(d["result"][0]["id"] if d.get("result") else "")') || true
[ -n "$Z" ] || die "this token cannot see the zone $ZONE"
routes() { api GET "/zones/$Z/workers/routes"; }

echo "==> pre-flight"
pf=0
scripts=$(api GET "/accounts/$ACC/workers/scripts" | py 'import json,sys;print(" ".join(s.get("id","") for s in json.load(sys.stdin).get("result") or []))')
for w in "$SITE_WORKER" "$LEGACY"; do case " $scripts " in *" $w "*) ok "Worker $w exists" ;; *) bad "Worker $w not found"; pf=1 ;; esac; done
built=$(curl -sS --compressed --max-time 30 "$SITE_URL/_seo/pages.json" 2>/dev/null | head -c 400 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z' | head -n 1 || true)
if [ -n "$built" ]; then ok "$SITE_URL serves the build of $built"; else bad "$SITE_URL does not serve a build (upload not finished?)"; pf=1; fi
for p in / /factories/ /en/ /tenders/search/ /robots.txt /sitemap.xml; do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$SITE_URL$p" || echo 000)
  [ "$c" = 200 ] && ok "$p → 200 on $SITE_WORKER" || { bad "$p → $c on $SITE_WORKER"; pf=1; }
done
if routes | py 'import json,sys;d=json.load(sys.stdin);sys.exit(0 if any(r.get("script")==sys.argv[1] and "/api/auth" in r.get("pattern","") for r in d.get("result") or []) else 3)' "$API_WORKER"; then
  ok "$API_WORKER has its /api routes"; else bad "$API_WORKER has no /api/auth route (deploy.sh worker first)"; pf=1; fi
if [ "$pf" != 0 ]; then [ "$FORCE" = 1 ] || die "pre-flight failed — nothing was changed (--force to go on anyway)"; fi

echo "==> plan"
want=$(sed -e 's/#.*//' -e 's/[[:space:]]//g' "$HERE/legacy-live.txt" | grep -E '^/' | while IFS= read -r p; do printf '%s%s\nwww.%s%s\n' "$ZONE" "$p" "$ZONE" "$p"; done)
plan=$(routes | py '
import json, sys
d = json.load(sys.stdin); zone, site, legacy = sys.argv[1], sys.argv[2], sys.argv[3]; want = sys.argv[4].split()
by = {r.get("pattern", ""): r for r in d.get("result") or []}
for p in want:
    r = by.get(p)
    print("keep %s" % p if r and r.get("script") == legacy else "create-legacy %s" % p if not r else "CONFLICT %s is bound to %s" % (p, r.get("script")))
for p in (zone + "/*", "www." + zone + "/*"):
    r = by.get(p)
    if not r: print("create-site %s" % p)
    elif r.get("script") == site: print("done %s" % p)
    else: print("repoint %s %s (now %s)" % (r["id"], p, r.get("script") or "no Worker"))
' "$ZONE" "$SITE_WORKER" "$LEGACY" "$(echo $want)")
printf '%s\n' "$plan" | sed 's/^/    /'
case "$plan" in *CONFLICT*) die "a legacy path route is bound to another Worker — fix it first; nothing was changed" ;; esac
if [ "$YES" != 1 ]; then printf 'Switch %s to the Worker %s now? type "yes": ' "$ZONE" "$SITE_WORKER"; read -r a; [ "$a" = yes ] || die "cancelled"; fi

post() { api POST "/zones/$Z/workers/routes" "{\"pattern\":\"$1\",\"script\":\"$2\"}" | py 'import json,sys;d=json.load(sys.stdin);sys.exit(0 if d.get("success") else (print(d.get("errors")) or 1))'; }
while read -r act p; do
  [ "$act" = create-legacy ] || continue
  post "$p" "$LEGACY" || die "could not add $p → $LEGACY (catch-alls untouched: the old site is still live)"
  ok "added $p → $LEGACY"
done <<< "$plan"
while read -r act id p _; do
  case "$act" in
    repoint) if api PUT "/zones/$Z/workers/routes/$id" "{\"pattern\":\"$p\",\"script\":\"$SITE_WORKER\"}" | py 'import json,sys;sys.exit(0 if json.load(sys.stdin).get("success") else 1)'; then
               ok "$p: $LEGACY → $SITE_WORKER (one call)"
             else   # fallback: remove the catch-all first, then add it for migate-site (a second or two in between)
               api DELETE "/zones/$Z/workers/routes/$id" >/dev/null && post "$p" "$SITE_WORKER" || die "could not move $p — run deploy/rollback-worker.sh"
               ok "$p: removed from $LEGACY, added for $SITE_WORKER"
             fi ;;
  esac
done <<< "$plan"
while read -r act p; do
  [ "$act" = create-site ] || continue
  post "$p" "$SITE_WORKER" || die "could not add $p → $SITE_WORKER"; ok "added $p → $SITE_WORKER"
done <<< "$plan"
echo "==> routes now"
routes | py 'import json,sys
for r in sorted(json.load(sys.stdin).get("result") or [], key=lambda r: r.get("pattern","")): print("    %-52s -> %s" % (r.get("pattern"), r.get("script")))'
echo "==> check: deploy/smoke-test.sh https://$ZONE   (rollback: deploy/rollback-worker.sh)"
