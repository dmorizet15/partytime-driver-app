'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  fetchCalendarConnection,
  startCalendarConnect,
  setCalendarSyncEnabled,
  disconnectCalendar,
  type ConnectionState,
  type CalendarConnectionStatus,
} from '@/lib/calendarSync/api'

// Self-serve Google Calendar sync on the Profile screen. Lets an employee connect
// their own Google Calendar, flip their WhenIWork-shift sync on/off, and
// disconnect — all against the dashboard's /api/calendar-sync/* routes (Bearer,
// cross-origin; see src/lib/calendarSync/api.ts). Styling mirrors
// AvaPreferencesSection so it reads as part of the same settings surface.

const C = {
  ink:      '#0A0B14',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  gold:     '#FFB800',
  blue:     '#0000FF',
  green:    '#1FBF6B',
  greenDeep:'#0F8C4D',
  greenSoft:'#E5F7ED',
  redSoft:  '#FEECEC',
  redDeep:  '#B91C1C',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

// Friendly copy for the ?reason= codes the OAuth callback / endpoints can return.
function reasonMessage(reason: string | null): string {
  switch (reason) {
    case 'no_wiw_link':
      return 'Your account isn’t linked to WhenIWork yet. Ask your manager to link it, then try again.'
    case 'not_configured':
      return 'Calendar sync isn’t set up yet — please contact your manager.'
    case 'no_refresh_token':
      return 'Google didn’t finish the connection. Please try connecting again.'
    case 'access_denied':
      return 'You declined the Google permission. Connect again and tap Allow to sync your shifts.'
    default:
      return 'Couldn’t connect to Google — please try again.'
  }
}

// Read (and clear) the ?calendar_sync=connected|error&reason= params the callback
// appended. Reading window.location avoids a useSearchParams Suspense boundary.
function readReturnParams(): { outcome: 'connected' | 'error' | null; reason: string | null } {
  if (typeof window === 'undefined') return { outcome: null, reason: null }
  const params = new URLSearchParams(window.location.search)
  const raw = params.get('calendar_sync')
  const outcome = raw === 'connected' ? 'connected' : raw === 'error' ? 'error' : null
  const reason = params.get('reason')
  if (outcome) {
    // Strip our params so a refresh doesn't re-toast.
    params.delete('calendar_sync')
    params.delete('reason')
    const qs = params.toString()
    const clean = window.location.pathname + (qs ? `?${qs}` : '')
    window.history.replaceState(null, '', clean)
  }
  return { outcome, reason }
}

type Banner = { tone: 'ok' | 'err'; text: string }

export default function CalendarSyncSection() {
  const [state, setState] = useState<ConnectionState | null>(null) // null = loading
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'toggle' | 'disconnect' | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)

  const load = useCallback(async () => {
    try {
      setLoadError(null)
      const next = await fetchCalendarConnection()
      setState(next)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Couldn’t load calendar sync status.')
      setState({ kind: 'not_connected' }) // let the user still try to connect
    }
  }, [])

  // On mount: surface any OAuth return outcome, then load current status.
  useEffect(() => {
    const { outcome, reason } = readReturnParams()
    if (outcome === 'connected') setBanner({ tone: 'ok', text: 'Google Calendar connected — your WhenIWork shifts will sync.' })
    else if (outcome === 'error') setBanner({ tone: 'err', text: reasonMessage(reason) })
    void load()
  }, [load])

  // Auto-dismiss the banner.
  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(null), 5000)
    return () => clearTimeout(t)
  }, [banner])

  async function onConnect() {
    setBusy('connect')
    setBanner(null)
    try {
      const authUrl = await startCalendarConnect('/profile')
      window.location.href = authUrl // hand off to Google's consent screen
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'error'
      setBanner({ tone: 'err', text: msg === 'no_wiw_link' ? reasonMessage('no_wiw_link') : reasonMessage(null) })
      setBusy(null)
    }
  }

  async function onToggle(next: boolean) {
    if (state?.kind !== 'connected') return
    const prev = state.status
    // Optimistic flip.
    setState({ kind: 'connected', status: { ...prev, enabled: next } })
    setBusy('toggle')
    try {
      const updated = await setCalendarSyncEnabled(next)
      if (updated) setState({ kind: 'connected', status: updated })
    } catch {
      setState({ kind: 'connected', status: prev }) // revert
      setBanner({ tone: 'err', text: 'Couldn’t change the setting — please try again.' })
    } finally {
      setBusy(null)
    }
  }

  async function onDisconnect() {
    if (typeof window !== 'undefined' &&
      !window.confirm('Disconnect Google Calendar? Your WhenIWork shifts will stop syncing.')) {
      return
    }
    setBusy('disconnect')
    try {
      await disconnectCalendar()
      setState({ kind: 'not_connected' })
      setBanner({ tone: 'ok', text: 'Disconnected. Your shifts will no longer sync to Google Calendar.' })
    } catch {
      setBanner({ tone: 'err', text: 'Couldn’t disconnect — please try again.' })
    } finally {
      setBusy(null)
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
        Calendar Sync
      </div>

      <div style={{ padding: '0 18px' }}>
        {banner && (
          <div
            role="status"
            style={{
              marginBottom: 12,
              background: banner.tone === 'ok' ? C.greenSoft : C.redSoft,
              border: `1.5px solid ${banner.tone === 'ok' ? C.greenDeep : C.redDeep}`,
              borderLeft: `5px solid ${banner.tone === 'ok' ? C.green : '#DC2626'}`,
              borderRadius: 14,
              padding: '12px 14px',
              color: banner.tone === 'ok' ? '#0B5233' : '#7F1D1D',
              fontWeight: 700, fontSize: 13.5, lineHeight: 1.4,
            }}
          >
            {banner.text}
          </div>
        )}

        <div style={{
          background: C.paper,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          {state === null ? (
            <RowShell>
              <div style={{ fontSize: 13.5, color: C.muted }}>Loading…</div>
            </RowShell>
          ) : state.kind === 'no_wiw_link' ? (
            <RowShell>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
                Not linked to WhenIWork
              </div>
              <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted, lineHeight: 1.4 }}>
                Your account isn’t linked to a WhenIWork profile yet, so there are no shifts to
                sync. Ask your manager to link it, then come back here to connect.
              </div>
            </RowShell>
          ) : state.kind === 'not_connected' ? (
            <RowShell>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
                Sync your shifts to Google Calendar
              </div>
              <div style={{ marginTop: 4, marginBottom: 14, fontSize: 12.5, color: C.muted, lineHeight: 1.45 }}>
                Connect your Google Calendar and your WhenIWork shifts show up automatically as
                “Busy” — so you don’t get booked over. You can turn it off anytime.
              </div>
              {loadError && (
                <div style={{ marginBottom: 12, fontSize: 12, color: C.redDeep }}>{loadError}</div>
              )}
              <ConnectButton onClick={onConnect} busy={busy === 'connect'} />
            </RowShell>
          ) : (
            <ConnectedRows
              status={state.status}
              busy={busy}
              onToggle={onToggle}
              onDisconnect={onDisconnect}
            />
          )}
        </div>
      </div>
    </>
  )
}

function RowShell({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '16px 16px' }}>{children}</div>
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(10,11,20,0.08)' }} />
}

function ConnectedRows({
  status, busy, onToggle, onDisconnect,
}: {
  status: CalendarConnectionStatus
  busy: 'connect' | 'toggle' | 'disconnect' | null
  onToggle: (next: boolean) => void
  onDisconnect: () => void
}) {
  return (
    <>
      <div style={{
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink, lineHeight: 1.3 }}>
            Sync my WhenIWork shifts
          </div>
          <div style={{
            marginTop: 3, fontSize: 12.5, color: C.muted, lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Connected as {status.google_email}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <ToggleSwitch
            on={status.enabled}
            disabled={busy === 'toggle'}
            ariaLabel="Sync my WhenIWork shifts"
            onToggle={() => onToggle(!status.enabled)}
          />
        </div>
      </div>

      {status.last_error && (
        <>
          <Divider />
          <div style={{ padding: '12px 16px', fontSize: 12.5, color: C.redDeep, lineHeight: 1.4 }}>
            Last sync had a problem. If your shifts stop appearing, disconnect and connect again.
          </div>
        </>
      )}

      <Divider />

      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy === 'disconnect'}
          style={{
            background: 'transparent',
            border: 0,
            padding: '6px 4px',
            color: C.redDeep,
            fontFamily: FONT_DISPLAY,
            fontSize: 12.5, fontWeight: 800, letterSpacing: '0.02em',
            cursor: busy === 'disconnect' ? 'default' : 'pointer',
            opacity: busy === 'disconnect' ? 0.6 : 1,
          }}
        >
          {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </>
  )
}

function ConnectButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        background: C.ink,
        color: '#fff',
        border: 0, borderRadius: 12,
        padding: '13px 18px',
        fontFamily: FONT_DISPLAY,
        fontSize: 14, fontWeight: 800, letterSpacing: '0.01em',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.7 : 1,
        width: '100%', justifyContent: 'center',
      }}
    >
      <GoogleGlyph />
      {busy ? 'Opening Google…' : 'Connect Google Calendar'}
    </button>
  )
}

// The Google "G" mark, drawn inline (no external asset, CSP-safe).
function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + 8, height: size + 8, borderRadius: '50%', background: '#fff', flexShrink: 0,
    }}>
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
    </span>
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
