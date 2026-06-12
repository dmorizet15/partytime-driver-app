// ─── GET /api/will-call ──────────────────────────────────────────────────────
// Will Call orders for the warehouse-counter surface (Phase 1, read-only).
//
// Auth: session cookie identifies the caller; server-side role gate on
// profiles.roles — will_call | warehouse | scheduler | super_admin (the same
// set the dashboard's /api/willcall/[id]/* action routes enforce, so anyone
// who can act on an order can also see the list). The role is `will_call` —
// `will_call_board` is only a realtime channel name dashboard-side.
//
// Reads run through the service-role client (no RLS policy change on
// will_call_orders — the table is dashboard-owned). No realtime subscription
// driver-side by design: postgres_changes events would be silently dropped
// under RLS for will_call-only holders; the screen refetches on focus + a
// 30s interval instead.
//
// Result set: every non-returned order, plus orders returned in the last
// 7 days so the list's "Complete" section has recent history without growing
// unbounded.

import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'

const ALLOWED_ROLES = new Set(['will_call', 'warehouse', 'scheduler', 'super_admin'])

const SELECT_FIELDS = [
  'id',
  'customer_name',
  'company_name',
  'customer_cell',
  'customer_email',
  'customer_phone',
  'items',
  'expected_pickup_date',
  'checkout_window_start',
  'checkout_window_end',
  'checkin_window_start',
  'checkin_window_end',
  'return_reminder_date',
  'payment_state',
  'status',
  'staged_location',
  'staged_at',
  'picked_up_at',
  'returned_at',
  'return_notes',
  'has_discrepancy',
  'overdue_reminder_count',
  'needs_manual_followup',
].join(', ')

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
          } catch {
            // Route-handler context — cookie writes silently no-op.
          }
        },
      },
    }
  )
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[/api/will-call] Missing env — SUPABASE_URL:', !!supabaseUrl, '| SUPABASE_SERVICE_KEY:', !!supabaseKey)
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const { data: { user } } = await getSessionClient().auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('roles')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }
  const roles = (profile.roles ?? []) as string[]
  if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
    return NextResponse.json({ error: 'Forbidden — Will Call access only' }, { status: 403 })
  }

  // Returned orders age out of the list after 7 days.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('will_call_orders')
    .select(SELECT_FIELDS)
    .or(`status.neq.returned,returned_at.gte.${cutoff}`)
    .order('expected_pickup_date', { ascending: true, nullsFirst: false })
  if (error) {
    console.error('[/api/will-call] read failed:', error.message)
    return NextResponse.json({ error: 'Failed to load Will Call orders' }, { status: 500 })
  }

  return NextResponse.json({ orders: data ?? [] })
}
