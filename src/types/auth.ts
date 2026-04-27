export type Role =
  | 'super_admin'
  | 'scheduler'
  | 'warehouse'
  | 'driver'
  | 'read_only'
  | 'display'

export interface UserProfile {
  id: string
  role: Role
  display_name: string | null
}
