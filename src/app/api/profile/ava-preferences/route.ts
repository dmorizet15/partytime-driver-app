// ─── PATCH /api/profile/ava-preferences ──────────────────────────────────────
// Driver-self-service write for the three AVA preference columns on profiles:
//   checklist_enabled (bool), personality_preference ('direct'|'personality'),
//   stats_enabled (bool).
//
// Why a server route instead of a direct supabase client UPDATE: the profiles
// table has RLS enabled with SELECT-only policies (no UPDATE policy), so a
// client write would silently affect 0 rows. Adding a broad `auth.uid() = id`
// UPDATE policy would let a driver mutate ANY column on their own row —
// including roles / fleet_maintenance_access / work_order_technician — a
// privilege-escalation hole. Instead the session client identifies the caller
// (id can't be spoofed) and the admin client performs an UPDATE scoped to the
// three known columns only. Same session+admin pattern as /api/inspection/*.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

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

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type AvaPatch = {
  checklist_enabled?:      boolean
  personality_preference?: 'direct' | 'personality'
  stats_enabled?:          boolean
}

export async function PATCH(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 })
  }
  const input = body as Record<string, unknown>

  // Build a patch from ONLY the three allowed columns, validating each.
  const patch: AvaPatch = {}

  if ('checklist_enabled' in input) {
    if (typeof input.checklist_enabled !== 'boolean') {
      return NextResponse.json({ error: 'checklist_enabled must be a boolean' }, { status: 400 })
    }
    patch.checklist_enabled = input.checklist_enabled
  }
  if ('personality_preference' in input) {
    if (input.personality_preference !== 'direct' && input.personality_preference !== 'personality') {
      return NextResponse.json({ error: "personality_preference must be 'direct' or 'personality'" }, { status: 400 })
    }
    patch.personality_preference = input.personality_preference
  }
  if ('stats_enabled' in input) {
    if (typeof input.stats_enabled !== 'boolean') {
      return NextResponse.json({ error: 'stats_enabled must be a boolean' }, { status: 400 })
    }
    patch.stats_enabled = input.stats_enabled
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid preference fields provided' }, { status: 400 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
  const { error } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', user.id)

  if (error) {
    console.error('[/api/profile/ava-preferences] update failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
