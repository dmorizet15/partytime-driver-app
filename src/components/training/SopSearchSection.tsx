'use client'

// ─── SopSearchSection ────────────────────────────────────────────────────────
// AVA Phase 2 — Session 2. Driver-facing SOP lookup in the Training Hub.
//
// Data: sop_entries (mirrored from the Notion SOP Library via /api/sop/sync).
// Read-only, direct from the browser Supabase client — no API route.
//
// Department reality check: the Notion `department` values are free-text and
// composite ("Drivers / Warehouse", "Field Operations", "All Departments",
// "Warehouse", "Operations", null) — NOT the clean tokens the Phase 2 spec
// assumed (`'driver' | 'field' | 'all'`). A literal IN (...) would match zero
// rows. So "driver-visible" = department contains driver / field / all
// (case-insensitive). Warehouse-only, Operations, and null are excluded.
//
// Search: the driver-visible set is tiny (≤10 rows), so we fetch it ONCE and
// filter in-memory on the 300 ms-debounced query (title + content). That beats
// a Supabase round-trip per keystroke and still satisfies "use the existing
// client, read-only". Zero query → all driver-visible SOPs, sop_number ascending.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AvaConversationSheet from '@/components/ava/AvaConversationSheet'

const C = {
  bg:         '#0D0D0D',
  card:       '#1A1A1A',
  cardBorder: 'rgba(255,255,255,0.07)',
  blue:       '#0000FF',
  white:      '#fff',
  muted:      'rgba(255,255,255,0.4)',
  gold:       '#FFB800',
  ink:        '#0A0B14',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface SopEntry {
  id:          string
  sop_number:  string
  title:       string
  content:     string
  department:  string | null
}

// Driver-visible = department mentions drivers / field / all (case-insensitive),
// OR the SOP is tent setup/teardown. Two reasons this is more than a simple
// `IN(...)`:
//   1. The Notion departments are PLURAL ("Drivers", "Drivers / Warehouse"). The
//      original `/\b(driver|field|all)\b/i` failed every "Drivers" row — the `\b`
//      after "driver" can't match before the trailing "s" — so only "All
//      Departments" / "Field Operations" SOPs showed (005/008/009). `drivers?`
//      fixes it (001/003/006 now surface).
//   2. SOP-010 (Tent Setup & Teardown) has a NULL department — it's the one child
//      page missing from the Notion summary table, so the sync had no metadata to
//      attach. Tents are core driver work, so we surface it by title. Durable fix:
//      chat-Claude adds SOP-010 to the summary table with a driver/field
//      department; this title carve-out can then be removed.
// Still excludes Warehouse-only (Forklift, Chair Return) and Operations (Scheduling).
const TENT_TITLE_RE = /\b(tent|canopy|marquee)\b/i

function isDriverVisible(sop: Pick<SopEntry, 'department' | 'title'>): boolean {
  if (sop.department && /\b(drivers?|field|all)\b/i.test(sop.department)) return true
  return TENT_TITLE_RE.test(sop.title)
}

const EXCERPT_LEN = 120

function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim()
  return flat.length > EXCERPT_LEN ? `${flat.slice(0, EXCERPT_LEN).trimEnd()}…` : flat
}

function SopCard({ sop, expanded, onToggle }: {
  sop: SopEntry; expanded: boolean; onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      style={{
        background: C.card,
        border: `0.5px solid ${C.cardBorder}`,
        borderRadius: 14,
        padding: '14px 14px',
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', width: '100%', color: C.white,
        display: 'block',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          background: 'rgba(0,0,255,0.18)', color: '#6B8FFF',
          border: '0.5px solid rgba(0,0,255,0.3)',
          padding: '3px 9px', borderRadius: 999,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
          whiteSpace: 'nowrap',
        }}>
          {sop.sop_number}
        </span>
        {sop.department && (
          <span style={{
            background: 'rgba(255,255,255,0.06)', color: C.muted,
            border: `0.5px solid ${C.cardBorder}`,
            padding: '3px 9px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            {sop.department}
          </span>
        )}
      </div>

      <div style={{
        marginTop: 10, fontFamily: FONT_DISPLAY,
        fontSize: 16, fontWeight: 800, color: C.white,
        letterSpacing: '-0.01em', lineHeight: 1.25,
      }}>
        {sop.title}
      </div>

      <div style={{
        marginTop: 6,
        fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5,
        whiteSpace: expanded ? 'pre-wrap' : 'normal',
        wordBreak: 'break-word',
      }}>
        {expanded ? sop.content : excerpt(sop.content)}
      </div>

      <div style={{
        marginTop: 8, fontSize: 11, fontWeight: 700, color: C.gold,
        letterSpacing: '0.03em', textTransform: 'uppercase',
      }}>
        {expanded ? 'Tap to collapse' : 'Tap to read'}
      </div>
    </button>
  )
}

export default function SopSearchSection() {
  const [allSops,    setAllSops]    = useState<SopEntry[]>([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState(false)
  const [query,      setQuery]      = useState('')
  const [debounced,  setDebounced]  = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [askOpen,    setAskOpen]    = useState(false)

  // Fetch the full SOP set once (≤10 rows) and filter driver-visibility in JS —
  // simpler and safer than a PostgREST .or(ilike) wildcard, and the table is tiny.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('sop_entries')
      .select('id, sop_number, title, content, department')
      .order('sop_number', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setLoadError(true); setLoading(false); return }
        setAllSops(((data ?? []) as SopEntry[]).filter((s) => isDriverVisible(s)))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // 300 ms debounce on the query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [query])

  const results = useMemo(() => {
    if (!debounced) return allSops
    return allSops.filter((s) =>
      s.title.toLowerCase().includes(debounced) ||
      s.content.toLowerCase().includes(debounced)
    )
  }, [allSops, debounced])

  return (
    <div style={{ padding: '20px 18px 0' }}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
        color: C.muted, textTransform: 'uppercase', marginBottom: 12,
      }}>
        Look up an SOP
      </div>

      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SOPs…"
          aria-label="Search standard operating procedures"
          style={{
            width: '100%',
            background: C.card, color: C.white,
            border: `0.5px solid ${C.cardBorder}`, borderRadius: 12,
            padding: '12px 16px', fontSize: 15, outline: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* States */}
      {loading && (
        <div style={{ color: C.muted, fontSize: 13, padding: '6px 2px' }}>
          Loading SOPs…
        </div>
      )}

      {!loading && loadError && (
        <div style={{ color: '#FCA5A5', fontSize: 13, padding: '6px 2px' }}>
          Couldn&apos;t load SOPs. Pull down to refresh.
        </div>
      )}

      {!loading && !loadError && results.length === 0 && (
        <div style={{
          background: C.card, border: `0.5px solid ${C.cardBorder}`,
          borderRadius: 14, padding: '20px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.white }}>
            No SOPs found
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {debounced
              ? `Nothing matches “${query.trim()}”.`
              : 'No driver SOPs are available yet.'}
          </div>
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            style={{
              marginTop: 14,
              background: C.gold, color: C.ink,
              border: 0, borderRadius: 999, padding: '10px 20px',
              fontSize: 14, fontWeight: 800, letterSpacing: '0.02em',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Ask Ava instead
          </button>
        </div>
      )}

      {!loading && !loadError && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map((sop) => (
            <SopCard
              key={sop.id}
              sop={sop}
              expanded={expandedId === sop.id}
              onToggle={() => setExpandedId((id) => (id === sop.id ? null : sop.id))}
            />
          ))}
        </div>
      )}

      <AvaConversationSheet
        open={askOpen}
        onClose={() => setAskOpen(false)}
        seedContext={{}}
        initialQuestion={debounced ? query.trim() : undefined}
      />
    </div>
  )
}
