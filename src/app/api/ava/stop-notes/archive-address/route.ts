// ─── POST /api/ava/stop-notes/archive-address ────────────────────────────────
// AVA Remembers Phase 2 — "Clear site notes". Archives every ACTIVE
// ava_stop_notes row for a given address_key (status -> 'archived').
//
// This is deliberately a server route, not a client RLS write: archiving notes
// authored by OTHER drivers is an elevated operation, so it runs through the
// service-role admin client (bypasses RLS + the column-guard trigger). The
// caller is still identified server-side and must be an authenticated app user.
//
// Body: { address_key: string }
// 401 when unauthenticated; 400 on a missing/blank address_key.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { address_key?: unknown } | null = null
  try { body = await request.json() } catch { body = null }
  const addressKey = typeof body?.address_key === 'string' ? body.address_key.trim() : ''
  if (!addressKey) {
    return NextResponse.json({ error: 'address_key is required' }, { status: 400 })
  }

  const admin = getAdminClient()
  const { data, error } = await admin
    .from('ava_stop_notes')
    .update({ status: 'archived' })
    .eq('address_key', addressKey)
    .eq('status', 'active')
    .select('id')

  if (error) {
    console.error('[archive-address] update failed:', error.message)
    return NextResponse.json({ error: 'Archive failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, archived: data?.length ?? 0 })
}
