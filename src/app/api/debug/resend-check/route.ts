// TEMPORARY diagnostic — verify RESEND_API_KEY is visible to this Vercel
// deployment and that a Resend send succeeds. Token-gated; deployed on an
// ephemeral preview only; DELETED from the codebase after verification
// (never committed). House precedent: the TapGoods introspection route.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GATE = 'DlUCbJFVZU8obEFZijjft1ywy7w9r9tu'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('token') !== GATE) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const key = process.env.RESEND_API_KEY
  const keySet = !!key
  const keyHint = key ? `${key.slice(0, 6)}…(${key.length} chars)` : null
  const toOverride = process.env.EQUIPMENT_ALERT_EMAIL_TO?.trim() || null
  const fromOverride = process.env.EQUIPMENT_ALERT_EMAIL_FROM?.trim() || null

  if (req.nextUrl.searchParams.get('send') !== '1' || !key) {
    return NextResponse.json({ keySet, keyHint, toOverride, fromOverride })
  }

  const from = fromOverride || 'PTR Driver App <alerts@partytimerentals.com>'
  const to = 'dmorizet15@gmail.com' // test goes to Darren, NOT dispatch
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'PTR Driver App — Resend test (equipment return alerts)',
        text: 'Test send from the driver app equipment-return alert path. If you are reading this, RESEND_API_KEY is configured and working. No action needed.',
      }),
    })
    const body = await res.json().catch(() => null)
    return NextResponse.json({ keySet, keyHint, toOverride, fromOverride, sendStatus: res.status, sendBody: body })
  } catch (err) {
    return NextResponse.json({ keySet, keyHint, sendError: err instanceof Error ? err.message : String(err) })
  }
}
