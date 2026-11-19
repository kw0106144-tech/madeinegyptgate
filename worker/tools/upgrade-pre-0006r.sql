-- ONLY for a D1 database that ran the FIRST version of migration 0006 (Admin Control Center, md5 7d82df38… — production since
-- 2026-11-18 19:0x UTC). The deploy-2 review fixes (PAY-H1: prorated upgrades keep the current end date) added the column
-- cc_invoices.period_end to 0006 and schema.sql; CREATE TABLE IF NOT EXISTS cannot add a column to a table that already exists.
-- deploy/d1_migrate.py (deploy.sh db / deploy.sh worker) plans this ALTER only where the column is missing — never run it by hand on a
-- database created from the current schema.sql or the current 0006 (SQLite cannot make ADD COLUMN idempotent: "duplicate column").
--   by hand, only after PRAGMA table_info(cc_invoices) shows no period_end:
--   npx wrangler d1 execute migate-db --remote --file=./tools/upgrade-pre-0006r.sql
ALTER TABLE cc_invoices ADD COLUMN period_end TEXT NOT NULL DEFAULT '';
