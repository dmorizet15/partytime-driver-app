'use client'

import { ReactNode, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { signOut } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { Role } from '@/types/auth'
import Image from 'next/image'
import BottomNav from '@/components/BottomNav'
import AvaChip from '@/components/AvaChip'
import UploadComplianceDocModal from './UploadComplianceDocModal'
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  expiringDocCopy,
  fetchMyComplianceDocs,
  type DocumentType,
  type DriverDocSummary,
} from '@/lib/driverComplianceClient'
import { fetchPersonalStats, type PersonalStats } from '@/lib/personalStatsClient'

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
function LockIcon({ size = 14, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
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

function formatRole(roles: Role[] | null | undefined): string {
  if (!roles || roles.length === 0) return '—'
  // Prefer 'driver' display since this is the driver app; otherwise show the first role.
  const primary = roles.includes('driver') ? 'driver' : roles[0]
  switch (primary) {
    case 'driver':       return 'Driver'
    case 'super_admin':  return 'Super Admin'
    case 'scheduler':    return 'Scheduler'
    case 'warehouse':    return 'Warehouse'
    case 'read_only':    return 'Read Only'
    case 'display':      return 'Display'
    default:             return '—'
  }
}

// ─── Compliance card ─────────────────────────────────────────────────────────
const RED = '#DC2626'

function fmtExpires(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

interface ComplianceCardProps {
  doc:       DriverDocSummary
  onUpload:  () => void
}

function ComplianceCard({ doc, onUpload }: ComplianceCardProps) {
  const isExpiring = doc.status === 'expiring'
  const isExpired  = doc.status === 'expired'
  const isMissing  = doc.status === 'missing'
  const isValid    = doc.status === 'ok'

  const accent =
    isExpired  ? RED :
    isExpiring ? C.gold :
    isMissing  ? C.muted :
    null

  const eyebrow =
    isExpired  ? `Expired ${fmtExpires(doc.expiry_date)}` :
    isExpiring ? expiringDocCopy(doc) :
    isMissing  ? 'Not yet uploaded' :
    null

  return (
    <div style={{
      background: isExpired ? '#FEECEC' : isExpiring ? C.goldSoft : C.paper,
      border: `1.5px solid ${C.ink}`,
      borderLeft: accent ? `5px solid ${accent}` : `1.5px solid ${C.ink}`,
      borderRadius: 16,
      padding: '14px 16px',
      marginBottom: 10,
    }}>
      {eyebrow && (
        <div style={{
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: isExpired ? '#B91C1C' : isExpiring ? C.goldDeep : C.muted,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}>
          {eyebrow}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: C.ink,
            fontFamily: FONT_DISPLAY, lineHeight: 1.2,
            letterSpacing: '-0.01em',
          }}>
            {DOCUMENT_LABELS[doc.document_type]}
          </div>
          {doc.expiry_date && (
            <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted }}>
              Expires {fmtExpires(doc.expiry_date)}
              {doc.extraction_method === 'vision' && (
                <span style={{ marginLeft: 6, fontSize: 11, color: C.muted, opacity: 0.7 }}>
                  · captured via AI
                </span>
              )}
            </div>
          )}
        </div>
        {isExpired ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: RED, color: '#fff',
            padding: '4px 10px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <ShieldIcon size={12} color="#fff"/>
            Expired
          </span>
        ) : isExpiring ? (
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
        ) : isMissing ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: C.off, color: C.muted,
            border: `1px solid ${C.muted}`,
            padding: '4px 10px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            Missing
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
        onClick={onUpload}
        style={{
          marginTop: 12,
          width: '100%',
          background: isMissing || isExpired ? C.blue : 'transparent',
          color: isMissing || isExpired ? '#fff' : C.muted,
          border: isMissing || isExpired ? 0 : `1.5px dashed ${C.muted}`,
          borderRadius: 12,
          padding: '10px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 12.5, fontWeight: 700,
          letterSpacing: '0.04em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <UploadIcon size={14} color={isMissing || isExpired ? '#fff' : C.muted}/>
        {isValid ? 'Replace document' : isMissing ? 'Upload now' : isExpired ? 'Upload renewed document' : 'Replace document'}
      </button>
      {isValid && isValid /* keep ts happy when no else branch */}
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

// ─── Password input row ──────────────────────────────────────────────────────
function PwdField({
  label, value, onChange, autoComplete, error, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  error?: string | null
  hint?: string
}) {
  const borderColor = error ? '#DC2626' : '#D9DBE3'
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: C.muted,
      }}>
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={{
          background: '#FAFBFD',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 10,
          padding: '12px 12px',
          fontFamily: 'inherit',
          fontSize: 15, fontWeight: 600, color: C.ink,
          outline: 'none',
        }}
      />
      {error
        ? <span style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C' }}>{error}</span>
        : hint ? <span style={{ fontSize: 12, color: C.muted }}>{hint}</span> : null}
    </label>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter()
  const { user, profile } = useAuth()

  const displayName = profile?.display_name?.trim() || 'Driver'
  const roleLabel   = formatRole(profile?.roles)
  const email       = user?.email ?? '—'

  // ── Compliance documents (live data) ────────────────────────────────────────
  const [docs, setDocs] = useState<DriverDocSummary[] | null>(null)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [uploadFor, setUploadFor] = useState<DocumentType | null>(null)

  const loadDocs = useCallback(async () => {
    if (!user?.id) return
    try {
      setDocsError(null)
      const rows = await fetchMyComplianceDocs(user.id)
      setDocs(rows)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setDocsError(msg)
      // Fall back to a missing-row view per type so the user can still upload.
      setDocs(DOCUMENT_TYPES.map((t) => ({
        id: null,
        document_type: t,
        expiry_date: null,
        storage_path: null,
        extraction_method: null,
        status: 'missing' as const,
        daysUntilExpiry: null,
      })))
    }
  }, [user?.id])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  // ── Personal stats ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState<PersonalStats | null>(null)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    fetchPersonalStats(user.id)
      .then((s) => { if (!cancelled) setStats(s) })
      .catch((err) => {
        console.error('[personalStats]', err)
        if (!cancelled) setStats({ totalStopsCompleted: 0, startDate: null, truckHistory: [] })
      })
    return () => { cancelled = true }
  }, [user?.id])

  // ── Change-password form ────────────────────────────────────────────────────
  const [pwdOpen,        setPwdOpen]        = useState(false)
  const [currentPwd,     setCurrentPwd]     = useState('')
  const [newPwd,         setNewPwd]         = useState('')
  const [confirmPwd,     setConfirmPwd]     = useState('')
  const [currentPwdError, setCurrentPwdError] = useState<string | null>(null)
  const [newPwdError,    setNewPwdError]    = useState<string | null>(null)
  const [confirmError,   setConfirmError]   = useState<string | null>(null)
  const [formError,      setFormError]      = useState<string | null>(null)
  const [submitting,     setSubmitting]     = useState(false)
  const [showSuccess,    setShowSuccess]    = useState(false)

  useEffect(() => {
    if (!showSuccess) return
    const t = setTimeout(() => setShowSuccess(false), 3000)
    return () => clearTimeout(t)
  }, [showSuccess])

  function resetPwdForm() {
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
    setCurrentPwdError(null); setNewPwdError(null); setConfirmError(null); setFormError(null)
  }

  function cancelPwdForm() {
    resetPwdForm()
    setPwdOpen(false)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return

    setCurrentPwdError(null); setNewPwdError(null); setConfirmError(null); setFormError(null)

    let bad = false
    if (newPwd.length < 8) {
      setNewPwdError('Must be at least 8 characters.')
      bad = true
    }
    if (newPwd !== confirmPwd) {
      setConfirmError('Passwords don’t match.')
      bad = true
    }
    if (bad) return

    if (!user?.email) {
      setFormError('Couldn’t verify session. Sign out and back in, then try again.')
      return
    }

    setSubmitting(true)

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwd,
    })
    if (reauthError) {
      setSubmitting(false)
      setCurrentPwdError('Current password is incorrect')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setSubmitting(false)

    if (error) {
      setFormError(error.message || 'Couldn’t update password. Try again.')
      return
    }

    resetPwdForm()
    setPwdOpen(false)
    setShowSuccess(true)
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark/>
            <AvaChip/>
          </div>
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
          {docsError && (
            <div style={{
              marginBottom: 10,
              background: '#FEECEC',
              border: '1.5px solid #B91C1C',
              borderLeft: '5px solid #DC2626',
              borderRadius: 12,
              padding: '10px 12px',
              color: '#7F1D1D',
              fontWeight: 700, fontSize: 12, lineHeight: 1.4,
            }}>
              Could not load compliance docs: {docsError}
            </div>
          )}
          {docs == null ? (
            <div style={{
              padding: '14px 16px',
              background: C.off,
              border: `1.5px solid ${C.ink}`,
              borderRadius: 16,
              marginBottom: 10,
              fontSize: 13, color: C.muted, textAlign: 'center',
            }}>
              Loading documents…
            </div>
          ) : (
            docs.map((doc) => (
              <ComplianceCard
                key={doc.document_type}
                doc={doc}
                onUpload={() => setUploadFor(doc.document_type)}
              />
            ))
          )}
        </div>

        {/* Personal stats */}
        {stats && (
          <>
            <SectionEyebrow>My Activity</SectionEyebrow>
            <div style={{ padding: '0 18px' }}>
              <div style={{
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                  color: C.muted, textTransform: 'uppercase',
                }}>
                  Stops completed
                </div>
                <div style={{
                  marginTop: 4,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 28, fontWeight: 900,
                  color: C.ink, lineHeight: 1.0,
                  letterSpacing: '-0.02em',
                }}>
                  {stats.totalStopsCompleted.toLocaleString()}
                </div>
                {stats.startDate && (
                  <div style={{ marginTop: 4, fontSize: 12.5, color: C.muted }}>
                    Since {new Date(stats.startDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  </div>
                )}
              </div>

              {stats.truckHistory.length > 0 && (
                <div style={{
                  background: C.paper,
                  border: `1.5px solid ${C.ink}`,
                  borderRadius: 16,
                  overflow: 'hidden',
                  marginBottom: 10,
                }}>
                  <div style={{
                    padding: '12px 16px 6px',
                    fontFamily: FONT_DISPLAY,
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                    textTransform: 'uppercase', color: C.muted,
                  }}>
                    Trucks driven
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {stats.truckHistory.slice(0, 6).map((t) => (
                      <li
                        key={t.truck_id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          padding: '10px 16px',
                          borderTop: '1px solid rgba(10,11,20,0.08)',
                          fontSize: 14,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: C.ink }}>{t.truck_name}</span>
                        <span style={{ fontSize: 12, color: C.muted }}>
                          {t.routes_driven} route{t.routes_driven === 1 ? '' : 's'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

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
        </div>

        {/* Security */}
        <SectionEyebrow>Security</SectionEyebrow>
        <div style={{ padding: '0 18px' }}>
          {showSuccess && (
            <div
              role="status"
              style={{
                marginBottom: 12,
                background: C.greenSoft,
                border: `1.5px solid ${C.greenDeep}`,
                borderLeft: `5px solid ${C.green}`,
                borderRadius: 14,
                padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                color: C.greenDeep,
                fontWeight: 700, fontSize: 14,
              }}
            >
              <CheckIcon size={14} color={C.greenDeep}/>
              Password updated.
            </div>
          )}

          {!pwdOpen ? (
            <button
              type="button"
              onClick={() => setPwdOpen(true)}
              style={{
                width: '100%',
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 16,
                padding: '14px 16px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 14, fontWeight: 700, color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <LockIcon size={14} color={C.ink}/>
                Change password
              </span>
              <span aria-hidden="true" style={{ color: C.muted, fontSize: 18, lineHeight: 1 }}>›</span>
            </button>
          ) : (
            <form
              onSubmit={handleChangePassword}
              style={{
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 16,
                padding: 16,
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {formError && (
                <div
                  role="alert"
                  style={{
                    background: '#FEECEC',
                    border: `1.5px solid #B91C1C`,
                    borderLeft: `5px solid #DC2626`,
                    borderRadius: 12,
                    padding: '10px 12px',
                    color: '#7F1D1D',
                    fontWeight: 700, fontSize: 13, lineHeight: 1.4,
                  }}
                >
                  {formError}
                </div>
              )}

              <PwdField
                label="Current password"
                value={currentPwd}
                onChange={(v) => { setCurrentPwd(v); if (currentPwdError) setCurrentPwdError(null) }}
                autoComplete="current-password"
                error={currentPwdError}
              />
              <PwdField
                label="New password"
                value={newPwd}
                onChange={(v) => { setNewPwd(v); if (newPwdError) setNewPwdError(null) }}
                autoComplete="new-password"
                error={newPwdError}
                hint={newPwdError ? undefined : 'At least 8 characters.'}
              />
              <PwdField
                label="Confirm new password"
                value={confirmPwd}
                onChange={(v) => { setConfirmPwd(v); if (confirmError) setConfirmError(null) }}
                autoComplete="new-password"
                error={confirmError}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={cancelPwdForm}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: `1.5px solid ${C.ink}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700, color: C.ink,
                    opacity: submitting ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    flex: 1,
                    background: C.blue,
                    border: 0,
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 800, color: '#fff',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          )}

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

      {uploadFor && user?.id && (
        <UploadComplianceDocModal
          driverId={user.id}
          documentType={uploadFor}
          onClose={() => setUploadFor(null)}
          onSaved={() => {
            setUploadFor(null)
            loadDocs()
          }}
        />
      )}
    </div>
  )
}
