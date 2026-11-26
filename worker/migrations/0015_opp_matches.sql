-- 0015_opp_matches.sql — «فرص مناسبة لمصنعك» (proactive opportunity matching, owner 2026-11-26: every new opportunity matched to each
-- partner member's company profile automatically, with a 0-100 score and an alert, so the member finds them ready). src/matching-opps.js:
-- the */15 platform cron reads the opportunities that arrived since its cursor (the Information Center feed through the INTEL binding,
-- the platform's own tenders / RFQs of data.json, the published «فرص السوق» web leads), scores each one against every member whose plan
-- includes Bassem (deterministic: product words with Arabic normalisation and synonyms, sector, market inside the plan, the certificates
-- the notice asks for, an open deadline) and keeps the matches with a score of 40 or more here — one row per member and item.
-- item_json = the opportunity as the card shows it (title, kind, entity, market, deadline, the platform's page, the official notice link
-- of a tender / RFQ) + src: its source link, INTERNAL ONLY (never returned by the API, never in an e-mail, never said by Bassem).
-- A member reads and changes only his own rows (GET|POST /api/me/opportunities); the daily alert e-mails the new ones of 70 or more.
-- opp_cursors = how far each source has been read (bounded work per run). Without these tables the code keeps nothing, the member API
-- answers 503 opp_matches_off and the owner switch opp_matching stays locked. Account deletion (acc-members.js) deletes the member's rows.
-- Purely additive and idempotent (CREATE … IF NOT EXISTS only): safe to re-run.
-- Apply ONLY with the manual workflow: GitHub → Actions → d1-migrate → migration = 0015_opp_matches.sql, confirm = migate-db (backup first).
CREATE TABLE IF NOT EXISTS opp_matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   TEXT NOT NULL,                           -- members.id
  item_key    TEXT NOT NULL,                           -- intel:<id> | web:<web_leads.id> | platform:<kind>:<id>
  source      TEXT NOT NULL CHECK (source IN ('intel', 'web', 'platform')),
  score       INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  reasons     TEXT NOT NULL DEFAULT '[]',              -- [{code, ar, en, pts}] why it fits (computed from the data, never invented)
  missing     TEXT NOT NULL DEFAULT '[]',              -- [{code, ar, en}] what the notice asks that the profile does not show (certificates …)
  item_json   TEXT NOT NULL DEFAULT '{}',              -- the card (see above); src = the source link, internal only
  deadline    TEXT NOT NULL DEFAULT '',                -- YYYY-MM-DD or '' (unknown): an item whose deadline passed is never shown as active
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'dismissed', 'saved')),
  alerted_at  TEXT NOT NULL DEFAULT '',                -- when the daily alert named it ('' = not yet)
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (member_id, item_key)
);
CREATE INDEX IF NOT EXISTS opp_matches_member ON opp_matches(member_id, status, score);
CREATE INDEX IF NOT EXISTS opp_matches_alert ON opp_matches(status, alerted_at, score);
CREATE TABLE IF NOT EXISTS opp_cursors (
  source      TEXT PRIMARY KEY,                        -- intel | web | platform
  cursor      TEXT NOT NULL DEFAULT '',                -- intel / platform: the last first_seen_at read; web: the last web_leads.id
  cursor_id   TEXT NOT NULL DEFAULT '',                -- intel: the last id at that first_seen_at; platform: kind|item_id
  updated_at  TEXT NOT NULL DEFAULT ''
);
