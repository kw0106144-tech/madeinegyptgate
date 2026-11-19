-- Only for a D1 database created from the FIRST version of schema.sql (before activation links, sender checks and
-- recipient limits). New databases get all of this from schema.sql. Run once:
--   npx wrangler d1 execute madeinegyptgate-advisor --remote --file=./migrations/0002_advisor_security.sql
-- (ALTER TABLE ... ADD COLUMN fails if the column already exists — then the database is already up to date.)
ALTER TABLE messages ADD COLUMN envelope_from TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN sender_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN sender_auth TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS messages_deal_dir ON messages(deal_id, direction, at);
CREATE INDEX IF NOT EXISTS members_email ON members(email);
CREATE TABLE IF NOT EXISTS logins (
  code_hash   TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS logins_member ON logins(member_id, created_at);
CREATE TABLE IF NOT EXISTS contacts (
  member_id     TEXT NOT NULL,
  addr          TEXT NOT NULL,
  source        TEXT NOT NULL,
  first_at      TEXT NOT NULL,
  opted_out_at  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (member_id, addr)
);
CREATE INDEX IF NOT EXISTS contacts_new ON contacts(member_id, source, first_at);
