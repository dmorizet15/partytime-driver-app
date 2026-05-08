import { supabase } from './supabase'
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
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,display_name&limit=1`,
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

// Session-scoped flag for the home-page auto-redirect to today's assigned
// route. Fires once per browser session so the Home tab in BottomNav stays
// reachable on subsequent visits. Reset on signOut so re-login retriggers it.
let _hasAutoCheckedAssignmentThisSession = false
export function hasAutoCheckedAssignmentThisSession() {
  return _hasAutoCheckedAssignmentThisSession
}
export function markAutoAssignmentChecked() {
  _hasAutoCheckedAssignmentThisSession = true
}

export async function signOut() {
  _hasAutoCheckedAssignmentThisSession = false
  return supabase.auth.signOut()
}
