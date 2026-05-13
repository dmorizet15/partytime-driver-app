'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'

// /reference/library — Editorial Direction 03 styling matching
// ToolsScreen / TentReferenceScreen. Read-only: search + tag pills + tap to
// open. PDF items go through the iOS-vs-Android branch; external URLs open
// in a new tab on every platform.

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

type TagType = 'brand' | 'type' | 'general'

interface TagRow { id: string; name: string; tag_type: TagType }
interface MfrRow { id: string; name: string }
interface CatRow { id: string; name: string }

interface LibraryItem {
  id:                string
  name:              string
  description:       string
  file_path:         string | null
  external_url:      string | null
  is_public:         boolean
  created_at:        string
  manufacturer:      MfrRow | null
  category:          CatRow | null
  reference_library_item_tags: { reference_library_tags: TagRow | null }[]
}

function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

const PUBLIC_BUCKET_BASE =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/reference-library`

export default function ReferenceLibraryScreen() {
  const router = useRouter()
  const [items,   setItems]   = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [opening, setOpening] = useState<string | null>(null)
  const [viewer,  setViewer]  = useState<{ url: string; title: string } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: e } = await supabase
        .from('reference_library_items')
        .select(`
          id, name, description, file_path, external_url, is_public, created_at,
          manufacturer:reference_library_manufacturers ( id, name ),
          category:reference_library_categories ( id, name ),
          reference_library_item_tags ( reference_library_tags ( id, name, tag_type ) )
        `)
        .order('name', { ascending: true })
      if (cancelled) return
      if (e) {
        setError(e.message)
        setLoading(false)
        return
      }
      setItems((data ?? []) as unknown as LibraryItem[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Search across name / description / manufacturer / category / tag names.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const fields = [
        it.name,
        it.description,
        it.manufacturer?.name ?? '',
        it.category?.name ?? '',
        ...it.reference_library_item_tags.map((t) => t.reference_library_tags?.name ?? ''),
      ]
      return fields.some((f) => f.toLowerCase().includes(q))
    })
  }, [items, search])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function openItem(item: LibraryItem) {
    // External URL: open in new tab on every platform.
    if (item.external_url) {
      window.open(item.external_url, '_blank')
      return
    }
    if (!item.file_path) return

    // Public PDFs use the stable CDN URL — no signed URL needed.
    if (item.is_public) {
      const url = `${PUBLIC_BUCKET_BASE}/${item.file_path}`
      if (isIOS()) {
        window.open(url, '_blank')
      } else {
        setViewer({ url, title: item.name })
      }
      return
    }

    // Private PDFs need a 60s signed URL.
    setOpening(item.id)
    const { data, error: e } = await supabase
      .storage
      .from('reference-library')
      .createSignedUrl(item.file_path, 60)
    setOpening(null)
    if (e || !data?.signedUrl) {
      setError(e?.message ?? 'Could not generate file link.')
      return
    }
    if (isIOS()) {
      window.open(data.signedUrl, '_blank')
    } else {
      setViewer({ url: data.signedUrl, title: item.name })
    }
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
          Library.
        </div>

        <div style={{
          marginTop: 12, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4,
          maxWidth: '34ch',
        }}>
          Heaters, generators, spec sheets, manuals — search by name, brand or tag.
        </div>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 18px 6px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, brand, tags…"
            style={{
              width: '100%',
              background: C.paper,
              border: '1.5px solid rgba(10,11,20,0.12)',
              borderRadius: 999,
              padding: '10px 36px 10px 14px',
              fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
              color: C.ink, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{
                position: 'absolute', right: 10, top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent', border: 0,
                color: C.muted, fontSize: 18, fontWeight: 900,
                cursor: 'pointer', padding: 4, lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>
        <div style={{
          marginTop: 8, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: C.muted,
        }}>
          {loading ? 'Loading…' : `${filtered.length} of ${items.length} items`}
        </div>
      </div>

      {/* ── Scroll body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 24 }}>
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
            No items in the library yet. The office uploads reference docs as they become available — check back later.
          </div>
        )}
        {!loading && !error && items.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '32px 22px', color: C.muted, fontSize: 14, lineHeight: 1.5 }}>
            No items match &quot;{search}&quot;. Try different keywords.
          </div>
        )}

        <div style={{ padding: '6px 18px 0' }}>
          {filtered.map((item) => {
            const tags = item.reference_library_item_tags
              .map((t) => t.reference_library_tags)
              .filter((t): t is TagRow => t !== null)
            const isExpanded = expanded.has(item.id)
            const isOpening  = opening === item.id

            return (
              <div
                key={item.id}
                style={{
                  background: C.paper,
                  borderRadius: 14,
                  border: '1.5px solid rgba(10,11,20,0.08)',
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => openItem(item)}
                  disabled={isOpening}
                  style={{
                    display: 'block', width: '100%',
                    background: isOpening ? C.off : 'transparent',
                    border: 0,
                    padding: '14px 16px',
                    textAlign: 'left',
                    cursor: isOpening ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: FONT_DISPLAY,
                        fontSize: 16, fontWeight: 800,
                        color: C.ink, letterSpacing: '-0.01em',
                        lineHeight: 1.2,
                      }}>
                        {item.name}
                      </div>
                      {item.manufacturer && (
                        <div style={{
                          fontSize: 11.5, color: C.muted,
                          marginTop: 3, fontWeight: 600,
                        }}>
                          {item.manufacturer.name}
                        </div>
                      )}
                    </div>
                    <span style={{
                      color: item.external_url ? C.muted : C.gold,
                      fontSize: 20, fontWeight: 900,
                      flexShrink: 0,
                    }}>
                      {isOpening ? '…' : item.external_url ? '↗' : '›'}
                    </span>
                  </div>
                </button>

                <div
                  onClick={(e) => { e.stopPropagation(); toggleExpand(item.id) }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') toggleExpand(item.id) }}
                  style={{
                    padding: '0 16px 12px',
                    fontSize: 13, color: C.muted, lineHeight: 1.45,
                    cursor: 'pointer',
                    display: '-webkit-box',
                    WebkitLineClamp: isExpanded ? undefined : 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.description}
                </div>

                {/* Tag row */}
                {(item.category || tags.length > 0) && (
                  <div style={{
                    padding: '0 16px 14px',
                    display: 'flex', gap: 6, flexWrap: 'wrap',
                  }}>
                    {item.category && (
                      <ChipPill kind="category" label={item.category.name}/>
                    )}
                    {tags.map((t) => (
                      <ChipPill key={t.id} kind={t.tag_type} label={t.name}/>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <BottomNav/>
    </div>
  )
}

function ChipPill({ kind, label }: { kind: 'category' | TagType; label: string }) {
  const colorMap: Record<typeof kind, { bg: string; fg: string }> = {
    category: { bg: '#E0E7FF', fg: '#3730A3' },
    brand:    { bg: '#FFEDD5', fg: '#9A3412' },
    type:     { bg: '#DCFCE7', fg: '#0E5F36' },
    general:  { bg: '#E0E7FF', fg: '#3730A3' },
  }
  const { bg, fg } = colorMap[kind]
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
      textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 999,
      background: bg, color: fg,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}
