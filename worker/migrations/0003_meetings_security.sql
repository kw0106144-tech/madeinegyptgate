-- Only for a D1 database whose meetings table was created before the meetings security fixes (normalised e-mail rate
-- limits, session binding). New databases get all of this from schema.sql. Run once:
--   npx wrangler d1 execute madeinegyptgate-advisor --remote --file=./migrations/0003_meetings_security.sql
-- (ALTER TABLE ... ADD COLUMN fails if the column already exists — then the database is already up to date.)
ALTER TABLE meetings ADD COLUMN email_key TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN session_at TEXT NOT NULL DEFAULT '';
-- existing rows: lower-case address without +tag (Gmail dots are only folded for new rows)
UPDATE meetings SET email_key = CASE WHEN instr(substr(email, 1, instr(email, '@') - 1), '+') > 0
  THEN substr(email, 1, instr(email, '+') - 1) || substr(email, instr(email, '@')) ELSE lower(email) END WHERE email_key = '';
CREATE INDEX IF NOT EXISTS meetings_email_key ON meetings(email_key, created_at);
-- one Anam session belongs to one meeting (fails if duplicates already exist: clear the extra session_id values first)
CREATE UNIQUE INDEX IF NOT EXISTS meetings_session ON meetings(session_id) WHERE session_id != '';
