'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import AvaDispatchNotesSheet from '@/components/ava/AvaDispatchNotesSheet'
import {
  addressKey,
  fetchLatestNotesByAddress,
  type StopNoteRow,
} from '@/lib/ava/stopNotesClient'
import {
  getMorningMessage,
  type PersonalityPreference,
} from '@/lib/ava/getMorningMessage'
import { speak, stopSpeaking } from '@/lib/ava/elevenLabs'

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
  profile:             UserProfile
  dayStops:            Stop[]
  todayKey:            string  // YYYY-MM-DD — drives stable personality-variant selection
  routeDispatcherNote: string | null  // routes.dispatcher_notes for the active route
  hasWeatherFlag?:     boolean  // ≥1 stop forecast above the wind threshold at arrival
}

interface CardSignals {
  weekStopsCompleted: number | null  // null while loading; 0 once resolved with no data
  notesByAddress:     Map<string, StopNoteRow>
  alwaysItems:        DependencyMapRow[]
  triggeredItems:     DependencyMapRow[]
  loading:            boolean
}

export default function AvaMorningCard({ profile, dayStops, todayKey, routeDispatcherNote, hasWeatherFlag = false }: AvaMorningCardProps) {
  const [signals, setSignals] = useState<CardSignals>({
    weekStopsCompleted: null,
    notesByAddress:     new Map(),
    alwaysItems:        [],
    triggeredItems:     [],
    loading:            true,
  })
  const [checklistOpen,    setChecklistOpen]    = useState(false)
  const [notesReviewOpen,  setNotesReviewOpen]  = useState(false)
  const [dispatchNotesOpen, setDispatchNotesOpen] = useState(false)
  // Voice/text mode — session-only, defaults to voice. Resets to voice
  // on every fresh card mount; no persistence to DB this session.
  const [voiceMode,   setVoiceMode]   = useState(true)
  const [isSpeaking,  setIsSpeaking]  = useState(false)
  // Tracks the latest play attempt so a stale finally() from an interrupted
  // speak() can't clobber isSpeaking after a fresh speak() has started.
  const playTokenRef = useRef(0)

  // Customer stops only — warehouse_return / warehouse depot stops are not
  // part of the driver's delivery work and must not inflate stop counts,
  // COD counts, the tent tally, or note lookups. Depot stops carry no
  // customer manifest today, but filtering defensively keeps every count
  // honest if that ever changes.
  const customerStops = useMemo(
    () => dayStops.filter(
      (s) => s.stop_type !== 'warehouse_return' && s.stop_type !== 'warehouse'
    ),
    [dayStops],
  )

  // Customer stops carrying a stop-level dispatcher note — drives the
  // morning-card count line + read-only review sheet (Component 2).
  const stopsWithDispatchNotes = useMemo(
    () => customerStops.filter((s) => s.dispatcher_notes && s.dispatcher_notes.trim().length > 0),
    [customerStops],
  )

  // Fetch weekly stats (gated on opt-in), today's stop-note previews, and
  // the dependency-map rule sets in parallel. All fail open — a flaky
  // network just hides the corresponding sub-block; the card itself still
  // renders if any trigger remains.
  useEffect(() => {
    let cancelled = false
    const addressKeys = customerStops.map(addressKey).filter(Boolean)
    const allItems    = customerStops.flatMap((s) => s.items ?? [])

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
  }, [profile.id, profile.stats_enabled, profile.checklist_enabled, customerStops])

  // Derive surface conditions (all sync, no awaits). All counts run over
  // customerStops so depot stops never inflate them.
  const allItems = customerStops.flatMap((s) => s.items ?? [])
  const tentCount     = countTentItems(allItems)
  const triggeredCount = new Set(signals.triggeredItems.map((r) => r.required_item)).size
  const checklistHits  = signals.alwaysItems.length + triggeredCount
  const codCount      = customerStops.filter(
    (s) => s.stop_type === 'delivery' && COD_PAYMENT_STATES.has(s.payment_state ?? '')
  ).length
  const stopCount     = customerStops.length

  // Card-visibility triggers. Each is independent — the card renders if ANY
  // is true (see the early-return gate below). checklist_enabled gates only
  // its own offer block, never the card; stats_enabled shows the stats block
  // whenever opted in (zero state handles a slow day / Monday morning), so an
  // opted-in driver always sees the card even with 0 stops and checklist off.
  const checklistOffered = profile.checklist_enabled && checklistHits > 0
  const showStats        = profile.stats_enabled
  const notesCount       = signals.notesByAddress.size
  const showNotesNudge   = notesCount > 0
  const routeNote          = routeDispatcherNote?.trim() ? routeDispatcherNote.trim() : null
  const dispatchNotesCount = stopsWithDispatchNotes.length

  const preference: PersonalityPreference =
    profile.personality_preference === 'personality' ? 'personality' : 'direct'

  const message = getMorningMessage(
    preference,
    {
      stopCount,
      codCount,
      tentCount,
      hasWeatherFlag,  // AVA Phase 2: ≥1 stop forecast above the wind threshold
                       //   at arrival (from useRouteWeather → /api/ava/route-weather).
                       //   Adds the wind-advisory line to the brief copy.
    },
    profile.id,
    todayKey,
  )

  // No auto-speak on mount — iOS Safari blocks AudioContext.start() before
  // the user gestures in the same task, so an effect-triggered speak() falls
  // through to the WebSpeech synth (robotic) on first Home load. Instead,
  // we render a "▶ Hear your morning brief" tap button below the message;
  // the driver's tap is a real user gesture, so ElevenLabs unlocks cleanly.
  // The cleanup effect below still cancels any in-flight audio on unmount.
  useEffect(() => {
    return () => { stopSpeaking() }
  }, [])

  const handlePlayBrief = useCallback(() => {
    // Cancel any prior playback (e.g. driver double-taps the button) and
    // bump the token so the previous speak()'s .finally can't flip
    // isSpeaking back to false after the new attempt has started.
    stopSpeaking()
    const myToken = ++playTokenRef.current
    setIsSpeaking(true)
    const spoken = routeNote ? `From dispatch: ${routeNote}. ${message}` : message
    speak(spoken).finally(() => {
      if (playTokenRef.current === myToken) setIsSpeaking(false)
    })
  }, [message, routeNote])

  // Trigger rule: render only when AVA has at least one thing to surface.
  // While the network is in flight, defer the gate to avoid a render+unmount
  // flicker for opted-in drivers whose stats haven't arrived yet.
  if (signals.loading && (profile.stats_enabled || true /* notes always queried */)) {
    return null
  }
  if (!checklistOffered && !showStats && !showNotesNudge && !routeNote && dispatchNotesCount === 0) {
    return null
  }

  const handleToggle = (next: boolean) => {
    if (next === voiceMode) return
    // Switching away from voice mid-playback → cancel speech immediately.
    if (voiceMode && !next) {
      stopSpeaking()
      playTokenRef.current++  // invalidate any in-flight finally
      setIsSpeaking(false)
    }
    setVoiceMode(next)
  }

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

        {/* FROM DISPATCH — route-level dispatcher note. First content block;
            AVA speaks it first (see handlePlayBrief). Amber treatment adapted
            to this dark card (same family as the checklist/notes blocks). */}
        {routeNote && (
          <div style={{
            marginTop: 12,
            padding: '11px 14px',
            background: 'rgba(255,184,0,0.12)',
            border: '1px solid rgba(255,184,0,0.35)',
            borderRadius: 12,
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: C.gold,
              fontFamily: FONT_DISPLAY,
            }}>
              From Dispatch
            </div>
            <p style={{
              margin: '6px 0 0', fontSize: 14, lineHeight: 1.45, color: C.text,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {routeNote}
            </p>
          </div>
        )}

        {/* Stop-level dispatcher notes count — tap to review each one. */}
        {dispatchNotesCount > 0 && (
          <button
            type="button"
            onClick={() => setDispatchNotesOpen(true)}
            style={{
              marginTop: 12, width: '100%', textAlign: 'left',
              padding: '11px 14px',
              background: 'rgba(255,184,0,0.06)',
              border: '1px solid rgba(255,184,0,0.20)',
              borderRadius: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              fontFamily: 'inherit',
            }}
            aria-label="Review stops with notes from dispatch"
          >
            <span style={{ fontSize: 13.5, lineHeight: 1.4, color: C.text }}>
              <strong>{dispatchNotesCount}</strong> of your stops{' '}
              {dispatchNotesCount === 1 ? 'has a note' : 'have notes'} from dispatch.
              I&rsquo;ll remind you on the way to each one.
            </span>
            <span aria-hidden="true" style={{ color: C.gold, fontSize: 16, lineHeight: 1 }}>›</span>
          </button>
        )}

        {/* Morning message — 1-2 sentences, personality-aware */}
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 15.5, lineHeight: 1.45, color: C.text,
          letterSpacing: '-0.005em',
        }}>
          {message}
        </p>

        {/* Play button — only visible in voice mode. Tap fires speak() under
            a real user gesture, so iOS Safari's AudioContext autoplay lock
            unlocks and ElevenLabs plays in full (not the WebSpeech fallback).
            Hidden while speaking so it doesn't compete with the indicator. */}
        {voiceMode && !isSpeaking && (
          <button
            type="button"
            onClick={handlePlayBrief}
            aria-label="Hear your morning brief"
            style={{
              marginTop: 12,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,184,0,0.10)',
              color: C.gold,
              border: '1px solid rgba(255,184,0,0.35)',
              borderRadius: 999,
              padding: '7px 14px 7px 12px',
              cursor: 'pointer',
              fontFamily: FONT_DISPLAY,
              fontSize: 12.5, fontWeight: 800,
              letterSpacing: '0.04em',
            }}
          >
            <span aria-hidden="true" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: '50%',
              background: C.gold, color: C.ink,
              fontSize: 10, fontWeight: 900,
            }}>▶</span>
            <span>HEAR YOUR MORNING BRIEF</span>
          </button>
        )}

        {/* Speaking indicator — small pulsing waveform + label while TTS
            audio is in flight. Disappears on speak completion or stopSpeaking(). */}
        {isSpeaking && (
          <div style={{
            marginTop: 8,
            display: 'flex', alignItems: 'center', gap: 6,
            color: C.muted, fontSize: 12, fontWeight: 600,
            letterSpacing: '0.02em',
          }}>
            <span aria-hidden="true" style={{
              display: 'inline-flex', alignItems: 'center', gap: 1.5, height: 12,
            }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="ava-wave-bar"
                  style={{
                    width: 1.5, height: 8,
                    background: C.muted, borderRadius: 1,
                    animationDelay: `${i * 120}ms`,
                  }}
                />
              ))}
            </span>
            <span>AVA is speaking…</span>
          </div>
        )}

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

        {/* Stats block — opt-in, divider above when shown. Always renders when
            stats_enabled (count is resolved by the time the card paints — the
            loading gate above defers render). Zero state on a slow day so the
            block never vanishes for a driver who opted in to see it. */}
        {showStats && (
          <>
            <div style={{
              marginTop: 14, marginBottom: 10,
              height: 1, background: C.divider,
            }}/>
            <p style={{
              margin: 0, fontSize: 13.5, color: C.text, lineHeight: 1.4,
            }}>
              {(signals.weekStopsCompleted ?? 0) > 0 ? (
                <>
                  <strong style={{ fontWeight: 800 }}>{signals.weekStopsCompleted}</strong>{' '}
                  {signals.weekStopsCompleted === 1 ? 'stop' : 'stops'} this week.
                </>
              ) : (
                <span style={{ color: C.muted }}>No stops completed yet this week.</span>
              )}
            </p>
          </>
        )}

        {/* Voice/Text toggle — session-only state. Default voice; tap Text to
            silence TTS (cancels any in-progress audio). Switching back to
            Voice does NOT re-speak — the hasSpokenRef guard ensures auto-
            speak only fires once per card mount. */}
        <div style={{
          marginTop: 12,
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            border: `1px solid ${C.border}`,
            borderRadius: 999,
            padding: 2,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <button
              type="button"
              onClick={() => handleToggle(true)}
              aria-pressed={voiceMode}
              style={{
                background: voiceMode ? C.gold : 'transparent',
                color: voiceMode ? C.ink : C.muted,
                border: 0, cursor: 'pointer',
                padding: '4px 12px', borderRadius: 999,
                fontSize: 11, fontWeight: 800,
                letterSpacing: '0.04em',
                fontFamily: FONT_DISPLAY,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span aria-hidden="true">🎙</span>
              VOICE
            </button>
            <button
              type="button"
              onClick={() => handleToggle(false)}
              aria-pressed={!voiceMode}
              style={{
                background: !voiceMode ? C.gold : 'transparent',
                color: !voiceMode ? C.ink : C.muted,
                border: 0, cursor: 'pointer',
                padding: '4px 12px', borderRadius: 999,
                fontSize: 11, fontWeight: 800,
                letterSpacing: '0.04em',
                fontFamily: FONT_DISPLAY,
              }}
            >
              TEXT
            </button>
          </div>
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

    {dispatchNotesOpen && (
      <AvaDispatchNotesSheet
        stops={stopsWithDispatchNotes}
        onClose={() => setDispatchNotesOpen(false)}
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
