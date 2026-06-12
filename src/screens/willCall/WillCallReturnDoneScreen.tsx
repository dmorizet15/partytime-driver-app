'use client'

// ─── Will Call — Screen 6: return done ───────────────────────────────────────
// Success state after the return POST: items checked back in, short/damage
// recap, SMS-sent note, back to the Will Call list. Rendered by the return
// check-off flow with the final client-side line state (Phase 1 — the recap
// is in-memory only; the durable record is return_notes on the order).

import { useRouter } from 'next/navigation'
import { WL, FONT_BODY, FONT_DISPLAY } from '@/lib/willCall/theme'
import type { WillCallCheckLine, WillCallOrder } from '@/lib/willCall/types'

interface Props {
  order: WillCallOrder
  lines: WillCallCheckLine[]
}

export default function WillCallReturnDoneScreen({ order, lines }: Props) {
  const router = useRouter()
  const name = order.customer_name?.trim() || order.company_name?.trim() || 'Will Call customer'

  const shorts  = lines.filter((l) => l.confirmedQty < (order.items[l.index]?.quantity ?? 0))
  const damaged = lines.filter((l) => l.damaged)
  const clean   = shorts.length === 0 && damaged.length === 0

  return (
    <div className="screen" style={{ background: WL.cream, fontFamily: FONT_BODY, color: WL.ink }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: '40px 20px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke={WL.green}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
               style={{ display: 'block', margin: '0 auto 10px' }}>
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 12l3 3 5-6"/>
          </svg>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800 }}>Return Complete</div>
          <div style={{ fontSize: 14, color: WL.muted, marginTop: 2 }}>{name}</div>
        </div>

        <div style={{ background: WL.paper, border: `1px solid ${WL.line}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <Row tone={WL.green}>
            <b>{order.items.length} item type{order.items.length === 1 ? '' : 's'}</b> checked back into the warehouse
          </Row>
          {shorts.length > 0 && (
            <Row tone={WL.amber}>
              <b>{shorts.length} short</b> — discrepancy note sent to dispatch
            </Row>
          )}
          {damaged.length > 0 && (
            <Row tone={WL.red}>
              <b>{damaged.length} damaged</b> — noted for a repair work order
            </Row>
          )}
          {clean && (
            <Row tone={WL.green}>All items back in good condition — no issues</Row>
          )}
          <Row tone={WL.blue}>Customer texted a return confirmation</Row>
        </div>

        <button
          onClick={() => router.replace('/will-call')}
          style={{
            width: '100%', border: 'none', cursor: 'pointer',
            background: WL.ink, color: '#fff',
            fontWeight: 800, fontSize: 15, padding: 14, borderRadius: 14,
            fontFamily: FONT_DISPLAY,
          }}
        >
          Back to Will Call
        </button>
      </div>
    </div>
  )
}

function Row({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '4px 0', fontSize: 13, lineHeight: 1.4 }}>
      <span aria-hidden style={{
        marginTop: 5, width: 8, height: 8, borderRadius: 999,
        background: tone, flexShrink: 0,
      }}/>
      <span>{children}</span>
    </div>
  )
}
