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
}
