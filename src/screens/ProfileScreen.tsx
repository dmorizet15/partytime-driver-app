'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { signOut } from '@/lib/auth'
import type { Role } from '@/types/auth'
import Image from 'next/image'
import BottomNav from '@/components/BottomNav'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFF6DB',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  green:    '#1FBF6B',
  greenDeep:'#0F8C4D',
  greenSoft:'#E5F7ED',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Inline icons ─────────────────────────────────────────────────────────────
function BackIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}
function CheckIcon({ size = 12, color = C.greenDeep }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6"/>
    </svg>
  )
}
function UploadIcon({ size = 14, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}
function ShieldIcon({ size = 16, color = C.goldDeep }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/>
    </svg>
  )
}
function SignOutIcon({ size = 14, color = C.muted }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

// ─── Brand mark ───────────────────────────────────────────────────────────────
function BrandMark() {
  return (
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
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{
      padding: '24px 22px 10px',
      fontFamily: FONT_DISPLAY,
      fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
      textTransform: 'uppercase', color: C.muted,
    }}>
      {children}
    </div>
  )
}

function formatRole(role: Role | null | undefined): string {
  switch (role) {
    case 'driver':       return 'Driver'
    case 'super_admin':  return 'Super Admin'
    case 'scheduler':    return 'Scheduler'
    case 'warehouse':    return 'Warehouse'
    case 'read_only':    return 'Read Only'
    case 'display':      return 'Display'
    default:             return '—'
  }
}

// ─── Stub compliance documents (Phase-2 backend) ─────────────────────────────
// TODO: wire to compliance documents table once schema lands. Status, expiry,
// and document type all need to come from the backend; today they're hardcoded
// stubs so the UI surface is in place when the real data arrives.
type DocStatus = 'valid' | 'expiring' | 'expired'
interface ComplianceDoc {
  name: string
  expires: string             // pre-formatted display string
  daysUntilExpiry: number
  status: DocStatus
}
const STUB_DOCS: ComplianceDoc[] = [
  { name: 'DOT Medical Card',          expires: 'May 17, 2026', daysUntilExpiry: 14,  status: 'expiring' },
  { name: 'West Point ID',             expires: 'Aug 22, 2027', daysUntilExpiry: 477, status: 'valid' },
  { name: 'Commercial Driver License', expires: 'Mar 10, 2028', daysUntilExpiry: 678, status: 'valid' },
]

// ─── Compliance card ─────────────────────────────────────────────────────────
function ComplianceCard({ doc }: { doc: ComplianceDoc }) {
  const expiring = doc.status === 'expiring'
  return (
    <div style={{
      background: expiring ? C.goldSoft : C.paper,
      border: `1.5px solid ${C.ink}`,
      borderLeft: expiring ? `5px solid ${C.gold}` : `1.5px solid ${C.ink}`,
      borderRadius: 16,
      padding: '14px 16px',
      marginBottom: 10,
    }}>
      {expiring && (
        <div style={{
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: C.goldDeep, textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          Expires in {doc.daysUntilExpiry} days
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: C.ink,
            fontFamily: FONT_DISPLAY, lineHeight: 1.2,
            letterSpacing: '-0.01em',
          }}>
            {doc.name}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted }}>
            Expires {doc.expires}
          </div>
        </div>
        {expiring ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: C.gold, color: C.ink,
            padding: '4px 10px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <ShieldIcon size={12} color={C.ink}/>
            Expiring
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: C.greenSoft, color: C.greenDeep,
            border: `1px solid ${C.green}`,
            padding: '4px 10px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <CheckIcon size={12} color={C.greenDeep}/>
            Valid
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => { /* Phase-2 placeholder */ }}
        style={{
          marginTop: 12,
          width: '100%',
          background: 'transparent',
          border: `1.5px dashed ${C.muted}`,
          borderRadius: 12,
          padding: '10px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 700, color: C.muted,
          letterSpacing: '0.04em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <UploadIcon size={14} color={C.muted}/>
        Upload new
      </button>
    </div>
  )
}

// ─── Account row ─────────────────────────────────────────────────────────────
function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: `1px solid rgba(10,11,20,0.08)`,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.16em',
        color: C.muted, textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.4,
        wordBreak: 'break-word',
      }}>
        {value}
      </div>
    </div>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter()
  const { user, profile } = useAuth()

  const displayName = profile?.display_name?.trim() || 'Driver'
  const roleLabel   = formatRole(profile?.role)
  const email       = user?.email ?? '—'

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '46px 22px 22px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <svg
          aria-hidden="true"
          width={160} height={160} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -14, top: -8,
            opacity: 0.20,
            transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <button
            onClick={() => router.back()}
            aria-label="Back"
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: 'rgba(255,255,255,0.16)',
              border: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BackIcon/>
          </button>
          <BrandMark/>
        </div>

        <div style={{
          marginTop: 18,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
          color: C.gold, textTransform: 'uppercase',
          position: 'relative',
        }}>
          Profile · {roleLabel}
        </div>

        <div style={{
          marginTop: 6,
          fontFamily: FONT_DISPLAY,
          fontSize: 32, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: '#fff',
          position: 'relative',
        }}>
          My Profile
        </div>

        <div style={{
          marginTop: 8,
          fontSize: 14, fontWeight: 600,
          color: 'rgba(255,255,255,0.85)', lineHeight: 1.35,
          position: 'relative',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayName}
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Compliance documents */}
        <SectionEyebrow>Compliance Documents</SectionEyebrow>
        <div style={{ padding: '0 18px' }}>
          {STUB_DOCS.map((doc) => (
            <ComplianceCard key={doc.name} doc={doc}/>
          ))}
        </div>

        {/* Account */}
        <SectionEyebrow>Account</SectionEyebrow>
        <div style={{ padding: '0 18px' }}>
          <div style={{
            background: C.paper,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            <AccountRow label="Name"  value={displayName}/>
            <AccountRow label="Role"  value={roleLabel}/>
            <AccountRow label="Email" value={email}/>
          </div>

          <button
            onClick={handleSignOut}
            type="button"
            style={{
              marginTop: 18,
              width: '100%',
              background: 'transparent',
              border: 0,
              padding: '14px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, color: C.muted,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <SignOutIcon size={14} color={C.muted}/>
            Sign out
          </button>
        </div>
      </div>

      <BottomNav/>
    </div>
  )
}
