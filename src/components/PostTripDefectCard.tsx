// ─── PostTripDefectCard ──────────────────────────────────────────────────────
// Renders on Home AFTER route completion as an OPTIONAL post-trip defect
// report. Distinct from the pre-trip flow (which is hard-gated and lives in
// /inspection). Single-screen: category picker + severity toggle + description
// + submit. No certify checkbox, no progress dots, no summary screen.
//
// Lifecycle:
//   - Parent decides whether to render (route complete + not yet submitted today).
//   - On mount: idle state, "Report a defect" entry button.
//   - Tap entry → expanded form. Driver picks category, severity, types
//     description, taps Submit.
//   - On 200: card collapses to a "Reported" receipt for the rest of the
//     mounted lifetime (Home re-fetches submitted_today on next mount).
//   - On error: inline red banner, form stays open with values preserved.
//
// Schema dependency: migration 009. Card will surface a 500 error from the
// API until the migration is applied — see tasks/open-questions.md.

'use client'

import { useState } from 'react'

// ─── Direction 03 (Editorial) tokens — mirrors DayRouteSelectorScreen ────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFEFC2',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Categories — local copy ─────────────────────────────────────────────────
// Mirrors src/screens/InspectionScreen.tsx ALL_CATEGORIES + CATEGORY_LABELS.
// Kept in sync by review until extraction.
// TODO: extract to src/lib/defect-categories.ts when pre-trip stabilizes.
type CategoryKey =
  | 'service_brakes'
  | 'trailer_brake_connections'
  | 'parking_brake'
  | 'steering_mechanism'
  | 'lighting_devices'
  | 'tires'
  | 'horn'
  | 'windshield_wipers'
  | 'rear_vision_mirrors'
  | 'coupling_devices'
  | 'wheels_and_rims'
  | 'emergency_equipment'

const ALL_CATEGORIES: CategoryKey[] = [
  'service_brakes',
  'trailer_brake_connections',
  'parking_brake',
  'steering_mechanism',
  'lighting_devices',
  'tires',
  'horn',
  'windshield_wipers',
  'rear_vision_mirrors',
  'coupling_devices',
  'wheels_and_rims',
  'emergency_equipment',
]

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  service_brakes:             'Service brakes',
  trailer_brake_connections:  'Trailer brake connections',
  parking_brake:              'Parking brake',
  steering_mechanism:         'Steering mechanism',
  lighting_devices:           'Lighting devices and reflectors',
  tires:                      'Tires',
  horn:                       'Horn',
  windshield_wipers:          'Windshield wipers',
  rear_vision_mirrors:        'Rear-vision mirrors',
  coupling_devices:           'Coupling devices',
  wheels_and_rims:            'Wheels and rims',
  emergency_equipment:        'Emergency equipment',
}

// ─── Inline icons ────────────────────────────────────────────────────────────
function WrenchIcon({ size = 20, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 1 5.3 5.3L11 21H3v-8z"/>
      <path d="M16 8l-1 1"/>
    </svg>
  )
}

function CheckIcon({ size = 18, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6"/>
    </svg>
  )
}

function ChevronRightIcon({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18"/>
    </svg>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────
export interface PostTripDefectCardProps {
  truckId: string
}

type Severity = 'oos' | 'non_oos'

export default function PostTripDefectCard({ truckId }: PostTripDefectCardProps) {
  const [expanded,    setExpanded]    = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const [category,    setCategory]    = useState<CategoryKey | null>(null)
  const [severity,    setSeverity]    = useState<Severity | null>(null)
  const [description, setDescription] = useState('')

  // Receipt — collapsed-success state. Stays for the rest of the mounted
  // lifetime; Home's next mount re-fetches submitted_today and decides
  // whether to render this card at all.
  if (submitted) {
    return (
      <div style={{ padding: '12px 18px 0', fontFamily: FONT_BODY }}>
        <div
          role="status"
          aria-label="Post-trip defect reported"
          style={{
            width: '100%',
            background: C.ink,
            borderRadius: 18,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: C.green,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <CheckIcon size={22} color={C.ink}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              color: C.green, textTransform: 'uppercase',
            }}>
              Post-trip Reported
            </div>
            <div style={{
              marginTop: 2, fontSize: 15, fontWeight: 800, color: '#fff',
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
            }}>
              Thanks — dispatch has the defect.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Idle entry — designed stub matching the pre-trip Home card's visual weight.
  if (!expanded) {
    return (
      <div style={{ padding: '12px 18px 0', fontFamily: FONT_BODY }}>
        <button
          onClick={() => setExpanded(true)}
          style={{
            width: '100%',
            background: C.paper,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 18,
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
            boxShadow: `4px 4px 0 ${C.ink}`,
          }}
        >
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: C.coral,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <WrenchIcon size={20} color="#fff"/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              color: C.coral, textTransform: 'uppercase',
            }}>
              Optional
            </div>
            <div style={{
              marginTop: 2, fontSize: 15, fontWeight: 800, color: C.ink,
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
            }}>
              Report a post-trip defect
            </div>
          </div>
          <ChevronRightIcon size={18} color={C.muted}/>
        </button>
      </div>
    )
  }

  // Expanded — form
  const canSubmit = !submitting && category !== null && severity !== null && description.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/defects/post-trip', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          truck_id:    truckId,
          category,
          severity,
          description: description.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || `HTTP ${res.status}`)
      }
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit defect.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '12px 18px 0', fontFamily: FONT_BODY }}>
      <div style={{
        width: '100%',
        background: C.paper,
        border: `1.5px solid ${C.ink}`,
        borderRadius: 18,
        padding: '16px 16px 18px',
        boxShadow: `4px 4px 0 ${C.ink}`,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: C.coral,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <WrenchIcon size={18} color="#fff"/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              color: C.coral, textTransform: 'uppercase',
            }}>
              Post-trip defect
            </div>
            <div style={{
              marginTop: 2, fontSize: 16, fontWeight: 900, color: C.ink,
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
            }}>
              What did you notice?
            </div>
          </div>
          <button
            onClick={() => setExpanded(false)}
            disabled={submitting}
            aria-label="Cancel"
            style={{
              background: 'transparent', border: 0, padding: 4,
              fontSize: 13, fontWeight: 700, color: C.muted,
              cursor: submitting ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>

        {/* Category picker */}
        <label style={{
          display: 'block',
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: C.muted, textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Category
        </label>
        <select
          value={category ?? ''}
          onChange={(e) => setCategory(e.target.value ? (e.target.value as CategoryKey) : null)}
          disabled={submitting}
          style={{
            width: '100%',
            background: C.off,
            border: `1.5px solid rgba(10,11,20,0.10)`,
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 15, fontWeight: 600, color: C.ink,
            fontFamily: 'inherit',
            cursor: submitting ? 'default' : 'pointer',
            appearance: 'none',
          }}
        >
          <option value="" disabled>Select a category…</option>
          {ALL_CATEGORIES.map((k) => (
            <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>
          ))}
        </select>

        {/* Severity toggle */}
        <label style={{
          display: 'block',
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: C.muted, textTransform: 'uppercase',
          marginTop: 14, marginBottom: 6,
        }}>
          Severity
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => setSeverity('non_oos')}
            disabled={submitting}
            style={{
              flex: 1,
              background: severity === 'non_oos' ? C.ink : C.off,
              color:      severity === 'non_oos' ? '#fff' : C.ink,
              border: severity === 'non_oos' ? `1.5px solid ${C.ink}` : `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13, fontWeight: 800,
              fontFamily: 'inherit',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            Non-OOS
          </button>
          <button
            type="button"
            onClick={() => setSeverity('oos')}
            disabled={submitting}
            style={{
              flex: 1,
              background: severity === 'oos' ? C.coral : C.off,
              color:      severity === 'oos' ? '#fff' : C.ink,
              border: severity === 'oos' ? `1.5px solid ${C.coral}` : `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13, fontWeight: 800,
              fontFamily: 'inherit',
              cursor: submitting ? 'default' : 'pointer',
            }}
          >
            OOS
          </button>
        </div>

        {/* Description */}
        <label style={{
          display: 'block',
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: C.muted, textTransform: 'uppercase',
          marginTop: 14, marginBottom: 6,
        }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what you noticed…"
          disabled={submitting}
          rows={3}
          style={{
            width: '100%',
            background: C.off,
            border: `1.5px solid rgba(10,11,20,0.10)`,
            borderRadius: 12,
            padding: '12px 14px',
            fontSize: 14, color: C.ink,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 88,
          }}
        />

        {/* Inline error */}
        {error && (
          <div role="alert" style={{
            marginTop: 12,
            background: '#FFE4DF',
            border: `1.5px solid ${C.coral}`,
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: 13, fontWeight: 700, color: C.coral,
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            marginTop: 14,
            width: '100%', height: 52, borderRadius: 999,
            background: canSubmit ? C.gold : C.off,
            color:      canSubmit ? C.ink  : C.muted,
            border: 0,
            cursor: canSubmit ? 'pointer' : 'default',
            fontSize: 15, fontWeight: 900, fontFamily: FONT_DISPLAY,
            letterSpacing: '-0.01em',
            boxShadow: canSubmit ? '0 12px 24px -10px rgba(255,184,0,0.55)' : 'none',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit defect'}
        </button>
      </div>
    </div>
  )
}
