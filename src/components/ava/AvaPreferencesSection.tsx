'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { UserProfile } from '@/types/auth'

// AVA preference controls on the Profile screen. Three driver-self-service
// opt-ins backed by columns on profiles:
//   checklist_enabled      — Morning checklist toggle
//   personality_preference — AVA voice style (Direct | Personality)
//   stats_enabled          — Weekly stats toggle
//
// Writes go through PATCH /api/profile/ava-preferences (admin client server-
// side) because profiles has no RLS UPDATE policy. UI updates optimistically
// via AuthContext.updateProfile so the morning card reflects the change with
// no logout; on a failed write we revert and surface a toast.

const C = {
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

type PrefColumn = 'checklist_enabled' | 'personality_preference' | 'stats_enabled'

export default function AvaPreferencesSection() {
  const { profile, updateProfile } = useAuth()
  const [saving, setSaving] = useState<PrefColumn | null>(null)
  const [toast,  setToast]  = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  if (!profile) return null

  // Optimistic write: flip the in-memory profile, PATCH the server, revert on
  // failure. `patch` carries exactly one column per call.
  async function persist(patch: Partial<UserProfile>, column: PrefColumn, prevValue: UserProfile[PrefColumn]) {
    updateProfile(patch)
    setSaving(column)
    try {
      const res = await fetch('/api/profile/ava-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      console.warn('[AvaPreferences] save failed:', err instanceof Error ? err.message : err)
      updateProfile({ [column]: prevValue } as Partial<UserProfile>)
      setToast('Couldn’t save preference — try again')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <div style={{
        padding: '24px 22px 10px',
        fontFamily: FONT_DISPLAY,
        fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: C.muted,
      }}>
        AVA Preferences
      </div>

      <div style={{ padding: '0 18px' }}>
        {toast && (
          <div
            role="status"
            style={{
              marginBottom: 12,
              background: '#FEECEC',
              border: '1.5px solid #B91C1C',
              borderLeft: '5px solid #DC2626',
              borderRadius: 14,
              padding: '12px 14px',
              color: '#7F1D1D',
              fontWeight: 700, fontSize: 13.5, lineHeight: 1.4,
            }}
          >
            {toast}
          </div>
        )}

        <div style={{
          background: C.paper,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {/* Morning checklist */}
          <PrefRow
            label="Morning checklist"
            sublabel="AVA reminds you what to load before each route"
            control={
              <ToggleSwitch
                on={profile.checklist_enabled}
                disabled={saving === 'checklist_enabled'}
                ariaLabel="Morning checklist"
                onToggle={() => persist(
                  { checklist_enabled: !profile.checklist_enabled },
                  'checklist_enabled',
                  profile.checklist_enabled,
                )}
              />
            }
          />

          <Divider />

          {/* AVA voice style */}
          <PrefRow
            label="AVA voice style"
            sublabel="Direct: just the facts. Personality: a little more human."
            control={
              <Segmented
                value={profile.personality_preference}
                disabled={saving === 'personality_preference'}
                onChange={(next) => {
                  if (next === profile.personality_preference) return
                  persist(
                    { personality_preference: next },
                    'personality_preference',
                    profile.personality_preference,
                  )
                }}
              />
            }
            stack
          />

          <Divider />

          {/* Weekly stats */}
          <PrefRow
            label="Weekly stats"
            sublabel="See your stop count and performance in the morning brief"
            control={
              <ToggleSwitch
                on={profile.stats_enabled}
                disabled={saving === 'stats_enabled'}
                ariaLabel="Weekly stats"
                onToggle={() => persist(
                  { stats_enabled: !profile.stats_enabled },
                  'stats_enabled',
                  profile.stats_enabled,
                )}
              />
            }
          />
        </div>
      </div>
    </>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(10,11,20,0.08)' }} />
}

// A single preference row: label + sublabel on the left, control on the right.
// `stack` puts the control on its own line below the text (used by the wider
// segmented control so it never crowds the labels).
function PrefRow({
  label, sublabel, control, stack = false,
}: {
  label: string
  sublabel: string
  control: React.ReactNode
  stack?: boolean
}) {
  return (
    <div style={{
      padding: '14px 16px',
      display: 'flex',
      flexDirection: stack ? 'column' : 'row',
      alignItems: stack ? 'stretch' : 'center',
      justifyContent: 'space-between',
      gap: stack ? 12 : 14,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
          {label}
        </div>
        <div style={{ marginTop: 3, fontSize: 12.5, color: C.muted, lineHeight: 1.4 }}>
          {sublabel}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  )
}

function ToggleSwitch({
  on, onToggle, disabled, ariaLabel,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: 48, height: 28, borderRadius: 999,
        border: 0, padding: 2,
        background: on ? C.gold : '#D4D8E0',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        position: 'relative',
        transition: 'background 160ms ease',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'block',
          width: 24, height: 24, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transform: on ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 160ms ease',
        }}
      />
    </button>
  )
}

function Segmented({
  value, onChange, disabled,
}: {
  value: 'direct' | 'personality'
  onChange: (next: 'direct' | 'personality') => void
  disabled?: boolean
}) {
  const options: Array<{ key: 'direct' | 'personality'; label: string }> = [
    { key: 'direct',      label: 'Direct' },
    { key: 'personality', label: 'Personality' },
  ]
  return (
    <div style={{
      display: 'flex',
      background: C.off,
      border: `1px solid rgba(10,11,20,0.12)`,
      borderRadius: 999,
      padding: 3,
      gap: 3,
      opacity: disabled ? 0.6 : 1,
    }}>
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.key)}
            style={{
              flex: 1,
              background: active ? C.gold : 'transparent',
              color: active ? C.ink : C.muted,
              border: 0, borderRadius: 999,
              padding: '8px 14px',
              cursor: disabled ? 'default' : 'pointer',
              fontFamily: FONT_DISPLAY,
              fontSize: 12.5, fontWeight: 800,
              letterSpacing: '0.02em',
              transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
