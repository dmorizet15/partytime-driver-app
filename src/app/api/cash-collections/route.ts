// ─── /api/cash-collections ───────────────────────────────────────────────────
// Driver-app cash-on-delivery acknowledgments.
// Auth-gated via the Supabase session cookie — every insert/select runs under
// the driver's identity so RLS (driver_id = auth.uid()) does the gate.
//
//   POST  body { stop_id, status, amount_collected?, not_collected_reason? }
//         status='collected'     → amount_collected required (>= 0)
//         status='not_collected' → not_collected_reason required (non-empty)
//         → { success: true, id }
//   GET   ?stop_id=...
//         → { exists, collection | null }

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'

function getSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Route-handler context where cookie writes aren't allowed — safe
            // to ignore; the auth check itself still works.
          }
        },
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body       = await request.json().catch(() => null)
    const stopId     = body?.stop_id
    const statusRaw  = body?.status
    const amountRaw  = body?.amount_collected
    const reasonRaw  = body?.not_collected_reason

    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid stop_id' },
        { status: 400 }
      )
    }

    // Back-compat: legacy callers POSTed without status — those were always
    // the "collected" path. Default to 'collected' if absent.
    const status: 'collected' | 'not_collected' =
      statusRaw === 'not_collected' ? 'not_collected' : 'collected'

    let amount: number | null = null
    if (amountRaw !== null && amountRaw !== undefined && amountRaw !== '') {
      const n = Number(amountRaw)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid amount_collected' },
          { status: 400 }
        )
      }
      amount = n
    }

    let reason: string | null = null
    if (typeof reasonRaw === 'string') {
      const trimmed = reasonRaw.trim()
      if (trimmed.length > 0) reason = trimmed
    }

    if (status === 'not_collected' && !reason) {
      return NextResponse.json(
        { success: false, error: 'A reason is required when cash was not collected.' },
        { status: 400 }
      )
    }

    // For the collected path the DB CHECK constraint enforces reason=NULL.
    // Defensively null it here so a stray reason from a buggy client doesn't
    // trip the constraint.
    if (status === 'collected') reason = null

    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Backward-compat: the 'collected' path omits `status` and
    // `not_collected_reason` from the INSERT so it works against the legacy
    // schema (pre-migration-051) AND the new schema (where status defaults
    // to 'collected' and the CHECK constraint is satisfied by a NULL reason).
    // The 'not_collected' path includes both fields and REQUIRES migration
    // 051 to have been applied — by definition the new flow doesn't exist
    // pre-migration anyway.
    const insertRow: Record<string, unknown> = {
      stop_id:          stopId,
      driver_id:        user.id,
      amount_collected: amount,
    }
    if (status === 'not_collected') {
      insertRow.status               = 'not_collected'
      insertRow.not_collected_reason = reason
    }

    // The generated supabase-js types may not yet include the new columns
    // until `supabase gen types` reruns post-migration. Loosen the insert
    // typing locally so the conditional column set compiles either way.
    const { data, error } = await (supabase.from('cash_collections') as unknown as {
      insert: (row: Record<string, unknown>) => { select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> } }
    }).insert(insertRow).select('id').single()

    if (error || !data) {
      const msg = error?.message ?? 'Insert returned no row'
      console.error('[/api/cash-collections] insert failed:', msg)
      return NextResponse.json({ success: false, error: msg }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (err) {
    console.error('[/api/cash-collections POST] unhandled:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 400 }
    )
  }
}

export async function GET(request: NextRequest) {
  const stopId = request.nextUrl.searchParams.get('stop_id')
  if (!stopId) {
    return NextResponse.json(
      { exists: false, error: 'Missing stop_id' },
      { status: 400 }
    )
  }

  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ exists: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Select legacy columns only — keeps this endpoint working pre-migration-051.
  // The driver app only consumes `exists` from this response.
  const { data, error } = await supabase
    .from('cash_collections')
    .select('id, amount_collected, collected_at')
    .eq('stop_id',   stopId)
    .eq('driver_id', user.id)
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[/api/cash-collections] select failed:', error.message)
    return NextResponse.json({ exists: false, error: error.message }, { status: 400 })
  }

  return NextResponse.json({ exists: !!data, collection: data ?? null })
}
