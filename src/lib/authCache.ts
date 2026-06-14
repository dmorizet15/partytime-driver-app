// ─── Offline profile cache (PWA Session B — P0 offline-auth fix) ────────────
// Mirrors the last successful getUserRole() result to localStorage so an
// offline cold-start can restore the driver's roles/flags WITHOUT a network
// call. Restoring the supabase session alone yields `user` but `roles = null`
// (getUserRole is a network fetch) → page.tsx would render "Access denied".
// Keyed per-user so a shared device can't hand one driver another's roles.
//
// Not sensitive: roles/flags are already client-readable for the signed-in
// user. Every read/write is wrapped in try/catch — a miss or corrupt blob
// returns null and the caller falls through to its normal path.

import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../types/auth'

const profileKey = (userId: string) => `ptd_profile_${userId}`

// FIXED key (not user-ID-keyed): the last successfully-authed Supabase user.
// Mirrors `user` to localStorage so an OFFLINE cold-start can restore identity
// WITHOUT a network call — even when the access token has expired (an expired
// token can't be refreshed offline, so getSession() can't help). Paired with
// the per-user profile cache to supply roles. Written ONLY on a successful
// online setUser(); cleared on EVERY signOut so a shared device can't restore
// a signed-out driver. Not sensitive (the signed-in user's own identity).
const AUTH_USER_KEY = 'ptd_auth_user'

export function writeCachedUser(user: User): void {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  } catch {
    // Quota / serialization failure — non-fatal; offline restore just won't
    // have a cached identity next cold-start.
  }
}

export function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as User
    if (!parsed || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function clearCachedUser(): void {
  try {
    localStorage.removeItem(AUTH_USER_KEY)
  } catch {
    // Non-fatal — a lingering key is superseded on the next online auth event.
  }
}

export function writeCachedProfile(userId: string, profile: UserProfile): void {
  try {
    localStorage.setItem(profileKey(userId), JSON.stringify(profile))
  } catch {
    // Quota / serialization failure — non-fatal; offline restore just won't
    // have a cached profile next cold-start.
  }
}

export function readCachedProfile(userId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(profileKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as UserProfile
    if (!parsed || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}
