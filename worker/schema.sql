-- Made in Egypt Gate platform + AI Deal Advisor («المستشار الذكي للصفقات») — Cloudflare D1 schema (binding: DB, database migate-db)
-- The COMPLETE schema. Launch order on an EMPTY D1 (each step applies cleanly; re-running any of them is a no-op):
--   npx wrangler d1 execute migate-db --remote --file=./schema.sql
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0004_interactive_platform.sql
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0005_qa_fixes.sql
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0006_admin_center.sql   (Admin Control Center; also appended below)
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0007_member_profile.sql   (Bassem: the member's factory profile; also appended below)
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0008_advisor_memory.sql   (Bassem's permanent memory; also appended below)
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0009_memory_upgrades.sql   (tasks, «ملخص العميل», Janna's visitors, «بنك المعلومات»; also appended below)
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0010_delete_requests.sql   (account deletion requests; also appended below)
-- (0004 / 0005 only hold CREATE … IF NOT EXISTS + guarded back-fills; an OLD advisor-only database first runs tools/upgrade-pre-0004.sql.)

-- Members on the partner / strategic plans (created/updated by POST /api/advisor/session)
CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,              -- platform member id
  company     TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',      -- member's own email (cc on every outgoing email, receives reply copies)
  plan        TEXT NOT NULL,                 -- partner | strategic (anything else = advisor disabled)
  verified    INTEGER NOT NULL DEFAULT 0,    -- 1 = plan set by the platform (admin / X-Platform-Key / payment), never by the browser
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  -- one members table for every plan (migration 0004): visitor | profile | basic | premium | partner | strategic
  name              TEXT NOT NULL DEFAULT '',
  title             TEXT NOT NULL DEFAULT '',  -- أستاذ / دكتور / مهندس … (Bassem greets with it)
  phone             TEXT NOT NULL DEFAULT '',  -- the member's own number (never shown on public pages)
  role              TEXT NOT NULL DEFAULT 'user', -- user | admin (admins also via ADMIN_EMAILS)
  plan_expires      TEXT NOT NULL DEFAULT '',  -- ISO; '' = no expiry
  activated_at      TEXT NOT NULL DEFAULT '',  -- when the paid plan was activated (365-day counters)
  prefs_json        TEXT NOT NULL DEFAULT '{}',-- {morning_time, session_time, days, call_today_at, pause, wa_optin, email_digest}
  sector            TEXT NOT NULL DEFAULT '',  -- matching: sector / activity
  governorate       TEXT NOT NULL DEFAULT '',
  products          TEXT NOT NULL DEFAULT '',  -- matching: product keywords
  factory_ref       TEXT NOT NULL DEFAULT '',  -- directory profile this member owns (e.g. "12" for company.html#12), set by admin only
  inbox_paused      INTEGER NOT NULL DEFAULT 0,-- 1 = do not route inquiries to this member
  email_verified_at TEXT NOT NULL DEFAULT '',
  last_seen_at      TEXT NOT NULL DEFAULT '',
  wa_last_in_at     TEXT NOT NULL DEFAULT '',  -- last inbound WhatsApp message (24 h customer-service window)
  morning_sent_day  TEXT NOT NULL DEFAULT '',  -- Cairo date Bassem's morning message was sent
  call_sent_day     TEXT NOT NULL DEFAULT '',
  digest_sent_day   TEXT NOT NULL DEFAULT '',
  -- migration 0005 (QA fixes)
  wa_verified_at    TEXT NOT NULL DEFAULT '',  -- first inbound WhatsApp from members.phone (the number is really theirs)
  rematch_at        TEXT NOT NULL DEFAULT ''   -- last self-service re-matching (throttled to once a day)
);

-- One row per opportunity the member is pursuing
CREATE TABLE IF NOT EXISTS deals (
  id            TEXT PRIMARY KEY,            -- random 16 hex chars; also the reply address deal-<id>@reply…
  member_id     TEXT NOT NULL REFERENCES members(id),
  ref           TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  entity        TEXT NOT NULL DEFAULT '',
  market        TEXT NOT NULL DEFAULT '',    -- local | gulf | africa | asia | europe
  country       TEXT NOT NULL DEFAULT '',
  source_url    TEXT NOT NULL DEFAULT '',
  closing_date  TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT '',    -- gov | pvt | rfq | …
  stage         TEXT NOT NULL DEFAULT 'discover', -- discover|contact|offer|negotiation|contract|delivery|won|lost
  notes         TEXT NOT NULL DEFAULT '',
  next_action   TEXT NOT NULL DEFAULT '',
  due_date      TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_name  TEXT NOT NULL DEFAULT '',
  value         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deals_member ON deals(member_id, updated_at);

-- Email thread of a deal (out = sent/drafted from the platform, in = reply received on deal-<id>@reply…)
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  deal_id     TEXT NOT NULL REFERENCES deals(id),
  member_id   TEXT NOT NULL,
  direction   TEXT NOT NULL,                 -- out | in
  status      TEXT NOT NULL,                 -- sent | draft | failed | received
  from_addr   TEXT NOT NULL DEFAULT '',
  to_addr     TEXT NOT NULL DEFAULT '',
  cc          TEXT NOT NULL DEFAULT '',
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  provider    TEXT NOT NULL DEFAULT '',      -- resend | cloudflare | ''
  provider_id TEXT NOT NULL DEFAULT '',
  error       TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL,
  envelope_from   TEXT NOT NULL DEFAULT '',  -- inbound: SMTP envelope sender (MAIL FROM) as handed over by Email Routing
  sender_verified INTEGER NOT NULL DEFAULT 0, -- inbound: 1 = DMARC pass for the From domain from a trusted Authentication-Results
  sender_auth     TEXT NOT NULL DEFAULT ''    -- inbound: summary, e.g. "dmarc=pass spf=pass dkim=pass (mx.cloudflare.net)" or "not checked"
);
CREATE INDEX IF NOT EXISTS messages_deal ON messages(deal_id, at);
CREATE INDEX IF NOT EXISTS messages_member_day ON messages(member_id, direction, at);
CREATE INDEX IF NOT EXISTS messages_deal_dir ON messages(deal_id, direction, at);
CREATE INDEX IF NOT EXISTS members_email ON members(email);
CREATE INDEX IF NOT EXISTS members_plan ON members(plan);

-- One-time login / activation codes (only their SHA-256 is stored). Created by POST /api/advisor/activation (platform key)
-- or POST /api/advisor/login/email (magic link to a verified member's own address); exchanged once at POST /api/advisor/login.
CREATE TABLE IF NOT EXISTS logins (
  code_hash   TEXT PRIMARY KEY,
  member_id   TEXT NOT NULL,
  purpose     TEXT NOT NULL,                 -- activation | email_link
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS logins_member ON logins(member_id, created_at);

-- Addresses a member has actually emailed (source out) or received a verified reply from (source in).
-- Used for the daily cap on NEW recipients and for recipients' opt-outs.
CREATE TABLE IF NOT EXISTS contacts (
  member_id     TEXT NOT NULL,
  addr          TEXT NOT NULL,
  source        TEXT NOT NULL,               -- out | in
  first_at      TEXT NOT NULL,
  opted_out_at  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (member_id, addr)
);
CREATE INDEX IF NOT EXISTS contacts_new ON contacts(member_id, source, first_at);

-- Activity log (deal created, stage changed, email sent, reply received…)
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id    TEXT NOT NULL DEFAULT '',
  member_id  TEXT NOT NULL,
  type       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_deal ON events(deal_id, at);

-- ===================== Janna-hosted introductory meetings (/api/meetings/*, src/meetings.js) =====================
-- One row per meeting: kind scheduled (booked for later, meeting.html#<id>) or instant (started live by Janna).
-- PII kept to what the meeting needs; the transcript column is only a fallback when no R2 bucket is bound and is cleared
-- once the summary email has been sent. Recordings/transcripts live in R2 (binding MEDIA) under meetings/<id>.*
CREATE TABLE IF NOT EXISTS meetings (
  id              TEXT PRIMARY KEY,            -- random 20 hex chars (the meeting link is the capability)
  kind            TEXT NOT NULL,               -- scheduled | instant
  status          TEXT NOT NULL,               -- scheduled | live | ended | missed | cancelled
  name            TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  email_key       TEXT NOT NULL DEFAULT '',    -- rate-limit key: lower case, no +tag (Gmail: no dots)
  phone           TEXT NOT NULL DEFAULT '',
  company         TEXT NOT NULL DEFAULT '',
  activity        TEXT NOT NULL DEFAULT '',
  markets         TEXT NOT NULL DEFAULT '',
  topic           TEXT NOT NULL DEFAULT '',
  language        TEXT NOT NULL DEFAULT 'ar',  -- ar | en
  consent         INTEGER NOT NULL DEFAULT 0,  -- 1 = visitor agreed to the recording (required before the transcript or recording is fetched, stored or emailed)
  starts_at       TEXT NOT NULL,               -- ISO UTC (shown in Africa/Cairo)
  duration_min    INTEGER NOT NULL DEFAULT 30,
  session_id      TEXT NOT NULL DEFAULT '',    -- Anam session id
  session_at      TEXT NOT NULL DEFAULT '',    -- server time the session id was handed in (the session must be live then)
  started_at      TEXT NOT NULL DEFAULT '',
  ended_at        TEXT NOT NULL DEFAULT '',
  agenda_done     TEXT NOT NULL DEFAULT '[]',  -- JSON array of agenda keys ticked in the overlay
  ip_hash         TEXT NOT NULL DEFAULT '',    -- SHA-256(MEETINGS_SECRET|IP), for rate limits only
  reminded_24h    TEXT NOT NULL DEFAULT '',    -- '' = due, timestamp = sent, 'n/a' = booked too late for it
  reminded_1h     TEXT NOT NULL DEFAULT '',
  proc_status     TEXT NOT NULL DEFAULT '',    -- '' | pending | done | partial | failed | rejected | none
  proc_attempts   INTEGER NOT NULL DEFAULT 0,
  proc_next_at    TEXT NOT NULL DEFAULT '',
  proc_error      TEXT NOT NULL DEFAULT '',
  session_checked INTEGER NOT NULL DEFAULT 0,  -- 1 = Anam session verified (Janna persona, inside the meeting window)
  transcript      TEXT NOT NULL DEFAULT '',
  transcript_key  TEXT NOT NULL DEFAULT '',
  recording_key   TEXT NOT NULL DEFAULT '',
  summary         TEXT NOT NULL DEFAULT '',    -- JSON {ar, en}
  emailed_at      TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meetings_status_start ON meetings(status, starts_at);
CREATE INDEX IF NOT EXISTS meetings_proc ON meetings(proc_status, proc_next_at);
CREATE INDEX IF NOT EXISTS meetings_email ON meetings(email, created_at);
CREATE INDEX IF NOT EXISTS meetings_email_key ON meetings(email_key, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS meetings_session ON meetings(session_id) WHERE session_id != '';
CREATE INDEX IF NOT EXISTS meetings_ip ON meetings(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS meeting_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  TEXT NOT NULL,
  type        TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS meeting_events_m ON meeting_events(meeting_id, at);

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
CREATE INDEX IF NOT EXISTS quotes_route ON quotes(route_id, created_at);
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
CREATE INDEX IF NOT EXISTS wa_messages_queue ON wa_messages(member_id, status, created_at);
-- once-a-day cron jobs (digest, deadline reminders, data sync)
CREATE TABLE IF NOT EXISTS cron_runs (
  job  TEXT NOT NULL,
  day  TEXT NOT NULL,
  at   TEXT NOT NULL,
  PRIMARY KEY (job, day)
);

-- Admin Control Center (panel.html), member self-service, payments, e-mail center, content overlay, page analytics, legacy import.
-- docs/janna/ACC-CONTRACT.md §2. PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS and INSERT OR IGNORE seeds —
-- no ALTER TABLE, no change to an existing table. Safe on any database built from schema.sql (+0002–0005) and safe to re-run.
-- The integrator also appends this file verbatim to schema.sql (new databases), so tests may exec schema.sql and then this file.
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0006_admin_center.sql

-- ============================================ staff, sessions, audit ============================================
CREATE TABLE IF NOT EXISTS cc_staff (
  member_id   TEXT PRIMARY KEY,                       -- members.id (bootstrap owners from ADMIN_EMAILS are never stored here)
  role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'support', 'seo', 'data')), -- seo / data = the team dashboards (ACC-CONTRACT §12.1)
  note        TEXT NOT NULL DEFAULT '',
  added_by    TEXT NOT NULL DEFAULT '',
  added_at    TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  disabled_at TEXT NOT NULL DEFAULT ''                 -- '' = active
);
CREATE TABLE IF NOT EXISTS cc_session_meta (
  sid_hash    TEXT PRIMARY KEY,                       -- auth_sessions.sid_hash of a session created by the old-password bridge
  via         TEXT NOT NULL CHECK (via IN ('code', 'legacy')),
  created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cc_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  actor_id    TEXT NOT NULL DEFAULT '',               -- members.id | 'platform' | 'system' | 'provider:<name>'
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,                          -- <area>.<verb>, e.g. member.plan, content.publish, pay.mark_paid
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  summary     TEXT NOT NULL DEFAULT '',
  before_json TEXT NOT NULL DEFAULT 'null',           -- changed fields only, secrets redacted
  after_json  TEXT NOT NULL DEFAULT 'null',
  ip_hash     TEXT NOT NULL DEFAULT '',
  req_id      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_audit_at ON cc_audit(at);
CREATE INDEX IF NOT EXISTS cc_audit_target ON cc_audit(target_type, target_id, at);
CREATE INDEX IF NOT EXISTS cc_audit_actor ON cc_audit(actor_id, at);
CREATE INDEX IF NOT EXISTS cc_audit_action ON cc_audit(action, at);
CREATE TABLE IF NOT EXISTS cc_locks (
  k      TEXT PRIMARY KEY,                            -- e.g. 'overlay:publish', 'cron:acc'
  until  TEXT NOT NULL,
  owner  TEXT NOT NULL DEFAULT ''
);

-- ============================================ members (extension, no ALTER on members) ============================================
CREATE TABLE IF NOT EXISTS cc_member_meta (
  member_id           TEXT PRIMARY KEY,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  requested_plan      TEXT NOT NULL DEFAULT '',       -- plan asked for (signup / legacy pending); cleared on activation
  suspended_plan      TEXT NOT NULL DEFAULT '',       -- plan held while suspended (members.plan = 'visitor' meanwhile)
  suspended_expires   TEXT NOT NULL DEFAULT '',
  source              TEXT NOT NULL DEFAULT '',       -- signup | admin | import | legacy_login | code | payment
  legacy_id           TEXT NOT NULL DEFAULT '',
  legacy_status       TEXT NOT NULL DEFAULT '',
  legacy_plan         TEXT NOT NULL DEFAULT '',
  legacy_plan_until   TEXT NOT NULL DEFAULT '',
  legacy_last_login   TEXT NOT NULL DEFAULT '',
  legacy_profile_json TEXT NOT NULL DEFAULT '{}',     -- old dashboard profile; admin + that member only, never public
  legacy_login_off    INTEGER NOT NULL DEFAULT 0,     -- 1 = old-password sign-in disabled for this account («مش انت؟» link)
  imported_hash       TEXT NOT NULL DEFAULT '',
  tags                TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_member_meta_status ON cc_member_meta(status, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS cc_member_meta_legacy ON cc_member_meta(legacy_id) WHERE legacy_id != '';
CREATE TABLE IF NOT EXISTS cc_customer_notes (
  email_key   TEXT PRIMARY KEY,                       -- common.js emailKey() of the buyer
  note        TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);

-- ============================================ legacy (old PHP system) ============================================
CREATE TABLE IF NOT EXISTS cc_import_runs (
  id           TEXT PRIMARY KEY,                      -- rid(12)
  started_by   TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'partial', 'failed', 'dry')),
  options_json TEXT NOT NULL DEFAULT '{}',
  counts_json  TEXT NOT NULL DEFAULT '{}',
  report_json  TEXT NOT NULL DEFAULT '[]',            -- per batch: {entity, dry_run, counts, errors[≤50]}
  note         TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cc_legacy_companies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id     TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',
  company_key   TEXT NOT NULL DEFAULT '',             -- text.js norm(company)
  manager       TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  phones        TEXT NOT NULL DEFAULT '',             -- ADMIN-ONLY, never rendered publicly
  email         TEXT NOT NULL DEFAULT '',             -- ADMIN-ONLY
  email_key     TEXT NOT NULL DEFAULT '',
  web           TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  activity      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '',             -- registered | lead (old system)
  factory_ref   TEXT NOT NULL DEFAULT '',             -- linked directory profile ('' = none); suggested_ref = best name match
  suggested_ref TEXT NOT NULL DEFAULT '',
  raw_json      TEXT NOT NULL DEFAULT '{}',           -- sanitised old row (no secrets)
  imported_hash TEXT NOT NULL DEFAULT '',
  run_id        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_legacy_companies_lid ON cc_legacy_companies(legacy_id) WHERE legacy_id != '';
CREATE INDEX IF NOT EXISTS cc_legacy_companies_key ON cc_legacy_companies(company_key);
CREATE INDEX IF NOT EXISTS cc_legacy_companies_email ON cc_legacy_companies(email_key);
CREATE INDEX IF NOT EXISTS cc_legacy_companies_ref ON cc_legacy_companies(factory_ref);
CREATE TABLE IF NOT EXISTS cc_legacy_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  email_key     TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'done')),
  legacy_at     TEXT NOT NULL DEFAULT '',             -- created_at in the old system
  imported_hash TEXT NOT NULL DEFAULT '',
  run_id        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  updated_by    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_legacy_messages_status ON cc_legacy_messages(status, legacy_at);
CREATE INDEX IF NOT EXISTS cc_legacy_messages_email ON cc_legacy_messages(email_key);
CREATE TABLE IF NOT EXISTS cc_legacy_rows (
  entity        TEXT NOT NULL,                        -- keywords | plans | settings | rfqs_private | … (raw archive, admin-only)
  legacy_id     TEXT NOT NULL,
  raw_json      TEXT NOT NULL DEFAULT '{}',
  run_id        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  PRIMARY KEY (entity, legacy_id)
);

-- ============================================ plans (single source of truth, §7) ============================================
CREATE TABLE IF NOT EXISTS cc_plan_keys (
  k           TEXT PRIMARY KEY,                       -- matrix row key
  type        TEXT NOT NULL CHECK (type IN ('number', 'bool')),
  label_ar    TEXT NOT NULL,
  label_en    TEXT NOT NULL,
  grp         TEXT NOT NULL DEFAULT 'features',        -- limits | markets | features | legacy
  enforced_by TEXT NOT NULL DEFAULT 'none',            -- comma list: worker, site, acc, janna, none
  sort        INTEGER NOT NULL DEFAULT 100,
  builtin     INTEGER NOT NULL DEFAULT 0,
  legacy_key  TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cc_plans (
  plan          TEXT PRIMARY KEY CHECK (plan IN ('visitor', 'profile', 'basic', 'premium', 'partner', 'strategic')),
  sort          INTEGER NOT NULL,
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  price_egp     INTEGER NOT NULL DEFAULT 0,           -- annual price in whole pounds, before VAT
  duration_days INTEGER NOT NULL DEFAULT 365,
  sellable      INTEGER NOT NULL DEFAULT 1,
  caps_json     TEXT NOT NULL DEFAULT '{}',           -- {"products":30,"images_per_product":1,"m_local":1,…}
  updated_by    TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL
);
INSERT OR IGNORE INTO cc_plan_keys (k, type, label_ar, label_en, grp, enforced_by, sort, builtin) VALUES
  ('products',           'number', 'عدد المنتجات في السوق',                     'Products in the marketplace',              'limits',   'acc,site,janna',    10, 1),
  ('images_per_product', 'number', 'صور لكل منتج',                              'Images per product',                       'limits',   'acc,site',          20, 1),
  ('m_local',            'bool',   'فرص وبيانات مصر',                           'Egypt opportunities & data',               'markets',  'worker,site,janna', 30, 1),
  ('m_gulf',             'bool',   'أسواق الخليج والدول العربية',                'Gulf & Arab markets',                      'markets',  'worker,site,janna', 31, 1),
  ('m_africa',           'bool',   'أسواق أفريقيا',                             'African markets',                          'markets',  'worker,site,janna', 32, 1),
  ('m_asia',             'bool',   'أسواق آسيا',                                'Asian markets',                            'markets',  'worker,site,janna', 33, 1),
  ('m_europe',           'bool',   'أسواق أوروبا',                              'European markets',                         'markets',  'worker,site,janna', 34, 1),
  ('alerts',             'bool',   'تنبيهات وملخصات بالجديد',                   'Alerts & digests',                         'features', 'worker,site',       40, 1),
  ('listing',            'bool',   'ملف الشركة في الدليل وتعديله',               'Directory listing & edits',                'features', 'acc,site',          41, 1),
  ('respond',            'bool',   'الرد على المناقصات وطلبات الأسعار',           'Respond to tenders & RFQs',                'features', 'site',              42, 1),
  ('incoming',           'bool',   'استقبال طلبات المشترين المطابقة تلقائياً',     'Receive matching buyer requests',          'features', 'worker,site,janna', 43, 1),
  ('stats',              'bool',   'إحصائيات حقيقية للملف',                      'Real profile statistics',                  'features', 'worker,site',       44, 1),
  ('priority',           'bool',   'أولوية في توزيع الطلبات',                    'Priority in request routing',              'features', 'worker,janna',      45, 1),
  ('featured',           'bool',   'أولوية في ترتيب القوائم والبحث',              'Priority in listings & search',            'features', 'site',              46, 1),
  ('bassem',             'bool',   'المستشار الذكي «باسم»',                       'AI advisor «Bassem»',                      'features', 'worker,site,janna', 47, 1),
  ('video',              'bool',   'فيديو في ملف الشركة',                         'Video on the company profile',             'features', 'acc,site',          48, 1),
  ('social',             'bool',   'روابط السوشيال في ملف الشركة',                'Social links on the company profile',      'features', 'acc,site',          49, 1);
INSERT OR IGNORE INTO cc_plans (plan, sort, name_ar, name_en, price_egp, duration_days, sellable, caps_json, updated_at) VALUES
  ('visitor',   0, 'زائر',                        'Visitor',                0,      0,   0, '{"products":0,"images_per_product":0,"m_local":0,"m_gulf":0,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":0,"listing":0,"respond":0,"incoming":0,"stats":0,"priority":0,"featured":0,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('profile',   1, 'تسجيل بيانات الشركة فقط',     'Company data only',      4000,   365, 1, '{"products":0,"images_per_product":0,"m_local":1,"m_gulf":0,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":0,"incoming":0,"stats":0,"priority":0,"featured":0,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('basic',     2, 'الباقة الأساسية',             'Basic plan',             10000,  365, 1, '{"products":30,"images_per_product":1,"m_local":1,"m_gulf":0,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":0,"featured":0,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('premium',   3, 'الباقة المميزة',              'Premium plan',           25000,  365, 1, '{"products":80,"images_per_product":1,"m_local":1,"m_gulf":1,"m_africa":0,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":1,"featured":1,"bassem":0,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('partner',   4, 'باقة الشريك الأساسي',         'Core Partner plan',      50000,  365, 1, '{"products":200,"images_per_product":1,"m_local":1,"m_gulf":1,"m_africa":1,"m_asia":0,"m_europe":0,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":1,"featured":1,"bassem":1,"video":0,"social":0}', '2026-11-18T00:00:00.000Z'),
  ('strategic', 5, 'باقة الشريك الاستراتيجي',     'Strategic Partner plan', 100000, 365, 1, '{"products":-1,"images_per_product":1,"m_local":1,"m_gulf":1,"m_africa":1,"m_asia":1,"m_europe":1,"alerts":1,"listing":1,"respond":1,"incoming":1,"stats":1,"priority":1,"featured":1,"bassem":1,"video":0,"social":0}', '2026-11-18T00:00:00.000Z');

-- ============================================ settings & secrets ============================================
CREATE TABLE IF NOT EXISTS cc_settings (
  k           TEXT PRIMARY KEY,                       -- e.g. contact_email, pay.provider, mail.from_email, legacy.<k>
  scope       TEXT NOT NULL CHECK (scope IN ('public', 'pay', 'mail', 'system', 'custom')),
  v           TEXT NOT NULL DEFAULT '',               -- plain string, or JSON for structured values (see §2.2)
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
INSERT OR IGNORE INTO cc_settings (k, scope, v, updated_at) VALUES
  ('contact_email',     'public', 'info@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('support_email',     'public', 'support@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('hotline_display',   'public', '02 38346757', '2026-11-18T00:00:00.000Z'),
  ('hotline_tel',       'public', '+20238346757', '2026-11-18T00:00:00.000Z'),
  ('whatsapp_display',  'public', '01279188996', '2026-11-18T00:00:00.000Z'),
  ('whatsapp_number',   'public', '201279188996', '2026-11-18T00:00:00.000Z'),
  ('address_ar',        'public', 'الجيزة – مدينة السادس من أكتوبر – الحي 11 – وجه الثقافة والعلوم – عمارة 56 (الدور الثالث)، جمهورية مصر العربية', '2026-11-18T00:00:00.000Z'),
  ('address_en',        'public', '', '2026-11-18T00:00:00.000Z'),
  ('social_facebook',   'public', 'https://www.facebook.com/profile.php?id=61595683961104', '2026-11-18T00:00:00.000Z'),
  ('social_x',          'public', 'https://x.com/egy_business_eg', '2026-11-18T00:00:00.000Z'),
  ('social_instagram',  'public', 'https://www.instagram.com/mnstmsrllmnaqsat/', '2026-11-18T00:00:00.000Z'),
  ('social_linkedin',   'public', 'https://www.linkedin.com/in/%D9%85%D9%86%D8%B5%D8%A9-%D9%85%D8%B5%D8%B1-%D9%84%D9%84%D9%85%D9%86%D8%A7%D9%82%D8%B5%D8%A7%D8%AA-%D9%88%D8%A7%D9%84%D9%85%D9%88%D8%B1%D8%AF%D9%8A%D9%86-egyptbusinessgate-8a6346450/', '2026-11-18T00:00:00.000Z'),
  ('social_youtube',    'public', 'https://www.youtube.com/@egyptbusinessgate', '2026-11-18T00:00:00.000Z'),
  ('operator_ar',       'public', 'الجمعية المصرية للتنمية الصناعية', '2026-11-18T00:00:00.000Z'),
  ('operator_en',       'public', '', '2026-11-18T00:00:00.000Z'),
  ('operator_reg_ar',   'public', 'جمعية غير هادفة للربح مشهرة برقم 6189 لسنة 2017 (وزارة التضامن الاجتماعي)', '2026-11-18T00:00:00.000Z'),
  ('operator_reg_en',   'public', '', '2026-11-18T00:00:00.000Z'),
  ('operator_url',      'public', 'https://eafid.org/', '2026-11-18T00:00:00.000Z'),
  ('tax_no',            'public', '', '2026-11-18T00:00:00.000Z'),
  ('cr_no',             'public', '', '2026-11-18T00:00:00.000Z'),
  ('vat_bp',            'public', '1400', '2026-11-18T00:00:00.000Z'),
  ('billing_email',     'public', '', '2026-11-18T00:00:00.000Z'),
  ('manual_pay_ar',     'public', '', '2026-11-18T00:00:00.000Z'),
  ('manual_pay_en',     'public', '', '2026-11-18T00:00:00.000Z'),
  ('mail.enabled',      'mail',   '0', '2026-11-18T00:00:00.000Z'),
  ('mail.provider',     'mail',   'resend', '2026-11-18T00:00:00.000Z'),
  ('mail.from_email',   'mail',   'noreply@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('mail.from_name',    'mail',   'منصة صنع في مصر', '2026-11-18T00:00:00.000Z'),
  ('mail.reply_to',     'mail',   'info@madeinegyptgate.com', '2026-11-18T00:00:00.000Z'),
  ('pay.enabled',       'pay',    '0', '2026-11-18T00:00:00.000Z'),
  ('pay.provider',      'pay',    '', '2026-11-18T00:00:00.000Z'),
  ('pay.mode',          'pay',    'test', '2026-11-18T00:00:00.000Z'),
  ('pay.currency',      'pay',    'EGP', '2026-11-18T00:00:00.000Z'),
  ('pay.manual_fallback','pay',   '0', '2026-11-18T00:00:00.000Z'),
  ('overlay.enabled',   'system', '1', '2026-11-18T00:00:00.000Z'),
  ('persona.auto_sync', 'system', '1', '2026-11-18T00:00:00.000Z');
CREATE TABLE IF NOT EXISTS cc_secrets (
  name    TEXT PRIMARY KEY,                           -- slot names in ACC-CONTRACT §0.7
  sealed  TEXT NOT NULL,                              -- "v1.<iv>.<ciphertext>" (AES-GCM, CONFIG_SECRET)
  tail    TEXT NOT NULL DEFAULT '',                   -- last 4 characters, for the masked display only
  set_by  TEXT NOT NULL DEFAULT '',
  set_at  TEXT NOT NULL
);

-- ============================================ content overlay, edge actions, media (§4) ============================================
CREATE TABLE IF NOT EXISTS cc_content (
  id           TEXT PRIMARY KEY,                      -- adds: collection id (c-xxxxxxxx, TEN-2026-C001 …); base rows: 'e-' || rid(8)
  coll         TEXT NOT NULL,                         -- fac facx prod tend rfq offer zone news event award opp intl video proj banner notice cats
  kind         TEXT NOT NULL CHECK (kind IN ('base', 'add')),
  base_key     TEXT NOT NULL DEFAULT '',              -- kind base: the collection key of the base row (§4.4)
  state        TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'published', 'unpublished')),
  draft_json   TEXT NOT NULL DEFAULT '{}',            -- working copy: changed named fields (base) / full record (add)
  live_json    TEXT NOT NULL DEFAULT '',              -- published copy ('' = never published)
  hidden       INTEGER NOT NULL DEFAULT 0,            -- 1 = hidden (draft side)
  live_hidden  INTEGER NOT NULL DEFAULT 0,            -- 1 = hidden in the published overlay
  deleted      INTEGER NOT NULL DEFAULT 0,            -- 1 = deleted (adds: removed; base: hidden + edge redirect)
  private_json TEXT NOT NULL DEFAULT '{}',            -- admin-only fields (rfq client, phone, e-mail, channel; inquiry ref) — never compiled
  seo_path     TEXT NOT NULL DEFAULT '',              -- the static SEO page of this item, when one exists (computed by the panel, §4.10)
  static_impact INTEGER NOT NULL DEFAULT 0,           -- 1 = a rebuild is needed for static pages to show the published change
  source       TEXT NOT NULL DEFAULT 'admin',         -- admin | member | import
  member_id    TEXT NOT NULL DEFAULT '',              -- member submissions (products, company changes)
  rev          INTEGER NOT NULL DEFAULT 0,            -- bumped on every draft change
  published_v  INTEGER NOT NULL DEFAULT 0,            -- overlay version that first contained the current live copy
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL,
  published_by TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_content_base ON cc_content(coll, base_key) WHERE kind = 'base';
CREATE INDEX IF NOT EXISTS cc_content_coll ON cc_content(coll, state, updated_at);
CREATE INDEX IF NOT EXISTS cc_content_pub ON cc_content(published_v);
CREATE TABLE IF NOT EXISTS cc_overlay (
  v           INTEGER PRIMARY KEY,                    -- version = publish time in ms (strictly increasing)
  at          TEXT NOT NULL,
  by          TEXT NOT NULL DEFAULT '',
  bytes       INTEGER NOT NULL DEFAULT 0,
  sha         TEXT NOT NULL DEFAULT '',
  counts_json TEXT NOT NULL DEFAULT '{}',             -- {coll: {e, h, a}}
  js          TEXT NOT NULL DEFAULT '',               -- the compiled /data/overlay.js (kept for the last 20 versions)
  note        TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS cc_edge (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id  TEXT NOT NULL,
  path        TEXT NOT NULL,                          -- static SEO path (decoded NFC, trailing slash)
  action      TEXT NOT NULL CHECK (action IN ('noindex', 'redirect', 'restore')),
  to_path     TEXT NOT NULL DEFAULT '',
  before_json TEXT NOT NULL DEFAULT 'null',           -- the SEO override/redirect that existed before (restored on unhide)
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'cancelled')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  error       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  done_at     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_edge_status ON cc_edge(status, created_at);
CREATE INDEX IF NOT EXISTS cc_edge_content ON cc_edge(content_id);
CREATE TABLE IF NOT EXISTS cc_media (
  id           TEXT PRIMARY KEY,                      -- rid(16)
  r2_key       TEXT NOT NULL UNIQUE,                  -- u/<yyyy>/<id>.<ext>
  owner_type   TEXT NOT NULL CHECK (owner_type IN ('admin', 'member')),
  owner_id     TEXT NOT NULL,
  purpose      TEXT NOT NULL CHECK (purpose IN ('logo', 'product', 'banner', 'news', 'event', 'zone', 'offer', 'project', 'notice', 'other')),
  mime         TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes        INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'public', 'rejected', 'deleted')),
  orig_name    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  approved_by  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_media_owner ON cc_media(owner_type, owner_id, created_at);
CREATE INDEX IF NOT EXISTS cc_media_sha ON cc_media(sha256);

-- ============================================ member self-service (§8) ============================================
CREATE TABLE IF NOT EXISTS cc_member_products (
  id            TEXT PRIMARY KEY,                     -- 'p-' || rid(8); the same id becomes the published prod row id
  member_id     TEXT NOT NULL,
  factory_ref   TEXT NOT NULL DEFAULT '',             -- the member's directory profile at submission time
  state         TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'pending', 'approved', 'rejected', 'hidden', 'deleted')),
  draft_json    TEXT NOT NULL DEFAULT '{}',           -- {name, name_en, category, description, description_en, price, images:[media ids]}
  live_json     TEXT NOT NULL DEFAULT '',             -- last approved version
  reject_reason TEXT NOT NULL DEFAULT '',
  submitted_at  TEXT NOT NULL DEFAULT '',
  reviewed_by   TEXT NOT NULL DEFAULT '',
  reviewed_at   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_member_products_member ON cc_member_products(member_id, state);
CREATE INDEX IF NOT EXISTS cc_member_products_queue ON cc_member_products(state, submitted_at);
CREATE TABLE IF NOT EXISTS cc_company_requests (
  id            TEXT PRIMARY KEY,                     -- 'cr-' || rid(10)
  member_id     TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('edit', 'claim', 'create')),
  factory_ref   TEXT NOT NULL DEFAULT '',             -- edit/claim: the listing (index, x<i> or c-… id)
  fields_json   TEXT NOT NULL DEFAULT '{}',
  state         TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'approved', 'rejected', 'withdrawn')),
  reject_reason TEXT NOT NULL DEFAULT '',
  reviewed_by   TEXT NOT NULL DEFAULT '',
  reviewed_at   TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_company_requests_member ON cc_company_requests(member_id, created_at);
CREATE INDEX IF NOT EXISTS cc_company_requests_queue ON cc_company_requests(state, created_at);

-- ============================================ payments (§5) ============================================
CREATE TABLE IF NOT EXISTS cc_counters (
  k  TEXT PRIMARY KEY,                                -- inv:<yyyy> | rfq | tend:<yyyy> | opp | proj
  n  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cc_invoices (
  id            TEXT PRIMARY KEY,                     -- rid(16)
  no            TEXT NOT NULL UNIQUE,                 -- INV-<yyyy>-<000001>
  member_id     TEXT NOT NULL DEFAULT '',             -- '' until the buyer has an account (linked at payment / sign-in)
  email         TEXT NOT NULL,
  email_key     TEXT NOT NULL,
  company       TEXT NOT NULL DEFAULT '',
  plan          TEXT NOT NULL,
  plan_name     TEXT NOT NULL DEFAULT '',             -- frozen at issue
  period_days   INTEGER NOT NULL,
  period_end    TEXT NOT NULL DEFAULT '',             -- fixed end of the paid period: a prorated upgrade ends with the plan in force (Terms §5); '' = activation + period_days
  net_minor     INTEGER NOT NULL,                     -- piasters
  vat_bp        INTEGER NOT NULL,
  vat_minor     INTEGER NOT NULL,
  total_minor   INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EGP',
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void', 'refunded')),
  source        TEXT NOT NULL CHECK (source IN ('signup', 'renewal', 'upgrade', 'admin', 'member', 'test')),
  inquiry_ref   TEXT NOT NULL DEFAULT '',             -- the signup request (kind=signup) that caused it
  pay_token     TEXT NOT NULL UNIQUE,                 -- 32-char b64url secret for pay.html#inv=…
  test          INTEGER NOT NULL DEFAULT 0,           -- 1 = owner's sandbox invoice (never activates a real plan)
  issued_at     TEXT NOT NULL,
  due_at        TEXT NOT NULL DEFAULT '',
  paid_at       TEXT NOT NULL DEFAULT '',
  paid_via      TEXT NOT NULL DEFAULT '',             -- webhook | return | query | manual
  provider      TEXT NOT NULL DEFAULT '',
  provider_ref  TEXT NOT NULL DEFAULT '',
  manual_ref    TEXT NOT NULL DEFAULT '',             -- bank / InstaPay reference typed by the admin
  notes         TEXT NOT NULL DEFAULT '',
  issued_mail_at TEXT NOT NULL DEFAULT '',            -- invoice e-mail sent
  link_mail_at  TEXT NOT NULL DEFAULT '',             -- payment-link e-mail sent (online gateway ready)
  reminder_at   TEXT NOT NULL DEFAULT '',
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_invoices_inquiry ON cc_invoices(inquiry_ref) WHERE inquiry_ref != '';
CREATE INDEX IF NOT EXISTS cc_invoices_member ON cc_invoices(member_id, created_at);
CREATE INDEX IF NOT EXISTS cc_invoices_email ON cc_invoices(email_key, created_at);
CREATE INDEX IF NOT EXISTS cc_invoices_status ON cc_invoices(status, issued_at);
CREATE TABLE IF NOT EXISTS cc_payments (
  id            TEXT PRIMARY KEY,                     -- rid(16)
  invoice_id    TEXT NOT NULL,
  provider      TEXT NOT NULL CHECK (provider IN ('ngenius', 'paymob', 'paytabs', 'manual')),
  mode          TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  provider_ref  TEXT NOT NULL DEFAULT '',             -- N-Genius order reference | Paymob intention id | PayTabs tran_ref
  provider_txn  TEXT NOT NULL DEFAULT '',             -- Paymob transaction id | N-Genius payment id | PayTabs tran_ref
  provider_order TEXT NOT NULL DEFAULT '',            -- Paymob intention_order_id
  amount_minor  INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EGP',
  status        TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'redirected', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
  raw_status    TEXT NOT NULL DEFAULT '',
  verified_via  TEXT NOT NULL DEFAULT '',
  error         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_payments_invoice ON cc_payments(invoice_id, created_at);
CREATE INDEX IF NOT EXISTS cc_payments_ref ON cc_payments(provider, provider_ref);
CREATE TABLE IF NOT EXISTS cc_pay_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider     TEXT NOT NULL,
  event_key    TEXT NOT NULL,                         -- provider + txn/order id + status: idempotency key
  kind         TEXT NOT NULL CHECK (kind IN ('webhook', 'return', 'query', 'manual')),
  invoice_id   TEXT NOT NULL DEFAULT '',
  payment_id   TEXT NOT NULL DEFAULT '',
  verified     INTEGER NOT NULL DEFAULT 0,
  result       TEXT NOT NULL DEFAULT '',              -- paid | failed | pending | ignored | rejected:<why>
  payload_sha  TEXT NOT NULL DEFAULT '',              -- sha256 of the raw body (the body itself is not stored)
  created_at   TEXT NOT NULL,
  UNIQUE (provider, event_key)
);
CREATE INDEX IF NOT EXISTS cc_pay_events_invoice ON cc_pay_events(invoice_id, created_at);

-- ============================================ e-mail center (§6) ============================================
CREATE TABLE IF NOT EXISTS cc_mail_templates (
  key         TEXT PRIMARY KEY,                       -- template key (§6.1)
  enabled     INTEGER NOT NULL DEFAULT 1,             -- ignored for required templates
  subject_ar  TEXT NOT NULL DEFAULT '',               -- '' = default; may contain {{subject}} and the template's {{vars}}
  subject_en  TEXT NOT NULL DEFAULT '',
  intro_ar    TEXT NOT NULL DEFAULT '',               -- text added before the body
  intro_en    TEXT NOT NULL DEFAULT '',
  outro_ar    TEXT NOT NULL DEFAULT '',               -- text added after the body
  outro_en    TEXT NOT NULL DEFAULT '',
  body_ar     TEXT NOT NULL DEFAULT '',               -- full body (only templates with "vars":true)
  body_en     TEXT NOT NULL DEFAULT '',
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cc_mail_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  msg_id      TEXT NOT NULL DEFAULT '',               -- the caller's message id (idempotency)
  template    TEXT NOT NULL DEFAULT '',
  list        TEXT NOT NULL DEFAULT '',
  to_hash     TEXT NOT NULL DEFAULT '',               -- keyed hash of the lower-cased recipient (search by exact address)
  to_masked   TEXT NOT NULL DEFAULT '',               -- a•••@domain
  subject     TEXT NOT NULL DEFAULT '',               -- ≤ 120 chars; sign-in codes are masked (••••••)
  provider    TEXT NOT NULL DEFAULT '',               -- resend | brevo | cloudflare | ''
  provider_id TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error       TEXT NOT NULL DEFAULT '',
  ms          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cc_mail_log_at ON cc_mail_log(at);
CREATE INDEX IF NOT EXISTS cc_mail_log_to ON cc_mail_log(to_hash, at);
CREATE INDEX IF NOT EXISTS cc_mail_log_tpl ON cc_mail_log(template, at);
CREATE INDEX IF NOT EXISTS cc_mail_log_msg ON cc_mail_log(msg_id);

-- ============================================ page analytics (§3.1.12; no raw IPs) ============================================
CREATE TABLE IF NOT EXISTS cc_pv_day (
  day          TEXT PRIMARY KEY,                      -- Cairo date
  views        INTEGER NOT NULL DEFAULT 0,
  uniq         INTEGER NOT NULL DEFAULT 0,            -- unique visitors that day (daily-salted keyed hash)
  mobile_uniq  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cc_pv_page (
  day    TEXT NOT NULL,
  path   TEXT NOT NULL,
  views  INTEGER NOT NULL DEFAULT 0,
  uniq   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
CREATE TABLE IF NOT EXISTS cc_pv_src (
  day  TEXT NOT NULL,
  src  TEXT NOT NULL,                                 -- direct | google | bing | facebook | x | linkedin | youtube | instagram | whatsapp | <host>
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, src)
);
CREATE TABLE IF NOT EXISTS cc_pv_seen (
  h    TEXT PRIMARY KEY,                              -- sha256(secret|pv|day|ip hash|ua family|scope) — purged after 2 days
  day  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cc_pv_seen_day ON cc_pv_seen(day);

-- ============================================ Janna / Bassem persona sync (§7.5) ============================================
CREATE TABLE IF NOT EXISTS cc_persona_sync (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id  TEXT NOT NULL,
  at          TEXT NOT NULL,
  by          TEXT NOT NULL DEFAULT '',
  plans_v     TEXT NOT NULL DEFAULT '',               -- plans updated_at used for the generated section
  status      TEXT NOT NULL CHECK (status IN ('ok', 'unchanged', 'failed', 'dry')),
  before_sha  TEXT NOT NULL DEFAULT '',
  after_sha   TEXT NOT NULL DEFAULT '',
  error       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cc_persona_sync_p ON cc_persona_sync(persona_id, at);

-- 0007 — the member's business profile that Bassem records during the live call («باسم سجّل بيانات مصنعك»): products, specs,
-- capacity, target markets, certifications, export experience, notes (worker/src/profile.js, POST/GET /api/advisor/profile).
-- One row per member; the member and the Control Center staff (bassem.read) read it, only the member (or Bassem in his call) writes it.
-- It is fed back into Bassem's next session context (memberProfile()), so he does not ask the same questions twice.
-- PURELY ADDITIVE AND IDEMPOTENT (CREATE … IF NOT EXISTS only): safe to run twice. Until it is applied the endpoint answers
-- 503 profile_store_off and everything else keeps working.
-- Apply: wrangler d1 execute migate-db --remote --file=./migrations/0007_member_profile.sql   (and append this file to schema.sql)
CREATE TABLE IF NOT EXISTS member_profiles (
  member_id    TEXT PRIMARY KEY,                    -- members.id
  profile_json TEXT NOT NULL DEFAULT '{}',          -- {products[], specs, capacity, target_markets[], certifications[], export_experience, notes}
  source       TEXT NOT NULL DEFAULT 'member',      -- who wrote the last change: bassem (live-call tool) | member
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- Bassem's memory («ذاكرة باسم», src/memory.js): per member, the searches Bassem ran (platform directory, intel centre, web), the turns
-- of each live call, one deterministic summary per call and the facts the member stated. Read back at the start of the next call
-- (memoryContext → janna-session.js) and on demand (GET /api/advisor/memory?q=…).
-- PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS — no ALTER TABLE, no change to an existing table, no
-- seed rows. Safe on any database built from schema.sql (+0002–0006/0007) and safe to re-run. The integrator also appends this file
-- verbatim to schema.sql (new databases); tests exec schema.sql and then this file.
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0008_advisor_memory.sql
-- MEMORY POLICY (owner, 2026-11-18): the memory is PERMANENT and only grows — no member-facing deletion, no age-based retention, no
--   per-member row cap; the daily platform cron consolidates (a call without its final summary gets it rebuilt), it never deletes.
--   The only erasure is the owner's audited deletion of a whole member account for a formal legal data-subject request (Egyptian PDPL
--   151/2020: src/acc-members.js deleteMember, owner-only, reason required). E-mail addresses and phone numbers are masked BEFORE
--   storage; staff (Control Center bassem.read) can only read, and every staff read leaves one cc_audit row (bassem.memory_read).
-- kind: search | turn | summary | fact are written today; task | question | day are reserved for the next memory upgrade (tasks Bassem did,
--   questions the member asked, the daily consolidated digest) so they need no table rebuild. agent: bassem today; janna for her memory.
CREATE TABLE IF NOT EXISTS advisor_memory (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  TEXT NOT NULL,                             -- members.id — only the member himself writes
  kind       TEXT NOT NULL CHECK (kind IN ('search', 'turn', 'summary', 'fact', 'task', 'question', 'day')),
  call_id    TEXT NOT NULL DEFAULT '',                  -- the live call ([A-Za-z0-9_.:-]{6,80}, the Anam session id); '' = outside a call
  at         TEXT NOT NULL,                             -- ISO time (server clock) of the first write; summaries / searches: the last update
  text       TEXT NOT NULL DEFAULT '',                  -- masked display text: turn / fact / summary line / query + best results (≤ 1,200)
  terms      TEXT NOT NULL DEFAULT '',                  -- " t1 t2 … " normalised search tokens (Arabic normalisation + English → Arabic)
  data_json  TEXT NOT NULL DEFAULT '{}',                -- kind-specific structure (≤ 6 KB): search {tool, query, market, count, results[≤5], sq,
                                                        --   new_since?} | turn {role, seq} | summary {topics, products, markets, opened, emails,
                                                        --   next, failed, said, tools, …} | fact {}
  hash       TEXT NOT NULL,                             -- de-duplication key within the member: a re-sent turn / search / fact updates its row
  agent      TEXT NOT NULL DEFAULT 'bassem' CHECK (agent IN ('bassem', 'janna'))   -- whose memory (Janna's: the next upgrade)
);
CREATE UNIQUE INDEX IF NOT EXISTS advisor_memory_dedup ON advisor_memory(member_id, hash);
CREATE INDEX IF NOT EXISTS advisor_memory_member ON advisor_memory(member_id, kind, id);
CREATE INDEX IF NOT EXISTS advisor_memory_call ON advisor_memory(member_id, call_id, kind);
CREATE INDEX IF NOT EXISTS advisor_memory_age ON advisor_memory(kind, at);
CREATE INDEX IF NOT EXISTS advisor_memory_when ON advisor_memory(member_id, at);   -- recall by day («امبارح», «آخر مرة»)

-- 0009 — memory upgrades (owner, 2026-11-18 23:50: «ذاكرة باسم وجنة مهمين جداً … ذاكرة محدّثة يومياً، وأي تاسكات عملوها أو أسئلة
-- اتسألوها تتخزن عندهم، عشان ذاكرتهم هي اللي هتخلّي بنك معلوماتهم يكبر»):
--   memory_tasks    the tasks Bassem / Janna started, promised or were asked to do (src/tasks.js): open / done / cancelled, due date,
--                   the call they came from; created from tool outcomes and the client's requests, closed when the matching tool succeeds
--   memory_briefs   «ملخص العميل»: ONE persistent brief per client and persona (≤ 1,500 characters), refreshed by the daily job
--                   (src/daily.js) and given to every call at its start
--   janna_visitors  Janna's visitors (src/visitor.js): the random first-party visitor id the page keeps, KEYED HASHES of the e-mail /
--                   mobile they gave her (never the address or the number), the member account they registered (link), stage, interest
--   knowledge_bank  «بنك المعلومات» (src/knowledge.js): every question asked to Janna or Bassem with personal data stripped (no names,
--                   companies, e-mails, phones or ids), the best short answer, its source and counters; «محتاجة إجابة» for the team
-- Janna's call memory itself lives in advisor_memory (0008) with agent = 'janna' and member_id = 'v:' + the visitor id, and the daily
-- digest of a client's day is advisor_memory kind 'day' (both already allowed by 0008), so 0008 needs no change.
-- PURELY ADDITIVE AND IDEMPOTENT: only CREATE TABLE / CREATE INDEX IF NOT EXISTS — no ALTER, no DROP, no change to an existing table, no
-- seed rows. Safe on any database built from schema.sql (+0006 / 0007 / 0008) and safe to re-run. Also appended verbatim to schema.sql.
--   npx wrangler d1 execute migate-db --remote --file=./migrations/0009_memory_upgrades.sql
-- MEMORY POLICY (owner, 2026-11-18): the memory is permanent — no member-facing or visitor-facing deletion and no age-based deletion.
--   The ONLY erasure is the owner's audited Control Center action for a formal legal data-subject request (Egyptian PDPL 151/2020):
--   POST /api/admin/cc/memory/erase (owner only, one person per call, legal reason required, one cc_audit row) and the account deletion
--   (src/acc-members.js deleteMember). A storage safety valve far above any real client (50,000 raw call turns / 10,000 searches per
--   client) may remove raw turns / searches ONLY when they are already covered by that client's day digest (kind 'day') and older than
--   30 days; summaries, day digests, facts, tasks, briefs and the knowledge bank are never pruned.
CREATE TABLE IF NOT EXISTS memory_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,                             -- whose task: members.id, or 'v:' + a Janna visitor id
  agent       TEXT NOT NULL DEFAULT 'bassem' CHECK (agent IN ('bassem', 'janna')),
  kind        TEXT NOT NULL DEFAULT 'other',             -- follow | deal | email | whatsapp | schedule | meeting | profile | register | quote | search | other
  title       TEXT NOT NULL,                             -- masked, cleaned text (≤ 160 characters)
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  source      TEXT NOT NULL DEFAULT 'tool',              -- request (the client asked) | promise (the persona said she / he would) | failed (a tool
                                                         --   that did not happen) | tool (a tool started it) | persona (the tasks tool) | staff
  due         TEXT NOT NULL DEFAULT '',                  -- Cairo local time 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'; '' = no date
  call_id     TEXT NOT NULL DEFAULT '',                  -- the live call it came from ('' = outside a call)
  ref         TEXT NOT NULL DEFAULT '',                  -- an item / deal reference when one is known
  tkey        TEXT NOT NULL,                             -- de-duplication key within (subject, agent)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  done_at     TEXT NOT NULL DEFAULT '',
  done_by     TEXT NOT NULL DEFAULT '',                  -- tool:<name> | persona | cron:<why>
  data_json   TEXT NOT NULL DEFAULT '{}'                 -- {seq, family, words…}
);
CREATE UNIQUE INDEX IF NOT EXISTS memory_tasks_key ON memory_tasks(subject, agent, tkey);
CREATE INDEX IF NOT EXISTS memory_tasks_open ON memory_tasks(subject, agent, status, due);
CREATE INDEX IF NOT EXISTS memory_tasks_status ON memory_tasks(status, kind, updated_at);
CREATE INDEX IF NOT EXISTS memory_tasks_day ON memory_tasks(subject, created_at);

CREATE TABLE IF NOT EXISTS memory_briefs (
  subject     TEXT NOT NULL,                             -- members.id, or 'v:' + a Janna visitor id
  agent       TEXT NOT NULL DEFAULT 'bassem' CHECK (agent IN ('bassem', 'janna')),
  text        TEXT NOT NULL DEFAULT '',                  -- «ملخص العميل», ≤ 1,500 characters, masked
  data_json   TEXT NOT NULL DEFAULT '{}',                -- the sections {who, makes, markets, history, topics, deals, tasks, promises, prefs}
  day         TEXT NOT NULL DEFAULT '',                  -- the Cairo day the daily job built it for
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (subject, agent)
);

CREATE TABLE IF NOT EXISTS janna_visitors (
  visitor_id    TEXT PRIMARY KEY,                        -- the random first-party id the page keeps in localStorage ([0-9a-f]{32})
  member_id     TEXT NOT NULL DEFAULT '',                -- members.id once linked
  link_via      TEXT NOT NULL DEFAULT '',                -- session (signed in on that browser) | email | phone (matched by the daily job)
  linked_at     TEXT NOT NULL DEFAULT '',
  email_hash    TEXT NOT NULL DEFAULT '',                -- keyed hash (HMAC) of the normalised e-mail the visitor gave Janna — never the address
  phone_hash    TEXT NOT NULL DEFAULT '',                -- keyed hash (HMAC) of the normalised mobile — never the number
  first_at      TEXT NOT NULL,
  last_at       TEXT NOT NULL,
  calls         INTEGER NOT NULL DEFAULT 0,
  stage         TEXT NOT NULL DEFAULT 'new',             -- new | browsing | interested | lead | registering | member
  interest_json TEXT NOT NULL DEFAULT '{}',              -- {products[], markets[], sections[], plans[]}
  lang          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS janna_visitors_member ON janna_visitors(member_id);
CREATE INDEX IF NOT EXISTS janna_visitors_email ON janna_visitors(email_hash);
CREATE INDEX IF NOT EXISTS janna_visitors_phone ON janna_visitors(phone_hash);
CREATE INDEX IF NOT EXISTS janna_visitors_last ON janna_visitors(last_at);

CREATE TABLE IF NOT EXISTS knowledge_bank (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  qkey         TEXT NOT NULL UNIQUE,                     -- hash of the normalised question (intent + sorted content words)
  question     TEXT NOT NULL,                            -- the question, personal data stripped (≤ 200 characters)
  intent       TEXT NOT NULL DEFAULT 'other',            -- plans | register | payment | tenders | rfq | export | markets | factories | products | bassem | meeting | platform | other
  terms        TEXT NOT NULL DEFAULT '',                 -- " t1 t2 … " normalised words (lookup + near-duplicate merge)
  answer       TEXT NOT NULL DEFAULT '',                 -- the best short answer given (personal data stripped, ≤ 400 characters)
  source       TEXT NOT NULL DEFAULT '',                 -- the tool / data source of that answer (janna_lookup, bassem_intel, …), conversation, team
  source_rank  INTEGER NOT NULL DEFAULT 0,               -- team 9 · platform data 3 · platform pages 2 · web 1 · conversation 0
  status       TEXT NOT NULL DEFAULT 'answered' CHECK (status IN ('answered', 'needs_answer', 'team', 'hidden')), -- needs_answer = «محتاجة إجابة»
  asked        INTEGER NOT NULL DEFAULT 1,               -- how many calls asked it
  subjects     INTEGER NOT NULL DEFAULT 1,               -- about how many different clients asked it
  agents       TEXT NOT NULL DEFAULT '',                 -- " bassem janna "
  lang         TEXT NOT NULL DEFAULT '',
  merged_into  INTEGER NOT NULL DEFAULT 0,               -- a near-duplicate merged by the daily job: the entry it went into (this row stays)
  first_at     TEXT NOT NULL,
  last_at      TEXT NOT NULL,
  answered_by  TEXT NOT NULL DEFAULT '',                 -- the staff member who answered / approved it (members.id)
  answered_at  TEXT NOT NULL DEFAULT '',
  data_json    TEXT NOT NULL DEFAULT '{}'                -- {seen: [short keyed hashes of the askers, ≤ 64], answers: n}
);
CREATE INDEX IF NOT EXISTS knowledge_bank_status ON knowledge_bank(status, asked);
CREATE INDEX IF NOT EXISTS knowledge_bank_intent ON knowledge_bank(intent, merged_into);
CREATE INDEX IF NOT EXISTS knowledge_bank_last ON knowledge_bank(last_at);

-- 0010 — account deletion requests (app parity plan 2026-11-20, item account-delete-request; switches account_delete /
-- visitor_erase_request, both OFF). A request deletes nothing: the owner runs the audited deletion / erasure and marks it done
-- (delete-requests.js, data/acc-delete.js). Applied to the live database ONLY by the manual d1-migrate workflow:
--   Actions → d1-migrate → Run workflow: migration = 0010_delete_requests.sql, confirm = migate-db
CREATE TABLE IF NOT EXISTS cc_delete_requests (
  id          TEXT PRIMARY KEY,                         -- dr-<10 hex>
  kind        TEXT NOT NULL CHECK (kind IN ('member', 'visitor')),
  member_id   TEXT NOT NULL DEFAULT '',                 -- kind member: members.id (the account that asked, signed in)
  visitor_id  TEXT NOT NULL DEFAULT '',                 -- kind visitor: Janna's random visitor id (32 hex) — never an e-mail or a phone
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'rejected')),
  lang        TEXT NOT NULL DEFAULT 'ar',               -- the language of the page it was asked from
  source      TEXT NOT NULL DEFAULT 'web',              -- web | app-ios | app-android (the platform's own apps, MIGApp user agent)
  created_at  TEXT NOT NULL,
  decided_at  TEXT NOT NULL DEFAULT '',
  decided_by  TEXT NOT NULL DEFAULT '',                 -- the owner who closed it
  note        TEXT NOT NULL DEFAULT ''                  -- the owner's note (team only, never shown publicly)
);
CREATE INDEX IF NOT EXISTS cc_delete_requests_status ON cc_delete_requests(status, created_at);
-- one open request per account and per visitor id (a repeat answers the same row)
CREATE UNIQUE INDEX IF NOT EXISTS cc_delete_requests_member_open ON cc_delete_requests(member_id) WHERE kind = 'member' AND status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS cc_delete_requests_visitor_open ON cc_delete_requests(visitor_id) WHERE kind = 'visitor' AND status = 'pending';
