'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { ArcadeGameType } from '@/hooks/arcade/useGameScore'

// ─── Arcade palette ──────────────────────────────────────────────────────────
const C = {
  bg:        '#080814',
  bgGlow:    'radial-gradient(circle at 20% -10%, rgba(0,0,255,0.28), transparent 55%), radial-gradient(circle at 90% 110%, rgba(255,184,0,0.18), transparent 55%), #080814',
  card:      'rgba(20, 22, 38, 0.85)',
  cardBd:    'rgba(255,255,255,0.07)',
  blue:      '#3939FF',
  gold:      '#FFB800',
  text:      '#ffffff',
  muted:     'rgba(255,255,255,0.55)',
  lockedBg:  'rgba(255,255,255,0.04)',
  lockedBd:  'rgba(255,255,255,0.06)',
  lockedFg:  'rgba(255,255,255,0.35)',
} as const

type Tile = {
  id:        ArcadeGameType
  name:      string
  tagline:   string
  href:      string
  art:       'truck' | 'tetromino' | 'kong'
  comingSoon?: boolean
}

const TILES: Tile[] = [
  {
    id:      'route_rush',
    name:    'Route Rush',
    tagline: 'Dodge cones · grab chairs · don\'t crash',
    href:    '/training/arcade/route-rush',
    art:     'truck',
  },
  {
    id:      'tent_tetris',
    name:    'Tent Tetris',
    tagline: 'Stack the rentals before the warehouse fills',
    href:    '/training/arcade/tent-tetris',
    art:     'tetromino',
  },
  {
    id:         'party_kong',
    name:       'Party Kong',
    tagline:    'Coming soon',
    href:       '#',
    art:        'kong',
    comingSoon: true,
  },
]

export default function ArcadeHub() {
  const router = useRouter()
  const [bests, setBests] = useState<Record<ArcadeGameType, number | null>>({
    route_rush: null,
    tent_tetris: null,
    party_kong: null,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user.id
      if (!uid) return

      const types: ArcadeGameType[] = ['route_rush', 'tent_tetris']
      const results = await Promise.all(
        types.map(async (gt) => {
          const { data } = await supabase
            .from('game_scores')
            .select('score')
            .eq('player_id', uid)
            .eq('game_type', gt)
            .order('score', { ascending: false })
            .limit(1)
            .maybeSingle()
          return [gt, data?.score ?? null] as const
        }),
      )
      if (cancelled) return
      const next = { ...bests }
      for (const [gt, s] of results) next[gt] = s
      setBests(next)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="screen"
      style={{
        background:  C.bgGlow,
        color:       C.text,
        minHeight:   '100vh',
        fontFamily:  'inherit',
        display:     'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 10px', position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => router.push('/training')}
            aria-label="Back to Training"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.7)',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: 0,
            }}
          >
            ← Training
          </button>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.28em',
              color: C.gold,
              textTransform: 'uppercase',
            }}
          >
            Arcade
          </div>
        </div>

        <div
          style={{
            marginTop:    18,
            fontSize:     46,
            fontWeight:   900,
            lineHeight:   0.95,
            letterSpacing:'-0.035em',
            textTransform:'uppercase',
            color:        C.text,
          }}
        >
          PartyTime
          <br />
          <span style={{ color: C.gold }}>Arcade</span>
        </div>
        <div
          style={{
            marginTop:  10,
            fontSize:   13.5,
            color:      C.muted,
            maxWidth:   '36ch',
            lineHeight: 1.4,
          }}
        >
          High scores live across the whole crew. Top of the board buys lunch.
        </div>
      </div>

      {/* ── TILES ────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '14px 18px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1,
        }}
      >
        {TILES.map((t) => (
          <ArcadeTile
            key={t.id}
            tile={t}
            best={bests[t.id]}
            onPlay={() => { if (!t.comingSoon) router.push(t.href) }}
          />
        ))}
      </div>
    </div>
  )
}

function ArcadeTile({ tile, best, onPlay }: { tile: Tile; best: number | null; onPlay: () => void }) {
  const locked = !!tile.comingSoon
  return (
    <div
      style={{
        background:  locked ? C.lockedBg : C.card,
        border:      `1px solid ${locked ? C.lockedBd : C.cardBd}`,
        borderRadius:18,
        padding:     '16px 16px 14px',
        display:     'flex',
        flexDirection: 'column',
        gap:         12,
        opacity:     locked ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ArcadeArt kind={tile.art} dim={locked} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize:     22,
              fontWeight:   900,
              letterSpacing:'-0.02em',
              color:        locked ? C.lockedFg : C.text,
              lineHeight:   1.05,
              textTransform:'uppercase',
            }}
          >
            {tile.name}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize:  12.5,
              color:     locked ? C.lockedFg : C.muted,
              lineHeight:1.35,
            }}
          >
            {tile.tagline}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: locked ? C.lockedFg : 'rgba(255,255,255,0.45)',
            }}
          >
            Your Best
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize:  20,
              fontWeight: 900,
              color:     locked ? C.lockedFg : C.gold,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {locked ? '—' : best != null ? best.toLocaleString() : '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={locked}
          style={{
            background:    locked ? 'rgba(255,255,255,0.05)' : C.gold,
            color:         locked ? C.lockedFg : '#0A0A14',
            border:        0,
            borderRadius:  999,
            padding:       '12px 22px',
            fontSize:      14,
            fontWeight:    900,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily:    'inherit',
            cursor:        locked ? 'not-allowed' : 'pointer',
            boxShadow:     locked ? 'none' : '0 6px 24px -10px rgba(255,184,0,0.6)',
          }}
        >
          {locked ? 'Soon' : 'Play'}
        </button>
      </div>
    </div>
  )
}

function ArcadeArt({ kind, dim }: { kind: Tile['art']; dim: boolean }) {
  const opacity = dim ? 0.35 : 1
  if (kind === 'truck') {
    return (
      <div
        style={{
          width: 72, height: 72, borderRadius: 14,
          background: 'linear-gradient(135deg, #0000DD 0%, #000088 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          opacity,
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <rect x="6" y="14" width="22" height="14" rx="2" fill="#FFFFFF"/>
          <rect x="28" y="18" width="9" height="10" rx="2" fill="#FFB800"/>
          <circle cx="13" cy="32" r="3" fill="#0A0A14"/>
          <circle cx="32" cy="32" r="3" fill="#0A0A14"/>
          <rect x="9" y="17" width="16" height="2" fill="#0000FF"/>
          <rect x="9" y="20.5" width="16" height="1.4" fill="#0000FF"/>
        </svg>
      </div>
    )
  }
  if (kind === 'tetromino') {
    return (
      <div
        style={{
          width: 72, height: 72, borderRadius: 14,
          background: 'linear-gradient(135deg, #1a1a3a 0%, #08081a 100%)',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          gap: 2,
          padding: 8,
          flexShrink: 0,
          boxSizing: 'border-box',
          opacity,
        }}
      >
        {/* Stylized falling pieces */}
        <div style={{ gridArea: '2 / 1 / 3 / 3', background: '#FFB800', borderRadius: 2 }} />
        <div style={{ gridArea: '3 / 2 / 4 / 4', background: '#0000EE', borderRadius: 2 }} />
        <div style={{ gridArea: '4 / 1 / 5 / 5', background: '#FF6600', borderRadius: 2 }} />
      </div>
    )
  }
  // kong placeholder
  return (
    <div
      style={{
        width: 72, height: 72, borderRadius: 14,
        background: 'linear-gradient(135deg, #1a1a2a 0%, #0a0a16 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        opacity,
      }}
    >
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="8" y="6" width="24" height="4" fill="#FFB800"/>
        <rect x="10" y="14" width="20" height="4" fill="#FFB800"/>
        <rect x="8" y="22" width="24" height="4" fill="#FFB800"/>
        <rect x="10" y="30" width="20" height="4" fill="#FFB800"/>
        <rect x="14" y="6" width="2" height="32" fill="#0A0A14"/>
        <rect x="26" y="6" width="2" height="32" fill="#0A0A14"/>
      </svg>
    </div>
  )
}
