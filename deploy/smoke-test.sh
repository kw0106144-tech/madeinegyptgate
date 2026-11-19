#!/usr/bin/env bash
# deploy/smoke-test.sh — post-deploy smoke test for madeinegyptgate.com (Pages site + Functions + Worker API).
# Read-only: GET/HEAD requests only, no cookies, no login — one exception: POST /api/ev/pv with a bot User-Agent (the
# Worker answers 204 and records nothing for bots; it proves the route). Needs bash, curl, grep, sed, awk; python3 (recommended)
# adds the full contact detector, the redirect-map samples and the asset check (deploy/stage.py).
#
#   deploy/smoke-test.sh https://madeinegyptgate.com                              # production, after the cutover
#   deploy/smoke-test.sh --no-worker https://madeinegyptgate.pages.dev             # Pages production URL, before it
#   deploy/smoke-test.sh --no-worker --env preview --stage build/pages-stage https://<hash>.madeinegyptgate.pages.dev
#   deploy/smoke-test.sh --api-only https://janna-lookup.<account-subdomain>.workers.dev   # the Worker alone
#
# Options:
#   --stage DIR        the staging dir of this deploy: the live site must serve exactly this build (manifest time,
#                      sitemap URL count, robots.txt), and the redirect map / pages to test are taken from it
#   --env E            production | preview | auto (default). preview = a deployment of a non-production branch: it has
#                      no SEO KV, D1 or secrets (deploy/wrangler-pages.toml [env.preview]) and /api/seo must say so
#   --sample N         random sitemap URLs to fetch (default 30)
#   --redirects N      random exact rules of the redirect map to follow (default 25)
#   --seed N           random seed for the samples (default: today's date)
#   --max-age H        FAIL when the live build is older than H hours (default: WARN after 26 h) — the daily rebuild
#   --no-worker        skip the Worker health checks (/api/janna|advisor|meetings|auth|inquiries|wa) — use it on
#                      *.pages.dev, where the Worker routes do not exist
#   --api-only         only the API health checks
#   --api-base URL     where the Worker answers (default: the base URL)
#   --no-seo-api       skip /api/seo/health (the Pages Function); automatic with --api-only on *.workers.dev
#   --platform-key K   send X-Platform-Key on /api/seo/health (default: $SEO_PLATFORM_KEY, else $PLATFORM_KEY)
#   --no-legacy        skip the legacy-URL redirect / 410 checks
#   --legacy-live      check the old system's paths (deploy/legacy-live.txt: /panel.html, /login.html, /api/index.php* …
#                      still answered by the old PHP system through the Worker mis-egypt — deploy 2 keeps all of them)
#                      — default on madeinegyptgate.com / www
#   --no-legacy-live   skip that check (e.g. on *.pages.dev, where those paths do not exist)
#   --no-cc            skip the deploy-2 Admin Control Center checks (/admin/, /login/, /pay/, /data/overlay.js,
#                      /api/admin/cc, /api/plans, /api/settings, /media/u/, /api/ev/pv) — e.g. against a deploy-1 build
#   --strict           warnings count as failures
#   --timeout S        per request (default 20)
#   -q                 print only WARN / FAIL lines and the summary
# Exit: 0 = no FAIL, 1 = at least one FAIL (or a WARN with --strict), 2 = usage.
set -uo pipefail

CANON="https://madeinegyptgate.com"
BASE="" STAGE="" SAMPLE=30 NRED=25 SEED="" NO_WORKER=0 API_ONLY=0 API_BASE="" NO_LEGACY=0 STRICT=0 TIMEOUT=20 QUIET=0
SEO_API=1 ENVX=auto MAX_AGE="" LEGACY_LIVE=auto CC=1
PKEY="${SEO_PLATFORM_KEY:-${PLATFORM_KEY:-}}"
UA="migate-smoke/2.0 (deploy check)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_PY="$HERE/stage.py"
PY="$(command -v python3 || true)"
[ -f "$STAGE_PY" ] || PY=""

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --stage) STAGE="${2:?}"; shift 2 ;;
    --env) ENVX="${2:?}"; shift 2 ;;
    --sample) SAMPLE="${2:?}"; shift 2 ;;
    --redirects) NRED="${2:?}"; shift 2 ;;
    --seed) SEED="${2:?}"; shift 2 ;;
    --max-age) MAX_AGE="${2:?}"; shift 2 ;;
    --no-worker) NO_WORKER=1; shift ;;
    --api-only) API_ONLY=1; shift ;;
    --api-base) API_BASE="${2:?}"; shift 2 ;;
    --platform-key) PKEY="${2:?}"; shift 2 ;;
    --no-legacy) NO_LEGACY=1; shift ;;
    --legacy-live) LEGACY_LIVE=1; shift ;;
    --no-legacy-live) LEGACY_LIVE=0; shift ;;
    --no-cc) CC=0; shift ;;
    --no-seo-api) SEO_API=0; shift ;;
    --strict) STRICT=1; shift ;;
    --timeout) TIMEOUT="${2:?}"; shift 2 ;;
    -q) QUIET=1; shift ;;
    -h|--help) usage ;;
    -*) echo "unknown option $1" >&2; usage ;;
    *) BASE="$1"; shift ;;
  esac
done
[ -n "$BASE" ] || usage
case "$ENVX" in production|preview|auto) ;; *) echo "--env must be production, preview or auto" >&2; exit 2 ;; esac
command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }
BASE="${BASE%/}"; API_BASE="${API_BASE:-$BASE}"; API_BASE="${API_BASE%/}"
HOST=$(printf '%s' "$BASE" | sed -E 's#^[a-zA-Z]+://##; s#[/:].*$##')
case "$HOST" in *.workers.dev) [ "$API_ONLY" = 0 ] || SEO_API=0 ;; esac
SEED="${SEED:-$(date -u +%Y%m%d)}"
if [ -n "$STAGE" ] && [ ! -d "$STAGE/site" ]; then echo "--stage $STAGE has no site/ (run deploy/deploy.sh stage)" >&2; exit 2; fi
export LC_ALL=C

TMP=$(mktemp -d 2>/dev/null || mktemp -d -t migsmoke)
trap 'rm -rf "$TMP"' EXIT
P=0 W=0 F=0 OLD_SITE=0
pass() { P=$((P + 1)); [ "$QUIET" = 1 ] || printf 'PASS  %s\n' "$*"; }
warn() { W=$((W + 1)); printf 'WARN  %s\n' "$*"; }
fail() { F=$((F + 1)); printf 'FAIL  %s\n' "$*"; }
info() { [ "$QUIET" = 1 ] || printf 'info  %s\n' "$*"; }
section() { [ "$QUIET" = 1 ] || printf '\n== %s\n' "$*"; }

# fetch URL [extra curl args] → CODE, LOC (absolute redirect target), RAWLOC (the Location header as sent), CTYPE, TIME;
# body in $TMP/body, headers of the final response in $TMP/hdr (a proxy's "200 Connection established" block is dropped).
fetch() {
  local url="$1" w rc rest
  shift
  w=$(curl -sS -o "$TMP/body" -D "$TMP/hdr.raw" --max-time "$TIMEOUT" --retry 2 --retry-delay 1 --compressed \
        -A "$UA" -w '%{http_code}|%{redirect_url}|%{content_type}|%{time_total}' "$@" "$url" 2>"$TMP/err")
  rc=$?
  CODE=${w%%|*}; rest=${w#*|}; LOC=${rest%%|*}; rest=${rest#*|}; CTYPE=${rest%%|*}; TIME=${rest#*|}
  if [ $rc -ne 0 ] || [ -z "$CODE" ]; then CODE=000; fi
  awk 'BEGIN{b=""} /^HTTP\//{b=""} {b=b $0 "\n"} END{printf "%s", b}' "$TMP/hdr.raw" 2>/dev/null | tr -d '\r' > "$TMP/hdr"
  RAWLOC=$(hdr Location)
  return 0
}
hdr() { grep -i "^$1:" "$TMP/hdr" | tail -n 1 | cut -d: -f2- | sed 's/^ *//'; }
cerr() { tail -n 1 "$TMP/err" | head -c 160; }
status() { curl -sS -o /dev/null --max-time "$TIMEOUT" --retry 1 -A "$UA" -w '%{http_code}' "$1" 2>/dev/null || printf '000'; }
# map a canonical URL (https://madeinegyptgate.com/...) onto the base under test
onbase() { case "$1" in "$CANON"*) printf '%s%s' "$BASE" "${1#"$CANON"}" ;; *) printf '%s' "$1" ;; esac; }
# path part of an absolute URL (keeps the query)
upath() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://[^/]+##'; }
uhost() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://##; s#[/:?#].*$##'; }
canonical() { grep -oE '<link[^>]+rel="canonical"[^>]*>' "$TMP/body" | head -n 1 | grep -oE 'href="[^"]*"' | sed 's/^href="//; s/"$//'; }
robots_meta() { grep -oE '<meta[^>]+name="robots"[^>]*>' "$TMP/body" | head -n 1 | grep -oE 'content="[^"]*"' | sed 's/^content="//; s/"$//'; }
h1() { grep -oE '<h1[^>]*>[^<]{0,120}' "$TMP/body" | head -n 1 | sed -E 's/<h1[^>]*>//'; }
# <title> tags inside <head> only (inline SVG icons carry their own <title>)
head_titles() { awk '{ i = index($0, "</head>"); if (i) { print substr($0, 1, i); exit } print }' "$TMP/body" | grep -o '<title' | wc -l | tr -d ' '; }
lowerhex() { if command -v perl >/dev/null; then printf '%s' "$1" | perl -pe 's/%([0-9A-F]{2})/"%".lc($1)/ge'; else printf ''; fi; }
# same URL path, ignoring percent-encoding differences (python3) or the case of %XX escapes (perl)
same_url() {
  [ "$1" = "$2" ] && return 0
  if [ -n "$PY" ]; then "$PY" -c 'import sys,unicodedata as u;from urllib.parse import unquote as q
n=lambda s:u.normalize("NFC",q(s));sys.exit(0 if n(sys.argv[1])==n(sys.argv[2]) else 1)' "$1" "$2"; return; fi
  command -v perl >/dev/null || return 1; [ "$(lowerhex "$1")" = "$(lowerhex "$2")" ]
}
CLAIM_RX='(^|[^0-9A-Za-z_.,])26[ ,.]?(808|000|[kK]([^A-Za-z0-9]|$))|(^|[^0-9.,])26 ?ألف|٢٦(٬)?٨٠٨'
has_claim() { grep -qE "$CLAIM_RX" "$1"; }
# non-platform phone numbers / e-mails in a file (prints up to 5): the gate's detector (mobiles and landlines in any
# spacing, hotlines after a phone word, tel:/wa.me links, obfuscated e-mails); without python3 a simpler grep
contacts_in() { # file [html]
  if [ -n "$PY" ]; then "$PY" "$STAGE_PY" contacts ${2:+--html} "$1" 2>/dev/null | head -n 5; return; fi
  { grep -oE '(^|[^0-9])(\+?20|0)1[0125][ -]?[0-9]{3,4}[ -]?[0-9]{4}([^0-9]|$)|(^|[^0-9+])0[2-9][0-9]?[ /-]{0,2}[0-9]{2,4}[ -]?[0-9]{3,4}[ -]?[0-9]{0,4}([^0-9]|$)' "$1" \
      | grep -vE '1279188996|38346757|1012345678|127 ?918 ?8996'
    grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "$1" \
      | grep -viE '@([a-z0-9-]+\.)*madeinegyptgate\.com$|@(example\.(com|org|net)|company\.com(\.eg)?|buyer\.com)$' \
      | grep -viE '\.(png|jpe?g|webp|gif|svg|avif|ico|css|js|mjs|json|woff2?|ttf|mp4|pdf|html|xml|txt)$'
  } | sort -u | head -n 5
}
is_preview_host() { case "$HOST" in *.pages.dev) [ "$(printf '%s' "$HOST" | tr -cd '.' | wc -c)" -ge 3 ] ;; *) return 1 ;; esac; }
# the build's redirect map / manifest: from the stage, else from the live site (both are public build files)
mapfile_get() { # name → local path
  if [ -n "$STAGE" ] && [ -f "$STAGE/site/_seo/$1" ]; then printf '%s' "$STAGE/site/_seo/$1"; return; fi
  if [ ! -f "$TMP/_seo-$1" ]; then curl -sS --compressed --max-time "$TIMEOUT" -A "$UA" -o "$TMP/_seo-$1" "$BASE/_seo/$1" 2>/dev/null || rm -f "$TMP/_seo-$1"; fi
  [ -s "$TMP/_seo-$1" ] && printf '%s' "$TMP/_seo-$1"
}

printf 'smoke test %s  (%s UTC, env %s)%s\n' "$BASE" "$(date -u +%Y-%m-%dT%H:%M)" "$ENVX" "${STAGE:+  stage: $STAGE}"

# --------------------------------------------------------------------------------------------------------------- pages
if [ "$API_ONLY" = 0 ]; then
  section "old site still in front? (Worker mis-egypt on madeinegyptgate.com/*)"
  fetch "$BASE/factories/"
  if [ "$CODE" = 301 ] && printf '%s' "$LOC" | grep -q '/factories\.html$'; then
    OLD_SITE=1
    fail "/factories/ → 301 $LOC: the OLD site is answering (Worker 'mis-egypt' route madeinegyptgate.com/* is still active — README-DEPLOY.md section 6, step 4)"
  elif [ "$CODE" = 000 ]; then
    fail "/factories/: no connection ($(cerr))"
  else
    pass "/factories/ is served by the new site ($CODE)"
  fi

  # the old system (Worker mis-egypt → Hostinger PHP): after the deploy-1 cutover only the paths of deploy/legacy-live.txt
  # may still come from there — each must answer as the OLD system does. Deploy 2 keeps all of them (the old panel.html /
  # login.html stay the owner's old admin; the Control Center's import tool calls /api/index.php on the same origin); the new
  # Admin Control Center is /admin/ and the new sign-in /login/ (checked in the Control Center section below).
  if [ "$LEGACY_LIVE" = auto ]; then case "$HOST" in madeinegyptgate.com|www.madeinegyptgate.com) LEGACY_LIVE=1 ;; *) LEGACY_LIVE=0 ;; esac; fi
  if [ "$LEGACY_LIVE" = 1 ] && [ -f "$HERE/legacy-live.txt" ]; then
    section "old system (deploy/legacy-live.txt, Worker mis-egypt → Hostinger PHP)"
    while IFS= read -r lp; do
      lp="${lp%%#*}"; lp="$(printf '%s' "$lp" | tr -d '[:space:]')"
      case "$lp" in /*) ;; *) continue ;; esac
      u="${lp%\*}"; mark="" ; kind=page
      case "$u" in
        /panel.html) mark='api/index.php' ;;
        /login.html) mark='api/index.php?a=login' ;;
        /api/index.php) u="/api/index.php?a=me"; kind=api ;;
        /data/auth.js) mark='api/index.php' ;;
        /data/me.js) mark='api/index.php?a=me' ;;
        /data/egadm.js) mark='EGADM' ;;
      esac
      fetch "$BASE$u"
      # the zone protects the owner's admin pages with a Cloudflare challenge (WAF / bot rule): a script cannot pass it,
      # and it answers before any Worker or Pages — so it says nothing about who serves the page behind it
      if [ "$(hdr cf-mitigated)" = challenge ]; then
        warn "$u → $CODE Cloudflare challenge (zone WAF / bot rule in front of the owner's admin — fine): open https://$HOST$u in a browser and check the old page appears"
        continue
      fi
      if [ "$kind" = api ]; then
        # JSON from PHP (a BOM or blank lines before the "{" are tolerated)
        if [ "$CODE" != 000 ] && [ "$CODE" != 404 ] && [ "$(head -c 64 "$TMP/body" | LC_ALL=C tr -d '\r\n\t \357\273\277' | head -c 1)" = "{" ] && [ -z "$(hdr X-SEO-Edge)" ]; then
          pass "$u → $CODE JSON from the old PHP API (owner's live admin works)"
        else fail "$u → $CODE ${CTYPE}: the PHP API of the owner's live admin is not answering — deploy.sh routes / cutover-rollback (README-DEPLOY.md section 6)"; fi
        continue
      fi
      if [ "$CODE" = 200 ] && [ -z "$(hdr X-SEO-Edge)" ] && { [ -z "$mark" ] || grep -qF "$mark" "$TMP/body"; }; then
        pass "$u → 200 from the owner's live system"
      elif [ "$CODE" = 200 ] && [ -n "$(hdr X-SEO-Edge)" ]; then
        fail "$u → 200 but served by the NEW site (X-SEO-Edge): the mis-egypt route for $lp is missing — deploy.sh cutover adds it"
      else
        fail "$u → $CODE${LOC:+ $LOC}: the owner's live admin path is not answered by the old system — deploy.sh routes; deploy.sh cutover-rollback restores everything"
      fi
    done < "$HERE/legacy-live.txt"
    if [ "$HOST" = "madeinegyptgate.com" ]; then
      fetch "https://www.madeinegyptgate.com/panel.html"
      if { [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; } && [ "$LOC" = "$CANON/panel.html" ]; then pass "https://www…/panel.html → $CODE $LOC"
      elif [ "$(hdr cf-mitigated)" = challenge ]; then info "https://www…/panel.html → Cloudflare challenge (zone rule; check in a browser)"
      else warn "https://www.madeinegyptgate.com/panel.html → $CODE ${LOC:-} (expected one 301 to $CANON/panel.html)"; fi
    fi
  fi

  section "dashboards and staff pages (noindex, not in the sitemaps)"
  # the customer dashboard (dashboard.html, routed-inquiry e-mails link to dashboard.html#lt=…&tab=incoming&ref=…), the
  # admin requests monitor (inbox.html), the SEO workspace and the buyer's tracking page; the .html form → one 301
  for pair in "/dashboard.html /dashboard/" "/inbox.html /inbox/" "/seo-admin.html /seo-admin/" "/track.html /track/" \
              "/pay.html /pay/" "/seo-team.html /seo-team/" "/data-desk.html /data-desk/" "/admin.html /admin/"; do
    src="${pair% *}" dst="${pair#* }"
    fetch "$BASE$src"
    if { [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; } && same_url "$(upath "$LOC")" "$dst"; then
      fetch "$(onbase "$LOC")"
      r=$(robots_meta)
      if [ "$CODE" = 200 ] && printf '%s' "$r" | grep -qi noindex; then pass "$src → $dst → 200, noindex"
      elif [ "$CODE" = 200 ]; then fail "$dst → 200 but robots '$r' (staff / account pages must be noindex)"
      else fail "$src → $dst → $CODE"; fi
    else fail "$src → $CODE ${LOC:-} (expected one 301 to $dst)"; fi
  done

  if [ "$CC" = 1 ]; then
    section "Admin Control Center (deploy 2: /admin/, /login/, pay, overlay — ACC-CONTRACT §11.6, FRONTEND.md URL decisions)"
    fetch "$BASE/admin/"
    if [ "$CODE" = 200 ] && grep -qF '<meta name="mig-acc" content="1">' "$TMP/body" && robots_meta | grep -qi noindex; then
      pass "/admin/ → 200 the new Control Center «لوحة التحكم» (mig-acc, $(robots_meta))"
    else fail "/admin/ → $CODE${LOC:+ $LOC}: expected the new Control Center (<meta name=\"mig-acc\" content=\"1\">, noindex) — deploy.sh production"; fi
    fetch "$BASE/login/"
    if [ "$CODE" = 200 ] && grep -qF 'auth/legacy/health' "$TMP/body" && robots_meta | grep -qi noindex; then
      pass "/login/ → 200 the sign-in page (e-mail code; «حساب قديم؟» appears when /api/auth/legacy/health says enabled)"
    else fail "/login/ → $CODE${LOC:+ $LOC}: expected the deploy-2 sign-in page (auth/legacy/health in its script, noindex)"; fi
    fetch "$BASE/pay/"
    if [ "$CODE" = 200 ] && robots_meta | grep -qi noindex; then pass "/pay/ → 200, $(robots_meta)"; else fail "/pay/ → $CODE robots '$(robots_meta)' (expected 200 + noindex)"; fi
    fetch "$BASE/data/overlay.js"
    ocache=$(hdr Cache-Control)
    if [ "$CODE" = 200 ] && printf '%s' "$CTYPE" | grep -qi javascript && grep -q 'MIGOVL_DATA' "$TMP/body" && printf '%s' "$ocache" | grep -q 'max-age=60'; then
      if [ -n "$(hdr X-Overlay-V)" ]; then pass "/data/overlay.js → 200 from the Worker (v $(hdr X-Overlay-V), $ocache)"
      elif [ "$NO_WORKER" = 1 ]; then pass "/data/overlay.js → 200 static fallback ($ocache; on $CANON the Worker serves the live file)"
      else fail "/data/overlay.js → 200 but no X-Overlay-V: the static Pages copy answers — the Worker route /data/overlay.js* is missing (deploy.sh worker)"; fi
    else fail "/data/overlay.js → $CODE $CTYPE Cache-Control '$ocache' (expected JavaScript with MIGOVL_DATA, max-age=60)"; fi
    if [ "$NO_WORKER" = 0 ]; then
      fetch "$API_BASE/api/admin/cc/whoami"
      if [ "$CODE" = 401 ] && grep -qE '"code"' "$TMP/body"; then pass "/api/admin/cc/whoami → 401 JSON without a token"
      else fail "/api/admin/cc/whoami → $CODE $(head -c 120 "$TMP/body" | tr '\n' ' ') (expected 401 JSON: Worker with acc.js deployed?)"; fi
      fetch "$API_BASE/api/plans"
      if [ "$CODE" = 200 ] && [ -n "$PY" ]; then
        pl=$("$PY" -c 'import json,sys
d=json.load(open(sys.argv[1])); ps=d.get("plans") if isinstance(d,dict) else d
ps=[p for p in (ps or []) if p.get("sellable") and (p.get("price_egp") or 0) > 0]
print(len(ps), " ".join("%s=%s" % (p.get("key"), p.get("price_egp")) for p in ps))' "$TMP/body" 2>/dev/null || echo "")
        if [ "${pl%% *}" = 5 ]; then pass "/api/plans → 200, 5 sellable plans with prices (EGP): ${pl#* }"
        elif [ -n "$pl" ]; then warn "/api/plans → 200 with ${pl%% *} sellable priced plan(s): ${pl#* } (the seed has 5 — changed in «الباقات والصلاحيات»?)"
        else fail "/api/plans → 200 but not the plans JSON"; fi
      elif [ "$CODE" = 200 ]; then pass "/api/plans → 200 (python3 missing: plans not counted)"
      else fail "/api/plans → $CODE $(head -c 120 "$TMP/body" | tr '\n' ' ')"; fi
      fetch "$API_BASE/api/settings"
      if [ "$CODE" = 200 ] && grep -q '{' "$TMP/body"; then
        if grep -qiE '"(pay|mail|anam|persona)\.|secret|api_?key|smtp|password|hmac|server_key' "$TMP/body"; then fail "/api/settings → 200 but it carries private keys"
        else pass "/api/settings → 200 public settings only"; fi
      else fail "/api/settings → $CODE $(head -c 120 "$TMP/body" | tr '\n' ' ')"; fi
      fetch "$API_BASE/media/u/none.jpg"
      if [ "$CODE" = 404 ] && [ -z "$(hdr X-SEO-Edge)" ]; then pass "/media/u/none.jpg → 404 from the Worker"
      elif [ "$CODE" = 404 ]; then fail "/media/u/none.jpg → 404 from Pages (X-SEO-Edge): the Worker route /media/u/* is missing"
      else fail "/media/u/none.jpg → $CODE (expected 404)"; fi
      code=$(curl -sS -o /dev/null --max-time "$TIMEOUT" -A "migate-smoke-bot/2.0 (deploy check)" -X POST -H "Content-Type: application/json" \
             -H "Origin: $CANON" --data '{"p":"/"}' -w '%{http_code}' "$API_BASE/api/ev/pv" 2>/dev/null || printf '000')
      if [ "$code" = 204 ]; then pass "POST /api/ev/pv → 204 (bot User-Agent: nothing recorded)"
      else fail "POST /api/ev/pv → $code (expected 204 from the Worker route /api/ev/*)"; fi
    fi
  fi

  section "this build? (/_seo/pages.json)"
  live_built=$(curl -sS --compressed --max-time "$TIMEOUT" -A "$UA" "$BASE/_seo/pages.json" 2>/dev/null | head -c 400 | grep -oE '"built": ?"[^"]+"' | grep -oE '[0-9]{4}-[0-9-]+T[0-9:]+Z' | head -n 1)
  if [ -z "$live_built" ]; then fail "/_seo/pages.json has no build time (not the new SEO build?)"
  else
    if [ -n "$STAGE" ]; then
      stage_built=$(head -c 400 "$STAGE/site/_seo/pages.json" | grep -oE '"built": ?"[^"]+"' | grep -oE '[0-9]{4}-[0-9-]+T[0-9:]+Z' | head -n 1)
      if [ "$live_built" = "$stage_built" ]; then pass "the deployment serves this build ($live_built)"
      else fail "the deployment serves the build of $live_built, the stage is $stage_built (old deployment? cache?)"; fi
    fi
    if [ -n "$PY" ]; then
      age_h=$("$PY" -c 'import sys,time,calendar;print(int((time.time()-calendar.timegm(time.strptime(sys.argv[1],"%Y-%m-%dT%H:%M:%SZ")))/3600))' "$live_built" 2>/dev/null || echo "")
      if [ -n "$age_h" ]; then
        if [ -n "$MAX_AGE" ] && [ "$age_h" -gt "$MAX_AGE" ]; then fail "the live build is ${age_h} h old (> $MAX_AGE h): the daily rebuild + deploy is not running (README-DEPLOY.md section 7)"
        elif [ "$age_h" -gt 26 ]; then warn "the live build is ${age_h} h old: tender / offer statuses and the tenders-hub date are from the build day — is the daily rebuild running? (README-DEPLOY.md section 7)"
        else pass "live build is ${age_h} h old"; fi
      fi
    fi
  fi

  section "home"
  fetch "$BASE/"
  if [ "$CODE" = 200 ] && printf '%s' "$CTYPE" | grep -qi 'text/html'; then
    cp "$TMP/body" "$TMP/home.html"
    n=$(head_titles)
    c=$(canonical)
    if [ "$n" != 1 ]; then fail "/ → 200 but $n <title> tags in <head> (expected 1)"
    elif [ "$c" != "$CANON/" ]; then fail "/ → 200 but canonical '$c' (expected $CANON/)"
    elif ! grep -q '<html lang="ar"' "$TMP/body"; then fail "/ → 200 but no <html lang=\"ar\">"
    else pass "/ → 200, 1 <title>, canonical $c, lang=ar (${TIME}s)"; fi
    if [ -n "$(hdr X-SEO-Edge)" ]; then pass "edge SEO layer answers: X-SEO-Edge: $(hdr X-SEO-Edge)"
    else fail "no X-SEO-Edge header on / — the Pages Functions middleware is not running (redirects, 410s and SEO overrides need it)"; fi
    xr=$(hdr X-Robots-Tag)
    if printf '%s' "$xr" | grep -qi noindex; then
      case "$HOST" in *.pages.dev|localhost|127.*) info "X-Robots-Tag: $xr on $HOST (expected on preview URLs)" ;;
        *) fail "/ carries X-Robots-Tag: $xr on the public host" ;; esac
    fi
    if has_claim "$TMP/body"; then fail "/ shows the removed 26k / 26,808 claim"; else pass "/ has no 26k / 26,808 claim"; fi
  else
    fail "/ → $CODE $CTYPE $(cerr)"
  fi

  section "hubs and static pages"
  for p in /factories/ /tenders/ /rfq/ /products/ /industrial-zones/ /free-zones/ /governorates/ /news/ /events/ \
           /awards/ /projects/ /offers/ /export/ /site-map/ /about/ /contact/ /register/ /legal/ /rfq/new/ /en/ /en/factories/; do
    fetch "$BASE$p"
    if [ "$CODE" = 200 ] && printf '%s' "$CTYPE" | grep -qi 'text/html'; then
      n=$(head_titles)
      c=$(canonical)
      if [ "$n" != 1 ]; then fail "$p → 200 but $n <title> tags in <head>"
      elif [ -z "$c" ]; then fail "$p → 200 but no canonical"
      elif has_claim "$TMP/body"; then fail "$p shows the removed 26k / 26,808 claim"
      else pass "$p → 200 (${TIME}s)"; fi
    else fail "$p → $CODE${LOC:+ $LOC} $(cerr)"; fi
  done

  section "assets the pages load"
  fetch "$BASE/data/i18n.js" -I
  if [ "$CODE" = 200 ] && hdr Cache-Control | grep -q max-age; then pass "/data/i18n.js → 200, Cache-Control: $(hdr Cache-Control)"
  else fail "/data/i18n.js → $CODE (every page loads /data/*.js: broken data/ symlink in the build?)"; fi
  if [ -n "$PY" ] && [ -f "$TMP/home.html" ]; then
    : > "$TMP/assets.txt"
    "$PY" "$STAGE_PY" refs --path / --limit 25 "$TMP/home.html" >> "$TMP/assets.txt" 2>/dev/null
    for p in /factories/ /tenders/; do
      fetch "$BASE$p"; [ "$CODE" = 200 ] && "$PY" "$STAGE_PY" refs --path "$p" --limit 15 "$TMP/body" >> "$TMP/assets.txt" 2>/dev/null
    done
    sort -u "$TMP/assets.txt" > "$TMP/assets.u"
    na=0 bad=""
    while IFS= read -r a; do
      [ -n "$a" ] || continue
      na=$((na + 1)); s=$(status "$BASE$a")
      [ "$s" = 200 ] || bad="$bad $a→$s"
    done < "$TMP/assets.u"
    if [ -z "$bad" ]; then pass "$na scripts / styles / images of /, /factories/, /tenders/ → 200"
    else fail "assets that do not load:$bad"; fi
  else info "python3 not found: per-page asset check skipped"; fi

  section "robots.txt"
  fetch "$BASE/robots.txt"
  if [ "$CODE" = 200 ]; then
    cp "$TMP/body" "$TMP/robots.txt"
    if grep -qiE "^Sitemap: *$CANON/sitemap\.xml *$" "$TMP/robots.txt"; then pass "robots.txt: Sitemap line"; else fail "robots.txt has no 'Sitemap: $CANON/sitemap.xml'"; fi
    if grep -qiE '^Disallow: */api/ *$' "$TMP/robots.txt"; then pass "robots.txt: Disallow /api/"; else warn "robots.txt does not disallow /api/"; fi
    if grep -iE '^(Allow|Disallow):' "$TMP/robots.txt" | grep -q '#'; then fail "robots.txt rule with '#' (e.g. the old Disallow: /register.html#form)"; fi
    blk=$(awk 'tolower($0) ~ /^user-agent:/ { if (r) { ag = ""; r = 0 } sub(/^[^:]*: */, ""); ag = ag " " $0; next }
               tolower($0) ~ /^(dis)?allow:/ { r = 1 }
               tolower($0) ~ /^disallow: *\/?\*?\*?\$? *$/ && tolower($0) !~ /^disallow: *$/ { print ag }' "$TMP/robots.txt" | tr '\n' ' ')
    sblk=$(printf '%s' "$blk" | tr ' ' '\n' | grep -iE '^(\*|googlebot.*|bingbot|msnbot.*|yandex.*|duckduckbot|applebot|baiduspider.*)$' | tr '\n' ' ')
    oblk=$(printf '%s' "$blk" | tr ' ' '\n' | grep -v '^$' | grep -viE '^(\*|googlebot.*|bingbot|msnbot.*|yandex.*|duckduckbot|applebot|baiduspider.*)$' | tr '\n' ' ')
    [ -z "$(printf '%s' "$sblk" | tr -d ' ')" ] || fail "robots.txt shuts search engines out of the whole site: $sblk"
    [ -z "$(printf '%s' "$oblk" | tr -d ' ')" ] || warn "robots.txt shuts these crawlers out of the whole site (fine if intended): $oblk"
    if [ -n "$STAGE" ] && [ -f "$STAGE/site/robots.txt" ]; then
      n=$(wc -c < "$STAGE/site/robots.txt" | tr -d ' ')
      if cmp -s -n "$n" "$STAGE/site/robots.txt" "$TMP/robots.txt"; then pass "robots.txt = the build's robots.txt (+ $(( $(wc -c < "$TMP/robots.txt") - n )) bytes of admin extras)"
      else warn "live robots.txt does not start with the build's robots.txt (Cloudflare 'managed robots.txt' / AI-bot setting rewriting it? SEO-SPEC §4 item 3)"; fi
    fi
  else
    fail "robots.txt → $CODE $(cerr)"
  fi

  section "sitemaps"
  : > "$TMP/urls.txt"
  fetch "$BASE/sitemap.xml"
  if [ "$CODE" = 200 ] && grep -q '<sitemapindex' "$TMP/body"; then
    printf '%s' "$CTYPE" | grep -qiE 'xml' || warn "sitemap.xml content-type is '$CTYPE'"
    grep -oE '<loc>[^<]*</loc>' "$TMP/body" | sed -e 's#<loc>##' -e 's#</loc>##' > "$TMP/children.txt"
    nchild=$(wc -l < "$TMP/children.txt" | tr -d ' ')
    bad=0
    while IFS= read -r child; do
      [ -n "$child" ] || continue
      fetch "$(onbase "$child")"
      if [ "$CODE" != 200 ] || ! grep -q '<urlset' "$TMP/body"; then fail "child sitemap $child → $CODE"; bad=1; continue; fi
      grep -oE '<loc>[^<]*</loc>' "$TMP/body" | sed -e 's#<loc>##' -e 's#</loc>##' >> "$TMP/urls.txt"
      n=$(grep -o '<url>' "$TMP/body" | wc -l | tr -d ' ')
      [ "$n" -le 10000 ] || { fail "$child has $n URLs (> 10,000)"; bad=1; }
      if grep -qE '<lastmod>[0-9]{4}-[0-9]{2}</lastmod>' "$TMP/body"; then fail "$child has partial <lastmod> dates (YYYY-MM)"; bad=1; fi
      k=$(contacts_in "$TMP/body")
      [ -z "$k" ] || { fail "$child contains contact data: $(printf '%s' "$k" | tr '\n' ' ')"; bad=1; }
    done < "$TMP/children.txt"
    total=$(wc -l < "$TMP/urls.txt" | tr -d ' ')
    uniq=$(sort -u "$TMP/urls.txt" | wc -l | tr -d ' ')
    [ "$bad" = 1 ] || pass "sitemap.xml: $nchild child sitemaps, $total URLs"
    [ "$total" = "$uniq" ] || fail "sitemaps list $((total - uniq)) duplicate URLs"
    if grep -vE "^$CANON/" "$TMP/urls.txt" | head -n 1 | grep -q .; then fail "sitemap URLs outside $CANON/: $(grep -vE "^$CANON/" "$TMP/urls.txt" | head -n 2 | tr '\n' ' ')"; fi
    if grep -qE '[#?]' "$TMP/urls.txt"; then fail "sitemap URLs with # or ?"; fi
    if [ -n "$STAGE" ] && [ -d "$STAGE/site/sitemaps" ]; then
      exp=$(cat "$STAGE/site/sitemaps/"*.xml 2>/dev/null | grep -o '<loc>' | wc -l | tr -d ' ')
      if [ "$exp" = "$total" ]; then pass "sitemap URL count matches the build ($exp)"; else fail "live sitemaps list $total URLs, the build has $exp (old deployment still served? cache?)"; fi
    fi
  else
    fail "sitemap.xml → $CODE (expected a <sitemapindex>) $(cerr)"
  fi

  section "random sitemap pages (sample $SAMPLE, seed $SEED)"
  if [ -s "$TMP/urls.txt" ]; then
    awk -v s="$SEED" 'BEGIN{srand(s)} {printf "%.8f\t%s\n", rand(), $0}' "$TMP/urls.txt" | sort -n | cut -f2- | head -n "$SAMPLE" > "$TMP/sample.txt"
    ok=0 slow=0 maxt=0
    while IFS= read -r u; do
      fetch "$(onbase "$u")"
      p=$(upath "$u")
      if [ "$CODE" != 200 ]; then fail "$p → $CODE (sitemap URLs must answer 200)"; continue; fi
      c=$(canonical); r=$(robots_meta)
      if ! same_url "$c" "$u"; then fail "$p: canonical '$c' is not the sitemap URL"; continue; fi
      if printf '%s' "$r" | grep -qi noindex; then fail "$p: in the sitemap but robots='$r'"; continue; fi
      if has_claim "$TMP/body"; then fail "$p shows the removed 26k / 26,808 claim"; continue; fi
      k=$(contacts_in "$TMP/body" html); [ -z "$k" ] || { fail "$p shows contact data: $(printf '%s' "$k" | tr '\n' ' ')"; continue; }
      ok=$((ok + 1))
      if awk -v t="$TIME" 'BEGIN{exit !(t > 3)}'; then slow=$((slow + 1)); fi
      maxt=$(awk -v a="$maxt" -v b="$TIME" 'BEGIN{print (b > a ? b : a)}')
    done < "$TMP/sample.txt"
    n=$(wc -l < "$TMP/sample.txt" | tr -d ' ')
    [ "$ok" = "$n" ] && pass "$ok/$n sampled pages: 200, self-canonical, indexable, honest, no contact data (slowest ${maxt}s)"
    [ "$slow" = 0 ] || warn "$slow sampled page(s) took more than 3 s"
  else
    warn "no sitemap URLs to sample"
  fi

  section "Arabic URL (SEO-SPEC A10)"
  au=""
  if [ -n "$STAGE" ] && [ -d "$STAGE/site/sitemaps" ]; then
    au=$(cat "$STAGE/site/sitemaps/"factories*.xml 2>/dev/null | grep -oE '<loc>[^<]*%D[89][^<]*</loc>' | head -n 1 | sed -e 's#<loc>##' -e 's#</loc>##')
  fi
  [ -n "$au" ] || au=$(grep -E "^$CANON/factories/[^/]*%D[89]" "$TMP/urls.txt" | head -n 1)
  if [ -n "$au" ]; then
    fetch "$(onbase "$au")"; c1=$CODE; h1a=$(h1)
    lo=$(lowerhex "$au")
    if [ "$c1" = 200 ] && [ -n "$h1a" ]; then pass "$(upath "$au") → 200 (upper-case escapes), h1 present"; else fail "$(upath "$au") → $c1"; fi
    if [ -n "$lo" ]; then
      fetch "$(onbase "$lo")"
      if [ "$CODE" = 200 ] && [ "$(h1)" = "$h1a" ]; then pass "same page with lower-case escapes → 200, same h1"
      elif [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; then warn "lower-case escapes → $CODE $LOC (works, one extra hop)"
      else fail "lower-case escapes → $CODE (SEO-SPEC A10: ship slug_mode \"hash\" if Arabic paths fail)"; fi
    else info "perl not found: lower-case variant skipped"; fi
  else
    warn "no Arabic company URL found to test"
  fi

  if [ "$NO_LEGACY" = 0 ]; then
    section "legacy URLs (SEO-SPEC A7)"
    # one 301 to the expected path, which answers 200. A relative 301 Location comes from the _redirects file, which
    # production does not apply to requests the Functions serve (the edge middleware always answers with an absolute URL)
    redirect() { # path expected-target-path
      fetch "$BASE$1"
      local to raw
      to=$(upath "$LOC"); raw="$RAWLOC"
      if [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; then
        if ! same_url "$to" "$2"; then fail "$1 → $CODE $to (expected $2)"; return; fi
        case "$raw" in /*) [ "$CODE" = 301 ] && warn "$1 → 301 with a relative Location: answered by the _redirects file, not by the edge middleware (production skips _redirects for requests the Functions serve; is the rule in /_seo/redirects.json?)" ;; esac
        fetch "$(onbase "$LOC")"
        if [ "$CODE" = 200 ]; then pass "$1 → 301 $2 → 200"
        else fail "$1 → $2 → $CODE (redirect target must answer 200 in one hop)"; fi
      else fail "$1 → $CODE (expected 301 → $2)"; fi
    }
    gone() { fetch "$BASE$1"; if [ "$CODE" = 410 ]; then pass "$1 → 410"; else fail "$1 → $CODE (expected 410)"; fi; }
    REDMAP=$(mapfile_get redirects.json || true)
    # expected target of a path in the build's exact map ("" when absent)
    map_target() { [ -n "$REDMAP" ] && [ -n "$PY" ] && "$PY" -c 'import json,sys,unicodedata as u;from urllib.parse import unquote as q
n=lambda s:u.normalize("NFC",q(s));m={n(k):v for k,v in (json.load(open(sys.argv[1])).get("exact") or {}).items()}
print(m.get(n(sys.argv[2]),""))' "$REDMAP" "$1"; }
    shim_exists() { # /name.html → is there a hash map /_seo/hash/name.json?
      local n="${1#/}"; n="${n%.html}"
      if [ -n "$STAGE" ]; then [ -f "$STAGE/site/_seo/hash/$n.json" ]; else [ "$(status "$BASE/_seo/hash/$n.json")" = 200 ]; fi
    }
    if [ -f "$HERE/legacy-urls.txt" ]; then
      nl=0 lbad=0
      while IFS= read -r lp; do
        case "$lp" in ''|'#'*) continue ;; esac
        nl=$((nl + 1))
        t=$(map_target "$lp")
        if [ -n "$t" ]; then
          fetch "$BASE$lp"
          if [ "$CODE" = 301 ] && same_url "$(upath "$LOC")" "$t" && [ "$(status "$(onbase "$LOC")")" = 200 ]; then
            case "$RAWLOC" in /*) warn "$lp → 301 with a relative Location (the _redirects file, not the edge)" ;; esac
          else fail "$lp → $CODE ${LOC:-} (expected one 301 → $t → 200)"; lbad=$((lbad + 1)); fi
        elif shim_exists "$lp"; then
          fetch "$BASE$lp" -L --max-redirs 1
          if [ "$CODE" = 200 ] && robots_meta | grep -qi noindex; then :; else fail "$lp (hash shim) → $CODE (expected 200 + noindex)"; lbad=$((lbad + 1)); fi
        elif [ -z "$REDMAP" ] || [ -z "$PY" ]; then
          fetch "$BASE$lp"
          if { [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; } && [ "$(status "$(onbase "$LOC")")" = 200 ]; then :
          else fail "$lp → $CODE (expected one redirect to a 200 page)"; lbad=$((lbad + 1)); fi
        else fail "$lp: a URL of the old site that the new build neither redirects nor serves (not in /_seo/redirects.json)"; lbad=$((lbad + 1)); fi
      done < "$HERE/legacy-urls.txt"
      [ "$lbad" = 0 ] && pass "$nl legacy URLs of the old site (deploy/legacy-urls.txt): one 301 to their new page, or the noindex hash shim"
    else warn "deploy/legacy-urls.txt not found: the old site's URLs were not checked"; fi
    redirect /about.html /about/
    redirect /factory.html /factories/
    redirect /tenders.html /tenders/
    redirect "/?p=196" /
    redirect /manufacturers /factories/
    redirect /tenders/page/132/ /tenders/
    redirect "/?lang=en" /en/
    redirect /home /
    # the language choice is never lost: the English kiosk (janna.html) has no /en/ twin and switches from ?lang=en itself
    fetch "$BASE/janna.html?lang=en"
    if { [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; } && printf '%s' "$LOC" | grep -q 'lang=en'; then pass "/janna.html?lang=en → $CODE $(upath "$LOC") (language kept)"
    elif [ "$CODE" = 200 ]; then pass "/janna.html?lang=en → 200 (served with the parameter)"
    else fail "/janna.html?lang=en → $CODE ${LOC:-}: the language is lost (the kiosk would open in Arabic)"; fi
    if [ -n "$STAGE" ] && [ ! -f "$STAGE/site/en/factories/index.html" ]; then info "/en/factories/ not in this build: ?lang=en on a legacy URL skipped"
    else redirect "/factories.html?lang=en" /en/factories/; fi
    # an English page the build does not have (Arabic-only company) → one 301 to the Arabic page, not a 404
    MANF=$(mapfile_get pages.json || true)
    if [ -n "$MANF" ] && [ -n "$PY" ]; then
      enprobe=$("$PY" -c 'import json,sys
from urllib.parse import quote
for r in json.load(open(sys.argv[1])).get("rows", []):
    if r.get("l") == "ar" and r.get("t") == "company" and not r.get("a") and "noindex" not in (r.get("r") or ""):
        print(quote(r["p"], safe="/-._~%")); break' "$MANF" 2>/dev/null)
      if [ -n "$enprobe" ]; then
        fetch "$BASE/en$enprobe"
        lp=$(upath "$LOC"); lq=""; case "$lp" in *\?*) lq="${lp#*\?}"; lp="${lp%%\?*}" ;; esac
        if [ "$CODE" = 301 ] && same_url "$lp" "$enprobe" && printf '&%s&' "$lq" | grep -q '&lang=en&'; then pass "/en$enprobe (no English page) → 301 to the Arabic page with ?lang=en (English kept, one hop)"
        else warn "/en$enprobe (Arabic-only company, never linked) → $CODE ${LOC:-}: the edge should answer ONE 301 to the Arabic page with ?lang=en (edge-INTEGRATION round 2 item 10)"; fi
      fi
    fi
    if [ -n "$REDMAP" ] && [ -n "$PY" ]; then
      # random exact rules of the map, plus the WordPress news posts at the root (/<arabic-slug>/ → /news/…)
      "$PY" - "$REDMAP" "$NRED" "$SEED" > "$TMP/redsample.txt" <<'PY'
import json, random, sys
from urllib.parse import quote
m = json.load(open(sys.argv[1])).get("exact") or {}
keys = sorted(k for k in m if not k.endswith(".html"))
random.seed(sys.argv[3])
news = [k for k in keys if k.count("/") == 2 and not k.isascii()]
pick = random.sample(keys, min(int(sys.argv[2]), len(keys))) + random.sample(news, min(3, len(news)))
for k in dict.fromkeys(pick):
    if isinstance(m[k], str) and m[k].startswith("/"):
        print("%s\t%s" % (quote(k, safe="/%:@!$&'()*+,;=-._~"), quote(m[k], safe="/%:@!$&'()*+,;=-._~#?")))
PY
      nr=0 rbad=0
      while IFS=$'\t' read -r src dst; do
        [ -n "$src" ] || continue
        nr=$((nr + 1))
        fetch "$BASE$src"
        if [ "$CODE" = 301 ] && same_url "$(upath "$LOC")" "${dst%%#*}" && [ "$(status "$(onbase "$LOC")")" = 200 ]; then :
        elif [ "$CODE" = 410 ] && [ "$dst" = "410" ]; then :
        else fail "redirect map: $src → $CODE ${LOC:-} (expected one 301 → $dst → 200)"; rbad=$((rbad + 1)); fi
      done < "$TMP/redsample.txt"
      [ "$rbad" = 0 ] && [ "$nr" -gt 0 ] && pass "$nr sampled rules of /_seo/redirects.json (incl. old news posts): one 301 → 200"
    else info "python3 or the redirect map missing: map sample skipped"; fi
    gone /ar/wp-json/wp/v2/products/1
    gone /xmlrpc.php
    gone /factories/smoke-test-no-such-slug/
    fetch "$BASE/smoke-test-no-such-page-$$/"
    if [ "$CODE" = 404 ]; then pass "unknown URL → 404"
    elif [ "$CODE" = 200 ]; then fail "unknown URL → 200: soft 404 (Pages single-page-app mode: 404.html missing?)"
    else warn "unknown URL → $CODE"; fi
    fetch "$BASE/company.html"
    if [ "$CODE" = 308 ] || [ "$CODE" = 301 ]; then fetch "$(onbase "$LOC")"; fi
    if [ "$CODE" = 200 ] && robots_meta | grep -qi noindex; then pass "hash shim company.html → 200, noindex"
    else fail "hash shim company.html → $CODE"; fi
    # open redirect probes (security review #1): a Location must never leave our hosts
    for probe in "/%2Fevil.example?lang=en" "/%5Cevil.example?lang=en" "//evil.example/e%CC%81"; do
      fetch "$BASE$probe"
      case "$CODE" in 30[1278])
        lh=$(uhost "$LOC")
        if [ "$lh" = "$HOST" ] || [ "$lh" = "madeinegyptgate.com" ] || [ "$lh" = "www.madeinegyptgate.com" ]; then pass "$probe → $CODE stays on $lh"
        else fail "$probe → $CODE $LOC: open redirect to another host"; fi ;;
        *) pass "$probe → $CODE (no redirect)" ;;
      esac
    done
  fi

  section "headers"
  fetch "$BASE/_seo/pages.json" -I
  if [ "$CODE" = 200 ] && hdr X-Robots-Tag | grep -qi noindex; then pass "/_seo/* → X-Robots-Tag: noindex"; else warn "/_seo/pages.json → $CODE, X-Robots-Tag '$(hdr X-Robots-Tag)'"; fi
  # SEC M5: anti-framing + nosniff + referrer policy on pages (the middleware) and on static files (_headers).
  # frame-ancestors must allow 'self' (Janna's live screen frames the site); 'none' / DENY would break it
  for p in / /dashboard/ /inbox/ /seo-admin/ /factories/ /no-such-page-smoke/ /data/i18n.js; do
    fetch "$BASE$p"
    csp=$(hdr Content-Security-Policy); xfo=$(hdr X-Frame-Options); nos=$(hdr X-Content-Type-Options); rp=$(hdr Referrer-Policy)
    case "$p" in
      /data/*) if printf '%s' "$nos" | grep -qi nosniff; then pass "$p: X-Content-Type-Options nosniff"; else fail "$p: no X-Content-Type-Options nosniff (_headers /* rule)"; fi ;;
      *) if printf '%s' "$csp" | grep -q "frame-ancestors 'self'" && printf '%s' "$nos" | grep -qi nosniff && [ -n "$rp" ]; then
           if printf '%s' "$xfo" | grep -qi deny; then fail "$p: X-Frame-Options DENY would block Janna's same-origin live screen"
           else pass "$p ($CODE): CSP frame-ancestors 'self', nosniff, Referrer-Policy $rp${xfo:+, X-Frame-Options $xfo}"; fi
         else fail "$p ($CODE): security headers missing (CSP '$csp', nosniff '$nos', Referrer-Policy '$rp') — functions/_middleware.js SEC M5"; fi ;;
    esac
  done

  if [ "$HOST" = "madeinegyptgate.com" ]; then
    section "host canonicalisation"
    fetch "https://www.madeinegyptgate.com/about/"
    if { [ "$CODE" = 301 ] || [ "$CODE" = 308 ]; } && [ "$LOC" = "$CANON/about/" ]; then pass "https://www → $CODE $LOC"
    else fail "https://www.madeinegyptgate.com/about/ → $CODE $LOC (expected one 301 to $CANON/about/: Redirect Rule, README-DEPLOY.md section 6, step 3)"; fi
    for u in http://madeinegyptgate.com/ http://www.madeinegyptgate.com/; do
      fetch "$u"
      if [ "$CODE" = 000 ]; then warn "$u: not reachable from here ($(cerr)) — check it in a browser"
      elif [ "$LOC" = "$CANON/" ]; then pass "$u → $CODE $LOC (one hop)"
      elif [ -n "$LOC" ]; then warn "$u → $CODE $LOC (more than one hop to $CANON/)"
      else fail "$u → $CODE (no redirect to https)"; fi
    done
  fi
fi

# ---------------------------------------------------------------------------------------------------------------- APIs
section "API health"
if [ "$SEO_API" = 1 ]; then
  # without the platform key, an invalid bearer token tells "secret configured" (401) from "no secret" (503 auth_off)
  if [ -n "$PKEY" ] && [ "$ENVX" != preview ]; then fetch "$BASE/api/seo/health" -H "X-Platform-Key: $PKEY"
  else fetch "$BASE/api/seo/health" -H "Authorization: Bearer smoke-test.invalid.token"; fi
  body=$(head -c 300 "$TMP/body" | tr '\n' ' ')
  code=$(grep -oE '"code": ?"[a-z_]+"' "$TMP/body" | head -n 1 | grep -oE '[a-z_]+"$' | tr -d '"')
  envx="$ENVX"
  if [ "$envx" = auto ]; then
    if is_preview_host && [ "$CODE" = 503 ]; then envx=preview; else envx=production; fi
  fi
  if [ "$envx" = preview ]; then
    case "$CODE" in
      503) case "$code" in kv_off|auth_off|auth_backend_off) pass "/api/seo/health → 503 $code: the preview has no production KV / D1 / secrets (deploy/wrangler-pages.toml [env.preview])" ;;
             *) fail "/api/seo/health → 503 $body" ;; esac ;;
      401|200|403) warn "/api/seo/health → $CODE on a preview: its SEO KV, D1 and secrets must be preview-only values (deploy/wrangler-pages.toml [env.preview], deploy.sh secrets --env preview)" ;;
      404) fail "/api/seo/health → 404: Functions not deployed, or _routes.json excludes /api/*" ;;
      *) fail "/api/seo/health → $CODE $body $(cerr)" ;;
    esac
  else
    case "$CODE" in
      200) if grep -qE '"ok": ?true' "$TMP/body"; then pass "/api/seo/health → 200 ok"; else warn "/api/seo/health → 200 $body"; fi
           [ -n "$PKEY" ] || fail "/api/seo/health answered 200 to an invalid token" ;;
      401) if [ -n "$PKEY" ]; then fail "/api/seo/health → 401 with X-Platform-Key: the key differs from SEO_PLATFORM_KEY on Pages"
           else pass "/api/seo/health → 401 for an invalid token (Function, SEO_KV and ADVISOR_SECRET are live)"; fi ;;
      503) fail "/api/seo/health → 503 $body (kv_off = SEO_KV binding missing; auth_off = ADVISOR_SECRET not set on Pages production or set after the last deployment; auth_backend_off = no D1 binding)" ;;
      404) fail "/api/seo/health → 404: Functions not deployed, or _routes.json excludes /api/*" ;;
      *) fail "/api/seo/health → $CODE $body $(cerr)" ;;
    esac
  fi
fi
if [ "$NO_WORKER" = 0 ]; then
  # families without a /health endpoint: an anonymous GET must get the Worker's own JSON error (401 / 405), not Pages
  for ep in "/api/me 401" "/api/admin/inquiries 401" "/api/ev 405" "/api/pay/invoice?t=bad 404"; do
    u="${ep% *}" want="${ep#* }"
    fetch "$API_BASE$u"
    if [ "$CODE" = "$want" ] && grep -qE '"(error|code)"' "$TMP/body"; then pass "$u → $CODE from the Worker (route OK)"
    elif [ "$CODE" = 404 ] || [ "$CODE" = 405 ] || [ "$CODE" = 200 ]; then fail "$u → $CODE $(head -c 120 "$TMP/body" | tr '\n' ' '): the Worker route for $u is missing (Pages answered)"
    else warn "$u → $CODE $(head -c 160 "$TMP/body" | tr '\n' ' ')"; fi
  done
  for svc in janna advisor meetings auth inquiries wa pay; do
    fetch "$API_BASE/api/$svc/health"
    body=$(head -c 220 "$TMP/body" | tr '\n' ' ')
    if [ "$CODE" = 200 ] && grep -qE '"ok": ?true' "$TMP/body"; then pass "/api/$svc/health → ok"
    elif [ "$CODE" = 200 ]; then
      if [ "$svc" = wa ]; then warn "/api/wa/health → $body (WhatsApp optional: RESPONDIO_TOKEN + WA_WEBHOOK_SECRET)"
      else warn "/api/$svc/health → not ready: $body (secrets / D1 — README-DEPLOY.md)"; fi
    elif [ "$CODE" = 404 ]; then fail "/api/$svc/health → 404: the Worker route for /api/$svc does not reach the Worker"
    else fail "/api/$svc/health → $CODE $body $(cerr)"; fi
  done
fi

# --------------------------------------------------------------------------------------------------------------- summary
printf '\n== %s: %d passed, %d warnings, %d failed\n' "$BASE" "$P" "$W" "$F"
[ "$OLD_SITE" = 0 ] || printf '   The old site is still answering on this host: remove the mis-egypt Worker routes (README-DEPLOY.md).\n'
if [ "$F" -gt 0 ] || { [ "$STRICT" = 1 ] && [ "$W" -gt 0 ]; }; then exit 1; fi
exit 0
