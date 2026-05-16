'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useGameScore } from '@/hooks/arcade/useGameScore'
import GameLeaderboard from './GameLeaderboard'

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 390
const H = 720
const LANES_X = [90, 195, 300] as const
const TRUCK_Y = 580
const LERP_FACTOR = 0.18

const INITIAL_SPEED = 3
const MAX_SPEED     = 9
const RAMP_EVERY_MS = 8000
const RAMP_AMOUNT   = 0.5

const COLLISION_X = 22
const COLLISION_Y = 38
const COIN_R_X    = 20
const COIN_R_Y    = 20

const OBSTACLE_SPAWN_MIN_MS = 700
const OBSTACLE_SPAWN_MAX_MS = 1300
const COIN_FREE_LANE_CHANCE = 0.65

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase = 'start' | 'playing' | 'gameover'
type ObstacleKind = 'cone' | 'barrel'
type Obstacle = { x: number; y: number; lane: 0 | 1 | 2; kind: ObstacleKind }
type Coin     = { x: number; y: number; lane: 0 | 1 | 2; bob: number }
type Prop     = { x: number; y: number; kind: 'tree' | 'guard' | 'mile'; side: 'L' | 'R' }

type GameState = {
  truckLane:    0 | 1 | 2
  truckX:       number
  speed:        number
  score:        number
  scroll:       number  // road dashes / shoulder scroll
  obstacles:    Obstacle[]
  coins:        Coin[]
  props:        Prop[]
  lastObs:      number
  nextObsIn:    number
  rampTimer:    number
  popups:       { x: number; y: number; t: number; text: string }[]
  gameOverFlag: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function RouteRushGame() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef  = useRef<GameState>(makeFreshState())
  const phaseRef  = useRef<Phase>('start')
  const rafRef    = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const fontFamilyRef = useRef<string>('system-ui, sans-serif')

  const [phase, setPhase] = useState<Phase>('start')
  const [scoreDisplay, setScoreDisplay] = useState<number>(0)
  const [finalScore, setFinalScore] = useState<number>(0)
  const [best, setBest] = useState<number>(0)
  const [isNewBest, setIsNewBest] = useState<boolean>(false)
  const [userId, setUserId] = useState<string | null>(null)

  const { submitScore } = useGameScore()

  // Load personal best + userId on mount.
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
        .eq('game_type', 'route_rush')
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      setBest(data?.score ?? 0)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Setup canvas + game loop.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rawCtx = canvas.getContext('2d')
    if (!rawCtx) return
    const ctx: CanvasRenderingContext2D = rawCtx

    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width  = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    // CSS display size is driven by the parent wrapper's aspect-ratio + max-height
    // clamp; the canvas itself stays at `width: 100%; height: 100%` from the JSX
    // style. Locking `canvas.style.{width,height}` to the native W×H here would
    // force the canvas to overflow a shorter parent and clip the truck (y=580)
    // from the bottom of the visible area.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const family = window.getComputedStyle(canvas).fontFamily || 'system-ui, sans-serif'
    fontFamilyRef.current = family

    function frame(ts: number) {
      const last = lastTsRef.current ?? ts
      const dt = Math.min(48, ts - last) // clamp huge gaps (tab switch)
      lastTsRef.current = ts

      const s = stateRef.current
      if (phaseRef.current === 'playing') {
        step(s, dt)
        if (Math.floor(s.score) !== scoreDisplayLastRef.current) {
          scoreDisplayLastRef.current = Math.floor(s.score)
          setScoreDisplay(scoreDisplayLastRef.current)
        }
      } else if (phaseRef.current === 'start') {
        // Animate scroll on start screen for the moving-road preview.
        s.scroll = (s.scroll + 2) % 40
      }
      ctx.clearRect(0, 0, W, H)
      drawScene(ctx, s, phaseRef.current, fontFamilyRef.current)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scoreDisplayLastRef = useRef<number>(0)

  // Keyboard input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phaseRef.current === 'start') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') {
          startGame()
          e.preventDefault()
          return
        }
      }
      if (phaseRef.current !== 'playing') return
      if (e.key === 'ArrowLeft')  { moveLane(-1); e.preventDefault() }
      if (e.key === 'ArrowRight') { moveLane( 1); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startGame = useCallback(() => {
    stateRef.current = makeFreshState()
    scoreDisplayLastRef.current = 0
    setScoreDisplay(0)
    setFinalScore(0)
    setIsNewBest(false)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  const moveLane = useCallback((dir: -1 | 1) => {
    const s = stateRef.current
    const next = Math.max(0, Math.min(2, s.truckLane + dir)) as 0 | 1 | 2
    s.truckLane = next
  }, [])

  const handleCanvasTap = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX =
      'touches' in e
        ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0)
        : e.clientX
    const x = clientX - rect.left
    if (phaseRef.current === 'start') {
      startGame()
      return
    }
    if (phaseRef.current !== 'playing') return
    if (x < rect.width / 2) moveLane(-1)
    else                    moveLane( 1)
  }, [moveLane, startGame])

  // Game-over detection: poll a flag from state.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stateRef.current
      // ↓ "alive" implicit — if phase===playing and we set gameover via collision, that flips here.
      if (s.gameOverFlag && phaseRef.current === 'playing') {
        const finalS = Math.floor(s.score)
        phaseRef.current = 'gameover'
        setPhase('gameover')
        setFinalScore(finalS)
        if (finalS > best) {
          setIsNewBest(true)
          setBest(finalS)
        }
        // Submit if signed in and score > 0.
        if (userId && finalS > 0) {
          submitScore('route_rush', finalS).catch(() => {})
        }
      }
    }, 80)
    return () => window.clearInterval(id)
  }, [best, userId, submitScore])

  const handleRestart = useCallback(() => {
    startGame()
  }, [startGame])

  return (
    <div
      style={{
        height: '100dvh',
        background: '#05050C',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: '#fff',
        fontFamily: 'inherit',
        overflow: 'hidden',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
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
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => router.push('/training/arcade')}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.04em',
            padding: 0,
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          ← Arcade
        </button>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: '0.28em',
            color: '#FFB800',
            textTransform: 'uppercase',
          }}
        >
          Route Rush
        </div>
      </div>

      {/* Canvas container with overlay */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 16px',
          boxSizing: 'border-box',
        }}
      >
      <div
        style={{
          position: 'relative',
          aspectRatio: `${W} / ${H}`,
          maxWidth: W,
          maxHeight: '100%',
          width: '100%',
          height: 'auto',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 80px -30px rgba(0,0,0,0.8)',
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasTap}
          onTouchStart={(e) => { e.preventDefault(); handleCanvasTap(e) }}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        />

        {phase === 'start' && (
          <StartOverlay best={best} onPlay={startGame} />
        )}
        {phase === 'gameover' && (
          <GameOverOverlay
            score={finalScore}
            best={best}
            isNewBest={isNewBest}
            userId={userId}
            onRestart={handleRestart}
            onExit={() => router.push('/training/arcade')}
          />
        )}

        {phase === 'playing' && (
          <HudOverlay score={scoreDisplay} speed={Math.floor(stateRef.current.speed * 10) / 10} />
        )}
      </div>
      </div>

      {/* On-screen controls */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          gap: 16,
          width: W,
          maxWidth: '100%',
          padding: '0 16px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          boxSizing: 'border-box',
          flexShrink: 0,
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          touchAction: 'none',
        }}
      >
        <ControlBtn label="←" disabled={phase !== 'playing'} onTap={() => moveLane(-1)} />
        <ControlBtn label="→" disabled={phase !== 'playing'} onTap={() => moveLane( 1)} />
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function ControlBtn({ label, onTap, disabled }: { label: string; onTap: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onTap}
      onTouchStart={(e) => { e.preventDefault(); onTap() }}
      onTouchEnd={(e) => { e.preventDefault() }}
      onTouchCancel={(e) => { e.preventDefault() }}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '18px 0',
        background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 16,
        fontSize: 28,
        fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'none',
      }}
    >
      {label}
    </button>
  )
}

function HudOverlay({ score, speed }: { score: number; speed: number }) {
  // 6 pips, fill gold as speed rises from 3 → 9.
  const filled = Math.min(6, Math.max(0, Math.round(((speed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED)) * 6)))
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
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
          background: 'rgba(8,8,18,0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          padding: '7px 14px',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase' }}>Score</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {score.toLocaleString()}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(8,8,18,0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 999,
          padding: '8px 12px',
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase', marginRight: 4 }}>
          Speed
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: i < filled ? '#FFB800' : 'rgba(255,255,255,0.18)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function StartOverlay({ best, onPlay }: { best: number; onPlay: () => void }) {
  return (
    <div
      onClick={onPlay}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(8,8,20,0.55) 0%, rgba(8,8,20,0.86) 60%, rgba(8,8,20,0.96) 100%)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#FFB800' }}>
        PartyTime Rentals
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 60,
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 0.92,
          textTransform: 'uppercase',
          color: '#fff',
        }}
      >
        Route
        <br />
        <span style={{ color: '#FFB800' }}>Rush</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', maxWidth: '28ch', lineHeight: 1.4 }}>
        Swerve the lanes. Dodge cones and barrels. Grab the chairs.
      </div>
      <div
        style={{
          marginTop: 36,
          padding: '14px 32px',
          background: '#FFB800',
          color: '#0A0A14',
          borderRadius: 999,
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
          animation: 'pulseBtn 1400ms ease-in-out infinite',
        }}
      >
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
  score: number
  best: number
  isNewBest: boolean
  userId: string | null
  onRestart: () => void
  onExit: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(8,8,18,0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: 'rgba(20,20,32,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 22,
          padding: '22px 18px 18px',
          textAlign: 'center',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
          Run Over
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 64,
            fontWeight: 900,
            color: '#fff',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {score.toLocaleString()}
        </div>
        <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
          Points
        </div>
        {isNewBest ? (
          <div
            style={{
              marginTop: 12,
              display: 'inline-block',
              background: 'rgba(31,191,107,0.18)',
              color: '#3FE08A',
              border: '1px solid rgba(31,191,107,0.4)',
              padding: '5px 13px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            New Best
          </div>
        ) : best > 0 ? (
          <div
            style={{
              marginTop: 12,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
            }}
          >
            Best · <span style={{ color: '#fff' }}>{best.toLocaleString()}</span>
          </div>
        ) : null}

        <div style={{ marginTop: 16 }}>
          <GameLeaderboard
            gameType="route_rush"
            currentPlayerId={userId}
            emphasizeScore={score}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            onClick={onExit}
            style={{
              flex: 1,
              padding: '14px 0',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Exit
          </button>
          <button
            type="button"
            onClick={onRestart}
            style={{
              flex: 2,
              padding: '14px 0',
              background: '#FFB800',
              color: '#0A0A14',
              border: 0,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
            }}
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Game logic ──────────────────────────────────────────────────────────────
function makeFreshState(): GameState {
  // Seed shoulder props sparsely down the screen so the start screen doesn't look empty.
  const props: Prop[] = []
  for (let y = -40; y < H + 200; y += 60) {
    if (Math.random() < 0.7) props.push(spawnProp('L', y))
    if (Math.random() < 0.7) props.push(spawnProp('R', y))
  }
  return {
    truckLane: 1,
    truckX:    LANES_X[1],
    speed:     INITIAL_SPEED,
    score:     0,
    scroll:    0,
    obstacles: [],
    coins:     [],
    props,
    lastObs:   0,
    nextObsIn: 900,
    rampTimer: 0,
    popups:    [],
    gameOverFlag: false,
  }
}

function spawnProp(side: 'L' | 'R', y: number): Prop {
  const r = Math.random()
  const kind: Prop['kind'] = r < 0.55 ? 'tree' : r < 0.85 ? 'guard' : 'mile'
  const baseX = side === 'L' ? 18 + Math.random() * 18 : W - 36 + Math.random() * 18
  return { x: baseX, y, side, kind }
}

function step(s: GameState, dt: number) {
  // Truck lerp toward lane.
  const targetX = LANES_X[s.truckLane]
  s.truckX += (targetX - s.truckX) * LERP_FACTOR

  // Score & speed.
  s.score += s.speed * 0.4 * (dt / (1000 / 60))
  s.rampTimer += dt
  if (s.rampTimer >= RAMP_EVERY_MS) {
    s.rampTimer -= RAMP_EVERY_MS
    s.speed = Math.min(MAX_SPEED, s.speed + RAMP_AMOUNT)
  }

  // Frame-scaled units: at 60fps, dt ≈ 16.67ms.
  const u = dt / (1000 / 60)
  const scrollDy = s.speed * u

  s.scroll = (s.scroll + scrollDy) % 40

  // Move obstacles + coins + props.
  for (const o of s.obstacles) o.y += scrollDy
  for (const c of s.coins)     { c.y += scrollDy; c.bob += dt / 200 }
  for (const p of s.props)     p.y += scrollDy * 0.65  // parallax: shoulder slower than road

  // Cull / recycle.
  s.obstacles = s.obstacles.filter((o) => o.y < H + 60)
  s.coins     = s.coins.filter((c) => c.y < H + 30)
  for (const p of s.props) if (p.y > H + 30) {
    const fresh = spawnProp(p.side, -30)
    p.x = fresh.x; p.y = fresh.y; p.kind = fresh.kind
  }

  // Spawn obstacles.
  s.lastObs += dt
  if (s.lastObs >= s.nextObsIn) {
    s.lastObs = 0
    s.nextObsIn = OBSTACLE_SPAWN_MIN_MS + Math.random() * (OBSTACLE_SPAWN_MAX_MS - OBSTACLE_SPAWN_MIN_MS)
    // Pick 1–2 lanes (never all three), alternating bias.
    const usedLanes: number[] = []
    const numObstacles = Math.random() < 0.35 ? 2 : 1
    while (usedLanes.length < numObstacles) {
      const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2
      if (!usedLanes.includes(lane)) usedLanes.push(lane)
    }
    for (const lane of usedLanes) {
      const kind: ObstacleKind = Math.random() < 0.55 ? 'cone' : 'barrel'
      s.obstacles.push({ x: LANES_X[lane as 0 | 1 | 2], y: -40, lane: lane as 0 | 1 | 2, kind })
    }
    // Coin in a free lane?
    if (Math.random() < COIN_FREE_LANE_CHANCE) {
      const freeLanes: (0 | 1 | 2)[] = [0, 1, 2].filter((l) => !usedLanes.includes(l)) as (0 | 1 | 2)[]
      if (freeLanes.length > 0) {
        const lane = freeLanes[Math.floor(Math.random() * freeLanes.length)]
        s.coins.push({ x: LANES_X[lane], y: -60, lane, bob: Math.random() * Math.PI * 2 })
      }
    }
  }

  // Collisions.
  for (const o of s.obstacles) {
    if (Math.abs(s.truckX - o.x) < COLLISION_X && Math.abs(TRUCK_Y - o.y) < COLLISION_Y) {
      s.gameOverFlag = true
      return
    }
  }
  // Coin pickups (collide-and-remove).
  const keptCoins: Coin[] = []
  for (const c of s.coins) {
    if (Math.abs(s.truckX - c.x) < COIN_R_X && Math.abs(TRUCK_Y - c.y) < COIN_R_Y) {
      s.score += 25
      s.popups.push({ x: c.x, y: c.y - 8, t: 0, text: '+25' })
    } else {
      keptCoins.push(c)
    }
  }
  s.coins = keptCoins

  // Pop-up float / fade.
  for (const p of s.popups) p.t += dt
  s.popups = s.popups.filter((p) => p.t < 800)
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawScene(ctx: CanvasRenderingContext2D, s: GameState, phase: Phase, family: string) {
  drawRoad(ctx, s)
  drawShoulderProps(ctx, s)
  drawCoins(ctx, s)
  drawObstacles(ctx, s)
  drawTruck(ctx, s, phase === 'start', family)
  drawPopups(ctx, s, family)
}

function drawRoad(ctx: CanvasRenderingContext2D, s: GameState) {
  // Green shoulders.
  ctx.fillStyle = '#1b4a0d'
  ctx.fillRect(0, 0, 40, H)
  ctx.fillRect(W - 40, 0, 40, H)

  // Asphalt body.
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(40, 0, W - 80, H)

  // Subtle shoulder edge.
  ctx.fillStyle = '#2a2a2a'
  ctx.fillRect(40, 0, 2, H)
  ctx.fillRect(W - 42, 0, 2, H)

  // Dashed lane markers — 40px cycle, 24px paint + 16px gap.
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  const offset = s.scroll
  for (let lane = 1; lane <= 2; lane++) {
    const x = 40 + ((W - 80) / 3) * lane
    for (let y = -40 + offset; y < H + 40; y += 40) {
      ctx.fillRect(x - 2, y, 4, 24)
    }
  }
}

function drawShoulderProps(ctx: CanvasRenderingContext2D, s: GameState) {
  for (const p of s.props) {
    if (p.kind === 'tree') {
      // Tree silhouette: pyramid + trunk.
      ctx.fillStyle = '#0c2a08'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - 18)
      ctx.lineTo(p.x - 8, p.y + 2)
      ctx.lineTo(p.x + 8, p.y + 2)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(p.x, p.y - 10)
      ctx.lineTo(p.x - 10, p.y + 8)
      ctx.lineTo(p.x + 10, p.y + 8)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#2a1a08'
      ctx.fillRect(p.x - 1.5, p.y + 6, 3, 5)
    } else if (p.kind === 'guard') {
      ctx.fillStyle = '#6b6b6b'
      ctx.fillRect(p.x - 8, p.y, 16, 3)
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(p.x - 1, p.y + 3, 2, 8)
    } else {
      // Mile marker post.
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(p.x - 1, p.y - 6, 2, 14)
      ctx.fillStyle = '#FFB800'
      ctx.beginPath()
      ctx.arc(p.x, p.y - 8, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawObstacles(ctx: CanvasRenderingContext2D, s: GameState) {
  for (const o of s.obstacles) {
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.32)'
    ctx.beginPath()
    ctx.ellipse(o.x, o.y + 18, 16, 4, 0, 0, Math.PI * 2)
    ctx.fill()
    if (o.kind === 'cone') {
      // Orange cone with white stripe.
      ctx.fillStyle = '#FF6A00'
      ctx.beginPath()
      ctx.moveTo(o.x, o.y - 18)
      ctx.lineTo(o.x - 13, o.y + 14)
      ctx.lineTo(o.x + 13, o.y + 14)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillRect(o.x - 9, o.y - 2, 18, 4)
      // Base.
      ctx.fillStyle = '#222'
      ctx.fillRect(o.x - 14, o.y + 14, 28, 3)
    } else {
      // Red barrel with banding.
      const barW = 22
      const barH = 30
      ctx.fillStyle = '#B81818'
      // Cylinder body.
      ctx.beginPath()
      ctx.roundRect(o.x - barW / 2, o.y - barH / 2 + 2, barW, barH, 4)
      ctx.fill()
      // Bands.
      ctx.fillStyle = '#fff'
      ctx.fillRect(o.x - barW / 2, o.y - 7, barW, 2.5)
      ctx.fillRect(o.x - barW / 2, o.y + 4,  barW, 2.5)
      // Top oval.
      ctx.fillStyle = '#7A0F0F'
      ctx.beginPath()
      ctx.ellipse(o.x, o.y - barH / 2 + 2, barW / 2, 3, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function drawCoins(ctx: CanvasRenderingContext2D, s: GameState) {
  for (const c of s.coins) {
    const bob = Math.sin(c.bob) * 2
    // Glow.
    const g = ctx.createRadialGradient(c.x, c.y + bob, 2, c.x, c.y + bob, 22)
    g.addColorStop(0, 'rgba(255,200,40,0.55)')
    g.addColorStop(1, 'rgba(255,200,40,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(c.x, c.y + bob, 22, 0, Math.PI * 2)
    ctx.fill()
    // Folded chair silhouette in gold.
    ctx.save()
    ctx.translate(c.x, c.y + bob)
    ctx.fillStyle = '#FFB800'
    // Top rail.
    ctx.beginPath()
    ctx.roundRect(-7, -9, 14, 3, 1)
    ctx.fill()
    // Seat.
    ctx.beginPath()
    ctx.roundRect(-7, -2, 14, 3, 1)
    ctx.fill()
    // Legs (folded angle).
    ctx.strokeStyle = '#FFB800'
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(-5, -9); ctx.lineTo(-5, 8)
    ctx.moveTo( 5, -9); ctx.lineTo( 5, 8)
    ctx.moveTo(-6, 8);  ctx.lineTo( 6, 8)
    ctx.stroke()
    ctx.restore()
  }
}

function drawTruck(ctx: CanvasRenderingContext2D, s: GameState, isStart: boolean, family: string) {
  const x = s.truckX
  const y = TRUCK_Y

  // Shadow ellipse.
  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.beginPath()
  ctx.ellipse(x, y + 40, 28, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Speed lines when moving fast.
  if (!isStart && s.speed > 5) {
    const lines = 6
    const baseAlpha = (s.speed - 5) / 4
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + baseAlpha * 0.4})`
    ctx.lineWidth = 1.5
    for (let i = 0; i < lines; i++) {
      const ox = x - 20 + (i % 3) * 18
      const oy = y + 36 + Math.random() * 4
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox, oy + 22 + s.speed * 2)
      ctx.stroke()
    }
  }

  // Cargo box (blue).
  ctx.fillStyle = '#0000CC'
  ctx.beginPath()
  ctx.roundRect(x - 22, y - 36, 44, 50, 4)
  ctx.fill()
  // Cargo box inner panel.
  ctx.fillStyle = '#0000AA'
  ctx.fillRect(x - 20, y - 32, 40, 4)
  ctx.fillRect(x - 20, y + 6,  40, 4)
  // PTR wordmark.
  ctx.fillStyle = '#FFB800'
  ctx.font = `900 11px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PTR', x, y - 12)

  // Cab (gold) on top.
  ctx.fillStyle = '#FFB800'
  ctx.beginPath()
  ctx.roundRect(x - 18, y + 14, 36, 18, 3)
  ctx.fill()
  // Windshield.
  ctx.fillStyle = '#0A0A14'
  ctx.fillRect(x - 14, y + 16, 28, 6)

  // Wheels (4).
  ctx.fillStyle = '#0A0A14'
  ctx.beginPath()
  ctx.roundRect(x - 24, y - 22, 4, 14, 1)
  ctx.roundRect(x + 20, y - 22, 4, 14, 1)
  ctx.roundRect(x - 24, y + 10, 4, 14, 1)
  ctx.roundRect(x + 20, y + 10, 4, 14, 1)
  ctx.fill()
  // Wheel hubs.
  ctx.fillStyle = '#3a3a3a'
  for (const [hx, hy] of [[x - 22, y - 15], [x + 22, y - 15], [x - 22, y + 17], [x + 22, y + 17]] as const) {
    ctx.beginPath()
    ctx.arc(hx, hy, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawPopups(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of s.popups) {
    const fade = 1 - p.t / 800
    const dy = -p.t * 0.06
    ctx.fillStyle = `rgba(255,184,0,${0.95 * fade})`
    ctx.font = `900 14px ${family}`
    ctx.fillText(p.text, p.x, p.y + dy)
  }
}
