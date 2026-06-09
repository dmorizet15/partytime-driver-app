// ─── Phase 2B — Route Handoff ownership ──────────────────────────────────────
// Single source of truth for "who holds the ownership actions (SMS, ETA,
// completion) on this route right now." Replaces the raw `is_primary` checks
// that Phase 2A scattered across StopDetail / Home.
//
// State machine (dashboard migration 093 columns on `routes`):
//   Idle        active_driver_id NULL,    transfer_pending_to NULL
//   Pending     active_driver_id NULL,    transfer_pending_to set   ← offer out
//   Transferred active_driver_id set,      transfer_pending_to NULL
//   Declined    → back to Idle (both NULL)
//
// `profileId` is the signed-in user's profiles.id (= auth uid = route_crew.user_id;
// all three are the same value in this DB).

import type { Route } from '@/types'

/**
 * True when `profileId` currently owns the route's SMS / ETA / completion gates.
 *  - active_driver_id NULL/undefined → fall back to the existing is_primary gate.
 *    is_primary === false → not the owner; undefined (the /api/routes soft-fail,
 *    where no crew row resolved) → treated as owner so a transient crew-read miss
 *    never locks a real primary driver out.
 *  - active_driver_id set → ONLY that exact profile owns the route.
 */
export function isActiveDriver(
  route: Route | null | undefined,
  profileId: string | null | undefined,
): boolean {
  if (!route) return false
  if (!route.active_driver_id) {
    return route.is_primary !== false
  }
  return !!profileId && route.active_driver_id === profileId
}

/**
 * True when a transfer is active AND it handed the route to someone other than
 * `profileId` — i.e. the original primary who has just lost ownership. Drives
 * the "Transferred to [Name]" locked state.
 */
export function isTransferredAway(
  route: Route | null | undefined,
  profileId: string | null | undefined,
): boolean {
  return !!route?.active_driver_id && route.active_driver_id !== profileId
}

/**
 * True when a transfer offer is pending FOR `profileId` — drives the Home
 * "[Name] is offering you Route [N]" accept/decline card.
 */
export function isTransferPendingForMe(
  route: Route | null | undefined,
  profileId: string | null | undefined,
): boolean {
  return !!route?.transfer_pending_to && !!profileId && route.transfer_pending_to === profileId
}

/** Resolve a crew member's display name from a profile id, for transfer copy. */
export function crewMemberName(
  route: Route | null | undefined,
  profileId: string | null | undefined,
): string | null {
  if (!route?.crew || !profileId) return null
  return route.crew.find((c) => c.profileId === profileId)?.name ?? null
}
