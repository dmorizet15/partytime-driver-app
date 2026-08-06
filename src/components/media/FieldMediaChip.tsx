'use client'

import { useSyncExternalStore } from 'react'
import {
  cancelActiveFieldMedia,
  getFieldMediaServerStatus,
  getFieldMediaStatus,
  subscribeFieldMedia,
} from '@/lib/fieldMedia/service'
import { formatBytes } from '@/lib/fieldMedia/config'

// ─── Field media upload chip ─────────────────────────────────────────────────
// Mounted app-wide in the root layout beside <PwaUpdater/>, NOT on a screen —
// the whole point is that a clip keeps uploading while the driver walks to the
// truck and opens the next stop, and the App Router unmounts screens on
// navigation.
//
// It reads a module-level store rather than AppStateContext so a progress tick
// re-renders this pill and nothing else.
//
// Renders null when there is nothing in flight and nothing waiting, so it
// costs a driver who never uses the feature exactly one mounted component that
// returns null.

const FONT_BODY = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

export default function FieldMediaChip() {
  const status = useSyncExternalStore(
    subscribeFieldMedia,
    getFieldMediaStatus,
    getFieldMediaServerStatus,
  )

  const { active, queued, lastError } = status
  if (!active && queued === 0 && !lastError) return null

  const pct = active?.progress !== null && active?.progress !== undefined
    ? Math.round(active.progress * 100)
    : null

  const label = active
    ? `Sending ${active.mediaType === 'video' ? 'clip' : 'photo'} · ${formatBytes(active.byteSize)}${pct !== null ? ` · ${pct}%` : ''}`
    : lastError
      ? lastError
      : `${queued} waiting to send`

  return (
    <div
      style={{
        position: 'fixed',
        left: 12, right: 12,
        bottom: 'calc(88px + env(safe-area-inset-bottom))',
        maxWidth: 424, margin: '0 auto',
        zIndex: 150,
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#0F172A',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 999,
        padding: '9px 8px 9px 14px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        fontFamily: FONT_BODY,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: '#E2E8F0',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        {active && pct !== null && (
          <div style={{
            marginTop: 5, height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,0.12)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${pct}%`, height: '100%', background: '#FFB800',
              transition: 'width 240ms linear',
            }}/>
          </div>
        )}
      </div>

      {active && (
        <button
          onClick={() => { void cancelActiveFieldMedia() }}
          style={{
            flexShrink: 0, background: 'rgba(255,255,255,0.08)',
            border: 'none', borderRadius: 999, color: '#CBD5E1',
            fontSize: 11.5, fontWeight: 700, padding: '7px 14px', cursor: 'pointer',
            fontFamily: FONT_BODY,
          }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}
