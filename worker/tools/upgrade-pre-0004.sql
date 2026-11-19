-- ONLY for a D1 database created from the OLD advisor-only schema.sql (members without the platform columns). Run it once,
-- then migrations/0004_interactive_platform.sql and migrations/0005_qa_fixes.sql. Never on a database created from the current
-- schema.sql (it already has these columns; "ALTER TABLE … ADD COLUMN" fails on an existing column):
--   npx wrangler d1 execute <database> --remote --file=./tools/upgrade-pre-0004.sql
-- (kept outside migrations/ on purpose, so the launch order / `wrangler d1 migrations apply` never runs it on a new database)
ALTER TABLE members ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE members ADD COLUMN plan_expires TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN activated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN prefs_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE members ADD COLUMN sector TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN governorate TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN products TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN factory_ref TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN inbox_paused INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN email_verified_at TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN wa_last_in_at TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN morning_sent_day TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN call_sent_day TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN digest_sent_day TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN wa_verified_at TEXT NOT NULL DEFAULT '';
ALTER TABLE members ADD COLUMN rematch_at TEXT NOT NULL DEFAULT '';
