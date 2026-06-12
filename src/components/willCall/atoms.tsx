'use client'

// Shared Will Call presentational atoms — StatePill + ProgressSteps, built to
// the locked WillCallMockup.jsx (docs/design-references/), app tokens.

import { STATE_PILL, WL, FONT_DISPLAY } from '@/lib/willCall/theme'
import type { WillCallStatus } from '@/lib/willCall/types'

export function StatePill({ status }: { status: WillCallStatus }) {
  const cfg = STATE_PILL[status] ?? { label: status, bg: '#f3f4f6', color: WL.muted }
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
      background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700,
    }}>
      {cfg.label}
    </span>
  )
}

const STEPS = ['Pending', 'Staged', 'Picked Up', 'Returned']
const STEP_IDX: Record<WillCallStatus, number> = {
  pending: 0, staged: 1, picked_up: 2, awaiting_return: 2, returned: 3,
}

export function ProgressSteps({ status }: { status: WillCallStatus }) {
  const idx = STEP_IDX[status] ?? 0
  const overdue = status === 'awaiting_return'
  return (
    <div style={{ background: WL.paper, padding: '14px 18px 10px', borderBottom: `1px solid ${WL.line}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'flex-start', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                background: i < idx ? WL.green
                  : i === idx ? (overdue && i === 2 ? WL.red : WL.blue)
                  : '#e5e7eb',
                color: '#fff', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 800,
                fontFamily: FONT_DISPLAY,
              }}>
                {i < idx ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff"
                       strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12l5 5L20 6"/>
                  </svg>
                ) : i + 1}
              </div>
              <div style={{
                fontSize: 10, fontWeight: i === idx ? 700 : 400, textAlign: 'center', marginTop: 3,
                color: i === idx ? (overdue && i === 2 ? WL.red : WL.blue)
                  : i < idx ? WL.green : WL.muted,
              }}>
                {s}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, background: i < idx ? WL.green : '#e5e7eb',
                margin: '10px 4px 0',
              }}/>
            )}
          </div>
        ))}
      </div>
      {overdue && (
        <div style={{
          marginTop: 8, background: WL.redTint, borderRadius: 8,
          padding: '6px 10px', fontSize: 12, color: WL.red, fontWeight: 700,
        }}>
          ⚠ Return overdue — contact customer
        </div>
      )}
    </div>
  )
}
