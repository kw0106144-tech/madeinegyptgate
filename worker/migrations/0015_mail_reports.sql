-- 0015_mail_reports.sql — request teasers, the daily member / partner reports, the owner's daily report and the instant alerts to the
-- platform's own mailbox (owner decisions 2026-11-28; src/mail-sends.js, src/teasers.js, src/daily-mail.js, src/info-alerts.js).
--   mail_sends          one row per e-mail of these kinds per recipient: the de-duplication (one teaser per request per address, one report
--                       per day per member, one alert per key), the teasers' daily cap, and the owner's daily report. Teaser rows hold the
--                       directory profile's official company address: INTERNAL, never on a page, a file or an API answer to anyone but
--                       the owner's own report.
--   mail_outbox         every e-mail the Worker sent (recipient address, template, masked subject), kept 3 days, for the owner's daily
--                       report to TEAM_EMAIL («every e-mail the platform sent that day»). cc_mail_log keeps its hashed / masked rows as before.
--   directory_contacts  official company e-mails (info@ / sales@ / contact@ … on the company's own domain — never a person's address) of
--                       directory profiles that are NOT members, added by the team (Control Center API /api/admin/cc/outreach/contacts,
--                       permission legacy.contacts, audited). Admin-only, never public.
-- Without these tables the code sends nothing new (teasers, reports, alerts are skipped: fail soft) and everything else works as before.
-- Purely additive and idempotent (CREATE … IF NOT EXISTS only): safe to re-run. Apply ONLY with the manual GitHub workflow, which backs up
-- first: Actions → d1-migrate → Run workflow: migration = 0015_mail_reports.sql, confirm = migate-db.
CREATE TABLE IF NOT EXISTS mail_sends (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL,                           -- teaser | teaser_run | member_daily | partner_daily | owner_daily | alert_unsub | alert_register
  ref          TEXT NOT NULL,                           -- the request ref (teaser), the Cairo day (reports), the alert's key
  email_key    TEXT NOT NULL DEFAULT '',                -- common.js emailKey of the recipient ('' = a run marker)
  to_addr      TEXT NOT NULL DEFAULT '',                -- the address (internal: only the owner's daily report shows it)
  company      TEXT NOT NULL DEFAULT '',
  factory_ref  TEXT NOT NULL DEFAULT '',                -- teaser: the directory profile
  day          TEXT NOT NULL,                           -- Cairo day of the attempt (the teasers' daily cap)
  status       TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed', 'skipped')),
  tries        INTEGER NOT NULL DEFAULT 1,              -- a failed send is claimed again (retried) at most 3 times
  note         TEXT NOT NULL DEFAULT '',
  at           TEXT NOT NULL,
  UNIQUE (kind, ref, email_key)
);
CREATE INDEX IF NOT EXISTS mail_sends_day ON mail_sends(kind, day, status);
CREATE INDEX IF NOT EXISTS mail_sends_addr ON mail_sends(email_key, kind, day);
CREATE TABLE IF NOT EXISTS mail_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  at           TEXT NOT NULL,
  day          TEXT NOT NULL,                           -- Cairo day
  to_addr      TEXT NOT NULL,
  more         INTEGER NOT NULL DEFAULT 0,              -- further recipients of the same message (to + cc)
  company      TEXT NOT NULL DEFAULT '',
  template     TEXT NOT NULL DEFAULT '',
  subject      TEXT NOT NULL DEFAULT ''                 -- masked like cc_mail_log (sign-in codes ••••••)
);
CREATE INDEX IF NOT EXISTS mail_outbox_day ON mail_outbox(day, id);
CREATE TABLE IF NOT EXISTS directory_contacts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  factory_ref  TEXT NOT NULL,                           -- the directory profile (data.json f[5] «company.html#<ref>»)
  company      TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL,                           -- ADMIN-ONLY: the official company address
  email_key    TEXT NOT NULL,
  source_url   TEXT NOT NULL DEFAULT '',                -- the company's own page that publishes the address
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'off')),
  added_by     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (factory_ref, email_key)
);
CREATE INDEX IF NOT EXISTS directory_contacts_key ON directory_contacts(email_key);
