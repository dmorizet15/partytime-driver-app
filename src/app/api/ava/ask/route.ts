// ─── POST /api/ava/ask ───────────────────────────────────────────────────────
// AVA Phase 2 — Session 2. Real Haiku-backed conversation behind the home-screen
// "Ask Ava about today" button (and, later, the AvaChip drawer).
//
// Context model: the ROUTE is loaded SERVER-SIDE (loadRouteDateContext) for both
// today and preview dates — it carries per-stop names, drive-order numbering, and
// full manifests, none of which the client seed can express. WEATHER stays
// client-seeded: Home has already computed the flags via POST /api/ava/route-weather
// (live Tomorrow.io calls) and re-deriving them here would re-run that fan-out on
// every question. The old client-seeded route context survives only as a fallback
// when the server load returns nothing. Driver identity + the audit row are always
// derived server-side (driver_id = auth.uid(), never client-trusted).
//
// Model: claude-haiku-4-5-20251001 — fast + cheap, answer is read aloud via TTS.
// No effort / adaptive thinking (unsupported on Haiku 4.5; would 400).
//
// 503 { error: 'AVA unavailable' } when ANTHROPIC_API_KEY is unset, so the sheet
// can show a friendly "try again" state without leaking config detail.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import Anthropic                     from '@anthropic-ai/sdk'
import { isDriverVisibleSop }        from '@/lib/ava/sopVisibility'
import { isElevatedRole }            from '@/lib/ava/access'
import { renderRouteContext }        from '@/lib/ava/routeContext'
import type { RawItem, RouteStop }   from '@/lib/ava/routeContext'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL       = 'claude-haiku-4-5-20251001'
const MAX_TOKENS  = 500   // answers are short — they get read aloud via ElevenLabs
const MAX_HISTORY = 12    // trim long sessions; this is single-day Q&A, not a thread
const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/

// ─── Seeded route context (client-computed on Home) ──────────────────────────
interface AskContext {
  driverName?:     string | null
  stopCount?:      number | null
  codCount?:       number | null
  hasWeatherFlag?: boolean | null
  weatherStops?:   string[]        // names of stops with a ≥20 mph wind alert
  dispatcherNotes?: string[]       // route- + stop-level dispatcher notes
  manifestSummary?: string | null  // short "12 tables, 4 tents, …" style line
}

interface AskBody {
  question?:  unknown
  history?:   unknown
  context?:   AskContext
  routeId?:   string | null
  stopId?:    string | null
  // Next Day Route Preview — when the conversation is opened from the route
  // preview / next-shift card, this is the UPCOMING route's date (YYYY-MM-DD).
  // The server loads THAT date's route (crew-scoped to the caller) into the
  // system prompt instead of the today-seeded `context`, so AVA can answer
  // about the upcoming route ("how many tents on my route Wednesday?").
  routeDate?: string | null
  // The device's LOCAL today (YYYY-MM-DD). Used to load today's route in the
  // driver's timezone instead of the Vercel UTC date (which can roll a day ahead
  // in the evening). Mirrors the next-shift endpoint's ?today= pattern.
  localDate?: string | null
}

interface ChatTurn { role: 'user' | 'ava'; text: string }

function getSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* route-handler context — cookie writes no-op */ }
        },
      },
    }
  )
}

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface SopRow {
  sop_number: string
  title:      string
  content:    string
  department: string | null
}

// Ava Studio knowledge layers — global published rows (same for every driver),
// injected into the stable Block 0 alongside SOPs.
interface VocabRow {
  term:       string
  definition: string
  aliases:    string[] | null
  category:   string
}
interface KnowledgeRow {
  question:   string
  answer:     string
  category:   string
}

// Locked copy: shown to the driver in place of the model's UNKNOWN: signal.
const GAP_SILENT_COPY =
  "I'm not sure about that one, but I'm logging your question to help us " +
  "build out our knowledge base. You'll see the answer show up here soon."

// ─── System prompt: two blocks, split for caching ────────────────────────────
// Render order is system[0] → system[1]. Block 0 (persona + style + the SOP
// knowledge base) is STABLE per role — identical across every driver and every
// turn — so it carries the cache_control breakpoint and is shared across all
// driver conversations (the SOP base alone clears Haiku's 4096-token cache
// minimum). Block 1 (today's route) is VOLATILE — it differs per conversation
// from the client seed — so it sits after the breakpoint and is never cached.
// Keeping driverName + route data out of block 0 is what lets the cache prefix
// be shared rather than per-driver.

// Block 0 — persona, voice rules, role-scoped SOPs, plus the global Ava Studio
// terminology + operational knowledge base. All of this is stable per role and
// identical across drivers, so it carries the cache breakpoint.
function buildKnowledgeBlock(
  sops:      SopRow[],
  vocab:     VocabRow[],
  knowledge: KnowledgeRow[],
): string {
  const lines: string[] = [
    "You are AVA, the in-cab assistant for a PartyTime Rentals delivery driver.",
    "You help with TODAY'S route while the driver is on the road — their stops,",
    "what's loaded, cash collection, dispatch notes, and weather that affects",
    "setups — and you answer how-to questions about the job using PartyTime's",
    "standard operating procedures.",
    "",
    "Style: concise and spoken-word — your answers are read aloud in the truck.",
    "1–3 short sentences. No markdown, no bullet lists, no headers. Lead with the",
    "answer. Never invent stop names, totals, notes, or procedure steps; if",
    "something isn't in the procedures or today's route below, say you don't have",
    "that detail and suggest they check with dispatch.",
    "",
    "Exception to the length rule: when the driver asks what is on a stop, or what",
    "they are delivering or picking up, read out the actual items and quantities in",
    "full. Still plain spoken sentences — no bullets — but do not summarize the",
    "manifest down to a couple of examples. They are using it to load the truck.",
  ]

  if (sops.length > 0) {
    lines.push(
      "",
      "You have PartyTime's standard operating procedures memorized (below). When",
      "the driver asks how to do something operational — detaching the gooseneck",
      "trailer, securing a load, setting up or striking a tent, what to do after a",
      "vehicle accident, reporting an incident — answer their actual question in",
      "plain spoken language, drawing on the relevant procedure. Give the steps",
      "that matter for what they asked; don't recite the whole procedure. Do NOT",
      'say "per SOP-001" or cite procedure numbers unless the driver explicitly',
      "asks which procedure covers it.",
      "",
      "── Standard operating procedures ──",
    )
    for (const s of sops) {
      const dept = s.department ? ` (${s.department})` : ''
      lines.push("", `${s.sop_number} · ${s.title}${dept}`, s.content.trim())
    }
  }

  // PTR terminology — definitions + aliases for jargon in the question.
  if (vocab.length > 0) {
    lines.push(
      "",
      "---",
      "PTR TERMINOLOGY",
      "These terms are specific to PartyTime Rentals. Apply these definitions",
      "when interpreting any question that uses them or their aliases.",
    )
    for (const v of vocab) {
      const aliases = v.aliases ?? []
      const alias = aliases.length > 0 ? ` (also: ${aliases.join(', ')})` : ''
      lines.push(`**${v.term}**${alias}: ${v.definition}`)
    }
    lines.push("---")
  }

  // Operational knowledge base — verified Q&A.
  if (knowledge.length > 0) {
    lines.push(
      "",
      "---",
      "OPERATIONAL KNOWLEDGE BASE",
      "Verified answers about how PartyTime Rentals operates.",
      "Use these answers directly when they match the question asked.",
    )
    for (const k of knowledge) {
      lines.push(`Q: ${k.question}`, `A: ${k.answer}`)
    }
    lines.push("---")
  }

  // Gap signal — must be the very end of the system prompt. When Ava can't
  // answer from the knowledge above, it prefixes UNKNOWN: so the route can log
  // the gap and swap in a friendly message (never shown to the driver).
  lines.push(
    "",
    "If you cannot answer confidently from the PTR Terminology, SOPs, or " +
    "Knowledge Base above, OR from the driver's route context that follows " +
    "below, begin your response with exactly 'UNKNOWN:' and nothing else " +
    "before that prefix. This is a system signal only — never explain it to " +
    "the user.",
    "",
    "NEVER use the UNKNOWN: signal for a question about the driver's own route: " +
    "their stops, stop order, customers, addresses, order refs, or the equipment " +
    "on those stops. All of that is in the route section below. If the driver " +
    "names a customer, company, or place that is not on their route, tell them " +
    "so directly and say which stops they do have. An unrecognized stop name is " +
    "not a knowledge gap.",
  )

  return lines.join('\n')
}

// Wind/weather lines from the client seed (live Tomorrow.io flags computed on
// Home). Shared by the today route block + the client-seed fallback so weather
// reads identically regardless of which path built the rest of the block.
function weatherLines(ctx: AskContext): string[] {
  if (ctx.hasWeatherFlag && ctx.weatherStops?.length) {
    return [
      `Wind alert (20+ mph at arrival) at: ${ctx.weatherStops.join(', ')}. ` +
      `Advise extra staking/ballast on tents and canopies at those stops.`,
    ]
  }
  if (ctx.hasWeatherFlag) {
    return [`A wind alert (20+ mph) is flagged on one or more stops today.`]
  }
  return [`No wind alerts on today's stops.`]
}

// Block 1 fallback — today's route from the client-seeded context (volatile).
// Used ONLY when the server-side route load fails/returns nothing for today, so
// AVA still has the coarse client-seeded picture (stop count, COD, top-8
// manifest, weather) rather than nothing. The server load is preferred because
// it carries full, stop-type-aware item detail.
function buildRouteContextBlock(ctx: AskContext): string {
  const lines: string[] = ["── Today's route ──"]

  if (ctx.driverName) lines.push(`Driver: ${ctx.driverName}.`)
  lines.push(`Customer stops scheduled today: ${ctx.stopCount ?? 'unknown'}.`)
  if (ctx.codCount != null) {
    lines.push(
      ctx.codCount > 0
        ? `Cash-on-delivery (COD) stops: ${ctx.codCount} — collect payment on arrival.`
        : `No cash-on-delivery stops today.`
    )
  }
  if (ctx.manifestSummary) lines.push(`On the truck: ${ctx.manifestSummary}.`)

  lines.push(...weatherLines(ctx))

  if (ctx.dispatcherNotes?.length) {
    lines.push('Dispatch notes:')
    for (const n of ctx.dispatcherNotes) {
      const t = n.trim()
      if (t) lines.push(`- ${t}`)
    }
  }

  return lines.join('\n')
}

// ── Block 1 — the driver's route, loaded server-side ──────────────────────────
// Fetches the caller's route for `routeDate` (crew-scoped, service-role, same
// data shape + crew scope as /api/routes) and hands it to renderRouteContext,
// which owns the formatting (pure + smoke-tested — see lib/ava/routeContext.ts).
// Used for BOTH today and the Next Day Route Preview's upcoming date; the only
// difference is the heading and whether weather (client-seeded, today-only) gets
// appended by the caller.
//
// Why server-side for today too: the today client seed lumps delivery + pickup
// items into one top-8 manifest string, so direction was unknowable and low-qty
// items were dropped. Returns null on no-route / error → caller falls back to
// the client seed or the no-route copy.
//
// `scopeRouteId` is the route the driver is asking about, sent by the client and
// re-validated here against their own crew rows — it narrows the context, it is
// NEVER an authorization input. Null (a multi-route day asked from Home) renders
// every route the driver has, each numbered independently.
async function loadRouteDateContext(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  routeDate: string,
  isToday: boolean,
  scopeRouteId: string | null,
): Promise<string | null> {
  try {
    // Crew-scope: the caller's own driver rows on that date → route ids.
    const crewRes = await admin
      .from('route_crew')
      .select('route_id, routes!inner(route_date, route_number, dispatcher_notes)')
      .eq('user_id', userId)
      .in('role', ['primary_driver', 'secondary_driver'])
      .eq('routes.route_date', routeDate)
    if (crewRes.error) {
      console.warn('[/api/ava/ask] route crew lookup failed (non-fatal):', crewRes.error.message)
      return null
    }
    if (!crewRes.data?.length) return null

    type CrewRow = {
      route_id: string
      routes: { route_number: number | null; dispatcher_notes: string | null }
             | { route_number: number | null; dispatcher_notes: string | null }[]
    }
    const rows = (crewRes.data ?? []) as unknown as CrewRow[]
    const firstRel = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const crewRouteIds = Array.from(new Set(rows.map((r) => r.route_id).filter(Boolean)))
    if (crewRouteIds.length === 0) return null

    // Scope to the route the driver is asking about, but only after confirming
    // they're crewed on it — the client-supplied routeId is never trusted as an
    // authorization input. An unrecognized id falls back to every route the
    // driver has that day rather than erroring.
    const routeIds = (scopeRouteId && crewRouteIds.includes(scopeRouteId))
      ? [scopeRouteId]
      : crewRouteIds

    const routeNumberById = new Map<string, number | null>()
    for (const r of rows) routeNumberById.set(r.route_id, firstRel(r.routes)?.route_number ?? null)

    const stopsRes = await admin
      .from('dispatch_stops')
      .select(
        'route_id, route_position, stop_type, items, payment_state, ' +
        'customer_name, company_name, client_company, address, reservation_id, ' +
        'dispatcher_notes, completed_at, stop_status'
      )
      .in('route_id', routeIds)
      .eq('scheduled_date', routeDate)
      .order('route_position', { ascending: true })
    if (stopsRes.error) {
      console.warn('[/api/ava/ask] route stops lookup failed (non-fatal):', stopsRes.error.message)
      return null
    }

    // The select list is a concatenated string, so PostgREST can't infer the row
    // shape — cast through unknown, same as the crew query above.
    type StopRow = Omit<RouteStop, 'items'> & { items: unknown }
    const stops: RouteStop[] = ((stopsRes.data ?? []) as unknown as StopRow[]).map((s) => ({
      ...s,
      items: Array.isArray(s.items) ? (s.items as RawItem[]) : [],
    }))

    const routeDispatcherNotes = rows
      .filter((r) => routeIds.includes(r.route_id))
      .map((r) => firstRel(r.routes)?.dispatcher_notes)
      .filter((n): n is string => !!n)

    return renderRouteContext({ stops, routeNumberById, routeDispatcherNotes, routeDate, isToday })
  } catch (e) {
    console.warn('[/api/ava/ask] route-date context load failed (non-fatal):',
      e instanceof Error ? e.message : String(e))
    return null
  }
}

// Block 1 fallback when no route can be loaded at all (server load null AND the
// client seed is empty). Tells AVA to give the exact clocked-in copy and NOT to
// emit the UNKNOWN: gap signal (an unloaded route is a known state, not a
// knowledge gap that should be queued for review).
const NO_ROUTE_FALLBACK =
  "── The driver's route ──\n" +
  "No route is currently loaded for this driver. If the driver asks anything " +
  "about their route, stops, equipment, deliveries, or pickups, respond with " +
  "exactly: \"I don't have your route loaded yet. Make sure you're clocked in " +
  "and your route is active for today.\" Do NOT begin that response with " +
  "UNKNOWN: — an unloaded route is a known state, not a knowledge gap. " +
  "General how-to / SOP / terminology questions can still be answered normally."

// Role-scoped SOP load. Drivers get the driver-visible set (same filter as the
// Training Hub); elevated roles (super_admin) get every SOP. Reads roles
// server-side from the authenticated user — never a client-supplied flag —
// and defaults to the driver scope (least privilege) if the role lookup fails.
// SOPs are best-effort: a failure here logs and returns [] so AVA still answers
// route questions.
async function loadScopedSops(admin: ReturnType<typeof getAdminClient>, userId: string): Promise<SopRow[]> {
  let elevated = false
  try {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('roles')
      .eq('id', userId)
      .single()
    if (error) {
      console.warn('[/api/ava/ask] role lookup failed — defaulting to driver scope:', error.message)
    } else {
      elevated = isElevatedRole(profile?.roles as string[] | null)
    }
  } catch (e) {
    console.warn('[/api/ava/ask] role lookup threw — defaulting to driver scope:',
      e instanceof Error ? e.message : String(e))
  }

  try {
    const { data, error } = await admin
      .from('sop_entries')
      .select('sop_number, title, content, department')
      .order('sop_number', { ascending: true })
    if (error) {
      console.warn('[/api/ava/ask] SOP load failed (non-fatal):', error.message)
      return []
    }
    const all = (data ?? []) as SopRow[]
    return elevated ? all : all.filter(isDriverVisibleSop)
  } catch (e) {
    console.warn('[/api/ava/ask] SOP load threw (non-fatal):',
      e instanceof Error ? e.message : String(e))
    return []
  }
}

function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []
  const out: ChatTurn[] = []
  for (const item of raw) {
    if (item && typeof item === 'object'
      && (item as ChatTurn).role && typeof (item as ChatTurn).text === 'string') {
      const role = (item as ChatTurn).role
      const text = (item as ChatTurn).text.trim()
      if ((role === 'user' || role === 'ava') && text) out.push({ role, text })
    }
  }
  return out.slice(-MAX_HISTORY)
}

export async function POST(request: NextRequest) {
  // ── Auth: signed-in PTR employee only (no open LLM proxy) ──────────────────
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Config gate ────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AVA unavailable' }, { status: 503 })
  }

  // ── Parse + validate ─────────────────────────────────────────────────────────
  let body: AskBody
  try {
    body = (await request.json()) as AskBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) {
    return NextResponse.json({ error: 'question is required' }, { status: 400 })
  }

  const ctx     = (body.context && typeof body.context === 'object') ? body.context : {}
  const history = sanitizeHistory(body.history)
  const routeId = typeof body.routeId === 'string' && body.routeId ? body.routeId : null
  const stopId  = typeof body.stopId  === 'string' && body.stopId  ? body.stopId  : null
  // Resolve which route date to load server-side.
  // - localToday: the driver's local YYYY-MM-DD (client-sent), else Vercel UTC.
  // - routeDate (preview/next-shift): an EXPLICIT future date → upcoming route.
  // - targetDate: the date we actually load (future if previewing, else today).
  const serverToday = new Date().toISOString().slice(0, 10)
  const localToday  = typeof body.localDate === 'string' && DATE_RE.test(body.localDate)
    ? body.localDate
    : serverToday
  const routeDate = typeof body.routeDate === 'string' && DATE_RE.test(body.routeDate) && body.routeDate !== localToday
    ? body.routeDate
    : null
  const targetDate = routeDate ?? localToday
  const isToday    = routeDate === null

  // ── Knowledge load: SOPs (role-scoped) + global terminology + Q&A base ──────
  const admin = getAdminClient()

  // Global published terminology — best-effort (a failure just omits the block).
  const { data: vocabularyEntries } = await admin
    .from('ava_vocabulary')
    .select('term, definition, aliases, category')
    .eq('status', 'published')
    .order('term', { ascending: true })

  // Global published operational knowledge — best-effort.
  const { data: knowledgeEntries } = await admin
    .from('ava_knowledge')
    .select('question, answer, category')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(100)

  const sops = await loadScopedSops(admin, user.id)

  // Block 1 text — the driver's route, loaded server-side (stop-type aware) for
  // BOTH today and the preview's upcoming date. The server load carries full,
  // direction-split item detail (the fix). Degradation ladder:
  //   1. server load succeeds → use it (+ append driver/weather for today)
  //   2. today + server returns nothing but the client seeded context → use the
  //      coarse client seed (no regression vs the old behavior)
  //   3. nothing at all → the no-route fallback copy
  let routeContextText: string
  const serverBlock = await loadRouteDateContext(admin, user.id, targetDate, isToday, routeId)
  if (serverBlock) {
    const extra: string[] = []
    if (ctx.driverName) extra.push(`Driver: ${ctx.driverName}.`)
    // Weather flags are client-seeded (live Tomorrow.io) and today-only.
    if (isToday) extra.push(...weatherLines(ctx))
    routeContextText = extra.length ? `${serverBlock}\n${extra.join('\n')}` : serverBlock
  } else if (isToday && (ctx.stopCount != null || ctx.manifestSummary)) {
    routeContextText = buildRouteContextBlock(ctx)
  } else {
    routeContextText = NO_ROUTE_FALLBACK
  }

  // ── Build messages: prior turns + the new question ──────────────────────────
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t): Anthropic.MessageParam => ({
      role:    t.role === 'ava' ? 'assistant' : 'user',
      content: t.text,
    })),
    { role: 'user', content: question },
  ]

  // ── Call Haiku ───────────────────────────────────────────────────────────────
  let answer = ''
  try {
    const client   = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      // Block 0 (persona + SOP base) is stable per role → cache_control here,
      // shared across all driver conversations. Block 1 (today's route) is
      // volatile and sits after the breakpoint, so it's never cached.
      system: [
        {
          type: 'text',
          text: buildKnowledgeBlock(
            sops,
            (vocabularyEntries ?? []) as VocabRow[],
            (knowledgeEntries ?? []) as KnowledgeRow[],
          ),
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: routeContextText,
        },
      ],
      messages,
    })
    answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (e) {
    console.error('[/api/ava/ask] Anthropic call failed:',
      e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'AVA unavailable' }, { status: 503 })
  }

  if (!answer) {
    return NextResponse.json({ error: 'AVA unavailable' }, { status: 503 })
  }

  // ── Gap detection ───────────────────────────────────────────────────────────
  // UNKNOWN: prefix = the model couldn't answer from the knowledge base. Log the
  // gap (deduped) for the answer-queue and swap in the friendly copy so the
  // driver never sees the raw signal. Detection is case-sensitive, leading-edge.
  const isUnknown = answer.trimStart().startsWith('UNKNOWN:')

  if (isUnknown) {
    // Gap insert is fully best-effort — a failure here must never reach the client.
    try {
      const { data: existing } = await admin
        .from('ava_knowledge_gaps')
        .select('id')
        .eq('is_answered', false)
        .ilike('question', question)
        .limit(1)

      if (!existing || existing.length === 0) {
        await admin.from('ava_knowledge_gaps').insert({
          question,
          asked_by: user.id,
          surface:  'driver_home',
          context:  { route_id: routeId, stop_id: stopId },
        })
      }
    } catch (gapErr) {
      console.error('[/api/ava/ask] Gap log silent failure:', gapErr)
      // Never surfaces to client.
    }
  }

  // What the driver actually sees: the friendly copy on a gap, else the answer.
  const clientAnswer = isUnknown ? GAP_SILENT_COPY : answer

  // ── Log the exchange (audit trail; never blocks the response) ───────────────
  // Preserved in both paths. Gap turns log the friendly copy + review flags.
  try {
    const { error: logErr } = await admin.from('ava_conversations').insert({
      driver_id:    user.id,
      surface:      'driver_home',
      context_id:   routeId,
      question,
      answer:       clientAnswer,
      ...(isUnknown ? { confidence: 'unanswered', needs_review: true } : {}),
    })
    if (logErr) console.warn('[/api/ava/ask] conversation log failed:', logErr.message)
  } catch (e) {
    console.warn('[/api/ava/ask] conversation log threw:',
      e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json(
    { answer: clientAnswer },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
