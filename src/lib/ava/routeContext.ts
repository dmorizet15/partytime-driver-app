// ─── AVA route context (pure) ────────────────────────────────────────────────
// Renders the driver's route into the volatile Block 1 of the /api/ava/ask
// system prompt. Pure + deterministic (no I/O, no `now`) so it can be smoke
// tested against real rows — same shape as equipmentReturns/ledger.ts and
// pickupAnswer/derive.ts.
//
// Two invariants this module exists to hold:
//
// 1. STOPS ARE NUMBERED IN DRIVE ORDER, deliveries and pickups in ONE sequence.
//    The previous design emitted two separate unnumbered lists (delivery stops,
//    then pickup stops), so an ordinal question resolved against the wrong stop
//    on any mixed route. Live example, route 3 on 2026-07-10:
//      pos 0 delivery, 1 delivery, 2 delivery, 3 delivery, 4 PICKUP, 5 delivery
//    "My fifth stop" is the pickup, but the 5th entry of a delivery-only list is
//    position 5. Both stops are named "EMILY CHAMBERS", so the wrong answer read
//    as correct.
//
// 2. A STOP CARRIES EVERY NAME IT MIGHT BE CALLED. Live: company_name
//    "Camp Kinder Ring - 7/12/2026" (the TapGoods order name — this is what the
//    driver's stop card shows), customer_name "Gabby x" (the on-site contact),
//    client_company "CAMP KINDER RING". Ask about "Camp Kinder Ring" and only
//    company_name matches. 407 of 958 live delivery/pickup stops have a
//    client_company whose text appears nowhere in customer_name.

import { resolveCategory } from '@/lib/itemCategories'

export type RawItem = {
  qty?:         number | null
  name?:        string | null
  category?:    string | null
  bundle_name?: string | null
}

export interface RouteStop {
  route_id:         string | null
  route_position:   number | null
  stop_type:        string | null
  items:            RawItem[]
  payment_state:    string | null
  customer_name:    string | null
  company_name:     string | null
  client_company:   string | null
  address:          string | null
  reservation_id:   string | null
  dispatcher_notes: string | null
  completed_at:     string | null
  stop_status:      string | null
}

export interface RenderRouteContextInput {
  /** Customer + depot stops, already ordered by route_position ascending. */
  stops:                RouteStop[]
  routeNumberById:      Map<string, number | null>
  /** Route-level dispatcher notes (from `routes`), stop-level are read off stops. */
  routeDispatcherNotes: string[]
  routeDate:            string
  isToday:              boolean
}

// Drivers say the name, not the date, so a TRAILING bare date comes off the
// display name. A date in the MIDDLE must survive — it's often the only thing
// separating two stops for the same customer ("NYACK CAMP- JULY 10TH, 9AM-12:30PM"
// vs "NYACK CAMP- 7/11/2026, 12PM -6PM, FAMILY DAY").
const TRAILING_DATE_RE = /\s*[-–—]\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/

export function stopNames(s: RouteStop): { display: string; aliases: string[] } {
  const company = (s.company_name   ?? '').trim()
  const contact = (s.customer_name  ?? '').trim()
  const org     = (s.client_company ?? '').trim()

  const display = (company ? company.replace(TRAILING_DATE_RE, '').trim() : '') || contact || 'Customer'

  const seen = new Set([display.toLowerCase()])
  const aliases: string[] = []
  const add = (label: string, value: string) => {
    const v = value.trim()
    if (!v || seen.has(v.toLowerCase())) return
    seen.add(v.toLowerCase())
    aliases.push(`${label}: ${v}`)
  }
  add('contact', contact)
  add('company', org)
  return { display, aliases }
}

export function isCompleted(s: RouteStop): boolean {
  return s.completed_at != null || s.stop_status === 'completed'
}

export function isDepot(s: RouteStop): boolean {
  return s.stop_type === 'warehouse' || s.stop_type === 'warehouse_return'
}

function typeLabel(stopType: string | null): string {
  if (stopType === 'delivery') return 'DELIVERY'
  if (stopType === 'pickup')   return 'PICKUP'
  return (stopType ?? 'stop').toUpperCase()
}

// Tent count uses the app's vetted definition (countTentItems): category contains
// 'tent' AND the name is an actual tent/canopy/marquee. A bare category match
// wrongly pulls in TENTS-filed accessories like "CAFE LIGHTS" (qty 200).
export function isTentItem(it: RawItem): boolean {
  const nameL = (it.name ?? '').toLowerCase()
  return (it.category ?? '').toLowerCase().includes('tent')
    && (nameL.includes('tent') || nameL.includes('canopy') || nameL.includes('marquee'))
}

/** Per-name qty aggregate across a set of stops, qty-desc. */
export function aggregateItems(stops: RouteStop[]): Array<[string, number]> {
  const byName = new Map<string, number>()
  for (const s of stops) {
    for (const it of s.items) {
      const name = (it.name ?? '').trim()
      if (!name) continue
      byName.set(name, (byName.get(name) ?? 0) + (it.qty ?? 1))
    }
  }
  return Array.from(byName.entries()).sort((a, b) => b[1] - a[1])
}

function categoryTotals(stops: RouteStop[]): { tents: number; chairs: number; tables: number } {
  let tents = 0, chairs = 0, tables = 0
  for (const s of stops) {
    for (const it of s.items) {
      const qty = it.qty ?? 1
      if (isTentItem(it)) tents += qty
      const bucket = resolveCategory(it.category, it.name ?? '')
      if (bucket === 'Chairs') chairs += qty
      else if (bucket === 'Tables') tables += qty
    }
  }
  return { tents, chairs, tables }
}

function itemsList(stops: RouteStop[]): string {
  const agg = aggregateItems(stops)
  return agg.length ? agg.map(([name, qty]) => `${qty}× ${name}`).join(', ') : 'nothing'
}

// Per-stop manifest, bundle-aware. Deck items carry a parent bundle
// (15× "STAGE 4'X4'" → "STAGE 12'X20'") — the bundle is what the crew is
// actually building, and the loose piece count alone cannot answer "what size
// stage?". Keyed by name+bundle so the same piece under two different bundles
// never collapses into one line. Kept separate from aggregateItems() so the
// DELIVERING / PICKING UP totals stay byte-for-byte unchanged.
function stopItemsList(s: RouteStop): string {
  const byKey = new Map<string, { name: string; bundle: string; qty: number }>()
  for (const it of s.items) {
    const name = (it.name ?? '').trim()
    if (!name) continue
    const bundle = (it.bundle_name ?? '').trim()
    const key = `${name}::${bundle}`
    const cur = byKey.get(key)
    if (cur) cur.qty += it.qty ?? 1
    else byKey.set(key, { name, bundle, qty: it.qty ?? 1 })
  }
  const rows = Array.from(byKey.values()).sort((a, b) => b.qty - a.qty)
  if (!rows.length) return 'no items listed'
  return rows
    .map((r) => (r.bundle ? `${r.qty}× ${r.name} (assembles into ${r.bundle})` : `${r.qty}× ${r.name}`))
    .join(', ')
}

function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/** One numbered, drive-order list for a single route. */
export function numberedStopLines(stops: RouteStop[]): string[] {
  if (stops.length === 0) return ['  (no customer stops)']

  const nextIdx = stops.findIndex((s) => !isCompleted(s))
  const total   = stops.length

  return stops.flatMap((s, i) => {
    const { display, aliases } = stopNames(s)
    const state = isCompleted(s) ? ' · ✓ COMPLETED' : (i === nextIdx ? ' · ← NEXT STOP' : '')
    const alias = aliases.length ? `  [${aliases.join('] [')}]` : ''
    const where = (s.address ?? '').trim()
    const ord   = (s.reservation_id ?? '').trim()
    const items = stopItemsList(s)

    return [
      `  Stop ${i + 1} of ${total} · ${typeLabel(s.stop_type)}${state}`,
      `    ${display}${alias}`,
      ...(where ? [`    ${where}`] : []),
      ...(ord   ? [`    Order ref: ${ord}`] : []),
      `    Items: ${items}`,
    ]
  })
}

// How to resolve whatever the driver actually said. Lives in the volatile route
// block, not the cached persona block, because it only means anything next to
// the route it describes.
export const ROUTE_USAGE_RULES = [
  'HOW TO READ THIS ROUTE:',
  '- Stops are numbered in the exact order the driver drives them. "Stop 2", "my',
  '  second stop", and "the second one" all mean Stop 2.',
  '- Each stop may list a [contact: ...] and a [company: ...] alongside its name.',
  '  Those are the SAME stop under different names. Match whatever name the driver',
  '  uses against all of them.',
  '- "What\'s next", "the next stop", and "N stops away" are counted from the stop',
  '  marked ← NEXT STOP. Stops marked ✓ COMPLETED are already done.',
  '- When the driver asks what is on a stop, or what they are delivering or picking',
  '  up, read out the actual items and quantities.',
  '- "(assembles into X)" means those loose pieces build X. X is what the crew is',
  '  actually setting up, so lead with it: 15 4-by-4 stage decks that assemble into',
  '  a 12-by-20 stage is "a 12 by 20 stage, built from fifteen 4 by 4 decks".',
  '- If the driver names a place that is NOT on the route below, say so plainly and',
  '  tell them which stops are on the route. Never claim you are logging their',
  '  question — you have the route right here.',
].join('\n')

/**
 * Render the route block. Returns null when there are no customer stops, so the
 * caller can fall through to the client seed or the no-route copy.
 */
export function renderRouteContext(input: RenderRouteContextInput): string | null {
  const { stops, routeNumberById, routeDispatcherNotes, routeDate, isToday } = input

  // Depot legs never carry customer equipment.
  const customerStops = stops.filter((s) => !isDepot(s))
  if (customerStops.length === 0) return null

  // Direction split drives the TOTALS only. Deliveries DROP equipment at the
  // customer; pickups (and any return) RETRIEVE it — never conflate them. Any
  // other customer stop type ('service') is excluded from both totals but still
  // appears, in order, in the numbered list.
  const deliveryStops = customerStops.filter((s) => s.stop_type === 'delivery')
  const pickupStops   = customerStops.filter((s) => s.stop_type === 'pickup')

  const delCat = categoryTotals(deliveryStops)
  const picCat = categoryTotals(pickupStops)

  const codCount = customerStops.filter(
    (s) => s.stop_type === 'delivery' && (s.payment_state ?? '') === 'cod'
  ).length

  const dispatcherNotes = [
    ...routeDispatcherNotes,
    ...customerStops.map((s) => s.dispatcher_notes),
  ].filter((n): n is string => !!n && n.trim().length > 0)

  // Group by route and number each route independently. Merging routes into one
  // flat list makes every ordinal meaningless — a driver running routes 1 and 4
  // got stops ordered 0,0,1,2,3 across both.
  const byRoute = new Map<string, RouteStop[]>()
  for (const s of customerStops) {
    const key = s.route_id ?? 'unknown'
    const list = byRoute.get(key)
    if (list) list.push(s)
    else byRoute.set(key, [s])
  }
  const routeIdsInOrder = Array.from(byRoute.keys()).sort(
    (a, b) => (routeNumberById.get(a) ?? 0) - (routeNumberById.get(b) ?? 0)
  )

  const heading = isToday
    ? `ROUTE SUMMARY FOR TODAY (${humanDate(routeDate)}):`
    : `ROUTE SUMMARY FOR ${humanDate(routeDate)} (this is the driver's UPCOMING route — NOT today):`

  const lines: string[] = [heading, '', ROUTE_USAGE_RULES]

  if (routeIdsInOrder.length > 1) {
    lines.push(
      '',
      `NOTE: this driver is running ${routeIdsInOrder.length} routes today. Stop numbers`,
      'restart at 1 on each route. If an ordinal question is ambiguous across routes,',
      'ask which route they mean.',
    )
  }

  for (const rid of routeIdsInOrder) {
    const num    = routeNumberById.get(rid)
    const rStops = byRoute.get(rid) ?? []
    lines.push('')
    lines.push(`ROUTE ${num ?? '?'} — ${rStops.length} customer stops, in drive order:`)
    lines.push(...numberedStopLines(rStops))
  }

  lines.push('')
  lines.push('ITEM TOTALS (delivery vs pickup are separate — never add them together):')
  lines.push(`DELIVERING: ${itemsList(deliveryStops)}`)
  lines.push(`PICKING UP / RETURNING: ${itemsList(pickupStops)}`)
  lines.push(
    `Category totals — DELIVERING: ${delCat.tents} tents, ${delCat.chairs} chairs, ${delCat.tables} tables. ` +
    `PICKING UP: ${picCat.tents} tents, ${picCat.chairs} chairs, ${picCat.tables} tables.`
  )
  lines.push(
    codCount > 0
      ? `Cash-on-delivery (COD) stops: ${codCount} — collect payment on arrival.`
      : `No cash-on-delivery stops on this route.`
  )
  if (dispatcherNotes.length) {
    lines.push('Dispatch notes:')
    for (const n of dispatcherNotes) lines.push(`- ${n.trim()}`)
  }

  return lines.join('\n')
}
