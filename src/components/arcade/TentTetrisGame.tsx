'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useGameScore } from '@/hooks/arcade/useGameScore'
import GameLeaderboard from './GameLeaderboard'

// ─── Geometry ────────────────────────────────────────────────────────────────
const W       = 390
const H       = 720
const CELL    = 26
const COLS    = 10
const ROWS    = 20
const BOARD_X = 10
const BOARD_Y = 20
const BOARD_W = COLS * CELL          // 260
const BOARD_H = ROWS * CELL          // 520
const PANEL_X = BOARD_X + BOARD_W + 10 // 280
const PANEL_W = W - PANEL_X - 10       // 100

// ─── Game tuning ─────────────────────────────────────────────────────────────
const GRAVITY_START_MS = 800
const GRAVITY_FLOOR_MS = 80
const GRAVITY_STEP_MS  = 75
const LOCK_DELAY_MS    = 280
const FLASH_MS         = 80
const SHAKE_MS         = 120
const SOFT_DROP_MULT   = 0.06  // soft drop interval = gravity * this
const HARD_DROP_PER_CELL = 2

const LINE_SCORE = { 1: 100, 2: 300, 3: 500, 4: 800 } as const

const WALL_KICK_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
]

// ─── Tetromino definitions ───────────────────────────────────────────────────
// Each rotation is an array of [col, row] offsets within the piece bounding box.

type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'

type PieceDef = {
  kind:     PieceKind
  name:     string
  color:    string
  rots:     Array<Array<[number, number]>>
}

const PIECES: Record<PieceKind, PieceDef> = {
  I: {
    kind: 'I', name: 'Pole Tent', color: '#0000EE',
    rots: [
      [[0,1],[1,1],[2,1],[3,1]],
      [[2,0],[2,1],[2,2],[2,3]],
      [[0,2],[1,2],[2,2],[3,2]],
      [[1,0],[1,1],[1,2],[1,3]],
    ],
  },
  O: {
    kind: 'O', name: 'Frame Tent', color: '#FFB800',
    rots: [
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[2,1]],
    ],
  },
  T: {
    kind: 'T', name: 'T-Top', color: '#FF6600',
    rots: [
      [[1,0],[0,1],[1,1],[2,1]],
      [[1,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[2,1],[1,2]],
      [[1,0],[0,1],[1,1],[1,2]],
    ],
  },
  S: {
    kind: 'S', name: 'Sidewall', color: '#00AA44',
    rots: [
      [[1,0],[2,0],[0,1],[1,1]],
      [[1,0],[1,1],[2,1],[2,2]],
      [[1,1],[2,1],[0,2],[1,2]],
      [[0,0],[0,1],[1,1],[1,2]],
    ],
  },
  Z: {
    kind: 'Z', name: 'Canopy', color: '#DD1111',
    rots: [
      [[0,0],[1,0],[1,1],[2,1]],
      [[2,0],[1,1],[2,1],[1,2]],
      [[0,1],[1,1],[1,2],[2,2]],
      [[1,0],[0,1],[1,1],[0,2]],
    ],
  },
  J: {
    kind: 'J', name: 'J-Frame', color: '#0099EE',
    rots: [
      [[0,0],[0,1],[1,1],[2,1]],
      [[1,0],[2,0],[1,1],[1,2]],
      [[0,1],[1,1],[2,1],[2,2]],
      [[1,0],[1,1],[0,2],[1,2]],
    ],
  },
  L: {
    kind: 'L', name: 'L-Frame', color: '#FF8800',
    rots: [
      [[2,0],[0,1],[1,1],[2,1]],
      [[1,0],[1,1],[1,2],[2,2]],
      [[0,1],[1,1],[2,1],[0,2]],
      [[0,0],[1,0],[1,1],[1,2]],
    ],
  },
}

const PIECE_ORDER: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

// ─── Types ───────────────────────────────────────────────────────────────────
type Cell    = { color: string } | null
type Board   = Cell[][]
type Falling = {
  kind:      PieceKind
  rot:       0 | 1 | 2 | 3
  col:       number  // piece bounding box origin col
  row:       number  // piece bounding box origin row
  lockTimer: number  // ms since touchdown
  touching:  boolean
}

type Phase = 'start' | 'falling' | 'flashing' | 'shaking' | 'gameover'

type GameState = {
  board:        Board
  falling:      Falling | null
  bag:          PieceKind[]
  next:         PieceKind
  score:        number
  level:        number
  lines:        number
  gravity:      number  // ms per row drop
  gravityT:     number  // ms accumulator
  softDrop:     boolean
  clearRows:    number[]
  phaseT:       number
  shakeOffset:  number
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function TentTetrisGame() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef  = useRef<GameState>(makeFreshState())
  const phaseRef  = useRef<Phase>('start')
  const rafRef    = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const startFxT  = useRef<number>(0)
  const fontFamilyRef = useRef<string>('system-ui, sans-serif')

  const [phase, setPhase] = useState<Phase>('start')
  const [scoreD, setScoreD] = useState<number>(0)
  const [linesD, setLinesD] = useState<number>(0)
  const [levelD, setLevelD] = useState<number>(1)
  const [final,  setFinal]  = useState<number>(0)
  const [best,   setBest]   = useState<number>(0)
  const [isNewBest, setIsNewBest] = useState<boolean>(false)
  const [userId, setUserId] = useState<string | null>(null)

  const { submitScore } = useGameScore()

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
        .eq('game_type', 'tent_tetris')
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      setBest(data?.score ?? 0)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Canvas + game loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rawCtx = canvas.getContext('2d')
    if (!rawCtx) return
    const ctx: CanvasRenderingContext2D = rawCtx

    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width  = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width  = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Resolve the Outfit family from the canvas's computed style so canvas
    // font strings hit the same font next/font registered for the React tree.
    const family = window.getComputedStyle(canvas).fontFamily || 'system-ui, sans-serif'
    fontFamilyRef.current = family

    function frame(ts: number) {
      const last = lastTsRef.current ?? ts
      const dt = Math.min(64, ts - last)
      lastTsRef.current = ts
      startFxT.current += dt

      const s = stateRef.current
      if (phaseRef.current === 'falling') {
        tickFalling(s, dt)
        if (s.falling == null) {
          if (s.clearRows.length > 0) {
            phaseRef.current = 'flashing'
            s.phaseT = 0
          } else {
            // Locked with no line clears — spawn next piece immediately.
            spawnNext(s)
            if (s.falling == null) {
              triggerGameOver()
              return
            }
          }
        }
        syncHud()
      } else if (phaseRef.current === 'flashing') {
        s.phaseT += dt
        if (s.phaseT >= FLASH_MS) {
          // Remove cleared rows and shift down.
          applyLineClears(s)
          phaseRef.current = 'shaking'
          s.phaseT = 0
        }
      } else if (phaseRef.current === 'shaking') {
        s.phaseT += dt
        s.shakeOffset = Math.sin((s.phaseT / SHAKE_MS) * Math.PI * 4) * 3
        if (s.phaseT >= SHAKE_MS) {
          s.shakeOffset = 0
          spawnNext(s)
          if (s.falling == null) {
            // Spawn collision → game over.
            triggerGameOver()
            return
          }
          phaseRef.current = 'falling'
          syncHud()
        }
      }

      ctx.clearRect(0, 0, W, H)
      drawScene(ctx, s, phaseRef.current, startFxT.current, fontFamilyRef.current)
      rafRef.current = requestAnimationFrame(frame)
    }

    function syncHud() {
      const s = stateRef.current
      if (Math.floor(s.score) !== scoreD) setScoreD(Math.floor(s.score))
      if (s.lines !== linesD)             setLinesD(s.lines)
      if (s.level !== levelD)             setLevelD(s.level)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerGameOver = useCallback(() => {
    const s = stateRef.current
    const finalS = Math.floor(s.score)
    phaseRef.current = 'gameover'
    setPhase('gameover')
    setFinal(finalS)
    if (finalS > best) {
      setIsNewBest(true)
      setBest(finalS)
    }
    if (userId && finalS > 0) {
      submitScore('tent_tetris', finalS).catch(() => {})
    }
  }, [best, submitScore, userId])

  const startGame = useCallback(() => {
    stateRef.current = makeFreshState()
    spawnNext(stateRef.current)
    setScoreD(0)
    setLinesD(0)
    setLevelD(1)
    setFinal(0)
    setIsNewBest(false)
    phaseRef.current = 'falling'
    setPhase('falling')
  }, [])

  // Input.
  useEffect(() => {
    function isPlay() {
      return phaseRef.current === 'falling'
    }
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current === 'start' || phaseRef.current === 'gameover') {
        if (e.key === ' ' || e.key === 'Enter') {
          if (phaseRef.current === 'start') startGame()
          else                              startGame()
          e.preventDefault()
        }
        return
      }
      if (!isPlay()) return
      const s = stateRef.current
      if (e.key === 'ArrowLeft')  { tryMove(s, -1, 0); e.preventDefault() }
      else if (e.key === 'ArrowRight') { tryMove(s,  1, 0); e.preventDefault() }
      else if (e.key === 'ArrowDown')  { s.softDrop = true; e.preventDefault() }
      else if (e.key === 'ArrowUp' || e.key === 'z' || e.key === 'Z') { tryRotate(s,  1); e.preventDefault() }
      else if (e.key === ' ') { hardDrop(s); e.preventDefault() }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        const s = stateRef.current
        s.softDrop = false
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup',   onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup',   onKeyUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startGame])

  // Touch — swipe + tap.
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const t = e.touches[0]
    if (!t) return
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }, [])
  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const start = touchRef.current
    touchRef.current = null
    if (!start) return
    if (phaseRef.current === 'start' || phaseRef.current === 'gameover') {
      startGame()
      return
    }
    if (phaseRef.current !== 'falling') return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const dist = Math.hypot(dx, dy)
    const elapsed = Date.now() - start.t
    const s = stateRef.current
    if (dist < 18 && elapsed < 280) {
      // Tap → rotate.
      tryRotate(s, 1)
      return
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe.
      const dir = dx > 0 ? 1 : -1
      const steps = Math.min(3, Math.max(1, Math.round(Math.abs(dx) / 40)))
      for (let i = 0; i < steps; i++) tryMove(s, dir, 0)
    } else {
      // Vertical swipe → hard drop on downward swipe.
      if (dy > 28) hardDrop(s)
    }
  }, [startGame])

  const onTapAction = useCallback((action: 'rotate' | 'left' | 'right' | 'drop') => {
    if (phaseRef.current === 'start' || phaseRef.current === 'gameover') {
      startGame()
      return
    }
    if (phaseRef.current !== 'falling') return
    const s = stateRef.current
    if (action === 'rotate') tryRotate(s, 1)
    if (action === 'left')   tryMove(s, -1, 0)
    if (action === 'right')  tryMove(s,  1, 0)
    if (action === 'drop')   hardDrop(s)
  }, [startGame])

  // Active piece color for the level number tint.
  const currentColor = stateRef.current.falling
    ? PIECES[stateRef.current.falling.kind].color
    : '#FFB800'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#04040A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingBottom: 24,
        color: '#fff',
        fontFamily: 'inherit',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          width: W,
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px 10px',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/training/arcade')}
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', padding: 0,
          }}
        >
          ← Arcade
        </button>
        <div style={{
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em',
          color: '#FFB800', textTransform: 'uppercase',
        }}>
          Tent Tetris
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          width: W,
          maxWidth: '100%',
          aspectRatio: `${W} / ${H}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 80px -30px rgba(0,0,0,0.8)',
        }}
      >
        <canvas
          ref={canvasRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        />

        {phase === 'start' && (
          <StartOverlay best={best} onPlay={startGame} />
        )}
        {phase === 'gameover' && (
          <GameOverOverlay
            score={final}
            best={best}
            isNewBest={isNewBest}
            userId={userId}
            onRestart={startGame}
            onExit={() => router.push('/training/arcade')}
          />
        )}

        {phase !== 'start' && phase !== 'gameover' && (
          <HudPills score={scoreD} level={levelD} levelColor={currentColor} lines={linesD} />
        )}
      </div>

      {/* On-screen controls */}
      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1.4fr',
          gap: 10,
          width: W,
          maxWidth: '100%',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}
      >
        <ControlBtn label="←"  onTap={() => onTapAction('left')} />
        <ControlBtn label="⟳"  onTap={() => onTapAction('rotate')} />
        <ControlBtn label="→"  onTap={() => onTapAction('right')} />
        <ControlBtn label="DROP" onTap={() => onTapAction('drop')} gold />
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function ControlBtn({ label, onTap, gold }: { label: string; onTap: () => void; gold?: boolean }) {
  return (
    <button
      type="button"
      onClick={onTap}
      onTouchStart={(e) => { e.preventDefault(); onTap() }}
      style={{
        padding: '16px 0',
        background: gold ? '#FFB800' : 'rgba(255,255,255,0.08)',
        color: gold ? '#0A0A14' : '#fff',
        border: gold ? 0 : `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 14,
        fontSize: gold ? 13 : 22,
        fontWeight: 900,
        letterSpacing: gold ? '0.06em' : 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  )
}

function HudPills({ score, level, levelColor, lines }: { score: number; level: number; levelColor: string; lines: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 6,
        left: 12,
        right: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(8,8,18,0.6)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          padding: '5px 12px',
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase' }}>Score</div>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {score.toLocaleString()}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ background: 'rgba(8,8,18,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '5px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase' }}>Lvl</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: levelColor, lineHeight: 1 }}>{level}</div>
        </div>
        <div style={{ background: 'rgba(8,8,18,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: '5px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase' }}>Lns</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{lines}</div>
        </div>
      </div>
    </div>
  )
}

function StartOverlay({ best, onPlay }: { best: number; onPlay: () => void }) {
  return (
    <div
      onClick={onPlay}
      style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(8,8,20,0.55) 0%, rgba(8,8,20,0.86) 60%, rgba(8,8,20,0.96) 100%)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 24, textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#FFB800' }}>
        PartyTime Rentals
      </div>
      <div style={{
        marginTop: 8, fontSize: 56, fontWeight: 900,
        letterSpacing: '-0.04em', lineHeight: 0.92,
        textTransform: 'uppercase', color: '#fff',
      }}>
        Tent
        <br />
        <span style={{ color: '#FFB800' }}>Tetris</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', maxWidth: '28ch', lineHeight: 1.4 }}>
        Stack the rentals before the warehouse fills.
      </div>
      <div style={{
        marginTop: 36,
        padding: '14px 32px',
        background: '#FFB800',
        color: '#0A0A14',
        borderRadius: 999,
        fontSize: 16, fontWeight: 900,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
        animation: 'pulseBtn 1400ms ease-in-out infinite',
      }}>
        Tap to Play
      </div>
      {best > 0 && (
        <div style={{ marginTop: 22, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>
          BEST · <span style={{ color: '#fff' }}>{best.toLocaleString()}</span>
        </div>
      )}
      <style>{`@keyframes pulseBtn { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }`}</style>
    </div>
  )
}

function GameOverOverlay({
  score, best, isNewBest, userId, onRestart, onExit,
}: {
  score: number; best: number; isNewBest: boolean; userId: string | null
  onRestart: () => void; onExit: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(8,8,18,0.6)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'stretch', justifyContent: 'center',
        padding: 16, boxSizing: 'border-box', overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(20,20,32,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 22, padding: '22px 18px 18px',
          textAlign: 'center', boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
          Warehouse Full
        </div>
        <div style={{
          marginTop: 6, fontSize: 64, fontWeight: 900,
          color: '#fff', letterSpacing: '-0.03em',
          lineHeight: 1, fontVariantNumeric: 'tabular-nums',
        }}>
          {score.toLocaleString()}
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          Points
        </div>
        {isNewBest ? (
          <div style={{
            marginTop: 12, display: 'inline-block',
            background: 'rgba(31,191,107,0.18)', color: '#3FE08A',
            border: '1px solid rgba(31,191,107,0.4)',
            padding: '5px 13px', borderRadius: 999,
            fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>
            New Best
          </div>
        ) : best > 0 ? (
          <div style={{
            marginTop: 12, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.14em', color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase',
          }}>
            Best · <span style={{ color: '#fff' }}>{best.toLocaleString()}</span>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <GameLeaderboard
            gameType="tent_tetris"
            currentPlayerId={userId}
            emphasizeScore={score}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onExit}
            style={{
              flex: 1, padding: '14px 0',
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 999, fontSize: 13, fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Exit
          </button>
          <button
            type="button"
            onClick={onRestart}
            style={{
              flex: 2, padding: '14px 0',
              background: '#FFB800', color: '#0A0A14',
              border: 0, borderRadius: 999,
              fontSize: 14, fontWeight: 900,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'inherit', cursor: 'pointer',
              boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── State helpers ───────────────────────────────────────────────────────────
function emptyBoard(): Board {
  const b: Board = []
  for (let r = 0; r < ROWS; r++) {
    const row: Cell[] = []
    for (let c = 0; c < COLS; c++) row.push(null)
    b.push(row)
  }
  return b
}

function refillBag(bag: PieceKind[]) {
  const next = [...PIECE_ORDER]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  bag.push(...next)
}

function makeFreshState(): GameState {
  const bag: PieceKind[] = []
  refillBag(bag)
  const next = bag.shift() as PieceKind
  return {
    board:       emptyBoard(),
    falling:     null,
    bag,
    next,
    score:       0,
    level:       1,
    lines:       0,
    gravity:     GRAVITY_START_MS,
    gravityT:    0,
    softDrop:    false,
    clearRows:   [],
    phaseT:      0,
    shakeOffset: 0,
  }
}

function spawnNext(s: GameState) {
  if (s.bag.length < 2) refillBag(s.bag)
  const kind = s.next
  s.next = s.bag.shift() as PieceKind
  const piece: Falling = {
    kind,
    rot:       0,
    col:       3,
    row:       kind === 'I' ? -1 : 0,
    lockTimer: 0,
    touching:  false,
  }
  if (collides(s.board, kind, 0, piece.col, piece.row)) {
    // Spawn blocked → leave falling null; caller handles game over.
    s.falling = null
    return
  }
  s.falling = piece
}

function cellsOf(kind: PieceKind, rot: 0 | 1 | 2 | 3, col: number, row: number): Array<[number, number]> {
  const def = PIECES[kind]
  return def.rots[rot].map(([dx, dy]) => [col + dx, row + dy] as [number, number])
}

function collides(board: Board, kind: PieceKind, rot: 0 | 1 | 2 | 3, col: number, row: number): boolean {
  for (const [x, y] of cellsOf(kind, rot, col, row)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true
    if (y < 0) continue
    if (board[y][x] != null) return true
  }
  return false
}

function tryMove(s: GameState, dx: number, dy: number): boolean {
  const f = s.falling
  if (!f) return false
  const nc = f.col + dx
  const nr = f.row + dy
  if (collides(s.board, f.kind, f.rot, nc, nr)) return false
  f.col = nc
  f.row = nr
  f.lockTimer = 0
  return true
}

function tryRotate(s: GameState, dir: 1 | -1): boolean {
  const f = s.falling
  if (!f) return false
  const nextRot = (((f.rot + dir) % 4) + 4) % 4 as 0 | 1 | 2 | 3
  for (const [kx, ky] of WALL_KICK_OFFSETS) {
    const nc = f.col + kx
    const nr = f.row + ky
    if (!collides(s.board, f.kind, nextRot, nc, nr)) {
      f.rot = nextRot
      f.col = nc
      f.row = nr
      f.lockTimer = 0
      return true
    }
  }
  return false
}

function hardDrop(s: GameState) {
  const f = s.falling
  if (!f) return
  let cells = 0
  while (!collides(s.board, f.kind, f.rot, f.col, f.row + 1)) {
    f.row += 1
    cells += 1
  }
  s.score += cells * HARD_DROP_PER_CELL
  lockPiece(s)
}

function lockPiece(s: GameState) {
  const f = s.falling
  if (!f) return
  const color = PIECES[f.kind].color
  for (const [x, y] of cellsOf(f.kind, f.rot, f.col, f.row)) {
    if (y < 0) {
      // Lock above board → game over on next spawn.
      continue
    }
    if (y < ROWS && x >= 0 && x < COLS) {
      s.board[y][x] = { color }
    }
  }
  s.falling = null

  // Detect cleared rows.
  const cleared: number[] = []
  for (let r = 0; r < ROWS; r++) {
    if (s.board[r].every((c) => c != null)) cleared.push(r)
  }
  if (cleared.length > 0) {
    s.clearRows = cleared
    const base = LINE_SCORE[cleared.length as 1 | 2 | 3 | 4]
    s.score += base * s.level
  }
}

function applyLineClears(s: GameState) {
  const cleared = new Set(s.clearRows)
  const next: Cell[][] = []
  for (let r = 0; r < ROWS; r++) {
    if (!cleared.has(r)) next.push(s.board[r])
  }
  while (next.length < ROWS) {
    const blank: Cell[] = []
    for (let c = 0; c < COLS; c++) blank.push(null)
    next.unshift(blank)
  }
  s.board = next
  s.lines += s.clearRows.length
  const newLevel = 1 + Math.floor(s.lines / 10)
  if (newLevel !== s.level) {
    s.level   = newLevel
    s.gravity = Math.max(GRAVITY_FLOOR_MS, GRAVITY_START_MS - (s.level - 1) * GRAVITY_STEP_MS)
  }
  s.clearRows = []
}

function tickFalling(s: GameState, dt: number) {
  const f = s.falling
  if (!f) return
  const interval = s.softDrop ? Math.max(40, s.gravity * SOFT_DROP_MULT) : s.gravity
  s.gravityT += dt

  // Touchdown / lock delay logic.
  if (collides(s.board, f.kind, f.rot, f.col, f.row + 1)) {
    f.touching = true
    f.lockTimer += dt
    if (f.lockTimer >= LOCK_DELAY_MS) {
      lockPiece(s)
      return
    }
  } else {
    f.touching = false
    f.lockTimer = 0
  }

  if (s.gravityT >= interval) {
    s.gravityT -= interval
    if (!collides(s.board, f.kind, f.rot, f.col, f.row + 1)) {
      f.row += 1
    }
  }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawScene(ctx: CanvasRenderingContext2D, s: GameState, phase: Phase, startFx: number, family: string) {
  // Background.
  const grad = ctx.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#0a0a18')
  grad.addColorStop(1, '#04040a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  if (phase === 'start') {
    drawStartBackground(ctx, startFx)
    return
  }

  ctx.save()
  ctx.translate(s.shakeOffset, 0)
  drawBoard(ctx, s, phase)
  ctx.restore()

  drawSidePanel(ctx, s, family)
}

function drawStartBackground(ctx: CanvasRenderingContext2D, t: number) {
  // Soft falling silhouettes.
  ctx.save()
  ctx.globalAlpha = 0.18
  const pieces: Array<{ kind: PieceKind; col: number; rot: 0 | 1 | 2 | 3; speed: number; phase: number }> = [
    { kind: 'I', col: 1, rot: 1, speed: 0.04, phase: 0    },
    { kind: 'O', col: 4, rot: 0, speed: 0.05, phase: 800 },
    { kind: 'T', col: 7, rot: 0, speed: 0.06, phase: 1500 },
    { kind: 'L', col: 6, rot: 2, speed: 0.05, phase: 2400 },
    { kind: 'S', col: 2, rot: 3, speed: 0.04, phase: 3000 },
  ]
  const halfH = H + 100
  for (const p of pieces) {
    const yPx = ((t + p.phase) * p.speed) % halfH - 60
    const row = yPx / CELL
    const cells = cellsOf(p.kind, p.rot, p.col, Math.floor(row))
    for (const [cx, cy] of cells) {
      const dx = BOARD_X + cx * CELL
      const dy = yPx + (cy - Math.floor(row)) * CELL
      drawCell(ctx, dx, dy, CELL, PIECES[p.kind].color)
    }
  }
  ctx.restore()
}

function drawBoard(ctx: CanvasRenderingContext2D, s: GameState, phase: Phase) {
  // Frame.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 1
  ctx.strokeRect(BOARD_X - 0.5, BOARD_Y - 0.5, BOARD_W + 1, BOARD_H + 1)

  // Subtle grid lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let c = 1; c < COLS; c++) {
    const x = BOARD_X + c * CELL + 0.5
    ctx.beginPath()
    ctx.moveTo(x, BOARD_Y)
    ctx.lineTo(x, BOARD_Y + BOARD_H)
    ctx.stroke()
  }
  for (let r = 1; r < ROWS; r++) {
    const y = BOARD_Y + r * CELL + 0.5
    ctx.beginPath()
    ctx.moveTo(BOARD_X,           y)
    ctx.lineTo(BOARD_X + BOARD_W, y)
    ctx.stroke()
  }

  // Locked cells.
  const flashing = phase === 'flashing'
  const flashSet = new Set(s.clearRows)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = s.board[r][c]
      if (!cell) continue
      const x = BOARD_X + c * CELL
      const y = BOARD_Y + r * CELL
      if (flashing && flashSet.has(r)) {
        drawFlashCell(ctx, x, y, CELL)
      } else {
        drawCell(ctx, x, y, CELL, cell.color)
      }
    }
  }

  // Ghost + active piece (only during falling).
  if (phase === 'falling' && s.falling) {
    drawGhost(ctx, s)
    drawActive(ctx, s)
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, s: GameState) {
  const f = s.falling!
  let dy = 0
  while (!collides(s.board, f.kind, f.rot, f.col, f.row + dy + 1)) dy++
  const color = PIECES[f.kind].color
  ctx.save()
  ctx.globalAlpha = 0.15
  for (const [cx, cy] of cellsOf(f.kind, f.rot, f.col, f.row + dy)) {
    if (cy < 0) continue
    const x = BOARD_X + cx * CELL
    const y = BOARD_Y + cy * CELL
    ctx.fillStyle = color
    ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
    ctx.strokeStyle = color
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1
    ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3)
    ctx.globalAlpha = 0.15
  }
  ctx.restore()
}

function drawActive(ctx: CanvasRenderingContext2D, s: GameState) {
  const f = s.falling!
  const color = PIECES[f.kind].color
  for (const [cx, cy] of cellsOf(f.kind, f.rot, f.col, f.row)) {
    if (cy < 0) continue
    const x = BOARD_X + cx * CELL
    const y = BOARD_Y + cy * CELL
    drawCell(ctx, x, y, CELL, color)
  }
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string) {
  // Inner fill.
  ctx.fillStyle = fill
  ctx.fillRect(x, y, size, size)
  // Highlight (top + left).
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(x, y, size, 3)
  ctx.fillRect(x, y, 3, size)
  // Shadow (bottom + right).
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(x, y + size - 3, size, 3)
  ctx.fillRect(x + size - 3, y, 3, size)
  // Crisp 1px border.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1)
}

function drawFlashCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(x, y, size, size)
}

function drawSidePanel(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  const px = PANEL_X
  const py = BOARD_Y

  // SCORE
  ctx.fillStyle = '#FFB800'
  ctx.font = `bold 9px ${family}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('SCORE', px, py)
  ctx.fillStyle = '#fff'
  ctx.font = `900 22px ${family}`
  ctx.fillText(`${Math.floor(s.score).toLocaleString()}`, px, py + 14)

  // LEVEL
  const levelColor = s.falling ? PIECES[s.falling.kind].color : '#FFB800'
  ctx.fillStyle = '#FFB800'
  ctx.font = `bold 9px ${family}`
  ctx.fillText('LEVEL', px, py + 60)
  ctx.fillStyle = levelColor
  ctx.font = `900 42px ${family}`
  ctx.fillText(`${s.level}`, px, py + 74)

  // LINES
  ctx.fillStyle = '#FFB800'
  ctx.font = `bold 9px ${family}`
  ctx.fillText('LINES', px, py + 130)
  ctx.fillStyle = '#fff'
  ctx.font = `900 18px ${family}`
  ctx.fillText(`${s.lines}`, px, py + 144)

  // NEXT
  ctx.fillStyle = '#FFB800'
  ctx.font = `bold 10px ${family}`
  ctx.fillText('NEXT', px, py + 184)

  // Next piece preview at 2× the spec mentions, but the side panel is 100px;
  // we use 14px-sized cells which keeps a 4-cell wide piece within the panel.
  const previewCell = 14
  const previewCx = px
  const previewCy = py + 200
  const next = s.next
  const def = PIECES[next]
  // Use rotation 0; compute piece's actual bounding box to center it.
  const cells = def.rots[0]
  const xs = cells.map(([c]) => c)
  const ys = cells.map(([, r]) => r)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pieceW = (maxX - minX + 1) * previewCell
  const pieceH = (maxY - minY + 1) * previewCell
  const previewBoxW = PANEL_W - 2
  const previewBoxH = 4 * previewCell
  const offX = previewCx + (previewBoxW - pieceW) / 2 - minX * previewCell
  const offY = previewCy + (previewBoxH - pieceH) / 2 - minY * previewCell
  for (const [cx, cy] of cells) {
    drawCell(ctx, offX + cx * previewCell, offY + cy * previewCell, previewCell, def.color)
  }

  // Piece name (PTR flavor) — prominent.
  ctx.fillStyle = '#FFB800'
  ctx.font = `800 9px ${family}`
  ctx.textAlign = 'center'
  ctx.fillText(def.name.toUpperCase(), px + PANEL_W / 2, py + 200 + previewBoxH + 6)
  ctx.textAlign = 'left'

  // SPEED pips — 10 pips.
  ctx.fillStyle = '#FFB800'
  ctx.font = `bold 9px ${family}`
  ctx.fillText('SPEED', px, py + 310)
  const totalLevels = 10
  const pipFilled = Math.min(totalLevels, s.level)
  for (let i = 0; i < totalLevels; i++) {
    const pipX = px + (i % 5) * 16
    const pipY = py + 325 + Math.floor(i / 5) * 12
    ctx.fillStyle = i < pipFilled ? '#FFB800' : 'rgba(255,255,255,0.18)'
    ctx.beginPath()
    ctx.arc(pipX + 4, pipY + 4, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  // PTR wordmark at panel bottom.
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = `bold 9px ${family}`
  ctx.textAlign = 'left'
  ctx.fillText('PARTYTIME', px, py + BOARD_H - 24)
  ctx.fillStyle = '#FFB800'
  ctx.font = `900 11px ${family}`
  ctx.fillText('RENTALS', px, py + BOARD_H - 12)
}
