// ─── SOP driver-visibility — single source of truth ─────────────────────────
// Used by both the Training Hub SOP search (SopSearchSection, client) and the
// AVA conversation endpoint (/api/ava/ask, server) so the two can never drift.
//
// The Notion `department` values are free-text and composite ("Drivers /
// Warehouse", "Field Operations", "All Departments", "Warehouse", "Operations",
// null) — NOT the spec's `'driver'|'field'|'all'` tokens, so a literal IN(...)
// matches zero rows. Two rules, OR'd:
//   1. department mentions drivers / field / all (case-insensitive). The `s?`
//      on `drivers` matters: the departments are PLURAL ("Drivers"), and a bare
//      `\bdriver\b` can't match before the trailing "s" — that bug hid SOP-001/
//      003/006 until 2026-06-02 (`1a1d714`).
//   2. the title is tent setup/teardown. SOP-010 (Tent Setup & Teardown) has a
//      null department — it's the one child page missing from the Notion summary
//      table, so the sync had no metadata to attach — and tents are core driver
//      work. Durable fix is chat-Claude adding it to the summary table with a
//      driver/field department; this title carve-out is the bridge until then.
// Still excludes Warehouse-only (Forklift, Chair Return) and Operations (Scheduling).

export interface SopVisibilityFields {
  department: string | null
  title:      string
}

const TENT_TITLE_RE = /\b(tent|canopy|marquee)\b/i

export function isDriverVisibleSop(sop: SopVisibilityFields): boolean {
  if (sop.department && /\b(drivers?|field|all)\b/i.test(sop.department)) return true
  return TENT_TITLE_RE.test(sop.title)
}
