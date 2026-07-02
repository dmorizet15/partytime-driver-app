// ─── Equipment Return Tracking — final-pickup discrepancy email ──────────────
// Server-only (imported by the equipment-returns API route). Mirrors the
// stop_item_checkoffs discrepancy-email pattern (Resend → dispatch, dedupe
// stamp) rather than inventing new infrastructure — but that sender lives in
// the DASHBOARD repo, so this is a minimal Resend HTTP call (no SDK dep) with
// the same posture: best-effort, never throws, INERT with a loud log until
// RESEND_API_KEY is set in this app's Vercel env (the /api/sop/sync
// NOTION_API_KEY precedent).
//
// Fires ONLY from the final-pickup path — a nonzero reservation balance after
// the LAST pickup completes. Never from an intermediate pickup (a partial
// retrieval partway through a multi-stop job is normal, not a problem).

import type { EquipmentBalance, LedgerTraceLine } from './ledger'
import { ruleForKey } from './rules'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_TO   = 'dispatch@partytimerentals.com'
const DEFAULT_FROM = 'PTR Driver App <alerts@partytimerentals.com>'

export interface EquipmentAlertInput {
  reservationId: string
  customerName: string | null
  address: string | null
  finalPickupDate: string | null
  discrepancies: EquipmentBalance[]   // nonzero balances only
  trace: LedgerTraceLine[]            // per-stop contributions, all keys
}

function keyLabel(key: string, count = 2): string {
  const rule = ruleForKey(key)
  if (!rule) return key.replace(/_/g, ' ')
  return count === 1 ? rule.noun.one : rule.noun.many
}

export function buildAlertEmail(input: EquipmentAlertInput): { subject: string; text: string; html: string } {
  const who = input.customerName?.trim() || 'Unknown customer'
  const shortfalls = input.discrepancies.filter((d) => d.balance > 0)
  const overs      = input.discrepancies.filter((d) => d.balance < 0)

  const subject = `Equipment return discrepancy — ${who}${
    shortfalls.length ? ` — ${shortfalls.map((d) => `${d.balance} ${keyLabel(d.equipment_key, d.balance)}`).join(', ')} unaccounted` : ''
  }`

  const lines: string[] = []
  lines.push(`Equipment return discrepancy — final pickup completed`)
  lines.push('')
  lines.push(`Customer: ${who}`)
  if (input.address) lines.push(`Address: ${input.address}`)
  if (input.finalPickupDate) lines.push(`Final pickup date: ${input.finalPickupDate}`)
  lines.push(`Reservation: ${input.reservationId}`)
  lines.push('')
  for (const d of input.discrepancies) {
    const label = keyLabel(d.equipment_key)
    const net = d.balance > 0
      ? `${d.balance} unaccounted for (shortfall)`
      : `${-d.balance} over-reported (more retrieved than logged as delivered)`
    lines.push(`${label.toUpperCase()}: delivered ${d.delivered}, retrieved ${d.retrieved} → ${net}`)
    for (const t of input.trace.filter((t) => t.equipment_key === d.equipment_key)) {
      lines.push(`  · ${t.stop_type === 'delivery' ? 'Left at delivery' : 'Retrieved at pickup'} ${t.scheduled_date ?? '(no date)'}: ${t.quantity} (stop ${t.stop_id})`)
    }
    lines.push('')
  }
  if (overs.length === 0 && shortfalls.length > 0) {
    lines.push('Crews logged less retrieved than delivered — equipment may still be on-site or lost in transit.')
  }
  const text = lines.join('\n')

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<pre style="font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 1.5;">${esc(text)}</pre>`

  return { subject, text, html }
}

// Sends via Resend. Returns true only when Resend accepted the send —
// callers use this to decide whether the alert dedupe row should stand
// (email out) or be released for a later retry.
export async function sendEquipmentAlertEmail(input: EquipmentAlertInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error(
      '[equipment-returns] RESEND_API_KEY not set — discrepancy alert NOT emailed.',
      'Reservation:', input.reservationId,
      'Discrepancies:', JSON.stringify(input.discrepancies)
    )
    return false
  }
  const to   = process.env.EQUIPMENT_ALERT_EMAIL_TO?.trim() || DEFAULT_TO
  const from = process.env.EQUIPMENT_ALERT_EMAIL_FROM?.trim() || DEFAULT_FROM
  const { subject, text, html } = buildAlertEmail(input)

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[equipment-returns] alert email send failed:', res.status, body)
      return false
    }
    return true
  } catch (err) {
    console.error('[equipment-returns] alert email network failure:', err)
    return false
  }
}
