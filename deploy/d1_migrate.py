#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Plan the D1 schema steps for the Worker database (migate-db): worker/schema.sql + migrations 0004, 0005 and 0006 ONLY.

    python3 deploy/d1_migrate.py plan   --state STATE.json --out DIR [--schema F] [--migration F …]
    python3 deploy/d1_migrate.py verify --state STATE.json           [--schema F] [--migration F …]
    python3 deploy/d1_migrate.py state  RESULT.json …   (wrangler d1 execute --json output → STATE.json on stdout)

Launch order (worker/README.md, migrations/0004 + 0005 + 0006 headers): schema.sql → 0004 → 0005 → 0006. schema.sql is
written for a NEW database (CREATE … IF NOT EXISTS with every current column; since deploy 2 it also carries 0006 at its
end); 0004 and 0005 are CREATE … IF NOT EXISTS + guarded back-fills, 0006 (Admin Control Center, deploy 2) is CREATE …
IF NOT EXISTS + INSERT OR IGNORE seeds only (31 cc_* tables, no ALTER) — all safe on every database and safe to re-run. A database created from an OLDER schema.sql additionally needs the columns added
since — worker/tools/upgrade-pre-0004.sql / upgrade-pre-0005.sql, and a database that ran the FIRST 0006 (production since
2026-11-18) needs upgrade-pre-0006r.sql (cc_invoices.period_end, review fix PAY-H1) — ALTER TABLE … ADD COLUMN, which SQLite cannot make
idempotent, so they must only run where a column is really missing. The planner reads the live tables/columns and writes:
  1. only the ALTER TABLE … ADD COLUMN statements (from the upgrade files and from any ALTER left in 0004 / 0005) whose
     table exists and whose column is missing,
  2. worker/schema.sql,
  3. migration 0004, then 0005, then 0006, without their ALTER statements (each file as a whole otherwise).
Migrations numbered after 0006 are refused (a later deploy adds them here first). A database older than every
column source (members.role missing and no ALTER for it) is refused with the manual steps.
`verify` checks the result: every table and every column of schema.sql exists.
Standard library only.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_SCHEMA = os.path.join(REPO, "worker", "schema.sql")
DEFAULT_MIGRATIONS = [os.path.join(REPO, "worker", "migrations", "0004_interactive_platform.sql"),
                      os.path.join(REPO, "worker", "migrations", "0005_qa_fixes.sql"),
                      os.path.join(REPO, "worker", "migrations", "0006_admin_center.sql")]
# upgrade-pre-0006r.sql: cc_invoices.period_end, added to 0006 by the deploy-2 review fixes AFTER production had run the first 0006
DEFAULT_UPGRADES = [os.path.join(REPO, "worker", "tools", n) for n in ("upgrade-pre-0004.sql", "upgrade-pre-0005.sql", "upgrade-pre-0006r.sql")]
ALLOWED_MIGRATIONS = ("0004", "0005", "0006")      # deploy 1: schema + 0004 + 0005; deploy 2 adds 0006 (Admin Control Center)
ALTER_RX = re.compile(r"^\s*ALTER\s+TABLE\s+[\"`\[]?(\w+)[\"`\]]?\s+ADD\s+(?:COLUMN\s+)?[\"`\[]?(\w+)[\"`\]]?", re.I)
CREATE_TABLE_RX = re.compile(r"^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`\[]?(\w+)[\"`\]]?\s*\(", re.I)
CREATE_RX = re.compile(r"^\s*CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW)\b", re.I)


def statements(sql):
    """split a plain SQL file (no triggers) into statements; -- comments and quoted ';' handled"""
    out, cur, q, i = [], [], None, 0
    while i < len(sql):
        c = sql[i]
        if q:
            cur.append(c)
            if c == q:
                if i + 1 < len(sql) and sql[i + 1] == q:      # '' escape
                    cur.append(sql[i + 1])
                    i += 1
                else:
                    q = None
        elif c in "'\"":
            q = c
            cur.append(c)
        elif c == "-" and sql[i:i + 2] == "--":
            j = sql.find("\n", i)
            i = len(sql) if j < 0 else j
            continue
        elif c == ";":
            s = "".join(cur).strip()
            if s:
                out.append(s)
            cur = []
        else:
            cur.append(c)
        i += 1
    s = "".join(cur).strip()
    if s:
        out.append(s)
    return out


def schema_tables(path):
    return [m.group(1) for m in (CREATE_TABLE_RX.match(s) for s in statements(open(path, encoding="utf-8").read())) if m]


CONSTRAINT_WORDS = {"PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "CONSTRAINT"}


def schema_columns(path):
    """{table: [columns]} from the CREATE TABLE statements of schema.sql"""
    out = {}
    for s in statements(open(path, encoding="utf-8").read()):
        m = CREATE_TABLE_RX.match(s)
        if not m:
            continue
        body = s[s.index("(") + 1: s.rindex(")")]
        parts, depth, cur = [], 0, []
        for ch in body:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if ch == "," and depth == 0:
                parts.append("".join(cur))
                cur = []
            else:
                cur.append(ch)
        parts.append("".join(cur))
        cols = []
        for part in parts:
            w = part.strip().split(None, 1)
            if w and w[0].strip('"`[]').upper() not in CONSTRAINT_WORDS:
                cols.append(w[0].strip('"`[]'))
        out[m.group(1)] = cols
    return out


def migration_parts(path):
    """→ (name, [(table, column, stmt)], [other statements]) of one migration file"""
    name = os.path.basename(path)
    if not name[:4].isdigit() or name[:4] not in ALLOWED_MIGRATIONS:
        raise SystemExit("d1_migrate.py: %s is not one of the planned migrations (%s) — a later migration must be "
                         "added to ALLOWED_MIGRATIONS / DEFAULT_MIGRATIONS first" % (name, ", ".join(ALLOWED_MIGRATIONS)))
    alters, other = [], []
    for s in statements(open(path, encoding="utf-8").read()):
        m = ALTER_RX.match(s)
        if m:
            alters.append((m.group(1), m.group(2), s))
        else:
            other.append(s)
    return name, alters, other


def load_state(path):
    st = json.load(open(path, encoding="utf-8"))
    return {t: set(c) for t, c in (st.get("tables") or {}).items()}


def cmd_state(a):
    """wrangler d1 execute --json output(s): rows {t, c} (one query over pragma_table_info) or PRAGMA table_info rows
    with the table name in the file name (<table>.json) → {"tables": {table: [columns]}}"""
    tables = {}
    for f in a.files:
        txt = open(f, encoding="utf-8").read()
        i = [k for k in (txt.find("["), txt.find("{")) if k >= 0]
        if not i:
            raise SystemExit("d1_migrate.py: no JSON in %s" % f)
        d = json.JSONDecoder().raw_decode(txt[min(i):])[0]
        res = d[0].get("results", []) if isinstance(d, list) and d else (d.get("results", []) if isinstance(d, dict) else [])
        base = os.path.splitext(os.path.basename(f))[0]
        for r in res:
            if "t" in r and "c" in r:
                cols = tables.setdefault(r["t"], [])
                if r["c"] is not None:
                    cols.append(r["c"])
            elif "name" in r and "cid" in r:             # PRAGMA table_info(<base>)
                tables.setdefault(base, []).append(r["name"])
            elif "name" in r:                            # sqlite_master listing
                tables.setdefault(r["name"], [])
    json.dump({"tables": tables}, sys.stdout, ensure_ascii=False, sort_keys=True)
    sys.stdout.write("\n")
    return 0


def alter_sources(a):
    """every ALTER TABLE … ADD COLUMN of the upgrade files and the migrations → {(table, column): statement}"""
    out = {}
    for path in [u for u in (a.upgrade or []) if os.path.isfile(u)]:
        for st in statements(open(path, encoding="utf-8").read()):
            m = ALTER_RX.match(st)
            if m:
                out.setdefault((m.group(1), m.group(2)), st)
    for path in a.migration:
        for t, c, st in migration_parts(path)[1]:
            out.setdefault((t, c), st)
    return out


def cmd_plan(a):
    state = load_state(a.state)
    if os.path.isdir(a.out):
        for n in os.listdir(a.out):
            if n.endswith(".sql"):
                os.unlink(os.path.join(a.out, n))
    os.makedirs(a.out, exist_ok=True)
    alters = alter_sources(a)
    cols = schema_columns(a.schema)
    older = ["%s.%s" % (t, c) for t, cs in cols.items() if t in state for c in cs if c not in state[t] and (t, c) not in alters]
    if older:
        print("ERROR\tthis database is older than every upgrade file: columns %s have no ALTER statement — apply "
              "worker/migrations/0002 and 0003 first (README-DEPLOY.md, D1), then re-run" % ", ".join(older[:12]))
        return 3
    steps, n = [], 0
    need = [(t, c, st) for (t, c), st in alters.items() if t in state and c not in state[t]]
    if need:
        n += 1
        fn = os.path.join(a.out, "%02d-add-missing-columns.sql" % n)
        with open(fn, "w", encoding="utf-8") as f:
            f.write("-- columns this database does not have yet (planned by deploy/d1_migrate.py from worker/tools/upgrade-pre-*.sql)\n")
            for t, c, st in need:
                f.write(st.rstrip(";") + ";\n")
                state[t].add(c)
        steps.append((fn, "add %d missing column(s): %s" % (len(need), ", ".join("%s.%s" % (t, c) for t, c, _ in need))))
    else:
        steps.append((None, "no missing columns (%s)" % ("empty database: schema.sql creates every table" if not state else "the existing tables are current")))
    n += 1
    fn = os.path.join(a.out, "%02d-schema.sql" % n)
    with open(a.schema, encoding="utf-8") as src, open(fn, "w", encoding="utf-8") as f:
        f.write(src.read())
    missing_tables = [t for t in schema_tables(a.schema) if t not in state]
    steps.append((fn, "schema.sql (CREATE … IF NOT EXISTS; creates %s)" % (", ".join(missing_tables) if missing_tables else "nothing new — all tables exist")))
    for path in a.migration:
        name, alt, other = migration_parts(path)
        if not other:
            steps.append((None, "%s: nothing besides ALTER statements" % name))
            continue
        n += 1
        fn = os.path.join(a.out, "%02d-%s" % (n, name))
        with open(fn, "w", encoding="utf-8") as f:
            f.write("-- %s%s (CREATE … IF NOT EXISTS + guarded back-fills: safe to re-run)\n" % (name, " without its ALTER statements" if alt else ""))
            for st in other:
                f.write(st.rstrip(";") + ";\n")
        steps.append((fn, "%s (%d statement(s))" % (name, len(other))))
    for fn, msg in steps:
        print("%s\t%s" % (fn or "-", msg))
    return 0


def cmd_verify(a):
    state = load_state(a.state)
    probs = ["table %s (schema.sql) is missing" % t for t in schema_tables(a.schema) if t not in state]
    probs += ["column %s.%s (schema.sql) is missing" % (t, c) for t, cols in schema_columns(a.schema).items()
              if t in state for c in cols if c not in state[t]]
    for p in probs:
        print("  FAIL  D1: " + p)
    if not probs:
        print("  OK    D1 schema complete: %d tables, every column of schema.sql (schema.sql + 0004 + 0005 + 0006)" % len(state))
    return 1 if probs else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd")
    for name in ("plan", "verify"):
        p = sub.add_parser(name)
        p.add_argument("--state", required=True)
        p.add_argument("--schema", default=DEFAULT_SCHEMA)
        p.add_argument("--migration", action="append")
        p.add_argument("--upgrade", action="append", help="ALTER-only column sources (default worker/tools/upgrade-pre-*.sql)")
        if name == "plan":
            p.add_argument("--out", required=True)
    p = sub.add_parser("state")
    p.add_argument("files", nargs="+")
    a = ap.parse_args(argv)
    if getattr(a, "migration", None) is None and a.cmd in ("plan", "verify"):
        a.migration = DEFAULT_MIGRATIONS
    if getattr(a, "upgrade", None) is None and a.cmd in ("plan", "verify"):
        a.upgrade = DEFAULT_UPGRADES
    if a.cmd == "plan":
        return cmd_plan(a)
    if a.cmd == "verify":
        return cmd_verify(a)
    if a.cmd == "state":
        return cmd_state(a)
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
