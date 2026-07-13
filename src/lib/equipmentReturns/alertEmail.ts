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

// Domain is HYPHENATED partytime-rentals.com — that's the Resend-verified
// domain (confirmed live 2026-07-02: un-hyphenated partytimerentals.com is
// rejected 403 "not authorized to send"; alerts@partytime-rentals.com sends).
// dispatch@partytime-rentals.com is the real dispatch inbox (matches the
// dashboard's delivery-confirmation sender).
const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_TO   = 'dispatch@partytime-rentals.com'
const DEFAULT_FROM = 'PTR Driver App <alerts@partytime-rentals.com>'

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

// A shortfall the crew never answered (no pickup row at all for the key) is
// NOT evidence the equipment was left behind — it means the prompt went
// unanswered. Saying "left on site" in that case sends dispatch chasing
// equipment that is already back on the truck (live false alarm 2026-07-13).
// A crew that answers "we got none" writes a quantity-0 row and still lands in
// the shortfall bucket below — that one IS a real report.
function isUnconfirmed(d: EquipmentBalance): boolean {
  return d.balance > 0 && d.pickup_rows === 0
}

export function buildAlertEmail(input: EquipmentAlertInput): { subject: string; text: string; html: string } {
  const who = input.customerName?.trim() || 'Unknown customer'
  const shortfalls  = input.discrepancies.filter((d) => d.balance > 0 && !isUnconfirmed(d))
  const unconfirmed = input.discrepancies.filter(isUnconfirmed)
  const overs       = input.discrepancies.filter((d) => d.balance < 0)

  // Nothing was actually reported short — the crew just never confirmed. Lead
  // with that, and never use the word "unaccounted" in the subject.
  const onlyUnconfirmed = shortfalls.length === 0 && overs.length === 0 && unconfirmed.length > 0

  // The crew ANSWERED and reported fewer than were delivered — they told us the
  // equipment is still on site. Say exactly that; "unaccounted for" reads as a
  // paperwork mismatch and buries a real report.
  const reportedLeft = shortfalls.length > 0 && overs.length === 0

  const subject = onlyUnconfirmed
    ? `Equipment retrieval not confirmed — ${who} — ${
        unconfirmed.map((d) => `${d.balance} ${keyLabel(d.equipment_key, d.balance)}`).join(', ')
      }`
    : reportedLeft
      ? `Equipment LEFT ON SITE — ${who} — ${
          shortfalls.map((d) => `${d.balance} ${keyLabel(d.equipment_key, d.balance)}`).join(', ')
        }`
      : `Equipment return discrepancy — ${who}${
          shortfalls.length ? ` — ${shortfalls.map((d) => `${d.balance} ${keyLabel(d.equipment_key, d.balance)}`).join(', ')} unaccounted` : ''
        }`

  const lines: string[] = []
  lines.push(onlyUnconfirmed
    ? `Equipment retrieval NOT CONFIRMED — final pickup completed`
    : reportedLeft
      ? `Equipment LEFT ON SITE — reported by the pickup crew`
      : `Equipment return discrepancy — final pickup completed`)
  lines.push('')
  if (onlyUnconfirmed) {
    lines.push('The pickup crew completed the stop without confirming these items either way.')
    lines.push('They may well be back on the truck — check with the crew before chasing the site.')
    lines.push('')
  }
  if (reportedLeft) {
    lines.push('The pickup crew confirmed they did NOT bring these back. They are still at the site.')
    lines.push('')
  }
  lines.push(`Customer: ${who}`)
  if (input.address) lines.push(`Address: ${input.address}`)
  if (input.finalPickupDate) lines.push(`Final pickup date: ${input.finalPickupDate}`)
  lines.push(`Reservation: ${input.reservationId}`)
  lines.push('')
  for (const d of input.discrepancies) {
    const label = keyLabel(d.equipment_key)
    const net = isUnconfirmed(d)
      ? `${d.balance} NOT CONFIRMED by the pickup crew (no retrieval logged either way)`
      : d.balance > 0
        ? `${d.balance} LEFT ON SITE (the pickup crew logged what they brought back)`
        : `${-d.balance} over-reported (more retrieved than logged as delivered)`
    lines.push(`${label.toUpperCase()}: delivered ${d.delivered}, retrieved ${d.retrieved} → ${net}`)
    for (const t of input.trace.filter((t) => t.equipment_key === d.equipment_key)) {
      lines.push(`  · ${t.stop_type === 'delivery' ? 'Left at delivery' : 'Retrieved at pickup'} ${t.scheduled_date ?? '(no date)'}: ${t.quantity} (stop ${t.stop_id})`)
    }
    lines.push('')
  }
  if (overs.length > 0 && shortfalls.length > 0) {
    lines.push('Crews logged less retrieved than delivered — equipment may still be on-site or lost in transit.')
  }
  if (unconfirmed.length > 0 && !onlyUnconfirmed) {
    lines.push('Items marked NOT CONFIRMED were never answered by the pickup crew — confirm with them before treating those as missing.')
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
