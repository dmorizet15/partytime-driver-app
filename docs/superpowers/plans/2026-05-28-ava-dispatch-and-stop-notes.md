# AVA Dispatcher Notes + Stop Notes Surface — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed **inline in the current session** with a review checkpoint after each task.

**Goal:** Surface dispatcher notes (route + stop level) and TapGoods order notes to drivers across three surfaces — the AVA morning brief, a pre-launch notes sheet (on Send-ETA / Navigate), and the Stop Detail screen — all read-only, no migrations.

**Architecture:** All note data already lives on `routes` / `dispatch_stops` / `ava_stop_notes` (dashboard- and TapGoods-owned). The driver app reads it through the existing `GET /api/routes` query → `transformSupabase` → `Route`/`Stop` types → screens. We extend that one query path with the missing columns (no new endpoint), thread the fields through the transform + types, then build four UI surfaces. Two new bottom-sheet components mirror the existing `AvaChecklistSheet` / `AvaNotesReviewSheet` pattern.

**Tech Stack:** Next.js 14 PWA, React (client components), Supabase JS (browser + service-role server client), TypeScript. No test runner — verification is `npx next build` (full type-check) + manual smoke on the Vercel preview deploy of `feature/ava-phase1`.

**Verification model (PTR rule — overrides the skill's TDD default):** This repo has no jest/vitest. Per `CLAUDE.md` the indivisible pre-push check is `npx next build` (NOT lint — lint skips the type checker). Each task ends with a build; the final task adds the manual smoke matrix for the Vercel preview.

**Branch:** `feature/ava-phase1` only. Do NOT merge to `main`.

---

## File Map

**Modify (data plumbing — Task 0):**
- `src/app/api/routes/route.ts` — add `dispatcher_notes` to the `routes` SELECT; add the 5 TapGoods note columns to the `dispatch_stops` SELECT.
- `src/lib/supabaseTransform.ts` — add fields to `SupabaseRouteRow` + `SupabaseStopRow`; map them in the `routes.map` and `toRealStop` builders.
- `src/types/index.ts` — add `dispatcher_notes?` to `Route`; add the 5 TapGoods note fields to `Stop`.

**Modify (UI):**
- `src/components/ava/AvaMorningCard.tsx` — Components 1 & 2 (route note block, stop-notes count line, speak-prepend, new visibility triggers, wire new sheet).
- `src/screens/DayRouteSelectorScreen.tsx` — pass `routeDispatcherNote` prop to `<AvaMorningCard>`.
- `src/screens/StopDetailScreen.tsx` — Component 3 (pre-launch sheet wiring on both Send-ETA + Navigate, once-per-stop guard) and Component 4 (Order Notes expandable section; confirm dispatcher-note surfaces intact).
- `src/screens/RouteListScreen.tsx` — Component 4 (note indicator on stop cards).

**Create (UI):**
- `src/components/ava/AvaDispatchNotesSheet.tsx` — Component 2 read-only sheet listing each stop's dispatcher note.
- `src/components/ava/StopNotesPreSheet.tsx` — Component 3 pre-launch sheet (labeled sections; context-aware bottom button).

**No migrations. No new API routes. No new tables.**

---

## Decisions baked into this plan (flag if any is wrong)

1. **Component 3 trigger (confirmed by Darren):** the pre-launch sheet fires on BOTH `handleSendEta` (Send ETA Text) AND `handleNavigateRequest` (Open in Maps), with a component-local `seenNoteStops` Set keyed by `stop_id` so it shows at most once per stop per mount. Bottom-button label is context-aware: `"Got it"` (ETA path → ETA send proceeds) / `"Got it — Navigate Now"` (navigate path → maps launches). Null notes → no sheet, both actions proceed with zero friction.
2. **Card visibility (new):** a route dispatcher note OR ≥1 stop-with-dispatcher-note becomes an independent card-visibility trigger in `AvaMorningCard`. Without this, on a day with only a dispatch note and no checklist/stats/AVA-notes the card would `return null` and the note would never show. (Mirrors the existing "any trigger renders the card" rule.)
3. **FROM DISPATCH block placement:** rendered immediately after the AVA identity row, *before* the morning message — the literal "FIRST block," and consistent with "AVA speaks this first."
4. **Amber treatment inside the dark card:** the Home COD card is light-gold on a light surface, but `AvaMorningCard` is a dark card (`#1A1A1A`). The FROM DISPATCH block uses the dark-card amber treatment (`rgba(255,184,0,0.12)` bg / `rgba(255,184,0,0.35)` border / `C.gold` label) — same amber family as the existing checklist/notes blocks in this card, not the light `#FFEFC2`.
5. **`notes_flip` scope:** Component 3 sheet shows `notes_flip` only on pickup stops (per spec). Component 4 Order Notes shows `notes_flip` whenever non-null (per spec's explicit field list).
6. **AVA Remembers in the OTW sheet** reuses StopDetailScreen's existing `avaAddressKey` (`normalizeAddressKey(stop.address_line_1)`) + `avaNoteCount` for the has-note gate, and fetches the latest note text via `listNotesForAddress` when the sheet opens.
7. **Active route for the route note:** `primaryRoute = routes[0]` (driver app is single-route per login per CLAUDE.md).

---

## Task 0: Data plumbing — thread the missing note columns through the query path

**Files:**
- Modify: `src/app/api/routes/route.ts` (routes SELECT ~133-142; dispatch_stops SELECT ~171-187)
- Modify: `src/lib/supabaseTransform.ts` (`SupabaseRouteRow` 35-44; `SupabaseStopRow` 51-90; `toRealStop` 120-173; `routes.map` 274-292)
- Modify: `src/types/index.ts` (`Route` 8-24; `Stop` 43-102)

**Why:** `routes.dispatcher_notes` is NOT in the routes SELECT today; the 5 TapGoods note fields are NOT in the dispatch_stops SELECT today. `dispatch_stops.dispatcher_notes` and `notes` already are. Everything downstream (Components 1-4) depends on these columns being present on the typed `Route`/`Stop` objects.

- [ ] **Step 1: Add `dispatcher_notes` to the routes SELECT.** In `src/app/api/routes/route.ts`, the routes query template (currently ends `...break_blocks,` then the truck joins). Add `dispatcher_notes,` after `break_blocks,`:

```ts
  let routesQuery = supabase
    .from('routes')
    .select(`
      id,
      route_date,
      label,
      truck_id,
      truck_id_2,
      break_blocks,
      dispatcher_notes,
      truck:trucks!routes_truck_id_fkey(id, name, plate, dvir_requirement, current_defect_status),
      truck_2:trucks!routes_truck_id_2_fkey(id, name, plate)
    `)
    .eq('route_date', date)
```

- [ ] **Step 2: Add the 5 TapGoods note columns to the dispatch_stops SELECT.** In the same file, the `dispatch_stops` SELECT currently has `items, notes, dispatcher_notes, stop_type, ...`. Add the five fields (place them right after `notes_classification,`):

```ts
    supabase
      .from('dispatch_stops')
      .select(`
        id, route_id, route_position,
        customer_name, customer_phone, customer_cell,
        company_name, client_company,
        address, address_lat, address_lng,
        items, notes, dispatcher_notes, stop_type, payment_state, balance_due_amount,
        calculated_eta,
        stop_status, completed_at,
        arrived_at,
        tapgoods_order_token,
        constraint_confidence, has_any_constraint,
        delivery_window_start, delivery_window_end,
        pickup_window_start, pickup_window_end,
        event_start, event_end,
        notes_classification,
        notes_additional_delivery, notes_employee_authored, notes_flip,
        notes_set_by_time, notes_strike_time,
        dispatcher_time_override, dispatcher_constraint_dismissed
      `)
      .in('route_id', routeIds)
```

- [ ] **Step 3: Extend `SupabaseRouteRow`.** In `src/lib/supabaseTransform.ts`, add `dispatcher_notes` to the interface (after `break_blocks`):

```ts
export interface SupabaseRouteRow {
  id:               string
  route_date:       string
  label:            string
  truck_id:         string | null
  truck_id_2:       string | null
  break_blocks:     BreakBlock[] | null
  dispatcher_notes: string | null
  truck:            SupabaseTruckRow | SupabaseTruckRow[] | null
  truck_2:          SupabaseTruckRow | SupabaseTruckRow[] | null
}
```

- [ ] **Step 4: Extend `SupabaseStopRow`.** Add the 5 fields (place after `notes_classification`):

```ts
  notes_classification:            unknown | null
  notes_additional_delivery:       string | null
  notes_employee_authored:         string | null
  notes_flip:                      string | null
  notes_set_by_time:               string | null
  notes_strike_time:               string | null
  dispatcher_time_override:        unknown | null
  dispatcher_constraint_dismissed: boolean | null
```

- [ ] **Step 5: Map `dispatcher_notes` onto `Route` in the transform.** In the `routes.map(...)` builder (~line 274), add one field to the returned object (after `truck_2_name`):

```ts
      truck_2_name:                truck_2?.name,
      dispatcher_notes:            r.dispatcher_notes?.trim() ? r.dispatcher_notes : undefined,
    }
```

- [ ] **Step 6: Map the 5 TapGoods fields onto `Stop` in `toRealStop`.** Add to the returned object (after the existing `notes_classification` line, ~169):

```ts
    notes_classification:            s.notes_classification as NotesClassification | null,
    notes_additional_delivery:       s.notes_additional_delivery?.trim() ? s.notes_additional_delivery : undefined,
    notes_employee_authored:         s.notes_employee_authored?.trim()   ? s.notes_employee_authored   : undefined,
    notes_flip:                      s.notes_flip?.trim()                ? s.notes_flip                : undefined,
    notes_set_by_time:               s.notes_set_by_time?.trim()         ? s.notes_set_by_time         : undefined,
    notes_strike_time:               s.notes_strike_time?.trim()         ? s.notes_strike_time         : undefined,
```

> Note: `buildWarehouseStop` does NOT get these fields — depot stops carry no customer notes. Leave it as-is (the new `Stop` fields are all optional).

- [ ] **Step 7: Add `dispatcher_notes` to the `Route` type.** In `src/types/index.ts`, inside `interface Route` (after `truck_2_name?`):

```ts
  truck_2_name?: string
  // Route-level dispatcher note (dashboard-owned). Surfaced in the AVA
  // morning brief "FROM DISPATCH" block. Read-only here.
  dispatcher_notes?: string
}
```

- [ ] **Step 8: Add the 5 TapGoods note fields to the `Stop` type.** In `interface Stop`, after the existing `dispatcher_notes?` block (~73):

```ts
  // TapGoods-synced order notes (dashboard/TG-owned, read-only here). Surfaced
  // in the Stop Detail "Order Notes" section and the pre-launch notes sheet.
  notes_additional_delivery?: string  // TG additionalDeliveryInfo
  notes_employee_authored?:   string  // concatenated employee-authored TG notes
  notes_flip?:                string  // TG flipNotes (teardown)
  notes_set_by_time?:         string  // TG setByTimeNotes
  notes_strike_time?:         string  // TG strikeTimeNotes
```

- [ ] **Step 9: Build.** Run: `npx next build`
Expected: compiles clean, no TypeScript errors. (No behavior change yet — only data now flows through.)

- [ ] **Step 10: Commit.**

```bash
git add src/app/api/routes/route.ts src/lib/supabaseTransform.ts src/types/index.ts
git commit -m "feat(ava): thread route + TapGoods note fields through /api/routes query"
```

---

## Task 1: Component 1 — Morning Brief route dispatcher note

**Files:**
- Modify: `src/screens/DayRouteSelectorScreen.tsx` (AvaMorningCard render ~754-760)
- Modify: `src/components/ava/AvaMorningCard.tsx` (props, render, speak)

- [ ] **Step 1: Pass the route note from Home.** In `src/screens/DayRouteSelectorScreen.tsx`, the screen already has `primaryRoute = routes[0]`. Update the `<AvaMorningCard>` render block:

```tsx
{!inspected && profile && (
  <AvaMorningCard
    profile={profile}
    dayStops={dayStops}
    todayKey={today}
    routeDispatcherNote={primaryRoute?.dispatcher_notes ?? null}
  />
)}
```

- [ ] **Step 2: Add the prop to `AvaMorningCard`.** In `src/components/ava/AvaMorningCard.tsx`, extend the props interface and destructure:

```tsx
interface AvaMorningCardProps {
  profile:             UserProfile
  dayStops:            Stop[]
  todayKey:            string  // YYYY-MM-DD — drives stable personality-variant selection
  routeDispatcherNote: string | null  // routes.dispatcher_notes for the active route
}

export default function AvaMorningCard({ profile, dayStops, todayKey, routeDispatcherNote }: AvaMorningCardProps) {
```

- [ ] **Step 3: Make the route note a visibility trigger + normalize it.** Just after `const showNotesNudge = notesCount > 0` (~line 148), add:

```tsx
  const routeNote = routeDispatcherNote?.trim() ? routeDispatcherNote.trim() : null
```

Then update the early-return gate (~line 194) so the card renders when a route note exists:

```tsx
  if (!checklistOffered && !showStats && !showNotesNudge && !routeNote) {
    return null
  }
```

- [ ] **Step 4: Prepend the route note to spoken output.** In `handlePlayBrief` (~176-186), speak the route note first:

```tsx
  const handlePlayBrief = useCallback(() => {
    stopSpeaking()
    const myToken = ++playTokenRef.current
    setIsSpeaking(true)
    const spoken = routeNote ? `From dispatch: ${routeNote}. ${message}` : message
    speak(spoken).finally(() => {
      if (playTokenRef.current === myToken) setIsSpeaking(false)
    })
  }, [message, routeNote])
```

- [ ] **Step 5: Render the FROM DISPATCH block as the first content block.** Immediately after the identity row `</div>` (the one closing the AVA waveform + label, ~line 235) and BEFORE the morning message `<p>`, insert:

```tsx
        {/* FROM DISPATCH — route-level dispatcher note. First content block;
            AVA speaks it first (see handlePlayBrief). Amber treatment adapted
            to this dark card (same family as the checklist/notes blocks). */}
        {routeNote && (
          <div style={{
            marginTop: 12,
            padding: '11px 14px',
            background: 'rgba(255,184,0,0.12)',
            border: '1px solid rgba(255,184,0,0.35)',
            borderRadius: 12,
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: C.gold,
              fontFamily: FONT_DISPLAY,
            }}>
              From Dispatch
            </div>
            <p style={{
              margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: C.text,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {routeNote}
            </p>
          </div>
        )}
```

- [ ] **Step 6: Build.** Run: `npx next build` — expected clean.

- [ ] **Step 7: Commit.**

```bash
git add src/components/ava/AvaMorningCard.tsx src/screens/DayRouteSelectorScreen.tsx
git commit -m "feat(ava): surface route dispatcher note in morning brief (FROM DISPATCH)"
```

---

## Task 2: Component 2 — Morning Brief stop-notes count line + read-only sheet

**Files:**
- Create: `src/components/ava/AvaDispatchNotesSheet.tsx`
- Modify: `src/components/ava/AvaMorningCard.tsx`

- [ ] **Step 1: Create the read-only sheet.** New file `src/components/ava/AvaDispatchNotesSheet.tsx`. Mirrors the `AvaChecklistSheet` overlay/backdrop/header/close pattern (dark `#0F172A`, drag handle, × close, gold CTA). Lists each passed stop with its dispatcher note.

```tsx
'use client'

import type { Stop } from '@/types'

const BLUE = '#0000FF'

interface AvaDispatchNotesSheetProps {
  stops:   Stop[]   // pre-filtered: only stops with a non-empty dispatcher_notes
  onClose: () => void
}

export default function AvaDispatchNotesSheet({ stops, onClose }: AvaDispatchNotesSheetProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stops with notes from dispatch"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 448,
          background: '#0F172A', color: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '16px 22px calc(28px + env(safe-area-inset-bottom))',
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2,
          margin: '0 auto 14px',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 2, flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} aria-hidden="true" className="ava-wave-bar"
                style={{ width: 2, height: 12, background: '#fff', borderRadius: 1, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Notes from dispatch
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              marginLeft: 'auto', background: 'transparent', border: 0,
              color: '#94A3B8', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {stops.map((s) => {
            const addr = [s.address_line_1, s.city].filter(Boolean).join(', ')
            return (
              <li key={s.stop_id} style={{
                padding: '12px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F4F6FA', lineHeight: 1.25 }}>
                  {s.customer_name}
                </div>
                {addr && (
                  <div style={{ marginTop: 2, fontSize: 12.5, color: '#94A3B8' }}>{addr}</div>
                )}
                <div style={{
                  marginTop: 6, fontSize: 14, color: '#E2E8F0', lineHeight: 1.45,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {s.dispatcher_notes}
                </div>
              </li>
            )
          })}
        </ul>

        <button
          type="button" onClick={onClose}
          style={{
            marginTop: 22, width: '100%',
            background: '#FFB800', color: '#0A0B14',
            border: 0, borderRadius: 999, padding: '12px 16px', cursor: 'pointer',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.02em',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Compute the stops-with-notes list in `AvaMorningCard`.** After `customerStops` is derived (~line 90), add a memo:

```tsx
  const stopsWithDispatchNotes = useMemo(
    () => customerStops.filter((s) => s.dispatcher_notes && s.dispatcher_notes.trim().length > 0),
    [customerStops],
  )
```

Add state for the new sheet near the other sheet states (~line 71):

```tsx
  const [dispatchNotesOpen, setDispatchNotesOpen] = useState(false)
```

- [ ] **Step 3: Make stop-notes count a visibility trigger.** Update the early-return gate (the same one from Task 1 Step 3) to include it:

```tsx
  const dispatchNotesCount = stopsWithDispatchNotes.length
  if (!checklistOffered && !showStats && !showNotesNudge && !routeNote && dispatchNotesCount === 0) {
    return null
  }
```

- [ ] **Step 4: Import the sheet.** Add at top with the other sheet imports:

```tsx
import AvaDispatchNotesSheet from '@/components/ava/AvaDispatchNotesSheet'
```

- [ ] **Step 5: Render the count line.** Place it directly below the FROM DISPATCH block (and above the notes nudge / checklist). Insert after the FROM DISPATCH block from Task 1 Step 5:

```tsx
        {/* Stop-level dispatcher notes count — tap to review each one. */}
        {dispatchNotesCount > 0 && (
          <button
            type="button"
            onClick={() => setDispatchNotesOpen(true)}
            style={{
              marginTop: 12, width: '100%', textAlign: 'left',
              padding: '11px 14px',
              background: 'rgba(255,184,0,0.06)',
              border: '1px solid rgba(255,184,0,0.20)',
              borderRadius: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              fontFamily: 'inherit',
            }}
            aria-label="Review stops with notes from dispatch"
          >
            <span style={{ fontSize: 13.5, lineHeight: 1.4, color: C.text }}>
              <strong>{dispatchNotesCount}</strong> of your stops{' '}
              {dispatchNotesCount === 1 ? 'has a note' : 'have notes'} from dispatch.
              I&rsquo;ll remind you on the way to each one.
            </span>
            <span aria-hidden="true" style={{ color: C.gold, fontSize: 16, lineHeight: 1 }}>›</span>
          </button>
        )}
```

- [ ] **Step 6: Mount the sheet.** Next to the existing `{notesReviewOpen && (...)}` block (~465), add:

```tsx
    {dispatchNotesOpen && (
      <AvaDispatchNotesSheet
        stops={stopsWithDispatchNotes}
        onClose={() => setDispatchNotesOpen(false)}
      />
    )}
```

- [ ] **Step 7: Build.** Run: `npx next build` — expected clean.

- [ ] **Step 8: Commit.**

```bash
git add src/components/ava/AvaMorningCard.tsx src/components/ava/AvaDispatchNotesSheet.tsx
git commit -m "feat(ava): morning brief stop-notes count line + read-only review sheet"
```

---

## Task 3: Component 3 — Pre-launch notes sheet (Send-ETA + Navigate)

**Files:**
- Create: `src/components/ava/StopNotesPreSheet.tsx`
- Modify: `src/screens/StopDetailScreen.tsx`

- [ ] **Step 1: Create the pre-launch sheet.** New file `src/components/ava/StopNotesPreSheet.tsx`. Renders one labeled section per non-null field. `ctaLabel` is supplied by the caller (context-aware). Same dark sheet shell.

```tsx
'use client'

const BLUE = '#0000FF'

export interface StopNotesSections {
  dispatcherNote?:     string | null
  deliveryInstr?:      string | null  // notes_additional_delivery
  staffNote?:          string | null  // notes_employee_authored
  flipNote?:           string | null  // notes_flip (pickup only — caller gates)
  timingNote?:         string | null  // notes_set_by_time || notes_strike_time
  avaRemembers?:       string | null  // latest ava_stop_notes.note
}

interface StopNotesPreSheetProps {
  customerName: string
  sections:     StopNotesSections
  ctaLabel:     string          // "Got it" or "Got it — Navigate Now"
  onProceed:    () => void       // dismiss + run the underlying action
}

const SECTION_ORDER: Array<{ key: keyof StopNotesSections; label: string }> = [
  { key: 'dispatcherNote', label: 'DISPATCHER NOTE' },
  { key: 'deliveryInstr',  label: 'DELIVERY INSTRUCTIONS' },
  { key: 'staffNote',      label: 'STAFF NOTE' },
  { key: 'flipNote',       label: 'FLIP / TEARDOWN NOTE' },
  { key: 'timingNote',     label: 'TIMING NOTE' },
  { key: 'avaRemembers',   label: 'AVA REMEMBERS' },
]

export default function StopNotesPreSheet({ customerName, sections, ctaLabel, onProceed }: StopNotesPreSheetProps) {
  const visible = SECTION_ORDER.filter(({ key }) => {
    const v = sections[key]
    return typeof v === 'string' && v.trim().length > 0
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes for this stop"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      {/* NO backdrop-dismiss and NO auto-dismiss — driver controls close via the CTA. */}
      <div
        style={{
          width: '100%', maxWidth: 448,
          background: '#0F172A', color: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '16px 22px calc(28px + env(safe-area-inset-bottom))',
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 14px',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} aria-hidden="true" className="ava-wave-bar"
                style={{ width: 2, height: 12, background: '#fff', borderRadius: 1, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Before you go
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>{customerName}</div>

        {visible.map(({ key, label }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: '#FFB800', marginBottom: 5,
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 14.5, lineHeight: 1.5, color: '#E2E8F0',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {sections[key]}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onProceed}
          style={{
            marginTop: 6, width: '100%',
            background: '#FFB800', color: '#0A0B14',
            border: 0, borderRadius: 999, padding: '13px 16px', cursor: 'pointer',
            fontSize: 14.5, fontWeight: 800, letterSpacing: '0.02em',
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Import the sheet + listNotesForAddress in StopDetailScreen.** Add near the existing AVA imports (`AvaNoteSheet` import is at line 31; `normalizeAddressKey` at 29):

```tsx
import StopNotesPreSheet, { type StopNotesSections } from '@/components/ava/StopNotesPreSheet'
import { listNotesForAddress } from '@/lib/ava/stopNotesClient'
```

- [ ] **Step 3: Add the gate state + once-per-stop guard.** Near the other `useState` hooks (~line 319, by `avaNoteOpen`), add:

```tsx
  // Pre-launch notes sheet — fires before Send-ETA or Navigate when the stop
  // has any note. Once-per-stop guard via a ref Set so it shows at most once
  // per stop per mount; resets naturally on unmount / route reload.
  const [preSheet, setPreSheet] = useState<{ sections: StopNotesSections; mode: 'eta' | 'navigate' } | null>(null)
  const seenNoteStopsRef = useRef<Set<string>>(new Set())
```

(`useRef` is already imported in this file — confirm at build; the file uses refs like `dispatcherNoteAutoShownRef` and `etaCooldownRef`.)

- [ ] **Step 4: Add a helper that builds the sections + decides whether to gate.** Place it among the handler functions (e.g. just above `handleSendEta`, ~line 888). It pulls stop fields synchronously and fetches the latest AVA note text (the has-note signal is already known via `avaNoteCount`):

```tsx
  // Returns the assembled note sections for the current stop, or null if the
  // stop has no notes at all. notes_flip is pickup-only per spec.
  async function buildStopNoteSections(): Promise<StopNotesSections | null> {
    if (!stop) return null
    const timing = stop.notes_set_by_time?.trim() || stop.notes_strike_time?.trim() || null
    let avaText: string | null = null
    if (avaNoteCount > 0 && avaAddressKey) {
      const rows = await listNotesForAddress(avaAddressKey)
      avaText = rows[0]?.note?.trim() || null
    }
    const sections: StopNotesSections = {
      dispatcherNote: stop.dispatcher_notes?.trim() || null,
      deliveryInstr:  stop.notes_additional_delivery?.trim() || null,
      staffNote:      stop.notes_employee_authored?.trim() || null,
      flipNote:       stop.stop_type === 'pickup' ? (stop.notes_flip?.trim() || null) : null,
      timingNote:     timing,
      avaRemembers:   avaText,
    }
    const hasAny = Object.values(sections).some((v) => typeof v === 'string' && v.trim().length > 0)
    return hasAny ? sections : null
  }

  // Returns true if the sheet was shown (action should pause); false if there's
  // nothing to show or it's already been seen for this stop (action proceeds).
  async function maybeShowPreSheet(mode: 'eta' | 'navigate'): Promise<boolean> {
    if (!stop) return false
    if (seenNoteStopsRef.current.has(stop.stop_id)) return false
    const sections = await buildStopNoteSections()
    if (!sections) return false
    seenNoteStopsRef.current.add(stop.stop_id)
    setPreSheet({ sections, mode })
    return true
  }
```

- [ ] **Step 5: Wrap the Send-ETA action.** Add a request wrapper and point the button at it. New function near `handleSendEta`:

```tsx
  async function handleSendEtaRequest() {
    if (!stop || etaStatus === 'sending') return
    const shown = await maybeShowPreSheet('eta')
    if (!shown) void handleSendEta()
  }
```

Change the Send-ETA button (`src/screens/StopDetailScreen.tsx` ~line 1620) from `onClick={handleSendEta}` to:

```tsx
                    onClick={handleSendEtaRequest}
```

- [ ] **Step 6: Wrap the Navigate action without bypassing the early-pickup gate.** The current `handleNavigateRequest` (634-649) runs the early-pickup check. Insert the notes gate as the OUTER gate, then defer to the existing early-pickup logic. Rename the existing body to `proceedNavigateRequest` and make `handleNavigateRequest` async:

```tsx
  async function handleNavigateRequest() {
    if (!stop || navLoading) return
    const shown = await maybeShowPreSheet('navigate')
    if (shown) return            // sheet's "Navigate Now" will resume the flow
    proceedNavigateRequest()
  }

  // Existing early-pickup gate logic, unchanged — now invoked after the notes
  // sheet (or directly when there are no notes / already seen).
  function proceedNavigateRequest() {
    if (!stop || navLoading) return
    const nowMs = Date.now()
    const shouldGate =
      stop.stop_type === 'pickup'
      && isHardConstraintTier(stop.constraint_confidence)
      && !earlyOverride
      && !!pickupWindowStart
      && new Date(pickupWindowStart).getTime() > nowMs
    if (shouldGate) {
      setNow(new Date(nowMs))
      setShowEarlyPickupGate(true)
      return
    }
    void handleNavigate()
  }
```

> The QuickAction tile at line 2047 keeps `onClick={handleNavigateRequest}` — no change needed there.

- [ ] **Step 7: Render the pre-launch sheet + wire the proceed handler.** Next to the early-pickup gate modal (`{showEarlyPickupGate && ...}`, ~2288), add:

```tsx
      {preSheet && stop && (
        <StopNotesPreSheet
          customerName={stop.customer_name}
          sections={preSheet.sections}
          ctaLabel={preSheet.mode === 'navigate' ? 'Got it — Navigate Now' : 'Got it'}
          onProceed={() => {
            const mode = preSheet.mode
            setPreSheet(null)
            if (mode === 'navigate') proceedNavigateRequest()
            else                     void handleSendEta()
          }}
        />
      )}
```

- [ ] **Step 8: Build.** Run: `npx next build` — expected clean. Watch for: `isHardConstraintTier`, `earlyOverride`, `pickupWindowStart`, `setNow`, `minutesEarly` must still be in scope for `proceedNavigateRequest` (they were used by the old `handleNavigateRequest`, so they are).

- [ ] **Step 9: Commit.**

```bash
git add src/components/ava/StopNotesPreSheet.tsx src/screens/StopDetailScreen.tsx
git commit -m "feat(ava): pre-launch notes sheet on Send-ETA + Navigate with once-per-stop guard"
```

---

## Task 4: Component 4 — Stop Detail Order Notes section + route-list note indicator

**Files:**
- Modify: `src/screens/StopDetailScreen.tsx` (add Order Notes expandable section; dispatcher-note surfaces already exist — confirm intact)
- Modify: `src/screens/RouteListScreen.tsx` (note indicator on stop cards)

- [ ] **Step 1: Add collapse state for the Order Notes section.** In StopDetailScreen, near the other `useState` (~319):

```tsx
  const [orderNotesOpen, setOrderNotesOpen] = useState(false)
```

- [ ] **Step 2: Derive the Order Notes list.** Among the render-time derivations (after `stop` is known to be non-null, e.g. near line 597 where `isOtwSent` etc. are computed), add:

```tsx
  const orderNotes: Array<{ label: string; text: string }> = [
    { label: 'Delivery instructions', text: stop.notes_additional_delivery ?? '' },
    { label: 'Staff note',            text: stop.notes_employee_authored ?? '' },
    { label: 'Flip / teardown note',  text: stop.notes_flip ?? '' },
    { label: 'Set-by time',           text: stop.notes_set_by_time ?? '' },
    { label: 'Strike time',           text: stop.notes_strike_time ?? '' },
  ].filter((n) => n.text.trim().length > 0)
```

- [ ] **Step 3: Render the expandable Order Notes section.** Place it directly above the AVA Remembers entry surface (the `{!isDepotStop && (...)}` block at ~2222), so it sits with the other stop-level note surfaces and is hidden on depot stops + when empty:

```tsx
        {/* Order Notes — TapGoods-synced notes for this order. Collapsed by
            default; hidden entirely when there are none or on depot stops. The
            blue "Note from dispatch" surfaces above are separate and stay. */}
        {!isDepotStop && orderNotes.length > 0 && (
          <div style={{ padding: '14px 18px 0' }}>
            <button
              type="button"
              onClick={() => setOrderNotesOpen((v) => !v)}
              aria-expanded={orderNotesOpen}
              style={{
                width: '100%', textAlign: 'left',
                background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 14,
                padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}
            >
              <div style={{
                fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                color: C.ink, textTransform: 'uppercase',
              }}>
                Order Notes ({orderNotes.length})
              </div>
              <span aria-hidden="true" style={{
                fontSize: 14, color: C.muted,
                transform: orderNotesOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms ease',
              }}>›</span>
            </button>
            {orderNotesOpen && (
              <div style={{
                marginTop: 8, padding: '12px 14px',
                background: C.off, borderRadius: 12,
              }}>
                {orderNotes.map((n, i) => (
                  <div key={n.label} style={{ marginTop: i === 0 ? 0 : 14 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: C.muted, marginBottom: 4,
                    }}>
                      {n.label}
                    </div>
                    <div style={{
                      fontSize: 14, lineHeight: 1.45, color: C.ink,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {n.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
```

> `C.paper`, `C.ink`, `C.off`, `C.muted` are already in StopDetailScreen's palette (used throughout). Confirm at build.

- [ ] **Step 4: Confirm the dispatcher-note surfaces stay intact.** No edit required — verify the persistent "Note from dispatch" card (~1645-1689) and auto-modal (~2510-2573) still render. Spec asks they remain "prominently labeled." They are labeled "Note from dispatch" (blue). Leave the existing copy as-is (changing to "Dispatcher Note" is cosmetic and risks divergence from the dashboard's wording precedent) — note this in the report for Darren to confirm the label wording is acceptable.

- [ ] **Step 5: Add the note indicator to route-list stop cards.** In `src/screens/RouteListScreen.tsx`, the per-stop row computes flags near line 384 (`isCompleted`, `isOtw`, ...). Add:

```tsx
    const hasDispatchNote = !!stop.dispatcher_notes && stop.dispatcher_notes.trim().length > 0
```

Then render a small blue note dot next to the customer name. In the headline block (the `stop.customer_name` div, ~470), wrap the name + indicator in a flex row:

```tsx
          <div style={{
            marginTop: stop.company_name ? 2 : 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              fontSize: 16, fontWeight: 800,
              color: isCompleted ? C.muted : C.ink,
              fontFamily: FONT_DISPLAY, lineHeight: 1.2,
              letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {stop.customer_name}
            </span>
            {hasDispatchNote && (
              <span
                aria-label="Has a note from dispatch"
                title="Note from dispatch"
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: 4, background: C.blue,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 5h16M4 12h16M4 19h10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </span>
            )}
          </div>
```

> This replaces the existing single `customer_name` `<div>` at ~470 with the flex wrapper above. Preserve the exact ellipsis styling on the name span.

- [ ] **Step 6: Build.** Run: `npx next build` — expected clean.

- [ ] **Step 7: Commit.**

```bash
git add src/screens/StopDetailScreen.tsx src/screens/RouteListScreen.tsx
git commit -m "feat(ava): Stop Detail Order Notes section + route-list dispatcher-note indicator"
```

---

## Task 5: Verify + document

- [ ] **Step 1: Final full build.** Run: `npx next build` — must be green end-to-end (this is the indivisible pre-push gate).

- [ ] **Step 2: Manual smoke matrix (Vercel preview, branch `feature/ava-phase1`).** Push, then verify on the preview deploy:
  1. **Route note:** assign the test driver a route whose `routes.dispatcher_notes` is set → Home AVA card shows "FROM DISPATCH" as the first block; tap "Hear your morning brief" → AVA speaks the dispatch note first, then the brief. Null route note → no block.
  2. **Stop-notes count:** set `dispatch_stops.dispatcher_notes` on ≥1 of today's stops → count line renders ("N of your stops have notes from dispatch…"); tap → read-only sheet lists each stop + note; × / Got it / backdrop dismiss. Zero → no line.
  3. **Card-only-trigger:** a day with ONLY a route note (no checklist/stats/AVA-notes/stop-notes) → card still renders (regression guard for the new trigger).
  4. **Pre-launch sheet — Navigate:** open a stop with any note → tap "Open in Maps" → sheet appears with the correct labeled sections; "Got it — Navigate Now" launches maps. Re-tap "Open in Maps" same stop → no sheet (seen-guard), goes straight to navigate (early-pickup gate still applies on a hard-tier pickup).
  5. **Pre-launch sheet — Send ETA:** stop with a note, fresh (re-open the stop to reset the guard) → tap "Send ETA Text" → sheet appears; "Got it" → ETA sends normally. Tap "Open in Maps" after → no sheet (already seen this stop).
  6. **Pre-launch sheet — null:** stop with NO notes → neither "Send ETA" nor "Open in Maps" shows a sheet; both proceed with zero friction.
  7. **flip pickup-only:** a pickup stop with `notes_flip` → "FLIP / TEARDOWN NOTE" appears in the sheet; a delivery stop with `notes_flip` → it does NOT appear in the sheet (but DOES appear in the Order Notes section per spec).
  8. **Order Notes section:** stop with ≥1 TapGoods note → collapsed "Order Notes (N)" section on Stop Detail; expand → each labeled note. None → section hidden. Depot stop → hidden.
  9. **Dispatcher note intact:** stop with `dispatcher_notes` → blue "Note from dispatch" auto-modal + persistent card still work.
  10. **Route-list indicator:** route list → stops with `dispatcher_notes` show the small blue note dot next to the name; others don't.

- [ ] **Step 3: Update docs.** Append a Session entry to `docs/CHANGELOG.md`; add the "AVA dispatcher/stop notes surface" section to `CLAUDE.md` (under AVA Phase 1) describing the four surfaces, the data-plumbing change to `/api/routes`, the once-per-stop guard, and the smoke matrix; append any follow-ups to `tasks/todo.md` and patterns to `tasks/lessons.md`. (Workflow files — no approval needed.)

- [ ] **Step 4: Session summary for Darren** (for chat-Claude → Notion). Do NOT write Notion.

---

## Self-Review

- **Spec coverage:** Component 1 → Task 1. Component 2 → Task 2. Component 3 → Task 3. Component 4 → Task 4 (Order Notes + route-list indicator + dispatcher-note confirm). Data prerequisite (route note + 5 TG fields not in the SELECT) → Task 0. ✅
- **"Check the existing query first":** Confirmed — `routes` SELECT lacked `dispatcher_notes`; `dispatch_stops` SELECT had `dispatcher_notes`/`notes` but lacked the 5 TG fields. Extended the existing SELECT, no new endpoint. ✅
- **Type consistency:** `StopNotesSections` keys (`dispatcherNote`/`deliveryInstr`/`staffNote`/`flipNote`/`timingNote`/`avaRemembers`) are used identically in `StopNotesPreSheet` and `buildStopNoteSections`. `seenNoteStopsRef` referenced consistently. `proceedNavigateRequest` defined once, called from `handleNavigateRequest` and the sheet's `onProceed`. ✅
- **Edge cases flagged in the report:** dispatcher-note label wording ("Note from dispatch" vs spec's "Dispatcher Note"); `notes_flip` shown in Order Notes on deliveries but gated to pickups in the pre-launch sheet; new card-visibility triggers; single-route assumption for the route note.
