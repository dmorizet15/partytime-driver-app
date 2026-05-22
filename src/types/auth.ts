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
}
