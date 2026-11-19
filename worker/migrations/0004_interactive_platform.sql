-- Interactive platform (accounts for every plan, automatic inquiry routing, follows, notifications, metrics, WhatsApp).
-- SAFE ON EVERY DATABASE (only CREATE … IF NOT EXISTS + guarded UPDATEs): the launch order on an EMPTY D1 is
--   schema.sql → migrations/0004_interactive_platform.sql → migrations/0005_qa_fixes.sql  (each applies cleanly; re-runs are no-ops)
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0004_interactive_platform.sql
-- A database created from the OLD advisor-only schema.sql (before 0004) first needs the added columns:
--   tools/upgrade-pre-0004.sql (ALTER TABLE … ADD COLUMN; not in migrations/ so that it never runs on a new database).
-- advisor members activated before this migration: count their year from the activation row if there is one
UPDATE members SET activated_at = updated_at WHERE activated_at = '' AND verified = 1 AND plan IN ('partner', 'strategic');
CREATE INDEX IF NOT EXISTS members_plan ON members(plan);

-- ===================== Interactive platform (migration 0004): accounts, inquiries + automatic matching, follows, =====================
-- ===================== notifications, honest metrics, WhatsApp (respond.io). src/auth.js, me.js, inquiries.js, admin.js …   =====================
-- One-time 6-digit login codes (only a keyed hash is stored; 10 min; 5 attempts)
CREATE TABLE IF NOT EXISTS auth_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email_key   TEXT NOT NULL,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  ip_hash     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used_at     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS auth_codes_email ON auth_codes(email_key, created_at);
-- Login sessions (token v2 = HMAC over member id + session id + expiry; logout revokes the row)
CREATE TABLE IF NOT EXISTS auth_sessions (
  sid_hash     TEXT PRIMARY KEY,
  member_id    TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT NOT NULL DEFAULT '',
  last_seen_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS auth_sessions_member ON auth_sessions(member_id);
-- Generic fixed-window rate limiter (keys contain hashes only)
CREATE TABLE IF NOT EXISTS rl (
  k    TEXT PRIMARY KEY,
  n    INTEGER NOT NULL DEFAULT 0,
  exp  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rl_exp ON rl(exp);
-- Abuse blocklist (admin monitoring console): kind email (normalised address) | ip (ip hash)
CREATE TABLE IF NOT EXISTS blocks (
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL,
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  PRIMARY KEY (kind, value)
);
-- Every request / contact / RFQ / basket / interest sent from the site or by Janna/Bassem
CREATE TABLE IF NOT EXISTS inquiries (
  id               TEXT PRIMARY KEY,           -- random 16 hex
  ref              TEXT NOT NULL UNIQUE,       -- MIG-26-XXXXXX (non-guessable, shown to the buyer)
  kind             TEXT NOT NULL,              -- contact|rfq|basket|opp_offer|lead_interest|project_interest|entity_contact|signup|profile_fix
  target_type      TEXT NOT NULL DEFAULT '',
  target_id        TEXT NOT NULL DEFAULT '',
  target_name      TEXT NOT NULL DEFAULT '',
  user_id          TEXT NOT NULL DEFAULT '',   -- members.id when sent while logged in
  name             TEXT NOT NULL DEFAULT '',
  company          TEXT NOT NULL DEFAULT '',
  email            TEXT NOT NULL DEFAULT '',
  email_key        TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  phone_last4      TEXT NOT NULL DEFAULT '',
  consent_wa       INTEGER NOT NULL DEFAULT 0, -- buyer agreed to WhatsApp updates
  message          TEXT NOT NULL DEFAULT '',
  payload_json     TEXT NOT NULL DEFAULT '{}',
  items_json       TEXT NOT NULL DEFAULT '[]',
  sector           TEXT NOT NULL DEFAULT '',
  governorate      TEXT NOT NULL DEFAULT '',
  market           TEXT NOT NULL DEFAULT 'local', -- local | gulf | africa | asia | europe (decides which plans may receive it)
  status           TEXT NOT NULL,              -- received | routed | in_progress (no registered match: the admins act) | no_match (old rows) | replied | recorded | closed | blocked
  source           TEXT NOT NULL DEFAULT 'form', -- form | janna | bassem | basket
  lang             TEXT NOT NULL DEFAULT 'ar',
  ip_hash          TEXT NOT NULL DEFAULT '',
  reply_key        TEXT NOT NULL DEFAULT '',   -- buyer's reply address inq-<ref>-<reply_key>@REPLY_DOMAIN
  routed_count     INTEGER NOT NULL DEFAULT 0, -- factories it was really delivered to (API returned an id)
  replies_count    INTEGER NOT NULL DEFAULT 0,
  receipt_sent     INTEGER NOT NULL DEFAULT 0,
  closed_at        TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inquiries_status ON inquiries(status, created_at);
CREATE INDEX IF NOT EXISTS inquiries_user ON inquiries(user_id, created_at);
CREATE INDEX IF NOT EXISTS inquiries_email ON inquiries(email_key, created_at);
CREATE INDEX IF NOT EXISTS inquiries_ip ON inquiries(ip_hash, created_at);
-- Timeline (buyer_visible = 1 → shown on track.html)
CREATE TABLE IF NOT EXISTS inquiry_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id    TEXT NOT NULL,
  type          TEXT NOT NULL,                 -- received|routed|no_match|rematched|reply|quote|buyer_message|declined|reminder|status|closed|send_failed|blocked
  actor         TEXT NOT NULL DEFAULT 'system',
  body          TEXT NOT NULL DEFAULT '',
  meta_json     TEXT NOT NULL DEFAULT '{}',
  buyer_visible INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inquiry_events_i ON inquiry_events(inquiry_id, id);
-- Automatic routing: one row per (inquiry, registered member factory) chosen by the matching engine (max 10)
CREATE TABLE IF NOT EXISTS inquiry_routes (
  id           TEXT PRIMARY KEY,               -- random 8 hex; also the factory's reply address inq-<ref>-<id>@REPLY_DOMAIN
  inquiry_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  score        REAL NOT NULL DEFAULT 0,
  priority     INTEGER NOT NULL DEFAULT 0,     -- 1 = premium or higher (ranked first)
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL,                  -- pending | sent | failed | replied | quoted | declined
  email_sent   INTEGER NOT NULL DEFAULT 0,
  wa_sent      INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT NOT NULL DEFAULT '',
  sent_at      TEXT NOT NULL DEFAULT '',
  reminded_at  TEXT NOT NULL DEFAULT '',
  replied_at   TEXT NOT NULL DEFAULT '',
  email_status TEXT NOT NULL DEFAULT '',       -- migration 0005: sent | failed | skipped (unsubscribed / no address)
  wa_status    TEXT NOT NULL DEFAULT '',       -- migration 0005: sent (text) | template (ping only; details queued) | failed | skipped
  created_at   TEXT NOT NULL,
  UNIQUE (inquiry_id, member_id)
);
CREATE INDEX IF NOT EXISTS inquiry_routes_member ON inquiry_routes(member_id, created_at);
CREATE INDEX IF NOT EXISTS inquiry_routes_status ON inquiry_routes(status, sent_at);
-- Structured quotes from the member dashboard («طلبات واردة لي»)
CREATE TABLE IF NOT EXISTS quotes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id  TEXT NOT NULL,
  route_id    TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  price       TEXT NOT NULL DEFAULT '',
  currency    TEXT NOT NULL DEFAULT 'EGP',
  moq         TEXT NOT NULL DEFAULT '',
  lead_time   TEXT NOT NULL DEFAULT '',
  validity    TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS quotes_inquiry ON quotes(inquiry_id, created_at);
-- Follows / saved items («متابعاتي»)
CREATE TABLE IF NOT EXISTS follows (
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  ref_id      TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  item_id     TEXT NOT NULL DEFAULT '',        -- migration 0005: the data-index id the page's id resolved to (deadline reminders)
  UNIQUE (user_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS follows_kind ON follows(kind, ref_id);
-- "New" = first appeared in a real data rebuild (worker/src/data.json → items)
CREATE TABLE IF NOT EXISTS seen_items (
  kind           TEXT NOT NULL,
  item_id        TEXT NOT NULL,
  first_seen_at  TEXT NOT NULL,
  baseline       INTEGER NOT NULL DEFAULT 0,   -- 1 = already there on the first sync (never reported as new)
  PRIMARY KEY (kind, item_id)
);
CREATE INDEX IF NOT EXISTS seen_items_at ON seen_items(first_seen_at);
-- Notification bell
CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  ref         TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  read_at     TEXT NOT NULL DEFAULT '',
  title_en    TEXT NOT NULL DEFAULT '',        -- migration 0005: English title/body (?lang=en)
  body_en     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, id);
CREATE INDEX IF NOT EXISTS notifications_ref ON notifications(user_id, kind, ref);
-- First-party metrics, aggregated per day (no raw IPs; ev_seen holds daily keyed hashes for de-duplication only)
CREATE TABLE IF NOT EXISTS ev_daily (
  day     TEXT NOT NULL,
  kind    TEXT NOT NULL,
  ref_id  TEXT NOT NULL,
  metric  TEXT NOT NULL,                       -- view | wa_click | web_click | inquiry
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, ref_id, metric)
);
CREATE INDEX IF NOT EXISTS ev_daily_ref ON ev_daily(kind, ref_id, day);
CREATE TABLE IF NOT EXISTS ev_seen (
  h    TEXT PRIMARY KEY,
  day  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ev_seen_day ON ev_seen(day);
-- Unsubscribes (every non-login email carries a working link): list digest | updates | incoming | all
CREATE TABLE IF NOT EXISTS unsubscribes (
  email_key   TEXT NOT NULL,
  list        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (email_key, list)
);
-- WhatsApp (respond.io) log: outbound sends + inbound replies (Bassem morning flow, time choices, «إيقاف», mood flags)
CREATE TABLE IF NOT EXISTS wa_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    TEXT NOT NULL DEFAULT '',
  phone_hash   TEXT NOT NULL DEFAULT '',
  direction    TEXT NOT NULL,                  -- in | out
  kind         TEXT NOT NULL DEFAULT '',       -- template name | text | inbound intent
  text         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT '',       -- sent | failed | received
  provider_id  TEXT NOT NULL DEFAULT '',
  flag         TEXT NOT NULL DEFAULT '',       -- mood | stop | time | ''
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS wa_messages_member ON wa_messages(member_id, created_at);
CREATE INDEX IF NOT EXISTS wa_messages_flag ON wa_messages(flag, created_at);
-- once-a-day cron jobs (digest, deadline reminders, data sync)
CREATE TABLE IF NOT EXISTS cron_runs (
  job  TEXT NOT NULL,
  day  TEXT NOT NULL,
  at   TEXT NOT NULL,
  PRIMARY KEY (job, day)
);
