-- AVA Phase 2 — Session 1: SOP foundation.
-- Mirror of the Notion SOP Library, synced via POST /api/sop/sync.
-- Session 1 scope is the table + sync endpoint only (no search UI yet).

CREATE TABLE IF NOT EXISTS sop_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_number        TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL,
  department        TEXT,
  version           TEXT,
  effective_date    DATE,
  notion_page_id    TEXT,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sop_entries_department_idx ON sop_entries(department);
