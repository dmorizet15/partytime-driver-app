// ─── /api/cash-collections ───────────────────────────────────────────────────
// Driver-app cash-on-delivery acknowledgments.
// Auth-gated via the Supabase session cookie — every insert/select runs under
// the driver's identity so RLS (driver_id = auth.uid()) does the gate.
//
//   POST  body { stop_id, amount_collected }   → { success: true, id }
//   GET   ?stop_id=...                          → { exists, collection | null }

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
    const amountRaw  = body?.amount_collected

    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid stop_id' },
        { status: 400 }
      )
    }

    let amount: number | null = null
    if (amountRaw !== null && amountRaw !== undefined) {
      const n = Number(amountRaw)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid amount_collected' },
          { status: 400 }
        )
      }
      amount = n
    }

    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('cash_collections')
      .insert({
        stop_id:          stopId,
        driver_id:        user.id,
        amount_collected: amount,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[/api/cash-collections] insert failed:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
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

  const { data, error } = await supabase
    .from('cash_collections')
    .select('id, amount_collected, collected_at')
    .eq('stop_id',   stopId)
    .eq('driver_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[/api/cash-collections] select failed:', error.message)
    return NextResponse.json({ exists: false, error: error.message }, { status: 400 })
  }

  return NextResponse.json({ exists: !!data, collection: data ?? null })
}
