'use client'

// ─── TapGoods Item Check-Off panel (INLINE) ──────────────────────────────────
// Rev 1 (2026-06-10 live-test revision, Notion spec 37b0aa6451b881e39a1bcde70e6bd288):
// the check-off list renders INLINE at the bottom of StopDetailScreen — it is
// no longer a full-screen sheet summoned by "Mark Stop Complete." The single
// gated bottom CTA lives on the SCREEN (disabled "Confirm N items to
// complete" → "Complete Stop → Next") and calls commit() through the ref
// handle; it replaced both the old open-the-sheet button and the old in-sheet
// complete button. ONLY the container changed — everything inside is the
// sheet's interaction model, reused verbatim:
//
//   • Confirm all — one gold button accepts every pending line at full qty.
//   • Per-line tap-to-accept — row tap accepts at full qty (green check);
//     tapping an accepted line un-accepts (editable).
//   • Issue drawer — inline per-line: qty stepper (short → amber, the accept
//     circle shows the corrected number) + an INDEPENDENT "Item damaged"
//     toggle (never changes quantity; full-but-damaged keeps its green check
//     AND gains the red wrench/WO badge). Stop-type-aware damage copy.
//   • Pre-commit summary strip — "WHAT HAPPENS ON COMPLETE" appears above the
//     gate when any exception exists.
//   • Offline behavior, sessionStorage draft, and the damage → Report-an-issue
//     work-order round trip are unchanged (service.ts untouched).

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import type { Stop } from '@/types'
import type { CheckoffLineDraft } from '@/lib/checkoff/types'
import {
  commitCheckoff,
  consumeCheckoffWoReturn,
  loadCheckoffDraft,
  saveCheckoffDraft,
  type CheckoffCommitSummary,
} from '@/lib/checkoff/service'

// Tokens — mirror StopDetailScreen (Direction 03 Editorial).
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
  amber:    '#F5A623',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// Live gate state reported to the parent screen — drives the single bottom
// CTA's disabled state + "Confirm N items to complete" label.
export interface CheckoffPanelProgress {
  confirmed: number
  total: number
  allResolved: boolean
}

// Imperative handle for the screen's CTA. commit() resolves null when the
// gate isn't satisfied (or a commit is already in flight); otherwise it runs
// the unchanged commitCheckoff path (audit insert → local flag → TapGoods
// write-back, queue-backed, never throws) and returns the summary.
export interface CheckoffPanelHandle {
  commit: () => Promise<CheckoffCommitSummary | null>
}

interface ItemCheckoffPanelProps {
  stop: Stop
  routeId: string
  userId: string
  onProgress: (progress: CheckoffPanelProgress) => void
}

function freshLines(stop: Stop): CheckoffLineDraft[] {
  return (stop.items ?? []).map((item, index) => ({
    index,
    accepted:     false,
    confirmedQty: typeof item.qty === 'number' && item.qty >= 0 ? Math.floor(item.qty) : 0,
    damaged:      false,
    workOrderId:     null,
    workOrderNumber: null,
  }))
}

const ItemCheckoffPanel = forwardRef<CheckoffPanelHandle, ItemCheckoffPanelProps>(
  function ItemCheckoffPanel({ stop, routeId, userId, onProgress }, ref) {
  const router = useRouter()
  const items = useMemo(() => stop.items ?? [], [stop.items])
  const isPickup = stop.stop_type === 'pickup'

  const [lines, setLines] = useState<CheckoffLineDraft[]>(() => {
    const draft = loadCheckoffDraft(stop.stop_id)
    const base = draft && draft.lines.length === (stop.items ?? []).length
      ? draft.lines
      : freshLines(stop)
    // Returning from the damage → Report-an-issue round trip: attach the
    // created work order to its line before anything else renders.
    const wo = consumeCheckoffWoReturn(stop.stop_id)
    if (!wo) return base
    return base.map((l) => l.index === wo.itemIndex
      ? { ...l, damaged: true, workOrderId: wo.workOrderId, workOrderNumber: wo.workOrderNumber }
      : l)
  })
  const [issueOpenIdx, setIssueOpenIdx] = useState<number | null>(null)
  const committedRef  = useRef(false)
  const committingRef = useRef(false)

  // Draft every change — survives the WO round trip and an accidental back-out.
  useEffect(() => {
    if (!committedRef.current) saveCheckoffDraft(stop.stop_id, lines)
  }, [lines, stop.stop_id])

  const confirmedCount = lines.filter((l) => l.accepted).length
  const allResolved    = lines.length > 0 && confirmedCount === lines.length

  // Report gate state up — the screen's single CTA renders from this.
  useEffect(() => {
    onProgress({ confirmed: confirmedCount, total: lines.length, allResolved })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedCount, lines.length, allResolved])

  useImperativeHandle(ref, () => ({
    async commit() {
      if (!allResolved || committingRef.current || committedRef.current) return null
      committingRef.current = true
      const s = await commitCheckoff(stop, lines, userId)
      committedRef.current = true
      committingRef.current = false
      return s
    },
  }), [allResolved, lines, stop, userId])

  const shortUnits = lines.reduce((acc, l) => {
    const ordered = typeof items[l.index]?.qty === 'number' ? Math.floor(items[l.index]!.qty!) : 0
    return l.accepted && l.confirmedQty < ordered ? acc + (ordered - l.confirmedQty) : acc
  }, 0)
  const damagedCount = lines.filter((l) => l.damaged).length
  const hasExceptions = shortUnits > 0 || damagedCount > 0

  function patchLine(index: number, patch: Partial<CheckoffLineDraft>) {
    setLines((prev) => prev.map((l) => (l.index === index ? { ...l, ...patch } : l)))
  }

  function orderedQty(index: number): number {
    const q = items[index]?.qty
    return typeof q === 'number' && q >= 0 ? Math.floor(q) : 0
  }

  // Row tap — accept at FULL quantity; tap again to un-accept (resets any
  // stale correction so the next accept is clean). Damage is untouched.
  function toggleAccept(index: number) {
    const line = lines.find((l) => l.index === index)
    if (!line) return
    if (line.accepted) {
      patchLine(index, { accepted: false, confirmedQty: orderedQty(index) })
    } else {
      patchLine(index, { accepted: true, confirmedQty: orderedQty(index) })
    }
  }

  function confirmAllPending() {
    setLines((prev) => prev.map((l) =>
      l.accepted ? l : { ...l, accepted: true, confirmedQty: orderedQty(l.index) }
    ))
  }

  // Stepper — any interaction resolves the line at the new quantity.
  function stepQty(index: number, delta: number) {
    const line = lines.find((l) => l.index === index)
    if (!line) return
    const next = Math.min(orderedQty(index), Math.max(0, line.confirmedQty + delta))
    patchLine(index, { confirmedQty: next, accepted: true })
  }

  function openWorkOrder(index: number) {
    // Draft is already persisted by the effect above; the report-issue
    // screen stashes the WO id for pickup on return.
    router.push(
      `/route/${routeId}/stop/${stop.stop_id}/report-issue?item=${index}&checkoff=1`
    )
  }

  return (
    <section
      aria-label={isPickup ? 'Check items back in' : 'Check items out'}
      style={{ fontFamily: FONT_BODY, color: C.ink }}
    >
      {/* ── Section header — title + live counter ───────────────────────────
          Compact verticals throughout this panel: every px of chrome comes out
          of visible manifest rows on a phone (the gate + tab bar already pin
          ~160px of the viewport). */}
      <div style={{
        padding: '12px 18px 8px',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.muted,
        }}>
          {isPickup ? 'Check items back in' : 'Check items out'}
        </div>
        <div style={{
          fontSize: 12.5, fontWeight: 800,
          color: allResolved ? C.green : C.amber,
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}>
          {confirmedCount} of {lines.length} confirmed
        </div>
      </div>

      <div style={{ padding: '0 18px' }}>
        {/* Confirm all — the happy path, one tap. */}
        {!allResolved && (
          <button
            onClick={confirmAllPending}
            style={{
              width: '100%', height: 44, borderRadius: 12,
              background: C.gold, color: C.ink, border: 0, cursor: 'pointer',
              fontSize: 14, fontWeight: 900, fontFamily: FONT_DISPLAY,
              letterSpacing: '-0.01em',
              boxShadow: '0 10px 22px -10px rgba(255,184,0,0.55)',
              marginBottom: 10,
            }}
          >
            ✓ Confirm all — all good
          </button>
        )}

        {/* Line rows */}
        <div style={{
          background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 16,
          overflow: 'hidden',
        }}>
          {lines.map((line, i) => {
            const item = items[line.index]
            const ordered = orderedQty(line.index)
            const isShort = line.accepted && line.confirmedQty < ordered
            const drawerOpen = issueOpenIdx === line.index
            return (
              <div key={line.index} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.off}` }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 10 }}>
                  {/* Accept circle — check (green full), corrected number
                      (amber short), or empty outline (pending). */}
                  <button
                    onClick={() => toggleAccept(line.index)}
                    aria-label={line.accepted ? 'Un-accept line' : 'Accept line at full quantity'}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      border: line.accepted ? 0 : `2px solid ${C.muted}`,
                      background: line.accepted ? (isShort ? C.amber : C.green) : 'transparent',
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
                      fontFamily: 'inherit', color: C.ink, padding: 0,
                    }}
                  >
                    <div style={{
                      fontSize: 14, fontWeight: 800, lineHeight: 1.25,
                      textDecoration: 'none',
                    }}>
                      {item?.name?.trim() || 'Unnamed item'}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>
                        {isShort
                          ? `${line.confirmedQty} of ${ordered} ${isPickup ? 'returned' : 'delivered'}`
                          : `Qty ${ordered}`}
                      </span>
                      {line.damaged && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'rgba(255,90,60,0.12)', color: C.coral,
                          border: `1px solid rgba(255,90,60,0.45)`,
                          fontSize: 10, fontWeight: 900, letterSpacing: '0.08em',
                          padding: '2px 7px', borderRadius: 999,
                        }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.coral}
                               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L3 18l3 3 6.5-6.5a4 4 0 0 0 5.2-5.2L15 12l-3-3 2.7-2.7z"/>
                          </svg>
                          {line.workOrderNumber ?? 'WO'}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => setIssueOpenIdx(drawerOpen ? null : line.index)}
                    style={{
                      flexShrink: 0,
                      background: drawerOpen ? C.ink : 'transparent',
                      color: drawerOpen ? '#fff' : C.muted,
                      border: `1.5px solid ${drawerOpen ? C.ink : C.off}`,
                      borderRadius: 999, padding: '6px 13px', cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
                    }}
                  >
                    Issue
                  </button>
                </div>

                {/* ── Inline Issue drawer ─────────────────────────────────── */}
                {drawerOpen && (
                  <div style={{ background: C.off, padding: '14px 14px 16px' }}>
                    {/* Quantity stepper */}
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                      color: C.muted, textTransform: 'uppercase',
                    }}>
                      {isPickup ? 'Quantity returned' : 'Quantity delivered'}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <StepBtn label="−" onClick={() => stepQty(line.index, -1)} disabled={line.confirmedQty <= 0}/>
                      <div style={{
                        minWidth: 64, textAlign: 'center',
                        fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 900,
                        color: isShort ? C.amber : C.ink,
                      }}>
                        {line.confirmedQty}
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}> / {ordered}</span>
                      </div>
                      <StepBtn label="+" onClick={() => stepQty(line.index, +1)} disabled={line.confirmedQty >= ordered}/>
                    </div>
                    {isShort && (
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: C.amber }}>
                        {ordered - line.confirmedQty} short — Melissa gets a note on complete.
                      </div>
                    )}

                    {/* Damage toggle — INDEPENDENT of quantity. */}
                    <div style={{
                      marginTop: 14, paddingTop: 14, borderTop: `1px solid rgba(10,11,20,0.08)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Item damaged</div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: C.muted, lineHeight: 1.35 }}>
                          {isPickup
                            ? 'Counts as returned — opens a repair work order.'
                            : 'Replaced in field — opens a repair work order if repairable.'}
                        </div>
                      </div>
                      <button
                        role="switch"
                        aria-checked={line.damaged}
                        onClick={() => patchLine(line.index, { damaged: !line.damaged })}
                        style={{
                          width: 48, height: 28, borderRadius: 999, flexShrink: 0,
                          background: line.damaged ? C.coral : 'rgba(10,11,20,0.18)',
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

                    {/* Pre-filled work-order chip — previews the handoff into
                        the existing Report-an-issue form. */}
                    {line.damaged && (
                      <div style={{
                        marginTop: 12, background: C.paper,
                        border: `1.5px solid rgba(255,90,60,0.5)`, borderRadius: 12,
                        padding: '11px 13px',
                      }}>
                        <div style={{
                          fontSize: 10, fontWeight: 900, letterSpacing: '0.16em',
                          color: C.coral, textTransform: 'uppercase',
                        }}>
                          Repair work order
                        </div>
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800 }}>
                          {item?.name?.trim() || 'Unnamed item'}
                        </div>
                        <div style={{ marginTop: 1, fontSize: 11.5, color: C.muted }}>
                          #{stop.order_id} · {(stop.company_name?.trim() || stop.customer_name).trim()}
                        </div>
                        {line.workOrderNumber ? (
                          <div style={{
                            marginTop: 8, fontSize: 12.5, fontWeight: 800, color: C.green,
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.green}
                                 strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M4 12l5 5L20 6"/>
                            </svg>
                            {line.workOrderNumber} opened
                          </div>
                        ) : (
                          <button
                            onClick={() => openWorkOrder(line.index)}
                            style={{
                              marginTop: 9, width: '100%',
                              background: C.coral, color: '#fff', border: 0,
                              borderRadius: 999, padding: '9px 14px', cursor: 'pointer',
                              fontSize: 12.5, fontWeight: 900, fontFamily: 'inherit',
                            }}
                          >
                            Open repair work order ›
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => setIssueOpenIdx(null)}
                      style={{
                        marginTop: 12, width: '100%',
                        background: 'transparent', color: C.ink,
                        border: `1.5px solid ${C.ink}`, borderRadius: 999,
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

        {/* ── Pre-commit summary strip — billing consequence made visible ── */}
        {hasExceptions && (
          <div style={{
            marginTop: 10, background: C.ink, color: '#fff',
            borderRadius: 14, padding: '11px 13px',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: C.gold, textTransform: 'uppercase',
            }}>
              What happens on complete
            </div>
            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {shortUnits > 0 && (
                <SummaryLine>
                  {shortUnits} unit{shortUnits === 1 ? '' : 's'} short → note to Melissa
                  (credit or schedule a return)
                </SummaryLine>
              )}
              {damagedCount > 0 && (
                <SummaryLine>
                  {damagedCount} work order{damagedCount === 1 ? '' : 's'} for damaged item{damagedCount === 1 ? '' : 's'}
                </SummaryLine>
              )}
              <SummaryLine>
                Real quantities written to TapGoods as {isPickup ? 'CHECKED IN' : 'IN USE'}
              </SummaryLine>
            </ul>
          </div>
        )}
      </div>
    </section>
  )
})

export default ItemCheckoffPanel

// ─── Small pieces ────────────────────────────────────────────────────────────

function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '−' ? 'Decrease quantity' : 'Increase quantity'}
      style={{
        width: 44, height: 44, borderRadius: '50%',
        background: disabled ? 'rgba(10,11,20,0.06)' : C.ink,
        color: disabled ? C.muted : '#fff',
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
      <span style={{ color: C.gold, flexShrink: 0 }}>•</span>
      <span>{children}</span>
    </li>
  )
}
