'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:  '#0000FF',
  gold:  '#FFB800',
  paper: '#FFFFFF',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// Hardcoded per design — wire to package.json or NEXT_PUBLIC_APP_VERSION when
// version tracking matters.
const APP_VERSION = '4.2'

// Auto-redirect delay (ms). Tap-anywhere shortcut bypasses the wait.
const SPLASH_HOLD_MS = 2000

// ─── Inline gold star ─────────────────────────────────────────────────────────
function StarIcon({ size = 32, color = C.gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill={color} aria-hidden="true">
      <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z"/>
    </svg>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SplashScreen() {
  const router = useRouter()
  const { user } = useAuth()

  // Keep the latest user value in a ref so the navigation callback doesn't
  // need to re-create when auth resolves — the splash timer keeps ticking.
  const userRef   = useRef(user)
  const navigated = useRef(false)
  useEffect(() => { userRef.current = user }, [user])

  const goNext = useCallback(() => {
    if (navigated.current) return
    navigated.current = true
    router.replace(userRef.current ? '/' : '/login')
  }, [router])

  // Auto-redirect after SPLASH_HOLD_MS
  useEffect(() => {
    const t = setTimeout(goNext, SPLASH_HOLD_MS)
    return () => clearTimeout(t)
  }, [goNext])

  return (
    <div
      onClick={goNext}
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: C.blue,
        color: '#fff',
        fontFamily: FONT_BODY,
        cursor: 'pointer',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── Decorative stars ─────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 60,  left:  28 }}>
        <StarIcon size={36} color={C.gold}/>
      </div>
      <div style={{ position: 'absolute', top: 132, right: 38 }}>
        <StarIcon size={26} color={C.gold}/>
      </div>

      {/* ── Decorative white dots (opacity 0.35) ─────────────────────────── */}
      <span aria-hidden="true" style={{
        position: 'absolute', top: 78, right: 70,
        width: 5, height: 5, borderRadius: '50%',
        background: '#fff', opacity: 0.35,
      }}/>
      <span aria-hidden="true" style={{
        position: 'absolute', top: '52%', right: 56,
        width: 5, height: 5, borderRadius: '50%',
        background: '#fff', opacity: 0.35,
      }}/>

      {/* ── Content block ────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        left: 28, right: 28,
        top: '38%',
        transform: 'translateY(-50%)',
      }}>
        {/* Eyebrow */}
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.32em',
          color: C.gold, textTransform: 'uppercase',
        }}>
          Work
        </div>

        {/* Headline — two-line composition */}
        <div style={{
          marginTop: 18,
          fontFamily: FONT_DISPLAY,
          fontSize: 64, fontWeight: 900,
          lineHeight: 0.92, letterSpacing: '-0.04em',
          color: '#fff',
        }}>
          Let&apos;s<br/>roll.
        </div>

        {/* Hairline gold rule — short, left-aligned */}
        <div
          aria-hidden="true"
          style={{
            marginTop: 26, marginBottom: 18,
            width: 80, height: 1,
            background: C.gold,
          }}
        />

        {/* Sub-copy with inline gold star */}
        <div style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.85)',
          lineHeight: 1.5,
          maxWidth: '32ch',
        }}>
          PartyTime{' '}
          <span style={{
            display: 'inline-flex', alignItems: 'center', verticalAlign: '-0.15em',
            margin: '0 1px',
          }}>
            <StarIcon size={12} color={C.gold}/>
          </span>
          {' '}field crew app. Built for the truck, the lot, and everywhere between.
        </div>
      </div>

      {/* ── PTR mark (bottom-left, 44×44) ────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        left: 22, bottom: 28,
        width: 44, height: 44, borderRadius: 11,
        background: C.paper,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/ptr-mark.png"
          alt="PartyTime Rentals"
          style={{ width: '74%', height: '74%', objectFit: 'contain' }}
        />
      </div>

      {/* ── Version label (bottom-right) ─────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        right: 22, bottom: 38,
        fontSize: 11, fontWeight: 700,
        color: 'rgba(255,255,255,0.85)',
        letterSpacing: '0.18em',
        fontVariantNumeric: 'tabular-nums',
      }}>
        v {APP_VERSION}
      </div>
    </div>
  )
}
