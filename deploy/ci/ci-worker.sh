#!/usr/bin/env bash
# deploy/ci/ci-worker.sh — the API Worker janna-lookup (/api/janna, /api/advisor, /api/auth, … on madeinegyptgate.com):
# config check → npm ci + tests → Janna's index → bundle → deploy → health. GitHub Actions runs it from
# .github/workflows/deploy-worker.yml; the same on any machine:
#
#   DRY_RUN=1 CI_WORK_DIR=/path/to/a/new/dir bash deploy/ci/ci-worker.sh       # everything except the deploy
#
# Steps — each one stops the run on failure:
#   1 tools       Node >= 22.12, Python 3; the Cloudflare token (never printed; only wrangler deploy / deployments /
#                 rollback get it, ci-lib.sh). In GitHub Actions only refs/heads/main may deploy (ci_ref_guard)
#   2 config      deploy/deploy.sh worker-config (read-only: D1 / R2 / KV bindings, one route per API family, no route
#                 over the owner's old admin of deploy/legacy-live.txt)
#   3 install     npm ci in worker/ (the lockfile pins wrangler 4.164.0 and postal-mime)
#   4 tests       worker: npm test; functions: npm test (the edge checks member sessions exactly like worker/src/auth.js)
#   5 index       the published Control Center overlay (GET $LIVE/data/overlay.js, reduced to data by
#                 deploy/ci/ci-overlay.py: the index build never runs the downloaded file) and the live clean-URL maps
#                 (GET $LIVE/_seo/hash/*.json), then from the repository root:
#                 node worker/build-index.js && node worker/build-items.js → worker/src/data.json + items.json
#                 (refused when a data file failed to load or a list shrank by more than half)
#   6 bundle      wrangler deploy --dry-run (bundles + validates, uploads nothing)
#   7 deploy      wrangler deploy in worker/. Its secrets stay in Cloudflare untouched. D1 migrations NEVER run here:
#                 they are the manual workflow .github/workflows/d1-migrate.yml
#   8 health      GET /api/<service>/health on the live site; janna, advisor, meetings, auth or inquiries failing →
#                 automatic rollback to the version that was live before (CI_AUTO_ROLLBACK=0: off)
#
# Environment: DRY_RUN=1 · CLOUDFLARE_API_TOKEN (missing → steps 1–6, exit 3) · CI_WORK_DIR (default
# $RUNNER_TEMP/migate-worker, else <repo>/build/ci-worker) · CI_AUTO_ROLLBACK=0 · CI_ALLOW_NO_OVERLAY=1 (index without the
# published overlay) · CI_ALLOW_INDEX_DROP=1 (accept a list that shrank by more than half) · MIG_LIVE_URL · WRANGLER ·
# MIG_OVERLAY_URL (default $MIG_LIVE_URL/data/overlay.js)
# Exit: 0 = deployed and healthy (or the dry run passed), 1 = failed, 3 = checked but NOT deployed (token)
# Note: step 5 rewrites worker/src/data.json and worker/src/items.json in the checkout (as deploy/deploy.sh worker does).
set -euo pipefail
CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/ci/ci-lib.sh
. "$CI_DIR/ci-lib.sh"

WORKER="janna-lookup"
CORE_SVCS=(janna advisor meetings auth inquiries)
SOFT_SVCS=(wa pay)
HASH_TYPES=(company opportunity winner project offer city)
AUTO_ROLLBACK="${CI_AUTO_ROLLBACK:-1}"
T0=$SECONDS
SHA="${GITHUB_SHA:-$(git -C "$REPO" rev-parse HEAD 2>/dev/null || true)}"
RESULT="failed" VERSION="" PREV_VERSION="" INDEX="" HEALTH="" ROLLBACK="" TARGETS="" SUMMARY_DONE=0

write_summary() {
  [ "$SUMMARY_DONE" = 1 ] && return 0
  SUMMARY_DONE=1
  summary "## Worker: $WORKER (API of madeinegyptgate.com)" "" "| | |" "|---|---|" \
    "| Result | **$(md_escape "$RESULT")** |" \
    "| Live URL | $LIVE/api/janna/health |" \
    "| Version | ${VERSION:-none} |" \
    "| Targets | $(md_escape "${TARGETS:-none}") |" \
    "| Version live before | ${PREV_VERSION:-unknown} |" \
    "| Janna index | $(md_escape "${INDEX:-not reached}") |" \
    "| Health | $(md_escape "${HEALTH:-not reached}") |" \
    "| Rollback | $(md_escape "${ROLLBACK:-not needed}") |" \
    "| Commit | $(sha_cell) |" \
    "| Duration | $((SECONDS - T0)) s |"
  return 0
}
# shellcheck disable=SC2329  # called by die() (ci-lib.sh)
ci_on_die() { RESULT="FAILED: $1"; write_summary; }

rollback() { # reason
  local why="$1"
  bad "$why"
  if [ "$AUTO_ROLLBACK" = 1 ] && [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "$VERSION" ]; then
    say "automatic rollback: $WORKER → version $PREV_VERSION (live before this run)"
    if (cd "$REPO/worker" && wr_cf rollback "$PREV_VERSION" --message "CI auto-rollback: health checks failed after ${SHA:0:12}" --yes) \
         >"$WORK/logs/rollback.log" 2>&1; then
      ROLLBACK="rolled back to version $PREV_VERSION"; ok "$ROLLBACK"
    else
      tail -n 20 "$WORK/logs/rollback.log"
      ROLLBACK="automatic rollback FAILED: cd worker && npx wrangler rollback $PREV_VERSION"; bad "$ROLLBACK"
    fi
  else
    ROLLBACK="not automatic (CI_AUTO_ROLLBACK=$AUTO_ROLLBACK, version live before: ${PREV_VERSION:-unknown}): cd worker && npx wrangler rollback"
  fi
  die "$why"
}

# health SVC → 0 healthy, 1 failing, 2 answered but not ready, 3 challenged (inconclusive). Body in $WORK/health.json
health() {
  local svc="$1" code
  code=$(curl -sS -o "$WORK/health.json" -D "$WORK/health.hdr" --max-time 30 -A "$UA_CI" -w '%{http_code}' \
           "$LIVE/api/$svc/health?ci=$(date +%s)" 2>/dev/null || true)
  HEALTH_CODE="${code:-000}"
  if grep -qi '^cf-mitigated: *challenge' "$WORK/health.hdr" 2>/dev/null; then return 3; fi
  if [ "$HEALTH_CODE" = 200 ] && grep -qE '"ok": ?true' "$WORK/health.json"; then return 0; fi
  if [ "$HEALTH_CODE" = 200 ]; then return 2; fi
  if [ "$HEALTH_CODE" = 403 ] && grep -qiE 'Just a moment|Attention Required|challenge-platform|cf-chl' "$WORK/health.json"; then return 3; fi
  return 1
}

# index_counts FILE → "f=… p=… t=… q=… o=… z=… i=…" (list sizes of worker/src/data.json)
index_counts() {
  python3 - "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print(" ".join("%s=%d" % (k, len(v)) for k, v in d.items() if isinstance(v, list)))
PY
}

# ------------------------------------------------------------------------------------------------ 1 tools + token
WORK_DEFAULT="${RUNNER_TEMP:+$RUNNER_TEMP/migate-worker}"
prepare_work "${CI_WORK_DIR:-${WORK_DEFAULT:-$REPO/build/ci-worker}}"
SUMMARY_FILE="$WORK/SUMMARY.md"; : > "$SUMMARY_FILE"
gh_output work_dir "$WORK"
say "Worker $WORKER pipeline — $([ "$DRY_RUN" = 1 ] && echo 'DRY RUN (no deploy)' || echo 'test + deploy'), commit ${SHA:-(not a git checkout)}, work dir $WORK"
[ "$DRY_RUN" = 1 ] || ci_ref_guard "or tick dry_run to only check this branch"
need python3 "deploy/deploy.sh worker-config"; need curl "the overlay pull and the health checks"; need npm "npm ci"
need_node
token_check

# ------------------------------------------------------------------------------------------------ 2 config
say "worker/wrangler.toml (deploy/deploy.sh worker-config, read-only)"
DEPLOY_LOG_DIR="$WORK/logs" bash "$REPO/deploy/deploy.sh" worker-config 2>&1 | tee "$WORK/logs/worker-config.out" \
  || die "worker/wrangler.toml is not deployable (above)"

# ------------------------------------------------------------------------------------------------ 3 install
say "npm ci in worker/"
(cd "$REPO/worker" && npm ci --no-audit --no-fund) >"$WORK/logs/npm-ci.log" 2>&1 \
  || { tail -n 30 "$WORK/logs/npm-ci.log"; die "npm ci failed in worker/"; }
ok "dependencies installed from worker/package-lock.json"
wrangler_init

# ------------------------------------------------------------------------------------------------ 4 tests
say "tests: worker (npm test)"
if (cd "$REPO/worker" && npm test) >"$WORK/logs/worker-test.log" 2>&1; then
  ok "$(grep -E '^# (tests|pass|fail) ' "$WORK/logs/worker-test.log" | tr '\n' ' ' | sed 's/# //g')"
else tail -n 60 "$WORK/logs/worker-test.log"; die "the Worker tests failed — nothing was deployed"; fi
say "tests: functions (npm test — the edge's session check must match worker/src/auth.js)"
if (cd "$REPO/functions" && npm test) >"$WORK/logs/functions-test.log" 2>&1; then
  ok "$(grep -E '^# (tests|pass|fail) ' "$WORK/logs/functions-test.log" | tr '\n' ' ' | sed 's/# //g')"
else tail -n 40 "$WORK/logs/functions-test.log"; die "the edge unit tests failed (functions: npm test) — nothing was deployed"; fi

# ------------------------------------------------------------------------------------------------ 5 index
say "Janna's index: the published overlay and the live clean-URL maps (read-only GETs of $LIVE)"
OVERLAY_URL="${MIG_OVERLAY_URL:-$LIVE/data/overlay.js}"
OVL="$WORK/overlay.js"
if overlay_fetch "$OVERLAY_URL" "$OVL"; then
  ok "overlay: $OVERLAY_URL → $OVERLAY_INFO (data only; the downloaded file itself is never run)"
else
  m="the published overlay $OVERLAY_URL is not usable — $OVERLAY_WHY — so Janna's index would ignore the owner's published edits (hidden rows would come back)"
  if [ "$DRY_RUN" = 1 ] || [ "${CI_ALLOW_NO_OVERLAY:-0}" = 1 ]; then warn "$m"; else die "$m. Run the workflow again later (or CI_ALLOW_NO_OVERLAY=1)"; fi
  OVL="$WORK/no-overlay.js"          # does not exist: nothing is applied (never an older build/overlay.js of the checkout)
fi
mkdir -p "$WORK/site-maps/_seo/hash"
nmaps=0
for t in "${HASH_TYPES[@]}"; do
  f="$WORK/site-maps/_seo/hash/$t.json"
  if curl -fsS --compressed --max-time 30 -A "$UA_CI" "$LIVE/_seo/hash/$t.json" -o "$f.tmp" 2>/dev/null \
     && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if isinstance(d, dict) and d else 1)' "$f.tmp" 2>/dev/null; then
    mv -f "$f.tmp" "$f"; nmaps=$((nmaps + 1))
  else rm -f "$f.tmp"; warn "live map /_seo/hash/$t.json not available: those items keep their shim links (the site resolves them)"; fi
done
ok "clean-URL maps from the live site: $nmaps of ${#HASH_TYPES[@]}"
# build-items.js links an RFQ to its static page only when <site>/rfq/<slug>/index.html exists: mirror the live page
# list (/_seo/pages.json rows) as empty placeholder files, so the links match the pages visitors can open
if curl -fsS --compressed --max-time 90 -A "$UA_CI" "$LIVE/_seo/pages.json?ci=$(date +%s)" -o "$WORK/pages.json" 2>"$WORK/logs/pages-json.err" \
   && npages=$(python3 - "$WORK/pages.json" "$WORK/site-maps" <<'PY2'
import json, os, sys, unicodedata
d = json.load(open(sys.argv[1], encoding="utf-8"))
root = os.path.realpath(sys.argv[2])
n = 0
for r in d.get("rows") or []:
    p = unicodedata.normalize("NFC", str(r.get("p") or ""))
    if not p.startswith("/") or not p.endswith("/") or "\\" in p or "\x00" in p or ".." in p.split("/"):
        continue
    dst = os.path.normpath(os.path.join(root, p.strip("/"), "index.html"))
    if not dst.startswith(root + os.sep):
        continue
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w").close()
    n += 1
if not n:
    sys.exit(1)
print(n)
PY2
); then ok "live page list: $npages pages (/_seo/pages.json → placeholders for build-items.js)"
else warn "could not read $LIVE/_seo/pages.json: RFQs keep their /rfq/search/#<id> links"; fi
rm -f "$WORK/pages.json"
BEFORE=$(index_counts "$REPO/worker/src/data.json" 2>/dev/null || true)
say "node worker/build-index.js && node worker/build-items.js (repository root)"
export MIG_SITE_DIR="$WORK/site-maps" MIG_OVERLAY_FILE="$OVL"
(cd "$REPO" && node worker/build-index.js && node worker/build-items.js) >"$WORK/logs/index.out" 2>"$WORK/logs/index.err" \
  || { cat "$WORK/logs/index.out" "$WORK/logs/index.err"; die "building Janna's index failed"; }
cat "$WORK/logs/index.out"
if [ -s "$WORK/logs/index.err" ]; then
  cat "$WORK/logs/index.err"
  die "a data file or the overlay failed to load while building Janna's index (above) — the index would be incomplete"
fi
AFTER=$(index_counts "$REPO/worker/src/data.json") || die "worker/src/data.json is not valid JSON after the index build"
python3 - "$BEFORE" "$AFTER" "${CI_ALLOW_INDEX_DROP:-0}" <<'PY' || die "Janna's index shrank by more than half (above) — a data file is probably broken (CI_ALLOW_INDEX_DROP=1 to accept)"
import sys
before = dict(x.split("=") for x in sys.argv[1].split() if "=" in x)
after = dict(x.split("=") for x in sys.argv[2].split() if "=" in x)
bad = [k for k, v in before.items() if int(v) >= 20 and int(after.get(k, 0)) < int(v) / 2]
for k in bad:
    print("  FAIL  list %s: %s → %s entries" % (k, before[k], after.get(k, 0)))
sys.exit(1 if bad and sys.argv[3] != "1" else 0)
PY
INDEX="$AFTER (committed: ${BEFORE:-none})"
ok "index: $AFTER"

# ------------------------------------------------------------------------------------------------ 6 bundle
say "wrangler deploy --dry-run (bundle + config validation, nothing uploaded)"
(cd "$REPO/worker" && wr deploy --dry-run --outdir "$WORK/worker-dist") >"$WORK/logs/bundle.log" 2>&1 \
  || { tail -n 40 "$WORK/logs/bundle.log"; die "the Worker does not bundle"; }
ok "bundle: $(du -sk "$WORK/worker-dist" | cut -f1) KB ($(grep -oE 'Total Upload: [^\n]*' "$WORK/logs/bundle.log" | head -n 1 || true))"

if [ "$DRY_RUN" = 1 ]; then
  say "DRY_RUN=1: NOT deploying (a real run would now execute: cd worker && wrangler deploy)"
  RESULT="dry run passed: config, tests, index and bundle OK; nothing deployed"
  write_summary; ok "$RESULT ($((SECONDS - T0)) s)"
  [ "${CI_CLEAN:-0}" = 1 ] && rm -rf "$WORK"
  exit 0
fi
if ! token_usable; then
  RESULT="NOT deployed: CLOUDFLARE_API_TOKEN is $TOKEN_STATE (tests, index and bundle passed)"
  token_help; write_summary
  printf '%sERROR:%s %s\n' "$_R" "$_N" "$RESULT" >&2
  exit 3
fi

# ------------------------------------------------------------------------------------------------ 7 deploy
say "the version that is live now (rollback target)"
PREV_VERSION=$( (cd "$REPO/worker" && wr_cf deployments status --json) 2>/dev/null | json_get "
v = sorted(d.get('versions') or [], key=lambda x: -(x.get('percentage') or 0))
print(v[0].get('version_id') if v else '')" || true)
if [ -n "$PREV_VERSION" ]; then ok "live now: version $PREV_VERSION"; else warn "could not read the live version (first deploy?) — no automatic rollback possible"; fi
OUTF="$WORK/logs/wrangler-output.ndjson"; rm -f "$OUTF"
say "wrangler deploy ($WORKER)"
if ! (cd "$REPO/worker" && WRANGLER_OUTPUT_FILE_PATH="$OUTF" wr_cf deploy) 2>&1 | tee "$WORK/logs/deploy.log"; then
  die "wrangler deploy failed (above) — the version live before keeps running"
fi
VERSION=$(wrangler_output_field "$OUTF" version_id)
TARGETS=$(wrangler_output_field "$OUTF" targets | python3 -c 'import json,sys
try: t = json.loads(sys.stdin.read() or "[]")
except ValueError: t = []
print(" ".join(t[:3]) + (" … (%d)" % len(t) if len(t) > 3 else ""))' 2>/dev/null || true)
[ -n "$VERSION" ] || VERSION=$(grep -oE 'Current Version ID: [0-9a-f-]+' "$WORK/logs/deploy.log" | tail -n 1 | sed 's/.*: //' || true)
gh_output version_id "$VERSION"
ok "deployed: version ${VERSION:-?}"

# ------------------------------------------------------------------------------------------------ 8 health
say "health of the live API ($LIVE/api/<service>/health, read-only)"
FAILED="" NOTREADY="" CHALL=""
for svc in "${CORE_SVCS[@]}" "${SOFT_SVCS[@]}"; do
  tries=5; case " ${SOFT_SVCS[*]} " in *" $svc "*) tries=1 ;; esac     # optional services: one try
  rc=1
  for i in $(seq 1 "$tries"); do
    set +e; health "$svc"; rc=$?; set -e
    if [ "$rc" != 1 ]; then break; fi                                   # answered (ok / not ready / challenged)
    if [ "$i" -lt "$tries" ]; then sleep 6; fi
  done
  case "$rc" in
    0) ok "/api/$svc/health → ok" ;;
    2) warn "/api/$svc/health → 200 but not ready: $(head -c 200 "$WORK/health.json" | tr '\n' ' ') (secrets / D1)"; NOTREADY="$NOTREADY $svc" ;;
    3) warn "/api/$svc/health → $HEALTH_CODE Cloudflare challenge (the zone's bot rules) — inconclusive"; CHALL="$CHALL $svc" ;;
    *) case " ${CORE_SVCS[*]} " in
         *" $svc "*) bad "/api/$svc/health → $HEALTH_CODE $(head -c 160 "$WORK/health.json" 2>/dev/null | tr '\n' ' ')"; FAILED="$FAILED $svc" ;;
         *) warn "/api/$svc/health → $HEALTH_CODE (optional service)"; NOTREADY="$NOTREADY $svc" ;;
       esac ;;
  esac
done
HEALTH="$((${#CORE_SVCS[@]} + ${#SOFT_SVCS[@]})) checked${FAILED:+; FAILED:$FAILED}${NOTREADY:+; not ready:$NOTREADY}${CHALL:+; challenged:$CHALL}"
[ -z "$FAILED" ] || rollback "the live API fails after the deploy:$FAILED"
jd=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("v",""))' "$REPO/worker/src/data.json" 2>/dev/null || true)
if health janna; then
  live_d=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("data",""))' "$WORK/health.json" 2>/dev/null || true)
  if [ -n "$jd" ] && [ "$live_d" = "$jd" ]; then ok "/api/janna/health serves the new index ($jd)"
  else warn "/api/janna/health reports index '${live_d:-?}', the new one is '$jd' (an isolate may still run the old version)"; fi
fi
RESULT="live: version ${VERSION:-?} answers the API on $LIVE"
write_summary
ok "$RESULT ($((SECONDS - T0)) s)"
[ "${CI_CLEAN:-0}" = 1 ] && rm -rf "$WORK"
exit 0
