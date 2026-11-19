-- ONLY for a D1 database that ran the FIRST version of migration 0004 (platform tables without the QA-fix columns). Run it once,
-- then migrations/0005_qa_fixes.sql. Never on a database created from the current schema.sql or the current 0004:
--   npx wrangler d1 execute <database> --remote --file=./tools/upgrade-pre-0005.sql
ALTER TABLE inquiry_routes ADD COLUMN email_status TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiry_routes ADD COLUMN wa_status TEXT NOT NULL DEFAULT '';
ALTER TABLE follows ADD COLUMN item_id TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ADD COLUMN body_en TEXT NOT NULL DEFAULT '';
