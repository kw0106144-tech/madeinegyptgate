-- 0013_member_web.sql — «باسم يعرف هو بيكلّم مين» / what the web shows about the member (owner 2026-11-21: Bassem told a member's office
-- manager that the member was «رئيس مجلس إدارة» without having that information; «يبحث في جوجل … عن الشخص عشان يبقي عارف هو بيكلم مين»).
-- When a paying member's call with Bassem starts (POST /api/janna/session, agent bassem, the member's OWN full sign-in), the SERVER — never
-- the model: Bassem's tools still never search for a person — runs ONE web search with the platform's search provider (the same key,
-- provider and daily cap as his web search, Bassem's share) for the member HIMSELF: his name + his company as his account has them, nothing
-- else (no e-mail, no phone, no id). From the results it keeps only what they show plainly (src/member-web.js summarize: his position in
-- his company and the company's activity, each next to his name / his company in the same result) — never anything that is not in them.
-- One row per member, reused for 30 days, so the search is not repeated every call; the line goes into the member block of his next calls
-- («اللي ظاهر عنه على الإنترنت: …»). Seen only by Bassem and the platform team (Control Center → the member's card: read with bassem.read,
-- «🧹 امسح» with members.write, audited). Never public, never for Janna or visitors. Erased with the account (acc-members.js deleteMember)
-- and with the owner's legal memory erasure of the member (acc-memory.js). Without this table the code keeps the result in the isolate's
-- memory only (src/member-web.js) and the team's «امسح» answers 503 member_web_off.
-- Purely additive and idempotent (CREATE … IF NOT EXISTS only): safe to re-run. Apply ONLY with the manual GitHub workflow, which backs up
-- first: Actions → d1-migrate → Run workflow: migration = 0013_member_web.sql, confirm = migate-db.
CREATE TABLE IF NOT EXISTS member_web_profile (
  member_id    TEXT PRIMARY KEY,                        -- members.id
  query_hash   TEXT NOT NULL DEFAULT '',                -- sha256("mw|v1|" + name + "|" + company), 32 hex: a changed name / company searches again
  status       TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('found', 'none', 'failed', 'cleared')),
                                                        -- found = a summary; none = nothing clear; failed = the provider failed (retried after 6 h);
                                                        -- cleared = the team removed it (not searched again until the name / company changes)
  role         TEXT NOT NULL DEFAULT '',                -- his position as the results name it (one of member-web.js ROLES), ≤ 60
  company      TEXT NOT NULL DEFAULT '',                -- his company as HIS ACCOUNT names it (never a name from the results), ≤ 80
  activity     TEXT NOT NULL DEFAULT '',                -- the company's activity as a result next to the company says it, ≤ 60
  summary      TEXT NOT NULL DEFAULT '',                -- the short summary Bassem gets (≤ 200), '' when there is none
  hits         INTEGER NOT NULL DEFAULT 0,              -- results that named him together with his company
  sources_json TEXT NOT NULL DEFAULT '[]',              -- ≤ 3 links of the supporting results: for the TEAM only, never in Bassem's block
  provider     TEXT NOT NULL DEFAULT '',                -- tavily | serper | brave
  searched_at  TEXT NOT NULL DEFAULT '',
  expires_at   TEXT NOT NULL DEFAULT '',                -- searched_at + 30 days ('' for cleared)
  updated_at   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS member_web_profile_expires ON member_web_profile(expires_at);
