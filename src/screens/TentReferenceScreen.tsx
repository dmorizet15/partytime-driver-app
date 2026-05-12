'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'

// ─── Direction 03 (Editorial) tokens — match ToolsScreen / WeatherScreen ───
const C = {
  blue:  '#0000FF',
  ink:   '#0A0B14',
  cream: '#FFF9EE',
  gold:  '#FFB800',
  paper: '#FFFFFF',
  off:   '#F4F6FA',
  muted: '#6B7488',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface TentLink {
  id:                    string
  tapgoods_product_id:   string
  tapgoods_product_name: string | null
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
}

export default function TentReferenceScreen() {
  const router = useRouter()
  const [items,    setItems]    = useState<TentItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  // Signed-URL viewer state. PDF URL is fetched on tap (60s expiry) and the
  // viewer covers the screen until the user closes it.
  const [viewer,   setViewer]   = useState<{ url: string; title: string } | null>(null)
  const [opening,  setOpening]  = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('tent_reference_items')
        .select(
          'id, manufacturer, tent_type, size, notes, is_primary, storage_path, file_name, created_at, tent_drawing_tapgoods_links(id, tapgoods_product_id, tapgoods_product_name)'
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
      setItems((data ?? []) as TentItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, TentItem[]>()
    for (const it of items) {
      const k = it.manufacturer || '—'
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(it)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  async function openItem(item: TentItem) {
    setOpening(item.id)
    const { data, error } = await supabase
      .storage
      .from('tent-reference-library')
      .createSignedUrl(item.storage_path, 60)
    setOpening(null)
    if (error || !data?.signedUrl) {
      setError(error?.message ?? 'Could not generate file link.')
      return
    }
    // iOS Safari ignores iframe PDFs (renders blank or a download prompt).
    // Hand off to the native viewer via a new tab instead.
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
    if (isIOS) {
      window.open(data.signedUrl, '_blank')
      return
    }
    setViewer({ url: data.signedUrl, title: `${item.manufacturer} ${item.size}` })
  }

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
            aria-label="Back to list"
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

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
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

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
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
                  onClick={() => openItem(item)}
                  disabled={opening === item.id}
                  style={{
                    display: 'block', width: '100%',
                    background: opening === item.id ? C.off : 'transparent',
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
