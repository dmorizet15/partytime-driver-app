import { supabase } from '@/lib/supabase'
import type {
  CreateWorkOrderPayload,
  UpdateWorkOrderPayload,
  FieldWorkOrder,
} from './types'

// Cross-app POST/PATCH/GET → partytime-dashboard /api/work-orders.
//
// The driver app does NOT insert field_work_orders directly through the
// supabase client. The dashboard route owns:
//   1. work_order_number generation (sequential "PT-####" or similar)
//   2. The assignee + super_admin notification email
// So if we shortcut to supabase the email never fires.

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

export interface CreateWorkOrderResult {
  id:                 string
  work_order_number:  string
}

export async function createWorkOrder(payload: CreateWorkOrderPayload): Promise<CreateWorkOrderResult> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/work-orders`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Failed to create work order (HTTP ${res.status}).`
    throw new Error(msg)
  }
  // Accept either {id, work_order_number} flat or {work_order: {id, work_order_number}} nested.
  const flat = json
  if (isObj(flat) && typeof flat.id === 'string' && typeof flat.work_order_number === 'string') {
    return { id: flat.id, work_order_number: flat.work_order_number }
  }
  if (isObj(flat) && isObj(flat.work_order)
      && typeof flat.work_order.id === 'string'
      && typeof flat.work_order.work_order_number === 'string') {
    return {
      id: flat.work_order.id,
      work_order_number: flat.work_order.work_order_number,
    }
  }
  throw new Error('Dashboard returned an unexpected shape — could not read work order ID.')
}

export async function updateWorkOrder(id: string, payload: UpdateWorkOrderPayload): Promise<void> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/work-orders/${id}`, {
    method:  'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null)
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Failed to update work order (HTTP ${res.status}).`
    throw new Error(msg)
  }
}

// Driver-app reads pull straight from supabase under RLS — no need to round-trip
// the dashboard for read-only data. The dashboard's POST handles the email side
// effect; reads have no side effects.

export async function listMyWorkOrders(): Promise<FieldWorkOrder[]> {
  const { data, error } = await supabase
    .from('field_work_orders')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function getWorkOrder(id: string): Promise<FieldWorkOrder | null> {
  const { data, error } = await supabase
    .from('field_work_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? null
}

// Technician picker — work_order_technician=true OR a super_admin role.
// RLS on profiles is relaxed for these fields (display_name + role flags
// are readable by any authed user) by design — the dashboard route does
// the same lookup server-side. If RLS later tightens, the dashboard can
// expose a /api/work-orders/technicians endpoint and we'll swap to that.
export interface TechnicianRow {
  id:           string
  display_name: string | null
}

export async function listTechnicians(): Promise<TechnicianRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, roles, work_order_technician')
    .or('work_order_technician.eq.true,roles.cs.{super_admin}')
    .order('display_name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ id: r.id, display_name: r.display_name }))
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
