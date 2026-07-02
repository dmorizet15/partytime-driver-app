'use client'

// ─── Equipment Pickup Confirm — pickup-side capture ──────────────────────────
// Mirror of the delivery EquipmentReturnSection (same stepper pattern, same
// rule matching, same groups), pre-filled with the reservation's RUNNING
// BALANCE per equipment_key (GET /api/stops/equipment-returns — ledger-based:
// what earlier pickups left behind, not any single delivery's count). One tap
// on the confirm circle accepts the pre-filled number; stepping the count
// corrects it (and accepts). Confirmed rows are written at completion through
// the POST path in runStopComplete; unconfirmed rows write nothing — an
// honest gap the final-pickup reconciliation can surface, never a silent
// auto-confirm. Soft prompt: never blocks "Complete Stop".
//
// Rendered rules = rules matching this stop's items ∪ keys with a positive
// balance — a final tent pickup must still surface leftover china racks even
// when no china is on ITS manifest.
//
// Below-prefill entries get a non-blocking inline note ("fewer than
// expected") so typos get caught in the moment, not after the fact.

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { Stop } from '@/types'
import {
  EQUIPMENT_RETURN_GROUPS,
  EQUIPMENT_RETURN_RULES,
  ruleMatchesItems,
  type EquipmentReturnRule,
} from '@/lib/equipmentReturns/rules'
import {
  loadEquipmentReturnDraft,
  saveEquipmentReturnDraft,
  type EquipmentReturnEntry,
} from '@/lib/equipmentReturns/service'
import type { EquipmentReturnSectionHandle } from './EquipmentReturnSection'
import { StepBtn } from './EquipmentReturnSection'

// Tokens — mirror StopDetailScreen (Direction 03 Editorial).
const C = {
  blue:  '#0000FF',
  ink:   '#0A0B14',
  gold:  '#FFB800',
  muted: '#6B7488',
  paper: '#FFFFFF',
  off:   '#F4F6FA',
  green: '#1FBF6B',
  amber: '#F5A623',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface EquipmentPickupSectionProps {
  stop: Stop
}

interface BalanceRow {
  equipment_key: string
  delivered: number
  retrieved: number
  balance: number
}

function titleLabel(rule: EquipmentReturnRule): string {
  const noun = rule.noun.many
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

const EquipmentPickupSection = forwardRef<EquipmentReturnSectionHandle, EquipmentPickupSectionProps>(
  function EquipmentPickupSection({ stop }, ref) {
  const [expected, setExpected] = useState<Record<string, number> | null>(null)
  const [counts, setCounts]     = useState<Record<string, number>>({})
  const [accepted, setAccepted] = useState<Set<string>>(new Set())

  // Load the running balance, then seed counts (draft wins over prefill —
  // the crew's in-progress numbers survive a back-out or WO round trip).
  useEffect(() => {
    let cancelled = false
    fetch(`/api/stops/equipment-returns?stop_id=${encodeURIComponent(stop.stop_id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return
        const balances = (Array.isArray(json?.balances) ? json.balances : []) as BalanceRow[]
        const exp: Record<string, number> = {}
        for (const b of balances) exp[b.equipment_key] = Math.max(0, b.balance)
        finish(exp)
      })
      .catch((err) => {
        console.warn('[EquipmentPickupSection] balance fetch failed (non-fatal):', err instanceof Error ? err.message : err)
        if (!cancelled) finish({})
      })
    function finish(exp: Record<string, number>) {
      const draft = loadEquipmentReturnDraft(stop.stop_id)
      setExpected(exp)
      setCounts(draft?.counts ?? { ...exp })
      setAccepted(new Set(draft?.accepted ?? []))
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop.stop_id])

  useImperativeHandle(ref, () => ({
    getTouchedEntries(): EquipmentReturnEntry[] {
      return Array.from(accepted)
        .map((key) => ({ equipment_key: key, quantity: Math.max(0, counts[key] ?? 0) }))
    },
  }), [accepted, counts])

  function persist(nextCounts: Record<string, number>, nextAccepted: Set<string>) {
    saveEquipmentReturnDraft(stop.stop_id, nextCounts, Array.from(nextAccepted))
  }

  // Event handlers read the latest render's state directly — no updater-fn
  // side effects (StrictMode double-invokes updaters).
  function step(key: string, delta: number) {
    const nextCounts = { ...counts, [key]: Math.max(0, (counts[key] ?? 0) + delta) }
    const nextAccepted = new Set(accepted)
    nextAccepted.add(key) // any stepper interaction resolves the row
    setCounts(nextCounts)
    setAccepted(nextAccepted)
    persist(nextCounts, nextAccepted)
  }

  function toggleAccept(key: string) {
    const next = new Set(accepted)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setAccepted(next)
    persist(counts, next)
  }

  if (expected === null) return null // balance still loading — avoid a wrong prefill flash

  // Rules matching this stop's items ∪ keys with something left to retrieve.
  const rules = EQUIPMENT_RETURN_RULES.filter(
    (r) => ruleMatchesItems(r, stop.items ?? []) || (expected[r.key] ?? 0) > 0
  )
  if (rules.length === 0) return null

  return (
    <div style={{ padding: '18px 18px 0', fontFamily: FONT_BODY, color: C.ink }}>
      <div style={{
        background: C.paper,
        border: `1.5px solid ${C.ink}`,
        borderRadius: 18,
        overflow: 'hidden',
      }}>
        <div style={{
          background: 'rgba(31,70,255,0.10)',
          borderBottom: '1px solid rgba(31,70,255,0.35)',
          padding: '12px 16px',
        }}>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: C.ink,
          }}>
            Confirm equipment retrieved
          </div>
          <div style={{ marginTop: 3, fontSize: 12, color: C.muted, lineHeight: 1.35 }}>
            Pre-filled with what should be on-site. Tap the circle if the number&apos;s right — or correct it.
          </div>
        </div>

        {EQUIPMENT_RETURN_GROUPS.map(({ group, header }) => {
          const groupRules = rules.filter((r) => r.group === group)
          if (groupRules.length === 0) return null
          return (
            <div key={group}>
              <div style={{
                padding: '12px 16px 2px',
                fontFamily: FONT_DISPLAY,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: C.muted,
              }}>
                {header}
              </div>
              {groupRules.map((rule) => {
                const exp = expected[rule.key] ?? 0
                const count = counts[rule.key] ?? 0
                const isAccepted = accepted.has(rule.key)
                const short = isAccepted && exp > 0 && count < exp
                return (
                  <div key={rule.key} style={{ padding: '10px 16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Confirm circle — one tap accepts the shown count. */}
                      <button
                        onClick={() => toggleAccept(rule.key)}
                        aria-label={isAccepted
                          ? `Un-confirm ${rule.noun.many}`
                          : `Confirm ${count} ${rule.noun.many} retrieved`}
                        style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                          border: isAccepted ? 0 : `2px solid ${C.muted}`,
                          background: isAccepted ? (short ? C.amber : C.green) : 'transparent',
                          color: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 140ms ease',
                        }}
                      >
                        {isAccepted && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff"
                               strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 12l5 5L20 6"/>
                          </svg>
                        )}
                      </button>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
                          {titleLabel(rule)}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 11.5, color: C.muted }}>
                          {exp > 0 ? `Expected here: ${exp}` : 'None expected — log any you find'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <StepBtn label="−" onClick={() => step(rule.key, -1)} disabled={count <= 0} />
                        <div style={{
                          minWidth: 34, textAlign: 'center',
                          fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 900,
                          fontVariantNumeric: 'tabular-nums',
                          color: short ? C.amber : (isAccepted ? C.green : C.ink),
                        }}>
                          {count}
                        </div>
                        <StepBtn label="+" onClick={() => step(rule.key, +1)} />
                      </div>
                    </div>

                    {/* Non-blocking below-prefill confirm — catches typos in the
                        moment. Informational only; completion is never gated. */}
                    {short && (
                      <div style={{
                        marginTop: 8, fontSize: 12, fontWeight: 700, color: C.amber,
                        lineHeight: 1.35,
                      }}>
                        You&apos;re reporting fewer than expected ({exp}) — is that right?
                        Dispatch is alerted after the job&apos;s last pickup.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default EquipmentPickupSection
