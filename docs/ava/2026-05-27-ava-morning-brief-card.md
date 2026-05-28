# AVA Morning Brief Card (Tier 2) — Design

**Session:** AVA Phase 1 — Session 2
**Branch:** `feature/ava-phase1` (NOT main; preview-deploy only)
**Date:** 2026-05-27
**Status:** Approved — proceeding to build
**Spec source:** Notion `3550aa6451b881f19285e369387b75b6` ("Ava — AI Layer Master Spec"), May 24 strategy decisions.

---

## Purpose

Ship the Tier 2 surface of the AVA presence model: a conditional morning brief on the Home screen that surfaces actionable intel (checklist offer, stats, prior stop notes) when AVA has something to say, and stays absent when it doesn't. Also ship the missing Part 1 element (weather flag) and restructure Home into two states: **pre-pre-trip full briefing** and **post-pre-trip quiet state**.

No new migrations. The three profile preference columns (`checklist_enabled`, `personality_preference`, `stats_enabled`) and the `ava_stop_notes` / `ava_conversations` tables shipped in Session 1.

---

## Home screen architecture

Two states gated on `inspected` (from `useInspectionStatus` — true once today's pre-trip is signed off).

### Pre-pre-trip (full briefing)

```
HERO
  Good morning, Darren.
  Steady day. 3 stops scheduled. 3 deliveries.
  [truck pill — TRK-12 · ABC-1234]
─────────────────────────────────────────────
Pre-trip inspection card    (tappable CTA)
Post-trip defect card       (renders only when route complete)
COD card                    (conditional — gold)
FleetAlertCard              (conditional — fleet-access only)
WeatherFlagCard             (conditional — wind ≥20mph / precip)
AVA morning card            (conditional — see triggers)
─────────────────────────────────────────────
THE DAY, IN 3
  1 ● Stop one
  2 ● Stop two
  3 ● Stop three
─────────────────────────────────────────────
[ Inspect & Start Route → ]  (gold CTA)
```

### Post-pre-trip (quiet state)

```
HERO
  Good morning, Darren.
  [truck pill — TRK-12 · ABC-1234]
  (no sub-copy line)
─────────────────────────────────────────────
Post-trip defect card       (only when route complete)
COD card                    (conditional — until collected)
FleetAlertCard              (conditional)
─────────────────────────────────────────────
(no pre-trip receipt)
(no weather flag)
(no AVA card)
(no day list)
(no Gold CTA)
─────────────────────────────────────────────
BottomNav → Routes tab = active route entry point
```

**Gate logic:** the existing `inspected` boolean (line 322 of `DayRouteSelectorScreen.tsx`) drives the entire quiet-state cutover. Cards listed under "always-on in populated body" keep their existing internal conditions; the briefing-only cards check `!inspected` before rendering.

**Rationale (locked May 24 strategy + this session's clarifications):**
- Pre-trip is the explicit handoff between "morning planning" and "executing route." Home is for planning. Routes tab is for executing.
- COD stays because it's operational, not morning brief — driver needs the cash reminder until collected.
- FleetAlertCard stays for the same operational reason.
- Weather flag is morning-brief (helps decide what to grab before leaving); per-stop weather modules cover the in-flight case.
- Pre-trip receipt is removed from the quiet state — the brief's previous "communication hub" framing is superseded.

---

## AVA morning card

### Trigger rules (card renders if ANY are true)

| Trigger                                                    | Active this session?     |
| ---------------------------------------------------------- | ------------------------ |
| `checklist_enabled` AND dependency-map hits > 0            | No — depmap not seeded   |
| `stats_enabled` AND `weekStopsCompleted > 0`               | Yes — Joey opts in       |
| `ava_stop_notes` rows match today's stop address keys      | No — table empty (no writer UI yet) |

**Realistic Phase-1 state:** AVA card surfaces only for Joey by default. Defensible per the Notion "Invisible by default, surfaced contextually when useful" principle. As depmap content + stop notes accumulate (Sessions 3 + 4), the card surfaces more often without code changes here.

### Anatomy (top to bottom)

```
┌─ AVA card ──────────────────────────────────┐
│ ▮▮▮▮▮  AVA                                  │  ← 20px AvaChip variant (no-tap) + label
│                                             │
│ 3 stops today. One COD. Let's go.           │  ← morning message
│                                             │
│ ┌─ Checklist offer (hits > 0 only) ──────┐ │  ← HIDDEN this session
│ │ I found 2 things to double-check       │ │
│ │ before you leave.                      │ │
│ │ [ Run through checklist → ]            │ │
│ └────────────────────────────────────────┘ │
│                                             │
│ ─────────────────────────────               │  ← divider (only when stats present)
│ 34 stops this week.                         │  ← stats block (only if stats_enabled)
│                                             │
│                       🎙 Voice · Text       │  ← muted toggle stub, right-aligned
└─────────────────────────────────────────────┘
```

**Styling:** dark card (`#1A1A1A`), rounded 18px to match other Home cards, subtle border (`rgba(255,255,255,0.08)`).

**The "Run through checklist" CTA tap action** is a placeholder this session (no-op or coming-soon toast). The real checklist UI lands Session 3 once dependency map content is authored.

**Voice/Text toggle** is a muted, non-interactive chip (`🎙 Voice · Text`) — visual reservation for Session 5's ElevenLabs wiring.

---

## Morning message generation

Pure-functional helper: `getMorningMessage(profile, summary) → string`.

**Inputs:**
- `personality_preference: 'direct' | 'personality'`
- `summary: { stopCount, codCount, tentCount, hasWeatherFlag }`

**Direct mode** — template, route-weight-aware. Examples:
- 1 stop, no COD: `"1 stop today. Easy."`
- 1 stop + COD: `"1 stop today, cash on arrival. Let's go."`
- 2–3 stops, no COD: `"3 stops today. Let's go."`
- 2–3 stops + COD: `"3 stops today. One COD. Let's go."`
- 4+ stops: `"Big day — 6 stops. Let's get to it."`
- Heavy tent day (≥2 tents): `"Heavy tent day — 4 stops, 2 tents. Steady wins."`

**Personality mode** — 3–4 variants per condition set, picked by `hash(date + driverId) % variants.length` so the message is stable within a day and varies day-to-day without repeating the same line in a single session. Example for "3 stops + COD":
- `"Three stops, one wants cash. Be the cash whisperer today."`
- `"3 stops, one COD. Easy money — literally."`
- `"Three on the board, one paying at the door. Let's roll."`
- `"Light schedule, one cash collect. Standard day."`

All variants live as local arrays in `getMorningMessage.ts`. No API, no system prompt — this is Phase 1 direct mode. Cloud generation lands later when Claude API wiring goes in.

---

## Files

### Added

| Path                                            | Purpose                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/ava/getMorningMessage.ts`              | Pure helper — direct templates + personality variant arrays.            |
| `src/lib/ava/dependencyHits.ts`                 | Placeholder returning 0; signature ready for real impl when content seeded. |
| `src/lib/ava/stopNotesClient.ts`                | Query `ava_stop_notes` by today's stop `address_key`s; returns counts.  |
| `src/components/ava/AvaMorningCard.tsx`         | The conditional card. Self-fetches stats + notes; renders or returns null. |
| `src/components/WeatherFlagCard.tsx`            | Compact static-summary card; uses first delivery stop's lat/lng.        |

### Modified

| Path                                            | Change                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| `src/types/auth.ts`                             | Extend `UserProfile` with the three new boolean/text preference fields. |
| `src/lib/auth.ts`                               | Extend `getUserRole` SELECT to pull the three columns.                  |
| `src/lib/personalStatsClient.ts`                | Add `weekStopsCompleted` to existing query (client-side filter on already-fetched stops). |
| `src/screens/DayRouteSelectorScreen.tsx`        | Wire AVA + Weather cards; implement quiet-state gate; delete "Ask Ava about today" stub button. |

No new hooks, no new API routes, no new migrations.

---

## Data sources

### Stats

Extend `fetchPersonalStats(driverId)` with `weekStopsCompleted: number`. The existing SELECT already pulls every stop on the driver's routes with `completed_at`; we add a client-side filter for `completed_at >= startOfWeek(now)`. No new round-trip.

**Deferred to follow-up:** COD-collected-this-week. Requires a query against `cash_collections` (separate table, separate round-trip). Logged in `tasks/todo.md`.

### Weather

`getWeatherSnapshot(lat, lng)` already exists (`src/lib/weather/weather-service.ts`). `WeatherFlagCard` calls it with the first delivery stop's coordinates and runs the snapshot through the existing `evaluateWindWindow` / `evaluateRainWindow` / `evaluateSnowWindow` threshold evaluators (`src/lib/weather/thresholds.ts`). Card renders only when at least one returns ≥amber for today's delivery window. Hidden when no first delivery stop (pickup-only day).

### Stop notes

`stopNotesClient.fetchTodayNotesCount(addressKeys: string[])` runs a single `select count(*)` against `ava_stop_notes` filtered by `address_key IN (...)`. Will always return 0 this session (no writer UI shipped yet); query is safe — RLS allows SELECT for authenticated users.

### Dependency-map hits

`dependencyHits.countHitsForItems(items)` returns 0 this session. Real implementation lands when Darren seeds the dependency map (separate Notion task). Signature matches future impl; flipping the placeholder is a one-file change.

---

## Branch + commit

- Branch: `feature/ava-phase1` (NOT main).
- Commit message: `feat(ava): morning brief card — static summary + conditional AVA card (Tier 2 presence)`.
- Vercel previews this branch; production stays on `main` until all 9 Phase 1 components land.

## Out of scope (later sessions)

- ElevenLabs TTS wiring + functional voice/text toggle — Session 5.
- Checklist UI per-item — Session 3 (gated on Darren authoring dependency-map content).
- AVA Remembers entry UI on stop detail + arrival surface — Session 4.
- Profile-settings UI for the three new toggles — separate session.
- SOP lookup — Session 6.
- COD-collected-this-week stat — follow-up (new query needed).

## Smoke test (after Vercel preview deploys)

1. Sign in as a driver with stops today. Pre-pre-trip:
   - Hero shows greeting + stop count + truck. Day list renders. Pre-trip card tappable.
   - WeatherFlagCard renders only if the first delivery stop has ≥amber wind/rain/snow for today.
   - AVA card does NOT render for default-config drivers (Lucas/Austin/Dylan profiles). For Joey (`stats_enabled=true`), AVA card renders with morning message + stats line ("N stops this week.").
   - "Ask Ava about today" stub button is gone.
2. Complete the pre-trip inspection. Return to Home:
   - Hero shows greeting + truck only — no sub-copy line.
   - Pre-trip receipt card is hidden.
   - Day list, AVA card, WeatherFlagCard, Gold CTA all hidden.
   - FleetAlertCard + COD card still render if their conditions hold.
3. Toggle `stats_enabled` on a non-Joey profile dashboard-side → AVA card appears on next Home mount.
4. Inspect `getMorningMessage` output across a few date+driver combos in dev — verify personality variants don't repeat within a single session for the same driver/date.
