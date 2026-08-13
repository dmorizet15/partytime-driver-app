'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useGameScore } from '@/hooks/arcade/useGameScore'
import * as sound from '@/lib/arcade/sound'
import GameLeaderboard from './GameLeaderboard'

// ─── Difficulty (tunable — exposed at top, do not bury) ───────────────────────
const FOUR_CHANCE = 0.25   // odds a spawned tile is a 4 instead of a 2
const SURGE_TILE  = 128    // extra spawns begin once this tile exists
const SURGE_EVERY = 7      // ...then every Nth move drops a second tile

// ─── Board geometry ───────────────────────────────────────────────────────────
const SIZE = 4
const STEP = 25.75   // cell pitch, % of board
const TILE = 22.75   // tile size, % of board

// ─── Tile ladder — single exported data array (edit this block for a new skin) ─
// value, name, icon key, bg, fg. Colors mapped to the PTR palette and tuned for
// legibility on the arcade's dark cabinet board; the gold family anchors the top
// to match the rest of the arcade (#FFB800).
export type LadderTier = {
  v:    number
  name: string
  icon: keyof typeof ICONS
  bg:   string
  fg:   string
}

const ICONS = {
  fold:  '<path d="M8 3.5 7 13M16 3.5 17 13M6 13h12M8 13l-2 7.5M16 13l2 7.5"/>',
  chiv:  '<path d="M9 3.5h6M9 3.5v8M15 3.5v8M11 5.5h2M11 8h2M6.5 11.5h11M9 11.5v9M15 11.5v9"/>',
  t6:    '<path d="M3.5 9.5h17M6 9.5v10M18 9.5v10"/>',
  t8:    '<path d="M2.5 9.5h19M5 9.5v10M19 9.5v10M12 9.5v10"/>',
  rnd:   '<ellipse cx="12" cy="9" rx="9" ry="3.5"/><path d="M12 12.5v8M8 20.5h8"/>',
  tentS: '<path d="M12 6 6 11v9h12v-9z"/><path d="M6 11h12"/>',
  tentM: '<path d="M12 4.5 4 10.5v10h16v-10z"/><path d="M4 10.5h16M12 20.5v-6h0"/>',
  tentL: '<path d="M12 3.5 2.5 10.5v10h19v-10z"/><path d="M2.5 10.5h19M9 20.5v-6h6v6"/>',
  tentXL:'<path d="M2 20.5v-7l5-4.5 5 4.5 5-4.5 5 4.5v7z"/><path d="M2 13.5h20"/>',
  tentXXL:'<path d="M1.5 20.5v-6l4-3.5 3.5 3 3-3.5 3 3.5 3.5-3 4 3.5v6z"/><path d="M1.5 14.5h21M8 20.5v-4h4v4"/>',
  sail:  '<path d="M1.5 20.5c4-1.5 5-3 8.5-9.5l2.5 3 2.5-3c3.5 6.5 4.5 8 8.5 9.5z"/><path d="M1.5 20.5c4-1.8 7-1.8 10.5-.4 3.5-1.4 6.5-1.4 10.5.4"/>',
} as const

export const LADDER: LadderTier[] = [
  { v: 2,    name: 'Folding Chair',  icon: 'fold',    bg: '#DCE6EF', fg: '#10131C' },
  { v: 4,    name: 'Chiavari Chair', icon: 'chiv',    bg: '#9DB0FF', fg: '#10131C' },
  { v: 8,    name: '6 ft Table',     icon: 't6',      bg: '#5C7AFF', fg: '#FFFFFF' },
  { v: 16,   name: '8 ft Table',     icon: 't8',      bg: '#2A3AE0', fg: '#FFFFFF' },
  { v: 32,   name: '60" Round',      icon: 'rnd',     bg: '#7B3FE4', fg: '#FFFFFF' },
  { v: 64,   name: '10×10 Tent',     icon: 'tentS',   bg: '#C42FA6', fg: '#FFFFFF' },
  { v: 128,  name: '15×15 Tent',     icon: 'tentM',   bg: '#EF4444', fg: '#FFFFFF' },
  { v: 256,  name: '20×20 Tent',     icon: 'tentL',   bg: '#FF6B2C', fg: '#FFFFFF' },
  { v: 512,  name: '20×40 Tent',     icon: 'tentXL',  bg: '#F0930E', fg: '#201200' },
  { v: 1024, name: '30×60 Tent',     icon: 'tentXXL', bg: '#FFC21E', fg: '#201200' },
  { v: 2048, name: '40×100 Tent',    icon: 'sail',    bg: '#FFF3D6', fg: '#10131C' },
]
const GEAR: Record<number, LadderTier> = Object.fromEntries(LADDER.map((g) => [g.v, g]))
const TOP_VALUE = LADDER[LADDER.length - 1].v

// ─── Arcade palette (mirrors ArcadeHub / GameLeaderboard) ─────────────────────
const C = {
  bg:      '#080814',
  bgGlow:  'radial-gradient(circle at 20% -10%, rgba(0,0,255,0.28), transparent 55%), radial-gradient(circle at 90% 110%, rgba(255,184,0,0.14), transparent 55%), #080814',
  board:   'rgba(20, 22, 38, 0.85)',
  boardBd: 'rgba(255,255,255,0.08)',
  cell:    'rgba(255,255,255,0.04)',
  panelBg: 'rgba(20, 20, 32, 0.78)',
  panelBd: 'rgba(255,255,255,0.08)',
  gold:    '#FFB800',
  ink:     '#0A0A14',
  text:    '#ffffff',
  muted:   'rgba(255,255,255,0.55)',
} as const

const money = (n: number) => '$' + Math.floor(n).toLocaleString('en-US')

// ─── Model ────────────────────────────────────────────────────────────────────
type TileT = { id: number; r: number; c: number; v: number; fresh: boolean; merged: boolean }
type Dir = 'up' | 'down' | 'left' | 'right'
type Overlay = 'none' | 'win' | 'gameover'
const VEC: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }

export default function LoadOutGame() {
  const router = useRouter()
  const { submitScore } = useGameScore()

  // Mutable model lives in refs; React state mirrors it for render.
  const gridRef      = useRef<(TileT | null)[][]>(makeGrid())
  const tilesRef     = useRef<TileT[]>([])
  const loadedRef    = useRef<Record<number, number>>({})
  const uidRef       = useRef<number>(1)
  const scoreRef     = useRef<number>(0)
  const wonRef       = useRef<boolean>(false)
  const deadRef      = useRef<boolean>(false)
  const moveCountRef = useRef<number>(0)
  const prevMaxRef   = useRef<number>(0)   // highest tile made so far (level-up detector)
  const levelUpRef   = useRef<number>(0)   // count of new-highest-tile events this run
  const fxIdRef      = useRef<number>(0)
  const audioInitRef = useRef<boolean>(false)
  const boardRef     = useRef<HTMLDivElement | null>(null)

  const [tiles, setTiles]     = useState<TileT[]>([])
  const [loaded, setLoaded]   = useState<Record<number, number>>({})
  const [score, setScore]     = useState<number>(0)
  const [best, setBest]       = useState<number>(0)
  const [isNewBest, setNewB]  = useState<boolean>(false)
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [userId, setUserId]   = useState<string | null>(null)
  const [muted, setMutedState] = useState<boolean>(false)
  const [fx, setFx]           = useState<{ id: number; n: number; finale: boolean } | null>(null)

  // Start audio on the first gesture (browsers block it before one).
  const ensureAudio = useCallback(() => {
    if (audioInitRef.current) return
    audioInitRef.current = true
    sound.unlock()
    if (!sound.isMuted()) sound.startMusic()
  }, [])

  const toggleMute = useCallback(() => {
    sound.unlock()
    const next = !sound.isMuted()
    sound.setMuted(next)
    setMutedState(next)
    if (next) sound.stopMusic()
    else sound.startMusic()
  }, [])

  // Escalating level-up celebration + board shake (imperative so it re-fires).
  const triggerFx = useCallback((n: number, finale: boolean) => {
    setFx({ id: ++fxIdRef.current, n, finale })
    const i = finale ? 6 : Math.min(5, n)
    const el = boardRef.current
    if (el && i >= 3 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const cls = finale ? 'lo-shk3' : i >= 5 ? 'lo-shk3' : 'lo-shk2'
      el.classList.remove('lo-shk2', 'lo-shk3')
      void el.offsetWidth
      el.classList.add(cls)
    }
  }, [])

  // Load personal best + user on mount.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: sess } = await supabase.auth.getSession()
      const uid = sess.session?.user.id ?? null
      if (cancelled) return
      setUserId(uid)
      if (!uid) return
      const { data } = await supabase
        .from('game_scores')
        .select('score')
        .eq('player_id', uid)
        .eq('game_type', 'load_out')
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      setBest(data?.score ?? 0)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const commit = useCallback(() => {
    setTiles([...tilesRef.current])
    setLoaded({ ...loadedRef.current })
    setScore(scoreRef.current)
  }, [])

  const addTile = useCallback(() => {
    const spots: { r: number; c: number }[] = []
    const grid = gridRef.current
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) spots.push({ r, c })
    if (!spots.length) return
    const { r, c } = spots[Math.floor(Math.random() * spots.length)]
    const v = Math.random() < FOUR_CHANCE ? 4 : 2
    const t: TileT = { id: uidRef.current++, r, c, v, fresh: true, merged: false }
    loadedRef.current[v] = (loadedRef.current[v] || 0) + 1
    grid[r][c] = t
    tilesRef.current.push(t)
  }, [])

  const newGame = useCallback(() => {
    gridRef.current   = makeGrid()
    tilesRef.current  = []
    loadedRef.current = {}
    scoreRef.current  = 0
    wonRef.current    = false
    deadRef.current   = false
    moveCountRef.current = 0
    levelUpRef.current = 0
    setNewB(false)
    setFx(null)
    setOverlay('none')
    addTile()
    addTile()
    prevMaxRef.current = tilesRef.current.reduce((m, t) => Math.max(m, t.v), 0)
    commit()
  }, [addTile, commit])

  const finishGame = useCallback(() => {
    deadRef.current = true
    const finalS = Math.floor(scoreRef.current)
    setOverlay('gameover')
    setBest((prev) => {
      if (finalS > prev) { setNewB(true); return finalS }
      return prev
    })
    if (userId && finalS > 0) submitScore('load_out', finalS).catch(() => {})
  }, [submitScore, userId])

  const move = useCallback((dir: Dir) => {
    if (deadRef.current || overlay === 'gameover') return
    ensureAudio()
    const grid = gridRef.current
    const [dr, dc] = VEC[dir]
    const rs = Array.from({ length: SIZE }, (_, i) => i)
    const cs = Array.from({ length: SIZE }, (_, i) => i)
    if (dir === 'down') rs.reverse()
    if (dir === 'right') cs.reverse()

    let moved = false
    let mergedMax = 0
    for (const t of tilesRef.current) { t.fresh = false; t.merged = false }

    for (const r of rs) for (const c of cs) {
      const t = grid[r][c]
      if (!t) continue
      let nr = r, nc = c
      while (inBounds(nr + dr, nc + dc) && !grid[nr + dr][nc + dc]) { nr += dr; nc += dc }
      const ar = nr + dr, ac = nc + dc
      const target = inBounds(ar, ac) ? grid[ar][ac] : null

      if (target && target.v === t.v && !target.merged) {
        grid[r][c] = null
        target.v *= 2
        target.merged = true
        loadedRef.current[target.v] = (loadedRef.current[target.v] || 0) + 1
        tilesRef.current = tilesRef.current.filter((x) => x !== t)
        scoreRef.current += target.v
        if (target.v > mergedMax) mergedMax = target.v
        moved = true
      } else if (nr !== r || nc !== c) {
        grid[r][c] = null
        grid[nr][nc] = t
        t.r = nr; t.c = nc
        moved = true
      }
    }

    if (!moved) return
    moveCountRef.current++
    addTile()
    if (topTile() >= SURGE_TILE && moveCountRef.current % SURGE_EVERY === 0) addTile()
    commit()

    // sound: swipe every move, merge clank scaled to the tile just made
    sound.sfx.swipe()
    if (mergedMax > 0) sound.sfx.merge(Math.max(0, LADDER.findIndex((g) => g.v === mergedMax)))

    // level-up = a merge produced a NEW highest tile (not a spawned 2/4)
    if (mergedMax > prevMaxRef.current) {
      prevMaxRef.current = mergedMax
      levelUpRef.current += 1
      const n = levelUpRef.current
      const finale = mergedMax === TOP_VALUE && !wonRef.current
      if (finale) wonRef.current = true
      triggerFx(n, finale)
      if (finale) {
        sound.sfx.finale()
        // let the finale burst play over the board before the win card
        setTimeout(() => setOverlay('win'), 1500)
      } else if (n % 3 === 0) {
        sound.sfx.milestone()
      }
    }

    if (!canMove()) setTimeout(() => finishGame(), 160)
  }, [addTile, commit, ensureAudio, finishGame, overlay, triggerFx])

  const topTile = () => tilesRef.current.reduce((m, t) => Math.max(m, t.v), 0)
  const canMove = () => {
    const grid = gridRef.current
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) return true
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c]!.v
      if (inBounds(r + 1, c) && grid[r + 1][c]!.v === v) return true
      if (inBounds(r, c + 1) && grid[r][c + 1]!.v === v) return true
    }
    return false
  }

  // Start a fresh board on mount.
  useEffect(() => { newGame() }, [newGame])

  // Reflect the saved mute preference; stop music when leaving the game.
  useEffect(() => {
    setMutedState(sound.isMuted())
    return () => { sound.stopMusic() }
  }, [])

  // Keyboard.
  useEffect(() => {
    const KEYS: Record<string, Dir> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    }
    function onKey(e: KeyboardEvent) {
      const dir = KEYS[e.key]
      if (dir) { e.preventDefault(); move(dir) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  // Touch swipe on the board.
  const swipe = useRef<{ x: number; y: number; on: boolean }>({ x: 0, y: 0, on: false })
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0]
    swipe.current = { x: t.clientX, y: t.clientY, on: true }
  }
  const onTouchMove = (e: React.TouchEvent) => { if (swipe.current.on) e.preventDefault() }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!swipe.current.on) return
    swipe.current.on = false
    const t = e.changedTouches[0]
    const dx = t.clientX - swipe.current.x
    const dy = t.clientY - swipe.current.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
  }

  const totalPieces = LADDER.reduce((n, g) => n + (loaded[g.v] || 0), 0)

  return (
    <div
      style={{
        height: '100dvh',
        background: C.bgGlow,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: C.text,
        fontFamily: 'inherit',
        overflow: 'hidden',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {/* reduced-motion + tile animations */}
      <style>{`
        .lo-tile { transition: transform .11s ease-out; will-change: transform; }
        @keyframes lo-pop  { from { transform: var(--t) scale(.4); opacity: 0 } }
        @keyframes lo-thump{ 0% { transform: var(--t) scale(1) } 45% { transform: var(--t) scale(1.14) } 100% { transform: var(--t) scale(1) } }
        .lo-new   { animation: lo-pop  .16s ease-out; }
        .lo-merged{ animation: lo-thump .16s ease-out; }

        /* level-up celebration */
        @keyframes lo-flash { from { opacity: var(--op); } to { opacity: 0; } }
        @keyframes lo-ring  { 0% { opacity:.9; transform:translate(-50%,-50%) scale(.15);} 100% { opacity:0; transform:translate(-50%,-50%) scale(var(--sc));} }
        @keyframes lo-part  { 0% { opacity:1; transform:translate(-50%,-50%);} 100% { opacity:0; transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy)));} }
        @keyframes lo-shk2  { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-3px,1px)} 40%{transform:translate(3px,-1px)} 60%{transform:translate(-2px,1px)} 80%{transform:translate(2px,-1px)} }
        @keyframes lo-shk3  { 0%,100%{transform:translate(0,0)} 15%{transform:translate(-6px,2px)} 30%{transform:translate(6px,-2px)} 45%{transform:translate(-5px,2px)} 60%{transform:translate(5px,-2px)} 75%{transform:translate(-3px,1px)} 90%{transform:translate(3px,-1px)} }
        .lo-shk2 { animation: lo-shk2 .34s ease-out; }
        .lo-shk3 { animation: lo-shk3 .5s ease-out; }
        .lo-ring { position:absolute; left:50%; top:50%; border-radius:50%; border:3px solid #FFB800; pointer-events:none; }
        .lo-part { position:absolute; left:50%; top:50%; border-radius:50%; pointer-events:none; }

        @media (prefers-reduced-motion: reduce) {
          .lo-tile, .lo-new, .lo-merged { transition: none !important; animation: none !important; }
          .lo-shk2, .lo-shk3 { animation: none !important; }
          .lo-part { display: none !important; }
          .lo-ring { animation: none !important; opacity: .5 !important; transform: translate(-50%,-50%) scale(1.6) !important; }
        }
      `}</style>

      {/* Top bar */}
      <div
        style={{
          width: 430, maxWidth: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 10px', boxSizing: 'border-box', flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/training/arcade')}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
            padding: '8px 4px', minHeight: 44,
          }}
        >
          ← Arcade
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em', color: C.gold, textTransform: 'uppercase' }}>
            Load Out
          </div>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
            aria-pressed={!muted}
            style={{
              background: muted ? 'rgba(255,255,255,0.06)' : C.gold,
              color: muted ? C.muted : C.ink, border: `1px solid ${muted ? C.panelBd : C.gold}`,
              borderRadius: 999, cursor: 'pointer', width: 44, height: 44, minHeight: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0,
            }}
          >
            <SpeakerIcon muted={muted} />
          </button>
        </div>
      </div>

      {/* Scroll region: board + goal + manifest */}
      <div
        style={{
          flex: 1, minHeight: 0, width: 430, maxWidth: '100%',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '0 18px calc(24px + env(safe-area-inset-bottom))',
          boxSizing: 'border-box',
        }}
      >
        {/* Readouts */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <Readout label="On truck" value={money(score)} accent />
          <Readout label="Your best" value={money(best)} />
        </div>

        {/* Goal */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            padding: '9px 12px', background: C.panelBg, border: `1px solid ${C.panelBd}`,
            borderRadius: 12, fontSize: 12.5, color: C.muted,
          }}
        >
          <span
            style={{
              fontWeight: 800, fontSize: 13, color: C.ink, background: C.gold,
              padding: '3px 9px', borderRadius: 6, letterSpacing: '0.01em',
            }}
          >
            40×100
          </span>
          Merge your way up to the big top.
        </div>

        {/* Board */}
        <div
          ref={boardRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            position: 'relative', width: '100%', aspectRatio: '1',
            background: C.board, border: `1px solid ${C.boardBd}`,
            borderRadius: 16, overflow: 'hidden', touchAction: 'none',
            // Size container so every tile's `cqw` unit is BOARD-relative — this
            // is what makes the number big (≈9% of the board) with the gear icon
            // as a large watermark behind it, matching the prototype.
            containerType: 'size',
          }}
        >
          {/* empty cells */}
          {Array.from({ length: SIZE * SIZE }).map((_, i) => {
            const r = Math.floor(i / SIZE), c = i % SIZE
            return (
              <div
                key={`cell-${i}`}
                style={{
                  position: 'absolute', width: `${TILE}%`, height: `${TILE}%`,
                  left: `${c * STEP}%`, top: `${r * STEP}%`,
                  background: C.cell, borderRadius: 10,
                }}
              />
            )
          })}

          {/* tiles */}
          {tiles.map((t) => (
            <Tile key={t.id} t={t} />
          ))}

          {/* escalating level-up celebration */}
          {fx && <LevelFx key={fx.id} n={fx.n} finale={fx.finale} onDone={() => setFx(null)} />}

          {/* WIN overlay (dismissable, play continues) */}
          {overlay === 'win' && (
            <BoardVeil
              title="40×100 loaded"
              body="Full rig on the truck. Keep stacking to run the score up."
              cta="Keep stacking"
              onCta={() => setOverlay('none')}
            />
          )}
        </div>

        {/* Load manifest */}
        <div
          style={{
            marginTop: 14, border: `1px solid ${C.panelBd}`, borderRadius: 14,
            background: C.panelBg, overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '11px 13px 9px', borderBottom: `1px solid ${C.panelBd}`,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted }}>
              Load manifest
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: C.gold, fontVariantNumeric: 'tabular-nums' }}>
              {totalPieces ? `${totalPieces.toLocaleString()} pcs` : ''}
            </span>
          </div>
          {LADDER.map((g) => {
            const n = loaded[g.v] || 0
            return (
              <div
                key={g.v}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '8px 13px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: n ? 1 : 0.34,
                }}
              >
                <span
                  style={{
                    minWidth: 46, textAlign: 'center', padding: '3px 7px', borderRadius: 6,
                    fontWeight: 800, fontSize: 13, background: g.bg, color: g.fg,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {g.v}
                </span>
                <span style={{ flex: 1, fontSize: 13.5, color: C.text }}>{g.name}</span>
                <span
                  style={{
                    fontSize: 14, fontWeight: n ? 800 : 400, minWidth: 46, textAlign: 'right',
                    color: n ? C.text : C.muted, fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {n ? `×${n.toLocaleString()}` : '—'}
                </span>
              </div>
            )
          })}
        </div>

        {/* New run */}
        <button
          type="button"
          onClick={newGame}
          style={{
            marginTop: 14, width: '100%', minHeight: 48, padding: '14px 0',
            background: 'rgba(255,255,255,0.06)', color: C.text,
            border: `1px solid ${C.panelBd}`, borderRadius: 999,
            fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          New run
        </button>
      </div>

      {/* GAME OVER — full-screen modal with leaderboard */}
      {overlay === 'gameover' && (
        <GameOverModal
          score={Math.floor(score)}
          best={best}
          isNewBest={isNewBest}
          userId={userId}
          manifest={manifestLine(loaded)}
          onRestart={newGame}
          onExit={() => router.push('/training/arcade')}
        />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Readout({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: 1, background: C.panelBg, border: `1px solid ${C.panelBd}`,
        borderRadius: 12, padding: '8px 12px 9px',
      }}
    >
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 2, fontSize: 22, fontWeight: 900,
          color: accent ? C.gold : C.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
      {muted ? (
        <>
          <line x1="17" y1="9" x2="22" y2="15" />
          <line x1="22" y1="9" x2="17" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a8 8 0 0 1 0 12" />
        </>
      )}
    </svg>
  )
}

// Escalating level-up celebration: bigger flash, more rings + sparks and a
// board shake as the run climbs, culminating in the finale burst at the top tile.
function LevelFx({ n, finale, onDone }: { n: number; finale: boolean; onDone: () => void }) {
  const i = finale ? 6 : Math.min(5, n)
  const rings = finale ? 4 : i <= 1 ? 1 : i <= 3 ? 2 : 3
  const flashOp = finale ? 0.55 : 0.1 + i * 0.05
  const dur = finale ? 1500 : 700
  const partCount = finale ? 30 : i <= 2 ? 0 : i * 3
  const ringScale = finale ? 4 : 2.4 + i * 0.3

  const parts = useRef(
    Array.from({ length: partCount }, (_, k) => {
      const ang = (Math.PI * 2 * k) / Math.max(1, partCount) + Math.random() * 0.6
      const dist = (finale ? 120 : 46 + i * 12) * (0.6 + Math.random() * 0.6)
      return {
        dx: Math.cos(ang) * dist,
        dy: Math.sin(ang) * dist,
        size: finale ? 5 + Math.random() * 5 : 3 + Math.random() * 3,
        delay: Math.random() * 0.08,
        color: Math.random() < 0.3 ? '#FFFFFF' : '#FFB800',
      }
    }),
  ).current

  useEffect(() => {
    const id = setTimeout(onDone, dur + 250)
    return () => clearTimeout(id)
  }, [onDone, dur])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', inset: 0,
          background: finale
            ? 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.65), rgba(255,184,0,0.5) 42%, transparent 76%)'
            : 'radial-gradient(circle at 50% 50%, rgba(255,184,0,0.9), transparent 70%)',
          // @ts-expect-error css custom property
          '--op': flashOp,
          animation: `lo-flash ${dur}ms ease-out forwards`,
        }}
      />
      {Array.from({ length: rings }).map((_, k) => (
        <span
          key={k}
          className="lo-ring"
          style={{
            width: finale ? 80 : 54, height: finale ? 80 : 54, borderWidth: finale ? 4 : 3, opacity: 0,
            // @ts-expect-error css custom property
            '--sc': ringScale,
            animation: `lo-ring ${dur}ms ease-out ${k * (finale ? 140 : 110)}ms forwards`,
          }}
        />
      ))}
      {finale && (
        <span
          className="lo-ring"
          style={{
            width: 60, height: 60, borderColor: '#FFFFFF', borderWidth: 5, opacity: 0,
            // @ts-expect-error css custom property
            '--sc': 3,
            animation: 'lo-ring 900ms ease-out forwards',
          }}
        />
      )}
      {parts.map((p, k) => (
        <span
          key={k}
          className="lo-part"
          style={{
            width: p.size, height: p.size, background: p.color, boxShadow: `0 0 6px ${p.color}`, opacity: 0,
            // @ts-expect-error css custom property
            '--dx': `${p.dx}px`, '--dy': `${p.dy}px`,
            animation: `lo-part ${dur}ms ease-out ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  )
}

function Tile({ t }: { t: TileT }) {
  const g = GEAR[t.v] || LADDER[LADDER.length - 1]
  const digits = String(t.v).length
  const tf = `translate(${(t.c * STEP / TILE) * 100}%, ${(t.r * STEP / TILE) * 100}%)`
  // Units are `cqw` (board-relative — the board is the size container), so the
  // number reads as a big centered figure with the gear icon as a watermark
  // behind it. Bumped larger than the prototype per feedback.
  const numSize = digits >= 4 ? '6.6cqw' : digits === 3 ? '8.4cqw' : '10cqw'
  return (
    <div
      className={`lo-tile${t.fresh ? ' lo-new' : ''}${t.merged ? ' lo-merged' : ''}`}
      style={{
        position: 'absolute', width: `${TILE}%`, height: `${TILE}%`,
        left: 0, top: 0, borderRadius: 10, overflow: 'hidden',
        background: g.bg, color: g.fg,
        transform: tf,
        // @ts-expect-error custom property for keyframes
        '--t': tf,
        boxShadow: t.v === TOP_VALUE
          ? '0 0 0 2px #FFB800, 0 0 22px rgba(255,184,0,0.55), inset 0 1px 0 rgba(255,255,255,0.35)'
          : '0 2px 0 rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {/* gear icon — large watermark behind the number */}
      <svg
        viewBox="0 0 24 24" aria-hidden="true"
        style={{
          position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%,-50%)',
          width: '21cqw', height: '21cqw', strokeWidth: 1.4, fill: 'none',
          stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.22,
        }}
        dangerouslySetInnerHTML={{ __html: ICONS[g.icon] }}
      />
      {/* the number is the hero */}
      <span
        style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingBottom: '3cqw', fontWeight: 800, fontSize: numSize, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
          textShadow: g.fg === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.25)' : 'none',
        }}
      >
        {t.v}
      </span>
      {/* item name caption along the bottom edge */}
      <span
        style={{
          position: 'absolute', left: 0, right: 0, bottom: '1.6cqw', textAlign: 'center',
          fontWeight: 700, fontSize: '2.8cqw', textTransform: 'uppercase', letterSpacing: '0.06em',
          opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 .8cqw',
        }}
      >
        {g.name}
      </span>
    </div>
  )
}

function BoardVeil({ title, body, cta, onCta }: { title: string; body: string; cta: string; onCta: () => void }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, background: 'rgba(8,10,18,0.9)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: 24, textAlign: 'center', zIndex: 5,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1 }}>
        {title}
      </div>
      <div style={{ fontSize: 13.5, color: C.muted, maxWidth: '26ch', lineHeight: 1.4 }}>{body}</div>
      <button
        type="button"
        onClick={onCta}
        style={{
          minHeight: 48, padding: '13px 26px', background: C.gold, color: C.ink, border: 0,
          borderRadius: 999, fontSize: 14, fontWeight: 900, letterSpacing: '0.06em',
          textTransform: 'uppercase', fontFamily: 'inherit', cursor: 'pointer',
          boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
        }}
      >
        {cta}
      </button>
    </div>
  )
}

function GameOverModal({
  score, best, isNewBest, userId, manifest, onRestart, onExit,
}: {
  score: number
  best: number
  isNewBest: boolean
  userId: string | null
  manifest: string
  onRestart: () => void
  onExit: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(8,8,18,0.72)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: 16, boxSizing: 'border-box', overflowY: 'auto', zIndex: 40,
      }}
    >
      <div
        style={{
          width: 430, maxWidth: '100%', margin: '0 auto',
          background: 'rgba(20,20,32,0.94)', border: `1px solid ${C.panelBd}`,
          borderRadius: 22, padding: '22px 18px 18px', textAlign: 'center',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: C.muted }}>
          Truck&apos;s full
        </div>
        <div
          style={{
            marginTop: 6, fontSize: 54, fontWeight: 900, color: C.gold,
            letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
          }}
        >
          {money(score)}
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted }}>
          Loaded
        </div>
        {manifest && (
          <div style={{ marginTop: 8, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{manifest}</div>
        )}

        {isNewBest ? (
          <div
            style={{
              marginTop: 12, display: 'inline-block', background: 'rgba(31,191,107,0.18)',
              color: '#3FE08A', border: '1px solid rgba(31,191,107,0.4)', padding: '5px 13px',
              borderRadius: 999, fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
            }}
          >
            New Best
          </div>
        ) : best > 0 ? (
          <div style={{ marginTop: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: C.muted, textTransform: 'uppercase' }}>
            Best · <span style={{ color: C.text }}>{money(best)}</span>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <GameLeaderboard gameType="load_out" currentPlayerId={userId} emphasizeScore={score} />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onExit}
            style={{
              flex: 1, minHeight: 48, padding: '14px 0', background: 'rgba(255,255,255,0.06)',
              color: C.text, border: `1px solid ${C.panelBd}`, borderRadius: 999,
              fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Exit
          </button>
          <button
            type="button"
            onClick={onRestart}
            style={{
              flex: 2, minHeight: 48, padding: '14px 0', background: C.gold, color: C.ink, border: 0,
              borderRadius: 999, fontSize: 14, fontWeight: 900, letterSpacing: '0.08em',
              textTransform: 'uppercase', fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
            }}
          >
            New run
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────
function makeGrid(): (TileT | null)[][] {
  return Array.from({ length: SIZE }, () => Array<TileT | null>(SIZE).fill(null))
}
function inBounds(r: number, c: number) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE }
function manifestLine(loaded: Record<number, number>): string {
  return LADDER.filter((g) => loaded[g.v]).reverse().slice(0, 4)
    .map((g) => `${loaded[g.v]} × ${g.name}`).join(' · ')
}
