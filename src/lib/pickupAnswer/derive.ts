// Pickup Answer — pure derivation. Input: a delivery stop + its reservation's
// pickup stops. Output: a view model the gold card renders from.
//
// LOCKED sourcing doctrine (MBC Part 3):
//   • Inflatable committed floor = effectiveWindow().startsAt  ← the SAME value
//     the early-pickup guard (src/lib/stopConstraints.ts) enforces, so the "No
//     earlier than" promise and the block can never disagree. Resolves
//     COALESCE(dispatcher_time_override, pickup_window_start, notes). NEVER
//     scheduled_date (drifts), NEVER calculated_eta for the promise.
//   • Current ETA (Line 2) = calculated_eta — a live estimate, any routed
//     pickup, inflatable or tent.
//   • Tent/general day = scheduled_date + the flexible window. Planned when
//     unrouted, Scheduled when routed.
//   • Dedup phantom pickup rows (same scheduled_date/window/items) before
//     counting trips — group by scheduled_date. reservation_id is the grouping
//     key; linked_stop_id can chain pickup→pickup so it's not used here.
//   • Split labels are confidence-gated — only when exactly two distinct dates
//     with a cleanly-separable real inflatable trip + real tent trip; otherwise
//     neutral "First trip / Second trip". Never mislabels a customer.
//
// Pure + deterministic (no `now`, no I/O) so it's unit-testable and the card
// stays a thin renderer. Formatting (America/New_York) lives in ./format.

import { effectiveWindow } from '../stopConstraints'
import { hasInflatableItems, hasTentItems } from './classify'
import { etDateKey } from './format'
import type {
  DeliveryStopInput, PickupStopInput, PickupItem,
  PickupAnswer, PickupTrip, PickupKind, PickupStatus,
} from './types'

const NONE: PickupAnswer = {
  kind: 'none', status: 'none', floorTime: null, etaTime: null,
  day: null, window: { start: null, end: null }, trips: [],
}

// tent OR plain/general rental → the date-specific (calendar) bucket.
function classifyKind(items: PickupItem[]): PickupKind {
  const inf  = hasInflatableItems(items)
  const tent = hasTentItems(items)
  if (inf && tent) return 'mixed'
  if (inf)         return 'inflatable'
  return 'tent'
}

function ms(iso: string | null | undefined): number {
  if (!iso) return Infinity
  const t = new Date(iso).getTime()
  return isNaN(t) ? Infinity : t
}

interface TripBuild { trip: PickupTrip; items: PickupItem[] }

function buildTrip(rows: PickupStopInput[]): TripBuild {
  const items: PickupItem[] = []
  for (const r of rows) if (Array.isArray(r.items)) items.push(...r.items)
  const kind = classifyKind(items)

  // Representative = earliest effective window start, then earliest ETA.
  const rep = [...rows].sort((a, b) => {
    const d = ms(effectiveWindow(a).startsAt) - ms(effectiveWindow(b).startsAt)
    return d !== 0 ? d : ms(a.calculated_eta) - ms(b.calculated_eta)
  })[0]
  const win = effectiveWindow(rep)

  // Earliest non-null ETA across the collapsed group (soonest expected).
  let etaTime: string | null = null
  for (const r of rows) {
    if (r.calculated_eta && ms(r.calculated_eta) < ms(etaTime)) etaTime = r.calculated_eta
  }

  const isInflatable = kind === 'inflatable' || kind === 'mixed'
  const floorTime    = isInflatable ? (win.startsAt ?? null) : null
  const scheduledDate = rep.scheduled_date ?? null

  // Inflatable day comes from the FLOOR's ET calendar date (scheduled_date
  // drifts); tent/general day is scheduled_date verbatim.
  const day = isInflatable
    ? (floorTime ? etDateKey(floorTime) : scheduledDate)
    : scheduledDate

  const status: PickupStatus =
    floorTime ? 'locked' : etaTime ? 'scheduled' : 'planned'

  return {
    items,
    trip: {
      kind, status, floorTime, etaTime, day,
      window: {
        start: win.startsAt ?? rep.pickup_window_start ?? null,
        end:   win.endsAt   ?? rep.pickup_window_end   ?? null,
      },
      label: null,
      scheduledDate,
    },
  }
}

function sortKey(t: PickupTrip): number {
  const byInstant = Math.min(ms(t.floorTime), ms(t.window.start), ms(t.etaTime))
  if (byInstant !== Infinity) return byInstant
  if (t.scheduledDate) return ms(`${t.scheduledDate}T00:00:00Z`)
  return Infinity
}

const ORDINALS = ['First trip', 'Second trip', 'Third trip', 'Fourth trip', 'Fifth trip']

function labelTrips(builds: TripBuild[]): void {
  if (builds.length < 2) return  // single trip → no label

  if (builds.length === 2) {
    const [a, b] = builds
    const aInf = hasInflatableItems(a.items), aTent = hasTentItems(a.items)
    const bInf = hasInflatableItems(b.items), bTent = hasTentItems(b.items)
    const twoDistinctDates =
      !!a.trip.scheduledDate && !!b.trip.scheduledDate &&
      a.trip.scheduledDate !== b.trip.scheduledDate

    // Confidence gate: two distinct dates + one trip a real inflatable set
    // (no tent) + the other a real tent (no inflatable). Cleanly separable.
    if (twoDistinctDates && aInf && !aTent && bTent && !bInf) {
      a.trip.label = 'Inflatable pickup'; b.trip.label = 'Tent pickup'; return
    }
    if (twoDistinctDates && aTent && !aInf && bInf && !bTent) {
      a.trip.label = 'Tent pickup'; b.trip.label = 'Inflatable pickup'; return
    }
  }

  builds.forEach((bd, i) => { bd.trip.label = ORDINALS[i] ?? `Trip ${i + 1}` })
}

export function derivePickupAnswer(
  delivery: DeliveryStopInput | null | undefined,
  pickups:  PickupStopInput[] | null | undefined,
): PickupAnswer {
  const resvId = delivery?.reservation_id ?? null

  const relevant = (Array.isArray(pickups) ? pickups : []).filter((p) => {
    if ((p.stop_type ?? 'pickup') !== 'pickup') return false
    if (resvId && p.reservation_id && p.reservation_id !== resvId) return false
    return true
  })

  if (relevant.length === 0) return NONE

  // Dedup: group by scheduled_date; phantom rows (same date) collapse to one
  // trip; genuinely different dates become separate trips.
  const groups = new Map<string, PickupStopInput[]>()
  for (const p of relevant) {
    const key = p.scheduled_date ?? '∅'
    const arr = groups.get(key)
    if (arr) arr.push(p)
    else groups.set(key, [p])
  }

  const builds = Array.from(groups.values()).map(buildTrip)
  builds.sort((a, b) => sortKey(a.trip) - sortKey(b.trip))
  labelTrips(builds)

  const trips = builds.map((b) => b.trip)

  // Overall reservation kind spans every pickup item.
  const allItems: PickupItem[] = []
  for (const p of relevant) if (Array.isArray(p.items)) allItems.push(...p.items)

  const primary = trips[0]
  return {
    kind:      classifyKind(allItems),
    status:    primary.status,
    floorTime: primary.floorTime,
    etaTime:   primary.etaTime,
    day:       primary.day,
    window:    primary.window,
    trips,
  }
}
