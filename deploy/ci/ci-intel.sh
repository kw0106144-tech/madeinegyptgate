#!/usr/bin/env bash
# deploy/ci/ci-intel.sh — the intelligence Worker migate-intel (worker-intel/: /intel/ and /api/intel/* of
# madeinegyptgate.com, cron pipeline): install → tests → bundle → deploy → health. GitHub Actions runs it from
# .github/workflows/deploy-intel.yml; the same on any machine:
#
#   DRY_RUN=1 CI_WORK_DIR=/path/to/a/new/dir bash deploy/ci/ci-intel.sh        # everything except the deploy
#
# Steps — each one stops the run on failure:
#   1 tools      Node >= 22.12; the Cloudflare token (never printed; only wrangler deploy / deployments / rollback get it,
#                ci-lib.sh); wrangler 4.164.0 (worker/package-lock.json). In GitHub Actions only refs/heads/main may deploy
#   2 install    npm ci in worker-intel/ when it has a package-lock.json (today it has no dependencies and no lockfile:
#                nothing to install — npm ci would refuse to run without a lockfile)
#   3 tests      worker-intel: npm test
#   4 bundle     wrangler deploy --dry-run (bundles + validates, uploads nothing)
#   5 deploy     wrangler deploy in worker-intel/. Its secret (PLATFORM_KEY) stays in Cloudflare; its routes on the zone
#                are attached outside worker-intel/wrangler.toml and wrangler leaves them alone (no routes in the file).
#                The D1 database migate-intel is never migrated here.
#   6 health     GET $LIVE/api/intel/health and $LIVE/intel/ → 200; failing → automatic rollback to the version live
#                before (CI_AUTO_ROLLBACK=0: off)
# Environment: DRY_RUN=1 · CLOUDFLARE_API_TOKEN (missing → steps 1–4, exit 3) · CI_WORK_DIR (default
# $RUNNER_TEMP/migate-intel, else <repo>/build/ci-intel) · CI_AUTO_ROLLBACK=0 · MIG_LIVE_URL · WRANGLER
# Exit: 0 = deployed and healthy (or the dry run passed), 1 = failed, 3 = checked but NOT deployed (token)
set -euo pipefail
CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/ci/ci-lib.sh
. "$CI_DIR/ci-lib.sh"

WORKER="migate-intel"
DIR="$REPO/worker-intel"
AUTO_ROLLBACK="${CI_AUTO_ROLLBACK:-1}"
T0=$SECONDS
SHA="${GITHUB_SHA:-$(git -C "$REPO" rev-parse HEAD 2>/dev/null || true)}"
RESULT="failed" VERSION="" PREV_VERSION="" HEALTH="" ROLLBACK="" TARGETS="" SUMMARY_DONE=0

write_summary() {
  [ "$SUMMARY_DONE" = 1 ] && return 0
  SUMMARY_DONE=1
  summary "## Worker: $WORKER (intelligence pipeline)" "" "| | |" "|---|---|" \
    "| Result | **$(md_escape "$RESULT")** |" \
    "| Live URL | $LIVE/intel/ · $LIVE/api/intel/health |" \
    "| Version | ${VERSION:-none} |" \
    "| Targets | $(md_escape "${TARGETS:-none}") |" \
    "| Version live before | ${PREV_VERSION:-unknown} |" \
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
    if (cd "$DIR" && wr_cf rollback "$PREV_VERSION" --message "CI auto-rollback: health checks failed after ${SHA:0:12}" --yes) \
         >"$WORK/logs/rollback.log" 2>&1; then
      ROLLBACK="rolled back to version $PREV_VERSION"; ok "$ROLLBACK"
    else
      tail -n 20 "$WORK/logs/rollback.log"
      ROLLBACK="automatic rollback FAILED: cd worker-intel && npx wrangler@$WRANGLER_VERSION rollback $PREV_VERSION"; bad "$ROLLBACK"
    fi
  else
    ROLLBACK="not automatic (CI_AUTO_ROLLBACK=$AUTO_ROLLBACK, version live before: ${PREV_VERSION:-unknown})"
  fi
  die "$why"
}

# check URL WANT_RX → 0 ok, 1 failing, 3 challenged; body in $WORK/check.body
check() {
  local code
  code=$(curl -sS -o "$WORK/check.body" -D "$WORK/check.hdr" --max-time 30 -A "$UA_CI" -w '%{http_code}' "$1" 2>/dev/null || true)
  CHECK_CODE="${code:-000}"
  grep -qi '^cf-mitigated: *challenge' "$WORK/check.hdr" 2>/dev/null && return 3
  if [ "$CHECK_CODE" = 403 ] && grep -qiE 'Just a moment|Attention Required|challenge-platform|cf-chl' "$WORK/check.body"; then return 3; fi
  [ "$CHECK_CODE" = 200 ] && grep -qE "$2" "$WORK/check.body" && return 0
  return 1
}

# ------------------------------------------------------------------------------------------------ 1 tools + token
WORK_DEFAULT="${RUNNER_TEMP:+$RUNNER_TEMP/migate-intel}"
prepare_work "${CI_WORK_DIR:-${WORK_DEFAULT:-$REPO/build/ci-intel}}"
SUMMARY_FILE="$WORK/SUMMARY.md"; : > "$SUMMARY_FILE"
gh_output work_dir "$WORK"
say "Worker $WORKER pipeline — $([ "$DRY_RUN" = 1 ] && echo 'DRY RUN (no deploy)' || echo 'test + deploy'), commit ${SHA:-(not a git checkout)}, work dir $WORK"
[ "$DRY_RUN" = 1 ] || ci_ref_guard "or tick dry_run to only check this branch"
need curl "the health checks"; need npm "npm test"; need python3 "the deploy report"
need_node
[ -f "$DIR/wrangler.toml" ] || die "worker-intel/wrangler.toml not found"
grep -qE '^name *= *"migate-intel"' "$DIR/wrangler.toml" || die "worker-intel/wrangler.toml does not name the Worker migate-intel"
token_check
[ -n "${WRANGLER:-}" ] || ensure_worker_deps    # only for the lockfile-pinned wrangler
wrangler_init

# ------------------------------------------------------------------------------------------------ 2 install
say "install (worker-intel/)"
if [ -f "$DIR/package-lock.json" ]; then
  (cd "$DIR" && npm ci --no-audit --no-fund) >"$WORK/logs/npm-ci.log" 2>&1 || { tail -n 30 "$WORK/logs/npm-ci.log"; die "npm ci failed in worker-intel/"; }
  ok "npm ci from worker-intel/package-lock.json"
elif python3 -c 'import json,sys; p=json.load(open(sys.argv[1])); sys.exit(1 if (p.get("dependencies") or p.get("devDependencies")) else 0)' "$DIR/package.json"; then
  ok "worker-intel/ has no dependencies (and no package-lock.json): nothing to install"
else
  die "worker-intel/package.json has dependencies but no package-lock.json: run npm install there and commit package-lock.json (CI installs only from a lockfile)"
fi

# ------------------------------------------------------------------------------------------------ 3 tests
say "tests: worker-intel (npm test)"
if (cd "$DIR" && npm test) >"$WORK/logs/intel-test.log" 2>&1; then
  ok "$(grep -E '^# (tests|pass|fail) ' "$WORK/logs/intel-test.log" | tr '\n' ' ' | sed 's/# //g')"
else tail -n 60 "$WORK/logs/intel-test.log"; die "the migate-intel tests failed — nothing was deployed"; fi

# ------------------------------------------------------------------------------------------------ 4 bundle
say "wrangler deploy --dry-run (bundle + config validation, nothing uploaded)"
(cd "$DIR" && wr deploy --dry-run --outdir "$WORK/intel-dist") >"$WORK/logs/bundle.log" 2>&1 \
  || { tail -n 40 "$WORK/logs/bundle.log"; die "migate-intel does not bundle"; }
ok "bundle: $(du -sk "$WORK/intel-dist" | cut -f1) KB"

if [ "$DRY_RUN" = 1 ]; then
  say "DRY_RUN=1: NOT deploying (a real run would now execute: cd worker-intel && wrangler deploy)"
  RESULT="dry run passed: tests and bundle OK; nothing deployed"
  write_summary; ok "$RESULT ($((SECONDS - T0)) s)"
  [ "${CI_CLEAN:-0}" = 1 ] && rm -rf "$WORK"
  exit 0
fi
if ! token_usable; then
  RESULT="NOT deployed: CLOUDFLARE_API_TOKEN is $TOKEN_STATE (tests and bundle passed)"
  token_help; write_summary
  printf '%sERROR:%s %s\n' "$_R" "$_N" "$RESULT" >&2
  exit 3
fi

# ------------------------------------------------------------------------------------------------ 5 deploy
say "the version that is live now (rollback target)"
PREV_VERSION=$( (cd "$DIR" && wr_cf deployments status --json) 2>/dev/null | json_get "
v = sorted(d.get('versions') or [], key=lambda x: -(x.get('percentage') or 0))
print(v[0].get('version_id') if v else '')" || true)
if [ -n "$PREV_VERSION" ]; then ok "live now: version $PREV_VERSION"; else warn "could not read the live version — no automatic rollback possible"; fi
OUTF="$WORK/logs/wrangler-output.ndjson"; rm -f "$OUTF"
say "wrangler deploy ($WORKER)"
if ! (cd "$DIR" && WRANGLER_OUTPUT_FILE_PATH="$OUTF" wr_cf deploy) 2>&1 | tee "$WORK/logs/deploy.log"; then
  die "wrangler deploy failed (above) — the version live before keeps running"
fi
VERSION=$(wrangler_output_field "$OUTF" version_id)
TARGETS=$(wrangler_output_field "$OUTF" targets | python3 -c 'import json,sys
try: t = json.loads(sys.stdin.read() or "[]")
except ValueError: t = []
print(" ".join(t[:4]))' 2>/dev/null || true)
[ -n "$VERSION" ] || VERSION=$(grep -oE 'Current Version ID: [0-9a-f-]+' "$WORK/logs/deploy.log" | tail -n 1 | sed 's/.*: //' || true)
gh_output version_id "$VERSION"
ok "deployed: version ${VERSION:-?}"

# ------------------------------------------------------------------------------------------------ 6 health
# The new version itself answers on its workers.dev URL (a deploy target, no zone rules in front of it): that decides a
# rollback. The zone routes on the live site are checked too, but only warn (they are attached outside wrangler.toml).
WDEV=$(wrangler_output_field "$OUTF" targets | python3 -c 'import json,sys
try: t = json.loads(sys.stdin.read() or "[]")
except ValueError: t = []
print(next((x for x in t if isinstance(x, str) and x.startswith("https://") and x.endswith(".workers.dev")), ""))' 2>/dev/null || true)
[ -n "$WDEV" ] || WDEV=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$WORK/logs/deploy.log" | head -n 1 || true)
FAILED="" CHALL="" ZONE_WARN=""
probe() { # BASE KIND → appends to FAILED (kind=decisive) or ZONE_WARN (kind=zone)
  local base="${1%/}" kind="$2" spec path want rc i
  for spec in "/api/intel/health|\"ok\": ?true" "/intel/|<html"; do
    path="${spec%%|*}" want="${spec#*|}" rc=1
    for i in 1 2 3 4 5; do
      set +e; check "$base$path?ci=$(date +%s)" "$want"; rc=$?; set -e
      if [ "$rc" != 1 ]; then break; fi
      if [ "$i" -lt 5 ]; then sleep 6; fi
    done
    case "$rc" in
      0) ok "$base$path → 200" ;;
      3) warn "$base$path → $CHECK_CODE Cloudflare challenge (the zone's bot rules) — inconclusive"; CHALL="$CHALL $path" ;;
      *) if [ "$kind" = decisive ]; then bad "$base$path → $CHECK_CODE $(head -c 160 "$WORK/check.body" 2>/dev/null | tr '\n' ' ')"; FAILED="$FAILED $path"
         else warn "$base$path → $CHECK_CODE on the live site (zone route?) $(head -c 120 "$WORK/check.body" 2>/dev/null | tr '\n' ' ')"; ZONE_WARN="$ZONE_WARN $path"; fi ;;
    esac
  done
}
if [ -n "$WDEV" ]; then
  say "health of the new version ($WDEV, read-only)"
  probe "$WDEV" decisive
  say "health on the live site ($LIVE, read-only)"
  probe "$LIVE" zone
else
  say "health ($LIVE, read-only; no workers.dev target in the deploy output)"
  probe "$LIVE" decisive
fi
HEALTH="${FAILED:+FAILED:$FAILED; }${ZONE_WARN:+live-site warnings:$ZONE_WARN; }${CHALL:+challenged:$CHALL; }/api/intel/health and /intel/ checked${WDEV:+ on $WDEV and $LIVE}"
[ -z "$FAILED" ] || rollback "migate-intel fails after the deploy:$FAILED"
RESULT="live: version ${VERSION:-?} serves $LIVE/intel/"
write_summary
ok "$RESULT ($((SECONDS - T0)) s)"
[ "${CI_CLEAN:-0}" = 1 ] && rm -rf "$WORK"
exit 0
