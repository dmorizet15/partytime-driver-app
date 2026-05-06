// ─── /api/assigned-route ─────────────────────────────────────────────────────
// On login the driver app calls this to skip manual route selection when a
// dispatcher has already assigned the current driver a route for today.
//
// Auth-gated via Supabase session cookie (same pattern as /api/cash-collections,
// not the service-role key). RLS on route_assignments + routes allows any
// authenticated user to SELECT, but the query filters by user_id = auth.uid()
// so a driver only ever sees their own assignment.
//
//   GET → { assigned: true, route_id: <uuid>, route_date: <YYYY-MM-DD> }
//      or { assigned: false }
//   401 if not authenticated, 500 on DB error.
//
// Date logic: PartyTime ops are in Hudson Valley, NY (Eastern time). "Today"
// is Eastern-zone today, computed server-side via toLocaleDateString. This is
// independent of the driver's phone clock (per spec) and timezone-honest for
// the business — Postgres CURRENT_DATE alone would flip on UTC midnight, not
// ET midnight.

import { NextResponse }       from 'next/server'
import { cookies }             from 'next/headers'
import { createServerClient }  from '@supabase/ssr'

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
            // to ignore for this read-only check.
          }
        },
      },
    }
  )
}

// en-CA produces ISO YYYY-MM-DD format; combined with the IANA zone this
// gives us Eastern-local "today" as a clean date string ready for the query.
function easternTodayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export async function GET() {
  const supabase = getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ assigned: false, error: 'Unauthorized' }, { status: 401 })
  }

  const today = easternTodayISO()

  // Inner-join routes filtered by today's date — Migrations 022 + 024 guarantee
  // at most one row per (driver, date), so maybeSingle is correct.
  const { data, error } = await supabase
    .from('route_assignments')
    .select('route_id, routes!inner(id, route_date)')
    .eq('role',              'driver')
    .eq('user_id',           user.id)
    .eq('routes.route_date', today)
    .maybeSingle()

  if (error) {
    console.error('[/api/assigned-route] query failed:', error.message)
    return NextResponse.json({ assigned: false, error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ assigned: false })
  }

  // The embedded `routes` resource is a single object (many-to-one FK), but
  // supabase-js types it conservatively — narrow with an explicit cast.
  const route = data.routes as unknown as { id: string; route_date: string }
  return NextResponse.json({
    assigned:   true,
    route_id:   data.route_id,
    route_date: route.route_date,
  })
}
