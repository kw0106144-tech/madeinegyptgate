#!/usr/bin/env bash
# deploy/ci/ci-site.sh — the site pipeline of madeinegyptgate.com: build → stage → CI patches → checks → Pages deploy
# → smoke test. GitHub Actions runs it (.github/workflows/deploy-site.yml); it runs the same way on any machine:
#
#   DRY_RUN=1 CI_WORK_DIR=/path/to/a/new/dir bash deploy/ci/ci-site.sh      # everything except the deploy
#
# Steps — each one stops the run on failure, and nothing is deployed unless every step before it passed:
#   1 tools       Python 3 + Pillow, Node >= 22.12, wrangler 4.164.0; the Cloudflare token (never printed; kept out of the
#                 environment of everything but wrangler pages deploy and the Cloudflare API calls, ci-lib.sh)
#   2 build       the published Control Center overlay (GET $LIVE/data/overlay.js) is reduced to data by
#                 deploy/ci/ci-overlay.py — the build never runs the downloaded file — then deploy/deploy.sh build into
#                 <work>/site bakes that copy in (the generator's validation must say «generator validation: 0 problem(s)»,
#                 _seo/overlay-baked.json must name the same overlay version). seo/lastmod.json is updated in a copy
#                 (<work>/lastmod.json), so the checkout stays exactly as committed
#   3 stage       deploy/stage.py stage → <work>/stage (STAGE-REPORT.json must have 0 errors)
#   4 CI patches  deploy/ci/ci-post-stage.py: carried live redirects, janna.html link-fix, the live SEO bundles
#   5 checks      edge unit tests (functions: npm test), wrangler pages project validate, Functions compile
#   6 deploy      cd <work>/stage && wrangler pages deploy site --project-name madeinegyptgate --branch main
#   7 smoke       the key pages → 200 on the new deployment, the deployment serves this build, deploy/smoke-test.sh on
#                 it, then the same key pages + build on https://madeinegyptgate.com. Key pages failing on the new
#                 deployment → automatic rollback to the deployment that was live before (CI_AUTO_ROLLBACK=0: off)
#
# Environment
#   DRY_RUN=1              steps 1–5 in full, then the key pages of the CURRENT live site (read-only); no deploy.
#                          In GitHub Actions a run that is not for refs/heads/main must be a dry run (ci_ref_guard)
#   CLOUDFLARE_API_TOKEN   needed for step 6 (GitHub secret). Missing or rejected → steps 1–5 run, then exit 3
#   CLOUDFLARE_ACCOUNT_ID  default 88c77c2b7595dd0ce510270175f69143
#   CI_WORK_DIR            work dir, wiped at the start (default $RUNNER_TEMP/migate-site, else <repo>/build/ci-site);
#                          only a dir made by deploy/ci (marker .migate-ci-work) or an empty one is ever wiped
#   CI_CLEAN=1             delete the work dir at the end (default: keep it for the logs and artifacts)
#   CI_AUTO_ROLLBACK=0     no automatic rollback
#   CI_FULL_SMOKE=0        skip deploy/smoke-test.sh after the deploy
#   CI_SMOKE_PATHS         the key pages (default: / /market/ /factories/ /governorates/cairo/ /factories/search/ /en/)
#   CI_ALLOW_NO_OVERLAY=1  deploy even when the published overlay could not be pulled (default: stop)
#   MIG_LIVE_URL           the live site (default https://madeinegyptgate.com); WRANGLER: wrangler command
#   MIG_OVERLAY_URL        the overlay to pull (default $MIG_LIVE_URL/data/overlay.js)
# Exit: 0 = deployed and checked (or the dry run passed), 1 = failed, 3 = built and checked but NOT deployed (token)
set -euo pipefail
CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/ci/ci-lib.sh
. "$CI_DIR/ci-lib.sh"

PROJECT="${PAGES_PROJECT:-madeinegyptgate}"
PROD_BRANCH="main"
read -r -a SMOKE_PATHS <<< "${CI_SMOKE_PATHS:-/ /market/ /factories/ /governorates/cairo/ /factories/search/ /en/}"
AUTO_ROLLBACK="${CI_AUTO_ROLLBACK:-1}"
FULL_SMOKE="${CI_FULL_SMOKE:-1}"
T0=$SECONDS
SHA="${GITHUB_SHA:-$(git -C "$REPO" rev-parse HEAD 2>/dev/null || true)}"
RESULT="failed" DEPLOY_URL="" DEPLOY_ID="" PREV_ID="" BUILT="" FILES="" SIZE="" PATCHES="" SMOKE="" ROLLBACK="" SUMMARY_DONE=0

write_summary() {
  [ "$SUMMARY_DONE" = 1 ] && return 0
  SUMMARY_DONE=1
  summary "## Site: madeinegyptgate.com" "" "| | |" "|---|---|" \
    "| Result | **$(md_escape "$RESULT")** |" \
    "| Live URL | $LIVE |" \
    "| Deployment | ${DEPLOY_URL:-none}${DEPLOY_ID:+ (id \`$DEPLOY_ID\`)} |" \
    "| Build | ${BUILT:-none} (\`/_seo/pages.json\` built) |" \
    "| Commit | $(sha_cell) |" \
    "| Upload | ${FILES:-?} files, ${SIZE:-?} |" \
    "| CI patches | $(md_escape "${PATCHES:-not reached}") |" \
    "| Smoke | $(md_escape "${SMOKE:-not reached}") |" \
    "| Live before | ${PREV_ID:-unknown} |" \
    "| Rollback | $(md_escape "${ROLLBACK:-not needed}") |" \
    "| Duration | $((SECONDS - T0)) s |"
  [ -n "${WORK:-}" ] && summary "" "Logs and reports: \`$WORK\` (uploaded as the workflow artifact *site-reports*)."
  return 0
}
# shellcheck disable=SC2329  # called by die() (ci-lib.sh)
ci_on_die() { RESULT="FAILED: $1"; write_summary; }

rollback() { # reason → rolls production back to the deployment live before this run (when known), then fails
  local why="$1"
  bad "$why"
  if [ "$AUTO_ROLLBACK" = 1 ] && [ -n "$PREV_ID" ] && [ "$PREV_ID" != "$DEPLOY_ID" ]; then
    say "automatic rollback: production → $PREV_ID (the deployment live before this run)"
    if cf_api POST "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/deployments/$PREV_ID/rollback" \
         | json_get "import sys; sys.exit(0 if d.get('success') else 1)"; then
      ROLLBACK="rolled back to $PREV_ID (the deployment live before this run)"
      ok "$ROLLBACK"; gh_output rolled_back 1
      key_pages "$LIVE" 3 10 "${SMOKE_PATHS[@]}" || warn "the live site still fails after the rollback:$KEY_FAILED"
    else
      ROLLBACK="automatic rollback FAILED: Cloudflare → Workers & Pages → $PROJECT → Deployments → $PREV_ID → Rollback"
      bad "$ROLLBACK"
    fi
  else
    ROLLBACK="not automatic (CI_AUTO_ROLLBACK=$AUTO_ROLLBACK, deployment live before: ${PREV_ID:-unknown}): deploy/deploy.sh rollback <id>"
  fi
  die "$why"
}

# ------------------------------------------------------------------------------------------------ 1 tools + token
WORK_DEFAULT="${RUNNER_TEMP:+$RUNNER_TEMP/migate-site}"
prepare_work "${CI_WORK_DIR:-${WORK_DEFAULT:-$REPO/build/ci-site}}"
SUMMARY_FILE="$WORK/SUMMARY.md"; : > "$SUMMARY_FILE"
gh_output work_dir "$WORK"
say "madeinegyptgate.com site pipeline — $([ "$DRY_RUN" = 1 ] && echo 'DRY RUN (no deploy)' || echo 'build + deploy'), commit ${SHA:-(not a git checkout)}, work dir $WORK"
[ "$DRY_RUN" = 1 ] || ci_ref_guard "or tick dry_run to only check this branch"
say "tools"
need python3 "the site build and deploy/stage.py"; need curl "the overlay pull and the smoke test"; need npm "the edge tests"
need_node
python3 -c 'import PIL' 2>/dev/null || die "Pillow is missing (python3 -m pip install -r deploy/ci/requirements.txt): the build crops product photos and company logos with it"
ok "$(python3 --version 2>&1), Pillow $(python3 -c 'import PIL; print(PIL.__version__)'), node $(node --version), npm $(npm --version)"
token_check
ensure_worker_deps
wrangler_init

# ------------------------------------------------------------------------------------------------ 2 build
OVERLAY_URL="${MIG_OVERLAY_URL:-$LIVE/data/overlay.js}"
OVL="$WORK/overlay.js" OVL_V=""
say "the published Control Center overlay: GET $OVERLAY_URL, reduced to data (the build never runs the downloaded file)"
if overlay_fetch "$OVERLAY_URL" "$OVL"; then
  ok "$OVERLAY_INFO"
  OVL_V=$(printf '%s' "$OVERLAY_INFO" | sed -nE 's/^overlay v=([^ ]*) .*/\1/p')
  # deploy.sh build "pulls" this local copy (file://) into build/overlay.js, and tools/dump-data.mjs reads it (MIG_OVERLAY_FILE)
  BUILD_OVL=(MIG_OVERLAY_URL="file://$OVL" MIG_OVERLAY_FILE="$OVL")
else
  m="the published Control Center overlay ($OVERLAY_URL) is not usable — $OVERLAY_WHY — so the pages would be built without the owner's published edits"
  if [ "$DRY_RUN" = 1 ] || [ "${CI_ALLOW_NO_OVERLAY:-0}" = 1 ]; then warn "$m"
  else die "$m. Run the workflow again in a few minutes (or set CI_ALLOW_NO_OVERLAY=1 to deploy anyway)"; fi
  BUILD_OVL=(MIG_OVERLAY_PULL=0 MIG_OVERLAY_FILE="$WORK/no-overlay.js")   # nothing baked in (never an older local copy)
fi
say "build: deploy/deploy.sh build → $WORK/site"
cp "$REPO/seo/lastmod.json" "$WORK/lastmod.json"
if ! (cd "$REPO" && env "${BUILD_OVL[@]}" MIG_BUILD_DIR="$WORK/site" MIG_FPROF_MEDIA_REBUILD=0 MIG_SEO_LASTMOD="$WORK/lastmod.json" \
        DEPLOY_LOG_DIR="$WORK/logs" bash deploy/deploy.sh build) 2>&1 | tee "$WORK/logs/build.out"; then
  die "the site build failed (output above; build log in $WORK/logs/)"
fi
grep -q 'generator validation: 0 problem(s)' "$WORK/logs/build.out" \
  || die "the build did not report «generator validation: 0 problem(s)» (build/seo-stats.json)"
if [ -n "$OVL_V" ] && [ "$OVL_V" != 0 ]; then
  baked=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("v") or "")' "$WORK/site/_seo/overlay-baked.json" 2>/dev/null || true)
  [ "$baked" = "$OVL_V" ] || die "the build baked overlay version '${baked:-none}' (site/_seo/overlay-baked.json), expected $OVL_V"
  ok "the published Control Center overlay is baked in (v $OVL_V)"
elif [ "$OVL_V" = 0 ]; then
  ok "the Worker serves an empty overlay (nothing published, or the overlay is switched off): nothing to bake in"
fi

# ------------------------------------------------------------------------------------------------ 3 stage
say "stage: deploy/stage.py stage → $WORK/stage"
if ! (cd "$REPO" && python3 deploy/stage.py stage --site "$WORK/site" --out "$WORK/stage" --repo "$REPO" \
        --functions "$REPO/functions" --config "$REPO/deploy/wrangler-pages.toml" \
        --exclude-file "$REPO/deploy/stage-exclude.txt" --seo-stats build/seo-stats.json \
        --max-files "${PAGES_MAX_FILES:-20000}") 2>&1 | tee "$WORK/logs/stage.out"; then
  die "the pre-deploy checks failed (deploy/stage.py: details above and in STAGE-REPORT.json)"
fi
STAGE_FACTS=$(python3 - "$WORK/stage/STAGE-REPORT.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1], encoding="utf-8"))
s = r.get("stats") or {}
print(len(r.get("errors") or []), s.get("files", "?"), str(s.get("size", "?")).replace(" ", ""))
PY
) || die "cannot read $WORK/stage/STAGE-REPORT.json"
read -r NERR FILES SIZE <<< "$STAGE_FACTS"
[ "$NERR" = 0 ] || die "STAGE-REPORT.json has $NERR error(s)"
BUILT=$(head -c 400 "$WORK/stage/site/_seo/pages.json" | grep -oE '"built": ?"[^"]+"' | grep -oE '[0-9]{4}-[0-9-]+T[0-9:]+Z' | head -n 1 || true)
[ -n "$BUILT" ] || die "the stage has no build time in site/_seo/pages.json"
ok "STAGE-REPORT.json: 0 errors; $FILES files ($SIZE); build $BUILT"

# ------------------------------------------------------------------------------------------------ 4 CI patches
say "CI patches: deploy/ci/ci-post-stage.py"
python3 "$CI_DIR/ci-post-stage.py" --stage "$WORK/stage" --live "$LIVE" 2>&1 | tee "$WORK/logs/post-stage.out" \
  || die "a CI patch could not be applied safely (above; $WORK/stage/CI-POST-STAGE.json) — nothing was deployed"
PATCHES=$(python3 - "$WORK/stage/CI-POST-STAGE.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1], encoding="utf-8"))
p = r.get("patches") or {}
c, j, b = p.get("carry_redirects") or {}, p.get("janna_link_fix") or {}, p.get("live_seo_bundles") or {}
added = ", ".join(a["name"] for a in b.get("added") or []) or "none needed"
print("redirects carried %s/%s; janna link-fix: %s; live SEO bundles kept: %s%s" % (
    c.get("added", 0), c.get("listed", 0), j.get("status", "?"), added,
    ("; %d warning(s)" % len(r.get("warnings") or [])) if r.get("warnings") else ""))
PY
) || PATCHES="see CI-POST-STAGE.json"
ok "$PATCHES"

# ------------------------------------------------------------------------------------------------ 5 checks
say "edge unit tests (functions: npm test — middleware, SEO admin API, auth parity with worker/src/auth.js)"
if (cd "$REPO/functions" && npm test) >"$WORK/logs/functions-test.log" 2>&1; then
  ok "$(grep -E '^# (tests|pass|fail) ' "$WORK/logs/functions-test.log" | tr '\n' ' ' | sed 's/# //g')"
else tail -n 40 "$WORK/logs/functions-test.log"; die "the edge unit tests failed (functions: npm test)"; fi
COMPAT=$(sed -nE 's/^compatibility_date *= *"([0-9-]+)".*/\1/p' "$WORK/stage/wrangler.toml" | head -n 1)
say "wrangler: validate the upload, compile the Functions (compatibility date ${COMPAT:-?})"
(cd "$WORK/stage" && wr pages project validate site) >"$WORK/logs/validate.log" 2>&1 \
  || { cat "$WORK/logs/validate.log"; die "wrangler pages project validate failed"; }
ok "wrangler pages project validate: OK"
(cd "$WORK/stage" && wr pages functions build functions --outdir "$WORK/functions-build" \
   --compatibility-date "${COMPAT:-2026-10-01}") >"$WORK/logs/functions-build.log" 2>&1 \
  || { tail -n 30 "$WORK/logs/functions-build.log"; die "the Pages Functions do not compile"; }
ok "Functions compile ($(du -sk "$WORK/functions-build" | cut -f1) KB)"

# ------------------------------------------------------------------------------------------------ dry run / no token
if [ "$DRY_RUN" = 1 ]; then
  say "DRY_RUN=1: NOT deploying. A real run would now execute, in $WORK/stage:"
  note "wrangler pages deploy site --project-name $PROJECT --branch $PROD_BRANCH --commit-dirty=true --commit-hash <sha> --commit-message <msg>"
  say "smoke (dry run): the key pages of the CURRENT live site, read-only"
  if key_pages "$LIVE" 2 5 "${SMOKE_PATHS[@]}"; then SMOKE="dry run: $KEY_PASSED key pages of the current live site → 200 (nothing deployed)"
  else SMOKE="dry run: current live site failed:$KEY_FAILED"; warn "$SMOKE"; fi
  RESULT="dry run passed: built, staged, patched and checked; nothing deployed"
  write_summary
  ok "$RESULT ($((SECONDS - T0)) s)"
  [ "${CI_CLEAN:-0}" = 1 ] && rm -rf "$WORK"
  exit 0
fi
if ! token_usable; then
  RESULT="NOT deployed: CLOUDFLARE_API_TOKEN is $TOKEN_STATE (the build and all checks passed)"
  token_help
  write_summary
  printf '%sERROR:%s %s\n' "$_R" "$_N" "$RESULT" >&2
  exit 3
fi

# ------------------------------------------------------------------------------------------------ 6 deploy
say "Pages project $PROJECT: the deployment that is live now (rollback target)"
proj=$(cf_api GET "/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT" || true)
if printf '%s' "$proj" | json_get "import sys; sys.exit(0 if d.get('success') else 1)"; then
  PREV_ID=$(printf '%s' "$proj" | json_get "print(((d.get('result') or {}).get('canonical_deployment') or {}).get('id') or '')" || true)
  if [ -n "$PREV_ID" ]; then ok "live now: deployment $PREV_ID"; else warn "the project has no live production deployment yet"; fi
else
  errs=$(printf '%s' "$proj" | json_get "print('; '.join('%s %s' % (e.get('code'), e.get('message')) for e in d.get('errors') or []))" || echo "no answer")
  die "the token cannot read the Pages project $PROJECT ($errs): it needs Account · Cloudflare Pages · Edit"
fi
CMSG=$(git -C "$REPO" log -1 --format=%s 2>/dev/null | python3 -c 'import sys, unicodedata
s = " ".join(sys.stdin.read().split())
print("".join(c for c in s if unicodedata.category(c)[0] != "C")[:120])' || true)
MSG="CI ${SHA:0:12}: ${CMSG:-site build} (build $BUILT, $FILES files)"
SHA_ARG=(); [ -n "$SHA" ] && SHA_ARG=(--commit-hash "$SHA")
OUTF="$WORK/logs/wrangler-pages-output.ndjson"; rm -f "$OUTF"
say "deploy: $WORK/stage/site → Pages $PROJECT, branch $PROD_BRANCH (production)"
if ! (cd "$WORK/stage" && WRANGLER_OUTPUT_FILE_PATH="$OUTF" wr_cf pages deploy site --project-name "$PROJECT" \
        --branch "$PROD_BRANCH" --commit-dirty=true --commit-message "$MSG" ${SHA_ARG[@]+"${SHA_ARG[@]}"}) 2>&1 \
     | tee "$WORK/logs/pages-deploy.log"; then
  die "wrangler pages deploy failed (above) — no new deployment, the live site is unchanged"
fi
DEPLOY_ID=$(wrangler_output_field "$OUTF" deployment_id)
DEPLOY_URL=$(wrangler_output_field "$OUTF" url)
if [ -z "$DEPLOY_URL" ]; then
  DEPLOY_URL=$(grep -oE 'Take a peek over at https://[a-z0-9.-]+\.pages\.dev' "$WORK/logs/pages-deploy.log" | tail -n 1 | sed 's/^Take a peek over at //' || true)
  [ -n "$DEPLOY_URL" ] || DEPLOY_URL=$(grep -oE 'https://[a-z0-9.-]+\.pages\.dev' "$WORK/logs/pages-deploy.log" | tail -n 1 || true)
fi
[ -n "$DEPLOY_URL" ] || die "the deployment URL is not in the wrangler output ($WORK/logs/pages-deploy.log)"
DEPLOY_URL="${DEPLOY_URL%/}"
gh_output deployment_url "$DEPLOY_URL"; gh_output deployment_id "$DEPLOY_ID"
ok "deployed: $DEPLOY_URL${DEPLOY_ID:+ (id $DEPLOY_ID)}"

# ------------------------------------------------------------------------------------------------ 7 smoke
say "smoke: key pages on the new deployment"
key_pages "$DEPLOY_URL" 5 6 "${SMOKE_PATHS[@]}" || rollback "key pages fail on the new deployment:$KEY_FAILED"
got=""
for _ in 1 2 3; do got=$(served_build "$DEPLOY_URL"); [ "$got" = "$BUILT" ] && break; sleep 5; done
[ "$got" = "$BUILT" ] || rollback "the new deployment serves build '${got:-none}', expected $BUILT"
ok "the new deployment serves this build ($BUILT)"
SMOKE="key pages 200 on the deployment"
FAILS=""
if [ "$FULL_SMOKE" = 1 ]; then
  say "deploy/smoke-test.sh on the new deployment (read-only; the Worker API is checked by deploy-worker)"
  if bash "$REPO/deploy/smoke-test.sh" --no-worker --env production --stage "$WORK/stage" -q "$DEPLOY_URL" 2>&1 \
       | tee "$WORK/logs/smoke-test.log"; then SMOKE="$SMOKE; smoke-test.sh passed"
  else SMOKE="$SMOKE; smoke-test.sh FAILED"; FAILS="$FAILS smoke-test.sh"; fi
fi
say "the live site $LIVE (custom domain)"
got="" KEY_CHALLENGED=""
for _ in $(seq 1 12); do got=$(served_build "$LIVE"); [ "$got" = "$BUILT" ] && break; sleep 10; done
if [ "$got" = "$BUILT" ]; then ok "$LIVE serves this build ($BUILT)"
elif [ -z "$got" ] && http_check "$LIVE/_seo/pages.json?ci=$(date +%s)" && [ "$HTTP_CODE" != 200 ] && [ "$HTTP_CHALLENGE" = 1 ]; then
  warn "$LIVE/_seo/pages.json → Cloudflare challenge for this runner (the zone's bot rules) — which build it serves is inconclusive"
  KEY_CHALLENGED="$KEY_CHALLENGED /_seo/pages.json"
else bad "$LIVE serves build '${got:-unreadable}' 2 minutes after the deploy, expected $BUILT"; FAILS="$FAILS live-build"; fi
CHALLENGED_BUILD="$KEY_CHALLENGED"
if key_pages "$LIVE" 3 10 "${SMOKE_PATHS[@]}"; then SMOKE="$SMOKE; key pages 200 on $LIVE"
else SMOKE="$SMOKE; $LIVE failed:$KEY_FAILED"; FAILS="$FAILS live-pages"; fi
KEY_CHALLENGED="${CHALLENGED_BUILD:-}$KEY_CHALLENGED"
[ -z "$KEY_CHALLENGED" ] || SMOKE="$SMOKE (Cloudflare challenge, inconclusive:$KEY_CHALLENGED)"
if [ -n "$FAILS" ]; then
  RESULT="deployed ($DEPLOY_URL) but checks FAILED:$FAILS — see the logs; to go back: deploy/deploy.sh rollback ${PREV_ID:-<id>}"
  write_summary
  printf '%sERROR:%s %s\n' "$_R" "$_N" "$RESULT" >&2
  _gha error "deployed, checks failed" "$RESULT"
  exit 1
fi
RESULT="live: $LIVE serves build $BUILT"
write_summary
ok "$RESULT ($((SECONDS - T0)) s)"
[ "${CI_CLEAN:-0}" = 1 ] && rm -rf "$WORK"
exit 0
