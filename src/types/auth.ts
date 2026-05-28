export type Role =
  | 'super_admin'
  | 'scheduler'
  | 'warehouse'
  | 'driver'
  | 'read_only'
  | 'display'
  | 'maintenance_manager'
  | 'will_call'
  | 'tools_only'

export interface UserProfile {
  id: string
  roles: Role[]
  display_name: string | null
  /** Stacked, additive permission — independent of `roles`. Gates the
   *  Fleet Maintenance module (Tools Hub card + /tools/fleet screens). */
  fleet_maintenance_access: boolean
  /** Stacked, additive permission — independent of `roles`. Gates the
   *  Work Orders technician surface (Tools Hub card + /tools/work-orders
   *  list/detail). Drivers without this flag can still create work orders
   *  via the "Report an issue" link on the stop detail screen and the
   *  ungated "Report an Issue" Tools Hub card — but they can't see the
   *  technician queue or transition status. */
  work_order_technician: boolean
  /** AVA per-driver preferences (Phase 1 — Session 1 schema). Drive the
   *  conditional Tier 2 morning brief card on Home. Defaults from migration
   *  013: checklist on, direct tone, stats off. */
  checklist_enabled: boolean
  personality_preference: 'direct' | 'personality'
  stats_enabled: boolean
}
