'use client'

// ─── Equipment Left On-Site — delivery-side capture ──────────────────────────
// Soft prompt on delivery StopDetail: one stepper per EQUIPMENT_RETURN_RULES
// rule that matches the stop's manifest, grouped Power / Dinnerware / Seating.
// Progressive disclosure — a bare tent-only order shows just the cords stepper
// (extension_cords is trigger:'always'); chair_carts is always exactly ONE
// stepper no matter how many chair types are on the order. Never blocks
// "Complete Stop": the screen reads touched counts through the ref handle at
// completion time (runStopComplete) and upserts them fire-and-forget.
//
// "Touched" = the driver interacted with that stepper at all — a count stepped
// up and back to 0 still writes a row (an explicit "none left"), while an
// untouched stepper writes nothing. Counts draft to sessionStorage (checkoff
// pattern) so a back-out or the WO round trip doesn't lose them.
//
// Stepper visuals reuse the ItemCheckoffPanel pattern (44px StepBtn circles,
// Direction 03 Editorial tokens) for consistency with the check-off UI.

import { forwardRef, useImperativeHandle, useState } from 'react'
import type { Stop } from '@/types'
import {
  EQUIPMENT_RETURN_GROUPS,
  matchingEquipmentRules,
  type EquipmentReturnRule,
} from '@/lib/equipmentReturns/rules'
import {
  loadEquipmentReturnDraft,
  saveEquipmentReturnDraft,
  type EquipmentReturnEntry,
} from '@/lib/equipmentReturns/service'

// Tokens — mirror StopDetailScreen (Direction 03 Editorial).
const C = {
  blue:  '#0000FF',
  ink:   '#0A0B14',
  gold:  '#FFB800',
  muted: '#6B7488',
  paper: '#FFFFFF',
  off:   '#F4F6FA',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

export interface EquipmentReturnSectionHandle {
  // Rows to upsert — ONLY steppers the driver touched. Called by the screen's
  // completion chokepoint (runStopComplete).
  getTouchedEntries: () => EquipmentReturnEntry[]
}

interface EquipmentReturnSectionProps {
  stop: Stop
}

const EquipmentReturnSection = forwardRef<EquipmentReturnSectionHandle, EquipmentReturnSectionProps>(
  function EquipmentReturnSection({ stop }, ref) {
  const rules = matchingEquipmentRules(stop.items ?? [])

  // counts holds ONLY touched keys — presence is the "touched" flag.
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const draft = loadEquipmentReturnDraft(stop.stop_id)
    return draft?.counts ?? {}
  })

  useImperativeHandle(ref, () => ({
    getTouchedEntries() {
      // Guard against a stale draft key whose rule no longer matches (manifest
      // re-sync mid-stop) — only applicable rules produce rows.
      const applicable = new Set(rules.map((r) => r.key))
      return Object.entries(counts)
        .filter(([key]) => applicable.has(key))
        .map(([equipment_key, quantity]) => ({ equipment_key, quantity }))
    },
  }), [counts, rules])

  function step(key: string, delta: number) {
    setCounts((prev) => {
      const current = prev[key] ?? 0
      const next = { ...prev, [key]: Math.max(0, current + delta) }
      saveEquipmentReturnDraft(stop.stop_id, next)
      return next
    })
  }

  if (rules.length === 0) return null

  return (
    <div style={{ padding: '18px 18px 0', fontFamily: FONT_BODY, color: C.ink }}>
      <div style={{
        background: C.paper,
        border: `1.5px solid ${C.ink}`,
        borderRadius: 18,
        overflow: 'hidden',
      }}>
        {/* Header — gold accent band so the prompt reads as an ask, not a list. */}
        <div style={{
          background: 'rgba(255,184,0,0.14)',
          borderBottom: '1px solid rgba(255,184,0,0.45)',
          padding: '12px 16px',
        }}>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: C.ink,
          }}>
            Equipment left on-site
          </div>
          <div style={{ marginTop: 3, fontSize: 12, color: C.muted, lineHeight: 1.35 }}>
            Count what stays behind — the pickup crew sees exactly what to grab.
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
              {groupRules.map((rule) => (
                <StepperRow
                  key={rule.key}
                  rule={rule}
                  count={counts[rule.key] ?? 0}
                  touched={rule.key in counts}
                  onStep={(delta) => step(rule.key, delta)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
})

export default EquipmentReturnSection

// ─── Small pieces ────────────────────────────────────────────────────────────

function StepperRow({ rule, count, touched, onStep }: {
  rule: EquipmentReturnRule
  count: number
  touched: boolean
  onStep: (delta: number) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 16px 12px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
          {rule.label}
        </div>
        {!touched && (
          <div style={{ marginTop: 2, fontSize: 11.5, color: C.muted }}>
            Leave untouched if none
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <StepBtn label="−" onClick={() => onStep(-1)} disabled={count <= 0} />
        <div style={{
          minWidth: 34, textAlign: 'center',
          fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 900,
          fontVariantNumeric: 'tabular-nums',
          color: touched && count > 0 ? C.blue : C.ink,
        }}>
          {touched ? count : '—'}
        </div>
        <StepBtn label="+" onClick={() => onStep(+1)} />
      </div>
    </div>
  )
}

// Mirrors ItemCheckoffPanel's StepBtn (44px ink circle) at 40px — same
// interaction affordance, slightly tighter for a multi-row section.
function StepBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === '−' ? 'Decrease count' : 'Increase count'}
      style={{
        width: 40, height: 40, borderRadius: '50%',
        background: disabled ? 'rgba(10,11,20,0.06)' : C.ink,
        color: disabled ? C.muted : '#fff',
        border: 0, cursor: disabled ? 'default' : 'pointer',
        fontSize: 20, fontWeight: 800, lineHeight: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}
