-- migate-intel D1 schema (database: migate-intel)
CREATE TABLE IF NOT EXISTS intel_sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT, kind TEXT NOT NULL, market TEXT NOT NULL, lang TEXT,
  parser TEXT NOT NULL, endpoint TEXT NOT NULL, method TEXT DEFAULT 'GET', body TEXT, mapping TEXT,
  schedule TEXT DEFAULT 'B', enabled INTEGER DEFAULT 1, robots_ok INTEGER, terms_note TEXT, official INTEGER DEFAULT 1,
  homepage TEXT, listed INTEGER DEFAULT 1, disabled_reason TEXT,
  last_ok_at TEXT, last_run_at TEXT, last_err TEXT, fail_count INTEGER DEFAULT 0, etag TEXT, last_modified TEXT,
  items_total INTEGER DEFAULT 0, last_item_at TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS intel_items (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, ext_id TEXT, kind TEXT NOT NULL, tag TEXT, market TEXT NOT NULL, country TEXT,
  sector INTEGER, title_orig TEXT NOT NULL, title_ar TEXT, title_en TEXT, summary_ar TEXT, summary_en TEXT, summary_orig TEXT,
  entity TEXT, published_at TEXT, deadline TEXT, value REAL, currency TEXT, url TEXT NOT NULL, url_norm TEXT, lang TEXT,
  relevance INTEGER DEFAULT 0, status TEXT DEFAULT 'info', hidden INTEGER DEFAULT 0, dup_of TEXT, ai INTEGER DEFAULT 0,
  slug TEXT, first_seen_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_items_feed ON intel_items (hidden, dup_of, first_seen_at);
CREATE INDEX IF NOT EXISTS ix_items_kind ON intel_items (kind, published_at);
CREATE INDEX IF NOT EXISTS ix_items_market ON intel_items (market);
CREATE INDEX IF NOT EXISTS ix_items_url ON intel_items (url_norm);
CREATE INDEX IF NOT EXISTS ix_items_ai ON intel_items (ai, relevance);
CREATE INDEX IF NOT EXISTS ix_items_deadline ON intel_items (status, deadline);
CREATE INDEX IF NOT EXISTS ix_items_source ON intel_items (source_id);
CREATE TABLE IF NOT EXISTS intel_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT, finished_at TEXT, trigger TEXT, groups TEXT,
  sources_ok INTEGER, sources_failed INTEGER, sources_not_modified INTEGER, items_new INTEGER, items_updated INTEGER,
  dups INTEGER, ai_calls INTEGER, notes TEXT
);
CREATE TABLE IF NOT EXISTS intel_gone (id TEXT PRIMARY KEY, gone_at TEXT);
