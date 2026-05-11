'use client'

// ToolsOnlyHomeScreen
// ───────────────────
// Minimal Home variant for users whose only privilege is `tools_only`.
// They have no truck assignment, no pre-trip flow, no route list — just a
// greeting hero, a "This Week" card pointing at /schedule, and a
// placeholder section signaling that more is coming.
//
// 2026-05-11 — replaces the May-10 redirect that sent tools_only users to
// /tools. The Home tab is now visible in BottomNav for tools_only, and
// this screen is what they see when they tap it.

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import BottomNav from '@/components/BottomNav'
import { useAuth } from '@/hooks/useAuth'

const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function firstNameOf(displayName: string | null | undefined): string {
  if (!displayName) return 'there'
  const trimmed = displayName.trim()
  if (!trimmed) return 'there'
  return trimmed.split(/\s+/)[0]
}

export default function ToolsOnlyHomeScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const greeting = greetingFor(new Date().getHours())
  const firstName = firstNameOf(profile?.display_name)

  return (
    <div className="screen" style={{
      background: C.cream, fontFamily: FONT_BODY, color: C.ink,
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
    }}>
      {/* Hero */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '46px 22px 28px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <svg
          aria-hidden="true"
          width={180} height={180} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -16, top: -12,
            opacity: 0.22, transform: 'rotate(18deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', position: 'relative' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: C.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            <Image
              src="/ptr-mark.png"
              alt="PartyTime Rentals"
              width={64}
              height={64}
              style={{ width: '74%', height: '74%', objectFit: 'contain' }}
            />
          </div>
        </div>

        <div style={{
          marginTop: 22,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
          color: C.gold, textTransform: 'uppercase',
          position: 'relative',
        }}>
          PartyTime Tools
        </div>
        <div style={{
          marginTop: 6,
          fontFamily: FONT_DISPLAY,
          fontSize: 32, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: '#fff', position: 'relative',
        }}>
          {greeting}, {firstName}.
        </div>
      </div>

      {/* This Week card */}
      <div style={{ padding: '18px 16px 0' }}>
        <button
          type="button"
          onClick={() => router.push('/schedule')}
          style={{
            width: '100%', textAlign: 'left',
            background: C.paper,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 16,
            padding: '16px 18px',
            boxShadow: `5px 5px 0 ${C.gold}`,
            cursor: 'pointer',
            fontFamily: 'inherit', color: C.ink,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
            color: C.goldDeep, textTransform: 'uppercase',
          }}>
            This Week
          </div>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 900,
            lineHeight: 1.15, letterSpacing: '-0.02em',
          }}>
            Company schedule
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
            See the next 8 days of routes, stops, and drivers across the company.
          </div>
          <div style={{
            marginTop: 8,
            fontSize: 12, fontWeight: 700, color: C.blue,
          }}>
            Open week view →
          </div>
        </button>
      </div>

      {/* Placeholder */}
      <div style={{ padding: '20px 18px 24px', color: C.muted, fontSize: 12 }}>
        Notifications and work schedule coming soon.
      </div>

      <div style={{ flex: 1 }} />
      <BottomNav />
    </div>
  )
}
