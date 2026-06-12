'use client'

// ─── Will Call — Screens 3 + 5: staging / return check-off ──────────────────
// Patterned on the production ItemCheckoffPanel (src/components/checkoff/) —
// the same interaction model, NOT the mockup JSX: confirm-all gold button,
// per-line tap-to-accept circle (green check / amber corrected number),
// inline Issue drawer with a qty stepper, pinned gated bottom CTA.
//
//   mode="staging" — damage toggle removed entirely; qty exception only
//     (short → amber). Complete → POST dashboard /api/willcall/[id]/stage
//     (fires the staging SMS/email) → back to detail.
//   mode="return"  — full model: short qty + an independent damage flag.
//     Complete → exceptions summarized into returnNotes (server flips
//     has_discrepancy + emails dispatch when non-empty) → POST
//     /api/willcall/[id]/return → Return Done screen.
//
// Check-off line state is CLIENT-SIDE ONLY (Phase 1 — no per-item DB rows,
// no migration). Backing out resets the flow by design.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWillCallOrders } from '@/hooks/willCall/useWillCallOrders'
import { stageWillCallOrder, returnWillCallOrder } from '@/lib/willCall/api'
import { WL, FONT_BODY, FONT_DISPLAY } from '@/lib/willCall/theme'
import type { WillCallCheckLine, WillCallCheckoffMode, WillCallOrder } from '@/lib/willCall/types'
import WillCallReturnDoneScreen from './WillCallReturnDoneScreen'

interface Props {
  orderId: string
  mode:    WillCallCheckoffMode
}

function freshLines(order: WillCallOrder): WillCallCheckLine[] {
  return order.items.map((item, index) => ({
    index,
    accepted:     false,
    confirmedQty: item.quantity,
    damaged:      false,
  }))
}

// Freeform return_notes summary — the Phase 1 exception record. Melissa's
// discrepancy email carries this verbatim.
export function buildReturnNotes(order: WillCallOrder, lines: WillCallCheckLine[]): string {
  const parts: string[] = []
  for (const line of lines) {
    const item = order.items[line.index]
    if (!item) continue
    if (line.confirmedQty < item.quantity) {
      parts.push(`${item.name}: ${line.confirmedQty} of ${item.quantity} returned (${item.quantity - line.confirmedQty} short)`)
    }
    if (line.damaged) {
      parts.push(`${item.name}: returned damaged — repair needed`)
    }
  }
  return parts.join('\n')
}

export default function WillCallCheckoffScreen({ orderId, mode }: Props) {
  const router = useRouter()
  const { orders, loading } = useWillCallOrders()
  const order = orders.find((o) => o.id === orderId)
  const isStaging = mode === 'staging'

  const [lines, setLines] = useState<WillCallCheckLine[] | null>(null)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Initialize lines once the order arrives. Keyed on the order id only —
  // a background refetch must never clobber in-progress check-off state
  // (see tasks/lessons.md on self-cancelling effects).
  useEffect(() => {
    if (order && lines === null) setLines(freshLines(order))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  if (done && order && lines) {
    return <WillCallReturnDoneScreen order={order} lines={lines}/>
  }

  if (!order || !lines) {
    return (
      <div className="screen" style={{
        background: WL.cream, fontFamily: FONT_BODY,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: WL.muted, fontSize: 14 }}>
          {loading || !order ? 'Loading…' : 'Preparing check-off…'}
        </p>
      </div>
    )
  }

  const name = order.customer_name?.trim() || order.company_name?.trim() || 'Will Call customer'
  const confirmedCount = lines.filter((l) => l.accepted).length
  const allResolved = lines.length > 0 && confirmedCount === lines.length
  const shorts  = lines.filter((l) => l.accepted && l.confirmedQty < (order.items[l.index]?.quantity ?? 0))
  const damaged = lines.filter((l) => l.damaged)
  const hasExceptions = shorts.length > 0 || damaged.length > 0

  function patchLine(index: number, patch: Partial<WillCallCheckLine>) {
    setLines((prev) => prev && prev.map((l) => (l.index === index ? { ...l, ...patch } : l)))
  }

  function orderedQty(index: number): number {
    return order?.items[index]?.quantity ?? 0
  }

  function toggleAccept(index: number) {
    const line = lines?.find((l) => l.index === index)
    if (!line) return
    if (line.accepted) {
      patchLine(index, { accepted: false, confirmedQty: orderedQty(index) })
    } else {
      patchLine(index, { accepted: true, confirmedQty: orderedQty(index) })
    }
  }

  function confirmAllPending() {
    setLines((prev) => prev && prev.map((l) =>
      l.accepted ? l : { ...l, accepted: true, confirmedQty: orderedQty(l.index) }
    ))
  }

  function stepQty(index: number, delta: number) {
    const line = lines?.find((l) => l.index === index)
    if (!line) return
    const next = Math.min(orderedQty(index), Math.max(0, line.confirmedQty + delta))
    patchLine(index, { confirmedQty: next, accepted: true })
  }

  async function complete() {
    if (!order || !lines || !allResolved || busy) return
    setBusy(true)
    setSubmitError(null)
    try {
      if (isStaging) {
        await stageWillCallOrder(order.id)
        router.replace(`/will-call/${order.id}`)
      } else {
        await returnWillCallOrder(order.id, buildReturnNotes(order, lines))
        setDone(true)
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong — try again.')
      setBusy(false)
    }
  }

  return (
    <div className="screen" style={{ background: WL.cream, fontFamily: FONT_BODY, color: WL.ink }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ background: WL.blue, color: '#fff', padding: '10px 18px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => router.push(`/will-call/${order.id}`)}
            aria-label="Back to order"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800 }}>{name}</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          {isStaging ? 'Staging items' : 'Processing return'}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 14px 150px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>
            {isStaging ? 'Pull each item from the shelf' : 'Check items back in'}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: allResolved ? WL.green : WL.muted }}>
            {confirmedCount} of {lines.length}
          </span>
        </div>

        {/* Confirm all — the happy path, one tap. */}
        {!allResolved && (
          <button
            onClick={confirmAllPending}
            style={{
              width: '100%', border: 'none', cursor: 'pointer',
              background: WL.gold, color: WL.ink,
              fontWeight: 900, fontSize: 14, padding: 12, borderRadius: 13, marginBottom: 12,
              fontFamily: FONT_DISPLAY,
              boxShadow: '0 10px 22px -10px rgba(255,184,0,0.55)',
            }}
          >
            ✓ {isStaging ? 'All items found — mark all pulled' : 'All items back — no issues'}
          </button>
        )}

        {/* Line rows */}
        <div style={{
          background: WL.paper, border: `1.5px solid ${WL.ink}`, borderRadius: 16,
          overflow: 'hidden',
        }}>
          {lines.map((line, i) => {
            const item = order.items[line.index]
            const ordered = orderedQty(line.index)
            const isShort = line.accepted && line.confirmedQty < ordered
            const drawerOpen = openIdx === line.index
            return (
              <div key={line.index} style={{ borderTop: i === 0 ? 'none' : `1px solid ${WL.off}` }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 10 }}>
                  {/* Accept circle — check (green full), corrected number
                      (amber short), or empty outline (pending). */}
                  <button
                    onClick={() => toggleAccept(line.index)}
                    aria-label={line.accepted ? 'Un-accept line' : 'Accept line at full quantity'}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      border: line.accepted ? 0 : `2px solid ${WL.muted}`,
                      background: line.accepted ? (isShort ? WL.amber : WL.green) : 'transparent',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 900, fontFamily: FONT_DISPLAY,
                      transition: 'background 140ms ease',
                    }}
                  >
                    {line.accepted && (isShort ? line.confirmedQty : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff"
                           strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 12l5 5L20 6"/>
                      </svg>
                    ))}
                  </button>

                  {/* Name + qty — row body also toggles accept. */}
                  <button
                    onClick={() => toggleAccept(line.index)}
                    style={{
                      flex: 1, minWidth: 0, textAlign: 'left',
                      background: 'transparent', border: 0, cursor: 'pointer',
                      fontFamily: 'inherit', color: WL.ink, padding: 0,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>
                      {item?.name ?? 'Unnamed item'}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: WL.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>
                        {isShort
                          ? `${line.confirmedQty} of ${ordered} ${isStaging ? 'found' : 'back'}`
                          : `Qty ${ordered}`}
                      </span>
                      {line.damaged && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: WL.redTint, color: WL.red,
                          border: `1px solid ${WL.red}`,
                          fontSize: 10, fontWeight: 900, letterSpacing: '0.08em',
                          padding: '2px 7px', borderRadius: 999,
                        }}>
                          DAMAGED
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => setOpenIdx(drawerOpen ? null : line.index)}
                    style={{
                      flexShrink: 0,
                      background: drawerOpen ? WL.ink : 'transparent',
                      color: drawerOpen ? '#fff' : WL.muted,
                      border: `1.5px solid ${drawerOpen ? WL.ink : WL.off}`,
                      borderRadius: 999, padding: '6px 13px', cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
                    }}
                  >
                    Issue
                  </button>
                </div>

                {/* ── Inline Issue drawer ─────────────────────────────────── */}
                {drawerOpen && (
                  <div style={{ background: WL.off, padding: '14px 14px 16px' }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                      color: WL.muted, textTransform: 'uppercase',
                    }}>
                      {isStaging ? 'Quantity found' : 'Quantity returned'}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <StepBtn label="−" onClick={() => stepQty(line.index, -1)} disabled={line.confirmedQty <= 0}/>
                      <div style={{
                        minWidth: 64, textAlign: 'center',
                        fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 900,
                        color: isShort ? WL.amber : WL.ink,
                      }}>
                        {line.confirmedQty}
                        <span style={{ fontSize: 13, fontWeight: 700, color: WL.muted }}> / {ordered}</span>
                      </div>
                      <StepBtn label="+" onClick={() => stepQty(line.index, +1)} disabled={line.confirmedQty >= ordered}/>
                    </div>
                    {isShort && (
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: WL.amber }}>
                        {ordered - line.confirmedQty} short — {isStaging
                          ? 'stage what you have; flag the rest.'
                          : 'Melissa gets a note on complete.'}
                      </div>
                    )}

                    {/* Damage toggle — return mode ONLY, independent of qty. */}
                    {!isStaging && (
                      <div style={{
                        marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(10,11,20,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Returned damaged</div>
                          <div style={{ marginTop: 2, fontSize: 11.5, color: WL.muted, lineHeight: 1.35 }}>
                            Goes in the return note — dispatch opens the repair work order.
                          </div>
                        </div>
                        <button
                          role="switch"
                          aria-checked={line.damaged}
                          onClick={() => patchLine(line.index, { damaged: !line.damaged })}
                          style={{
                            width: 48, height: 28, borderRadius: 999, flexShrink: 0,
                            background: line.damaged ? WL.red : 'rgba(10,11,20,0.18)',
                            border: 0, cursor: 'pointer', position: 'relative',
                            transition: 'background 140ms ease',
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: 3,
                            left: line.damaged ? 23 : 3,
                            width: 22, height: 22, borderRadius: '50%',
                            background: '#fff', transition: 'left 140ms ease',
                          }}/>
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => setOpenIdx(null)}
                      style={{
                        marginTop: 12, width: '100%',
                        background: 'transparent', color: WL.ink,
                        border: `1.5px solid ${WL.ink}`, borderRadius: 999,
                        padding: '8px 14px', cursor: 'pointer',
                        fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit',
                      }}
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Pre-commit summary strip ─────────────────────────────────────── */}
        {hasExceptions && (
          <div style={{
            marginTop: 10, background: WL.ink, color: '#fff',
            borderRadius: 14, padding: '11px 13px',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: WL.gold, textTransform: 'uppercase',
            }}>
              What happens on complete
            </div>
            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {shorts.length > 0 && (
                <SummaryLine>
                  {shorts.length} item{shorts.length === 1 ? '' : 's'} short{isStaging
                    ? ' — short quantities go with the customer'
                    : ' → discrepancy note to dispatch'}
                </SummaryLine>
              )}
              {damaged.length > 0 && (
                <SummaryLine>
                  {damaged.length} damaged item{damaged.length === 1 ? '' : 's'} → noted for a repair work order
                </SummaryLine>
              )}
              {!isStaging && (
                <SummaryLine>Customer gets a return confirmation text</SummaryLine>
              )}
            </ul>
          </div>
        )}

        {submitError && (
          <div style={{
            marginTop: 12, background: WL.redTint, border: `1px solid ${WL.red}`,
            borderRadius: 12, padding: '10px 14px', fontSize: 13, color: WL.red, fontWeight: 600,
          }}>
            {submitError}
          </div>
        )}
      </div>

      {/* ── Gated bottom CTA — pinned ────────────────────────────────────── */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: '14px 16px calc(18px + env(safe-area-inset-bottom))',
        background: `linear-gradient(180deg, rgba(255,249,238,0) 0%, ${WL.cream} 32%)`,
      }}>
        <button
          disabled={!allResolved || busy}
          onClick={() => { void complete() }}
          style={{
            width: '100%', border: 'none',
            cursor: allResolved && !busy ? 'pointer' : 'not-allowed',
            background: allResolved && !busy ? WL.blue : '#d6d4ce',
            color: allResolved && !busy ? '#fff' : '#9b9890',
            fontWeight: 800, fontSize: 16, padding: 15, borderRadius: 16,
            fontFamily: FONT_DISPLAY,
            boxShadow: allResolved && !busy ? '0 4px 14px rgba(0,0,255,0.32)' : 'none',
          }}
        >
          {busy
            ? (isStaging ? 'Staging…' : 'Completing return…')
            : allResolved
              ? (isStaging ? 'Confirm Staging Complete' : 'Complete Return')
              : `Confirm all first · ${confirmedCount} of ${lines.length}`}
        </button>
      </div>
    </div>
  )
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '−' ? 'Decrease quantity' : 'Increase quantity'}
      style={{
        width: 44, height: 44, borderRadius: '50%',
        background: disabled ? 'rgba(10,11,20,0.06)' : WL.ink,
        color: disabled ? WL.muted : '#fff',
        border: 0, cursor: disabled ? 'default' : 'pointer',
        fontSize: 22, fontWeight: 800, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}

function SummaryLine({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.4, fontWeight: 600 }}>
      <span style={{ color: WL.gold, flexShrink: 0 }}>•</span>
      <span>{children}</span>
    </li>
  )
}
