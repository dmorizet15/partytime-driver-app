'use client'

import { useState } from 'react'
import { useGameLeaderboard } from '@/hooks/arcade/useGameLeaderboard'
import type { ArcadeGameType } from '@/hooks/arcade/useGameScore'

type Props = {
  gameType:        ArcadeGameType
  currentPlayerId: string | null
  emphasizeScore?: number | null
}

const C = {
  panelBg:    'rgba(20, 20, 32, 0.78)',
  panelBorder:'rgba(255,255,255,0.08)',
  tabActive:  '#FFB800',
  tabIdle:    'rgba(255,255,255,0.45)',
  divider:    'rgba(255,255,255,0.06)',
  rowBg:      'transparent',
  rowMine:    'rgba(255,184,0,0.18)',
  rowMineBd:  'rgba(255,184,0,0.4)',
  text:       '#ffffff',
  muted:      'rgba(255,255,255,0.55)',
  rank:       'rgba(255,255,255,0.4)',
  gold:       '#FFB800',
} as const

export default function GameLeaderboard({ gameType, currentPlayerId, emphasizeScore }: Props) {
  const [view, setView] = useState<'today' | 'all_time'>('today')
  const { today, allTime, loading } = useGameLeaderboard(gameType)
  const rows = view === 'today' ? today : allTime

  return (
    <div
      style={{
        background:   C.panelBg,
        border:       `1px solid ${C.panelBorder}`,
        borderRadius: 16,
        padding:      '14px 14px 12px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        width:        '100%',
        boxSizing:    'border-box',
      }}
    >
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['today', 'all_time'] as const).map((v) => {
          const active = v === view
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              style={{
                flex: 1,
                background:   active ? 'rgba(255,184,0,0.16)' : 'transparent',
                color:        active ? C.tabActive : C.tabIdle,
                border:       active ? `1px solid rgba(255,184,0,0.35)` : `1px solid ${C.panelBorder}`,
                borderRadius: 999,
                padding:      '7px 10px',
                fontSize:     11,
                fontWeight:   800,
                letterSpacing:'0.16em',
                textTransform:'uppercase',
                fontFamily:   'inherit',
                cursor:       'pointer',
              }}
            >
              {v === 'today' ? 'Today' : 'All Time'}
            </button>
          )
        })}
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {loading && rows.length === 0 ? (
          <EmptyState label="Loading…" />
        ) : rows.length === 0 ? (
          <EmptyState label="No scores yet" />
        ) : (
          rows.map((row, i) => {
            const mine = !!currentPlayerId && row.player_id === currentPlayerId
            const emphasize =
              mine && typeof emphasizeScore === 'number' && row.score === emphasizeScore
            return (
              <div
                key={row.id}
                style={{
                  display:       'flex',
                  alignItems:    'center',
                  gap:           10,
                  padding:       '9px 10px',
                  borderRadius:  10,
                  background:    mine ? C.rowMine : C.rowBg,
                  border:        mine ? `1px solid ${C.rowMineBd}` : `1px solid transparent`,
                  marginBottom:  i === rows.length - 1 ? 0 : 4,
                  boxShadow:     emphasize ? '0 0 0 1px rgba(255,184,0,0.6)' : undefined,
                }}
              >
                <div
                  style={{
                    width:        24,
                    fontSize:     12,
                    fontWeight:   800,
                    letterSpacing:'0.04em',
                    color:        mine ? C.gold : C.rank,
                    textAlign:    'center',
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    flex:       1,
                    minWidth:   0,
                    fontSize:   14,
                    fontWeight: mine ? 800 : 600,
                    color:      mine ? C.gold : C.text,
                    overflow:   'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.display}
                </div>
                <div
                  style={{
                    fontSize:   15,
                    fontWeight: 900,
                    color:      mine ? C.gold : C.text,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {row.score.toLocaleString()}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding:    '24px 8px',
        textAlign:  'center',
        fontSize:   13,
        fontWeight: 600,
        color:      'rgba(255,255,255,0.4)',
        letterSpacing:'0.02em',
      }}
    >
      {label}
    </div>
  )
}
