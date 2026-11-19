#!/usr/bin/env bash
# deploy/deploy.sh — deploy madeinegyptgate.com to Cloudflare: Pages (static site + Functions) and the Worker (/api/*).
# DNS is changed only by `dns` / `dns-rollback` (two records: the apex and www). Every step is safe to re-run.
# Arabic runbook: deploy/README-DEPLOY.md
#
# Usage: deploy/deploy.sh <command> [options]
#
# Commands
#   doctor        read-only: tools (Python, Pillow, Node, wrangler), Cloudflare login, what already exists (Pages project,
#                 KV, D1, R2, Worker routes, zone access, age of the live production build), worker/wrangler.toml
#   build         build the site into an EMPTY directory (default build/site-fresh): first the published Control Center
#                 edits are pulled (read-only GET of MIG_OVERLAY_URL → build/overlay.js, baked in by tools/dump-data.mjs;
#                 a failed pull keeps the previous file and never stops the build), then python3 site.py with MIG_OUT,
#                 then refuse the build when the generator's own validation (build/seo-stats.json) found problems
#   stage         build (unless --no-build / --site-dir), copy the build into the staging dir (symlinks resolved, junk
#                 dropped) + functions/ + the Pages config, run every pre-deploy check (deploy/stage.py), the edge
#                 unit tests (functions: npm test — includes the auth parity test against worker/src/auth.js) and
#                 wrangler's own validation
#   check         re-run the checks on the existing staging dir
#   localtest     stage, then serve a production-like copy with `wrangler pages dev` (local KV / D1, no _redirects
#                 rules for Function routes — production does not apply them either) and run the smoke test on it
#   project       create the Pages project if it is missing (production branch "main")
#   secrets       names only: which secrets exist on Pages (production; preview should have none) and on the Worker
#                 secrets --set NAME [--target pages|worker|all] [--env production|preview]   asks (hidden), stores it
#   preview       stage + checks + deploy to the preview branch + smoke test (preview: no production KV/D1/secrets)
#   production    stage + checks + deploy to production (branch main) + smoke test (asks first unless --yes)
#   release       preview, then production from the same stage; stops at the first failure
#   db            Worker D1 (migate-db): worker/schema.sql + migrations 0004, 0005 and 0006 (deploy/d1_migrate.py plans
#                 what the live tables need: missing columns, then schema.sql, then back-fills; then verifies). 0006 =
#                 the Admin Control Center (deploy 2): CREATE … IF NOT EXISTS + INSERT OR IGNORE only, safe to re-run.
#                 Export a backup first: npx wrangler d1 export migate-db --remote --output build/d1-backup-<ts>.sql
#   worker        Worker: check worker/wrangler.toml (bindings, one route per API prefix, no catch-all, none over the
#                 owner's live admin), rebuild the Janna index, db, wrangler deploy, health checks
#   domains       attach madeinegyptgate.com + www.madeinegyptgate.com to the Pages project (API) and print the
#                 cutover checklist
#   dns           the ONE DNS change of the cutover: the apex record (A 46.202.158.210) and www become proxied CNAMEs
#                 to madeinegyptgate.pages.dev. Touches only A/AAAA/CNAME records named madeinegyptgate.com or
#                 www.madeinegyptgate.com — never MX, TXT (SPF, DMARC, brevo-code), *._domainkey, mail, webmail, send,
#                 rsend. Backs every record up first (build/deploy-logs/dns-backup-*.json). Needs DNS_API_TOKEN
#   dns-rollback  put those two records back exactly as in the newest backup (or the file given)
#   www-redirect  Single Redirect rule www.madeinegyptgate.com/* → https://madeinegyptgate.com/… (301) + Always Use HTTPS
#   worker-config read-only: check worker/wrangler.toml (bindings incl. SEO_KV, one route per API family, the two
#                 deploy-2 file routes /data/overlay.js* and /media/u/*, none over deploy/legacy-live.txt, vars)
#   routes        read-only: the Workers routes of the zone and the cutover state
#   cutover       (deploy 1) the switch: add the specific routes of the Worker mis-egypt for the paths of
#                 deploy/legacy-live.txt on madeinegyptgate.com and www, THEN remove its two catch-all routes
#                 madeinegyptgate.com/* and www.madeinegyptgate.com/*. Pre-flight first; smoke test after
#   cutover-rollback   ONE command back to the old site: re-adds the two catch-all routes of mis-egypt (instant;
#                 the mis-egypt script itself is never deleted or changed)
#   (deploy 2 needs NO route change on mis-egypt: the new Admin Control Center is /admin/ and the sign-in page /login/ on
#                 Pages; /panel.html, /login.html, /api/index.php*, /data/auth.js, /data/me.js, /data/egadm.js stay on the
#                 owner's OLD system exactly as after the deploy-1 cutover — deploy/legacy-live.txt. The former
#                 "admin-release" / "admin-release-rollback" commands were dropped: they would hand those paths to Pages,
#                 which does not build them.)
#   deployments   list recent Pages production deployments
#   rollback ID   make an earlier Pages deployment live again (API)
#   smoke URL     run deploy/smoke-test.sh (all further options are passed to it)
#
# Options
#   --no-build        stage the last build (build/site-fresh) instead of building again
#   --site-dir DIR    stage this build output instead (implies --no-build; it must be a clean build: stage.py refuses
#                     leftovers of older builds)
#   --stage-dir DIR   staging dir (default: <repo>/build/pages-stage)
#   --branch NAME     preview branch name (default: preview)
#   --skip-smoke      no smoke test after a deploy
#   --skip-tests      do not run the edge unit tests (functions: npm test) — not for real deploys
#   --no-index        worker: do not rebuild worker/src/data.json (Janna's index) before deploying
#   --env E           secrets --set: production (default) or preview (a preview-only value, never a production one)
#   --port N          localtest: port for wrangler pages dev (default: a free one)
#   --force           cutover: go on although a pre-flight check failed; dns: although the apex is not 46.202.158.210
#   --yes             no confirmation prompts (CI). Without it, production / worker / db / domains / rollback / dns /
#                     cutover / cutover-rollback ask.
#
# Environment
#   CLOUDFLARE_API_TOKEN   API token (CI). Locally `npx wrangler login` works too, except for `domains`/`rollback`/
#                          `routes`/`cutover`/`cutover-rollback` (zone Workers Routes: Edit) and `dns`
#   DNS_API_TOKEN          dns / dns-rollback only: a token with Zone DNS: Edit on madeinegyptgate.com (default:
#                          CLOUDFLARE_API_TOKEN). The deploy token itself does not need DNS rights
#   LEGACY_WORKER          the owner's Worker that keeps the live admin (default mis-egypt)
#   D1_LOCAL_DIR           db: run against a LOCAL D1 in this directory instead of the remote one (tests)
#   CLOUDFLARE_ACCOUNT_ID  default 88c77c2b7595dd0ce510270175f69143
#   WRANGLER               wrangler command (default: worker/node_modules/.bin/wrangler, else npx wrangler@4.164.0)
#   SITE_PY                the site build script (default: <repo>/site.py)
#   MIG_BUILD_DIR          where `build` writes the site (default: <repo>/build/site-fresh)
#   MIG_SEO_STATS          the generator's validation report (default: <repo>/build/seo-stats.json)
#   PAGES_MAX_FILES        files per deployment (default 20000 = free plan)
#   SEO_PLATFORM_KEY       optional: the smoke test then calls /api/seo/health with X-Platform-Key
#   DEPLOY_LOG_DIR         logs, lock, deployments.tsv and wrangler's working dirs (default: <repo>/build/deploy-logs)
#   MIG_OVERLAY_URL        build: the published Control Center overlay (default https://madeinegyptgate.com/data/overlay.js)
#   MIG_OVERLAY_PULL       build: 0 = do not pull it (the last build/overlay.js, if any, is baked in)
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DEPLOY_DIR/.." && pwd)"
PROJECT="${PAGES_PROJECT:-madeinegyptgate}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-88c77c2b7595dd0ce510270175f69143}"
export WRANGLER_SEND_METRICS="${WRANGLER_SEND_METRICS:-false}"
PROD_BRANCH="main"
PREVIEW_BRANCH="preview"
COMPAT_DATE="2026-10-01"
WRANGLER_VERSION="4.164.0"
ZONE="madeinegyptgate.com"
WORKER_NAME="janna-lookup"
D1_NAME="migate-db"
D1_ID="f86e00bb-9739-4985-a149-3dddb45b2b42"
KV_ID="b321fb348f3447179c99b4380952e5ac"
R2_BUCKET="migate-media"
SITE_PY="${SITE_PY:-$REPO/site.py}"
FRESH_DIR="${MIG_BUILD_DIR:-$REPO/build/site-fresh}"
STATS_FILE="${MIG_SEO_STATS:-$REPO/build/seo-stats.json}"
SITE_DIR="$FRESH_DIR"
STAGE_DIR="$REPO/build/pages-stage"
LOG_DIR="${DEPLOY_LOG_DIR:-$REPO/build/deploy-logs}"
API="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"   # CF_API_BASE: a mock API for tests only
FRESH_MARK=".migate-fresh-build"
# secrets (names only). ADVISOR_SECRET (+ AUTH_SECRET if used) must have the SAME value on Pages production and the
# Worker (they sign the member sessions both check). PLATFORM_KEY stays on the Worker (it activates plans); Pages gets
# its own SEO_PLATFORM_KEY. Previews get none of them (they run unreviewed code on public URLs).
PAGES_REQUIRED="ADVISOR_SECRET SEO_PLATFORM_KEY"
PAGES_OPTIONAL="AUTH_SECRET INDEXNOW_KEY"
# Worker secrets (worker/README.md): e-mail goes through Resend (RESEND_API_KEY); WhatsApp (respond.io) falls back to
# e-mail until the owner switches real sending on in the Control Center «مفاتيح الخدمات» (RESPONDIO_TOKEN may be saved there
# instead of as a secret; WA_DRY_RUN = "1" is the hard kill switch); a web-search key only widens the no-match candidate search
# deploy 2: CONFIG_SECRET (>= 32 characters) seals the gateway / mail / Anam keys saved in the Control Center; BREVO_API_KEY optional
WORKER_REQUIRED="ADVISOR_SECRET PLATFORM_KEY MEETINGS_SECRET RESEND_API_KEY ANAM_API_KEY CONFIG_SECRET"
WORKER_OPTIONAL="RESPONDIO_TOKEN WA_WEBHOOK_SECRET TURNSTILE_SECRET AUTH_SECRET WA_TOKEN BRAVE_SEARCH_KEY GOOGLE_CSE_KEY GOOGLE_CSE_CX BREVO_API_KEY"
SHARED_SECRETS="ADVISOR_SECRET AUTH_SECRET"
# deploy 1: the owner's live admin stays on the Worker mis-egypt (→ Hostinger PHP) — deploy/legacy-live.txt
LEGACY_WORKER="${LEGACY_WORKER:-mis-egypt}"
LEGACY_LIVE="$DEPLOY_DIR/legacy-live.txt"
OVERLAY_URL="${MIG_OVERLAY_URL:-https://$ZONE/data/overlay.js}"
PAGES_HOST="$PROJECT.pages.dev"
OLD_APEX_A="46.202.158.210"
OLD_WWW_CNAME="$ZONE"

YES=0 NO_BUILD=0 SKIP_SMOKE=0 SKIP_TESTS=0 NO_INDEX=0 FORCE=0 SET_NAME="" TARGET="" SECRET_ENV="production" PORT=""
TS="$(date -u +%Y%m%dT%H%M%SZ)"

if [ -t 1 ]; then B=$'\033[1m' R=$'\033[31m' G=$'\033[32m' Y=$'\033[33m' N=$'\033[0m'; else B="" R="" G="" Y="" N=""; fi
say()  { printf '%s==>%s %s\n' "$B" "$N" "$*"; }
ok()   { printf '  %sOK%s    %s\n' "$G" "$N" "$*"; }
warn() { printf '  %sWARN%s  %s\n' "$Y" "$N" "$*"; }
bad()  { printf '  %sFAIL%s  %s\n' "$R" "$N" "$*"; }
die()  { printf '%sERROR:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit "${1:-0}"; }
confirm() {
  [ "$YES" = 1 ] && return 0
  [ -t 0 ] || die "$1 — needs confirmation: re-run with --yes"
  printf '%s%s%s  type "yes" to continue: ' "$B" "$1" "$N"
  local a; read -r a; [ "$a" = "yes" ] || die "cancelled"
}
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required ($2)"; }

# ------------------------------------------------------------------------------------------------- arguments
CMD="${1:-help}"; [ $# -gt 0 ] && shift
case "$CMD" in help|-h|--help) usage 0 ;; smoke) exec bash "$DEPLOY_DIR/smoke-test.sh" "$@" ;; esac
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --site-dir) SITE_DIR="$(cd "${2:?}" && pwd)"; NO_BUILD=1; shift 2 ;;
    --stage-dir) mkdir -p "${2:?}"; STAGE_DIR="$(cd "$2" && pwd)"; shift 2 ;;
    --branch) PREVIEW_BRANCH="${2:?}"; shift 2 ;;
    --build) shift ;;                                   # round-1 option: building is the default now
    --no-build) NO_BUILD=1; shift ;;
    --skip-smoke) SKIP_SMOKE=1; shift ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    --no-index) NO_INDEX=1; shift ;;
    --yes|-y) YES=1; shift ;;
    --force) FORCE=1; shift ;;
    --set) SET_NAME="${2:?}"; shift 2 ;;
    --target) TARGET="${2:?}"; shift 2 ;;
    --env) SECRET_ENV="${2:?}"; shift 2 ;;
    --port) PORT="${2:?}"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "unknown option: $1" >&2; usage 2 ;;
    *) POS+=("$1"); shift ;;
  esac
done
[ "$PREVIEW_BRANCH" != "$PROD_BRANCH" ] || die "--branch must not be the production branch ($PROD_BRANCH)"
case "$SECRET_ENV" in production|preview) ;; *) die "--env must be production or preview" ;; esac

if [ -n "${WRANGLER:-}" ]; then read -r -a WR <<< "$WRANGLER"
elif [ -x "$REPO/worker/node_modules/.bin/wrangler" ]; then WR=("$REPO/worker/node_modules/.bin/wrangler")
else WR=(npx --yes "wrangler@$WRANGLER_VERSION"); fi
wr() { "${WR[@]}" "$@"; }
# account-level wrangler commands run from a neutral directory, so wrangler's cache (.wrangler/) never lands in the
# repository root; its empty functions/ makes `pages project create` always create a Pages project
WCWD="$LOG_DIR/wrangler-cwd"
wrn() { mkdir -p "$WCWD/functions"; (cd "$WCWD" && wr "$@"); }

mkdir -p "$LOG_DIR"
LOCK="$LOG_DIR/.lock"
LOCKED=0
lock() {
  [ "$LOCKED" = 1 ] && return 0
  if ! mkdir "$LOCK" 2>/dev/null; then
    if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"
    else die "another deploy is running ($LOCK); remove it if that is not true"; fi
  fi
  LOCKED=1
  trap 'rm -rf "$LOCK"' EXIT
}

api() { # METHOD PATH [json-body]
  [ -n "${CLOUDFLARE_API_TOKEN:-}" ] || die "this step calls the Cloudflare API directly: export CLOUDFLARE_API_TOKEN (README-DEPLOY.md, التوكن)"
  local m="$1" p="$2"; shift 2
  curl -sS --max-time 60 -X "$m" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" \
       ${1:+--data "$1"} "$API$p"
}
dapi() { # METHOD PATH [json-body] — DNS calls only (DNS_API_TOKEN, else CLOUDFLARE_API_TOKEN)
  local t="${DNS_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"
  [ -n "$t" ] || die "dns needs a token with Zone DNS: Edit on $ZONE: export DNS_API_TOKEN (README-DEPLOY.md section 6)"
  local m="$1" p="$2"; shift 2
  curl -sS --max-time 60 -X "$m" -H "Authorization: Bearer $t" -H "Content-Type: application/json" ${1:+--data "$1"} "$API$p"
}
zone_id() { # → the zone id of madeinegyptgate.com (dies when the token cannot see it)
  local z
  z=$(api GET "/zones?name=$ZONE" | jget "print(d['result'][0]['id'] if d.get('result') else '')" || true)
  [ -n "$z" ] || die "this token cannot see the zone $ZONE (needs Zone: Read + Workers Routes: Edit on $ZONE; README-DEPLOY.md section 3)"
  printf '%s' "$z"
}
legacy_paths() { sed -e 's/#.*//' -e 's/[[:space:]]//g' "$LEGACY_LIVE" | grep -E '^/' || true; }
legacy_patterns() { local p; legacy_paths | while IFS= read -r p; do printf '%s%s\nwww.%s%s\n' "$ZONE" "$p" "$ZONE" "$p"; done; }
jget() { # parse the first JSON value on stdin (wrangler may print notices around it), then run $1 with it as d
  python3 -c "import json,sys
t=sys.stdin.read(); i=[k for k in (t.find('['), t.find('{')) if k >= 0]
try: d=json.JSONDecoder().raw_decode(t[min(i):])[0] if i else None
except Exception: d=None
if d is None: sys.exit(1)
$1"; }
node_ok() { node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' 2>/dev/null; }

# ------------------------------------------------------------------------------------------------- doctor
cmd_doctor() {
  say "tools"
  need python3 "the site build and deploy/stage.py"; need curl "smoke test"; need node "wrangler, the data dump and the edge tests"
  ok "bash ${BASH_VERSION%%(*}, $(python3 --version 2>&1), node $(node --version), curl $(curl --version | head -n 1 | cut -d' ' -f2)"
  if node_ok; then ok "Node >= 22.12 (functions tests, wrangler 4)"; else bad "Node $(node --version) is too old: the edge tests and wrangler 4 need >= 22.12"; fi
  if python3 -c 'import PIL' 2>/dev/null; then ok "Pillow (product photos / company logos are cropped at build time)"
  else bad "Pillow missing: pip install pillow (without it the build stops; ~1,300 pages would lose their images)"; fi
  if v=$(wrn --version 2>/dev/null | tail -n 1); then ok "wrangler $v (${WR[*]})"; else bad "wrangler not runnable: ${WR[*]}"; fi
  if (cd "$REPO/functions" && npm test >"$LOG_DIR/$TS-functions-test.log" 2>&1); then ok "edge unit tests (functions: npm test) pass"
  else bad "edge unit tests fail (log: $LOG_DIR/$TS-functions-test.log)"; fi

  say "Cloudflare login (account $CLOUDFLARE_ACCOUNT_ID)"
  if wrn whoami >"$LOG_DIR/$TS-whoami.log" 2>&1; then ok "$(grep -iE 'logged in|associated with|API token' "$LOG_DIR/$TS-whoami.log" | head -n 1 | sed 's/^[^A-Za-z]*//')"
  else bad "not logged in: run 'npx wrangler login' or export CLOUDFLARE_API_TOKEN (see $LOG_DIR/$TS-whoami.log)"; return 1; fi

  say "resources"
  if project_exists; then
    ok "Pages project $PROJECT exists"
    # the daily rebuild must keep the live build fresh (tender / offer statuses, the tenders-hub date)
    local built
    built=$(curl -sS --compressed --max-time 20 "https://$PROJECT.pages.dev/_seo/pages.json" 2>/dev/null | head -c 400 \
            | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z' | head -n 1 || true)
    if [ -n "$built" ]; then
      python3 - "$built" <<'PY'
import calendar, sys, time
age = (time.time() - calendar.timegm(time.strptime(sys.argv[1], "%Y-%m-%dT%H:%M:%SZ"))) / 3600
print(("  OK    live production build %s (%.0f h old)" if age <= 26 else
       "  WARN  live production build %s is %.0f h old: the daily rebuild + deploy (README-DEPLOY.md section 7) is not running") % (sys.argv[1], age))
PY
    else warn "no production build on https://$PROJECT.pages.dev yet (or not reachable from here)"; fi
  else warn "Pages project $PROJECT does not exist yet — 'deploy.sh project' (or preview/production) creates it"; fi
  if wrn kv namespace list 2>/dev/null | jget "import sys
sys.exit(0 if any(n.get('id')=='$KV_ID' for n in d) else 3)"; then ok "KV namespace $KV_ID (binding SEO_KV, production only)"
  else bad "KV namespace $KV_ID not found in this account"; fi
  if wrn d1 list --json 2>/dev/null | jget "import sys
sys.exit(0 if any(x.get('uuid')=='$D1_ID' and x.get('name')=='$D1_NAME' for x in d) else 3)"; then ok "D1 $D1_NAME ($D1_ID)"
  else bad "D1 database $D1_NAME / $D1_ID not found"; fi
  if wrn r2 bucket list 2>/dev/null | grep -qE "(^|[^a-z-])$R2_BUCKET([^a-z-]|$)"; then ok "R2 bucket $R2_BUCKET (binding MEDIA)"
  else warn "R2 bucket $R2_BUCKET not listed (or no R2 permission on this login)"; fi

  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    say "zone and Worker routes (API)"
    local z; z=$(api GET "/zones?name=$ZONE" | jget "print(d['result'][0]['id'] if d.get('result') else '')" || true)
    if [ -n "$z" ]; then ok "zone $ZONE visible ($z)"; print_routes "$z" || warn "could not list the Workers routes (token needs Workers Routes: Edit on $ZONE)"
    else warn "this token cannot see the zone $ZONE: 'deploy.sh worker' (zone routes) and 'cutover' will fail — give the token Zone:Read + Workers Routes:Edit on $ZONE"; fi
  else
    warn "CLOUDFLARE_API_TOKEN not set: zone access and Worker routes not checked"
  fi

  say "repository"
  if check_worker_config; then ok "worker/wrangler.toml has the D1 / R2 bindings"; fi
  if grep -q "seo_build.part.py" "$SITE_PY" 2>/dev/null; then ok "site.py runs the SEO generator (seo_build.part.py)"
  else warn "site.py does not exec seo_build.part.py yet (generator-INTEGRATION.md P1–P5): 'build' would make the old site"; fi
  if [ -f "$REPO/functions/_middleware.js" ]; then ok "functions/_middleware.js present"; else bad "functions/_middleware.js missing"; fi
}

# ------------------------------------------------------------------------------------------------- build + stage
pull_overlay() { # deploy 2 (ACC-CONTRACT P-T6): the published Control Center edits → build/overlay.js (P-T1 / P-T2 bake them in)
  local f="$REPO/build/overlay.js" t="$REPO/build/.overlay-pull.$$.js"
  if [ "${MIG_OVERLAY_PULL:-1}" = 0 ]; then
    if [ -f "$f" ]; then warn "overlay pull off (MIG_OVERLAY_PULL=0): the last build/overlay.js is baked in"; else warn "overlay pull off (MIG_OVERLAY_PULL=0): no overlay is baked in"; fi
    return 0
  fi
  mkdir -p "$REPO/build"
  # read-only GET; the file must be the overlay script (never an HTML error page) and valid JavaScript, else the previous file stays
  if curl -fsS --max-time 20 -A "migate-deploy/2.0 (daily build)" "$OVERLAY_URL" -o "$t" 2>"$t.err" \
     && [ "$(head -c 1 "$t")" != "<" ] && head -c 2048 "$t" | grep -q 'window\.MIGOVL_DATA' && node --check "$t" >/dev/null 2>&1; then
    if [ -f "$f" ] && cmp -s "$t" "$f"; then rm -f "$t"; ok "overlay unchanged: $OVERLAY_URL = build/overlay.js"
    else mv -f "$t" "$f"; ok "overlay pulled: $OVERLAY_URL → build/overlay.js ($(wc -c < "$f" | tr -d ' ') bytes)"; fi
  else
    if [ -f "$f" ]; then warn "could not pull $OVERLAY_URL ($(tail -c 160 "$t.err" 2>/dev/null | tr '\n' ' ')): the previous build/overlay.js is baked in"
    else warn "could not pull $OVERLAY_URL ($(tail -c 160 "$t.err" 2>/dev/null | tr '\n' ' ')): no overlay is baked in (the pages still load /data/overlay.js live)"; fi
    rm -f "$t"
  fi
  rm -f "$t.err"
  return 0
}
cmd_build() {
  need python3 "site.py"; need node "tools/dump-data.mjs (the data dump the generator reads)"
  if ! python3 -c 'import PIL' 2>/dev/null && [ "${MIG_SEO_ALLOW_NO_PIL:-}" != 1 ]; then
    die "Pillow is missing: pip install pillow (the generator crops product photos and company logos with it)"
  fi
  case "$FRESH_DIR" in "$REPO"|"$REPO/"|"$REPO/site"|"$REPO/site/"|/) die "MIG_BUILD_DIR must be a dedicated directory, not $FRESH_DIR" ;; esac
  if [ -d "$FRESH_DIR" ] && [ -n "$(ls -A "$FRESH_DIR" 2>/dev/null)" ] && [ ! -f "$FRESH_DIR/$FRESH_MARK" ]; then
    die "$FRESH_DIR is not empty and was not made by 'deploy.sh build' — refusing to wipe it"
  fi
  say "build into an empty directory: $FRESH_DIR"
  rm -rf "$FRESH_DIR"; mkdir -p "$FRESH_DIR"
  printf 'deploy.sh build %s\n' "$TS" > "$FRESH_DIR/$FRESH_MARK"
  rm -f "$STATS_FILE"
  pull_overlay
  local t0=$SECONDS
  (cd "$REPO" && MIG_OUT="$FRESH_DIR/" MIG_SEO_STATS="$STATS_FILE" python3 "$SITE_PY") >"$LOG_DIR/$TS-build.log" 2>&1 \
    || { tail -n 30 "$LOG_DIR/$TS-build.log"; die "the build failed (log: $LOG_DIR/$TS-build.log)"; }
  [ -f "$FRESH_DIR/_seo/pages.json" ] || die "the build wrote no _seo/pages.json: site.py does not run the SEO generator yet (generator-INTEGRATION.md P1–P5)"
  [ -f "$STATS_FILE" ] || die "the build wrote no $STATS_FILE (generator validation result)"
  python3 - "$STATS_FILE" <<'PY' || die "the generator's own validation found problems in this build (details above; $STATS_FILE)"
import json, sys
s = json.load(open(sys.argv[1]))
print("  %s %s pages (%s AR + %s EN), %s in the sitemaps, %s exact redirects, generator validation: %s problem(s), %ss"
      % ("FAIL " if s.get("problem_count") else "OK   ", (s.get("pages_ar") or 0) + (s.get("pages_en") or 0), s.get("pages_ar"),
         s.get("pages_en"), s.get("sitemap_urls"), s.get("redirects_exact"), s.get("problem_count"), s.get("seconds")))
for w in s.get("warnings") or []:
    print("  WARN  generator: %s" % w)
for p in (s.get("problems") or [])[:20]:
    print("  FAIL  generator: %s" % p)
sys.exit(1 if s.get("problem_count") else 0)
PY
  ok "build done in $((SECONDS - t0)) s (log: $LOG_DIR/$TS-build.log)"
}
cmd_stage() {
  need python3 "deploy/stage.py"
  if [ "$NO_BUILD" = 0 ]; then cmd_build; fi
  [ -d "$SITE_DIR" ] || die "no build at $SITE_DIR: run deploy/deploy.sh build (or pass --site-dir)"
  say "stage $SITE_DIR → $STAGE_DIR"
  python3 "$DEPLOY_DIR/stage.py" stage --site "$SITE_DIR" --out "$STAGE_DIR" --repo "$REPO" --functions "$REPO/functions" \
    --config "$DEPLOY_DIR/wrangler-pages.toml" --exclude-file "$DEPLOY_DIR/stage-exclude.txt" --seo-stats "$STATS_FILE" \
    --max-files "${PAGES_MAX_FILES:-20000}" || die "pre-deploy checks failed (details above and in $STAGE_DIR/STAGE-REPORT.json)"
  prepublish_checks
}
cmd_check() {
  python3 "$DEPLOY_DIR/stage.py" check --out "$STAGE_DIR" --seo-stats "$STATS_FILE" --max-files "${PAGES_MAX_FILES:-20000}" || die "checks failed"
  prepublish_checks
}
prepublish_checks() {
  if [ "$SKIP_TESTS" = 1 ]; then warn "edge unit tests skipped (--skip-tests)"
  else
    say "edge unit tests (functions: npm test — middleware, admin API, auth parity with worker/src/auth.js)"
    node_ok || die "Node $(node --version) is too old for the edge tests (>= 22.12)"
    if (cd "$REPO/functions" && npm test) >"$LOG_DIR/$TS-functions-test.log" 2>&1; then
      ok "$(grep -E '^# (pass|tests) ' "$LOG_DIR/$TS-functions-test.log" | tr '\n' ' ' | sed 's/# //g')"
    else tail -n 40 "$LOG_DIR/$TS-functions-test.log"; die "edge unit tests failed (log: $LOG_DIR/$TS-functions-test.log)"; fi
  fi
  say "wrangler: validate the upload and compile the Functions"
  if (cd "$STAGE_DIR" && wr pages project validate site) >"$LOG_DIR/$TS-validate.log" 2>&1; then
    ok "wrangler pages project validate: OK"
  else cat "$LOG_DIR/$TS-validate.log"; die "wrangler validation failed"; fi
  rm -rf "$STAGE_DIR/.functions-build"
  if (cd "$STAGE_DIR" && wr pages functions build functions --outdir "$STAGE_DIR/.functions-build" \
        --compatibility-date "$COMPAT_DATE") >"$LOG_DIR/$TS-functions-build.log" 2>&1; then
    ok "Functions compile ($(du -sk "$STAGE_DIR/.functions-build" | cut -f1) KB)"
  else tail -n 30 "$LOG_DIR/$TS-functions-build.log"; die "the Functions do not compile"; fi
}
cmd_localtest() {
  lock; cmd_stage
  local emu="$STAGE_DIR-prod-emu" port pid rc=0 secret _
  say "production emulation: $emu (no _redirects rules for Function routes)"
  python3 "$DEPLOY_DIR/stage.py" emulate --out "$STAGE_DIR" --to "$emu" || die "emulation copy failed"
  port="${PORT:-$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')}"
  secret=$(python3 -c 'import secrets;print(secrets.token_hex(24))')
  say "wrangler pages dev on http://127.0.0.1:$port (local SEO_KV and D1; log $LOG_DIR/$TS-pages-dev.log)"
  set -m                                    # the server gets its own process group, so workerd stops with it
  (cd "$emu" && exec "${WR[@]}" pages dev site --port "$port" --ip 127.0.0.1 --binding "ADVISOR_SECRET=$secret" \
     >"$LOG_DIR/$TS-pages-dev.log" 2>&1) &
  pid=$!
  set +m
  trap 'kill -- -'"$pid"' 2>/dev/null; rm -rf "$LOCK"' EXIT
  for _ in $(seq 1 120); do
    curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$port/" && break
    kill -0 "$pid" 2>/dev/null || { tail -n 30 "$LOG_DIR/$TS-pages-dev.log"; die "wrangler pages dev stopped"; }
    sleep 1
  done
  bash "$DEPLOY_DIR/smoke-test.sh" --no-worker --env production --stage "$STAGE_DIR" "http://127.0.0.1:$port" 2>&1 \
    | tee "$LOG_DIR/$TS-localtest.log" || rc=1
  kill -- -"$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [ "$rc" = 0 ] || die "local smoke test failed (log: $LOG_DIR/$TS-localtest.log)"
  ok "local production emulation passed"
}
project_exists() {
  wrn pages project list --json 2>/dev/null | jget "import sys
sys.exit(0 if any(p.get('Project Name')=='$PROJECT' for p in d) else 3)"
}
cmd_project() {
  if project_exists; then ok "Pages project $PROJECT exists"; return 0; fi
  confirm "Create the Cloudflare Pages project '$PROJECT' (production branch $PROD_BRANCH) in account $CLOUDFLARE_ACCOUNT_ID?"
  # wrn runs from a directory that has functions/, so wrangler always creates a Pages project (this site needs Pages
  # Functions, _routes.json, _headers and _redirects)
  wrn pages project create "$PROJECT" --production-branch "$PROD_BRANCH" --compatibility-date "$COMPAT_DATE" \
    2>&1 | tee "$LOG_DIR/$TS-project-create.log"
  project_exists || die "the Pages project $PROJECT still does not exist (see $LOG_DIR/$TS-project-create.log)"
  ok "Pages project $PROJECT created — set its secrets next: deploy.sh secrets"
}
deploy_pages() { # branch
  local branch="$1" log="$LOG_DIR/$TS-pages-$1.log" msg url files built
  files=$(python3 -c "import json;print(json.load(open('$STAGE_DIR/STAGE-REPORT.json'))['stats'].get('files',''))" 2>/dev/null || echo "?")
  built=$(python3 -c "import json;print(json.load(open('$STAGE_DIR/site/_seo/pages.json')).get('built',''))" 2>/dev/null || echo "?")
  msg="site build $built, $files files, deployed $TS"
  say "deploy $STAGE_DIR/site → Pages $PROJECT, branch $branch"
  (cd "$STAGE_DIR" && wr pages deploy site --project-name "$PROJECT" --branch "$branch" \
      --commit-message "$msg" --commit-dirty=true) 2>&1 | tee "$log" || die "wrangler pages deploy failed (log: $log)"
  url=$(grep -oE 'Take a peek over at https://[a-z0-9.-]+\.pages\.dev' "$log" | tail -n 1 | sed 's/^Take a peek over at //')
  [ -n "$url" ] || url=$(grep -oE 'https://[a-z0-9.-]+\.pages\.dev' "$log" | tail -n 1)
  [ -n "$url" ] || die "could not read the deployment URL from $log"
  DEPLOY_URL="$url"
  ok "deployed: $url"
  printf '%s\t%s\t%s\t%s\n' "$TS" "$branch" "$url" "$built" >> "$LOG_DIR/deployments.tsv"
}
smoke_after() { # url env
  [ "$SKIP_SMOKE" = 1 ] && { warn "smoke test skipped (--skip-smoke)"; return 0; }
  say "smoke test $1 ($2)"
  bash "$DEPLOY_DIR/smoke-test.sh" --no-worker --env "$2" --stage "$STAGE_DIR" "$1" 2>&1 | tee -a "$LOG_DIR/$TS-smoke.log" \
    || die "smoke test failed on $1 (log: $LOG_DIR/$TS-smoke.log)"
}
cmd_preview() {
  lock; cmd_stage; cmd_project; deploy_pages "$PREVIEW_BRANCH"; smoke_after "$DEPLOY_URL" preview
  say "preview ready: $DEPLOY_URL  (alias https://$PREVIEW_BRANCH.$PROJECT.pages.dev; no production KV / D1 / secrets)"
}
cmd_production() {
  lock; cmd_stage; cmd_project
  confirm "Deploy to PRODUCTION (branch $PROD_BRANCH of $PROJECT)? Once the custom domain is active this is the live site."
  deploy_pages "$PROD_BRANCH"; smoke_after "$DEPLOY_URL" production
  say "production deployment live on https://$PROJECT.pages.dev (and on $ZONE once the cutover is done)"
}
cmd_release() {
  lock; cmd_stage; cmd_project
  deploy_pages "$PREVIEW_BRANCH"; smoke_after "$DEPLOY_URL" preview
  confirm "Preview passed. Promote the same stage to PRODUCTION?"
  deploy_pages "$PROD_BRANCH"; smoke_after "$DEPLOY_URL" production
}
cmd_deployments() { wrn pages deployment list --project-name "$PROJECT" --environment production; }
cmd_rollback() {
  local id="${POS[0]:-}"; [ -n "$id" ] || die "usage: deploy.sh rollback <deployment-id>   (ids: deploy.sh deployments)"
  confirm "Roll production of $PROJECT back to deployment $id?"
  api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/deployments/$id/rollback" \
    | jget "print('ok' if d.get('success') else d.get('errors'))"
}

# ------------------------------------------------------------------------------------------------- secrets
pages_secret_names() { # env
  wrn pages secret list --project-name "$PROJECT" --env "$1" 2>/dev/null | sed -nE 's/^[[:space:]]*- ([A-Za-z0-9_]+):.*/\1/p'
}
worker_secret_names() {
  (cd "$REPO/worker" && wr secret list --format json 2>/dev/null) | jget "print('\n'.join(s.get('name','') for s in d))" || true
}
report_names() { # label have required optional
  local label="$1" have n missing=""
  have=" $(echo $2) "
  for n in $3; do case "$have" in *" $n "*) ;; *) missing="$missing $n" ;; esac; done
  if [ -z "$missing" ]; then ok "$label: all required secrets set ($(echo $2 | tr ' ' ','))"; else bad "$label: missing required:$missing"; fi
  for n in $4; do case "$have" in *" $n "*) ;; *) printf '        optional, not set: %s\n' "$n" ;; esac; done
}
cmd_secrets() {
  if [ -n "$SET_NAME" ]; then secret_set "$SET_NAME"; return; fi
  say "secrets (names only — values are never shown)"
  if project_exists; then
    report_names "Pages production" "$(pages_secret_names production | tr '\n' ' ')" "$PAGES_REQUIRED" "$PAGES_OPTIONAL"
    local pv; pv=$(pages_secret_names preview | tr '\n' ' ')
    if [ -z "$(echo $pv)" ]; then ok "Pages preview: no secrets (as intended: previews run unreviewed code on public URLs)"
    else warn "Pages preview has secrets: $(echo $pv) — they must be preview-only values (never the production ones)"; fi
  else warn "Pages project $PROJECT does not exist yet"; fi
  report_names "Worker $WORKER_NAME" "$(worker_secret_names | tr '\n' ' ')" "$WORKER_REQUIRED" "$WORKER_OPTIONAL"
  printf '\n  same value on Pages production and the Worker: %s\n' "$SHARED_SECRETS"
  printf '  Worker only: PLATFORM_KEY (plan activation) — Pages uses its own SEO_PLATFORM_KEY\n'
  printf '  set one: deploy/deploy.sh secrets --set NAME [--target pages|worker|all] [--env preview]\n'
}
secret_set() {
  local name="$1" t="$TARGET" v v2
  printf '%s' "$name" | grep -qE '^[A-Z][A-Z0-9_]{1,63}$' || die "bad secret name: $name"
  if [ -z "$t" ]; then
    case " $SHARED_SECRETS " in *" $name "*) t=all ;; esac
    case " $PAGES_REQUIRED $PAGES_OPTIONAL " in *" $name "*) t="${t:-pages}" ;; esac
    t="${t:-worker}"
  fi
  [ "$name" != PLATFORM_KEY ] || case "$t" in pages|all) die "PLATFORM_KEY stays on the Worker (it activates plans); give Pages its own: deploy.sh secrets --set SEO_PLATFORM_KEY" ;; esac
  if [ "$SECRET_ENV" = preview ]; then
    [ "$t" = worker ] && die "--env preview applies to Pages only"
    t=pages
    warn "preview secret: previews run unreviewed branches on public URLs — use a value that is used NOWHERE else"
  fi
  [ -t 0 ] || die "secrets --set reads the value from the keyboard (hidden); run it in a terminal"
  printf 'value for %s (hidden): ' "$name"; read -r -s v; echo
  printf 'again: '; read -r -s v2; echo
  [ "$v" = "$v2" ] || die "the two values differ"
  [ -n "$v" ] || die "empty value"
  # crypto.js refuses a shorter key (503 config_secret_missing in the Control Center) — catch it here, before it is stored
  [ "$name" != CONFIG_SECRET ] || [ "${#v}" -ge 32 ] || { v=""; v2=""; die "CONFIG_SECRET must be at least 32 characters (openssl rand -hex 32)"; }
  case "$t" in pages|all)
    if printf '%s' "$v" | wrn pages secret put "$name" --project-name "$PROJECT" --env "$SECRET_ENV" >/dev/null; then ok "Pages $SECRET_ENV: $name"; else bad "Pages $SECRET_ENV: $name NOT set"; fi
    warn "Pages secrets reach the NEXT deployment: run deploy.sh production again" ;;
  esac
  case "$t" in worker|all)
    if printf '%s' "$v" | (cd "$REPO/worker" && wr secret put "$name") >/dev/null; then ok "Worker $WORKER_NAME: $name"; else bad "Worker $WORKER_NAME: $name NOT set"; fi ;;
  esac
  v=""; v2=""
}

# ------------------------------------------------------------------------------------------------- Worker
check_worker_config() {
  local f="${WORKER_TOML:-$REPO/worker/wrangler.toml}"
  [ -f "$f" ] || { bad "worker/wrangler.toml not found"; return 1; }
  python3 - "$f" "$D1_ID" "$D1_NAME" "$R2_BUCKET" "$ZONE" "$LEGACY_LIVE" "$REPO/worker/src/index.js" "$KV_ID" <<'PY'
import re, sys
path, d1_id, d1_name, r2, zone, legacy_file, index_js, kv_id = sys.argv[1:]
text = open(path, encoding="utf-8").read()
probs, warns, routes = [], [], []
try:
    import tomllib
    c = tomllib.loads(text)
    d1 = [x for x in c.get("d1_databases", []) if x.get("binding") == "DB"]
    r2b = [x for x in c.get("r2_buckets", []) if x.get("binding") == "MEDIA"]
    routes = [r.get("pattern", "") if isinstance(r, dict) else str(r) for r in c.get("routes", [])]
    if not d1 or d1[0].get("database_id") != d1_id or d1[0].get("database_name") != d1_name:
        probs.append('[[d1_databases]] binding "DB" must be database_name = "%s", database_id = "%s"' % (d1_name, d1_id))
    if not r2b or r2b[0].get("bucket_name") != r2:
        probs.append('[[r2_buckets]] binding "MEDIA" must be bucket_name = "%s"' % r2)
    kv = [x for x in c.get("kv_namespaces", []) if x.get("binding") == "SEO_KV"]
    if not kv or kv[0].get("id") != kv_id:   # deploy 2: content.js writes the published overlay to KV "acc:overlay" (same namespace as Pages)
        probs.append('[[kv_namespaces]] binding "SEO_KV" must be id = "%s" (the Pages SEO_KV namespace; the Worker writes only acc:* keys)' % kv_id)
except ImportError:                      # Python < 3.11: line-based check of uncommented settings
    live = "\n".join(l.split("#", 1)[0] for l in text.splitlines())
    if not re.search(r'database_id\s*=\s*"%s"' % re.escape(d1_id), live):
        probs.append('[[d1_databases]] binding "DB" with database_id = "%s" (uncommented)' % d1_id)
    if not re.search(r'bucket_name\s*=\s*"%s"' % re.escape(r2), live):
        probs.append('[[r2_buckets]] binding "MEDIA" with bucket_name = "%s" (uncommented)' % r2)
    routes = re.findall(r'pattern\s*=\s*"([^"]+)"', live)
    if not re.search(r'binding\s*=\s*"SEO_KV"[^\[]*id\s*=\s*"%s"' % re.escape(kv_id), live):
        probs.append('[[kv_namespaces]] binding "SEO_KV" with id = "%s" (uncommented)' % kv_id)
    c = {"vars": dict(re.findall(r'^\s*([A-Z][A-Z0-9_]*)\s*=\s*"([^"]*)"', live, re.M))}
NON_API = ("/data/overlay.js*", "/media/u/*")   # deploy 2: the published overlay (content.js serveOverlay) and uploaded images (serveMedia)
for p in routes:
    q = p.replace("www.", "")
    if q in (zone + "/*", "*" + zone + "/*", zone + "/api/*", zone + "/api*", zone + "/a*", zone + "/ap*") or "/api/seo" in q:
        probs.append("route %r would hide the Pages site or /api/seo/* (the SEO admin API is a Pages Function)" % p)
    host, _, rp = p.partition("/")
    if host.replace("www.", "") == zone and not ("/" + rp).startswith("/api/") and ("/" + rp) not in NON_API:
        probs.append("route %r is not an API family nor one of %s: it would hide Pages files" % (p, ", ".join(NON_API)))
for host in (zone, "www." + zone):
    for n in NON_API:
        if host + n not in routes:
            warns.append("no route %s%s — the Worker serves it (deploy 2) but the request would reach the static Pages copy" % (host, n))
# deploy 1: the owner's live admin (deploy/legacy-live.txt) stays on the Worker mis-egypt — no API route may cover it
legacy = []
for line in open(legacy_file, encoding="utf-8"):
    line = line.split("#", 1)[0].strip()
    if line.startswith("/"):
        legacy.append(line)
def overlap(a, b):
    sa, sb = a.rstrip("*"), b.rstrip("*")
    return sa == sb or (a.endswith("*") and sb.startswith(sa)) or (b.endswith("*") and sa.startswith(sb))
for p in routes:
    host, _, rp = p.partition("/")
    rp = "/" + rp
    for lp in legacy:
        if host.replace("www.", "") == zone and overlap(rp, lp):
            probs.append("route %r covers %s, which deploy 1 keeps on the owner's live system (Worker mis-egypt, "
                         "deploy/legacy-live.txt)" % (p, lp))
# every API family the Worker serves needs a route on both hosts (one by one, never a catch-all)
try:
    fams = sorted(set(re.findall(r"\\?/api\\?/([a-z][a-z0-9-]*)", open(index_js, encoding="utf-8").read())))
except OSError:
    fams = []
for fam in fams:
    if fam == "seo" or any(lp.startswith("/api/" + fam) for lp in legacy):
        continue                                   # /api/index.php: served by index.js (handleOldApi) but deliberately unrouted — mis-egypt keeps it
    for host in (zone, "www." + zone):
        if not any(r.startswith(host + "/api/" + fam) for r in routes):
            warns.append("no route %s/api/%s… — the Worker serves /api/%s but requests for it on %s would reach Pages (404)"
                         % (host, fam, fam, host))
v = c.get("vars") or {}
wa = v.get("WA_DRY_RUN")
if wa == "1":   # deploy 2 ships "0": the Control Center switch «تشغيل إرسال واتساب الحقيقي» decides (owner only, OFF by default)
    warns.append('[vars] WA_DRY_RUN = "1": the hard kill switch is on — nothing goes by WhatsApp and the Control Center switch cannot turn it on (deploy 2 ships "0": the panel decides, OFF until the owner\'s token test + a delivered test message)')
elif wa != "0":
    warns.append('[vars] WA_DRY_RUN is %r: use "0" (the Control Center switch decides, OFF by default) or "1" (hard kill switch); any other value counts as the kill switch' % (wa,))
if not v.get("LEGACY_ORIGIN"):
    warns.append('[vars] LEGACY_ORIGIN is not set: the old-password bridge (/api/auth/legacy) stays off (the import tool uses /api/index.php on the same origin)')
if "noreply@" + zone not in v.get("MAIL_FROM", ""):
    warns.append('[vars] MAIL_FROM is %r, expected «منصة صنع في مصر <noreply@%s>» (Resend sender, owner decision)' % (v.get("MAIL_FROM", ""), zone))
for p in probs:
    print("  FAIL  worker/wrangler.toml: " + p)
for w in warns:
    print("  WARN  worker/wrangler.toml: " + w)
sys.exit(1 if probs else 0)
PY
}
d1_flags() { # where the D1 commands run: the remote database, or a local copy for tests (D1_LOCAL_DIR)
  if [ -n "${D1_LOCAL_DIR:-}" ]; then printf '%s\n' --local --persist-to "$D1_LOCAL_DIR"; else printf '%s\n' --remote; fi
}
d1_ops() { # a throw-away wrangler config that only names the database → its directory
  local ops="$LOG_DIR/d1-ops"; mkdir -p "$ops"
  printf 'name = "migate-d1-ops"\ncompatibility_date = "%s"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "%s"\ndatabase_id = "%s"\n' \
    "$COMPAT_DATE" "$D1_NAME" "$D1_ID" > "$ops/wrangler.toml"
  printf '%s' "$ops"
}
d1_json() { # sql → JSON on stdout
  local ops f; ops=$(d1_ops); mapfile -t f < <(d1_flags)
  (cd "$ops" && wr d1 execute "$D1_NAME" "${f[@]}" --yes --json --command "$1")
}
d1_file() { # file.sql → runs it
  local ops f; ops=$(d1_ops); mapfile -t f < <(d1_flags)
  (cd "$ops" && wr d1 execute "$D1_NAME" "${f[@]}" --yes --file "$1")
}
d1_state() { # → path of a JSON {tables: {name: [columns]}} describing the live database
  local dir="$LOG_DIR/d1-ops/state-$TS-$RANDOM" t
  mkdir -p "$dir"
  if d1_json "SELECT m.name AS t, p.name AS c FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%' AND m.name <> 'd1_migrations' ORDER BY m.name, p.cid" \
       >"$dir/all.json" 2>"$dir/err" && python3 "$DEPLOY_DIR/d1_migrate.py" state "$dir/all.json" >"$dir/state.json" 2>>"$dir/err"; then
    printf '%s' "$dir/state.json"; return 0
  fi
  # fallback without table-valued pragmas: list the tables, then PRAGMA table_info per table
  d1_json "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'" \
    >"$dir/tables.json" 2>>"$dir/err" || { cat "$dir/err" >&2; return 1; }
  for t in $(python3 "$DEPLOY_DIR/d1_migrate.py" state "$dir/tables.json" | jget "print(' '.join(d['tables']))"); do
    printf '%s' "$t" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$' || continue
    d1_json "PRAGMA table_info($t)" >"$dir/$t.json" 2>>"$dir/err" || { cat "$dir/err" >&2; return 1; }
  done
  python3 "$DEPLOY_DIR/d1_migrate.py" state "$dir"/*.json >"$dir/state.json" || return 1
  printf '%s' "$dir/state.json"
}
cmd_db() {
  local where st plan f msg n=0
  where=$([ -n "${D1_LOCAL_DIR:-}" ] && printf 'LOCAL copy in %s' "$D1_LOCAL_DIR" || printf 'REMOTE')
  say "D1 $D1_NAME ($D1_ID, $where): worker/schema.sql + migrations 0004, 0005, 0006 (0006 = Admin Control Center, additive)"
  st=$(d1_state) || die "cannot query D1 $D1_NAME (login / token with D1: Edit?)"
  ok "tables before: $(python3 -c 'import json,sys;t=json.load(open(sys.argv[1]))["tables"];print("%d%s" % (len(t), (" — " + " ".join(sorted(t))) if t else " (empty database)"))' "$st")"
  plan="$LOG_DIR/d1-ops/plan-$TS"
  python3 "$DEPLOY_DIR/d1_migrate.py" plan --state "$st" --out "$plan" >"$plan.txt" || { sed 's/^/    /' "$plan.txt"; die "D1 $D1_NAME cannot be brought up to date automatically (above)"; }
  sed -e 's#^[^	]*/##' -e 's/^/    /' "$plan.txt"
  confirm "Apply these steps to the $where D1 database $D1_NAME?"
  while IFS=$'\t' read -r f msg; do
    [ "$f" = "-" ] && continue
    n=$((n + 1))
    if d1_file "$f" </dev/null >>"$LOG_DIR/$TS-d1.log" 2>&1; then ok "$msg"
    else tail -n 25 "$LOG_DIR/$TS-d1.log"; die "D1 step $n failed: $msg (log: $LOG_DIR/$TS-d1.log) — every step is safe to re-run"; fi
  done <"$plan.txt"
  st=$(d1_state) || die "cannot re-read D1 $D1_NAME after the migration"
  python3 "$DEPLOY_DIR/d1_migrate.py" verify --state "$st" || die "the D1 schema is incomplete after the migration (above)"
}
cmd_worker() {
  lock
  say "Worker $WORKER_NAME"
  check_worker_config || die "patch worker/wrangler.toml first (README-DEPLOY.md, الـ Worker)"
  ok "worker/wrangler.toml: D1 $D1_NAME, R2 $R2_BUCKET, no catch-all route"
  if [ "$NO_INDEX" = 0 ]; then
    say "rebuild Janna's search index from data/*.js (worker/src/data.json)"
    (cd "$REPO" && node worker/build-index.js) || die "worker/build-index.js failed"
  fi
  [ -d "$REPO/worker/node_modules/postal-mime" ] || { say "npm install (worker)"; (cd "$REPO/worker" && npm install --no-audit --no-fund); }
  cmd_db
  confirm "Deploy the Worker '$WORKER_NAME' (its /api/… routes on $ZONE go live immediately)?"
  (cd "$REPO/worker" && wr deploy) 2>&1 | tee "$LOG_DIR/$TS-worker.log" || die "wrangler deploy failed (log: $LOG_DIR/$TS-worker.log)"
  report_names "Worker $WORKER_NAME" "$(worker_secret_names | tr '\n' ' ')" "$WORKER_REQUIRED" "$WORKER_OPTIONAL"
  local u; u=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$LOG_DIR/$TS-worker.log" | head -n 1 || true)
  [ "$SKIP_SMOKE" = 1 ] && return 0
  say "health"
  bash "$DEPLOY_DIR/smoke-test.sh" --api-only --no-seo-api "https://$ZONE" || warn "API health has failures (secrets? routes? see above)"
  [ -z "$u" ] || bash "$DEPLOY_DIR/smoke-test.sh" --api-only "$u" -q || true
}

# ------------------------------------------------------------------------------------------------- domains
cmd_domains() {
  need curl "API calls"
  local p="/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" have d
  say "custom domains of Pages project $PROJECT"
  have=$(api GET "$p" | jget "
if not d.get('success'): print('ERR', d.get('errors')); raise SystemExit
for x in d['result']: print(x['name'], x.get('status'), (x.get('validation_data') or {}).get('status',''))") || die "API error"
  printf '%s\n' "$have" | sed 's/^/    /'
  case "$have" in ERR*) die "cannot read the domains (token needs 'Cloudflare Pages: Edit')";; esac
  for d in "$ZONE" "www.$ZONE"; do
    if printf '%s\n' "$have" | grep -q "^$d "; then ok "$d already attached"; continue; fi
    confirm "Attach $d to the Pages project $PROJECT? (DNS is NOT changed by this script)"
    api POST "$p" "{\"name\":\"$d\"}" | jget "print(('  attached: %s (%s)' % (d['result']['name'], d['result'].get('status'))) if d.get('success') else ('  FAIL: %s' % d.get('errors')))"
  done
  cat <<EOF

  The domains stay "pending" until DNS points at Pages (next step: deploy.sh dns).
  Before the cutover (README-DEPLOY.md section 6) all of these must be true:
    - deploy.sh production passed and deploy/smoke-test.sh --no-worker https://$PROJECT.pages.dev shows no FAIL
    - deploy.sh worker passed
    - the DAILY rebuild + deploy is scheduled (cron or GitHub Actions, README-DEPLOY.md section 7)
  The cutover itself (each step is one command; the old site keeps answering until step 4):
    1. deploy.sh dns            apex A $OLD_APEX_A and www → proxied CNAME $PAGES_HOST (nothing else in DNS)
    2. deploy.sh domains        again, until both domains are "active"
    3. deploy.sh www-redirect   www.$ZONE/* → https://$ZONE/… (301) + Always Use HTTPS
    4. deploy.sh cutover        mis-egypt keeps ONLY the owner's live admin (deploy/legacy-live.txt); new site live
    5. deploy/smoke-test.sh https://$ZONE
  Rollback, one command, instant:  deploy/deploy.sh cutover-rollback
EOF
}

# ------------------------------------------------------------------------------------------------- routes / cutover
route_plan() { # mode (state | cutover | rollback); stdin: GET /zones/:id/workers/routes → one action per line
  ROUTE_MODE="$1" ROUTE_WANT="$(legacy_patterns | tr '\n' ' ')" ROUTE_ZONE="$ZONE" ROUTE_LEGACY="$LEGACY_WORKER" \
  ROUTE_API="$WORKER_NAME" jget "
import os, sys
if not d.get('success', False) or not isinstance(d.get('result'), list):
    print('ERROR %s' % (d.get('errors') or d.get('messages') or 'unexpected answer',)); sys.exit(1)
mode, zone, legacy, apiw = os.environ['ROUTE_MODE'], os.environ['ROUTE_ZONE'], os.environ['ROUTE_LEGACY'], os.environ['ROUTE_API']
want = os.environ['ROUTE_WANT'].split()
catch = [zone + '/*', 'www.' + zone + '/*']
by = {}
for r in d['result']:
    by.setdefault(r.get('pattern', ''), r)
if mode == 'state':
    for p, r in sorted(by.items()):
        w = r.get('script') or '(no Worker)'
        tag = ('catch-all: the old site answers everything' if p in catch else
               'old system (deploy/legacy-live.txt)' if p in want else 'API' if w == apiw else '')
        print('  route %-52s -> %-14s %s' % (p, w, tag))
    has_catch = [p for p in catch if p in by and by[p].get('script') == legacy]
    has_spec = [p for p in want if p in by and by[p].get('script') == legacy]
    api = [p for p in by if by[p].get('script') == apiw]
    print('  API Worker %s: %d route(s)' % (apiw, len(api)))
    if has_catch:
        print('  STATE before the cutover: %s still holds %s (the old site answers every URL)' % (legacy, ' and '.join(has_catch)))
    elif len(has_spec) == len(want):
        print('  STATE after the cutover: %s keeps only the owner live admin (%d routes); everything else is the new site' % (legacy, len(has_spec)))
    else:
        print('  STATE incomplete: %d of %d owner-admin routes, no catch-all — the live admin may be broken: deploy.sh cutover (adds them) or deploy.sh cutover-rollback' % (len(has_spec), len(want)))
elif mode == 'cutover':
    for p in want:
        r = by.get(p)
        if r is None: print('create %s' % p)
        elif r.get('script') == legacy: print('keep %s' % p)
        else: print('CONFLICT %s is bound to %s, expected %s' % (p, r.get('script') or '(no Worker)', legacy))
    for p in catch:
        r = by.get(p)
        if r is None: print('absent %s' % p)
        elif r.get('script') == legacy: print('delete %s %s' % (r['id'], p))
        else: print('CONFLICT %s is bound to %s, not %s — it would keep hiding the new site' % (p, r.get('script') or '(no Worker)', legacy))
else:
    for p in catch:
        r = by.get(p)
        if r is None: print('create %s' % p)
        elif r.get('script') == legacy: print('keep %s' % p)
        else: print('update %s %s (now %s)' % (r['id'], p, r.get('script') or 'no Worker'))
"
}
print_routes() { # zone-id
  api GET "/zones/$1/workers/routes" | route_plan state
}
cmd_routes() { need curl "API calls"; say "Workers routes on $ZONE"; print_routes "$(zone_id)"; }
route_create() { # zone pattern → creates the route for the legacy Worker
  api POST "/zones/$1/workers/routes" "{\"pattern\":\"$2\",\"script\":\"$LEGACY_WORKER\"}" | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))"
}
preflight_cutover() { # zone-id → 0 when the new site is ready to take over
  local z="$1" bad=0 doms built
  say "pre-flight"
  doms=$(api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" | jget "
for x in d.get('result') or []: print(x['name'], x.get('status'))" || true)
  for d in "$ZONE" "www.$ZONE"; do
    if printf '%s\n' "$doms" | grep -qx "$d active"; then ok "Pages custom domain $d is active"
    else bad "Pages custom domain $d is not active ($(printf '%s\n' "$doms" | awk -v d="$d" '$1==d{print $2}' | head -n 1 | sed 's/^$/not attached/')): deploy.sh domains + deploy.sh dns first"; bad=1; fi
  done
  built=$(curl -sS --compressed --max-time 20 "https://$PAGES_HOST/_seo/pages.json" 2>/dev/null | head -c 400 | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z' | head -n 1 || true)
  if [ -n "$built" ]; then ok "the new site answers on https://$PAGES_HOST (build $built)"; else bad "https://$PAGES_HOST does not serve the new build: deploy.sh production first"; bad=1; fi
  if api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" | jget "import sys
ids = [s.get('id') for s in d.get('result') or []]
sys.exit(0 if '$LEGACY_WORKER' in ids else 3)"; then ok "Worker $LEGACY_WORKER exists (it keeps the owner's live admin)"
  else bad "Worker $LEGACY_WORKER not found in account $CLOUDFLARE_ACCOUNT_ID: the specific routes would point at nothing"; bad=1; fi
  if api GET "/zones/$z/workers/routes" | jget "import sys
sys.exit(0 if any(r.get('script') == '$WORKER_NAME' and '/api/auth' in r.get('pattern', '') for r in d.get('result') or []) else 3)"; then
    ok "API Worker $WORKER_NAME has its routes on $ZONE"
  else bad "API Worker $WORKER_NAME has no /api/auth route on $ZONE: deploy.sh worker first (sign-in, inquiries and the dashboards need it)"; bad=1; fi
  return "$bad"
}
cmd_cutover() {
  need curl "API calls"; lock
  local z plan p id rest
  z=$(zone_id)
  say "cutover on $ZONE: the Worker $LEGACY_WORKER keeps ONLY the owner's live admin (deploy/legacy-live.txt)"
  legacy_paths | sed 's/^/    keeps: /'
  if ! preflight_cutover "$z"; then
    [ "$FORCE" = 1 ] || die "pre-flight failed (above) — nothing was changed. Fix it first (or --force if you are sure)"
    warn "pre-flight failed, going on because of --force"
  fi
  plan=$(api GET "/zones/$z/workers/routes" | route_plan cutover) || die "cannot read the Workers routes of $ZONE: $plan"
  say "plan"
  printf '%s\n' "$plan" | sed 's/^/    /'
  case "$plan" in *CONFLICT*) die "route conflicts (above) — nothing was changed; fix them in Cloudflare → $ZONE → Workers Routes" ;; esac
  confirm "Switch $ZONE to the new site now (the owner's live admin stays on $LEGACY_WORKER)? Rollback: deploy.sh cutover-rollback"
  # 1) specific routes first: while the catch-alls still exist nothing changes for visitors
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    route_create "$z" "$p" || die "could not add the route $p — the catch-all routes were NOT removed (old site still live); re-run to retry"
    ok "added route $p → $LEGACY_WORKER"
  done < <(printf '%s\n' "$plan" | awk '$1 == "create" { print $2 }')
  plan=$(api GET "/zones/$z/workers/routes" | route_plan cutover) || die "cannot re-read the routes (nothing removed)"
  if printf '%s\n' "$plan" | grep -qE '^(create|CONFLICT) '; then
    printf '%s\n' "$plan" | grep -E '^(create|CONFLICT) ' | sed 's/^/    /'
    die "the owner-admin routes are not all in place — the catch-all routes were NOT removed (old site still live)"
  fi
  ok "all $(legacy_patterns | wc -l | tr -d ' ') owner-admin routes are bound to $LEGACY_WORKER"
  # 2) remove the two catch-all routes → the new site answers every other URL
  while read -r id p rest; do
    [ -n "$id" ] || continue
    api DELETE "/zones/$z/workers/routes/$id" | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))" \
      || die "could not remove the route $p — run deploy.sh cutover again, or deploy.sh cutover-rollback to go back"
    ok "removed the catch-all route $p"
  done < <(printf '%s\n' "$plan" | awk '$1 == "delete" { print $2, $3 }')
  say "routes now"; print_routes "$z"
  [ "$SKIP_SMOKE" = 1 ] && { warn "smoke test skipped (--skip-smoke)"; return 0; }
  say "smoke test https://$ZONE (in 20 s: route changes need a few seconds to reach every Cloudflare location)"
  sleep 20
  if bash "$DEPLOY_DIR/smoke-test.sh" -q "https://$ZONE" 2>&1 | tee "$LOG_DIR/$TS-cutover-smoke.log"; then
    ok "the new site is live on https://$ZONE; the old system keeps: $(legacy_paths | tr '\n' ' ')"
  else
    bad "the smoke test found problems (log: $LOG_DIR/$TS-cutover-smoke.log)"
    printf '\n  To go back to the old site at once:  deploy/deploy.sh cutover-rollback --yes\n'
    return 1
  fi
}
cmd_cutover_rollback() {
  need curl "API calls"; lock
  local z plan id p rest
  z=$(zone_id)
  say "ROLLBACK on $ZONE: the Worker $LEGACY_WORKER answers everything again (old site), DNS stays as it is"
  plan=$(api GET "/zones/$z/workers/routes" | route_plan rollback) || die "cannot read the Workers routes of $ZONE: $plan"
  printf '%s\n' "$plan" | sed 's/^/    /'
  confirm "Restore the two catch-all routes of $LEGACY_WORKER (the old site comes back for every visitor)?"
  while read -r p; do
    [ -n "$p" ] || continue
    route_create "$z" "$p" || die "could not add $p — add it by hand: Cloudflare → $ZONE → Workers Routes → Add route → $p → $LEGACY_WORKER"
    ok "added the catch-all route $p → $LEGACY_WORKER"
  done < <(printf '%s\n' "$plan" | awk '$1 == "create" { print $2 }')
  while read -r id p rest; do
    [ -n "$id" ] || continue
    api PUT "/zones/$z/workers/routes/$id" "{\"pattern\":\"$p\",\"script\":\"$LEGACY_WORKER\"}" | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))" || die "could not rebind $p to $LEGACY_WORKER"
    ok "rebound $p → $LEGACY_WORKER"
  done < <(printf '%s\n' "$plan" | awk '$1 == "update" { print $2, $3 }')
  say "routes now"; print_routes "$z"
  ok "old site restored (the specific owner-admin routes stay; they are harmless). API routes of $WORKER_NAME are untouched."
}

# ------------------------------------------------------------------------------------------------- DNS (two records only)
dns_guard_py='
import os
ZONE = os.environ["DNS_ZONE"]
NAMES = (ZONE, "www." + ZONE)
TYPES = ("A", "AAAA", "CNAME")
def ours(r):   # the ONLY records this script may ever change: A / AAAA / CNAME named exactly apex or www
    return r.get("name") in NAMES and r.get("type") in TYPES
'
cmd_dns() {
  need curl "API calls"; lock
  local z all bk plan
  z=$(zone_id)
  bk="$LOG_DIR/dns-snapshot-$TS.json"         # becomes dns-backup-<ts>.json only when records are about to change
  all=$(dapi GET "/zones/$z/dns_records?per_page=5000") || die "cannot read the DNS records"
  printf '%s' "$all" | jget "import json, sys
if not d.get('success'): print(d.get('errors')); sys.exit(1)
json.dump(d['result'], open('$bk', 'w'), indent=1)" || die "cannot read the DNS records (DNS_API_TOKEN needs Zone DNS: Edit on $ZONE)"
  ok "snapshot of all $(python3 -c "import json;print(len(json.load(open('$bk'))))") DNS records: $bk"
  plan=$(DNS_ZONE="$ZONE" DNS_PAGES="$PAGES_HOST" DNS_OLD_A="$OLD_APEX_A" DNS_FORCE="$FORCE" python3 -c "$dns_guard_py"'
import json, sys
recs = json.load(open(sys.argv[1]))
pages, old_a, force = os.environ["DNS_PAGES"], os.environ["DNS_OLD_A"], os.environ["DNS_FORCE"] == "1"
untouched = [r for r in recs if not ours(r)]
print("info %d other record(s) are never touched (MX, TXT/SPF/DMARC, *._domainkey, mail, webmail, send, rsend …)" % len(untouched))
for name in NAMES:
    rs = sorted([r for r in recs if ours(r) and r["name"] == name], key=lambda r: (r["type"] != ("A" if name == ZONE else "CNAME"), r["type"]))
    if not rs:
        print("create - %s" % name); continue
    if len(rs) == 1 and rs[0]["type"] == "CNAME" and rs[0]["content"] == pages and rs[0].get("proxied"):
        print("keep %s %s already CNAME %s (proxied)" % (rs[0]["id"], name, pages)); continue
    if name == ZONE and not force and any(r["type"] == "A" and r["content"] != old_a for r in rs):
        print("REFUSE %s has %s — expected A %s; check it, then --force" % (name, ", ".join("%s %s" % (r["type"], r["content"]) for r in rs), old_a)); continue
    print("put %s %s %s %s -> CNAME %s (proxied)" % (rs[0]["id"], name, rs[0]["type"], rs[0]["content"], pages))
    for r in rs[1:]:
        print("delete %s %s %s %s (a CNAME cannot sit next to A/AAAA)" % (r["id"], name, r["type"], r["content"]))
' "$bk") || die "could not plan the DNS change"
  say "DNS plan (only $ZONE and www.$ZONE, types A/AAAA/CNAME)"
  printf '%s\n' "$plan" | sed 's/^/    /'
  case "$plan" in *REFUSE*) die "unexpected DNS state (above) — nothing was changed" ;; esac
  printf '%s\n' "$plan" | grep -qE '^(put|delete|create) ' || { ok "DNS already points at $PAGES_HOST"; return 0; }
  confirm "Change exactly these DNS records now? (visitors see no change while $LEGACY_WORKER still holds the catch-all routes)"
  cp "$bk" "$LOG_DIR/dns-backup-$TS.json"; bk="$LOG_DIR/dns-backup-$TS.json"
  ok "backup before the change: $bk"
  local act id name rest
  while read -r act id name rest; do
    case "$act" in
      put) dapi PUT "/zones/$z/dns_records/$id" "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$PAGES_HOST\",\"proxied\":true,\"ttl\":1,\"comment\":\"madeinegyptgate Pages (deploy.sh dns $TS)\"}" \
             | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))" \
             || die "the API refused to turn $name into a CNAME (nothing else changed; backup $bk). Do it in the dashboard: DNS → $name → Edit → type CNAME, target $PAGES_HOST, Proxied — in ONE edit if possible"
           ok "$name → CNAME $PAGES_HOST (proxied)" ;;
      delete) dapi DELETE "/zones/$z/dns_records/$id" | jget "import sys
sys.exit(0 if d.get('success') else 1)" || die "could not delete the extra record $id of $name"; ok "removed the extra $rest record of $name" ;;
      create) dapi POST "/zones/$z/dns_records" "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$PAGES_HOST\",\"proxied\":true,\"ttl\":1}" | jget "import sys
sys.exit(0 if d.get('success') else 1)" || die "could not create $name"; ok "created $name → CNAME $PAGES_HOST" ;;
    esac
  done < <(printf '%s\n' "$plan" | grep -E '^(put|delete|create) ')
  ok "done — backup for deploy.sh dns-rollback: $bk"
  say "next: deploy.sh domains (until both are active), deploy.sh www-redirect, deploy.sh cutover"
}
cmd_dns_rollback() {
  need curl "API calls"; lock
  local z bk="${POS[0]:-}" now
  if [ -z "$bk" ]; then # the newest backup taken before a change whose apex did not point at Pages yet
    bk=$(PAGES="$PAGES_HOST" DNS_ZONE="$ZONE" python3 -c '
import glob, json, os, sys
for f in sorted(glob.glob(sys.argv[1] + "/dns-backup-*.json"), reverse=True):
    try: recs = json.load(open(f))
    except Exception: continue
    if not any(r.get("name") == os.environ["DNS_ZONE"] and r.get("type") == "CNAME" and r.get("content") == os.environ["PAGES"] for r in recs):
        print(f); break' "$LOG_DIR" || true)
  fi
  [ -n "$bk" ] && [ -f "$bk" ] || die "no DNS backup found (deploy.sh dns-rollback <build/deploy-logs/dns-backup-….json>)"
  z=$(zone_id)
  now="$LOG_DIR/dns-now-$TS.json"
  dapi GET "/zones/$z/dns_records?per_page=5000" | jget "import json, sys
if not d.get('success'): sys.exit(1)
json.dump(d['result'], open('$now', 'w'), indent=1)" || die "cannot read the DNS records"
  say "restore $ZONE and www.$ZONE (A/AAAA/CNAME only) from $bk"
  local plan
  plan=$(DNS_ZONE="$ZONE" python3 -c "$dns_guard_py"'
import json, sys
old = [r for r in json.load(open(sys.argv[1])) if ours(r)]
now = [r for r in json.load(open(sys.argv[2])) if ours(r)]
for name in NAMES:
    o = [r for r in old if r["name"] == name]
    n = [r for r in now if r["name"] == name]
    for i, r in enumerate(o):
        body = json.dumps({"type": r["type"], "name": name, "content": r["content"], "proxied": bool(r.get("proxied")), "ttl": r.get("ttl") or 1})
        if i < len(n): print("put\t%s\t%s\t%s" % (n[i]["id"], name, body))
        else: print("post\t-\t%s\t%s" % (name, body))
    for r in n[len(o):]:
        print("delete\t%s\t%s\t%s %s" % (r["id"], name, r["type"], r["content"]))
' "$bk" "$now")
  printf '%s\n' "$plan" | cut -f1,3,4 | sed 's/^/    /'
  confirm "Put these DNS records back?"
  local act id name body
  while IFS=$'\t' read -r act id name body; do
    case "$act" in
      put) dapi PUT "/zones/$z/dns_records/$id" "$body" | jget "import sys
sys.exit(0 if d.get('success') else 1)" || die "could not restore $name ($body)"; ok "$name ← $body" ;;
      post) dapi POST "/zones/$z/dns_records" "$body" | jget "import sys
sys.exit(0 if d.get('success') else 1)" || die "could not re-create $name ($body)"; ok "$name + $body" ;;
      delete) dapi DELETE "/zones/$z/dns_records/$id" | jget "import sys
sys.exit(0 if d.get('success') else 1)" || die "could not delete $id"; ok "removed $name $body" ;;
    esac
  done < <(printf '%s\n' "$plan")
}
cmd_www_redirect() { # Single Redirect www → apex (301, path + query kept) and Always Use HTTPS
  need curl "API calls"
  local z rs
  z=$(zone_id)
  say "www.$ZONE/* → https://$ZONE/… (301) and Always Use HTTPS"
  rs=$(api GET "/zones/$z/rulesets/phases/http_request_dynamic_redirect/entrypoint")
  local rule
  rule='{"description":"www to apex (madeinegyptgate deploy)","expression":"(http.host eq \"www.'"$ZONE"'\")","action":"redirect","action_parameters":{"from_value":{"status_code":301,"target_url":{"expression":"concat(\"https://'"$ZONE"'\", http.request.uri.path)"},"preserve_query_string":true}},"enabled":true}'
  if printf '%s' "$rs" | jget "import sys
sys.exit(0 if any('www.$ZONE' in (r.get('expression') or '') for r in (d.get('result') or {}).get('rules') or []) else 3)"; then
    ok "a redirect rule for www.$ZONE already exists"
  else
    confirm "Add the redirect rule www.$ZONE → https://$ZONE (301)?"
    local id; id=$(printf '%s' "$rs" | jget "print((d.get('result') or {}).get('id') or '')" || true)
    if [ -n "$id" ]; then
      api POST "/zones/$z/rulesets/$id/rules" "$rule" | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))" || die "could not add the rule (token needs Zone: Single Redirect: Edit) — or add it in the dashboard (README-DEPLOY.md section 6)"
    else
      api PUT "/zones/$z/rulesets/phases/http_request_dynamic_redirect/entrypoint" "{\"rules\":[$rule]}" | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))" || die "could not create the redirect rule (token needs Zone: Single Redirect: Edit) — or add it in the dashboard (README-DEPLOY.md section 6)"
    fi
    ok "redirect rule added"
  fi
  api PATCH "/zones/$z/settings/always_use_https" '{"value":"on"}' | jget "import sys
sys.exit(0 if d.get('success') else (print('  FAIL  %s' % d.get('errors')) or 1))" && ok "Always Use HTTPS: on" \
    || warn "could not switch on Always Use HTTPS (token needs Zone Settings: Edit) — SSL/TLS → Edge Certificates → Always Use HTTPS"
}

case "$CMD" in
  doctor) cmd_doctor ;;
  build) lock; cmd_build ;;
  stage) lock; cmd_stage ;;
  check) cmd_check ;;
  localtest) cmd_localtest ;;
  project) cmd_project ;;
  secrets) cmd_secrets ;;
  preview) cmd_preview ;;
  production) cmd_production ;;
  release) cmd_release ;;
  db) lock; cmd_db ;;
  worker) cmd_worker ;;
  domains) cmd_domains ;;
  dns) cmd_dns ;;
  dns-rollback) cmd_dns_rollback ;;
  www-redirect) cmd_www_redirect ;;
  routes) cmd_routes ;;
  cutover) cmd_cutover ;;
  cutover-rollback|legacy-restore) cmd_cutover_rollback ;;
  admin-release|admin-release-rollback) die "deploy 2 changes no route of $LEGACY_WORKER: the new Admin Control Center is https://$ZONE/admin/ (Pages) and the sign-in https://$ZONE/login/; /panel.html, /login.html and /api/index.php* stay on the old system (deploy/legacy-live.txt)" ;;
  worker-config) check_worker_config && ok "worker/wrangler.toml: bindings, routes and vars OK for deploy 2" ;;
  deployments) cmd_deployments ;;
  rollback) cmd_rollback ;;
  help|-h|--help) usage 0 ;;
  *) echo "unknown command: $CMD" >&2; usage 2 ;;
esac
