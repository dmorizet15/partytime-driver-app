// ─── POST /api/ava/ask ───────────────────────────────────────────────────────
// AVA Phase 2 — Session 2. Real Haiku-backed conversation behind the home-screen
// "Ask Ava about today" button (and, later, the AvaChip drawer).
//
// Context model (a deliberate deviation from the Phase 2 spec's "read context
// from Supabase here"): the Home screen has ALREADY computed today's route
// context — stop count, COD count, dispatcher notes, manifest, and the weather
// flags from POST /api/ava/route-weather (live Tomorrow.io calls). Re-deriving
// that here would re-run the external weather fan-out per question. So the client
// PRE-SEEDS the context (per tasks/todo.md's step plan) and we build the system
// prompt from it. The route still derives the driver identity + logs the row
// authoritatively server-side (driver_id = auth.uid(), never client-trusted).
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODEL       = 'claude-haiku-4-5-20251001'
const MAX_TOKENS  = 500   // answers are short — they get read aloud via ElevenLabs
const MAX_HISTORY = 12    // trim long sessions; this is single-day Q&A, not a thread

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

// ─── System prompt: two blocks, split for caching ────────────────────────────
// Render order is system[0] → system[1]. Block 0 (persona + style + the SOP
// knowledge base) is STABLE per role — identical across every driver and every
// turn — so it carries the cache_control breakpoint and is shared across all
// driver conversations (the SOP base alone clears Haiku's 4096-token cache
// minimum). Block 1 (today's route) is VOLATILE — it differs per conversation
// from the client seed — so it sits after the breakpoint and is never cached.
// Keeping driverName + route data out of block 0 is what lets the cache prefix
// be shared rather than per-driver.

// Block 0 — persona, voice rules, and the role-scoped SOP knowledge base.
function buildKnowledgeBlock(sops: SopRow[]): string {
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

  return lines.join('\n')
}

// Block 1 — today's route, built from the client-seeded context (volatile).
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

  if (ctx.hasWeatherFlag && ctx.weatherStops?.length) {
    lines.push(
      `Wind alert (20+ mph at arrival) at: ${ctx.weatherStops.join(', ')}. ` +
      `Advise extra staking/ballast on tents and canopies at those stops.`
    )
  } else if (ctx.hasWeatherFlag) {
    lines.push(`A wind alert (20+ mph) is flagged on one or more stops today.`)
  } else {
    lines.push(`No wind alerts on today's stops.`)
  }

  if (ctx.dispatcherNotes?.length) {
    lines.push('Dispatch notes:')
    for (const n of ctx.dispatcherNotes) {
      const t = n.trim()
      if (t) lines.push(`- ${t}`)
    }
  }

  return lines.join('\n')
}

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

  // ── Role-scoped knowledge load (SOPs) ───────────────────────────────────────
  const admin = getAdminClient()
  const sops  = await loadScopedSops(admin, user.id)

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
          text: buildKnowledgeBlock(sops),
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: buildRouteContextBlock(ctx),
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

  // ── Log the exchange (audit trail; never blocks the response) ───────────────
  try {
    const { error: logErr } = await admin.from('ava_conversations').insert({
      driver_id:  user.id,
      surface:    'driver_home',
      context_id: routeId,
      question,
      answer,
    })
    if (logErr) console.warn('[/api/ava/ask] conversation log failed:', logErr.message)
  } catch (e) {
    console.warn('[/api/ava/ask] conversation log threw:',
      e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json(
    { answer },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
