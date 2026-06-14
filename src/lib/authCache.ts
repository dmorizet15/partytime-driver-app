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

import type { UserProfile } from '../types/auth'

const profileKey = (userId: string) => `ptd_profile_${userId}`

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
