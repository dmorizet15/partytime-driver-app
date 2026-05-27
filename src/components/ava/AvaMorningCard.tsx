'use client'

import { useEffect, useState } from 'react'
import type { UserProfile } from '@/types/auth'
import type { Stop }        from '@/types'
import { fetchPersonalStats }       from '@/lib/personalStatsClient'
import {
  countTentItems,
  getAlwaysCarryItems,
  getTriggeredItems,
  type DependencyMapRow,
} from '@/lib/ava/dependencyHits'
import AvaChecklistSheet from '@/components/ava/AvaChecklistSheet'
import AvaNotesReviewSheet from '@/components/ava/AvaNotesReviewSheet'
import {
  addressKey,
  fetchLatestNotesByAddress,
  type StopNoteRow,
} from '@/lib/ava/stopNotesClient'
import {
  getMorningMessage,
  type PersonalityPreference,
} from '@/lib/ava/getMorningMessage'

// AVA Tier 2 morning brief card — Home screen only, conditional render.
// Renders when AVA has at least one actionable signal:
//   - checklist hits > 0  (always 0 this session — dependency map not seeded)
//   - stats_enabled AND weekStopsCompleted > 0  (Joey default)
//   - ava_stop_notes match today's addresses  (always 0 this session — empty table)
// Returns null otherwise; zero real estate cost when AVA has nothing to say.

const COD_PAYMENT_STATES = new Set<string>(['cod'])

const C = {
  card:    '#1A1A1A',
  border:  'rgba(255,255,255,0.08)',
  text:    '#F4F6FA',
  muted:   '#8A94A6',
  blue:    '#0000FF',
  divider: 'rgba(255,255,255,0.10)',
  gold:    '#FFB800',
  ink:     '#0A0B14',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface AvaMorningCardProps {
  profile:   UserProfile
  dayStops:  Stop[]
  todayKey:  string  // YYYY-MM-DD — drives stable personality-variant selection
}

interface CardSignals {
  weekStopsCompleted: number | null  // null while loading; 0 once resolved with no data
  notesByAddress:     Map<string, StopNoteRow>
  alwaysItems:        DependencyMapRow[]
  triggeredItems:     DependencyMapRow[]
  loading:            boolean
}

export default function AvaMorningCard({ profile, dayStops, todayKey }: AvaMorningCardProps) {
  const [signals, setSignals] = useState<CardSignals>({
    weekStopsCompleted: null,
    notesByAddress:     new Map(),
    alwaysItems:        [],
    triggeredItems:     [],
    loading:            true,
  })
  const [checklistOpen,   setChecklistOpen]   = useState(false)
  const [notesReviewOpen, setNotesReviewOpen] = useState(false)

  // Fetch weekly stats (gated on opt-in), today's stop-note previews, and
  // the dependency-map rule sets in parallel. All fail open — a flaky
  // network just hides the corresponding sub-block; the card itself still
  // renders if any trigger remains.
  useEffect(() => {
    let cancelled = false
    const addressKeys = dayStops.map(addressKey).filter(Boolean)
    const allItems    = dayStops.flatMap((s) => s.items ?? [])

    const statsPromise = profile.stats_enabled
      ? fetchPersonalStats(profile.id).then((s) => s.weekStopsCompleted).catch(() => 0)
      : Promise.resolve(0)
    const notesPromise = fetchLatestNotesByAddress(addressKeys)
      .catch<Map<string, StopNoteRow>>(() => new Map())
    const alwaysPromise    = profile.checklist_enabled
      ? getAlwaysCarryItems().catch<DependencyMapRow[]>(() => [])
      : Promise.resolve<DependencyMapRow[]>([])
    const triggeredPromise = profile.checklist_enabled
      ? getTriggeredItems(allItems).catch<DependencyMapRow[]>(() => [])
      : Promise.resolve<DependencyMapRow[]>([])

    Promise.all([statsPromise, notesPromise, alwaysPromise, triggeredPromise]).then(
      ([weekStops, notesByAddress, alwaysItems, triggeredItems]) => {
        if (cancelled) return
        setSignals({
          weekStopsCompleted: weekStops,
          notesByAddress,
          alwaysItems,
          triggeredItems,
          loading:            false,
        })
      }
    )

    return () => { cancelled = true }
  }, [profile.id, profile.stats_enabled, profile.checklist_enabled, dayStops])

  // Derive surface conditions (all sync, no awaits).
  const allItems = dayStops.flatMap((s) => s.items ?? [])
  const tentCount     = countTentItems(allItems)
  const triggeredCount = new Set(signals.triggeredItems.map((r) => r.required_item)).size
  const checklistHits  = signals.alwaysItems.length + triggeredCount
  const codCount      = dayStops.filter(
    (s) => s.stop_type === 'delivery' && COD_PAYMENT_STATES.has(s.payment_state ?? '')
  ).length
  const stopCount     = dayStops.length

  const checklistOffered = profile.checklist_enabled && checklistHits > 0
  const showStats        = profile.stats_enabled && (signals.weekStopsCompleted ?? 0) > 0
  const notesCount       = signals.notesByAddress.size
  const showNotesNudge   = notesCount > 0

  // Trigger rule: render only when AVA has at least one thing to surface.
  // While the network is in flight, defer the gate to avoid a render+unmount
  // flicker for opted-in drivers whose stats haven't arrived yet.
  if (signals.loading && (profile.stats_enabled || true /* notes always queried */)) {
    return null
  }
  if (!checklistOffered && !showStats && !showNotesNudge) {
    return null
  }

  const preference: PersonalityPreference =
    profile.personality_preference === 'personality' ? 'personality' : 'direct'

  const message = getMorningMessage(
    preference,
    {
      stopCount,
      codCount,
      tentCount,
      hasWeatherFlag: false,  // WeatherFlagCard owns the weather signal display;
                              //   AVA's message stays neutral on weather for now.
    },
    profile.id,
    todayKey,
  )

  return (
    <>
    <div style={{ padding: '12px 18px 0' }}>
      <section
        aria-label="AVA morning brief"
        style={{
          background: C.card,
          color: C.text,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: '14px 16px 12px',
          boxShadow: '0 14px 28px -16px rgba(0,0,0,0.5)',
        }}
      >
        {/* Identity row: small AVA waveform + label */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <WaveformGlyph size={20} />
          <span style={{
            fontSize: 12, fontWeight: 800, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: C.text,
            fontFamily: FONT_DISPLAY,
          }}>
            AVA
          </span>
        </div>

        {/* Morning message — 1-2 sentences, personality-aware */}
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 15.5, lineHeight: 1.45, color: C.text,
          letterSpacing: '-0.005em',
        }}>
          {message}
        </p>

        {/* Notes nudge — AVA Remembers surface on the morning card. Tap the
            Gold CTA to open the review sheet (per-address preview, deep-link
            to each stop). Renders only when ≥1 stop has prior notes. */}
        {showNotesNudge && (
          <div style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'rgba(255,184,0,0.06)',
            border: '1px solid rgba(255,184,0,0.20)',
            borderRadius: 12,
          }}>
            <p style={{
              margin: 0, fontSize: 13.5, lineHeight: 1.4, color: C.text,
            }}>
              I have notes on <strong>{notesCount}</strong>{' '}
              {notesCount === 1 ? 'of your stops' : 'of your stops'} today.
              Tap to review before you head out.
            </p>
            <button
              type="button"
              onClick={() => setNotesReviewOpen(true)}
              style={{
                marginTop: 10,
                background: C.gold, color: C.ink,
                border: 0, borderRadius: 999,
                padding: '8px 16px', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 800,
                fontFamily: FONT_DISPLAY,
                letterSpacing: '0.02em',
              }}
            >
              Review stop notes →
            </button>
          </div>
        )}

        {/* Checklist offer — conditional on dependency-map hits. Tap opens
            the AvaChecklistSheet (always-carry + triggered manifest items).
            Reminder only — never gates the Gold CTA. */}
        {checklistOffered && (
          <div style={{
            marginTop: 12,
            padding: '12px 14px',
            background: 'rgba(255,184,0,0.08)',
            border: '1px solid rgba(255,184,0,0.25)',
            borderRadius: 12,
          }}>
            <p style={{
              margin: 0, fontSize: 13.5, lineHeight: 1.4, color: C.text,
            }}>
              I found <strong>{checklistHits}</strong>{' '}
              {checklistHits === 1 ? 'thing' : 'things'} to double-check before you leave.
            </p>
            <button
              type="button"
              onClick={() => setChecklistOpen(true)}
              style={{
                marginTop: 10,
                background: C.gold, color: C.ink,
                border: 0, borderRadius: 999,
                padding: '8px 16px', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 800,
                fontFamily: FONT_DISPLAY,
                letterSpacing: '0.02em',
              }}
            >
              Run through checklist →
            </button>
          </div>
        )}

        {/* Stats block — opt-in, divider above when shown */}
        {showStats && (
          <>
            <div style={{
              marginTop: 14, marginBottom: 10,
              height: 1, background: C.divider,
            }}/>
            <p style={{
              margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.4,
            }}>
              <strong style={{ fontWeight: 800 }}>{signals.weekStopsCompleted}</strong>{' '}
              {signals.weekStopsCompleted === 1 ? 'stop' : 'stops'} this week.
            </p>
          </>
        )}

        {/* Voice/Text toggle — non-functional this session. ElevenLabs wiring
            + real toggle behavior lands Session 5. */}
        <div style={{
          marginTop: 12,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              fontSize: 11, color: C.muted, fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            🎙 Voice · Text
          </span>
        </div>
      </section>
    </div>

    {checklistOpen && (
      <AvaChecklistSheet
        alwaysItems={signals.alwaysItems}
        triggeredItems={signals.triggeredItems}
        onClose={() => setChecklistOpen(false)}
      />
    )}

    {notesReviewOpen && (
      <AvaNotesReviewSheet
        dayStops={dayStops}
        notesByAddress={signals.notesByAddress}
        onClose={() => setNotesReviewOpen(false)}
      />
    )}
    </>
  )
}

// Inline non-interactive waveform — mirrors the visual of AvaChip (Tier 1)
// but at a smaller size, no tap target. Keeps AvaChip purely the header entry
// point so its behavior contract stays simple.
function WaveformGlyph({ size }: { size: number }) {
  const barHeight = Math.round(size * 0.6)
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: Math.round(size / 5),
        background: C.blue,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: 1.5, flexShrink: 0,
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="ava-wave-bar"
          style={{
            width: 1.5, height: barHeight,
            background: '#fff', borderRadius: 1,
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </span>
  )
}
