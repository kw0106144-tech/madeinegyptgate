# shellcheck shell=bash
# deploy/ci/ci-lib.sh — helpers shared by deploy/ci/ci-*.sh (sourced, never run on its own).
# Nothing here prints a secret. The Cloudflare token is taken out of the environment as soon as this file is sourced and kept
# in a shell variable that is not exported, so the build, the tests, npm and node never see it; only the commands that need
# it get it: curl through stdin (cf_api: never argv, never the log) and wrangler through its own environment (wr_cf).
# GitHub additionally masks every secret in the log.

CI_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$CI_LIB_DIR/../.." && pwd)"   # always the checkout this script lives in (never an inherited $REPO)
WORK=""
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-88c77c2b7595dd0ce510270175f69143}"
export WRANGLER_SEND_METRICS=false
export WRANGLER_VERSION="${WRANGLER_VERSION:-4.164.0}"
CF_API="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"   # CF_API_BASE: a mock API for tests only (as in deploy.sh)
LIVE="${MIG_LIVE_URL:-https://madeinegyptgate.com}"
LIVE="${LIVE%/}"
DRY_RUN="${DRY_RUN:-0}"
case "$DRY_RUN" in 1|true|yes) DRY_RUN=1 ;; *) DRY_RUN=0 ;; esac
IN_GHA=0; [ "${GITHUB_ACTIONS:-}" = true ] && IN_GHA=1
_CF_TOKEN="${CLOUDFLARE_API_TOKEN:-}"     # not exported: child processes do not inherit it
unset CLOUDFLARE_API_TOKEN
UA_CI="migate-ci/1.0 (deploy check)"

if [ -t 1 ]; then _B=$'\033[1m' _R=$'\033[31m' _G=$'\033[32m' _Y=$'\033[33m' _N=$'\033[0m'; else _B="" _R="" _G="" _Y="" _N=""; fi
say()  { printf '%s==>%s %s\n' "$_B" "$_N" "$*"; }
ok()   { printf '  %sOK%s    %s\n' "$_G" "$_N" "$*"; }
note() { printf '        %s\n' "$*"; }
# GitHub annotations: one line, no newlines (they would end the command)
_gha() { # level title message — workflow-command escaping: % CR LF
  [ "$IN_GHA" = 1 ] || return 0
  local k="$1" t="$2" m; shift 2
  m="$*"; m="${m//'%'/%25}"; m="${m//$'\r'/%0D}"; m="${m//$'\n'/%0A}"
  printf '::%s title=%s::%s\n' "$k" "$t" "$m"
}
warn() { printf '  %sWARN%s  %s\n' "$_Y" "$_N" "$*"; _gha warning "CI warning" "$*"; }
bad()  { printf '  %sFAIL%s  %s\n' "$_R" "$_N" "$*"; }
die()  { printf '%sERROR:%s %s\n' "$_R" "$_N" "$*" >&2; _gha error "CI failed" "$*"; ci_on_die "$*"; exit 1; }
ci_on_die() { :; }   # a script may redefine it (e.g. to write the job summary before exiting)

# job summary (GitHub step summary + <work>/SUMMARY.md); SUMMARY_FILE is set by the script once its work dir exists
summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$@" >> "$GITHUB_STEP_SUMMARY"
  [ -n "${SUMMARY_FILE:-}" ] && printf '%s\n' "$@" >> "$SUMMARY_FILE"
  return 0
}
gh_output() { [ -n "${GITHUB_OUTPUT:-}" ] && printf '%s=%s\n' "$1" "$(printf '%s' "$2" | tr '\n' ' ')" >> "$GITHUB_OUTPUT"; return 0; }
md_escape() { local s="${1//$'\n'/ }"; s="${s//|/ }"; s="${s//\`/ }"; printf '%s' "${s:0:240}"; }
# shellcheck disable=SC2016  # literal backticks (markdown code)
sha_cell() { if [ -n "${SHA:-}" ]; then printf '`%s`' "${SHA:0:12}"; else printf 'none (not a git checkout)'; fi; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required ($2)"; }
need_node() {
  need node "wrangler $WRANGLER_VERSION and the tests"
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)' \
    || die "Node $(node --version) is too old: wrangler $WRANGLER_VERSION and the tests need Node >= 22.12"
}

# worker/node_modules from worker/package-lock.json: the pinned wrangler, and postal-mime, which the edge's auth parity
# test needs (functions/_tests imports worker/src/auth.js). npm ci only when it is missing (CI_FORCE_NPM_CI=1: always).
ensure_worker_deps() {
  if [ "${CI_FORCE_NPM_CI:-0}" != 1 ] && [ -d "$REPO/worker/node_modules/postal-mime" ] && [ -x "$REPO/worker/node_modules/.bin/wrangler" ]; then
    ok "worker/node_modules present (wrangler, postal-mime)"; return 0
  fi
  say "npm ci in worker/ (wrangler $WRANGLER_VERSION and postal-mime, from worker/package-lock.json)"
  (cd "$REPO/worker" && npm ci --no-audit --no-fund) >"${WORK:-/tmp}/logs/npm-ci-worker.log" 2>&1 \
    || { tail -n 30 "${WORK:-/tmp}/logs/npm-ci-worker.log"; die "npm ci failed in worker/"; }
  ok "worker/node_modules installed from the lockfile"
}
# wrangler: $WRANGLER, else the lockfile-pinned copy in worker/node_modules (npm ci in worker/), else npx wrangler@pin.
# wr = without the token (version, validate, bundles, --dry-run); wr_cf = with it (deploy, rollback, deployments, d1)
wrangler_init() {
  if [ -n "${WRANGLER:-}" ]; then read -r -a WR <<< "$WRANGLER"
  elif [ -x "$REPO/worker/node_modules/.bin/wrangler" ]; then WR=("$REPO/worker/node_modules/.bin/wrangler")
  else WR=(npx --yes "wrangler@$WRANGLER_VERSION"); fi
  local v; v=$("${WR[@]}" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)
  [ -n "$v" ] || die "wrangler is not runnable: ${WR[*]}"
  [ "$v" = "$WRANGLER_VERSION" ] || die "wrangler $v found (${WR[*]}), the deploys are pinned to $WRANGLER_VERSION"
  ok "wrangler $v (${WR[*]})"
}
wr() { "${WR[@]}" "$@"; }
wr_cf() { CLOUDFLARE_API_TOKEN="$_CF_TOKEN" "${WR[@]}" "$@"; }

# GitHub Actions: only main deploys or touches Cloudflare. «Run workflow» can start any branch or tag (unreviewed code):
# such a run may only check (dry run); the workflows also give it no token.
ci_ref_guard() { # [extra hint]
  [ "$IN_GHA" = 1 ] || return 0
  [ "${GITHUB_REF:-}" = refs/heads/main ] && return 0
  die "this run is for ${GITHUB_REF:-an unknown ref}, and only main deploys or changes Cloudflare. Start it from main (Run workflow → «Use workflow from» → main)${1:+, $1}"
}

# overlay_fetch URL OUT → 0 with OUT = the published Control Center overlay reduced to data (deploy/ci/ci-overlay.py: the
# downloaded file itself is never run); OVERLAY_INFO = "overlay v=… at=… bytes=…". 1 → OVERLAY_WHY says why, OUT removed
# shellcheck disable=SC2034  # OVERLAY_INFO / OVERLAY_WHY are read by the scripts that source this file
overlay_fetch() {
  local url="$1" out="$2" res
  OVERLAY_INFO="" OVERLAY_WHY=""
  rm -f "$out"
  if res=$(python3 -I "$CI_LIB_DIR/ci-overlay.py" --url "$url" --out "$out" 2>&1); then
    { printf '%s\n' "$res" | grep '^ci-overlay: note:' || true; } | while IFS= read -r l; do warn "${l#ci-overlay: note: }"; done
    OVERLAY_INFO=$(printf '%s\n' "$res" | tail -n 1)
    [ -s "$out" ] && return 0
    OVERLAY_WHY="ci-overlay.py wrote no file"
  else
    OVERLAY_WHY=$(printf '%s' "$res" | tail -n 3 | tr '\n' ' ' | sed 's/^ci-overlay: NOT usable: //')
  fi
  rm -f "$out"
  return 1
}

# work dir: dedicated, wiped at start, marked so a second run may wipe it again (never anything else)
prepare_work() { # dir
  local w="$1" parent
  [ -n "$w" ] || die "no work dir"
  parent="$(dirname "$w")"; mkdir -p "$parent"
  w="$(cd "$parent" && pwd)/$(basename "$w")"
  case "$w" in /|/tmp|/home|/root|"$HOME"|"$REPO"|"$REPO/site"|"$REPO/build"|"$REPO/deploy"*) die "CI_WORK_DIR must be a dedicated directory, not $w" ;; esac
  case "$REPO/" in "$w"/*) die "CI_WORK_DIR ($w) must not contain the repository" ;; esac
  if [ -e "$w" ] && [ -n "$(ls -A "$w" 2>/dev/null)" ] && [ ! -f "$w/.migate-ci-work" ]; then
    die "$w is not empty and was not made by deploy/ci (no .migate-ci-work marker) — refusing to wipe it"
  fi
  rm -rf "$w"; mkdir -p "$w/logs"
  printf 'deploy/ci work dir, %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$w/.migate-ci-work"
  WORK="$w"
}

# ---------------------------------------------------------------------------------------------------- Cloudflare token
# TOKEN_STATE: dry-run | missing | ok | rejected | unverified
token_check() {
  if [ "$DRY_RUN" = 1 ]; then TOKEN_STATE=dry-run; ok "DRY_RUN=1: everything except the deploy (no Cloudflare token needed)"; return 0; fi
  if [ -z "$_CF_TOKEN" ] || [ -z "$(printf '%s' "$_CF_TOKEN" | tr -d '[:space:]')" ]; then
    TOKEN_STATE=missing
    printf '  %sFAIL%s  CLOUDFLARE_API_TOKEN is not set: the checks still run, but nothing is deployed or changed in Cloudflare\n' "$_R" "$_N"
    _gha error "CLOUDFLARE_API_TOKEN missing" "The repository secret CLOUDFLARE_API_TOKEN is not set, so nothing will be deployed. Add it: GitHub repo → Settings → Secrets and variables → Actions → New repository secret (name CLOUDFLARE_API_TOKEN). Cloudflare token: template «Edit Cloudflare Workers» + Account: Cloudflare Pages Edit + Account: D1 Edit, account 88c77c2b7595dd0ce510270175f69143. Then re-run this workflow."
    return 0
  fi
  local r
  r=$(cf_api GET "/user/tokens/verify" 2>/dev/null | json_get "print('active' if d.get('success') and (d.get('result') or {}).get('status') == 'active' else 'no')" || true)
  [ "$r" = active ] || r=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" 2>/dev/null \
                            | json_get "print('active' if d.get('success') and (d.get('result') or {}).get('status') == 'active' else 'no')" || true)
  case "$r" in
    active) TOKEN_STATE=ok; ok "CLOUDFLARE_API_TOKEN is set and active (value never printed)" ;;
    no) TOKEN_STATE=rejected
        printf '  %sFAIL%s  Cloudflare rejects CLOUDFLARE_API_TOKEN (invalid, expired or revoked): nothing is deployed or changed\n' "$_R" "$_N"
        _gha error "CLOUDFLARE_API_TOKEN rejected" "Cloudflare does not accept the CLOUDFLARE_API_TOKEN secret (invalid, expired or revoked). Create a new token (template «Edit Cloudflare Workers» + Cloudflare Pages Edit + D1 Edit) and replace the repository secret." ;;
    *) TOKEN_STATE=unverified; warn "could not verify CLOUDFLARE_API_TOKEN (Cloudflare API not reachable?) — wrangler will tell" ;;
  esac
  return 0
}
token_usable() { [ "${TOKEN_STATE:-}" = ok ] || [ "${TOKEN_STATE:-}" = unverified ]; }
token_help() { # [what did not happen, default "Not deployed"]
  summary "" "**${1:-Not deployed}: the Cloudflare token is ${TOKEN_STATE}.** Add or replace the repository secret" \
    "\`CLOUDFLARE_API_TOKEN\` (GitHub → Settings → Secrets and variables → Actions). Cloudflare → My Profile → API Tokens →" \
    "Create Token → template «Edit Cloudflare Workers», add *Account · Cloudflare Pages · Edit* and *Account · D1 · Edit*," \
    "account \`$CLOUDFLARE_ACCOUNT_ID\`. Then run this workflow again (Actions → the workflow → Run workflow)."
}

# Cloudflare API (GET/POST to api.cloudflare.com, never to the site): the Authorization header is read from stdin
cf_api() { # METHOD PATH [json-body] → JSON on stdout
  local m="$1" p="$2" body="${3:-}"
  [ -n "$_CF_TOKEN" ] || return 1
  printf 'Authorization: Bearer %s\n' "$_CF_TOKEN" \
    | curl -sS --max-time 60 --retry 2 --retry-delay 2 -X "$m" -H @- -H "Content-Type: application/json" \
           ${body:+--data "$body"} "$CF_API$p"
}
# wrangler_output_field FILE FIELD → FIELD of the last pages-deploy / deploy entry wrangler wrote to
# WRANGLER_OUTPUT_FILE_PATH (ND-JSON); empty when absent
wrangler_output_field() {
  python3 - "$1" "$2" <<'PY' 2>/dev/null || true
import json, sys
val = ""
try:
    for line in open(sys.argv[1], encoding="utf-8"):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") in ("pages-deploy-detailed", "pages-deploy", "deploy") and d.get(sys.argv[2]):
            val = d[sys.argv[2]]
except OSError:
    pass
print(val if isinstance(val, str) else json.dumps(val))
PY
}
# parse the first JSON value on stdin (tools may print notices around it) and run $1 with it as d
json_get() {
  python3 -c "import json,sys
t=sys.stdin.read(); i=[k for k in (t.find('['), t.find('{')) if k >= 0]
try: d=json.JSONDecoder().raw_decode(t[min(i):])[0] if i else None
except Exception: d=None
if d is None: sys.exit(1)
$1"
}

# ---------------------------------------------------------------------------------------------------- read-only HTTP checks
# http_check URL → HTTP_CODE (status of a GET, no redirects followed; 000 = unreachable) and HTTP_CHALLENGE=1 when
# Cloudflare's bot protection answered (a challenge / block page of the zone in front of the site, not the deployment).
# Call it directly (never inside $(...)): it sets the two variables in the calling shell.
HTTP_CODE=000 HTTP_CHALLENGE=0
http_check() {
  local h b
  h=$(mktemp "${WORK:-${TMPDIR:-/tmp}}/.hdr.XXXXXX"); b="$h.body"
  HTTP_CODE=$(curl -sS -o "$b" -D "$h" --max-time 30 -A "$UA_CI" -w '%{http_code}' "$1" 2>/dev/null || true)
  HTTP_CODE="${HTTP_CODE:-000}" HTTP_CHALLENGE=0
  if grep -qi '^cf-mitigated: *challenge' "$h" 2>/dev/null; then HTTP_CHALLENGE=1
  elif [ "$HTTP_CODE" = 403 ] || [ "$HTTP_CODE" = 503 ]; then
    if grep -qiE 'Just a moment|Attention Required|challenge-platform|cf-chl|cf-error-details' "$b" 2>/dev/null; then HTTP_CHALLENGE=1; fi
  fi
  rm -f "$h" "$b"
  return 0
}
# key_pages BASE TRIES SLEEP PATH… → 0 when every PATH answered 200 (each path retried up to TRIES times);
# KEY_FAILED / KEY_CHALLENGED hold the paths that did not
key_pages() {
  local base="${1%/}" tries="$2" pause="$3" p i code
  shift 3
  KEY_FAILED="" KEY_CHALLENGED="" KEY_PASSED=0
  for p in "$@"; do
    for i in $(seq 1 "$tries"); do
      http_check "$base$p"; code="$HTTP_CODE"
      [ "$code" = 200 ] && break
      [ "$HTTP_CHALLENGE" = 1 ] && break
      [ "$i" -lt "$tries" ] && sleep "$pause"
    done
    if [ "$code" = 200 ]; then ok "$base$p → 200"; KEY_PASSED=$((KEY_PASSED + 1))
    elif [ "$HTTP_CHALLENGE" = 1 ]; then warn "$base$p → $code Cloudflare challenge (the zone's bot rules, not the site) — inconclusive"; KEY_CHALLENGED="$KEY_CHALLENGED $p"
    else bad "$base$p → $code (expected 200)"; KEY_FAILED="$KEY_FAILED $p"; fi
  done
  [ -z "$KEY_FAILED" ]
}
# build time a site serves (/_seo/pages.json "built"); the query string only bypasses caches
served_build() { # BASE
  curl -sS --compressed --max-time 30 -A "$UA_CI" "${1%/}/_seo/pages.json?ci=$(date +%s)" 2>/dev/null | head -c 600 \
    | grep -oE '"built": ?"[^"]+"' | grep -oE '[0-9]{4}-[0-9-]+T[0-9:]+Z' | head -n 1 || true
}
