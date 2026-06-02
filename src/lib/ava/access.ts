// ─── AVA access scoping — the foundational rule ──────────────────────────────
// Every AVA knowledge layer is scoped to the caller's role. Drivers see only
// their own data (their assigned route's stops, driver-visible SOPs); elevated
// roles see everything (all routes, all SOPs). This is the primitive every
// future layer (drawings, equipment refs, …) reuses — derive the role
// server-side from the authenticated user, never trust a client-supplied flag.
//
// "Elevated" = super_admin (the only elevated role currently provisioned —
// there is no plain `admin` role in profiles.roles). `admin` is accepted
// defensively so a future rename doesn't silently drop access.

const ELEVATED_ROLES: ReadonlySet<string> = new Set(['super_admin', 'admin'])

export function isElevatedRole(roles: readonly string[] | null | undefined): boolean {
  return !!roles && roles.some((r) => ELEVATED_ROLES.has(r))
}
