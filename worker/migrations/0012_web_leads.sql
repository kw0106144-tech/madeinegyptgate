-- 0012_web_leads.sql — «🌐 فرص من الإنترنت» / web leads (owner 2026-11-20: «دول لازم يبقوا آلات سحب داتا … يجيبوا من بره»).
-- The opportunities that Janna's and Bassem's web search / opportunity hunt RETURN from a provider (POST /api/janna/web|hunt,
-- /api/advisor/web|hunt; src/web-leads.js recordLeads, after the answer, never on the caller's clock; a cached answer is not counted
-- again) are kept for the data team: the cleaned link (its hash unique), title, site, a short snippet (e-mail addresses and phone
-- numbers masked before storage, links with them were dropped or cut), the classifier's type (src/web-classify.js — validated in
-- web-leads.js, no CHECK here: the classifier will gain types), the query / product / market that found it, who found it and how often
-- (at most once an hour). Only opportunities are kept (tender, rfq, buyer, buyer_list, project; news from hunts), never other pages.
-- The data desk reviews them (GET /api/team/desk/leads, PUT /api/team/desk/leads/:id — roles data / admin / owner, one cc_audit row per
-- decision) and turns a good lead into platform content only through the existing desk forms, with its source (POST
-- /api/team/desk/content {lead_id}). NEVER public: no page, no overlay, no persona tool returns anything from this table; the hunt only
-- reads the url hashes the team rejected (a «مش عن المنتج» rejection only for the same product: reason + product_key). Without this
-- table the code keeps nothing, the hunt and the search answer the same, the desk says «apply 0012», and the owner switch web_leads stays
-- locked.
-- Purely additive and idempotent (CREATE … IF NOT EXISTS only): safe to re-run. Apply ONLY with the manual GitHub workflow, which backs up
-- first: Actions → d1-migrate → Run workflow: migration = 0012_web_leads.sql, confirm = migate-db.
CREATE TABLE IF NOT EXISTS web_leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  url_hash     TEXT NOT NULL UNIQUE,                    -- sha256("lead|v1|" + the canonical link), 32 hex (https, no www., no trailing slash, sorted query)
  url          TEXT NOT NULL,                           -- the cleaned link (≤ 600): http(s), no tracking parameters, never a personal profile
  title        TEXT NOT NULL DEFAULT '',                -- ≤ 160, e-mails / phones masked
  site         TEXT NOT NULL DEFAULT '',                -- the bare host
  snippet      TEXT NOT NULL DEFAULT '',                -- ≤ 300, masked
  type         TEXT NOT NULL DEFAULT 'other',           -- tender | rfq | buyer | buyer_list | project | news (validated in web-leads.js)
  official     INTEGER NOT NULL DEFAULT 0,              -- 1 = an official procurement portal / a public body's notice (web-classify.js PORTALS / ENTITIES)
  aggregator   INTEGER NOT NULL DEFAULT 0,              -- 1 = a tender aggregator (usually a paywalled teaser)
  query        TEXT NOT NULL DEFAULT '',                -- the provider query that found it first (links, e-mails, phones, names stripped)
  product      TEXT NOT NULL DEFAULT '',                -- the hunt's product words (≤ 120)
  product_key  TEXT NOT NULL DEFAULT '',                -- the product's stored word forms, sorted (a «مش عن المنتج» rejection applies to it only)
  market       TEXT NOT NULL DEFAULT '',                -- eg | sa | gulf | … | '' (world)
  governorate  TEXT NOT NULL DEFAULT '',
  persona      TEXT NOT NULL DEFAULT '',                -- janna | bassem: who found it first
  personas     TEXT NOT NULL DEFAULT '',                -- " janna bassem ": everyone who found it
  via          TEXT NOT NULL DEFAULT '',                -- search | hunt
  lang         TEXT NOT NULL DEFAULT '',                -- ar | en: the query's language
  date         TEXT NOT NULL DEFAULT '',                -- the provider's date (YYYY-MM-DD or as said)
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  seen_count   INTEGER NOT NULL DEFAULT 1,              -- sightings, at most one an hour
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected')),
  reason       TEXT NOT NULL DEFAULT '',                -- a rejection's reason: off_topic | old | duplicate | not_credible | advert | ''
  reviewed_by  TEXT NOT NULL DEFAULT '',                -- members.id of the team member
  reviewed_at  TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',                -- the team's note (≤ 300, masked), never public
  content_id   TEXT NOT NULL DEFAULT ''                 -- the cc_content id it became through the desk, if any
);
CREATE INDEX IF NOT EXISTS web_leads_status ON web_leads(status, last_seen);
CREATE INDEX IF NOT EXISTS web_leads_type ON web_leads(type, status, last_seen);
CREATE INDEX IF NOT EXISTS web_leads_market ON web_leads(market, status);
CREATE INDEX IF NOT EXISTS web_leads_site ON web_leads(site, status);
CREATE INDEX IF NOT EXISTS web_leads_rejected ON web_leads(status, reason, product_key);
