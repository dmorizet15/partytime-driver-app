'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import { TENT_MANUFACTURERS } from '@/lib/tentManufacturers'

// ─── Direction 03 (Editorial) tokens — match ToolsScreen / WeatherScreen ───
const C = {
  blue:  '#0000FF',
  ink:   '#0A0B14',
  cream: '#FFF9EE',
  gold:  '#FFB800',
  paper: '#FFFFFF',
  off:   '#F4F6FA',
  muted: '#6B7488',
  hair:  'rgba(10,11,20,0.06)',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const TYPE_OPTIONS = ['Frame', 'Pole', 'Structure'] as const
type TypeFilter = 'all' | (typeof TYPE_OPTIONS)[number]

interface TentLink {
  id:                    string
  tapgoods_product_id:   string
  tapgoods_product_name: string | null
}

interface FlameCertSummary {
  id:        string
  file_path: string
  file_name: string
}

interface TentItem {
  id:           string
  manufacturer: string
  tent_type:    string | null
  size:         string
  notes:        string | null
  is_primary:   boolean
  storage_path: string
  file_name:    string
  created_at:   string
  tent_drawing_tapgoods_links: TentLink[]
  flame_certificates:          FlameCertSummary[]
}

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export default function TentReferenceScreen() {
  const router = useRouter()
  const [items,    setItems]    = useState<TentItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  // Three screen modes: list (default), detail (tent detail with drawing +
  // optional cert affordance), viewer (full-screen iframe PDF on Android/
  // desktop). iOS skips viewer entirely — PDFs open in a new tab from detail.
  const [detail,   setDetail]   = useState<TentItem | null>(null)
  const [viewer,   setViewer]   = useState<{ url: string; title: string } | null>(null)
  const [opening,  setOpening]  = useState<string | null>(null)

  const [mfrFilter,  setMfrFilter]  = useState<string>('')        // '' = all
  const [sizeFilter, setSizeFilter] = useState<string>('')        // '' = all
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('tent_reference_items')
        .select(
          'id, manufacturer, tent_type, size, notes, is_primary, storage_path, file_name, created_at, tent_drawing_tapgoods_links(id, tapgoods_product_id, tapgoods_product_name), flame_certificates(id, file_path, file_name)'
        )
        .order('manufacturer', { ascending: true })
        .order('size',         { ascending: true })
        .order('is_primary',   { ascending: false })
      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setItems((data ?? []) as unknown as TentItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Apply AND-combined filters.
  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (mfrFilter  && it.manufacturer !== mfrFilter) return false
      if (sizeFilter && it.size !== sizeFilter)        return false
      if (typeFilter !== 'all' && it.tent_type !== typeFilter) return false
      return true
    })
  }, [items, mfrFilter, sizeFilter, typeFilter])

  // Distinct sizes from the post-manufacturer-and-type filter set, so the
  // size pill row only shows sizes that exist after other filters apply.
  const sizesForPills = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) {
      if (mfrFilter  && it.manufacturer !== mfrFilter) continue
      if (typeFilter !== 'all' && it.tent_type !== typeFilter) continue
      set.add(it.size)
    }
    return Array.from(set).sort()
  }, [items, mfrFilter, typeFilter])

  const grouped = useMemo(() => {
    const map = new Map<string, TentItem[]>()
    for (const it of filtered) {
      const k = it.manufacturer || '—'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  async function openPdf(storagePath: string, title: string) {
    setOpening(storagePath)
    const { data, error } = await supabase
      .storage
      .from('tent-reference-library')
      .createSignedUrl(storagePath, 60)
    setOpening(null)
    if (error || !data?.signedUrl) {
      setError(error?.message ?? 'Could not generate file link.')
      return
    }
    if (isIOS()) {
      window.open(data.signedUrl, '_blank')
      return
    }
    setViewer({ url: data.signedUrl, title })
  }

  // ── Viewer mode (Android / desktop only — iOS uses window.open) ─────────
  if (viewer) {
    return (
      <div className="screen" style={{ background: C.ink, fontFamily: FONT_BODY, color: '#fff' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', flexShrink: 0,
          background: C.ink, color: '#fff',
        }}>
          <button
            onClick={() => setViewer(null)}
            aria-label="Back to detail"
            style={{
              background: 'transparent', border: 0, color: C.gold,
              fontSize: 14, fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer', fontFamily: 'inherit', padding: 4,
            }}
          >
            ← BACK
          </button>
          <div style={{
            fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em',
            fontFamily: FONT_DISPLAY, flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {viewer.title}
          </div>
        </div>
        <iframe
          src={viewer.url}
          title={viewer.title}
          style={{ flex: 1, width: '100%', border: 0, background: '#fff' }}
        />
      </div>
    )
  }

  // ── Detail mode (tent intermediate screen) ──────────────────────────────
  if (detail) {
    const hasCert = detail.flame_certificates.length > 0
    const cert    = hasCert ? detail.flame_certificates[0] : null
    return (
      <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
        <div style={{
          background: C.blue, color: '#fff',
          padding: '32px 22px 24px',
          position: 'relative', overflow: 'hidden', flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'relative',
          }}>
            <button
              onClick={() => setDetail(null)}
              aria-label="Back to list"
              style={{
                background: 'transparent', border: 0, color: C.gold,
                fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                textTransform: 'uppercase',
              }}
            >
              ← Drawings
            </button>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
              color: C.gold, textTransform: 'uppercase',
            }}>
              {detail.manufacturer}
            </div>
          </div>

          <div style={{
            marginTop: 22, position: 'relative',
            fontFamily: FONT_DISPLAY,
            fontSize: 36, fontWeight: 900,
            lineHeight: 0.95, letterSpacing: '-0.03em',
            color: '#fff',
          }}>
            {detail.size}
          </div>

          {detail.tent_type && (
            <div style={{
              marginTop: 12, position: 'relative',
              fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              {detail.tent_type}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 24 }}>
          {detail.notes && (
            <div style={{ padding: '18px 22px 0', fontSize: 14, color: C.muted, lineHeight: 1.45 }}>
              {detail.notes}
            </div>
          )}

          {/* Drawing section — always rendered */}
          <Section title="Drawing">
            <DocCard
              label="Manufacturer drawing"
              filename={detail.file_name}
              loading={opening === detail.storage_path}
              onOpen={() => openPdf(detail.storage_path, `${detail.manufacturer} ${detail.size}`)}
            />
          </Section>

          {/* Flame certificate section — hidden when no cert linked */}
          {hasCert && cert && (
            <Section title="Flame certificate">
              <DocCard
                label="Cert PDF"
                filename={cert.file_name}
                loading={opening === cert.file_path}
                onOpen={() => openPdf(cert.file_path, `${detail.manufacturer} ${detail.size} — Flame Cert`)}
                accent
              />
            </Section>
          )}

          {error && (
            <div style={{
              margin: '16px 22px', padding: '12px 14px', borderRadius: 12,
              background: '#FEE2E2', color: '#991B1B', fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>

        <BottomNav/>
      </div>
    )
  }

  // ── List mode (default) ────────────────────────────────────────────────
  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      <div style={{
        background: C.blue, color: '#fff',
        padding: '32px 22px 24px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <svg
          aria-hidden="true"
          width={200} height={200} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -28, top: -16,
            opacity: 0.22,
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
            onClick={() => router.push('/tools')}
            aria-label="Back to tools"
            style={{
              background: 'transparent', border: 0, color: C.gold,
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              textTransform: 'uppercase',
            }}
          >
            ← Tools
          </button>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: C.gold, textTransform: 'uppercase',
          }}>
            Reference
          </div>
        </div>

        <div style={{
          marginTop: 22, position: 'relative',
          fontFamily: FONT_DISPLAY,
          fontSize: 36, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: '#fff',
        }}>
          Tent drawings.
        </div>

        <div style={{
          marginTop: 12, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4,
          maxWidth: '34ch',
        }}>
          Manufacturer diagrams by size — tap any row to open the PDF.
        </div>
      </div>

      {/* ── Filter pill row ────────────────────────────────────────────────*/}
      <div style={{
        padding: '14px 18px 4px',
        display: 'flex', flexDirection: 'column', gap: 10,
        flexShrink: 0,
      }}>
        {/* Manufacturer dropdown-pill (native select on mobile = OS picker) */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={mfrFilter}
            onChange={(e) => { setMfrFilter(e.target.value); setSizeFilter('') }}
            style={{
              appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
              background: mfrFilter ? C.gold : C.paper,
              color: mfrFilter ? C.ink : C.muted,
              border: `1.5px solid ${mfrFilter ? C.gold : 'rgba(10,11,20,0.12)'}`,
              borderRadius: 999,
              padding: '7px 28px 7px 14px',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">All manufacturers</option>
            {TENT_MANUFACTURERS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span
            aria-hidden
            style={{
              position: 'absolute', right: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: mfrFilter ? C.ink : C.muted,
              fontSize: 10, fontWeight: 900,
              pointerEvents: 'none',
            }}
          >
            ▾
          </span>
        </div>

        {/* Type pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill
            label="All types"
            active={typeFilter === 'all'}
            onClick={() => setTypeFilter('all')}
          />
          {TYPE_OPTIONS.map((t) => (
            <Pill
              key={t}
              label={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            />
          ))}
        </div>

        {/* Size pills — dynamic, hidden when none */}
        {sizesForPills.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap',
            overflowX: 'auto', overflowY: 'visible',
          }}>
            <Pill
              label="All sizes"
              active={sizeFilter === ''}
              onClick={() => setSizeFilter('')}
            />
            {sizesForPills.map((s) => (
              <Pill
                key={s}
                label={s}
                active={sizeFilter === s}
                onClick={() => setSizeFilter(s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Scroll body ────────────────────────────────────────────────────*/}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 24 }}>
        {loading && (
          <div style={{ padding: 24, color: C.muted, fontSize: 14 }}>Loading drawings…</div>
        )}
        {error && (
          <div style={{
            margin: '16px 18px', padding: '12px 14px', borderRadius: 12,
            background: '#FEE2E2', color: '#991B1B', fontSize: 13,
          }}>
            {error}
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div style={{ padding: '32px 22px', color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
            No drawings yet. The office uploads tent diagrams as they become available — check back later.
          </div>
        )}
        {!loading && !error && items.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '32px 22px', color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
            No drawings match the current filters. Tap a pill again to clear it.
          </div>
        )}

        {grouped.map(([mfr, rows]) => (
          <div key={mfr} style={{ padding: '20px 18px 0' }}>
            <div style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
              color: C.muted, textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              {mfr}
            </div>
            <div style={{
              background: C.paper,
              borderRadius: 14,
              border: '1.5px solid rgba(10,11,20,0.08)',
              overflow: 'hidden',
            }}>
              {rows.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setDetail(item)}
                  style={{
                    display: 'block', width: '100%',
                    background: 'transparent',
                    border: 0,
                    borderTop: idx === 0 ? 'none' : '1px solid rgba(10,11,20,0.06)',
                    padding: '14px 16px',
                    textAlign: 'left', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 4,
                  }}>
                    <span style={{
                      fontFamily: FONT_DISPLAY,
                      fontSize: 18, fontWeight: 800,
                      color: C.ink, letterSpacing: '-0.01em',
                    }}>
                      {item.size}
                    </span>
                    {item.tent_type && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 999,
                        background: '#E0E7FF', color: '#3730A3',
                      }}>
                        {item.tent_type}
                      </span>
                    )}
                    {item.is_primary && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 4,
                        background: C.blue, color: '#fff',
                      }}>
                        Primary
                      </span>
                    )}
                    {item.flame_certificates.length > 0 && (
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 4,
                        background: '#1FBF6B', color: '#fff',
                      }}>
                        Cert
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', color: C.gold, fontSize: 16, fontWeight: 900 }}>
                      ›
                    </span>
                  </div>
                  {item.notes && (
                    <div style={{
                      fontSize: 12, color: C.muted, lineHeight: 1.4,
                    }}>
                      {item.notes}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <BottomNav/>
    </div>
  )
}

function Pill({
  label,
  active,
  onClick,
}: {
  label:   string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? C.gold : C.paper,
        color: active ? C.ink : C.muted,
        border: `1.5px solid ${active ? C.gold : 'rgba(10,11,20,0.12)'}`,
        borderRadius: 999,
        padding: '7px 14px',
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700,
        letterSpacing: '0.04em',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 22px 0' }}>
      <div style={{
        fontFamily: FONT_DISPLAY,
        fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
        color: C.muted, textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function DocCard({
  label,
  filename,
  loading,
  onOpen,
  accent,
}: {
  label:    string
  filename: string
  loading:  boolean
  onOpen:   () => void
  accent?:  boolean
}) {
  return (
    <button
      onClick={onOpen}
      disabled={loading}
      style={{
        display: 'block', width: '100%',
        background: loading ? C.off : C.paper,
        border: `1.5px solid ${accent ? '#1FBF6B' : 'rgba(10,11,20,0.08)'}`,
        borderRadius: 14,
        padding: '16px 18px',
        textAlign: 'left', cursor: loading ? 'wait' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 16, fontWeight: 800,
            color: C.ink, letterSpacing: '-0.01em',
          }}>
            {label}
          </div>
          <div style={{
            fontSize: 11.5, color: C.muted,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            marginTop: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {filename}
          </div>
        </div>
        <span style={{
          color: accent ? '#1FBF6B' : C.gold,
          fontSize: 22, fontWeight: 900,
        }}>
          {loading ? '…' : '›'}
        </span>
      </div>
    </button>
  )
}
