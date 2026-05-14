# Open Questions

## RESOLVED 2026-05-14 — Migration 051 applied; migration 009 also confirmed applied

Both BLOCKER sections that used to sit at the top of this file are gone:

- **Migration 051** (`20260513_010_cash_collections_status.sql`) was applied to partytime-east on 2026-05-14 via `supabase db query --linked --file <path>` (the Management API path — see `tasks/lessons.md` for why this is the working workaround when `supabase db push --linked` is blocked by two-repo coordination). Tracking row added via `supabase migration repair --status applied 20260513`. Driver-app types regen'd in commit `c308c81`. `cash_collections.status` + `not_collected_reason` columns + both CHECK constraints + the partial index are all live.

- **Migration 009** (`20260510_009_post_trip_reported_context.sql`) is also applied — schema probe on 2026-05-14 confirmed `vehicle_defects.reported_context` column exists and carries data (`'post_trip'` and `'pre_trip'` values seen). It was presumably applied earlier via the same SQL-Editor / `db query --linked --file` path; the BLOCKER section that used to live here was stale.

**RLS policies on `cash_collections`** were NOT re-declared by the migration (they exist in production from out-of-band creation; re-declaring would error). If RLS is ever rebuilt from scratch, the existing INSERT/SELECT policies allow `driver_id = auth.uid()` — re-author those bodies.

**Dashboard repo follow-up still open:** regen its Supabase types so the `as any` casts in `boardClient.ts:fetchUncollectedCodRows` can come out. See `tasks/todo.md`.

---

# Historical context — Post-trip defect report build (2026-05-10)

The original BLOCKER section below predates both migration applies. It's kept for the architecture context (the schema field-name divergence section is still useful as a lesson about reading the live schema before writing code). The actual apply blocker is resolved.

## (RESOLVED) Previously: `supabase db push --linked` cannot apply migration 009 from this repo

`supabase migration list --linked` shows 27 dashboard-side migrations in the
remote `_supabase_migrations` table that are not present as files in this
repo (they live in `partytime-dashboard/supabase/migrations`):

```
20260427000007 .. 20260510120000  (27 entries owned by partytime-dashboard)
```

`supabase db push --linked` refuses to proceed with the error:
> Remote migration versions not found in local migrations directory.

The CLI suggests `supabase migration repair --status reverted <list>` to
clear the remote tracking — but that would force the dashboard repo's CLI
to think those 27 schema mutations need to be re-run, which would fail
non-idempotently (CREATE TABLE without IF NOT EXISTS, etc.). Bad for the
dashboard repo's workflow.

`--db-url` push needs the postgres password, which isn't stored in
`.env.local` or `supabase/.temp/`. Pooler URL has no embedded password.

**Migration file is committed (`supabase/migrations/20260510_009_post_trip_reported_context.sql`)
but NOT applied to remote.** The post-trip API + UI code in this commit
will return 500 at runtime until the SQL is applied. Smoke test will fail
until then.

**Recommended path to apply (Darren has DB credentials):**
1. Open Supabase Studio → partytime-east → SQL Editor.
2. Paste the contents of `supabase/migrations/20260510_009_post_trip_reported_context.sql`.
3. Run.
4. Manually insert the migration tracking row to keep CLI history honest:
   ```sql
   INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
   VALUES ('20260510', '009_post_trip_reported_context', ARRAY[
     -- the two ALTER statements as text
   ]);
   ```
   (or simpler: `supabase migration repair --status applied 20260510` from
   this repo after the SQL has run.)

**Verification SQL to run after the apply:**
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'vehicle_defects'
  AND column_name IN ('reported_context', 'inspection_id');
```
Expected:
- `reported_context` text, default `'pre_trip'::text`, nullable `YES`
- `inspection_id` uuid, default null, nullable `YES`

Skipping the type regen step (`supabase gen types`) for the same reason —
it would query the un-mutated schema.

## Schema field-name divergence between session prompt and live `vehicle_defects` schema

The session prompt described the post-trip insert as:
```
vehicle_defects row with:
  • reported_context = 'post_trip'
  • inspection_id = NULL
  • category, oos_status, description from form
  • driver_id, route_id, reported_at populated
```

Actual live schema (from `src/types/supabase.ts`, dashboard-side migrations
026–030, used by the existing pre-trip `/api/inspection/submit` route):

| Prompt name        | Actual column                                            |
|--------------------|----------------------------------------------------------|
| `oos_status`       | `severity` (`'oos' \| 'non_oos'`)                        |
| `driver_id`        | `reported_by_user_id` (uuid → auth.users)                |
| `route_id`         | _(does not exist on `vehicle_defects`)_                  |
| `reported_at`      | `reported_at` (timestamptz, defaults `now()`)            |
| `inspection_id`    | `inspection_id` — was NOT NULL FK to `vehicle_inspections` |

**Decisions taken to keep the build moving (escalation rule: continue with
independent subtask, log here):**

1. **Migration 009 also drops `vehicle_defects.inspection_id NOT NULL`.** The
   prompt mandated `inspection_id = NULL` on post-trip rows, which is
   incompatible with the live NOT NULL constraint. Without this companion
   change the post-trip insert is non-functional, so it's bundled into the
   same migration. Pre-trip code path continues to populate inspection_id —
   no behavioral change there.

2. **`oos_status` mapped to existing `severity` column.** No new column.
   The post-trip API and PostTripDefectCard use `severity: 'oos' | 'non_oos'`
   verbatim with the existing schema and the pre-trip route's vocabulary.

3. **`driver_id` mapped to existing `reported_by_user_id` column.** No new
   column. The pre-trip route already uses this for the same purpose.

4. **`route_id` is NOT written on the defect row.** No such column exists on
   `vehicle_defects` (the column lives on `vehicle_inspections`, which
   post-trip rows don't link to). The post-trip "already submitted today"
   gate is therefore scoped by `reported_by_user_id + reported_context = 'post_trip'
   + reported_at::date = today` rather than by route. This is acceptable
   because routes are 1:1 with drivers per day in this app, but if Darren
   wants strict per-route scoping later we'd need a new column on
   `vehicle_defects` (or a helper join via `route_assignments`).

   _Open question for Darren_: should we add `route_id uuid REFERENCES routes(id)`
   to `vehicle_defects` so a post-trip defect can be unambiguously tied to
   the route it was reported from? Today's gate works but the audit trail
   ("which run was this reported on") is implicit (reported_at date) rather
   than explicit (route_id link). Low priority; flag if/when the maintenance
   side wants better reporting.

## Category list extraction (deferred per session prompt)

The 12 federal categories live in `src/screens/InspectionScreen.tsx`
(`ALL_CATEGORIES`, `CATEGORY_LABELS`, `CFR_SECTIONS`, `OOS_DEFAULT_CATEGORIES`)
and are duplicated into `src/components/PostTripDefectCard.tsx` per prompt
instruction. A `// TODO: extract to src/lib/defect-categories.ts` comment
flags the duplication. Pre-trip is intentionally untouched.

When pre-trip stabilizes (or the next time post-trip needs a sibling
surface), extract `ALL_CATEGORIES`, `CATEGORY_LABELS`, `CFR_SECTIONS`,
`OOS_DEFAULT_CATEGORIES`, `TRAILER_CATEGORIES`, and `FEDERAL_CATEGORIES`
(from `/api/inspection/submit/route.ts`) into a single shared module. Three
copies today: InspectionScreen.tsx, PostTripDefectCard.tsx, and the submit
route handler.
