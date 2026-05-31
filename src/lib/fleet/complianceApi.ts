import { supabase } from '@/lib/supabase'
import type { ComplianceField } from '@/lib/fleet/types'

// Cross-app POST → partytime-dashboard /api/fleet/trucks/[truckId]/compliance-expiry.
//
// The log-service compliance write (migration 083). The dashboard route owns
// the trucks.<expiry> write via its service-role client; the driver app cannot
// (and must not) hold that key, so it posts here with the user's Supabase
// bearer. fleet_maintenance_access is enforced server-side. Same cross-app
// pattern as src/lib/workOrders/api.ts.

function dashboardOrigin(): string {
  const v = process.env.NEXT_PUBLIC_DASHBOARD_URL
  if (!v) {
    throw new Error(
      'NEXT_PUBLIC_DASHBOARD_URL is not configured. Add it to .env.local ' +
      'and to the driver-app Vercel env vars.'
    )
  }
  return v.replace(/\/$/, '')
}

async function bearer(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not signed in.')
  return token
}

export async function postComplianceExpiry(
  truckId: string,
  field: ComplianceField,
  value: string,
): Promise<void> {
  const token = await bearer()
  const res = await fetch(
    `${dashboardOrigin()}/api/fleet/trucks/${truckId}/compliance-expiry`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ field, value }),
    },
  )
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(j?.error ?? `Compliance update failed (HTTP ${res.status}).`)
  }
}
