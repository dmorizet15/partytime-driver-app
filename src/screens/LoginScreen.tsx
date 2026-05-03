'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '../lib/auth'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  paper:    '#FFFFFF',
  gold:     '#FFB800',
  off:      '#F4F6FA',
  muted:    '#6B7488',
  coral:    '#FF5A3C',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Inline icons (matches home-screen pattern) ───────────────────────────────
function UserIcon({ size = 18, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 21a8 8 0 0 1 16 0"/>
    </svg>
  )
}

function LockIcon({ size = 18, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  )
}

function ArrowIcon({ size = 18, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  )
}

// ─── PTR brand mark — small white rounded square with PTR logo image ─────────
function BrandMark() {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10,
      background: C.paper,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <img
        src="/ptr-mark.png"
        alt="PartyTime Rentals"
        style={{ width: '74%', height: '74%', objectFit: 'contain' }}
      />
    </div>
  )
}

// ─── D3 field — off-white pill container with uppercase label + icon + input ──
interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'email' | 'password'
  autoComplete?: string
  icon: React.ReactNode
  inputMode?: 'text' | 'email'
}

function D3Field({ label, value, onChange, type = 'text', autoComplete, icon, inputMode }: FieldProps) {
  return (
    <div style={{ background: C.off, borderRadius: 16, padding: '12px 14px' }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.muted,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
        {icon}
        <input
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 'none',
            color: C.ink, fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
            minWidth: 0,
          }}
        />
      </div>
    </div>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await signIn(email, password)

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="screen" style={{ background: C.blue, fontFamily: FONT_BODY, color: '#fff' }}>
      {/* ── BLUE HERO ───────────────────────────────────────────────────────── */}
      <div style={{ padding: '60px 28px 40px', flexShrink: 0, position: 'relative' }}>
        {/* Brand row: PT★ mark + WORK eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark/>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.28em',
            color: C.gold, textTransform: 'uppercase',
          }}>
            Work
          </div>
        </div>

        {/* Headline */}
        <div style={{
          marginTop: 36,
          fontFamily: FONT_DISPLAY,
          fontSize: 44, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.035em',
          color: '#fff',
        }}>
          Hey<br/>there.
        </div>

        {/* Subhead */}
        <div style={{
          marginTop: 12,
          fontSize: 14.5, color: 'rgba(255,255,255,0.80)',
          maxWidth: 240, lineHeight: 1.4,
        }}>
          Sign in to see what today looks like.
        </div>
      </div>

      {/* ── CREAM/WHITE CARD PULLED UP OVER BLUE ────────────────────────────── */}
      <div style={{
        flex: 1, minHeight: 0,
        background: C.paper, color: C.ink,
        borderTopLeftRadius: 30, borderTopRightRadius: 30,
        padding: '26px 24px 24px',
        boxShadow: '0 -20px 40px rgba(0,0,255,0.18)',
        display: 'flex', flexDirection: 'column',
      }}>
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', gap: 14,
            minHeight: 0,
          }}
        >
          <D3Field
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            autoComplete="email"
            inputMode="email"
            icon={<UserIcon/>}
          />

          <D3Field
            label="Password"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="current-password"
            icon={<LockIcon/>}
          />

          {/* Inline coral error — small, transient */}
          {error && (
            <div
              role="alert"
              style={{
                fontSize: 12.5, fontWeight: 700, color: C.coral,
                paddingLeft: 4, marginTop: -4,
              }}
            >
              {error}
            </div>
          )}

          {/* Sign-in pill button — pushed to bottom */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 'auto',
              height: 58, borderRadius: 999,
              border: 0, cursor: loading ? 'default' : 'pointer',
              background: C.ink, color: '#fff',
              fontSize: 16, fontWeight: 800,
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 8px 0 24px',
              boxShadow: '0 14px 30px -10px rgba(10,11,20,0.45)',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 120ms ease',
            }}
          >
            <span>{loading ? 'Signing in…' : 'Sign in'}</span>
            <span style={{
              width: 42, height: 42, borderRadius: '50%',
              background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ArrowIcon size={18} color={C.ink}/>
            </span>
          </button>

          {/* Plain-text dispatcher fallback (no link) */}
          <div style={{
            marginTop: 4,
            textAlign: 'center',
            fontSize: 12, color: C.muted,
          }}>
            Contact your dispatcher.
          </div>
        </form>
      </div>
    </div>
  )
}
