import { supabase } from './supabase'
import { clearCachedUser } from './authCache'
import type { UserProfile } from '../types/auth'

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Uses direct fetch with the caller-supplied access token to avoid calling
// supabase.auth.getSession() internally, which deadlocks when called from
// inside the onAuthStateChange INITIAL_SESSION handler.
export async function getUserRole(userId: string, accessToken: string): Promise<UserProfile | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,roles,display_name,fleet_maintenance_access,work_order_technician,checklist_enabled,personality_preference,stats_enabled,auto_send_eta&limit=1`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      }
    )
    if (!res.ok) {
      console.error('[getUserRole] HTTP error:', res.status, '| userId:', userId)
      return null
    }
    const rows: UserProfile[] = await res.json()
    if (!rows.length) {
      console.error('[getUserRole] No profile row for userId:', userId)
      return null
    }
    return rows[0]
  } catch (err) {
    console.error('[getUserRole] fetch error:', err)
    return null
  }
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  // Drop the offline identity cache so a shared device can't restore a
  // signed-out driver on the next offline cold-start. Central clear — covers
  // every caller of this wrapper (StopDetailScreen warehouse_return,
  // ProfileScreen manual logout, and any future caller). The two DIRECT
  // supabase.auth.signOut() sites (AuthContext day-change, AppStateContext 401)
  // clear explicitly at their call sites since they bypass this wrapper.
  clearCachedUser()
  return supabase.auth.signOut()
}
