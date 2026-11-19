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
