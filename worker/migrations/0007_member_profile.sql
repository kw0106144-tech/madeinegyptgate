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
