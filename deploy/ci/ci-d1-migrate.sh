#!/usr/bin/env bash
# deploy/ci/ci-d1-migrate.sh — ONE migration file on the Worker database migate-db, backup first. Never automatic: only
# the manual workflow .github/workflows/d1-migrate.yml runs it, in three phases (the backup is uploaded as an artifact
# between "backup" and "apply", so it exists before anything is written).
#
#   MIGRATION=0009_memory_upgrades.sql bash deploy/ci/ci-d1-migrate.sh check                 # the request only, offline
#   MIGRATION=0009_memory_upgrades.sql bash deploy/ci/ci-d1-migrate.sh backup                # wrangler d1 export --remote
#   MIGRATION=0009_memory_upgrades.sql CONFIRM=migate-db bash deploy/ci/ci-d1-migrate.sh apply   # wrangler d1 execute --remote --file
#
# check   the file is a plain name in worker/migrations/ (nothing else is accepted), the database comes from
#         worker/wrangler.toml (binding DB = migate-db); statements are counted and destructive ones listed
# backup  the D1 Time Travel bookmark of "now" (restore point), then wrangler d1 export migate-db --remote (schema + data)
#         → <work>/backup/migate-db-<time>.sql + BACKUP.json (size, sha256, bookmark)
# apply   only with CONFIRM=migate-db and this run's BACKUP.json for the same file; a file with DROP / DELETE / UPDATE /
#         INSERT OR REPLACE / ALTER … DROP|RENAME is refused unless ALLOW_DESTRUCTIVE=1; then
#         wrangler d1 execute migate-db --remote --file worker/migrations/<file> --yes
#
# In GitHub Actions, backup and apply run only for refs/heads/main (ci_ref_guard): a branch's migration file is unreviewed.
# Environment: MIGRATION (required) · CONFIRM (apply) · ALLOW_DESTRUCTIVE=1 · DRY_RUN=1 (apply stops before executing;
# backup still exports when a token is present) · CLOUDFLARE_API_TOKEN (backup + apply) · CI_WORK_DIR (default
# $RUNNER_TEMP/migate-d1, else <repo>/build/ci-d1; "backup" wipes it, "apply" reuses it) · WRANGLER
# The backup holds member data: it stays in the work dir and the short-lived workflow artifact; never commit it (.gitignore
# blocks *d1-backup*.sql) and never attach it anywhere.
# Exit: 0 = done, 1 = failed or refused, 2 = usage, 3 = no usable Cloudflare token
set -euo pipefail
CI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/ci/ci-lib.sh
. "$CI_DIR/ci-lib.sh"

PHASE="${1:-}"
case "$PHASE" in check|backup|apply) ;; *) echo "usage: MIGRATION=<file.sql> $0 check|backup|apply" >&2; exit 2 ;; esac
MIGRATION="${MIGRATION:-}"
MIG_DIR="$REPO/worker/migrations"
WORK_DEFAULT="${RUNNER_TEMP:+$RUNNER_TEMP/migate-d1}"
WORK="${CI_WORK_DIR:-${WORK_DEFAULT:-$REPO/build/ci-d1}}"
SUMMARY_FILE=""
T0=$SECONDS

# ------------------------------------------------------------------------------------------------ check (every phase)
say "D1 migration request: '${MIGRATION}' ($PHASE)"
need python3 "the request checks"
printf '%s' "$MIGRATION" | grep -qE '^[0-9]{4}_[A-Za-z0-9_.-]+\.sql$' \
  || die "MIGRATION must be a file name like 0009_memory_upgrades.sql from worker/migrations/ (got '$MIGRATION')"
FILE="$MIG_DIR/$MIGRATION"
[ -f "$FILE" ] && [ ! -L "$FILE" ] || die "worker/migrations/$MIGRATION does not exist (files: $(cd "$MIG_DIR" && printf '%s ' ./*.sql))"
case "$(cd "$(dirname "$FILE")" && pwd -P)" in "$(cd "$MIG_DIR" && pwd -P)") ;; *) die "worker/migrations/$MIGRATION is outside worker/migrations" ;; esac
read -r DB_NAME DB_ID < <(python3 - "$REPO/worker/wrangler.toml" <<'PY'
import sys
try:
    import tomllib
except ImportError:
    sys.exit("Python >= 3.11 is needed (tomllib)")
c = tomllib.load(open(sys.argv[1], "rb"))
d = [x for x in c.get("d1_databases", []) if x.get("binding") == "DB"]
print(d[0]["database_name"], d[0]["database_id"]) if d else sys.exit("worker/wrangler.toml has no [[d1_databases]] binding DB")
PY
) || die "cannot read the D1 database from worker/wrangler.toml"
[ "$DB_NAME" = "migate-db" ] || die "worker/wrangler.toml binds DB to '$DB_NAME', this workflow only migrates migate-db"
SCAN=$(python3 - "$FILE" <<'PY'
import re, sys
t = open(sys.argv[1], encoding="utf-8").read()
t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
t = "\n".join(l.split("--", 1)[0] for l in t.splitlines())
stmts = [s.strip() for s in t.split(";") if s.strip()]
destr = {"DROP": r"\bDROP\s+(TABLE|INDEX|VIEW|TRIGGER)\b", "DELETE": r"\bDELETE\s+FROM\b",
         "UPDATE": r"\bUPDATE\s+[\w\"`\[\]]+\s+SET\b", "ALTER…DROP/RENAME": r"\bALTER\s+TABLE\s+\S+\s+(DROP|RENAME)\b",
         "INSERT OR REPLACE": r"\b(INSERT\s+OR\s+REPLACE|REPLACE\s+INTO)\b"}
found = [k for k, rx in destr.items() if re.search(rx, t, re.I)]
alter_add = len(re.findall(r"\bALTER\s+TABLE\s+\S+\s+ADD\b", t, re.I))
creates = len(re.findall(r"\bCREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|TRIGGER)\b", t, re.I))
print("%d|%s|%d|%d" % (len(stmts), ",".join(found), alter_add, creates))
PY
) || die "cannot read worker/migrations/$MIGRATION"
IFS='|' read -r N_STMT DESTRUCTIVE N_ALTER_ADD N_CREATE <<< "$SCAN"
SHA256=$(sha256sum "$FILE" | cut -d' ' -f1)
ok "worker/migrations/$MIGRATION: ~$N_STMT statement(s), $N_CREATE CREATE, sha256 ${SHA256:0:16}…; database $DB_NAME ($DB_ID)"
[ -z "$DESTRUCTIVE" ] || warn "the file contains destructive statements: $DESTRUCTIVE"
[ "$N_ALTER_ADD" = 0 ] || warn "the file has $N_ALTER_ADD ALTER TABLE … ADD statement(s): they fail when the column already exists (not idempotent)"
[ "$PHASE" = check ] && { ok "request OK ($((SECONDS - T0)) s)"; exit 0; }

# ------------------------------------------------------------------------------------------------ helpers for backup / apply
apply_summary() { summary "## D1 $DB_NAME: run $MIGRATION" "" "| | |" "|---|---|" "| Result | $1 |"; }
restore_hint() { # bookmark → how to go back
  # shellcheck disable=SC2016  # literal backticks (markdown code)
  if [ -n "$1" ]; then printf '`wrangler d1 time-travel restore %s --bookmark=%s`' "$DB_NAME" "$1"
  else printf 'no bookmark: restore from the export in the backup artifact'; fi
}
d1_ops() { # a throw-away wrangler config that only names the database (no Worker code, no routes)
  mkdir -p "$WORK/d1-ops"
  printf 'name = "migate-d1-ops"\ncompatibility_date = "2026-10-01"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "%s"\ndatabase_id = "%s"\n' \
    "$DB_NAME" "$DB_ID" > "$WORK/d1-ops/wrangler.toml"
}
need_token() { # the export and the migration both need the token, also in a dry run (the export is real)
  ci_ref_guard
  local dry="$DRY_RUN"
  DRY_RUN=0; token_check; DRY_RUN="$dry"
  if ! token_usable; then
    summary "## D1 migate-db: $MIGRATION ($PHASE)"
    token_help "Not run (nothing exported, nothing changed)"
    printf '%sERROR:%s nothing was exported or changed: CLOUDFLARE_API_TOKEN is %s\n' "$_R" "$_N" "$TOKEN_STATE" >&2
    exit 3
  fi
}

# ------------------------------------------------------------------------------------------------ backup
if [ "$PHASE" = backup ]; then
  prepare_work "$WORK"
  SUMMARY_FILE="$WORK/SUMMARY.md"; : > "$SUMMARY_FILE"
  need_token
  [ -n "${WRANGLER:-}" ] || ensure_worker_deps
  wrangler_init
  d1_ops
  mkdir -p "$WORK/backup"
  TS="$(date -u +%Y%m%dT%H%M%SZ)"
  say "restore point: D1 Time Travel bookmark of now"
  BOOKMARK=$( (cd "$WORK/d1-ops" && wr_cf d1 time-travel info "$DB_NAME" --json) 2>"$WORK/logs/bookmark.err" \
              | json_get "print(d.get('bookmark') or '')" || true)
  if [ -n "$BOOKMARK" ]; then ok "bookmark $BOOKMARK (restore: wrangler d1 time-travel restore $DB_NAME --bookmark=$BOOKMARK)"
  else warn "no Time Travel bookmark ($(tail -c 200 "$WORK/logs/bookmark.err" | tr '\n' ' ')) — the export below is the backup"; fi
  OUT="$WORK/backup/$DB_NAME-d1-backup-$TS.sql"
  say "export: wrangler d1 export $DB_NAME --remote (schema + data) → $(basename "$OUT")"
  (cd "$WORK/d1-ops" && wr_cf d1 export "$DB_NAME" --remote --output "$OUT" --skip-confirmation) >"$WORK/logs/export.log" 2>&1 \
    || { tail -n 30 "$WORK/logs/export.log"; die "the backup export failed — the migration was NOT run"; }
  [ -s "$OUT" ] || die "the export wrote no file — the migration was NOT run"
  grep -qiE '^CREATE TABLE' "$OUT" || die "the export has no CREATE TABLE — not a usable backup, the migration was NOT run"
  BYTES=$(wc -c < "$OUT" | tr -d ' '); BSHA=$(sha256sum "$OUT" | cut -d' ' -f1)
  NT=$(grep -ciE '^CREATE TABLE' "$OUT" || true)
  python3 - "$WORK/backup/BACKUP.json" "$DB_NAME" "$DB_ID" "$MIGRATION" "$SHA256" "$(basename "$OUT")" "$BYTES" "$BSHA" \
    "$NT" "$BOOKMARK" "$TS" "${GITHUB_RUN_ID:-local}" <<'PY'
import json, sys
p, db, dbid, mig, msha, f, size, sha, nt, bm, ts, run = sys.argv[1:]
json.dump({"database": db, "database_id": dbid, "migration": mig, "migration_sha256": msha, "file": f, "bytes": int(size),
           "sha256": sha, "tables": int(nt or 0), "bookmark": bm, "at": ts, "run": run}, open(p, "w"), indent=1)
PY
  ok "backup: $(basename "$OUT"), $BYTES bytes, $NT tables, sha256 ${BSHA:0:16}…"
  summary "## D1 $DB_NAME: backup before $MIGRATION" "" "| | |" "|---|---|" \
    "| Backup | \`$(basename "$OUT")\` ($BYTES bytes, $NT tables) — artifact *d1-backup-$DB_NAME-${GITHUB_RUN_ID:-local}* (member data: short retention) |" \
    "| Restore point | $(restore_hint "$BOOKMARK") |" \
    "| Migration | \`worker/migrations/$MIGRATION\` (~$N_STMT statements${DESTRUCTIVE:+, destructive: $DESTRUCTIVE}) |"
  exit 0
fi

# ------------------------------------------------------------------------------------------------ apply
[ -d "$WORK" ] && [ -f "$WORK/.migate-ci-work" ] || die "no work dir from the backup phase ($WORK): run 'backup' first"
SUMMARY_FILE="$WORK/SUMMARY.md"
[ "${CONFIRM:-}" = "$DB_NAME" ] || die "not confirmed: type the database name '$DB_NAME' in the 'confirm' field to run $MIGRATION"
python3 - "$WORK/backup/BACKUP.json" "$DB_NAME" "$MIGRATION" "$SHA256" "${GITHUB_RUN_ID:-local}" <<'PY' \
  || die "no backup of this run for $MIGRATION (BACKUP.json above) — the migration was NOT run"
import json, os, sys
p, db, mig, sha, run = sys.argv[1:]
try:
    b = json.load(open(p))
except (OSError, ValueError) as e:
    print("  FAIL  %s: %s" % (p, e)); sys.exit(1)
f = os.path.join(os.path.dirname(p), b.get("file", ""))
probs = [k for k, ok in (("database", b.get("database") == db), ("migration", b.get("migration") == mig),
                          ("migration_sha256", b.get("migration_sha256") == sha), ("run", b.get("run") == run),
                          ("file", os.path.isfile(f) and os.path.getsize(f) == b.get("bytes"))) if not ok]
for k in probs:
    print("  FAIL  BACKUP.json %s does not match this run" % k)
sys.exit(1 if probs else 0)
PY
ok "backup of this run: $(python3 -c 'import json,sys; b=json.load(open(sys.argv[1])); print("%s (%s bytes, bookmark %s)" % (b["file"], b["bytes"], b.get("bookmark") or "none"))' "$WORK/backup/BACKUP.json")"
if [ -n "$DESTRUCTIVE" ] && [ "${ALLOW_DESTRUCTIVE:-0}" != 1 ]; then
  die "worker/migrations/$MIGRATION contains $DESTRUCTIVE statements: refused (run the workflow again with allow_destructive if this is really intended; the backup above is kept)"
fi
if [ "$DRY_RUN" = 1 ]; then
  say "DRY_RUN=1: NOT running the migration (a real run executes: wrangler d1 execute $DB_NAME --remote --file worker/migrations/$MIGRATION --yes)"
  apply_summary "dry run: backup only, the migration was NOT run"
  exit 0
fi
need_token
[ -n "${WRANGLER:-}" ] || ensure_worker_deps
wrangler_init
d1_ops
say "run: wrangler d1 execute $DB_NAME --remote --file worker/migrations/$MIGRATION"
if (cd "$WORK/d1-ops" && wr_cf d1 execute "$DB_NAME" --remote --file "$FILE" --yes) 2>&1 | tee "$WORK/logs/execute.log"; then
  ok "migration $MIGRATION applied to $DB_NAME ($((SECONDS - T0)) s)"
  apply_summary "**applied** $MIGRATION to $DB_NAME"
  exit 0
fi
B=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("bookmark") or "")' "$WORK/backup/BACKUP.json" 2>/dev/null || true)
apply_summary "**FAILED** (wrangler output in the log). Restore point: $(restore_hint "$B")"
die "the migration failed (above). The database may be partly migrated: check it, then restore — $(restore_hint "$B")"
