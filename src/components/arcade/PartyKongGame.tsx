'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useGameScore } from '@/hooks/arcade/useGameScore'
import GameLeaderboard from './GameLeaderboard'

// ─── Sound engine (Web Audio API, chiptune oscillators) ──────────────────────
// Module-level so step()/updateTable()/playerHit() — which are pure functions —
// can fire effects without threading a SoundEngine reference through everything.
// AudioContext is lazily created inside the first user-gesture input handler so
// the browser autoplay policy is satisfied.
let _audioCtx: AudioContext | null = null
let _muted = false

function ensureAudio() {
  if (typeof window === 'undefined') return
  if (!_audioCtx) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      _audioCtx = AC ? new AC() : null
    } catch {
      _audioCtx = null
    }
  }
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {})
  }
}

function tone(f1: number, f2: number, ms: number, type: OscillatorType, vol: number) {
  if (_muted || !_audioCtx) return
  const ctx = _audioCtx
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  const now = ctx.currentTime
  const dur = ms / 1000
  const safeF1 = Math.max(1, f1)
  const safeF2 = Math.max(1, f2)
  osc.frequency.setValueAtTime(safeF1, now)
  if (safeF1 !== safeF2) osc.frequency.exponentialRampToValueAtTime(safeF2, now + dur)
  gain.gain.setValueAtTime(vol, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

type NoteSpec = readonly [number, number, number, OscillatorType, number]
function seq(notes: ReadonlyArray<NoteSpec>, gapMs = 20) {
  if (_muted || !_audioCtx) return
  const ctx = _audioCtx
  let t = ctx.currentTime
  for (const [f1, f2, ms, type, vol] of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    const dur = ms / 1000
    const safeF1 = Math.max(1, f1)
    const safeF2 = Math.max(1, f2)
    osc.frequency.setValueAtTime(safeF1, t)
    if (safeF1 !== safeF2) osc.frequency.exponentialRampToValueAtTime(safeF2, t + dur)
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    t += dur + gapMs / 1000
  }
}

const sfxWalk         = () => tone(220, 110, 60, 'square', 0.12)
const sfxJump         = () => tone(200, 600, 120, 'square', 0.25)
const sfxLand         = () => tone(180, 80, 80, 'square', 0.2)
const sfxClimb        = () => tone(320, 320, 40, 'triangle', 0.08)
const sfxTableBounce  = () => tone(100, 60, 90, 'square', 0.15)
const sfxTableFall    = () => tone(140, 70, 150, 'triangle', 0.1)
const sfxKongThrow    = () => tone(80, 40, 100, 'square', 0.2)
const sfxHit          = () => seq([
  [400, 200, 80, 'square', 0.35],
  [200, 100, 80, 'square', 0.35],
  [100,  50, 120, 'square', 0.35],
], 5)
const sfxLevelComplete = () => seq([
  [523,  523, 80,  'square', 0.3],
  [659,  659, 80,  'square', 0.3],
  [784,  784, 80,  'square', 0.3],
  [1047, 1047, 200, 'square', 0.3],
], 20)
const sfxBonusLife = () => seq([
  [880,  880,  100, 'triangle', 0.3],
  [1760, 1760, 150, 'triangle', 0.3],
], 10)
const sfxGameOver = () => seq([
  [400, 400, 80, 'square', 0.3],
  [350, 350, 80, 'square', 0.3],
  [300, 300, 80, 'square', 0.3],
  [250, 250, 80, 'square', 0.3],
  [200, 200, 80, 'square', 0.3],
  [150, 150, 80, 'square', 0.3],
], 5)

// ─── Canvas ──────────────────────────────────────────────────────────────────
const W = 390
const H = 720

const MAX_LIVES = 5
const BONUS_LIFE_SCORE_1 = 5000
const BONUS_LIFE_SCORE_2 = 10000
const BONUS_FLASH_FRAMES = 90

// ─── Physics constants ───────────────────────────────────────────────────────
const GRAVITY = 0.38
const JUMP_SPEED = 7.8
const WALK_SPEED = 2.3
const LADDER_SPEED = 2.2
const LADDER_GRAB_WIDTH = 15
const JUMP_COOLDOWN_FRAMES = 18
const INVINCIBLE_FRAMES = 110

const PLAYER_START_X = 28
const PLAYER_START_Y = 560
const PLAYER_HALF_H = 30
const PLAYER_HALF_W = 8

const TABLE_BASE_ROLL = 1.7
const TABLE_ACCEL = 0.05
const TABLE_MAX_VX = 3.6
const TABLE_INITIAL_VX = 1.9
const TABLE_RADIUS = 12

const TABLE_HIT_DX = 19
const TABLE_HIT_DY = 28
const DOLLY_HIT_DX = 17
const DOLLY_HIT_DY = 30
const DOLLY_SPEED = 1.1

const WIN_X = 265

// ─── Color palette ───────────────────────────────────────────────────────────
const C = {
  FUR_SHADOW:    '#1A0C04',
  FUR_BASE:      '#3A1E08',
  FUR_MID:       '#5A3418',
  FUR_HIGHLIGHT: '#7A5030',
  WALL_BG:       '#0E0A1E',
  FLOOR_BG:      '#1A1428',
  BG_BASE:       '#080614',
  PLATFORM_HI:   '#DDD090',
  PLATFORM_MID:  '#BBAA58',
  PLATFORM_LO:   '#887838',
  PLATFORM_VLO:  '#504820',
  PLATFORM_UNDER:'#2A1C0A',
  LADDER_HI:     '#FFD040',
  LADDER_MID:    '#D09000',
  LADDER_LO:     '#5A3A00',
  LADDER_VLO:    '#3C2400',
  GOLD:          '#FFB800',
  TEXT:          '#FFFFFF',
} as const

// ─── Platforms ───────────────────────────────────────────────────────────────
type PlatformDef = {
  idx: 0|1|2|3|4
  y1: number; y2: number
  x1: number; x2: number
  flat: boolean
}

const PLATFORMS: PlatformDef[] = [
  { idx: 0, y1: 560, y2: 560, x1: 0,  x2: 390, flat: true  },
  { idx: 1, y1: 472, y2: 458, x1: 15, x2: 345, flat: false },
  { idx: 2, y1: 362, y2: 376, x1: 15, x2: 345, flat: false },
  { idx: 3, y1: 268, y2: 254, x1: 15, x2: 345, flat: false },
  { idx: 4, y1: 168, y2: 168, x1: 35, x2: 325, flat: true  },
]

function psy(p: PlatformDef, x: number): number {
  const cx = Math.max(p.x1, Math.min(p.x2, x))
  return p.y1 + ((cx - p.x1) / (p.x2 - p.x1)) * (p.y2 - p.y1)
}

function slopeDir(p: PlatformDef): -1 | 0 | 1 {
  if (p.y2 === p.y1) return 0
  // Table rolls toward the LOWER end (higher y on screen).
  // y2 > y1 → right end lower → rolls right (+1)
  // y2 < y1 → left  end lower → rolls left  (-1)
  return p.y2 > p.y1 ? 1 : -1
}

// ─── Ladders ─────────────────────────────────────────────────────────────────
type LadderDef = {
  idx: 0|1|2|3
  cx: number
  bottomP: 0|1|2|3
  topP: 1|2|3|4
}

const LADDERS: LadderDef[] = [
  { idx: 0, cx: 306, bottomP: 0, topP: 1 },
  { idx: 1, cx: 52,  bottomP: 1, topP: 2 },
  { idx: 2, cx: 306, bottomP: 2, topP: 3 },
  { idx: 3, cx: 60,  bottomP: 3, topP: 4 },
]

// ─── Levels ──────────────────────────────────────────────────────────────────
type Level = 1|2|3|4
type LevelConfig = {
  num: Level
  name: string
  throwIntervalStart: number
  throwIntervalMin: number
  hasDollies: boolean
  bg: 'warehouse' | 'dock' | 'outdoor' | 'ballroom'
}
const LEVELS: LevelConfig[] = [
  { num: 1, name: 'Warehouse Floor',    throwIntervalStart: 240, throwIntervalMin: 105, hasDollies: false, bg: 'warehouse' },
  { num: 2, name: 'Loading Dock',       throwIntervalStart: 215, throwIntervalMin: 100, hasDollies: true,  bg: 'dock' },
  { num: 3, name: 'Outdoor Tent Setup', throwIntervalStart: 195, throwIntervalMin: 95,  hasDollies: true,  bg: 'outdoor' },
  { num: 4, name: 'Grand Ballroom',     throwIntervalStart: 175, throwIntervalMin: 85,  hasDollies: true,  bg: 'ballroom' },
]
function levelCfg(l: Level): LevelConfig { return LEVELS[l - 1] }

// ─── State types ─────────────────────────────────────────────────────────────
type Player = {
  x: number; y: number
  vx: number; vy: number
  onPlatform: number | null
  onLadder: boolean
  ladderIdx: number | null
  facing: 1 | -1
  walking: boolean
  jumpCooldown: number
  invincible: number
  walkAnim: number
}

type RollingTable = {
  x: number; y: number
  vx: number; vy: number
  rot: number
  onPlatform: number | null
}

type ChairDolly = {
  x: number; y: number
  vx: number
  onPlatform: number
}

type Popup = { x: number; y: number; t: number; text: string; color?: string }

type Phase = 'start' | 'playing' | 'level_complete' | 'gameover' | 'won'

type BonusLifeAwarded = { [k: number]: boolean }

type GameState = {
  player:        Player
  tables:        RollingTable[]
  dollies:       ChairDolly[]
  score:         number
  lives:         number
  level:         Level
  frameN:        number
  throwTimer:    number
  nextThrowAt:   number
  popups:        Popup[]
  kongArm:       number  // 0..1, 1 = raised throw
  kongThrowFlash:number  // frames since last throw, drives arm anim
  goalGlow:      number
  bgFrame:       number
  input:         { left: boolean; right: boolean; up: boolean; down: boolean }
  jumpQueued:    boolean
  walkSoundTimer:  number
  climbSoundTimer: number
  bonusLifeAwarded: BonusLifeAwarded
  bonusFlashFrames: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeFreshPlayer(): Player {
  return {
    x: PLAYER_START_X,
    y: PLAYER_START_Y,
    vx: 0, vy: 0,
    onPlatform: 0,
    onLadder: false,
    ladderIdx: null,
    facing: 1,
    walking: false,
    jumpCooldown: 0,
    invincible: 0,
    walkAnim: 0,
  }
}

function freshBonusLifeAwarded(): BonusLifeAwarded {
  return { [BONUS_LIFE_SCORE_1]: false, [BONUS_LIFE_SCORE_2]: false }
}

function makeFreshState(
  level: Level = 1,
  score = 0,
  lives = 3,
  bonusLifeAwarded: BonusLifeAwarded = freshBonusLifeAwarded(),
): GameState {
  const cfg = levelCfg(level)
  return {
    player: makeFreshPlayer(),
    tables: [],
    dollies: cfg.hasDollies ? [
      { x: 200, y: 0, vx:  DOLLY_SPEED, onPlatform: 1 },
      { x: 150, y: 0, vx: -DOLLY_SPEED, onPlatform: 2 },
    ] : [],
    score,
    lives,
    level,
    frameN: 0,
    throwTimer: 0,
    nextThrowAt: cfg.throwIntervalStart,
    popups: [],
    kongArm: 0,
    kongThrowFlash: 9999,
    goalGlow: 0,
    bgFrame: 0,
    input: { left: false, right: false, up: false, down: false },
    jumpQueued: false,
    walkSoundTimer: 0,
    climbSoundTimer: 0,
    bonusLifeAwarded: { ...bonusLifeAwarded },
    bonusFlashFrames: 0,
  }
}

function platformAt(idx: number | null): PlatformDef | null {
  if (idx == null) return null
  return PLATFORMS[idx] ?? null
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PartyKongGame() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef  = useRef<GameState>(makeFreshState())
  const phaseRef  = useRef<Phase>('start')
  const rafRef    = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const fontFamilyRef = useRef<string>('system-ui, sans-serif')
  const logoRef = useRef<HTMLImageElement | null>(null)
  const logoLoadedRef = useRef<boolean>(false)

  const [phase, setPhase] = useState<Phase>('start')
  const [scoreDisplay, setScoreDisplay] = useState<number>(0)
  const [livesDisplay, setLivesDisplay] = useState<number>(3)
  const [levelDisplay, setLevelDisplay] = useState<Level>(1)
  const [finalScore, setFinalScore] = useState<number>(0)
  const [best, setBest] = useState<number>(0)
  const [isNewBest, setIsNewBest] = useState<boolean>(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [nearLadder, setNearLadder] = useState<boolean>(false)
  const [muted, setMuted] = useState<boolean>(false)

  // Sync mute state to the module-level flag the sfx functions read.
  useEffect(() => { _muted = muted }, [muted])

  const toggleMuted = useCallback(() => {
    ensureAudio()
    setMuted((m) => !m)
  }, [])

  const { submitScore } = useGameScore()

  // Logo load chain: spec path → ptr-mark fallback → procedural draw.
  useEffect(() => {
    let cancelled = false
    function tryLoad(src: string, onFail: () => void) {
      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        logoRef.current = img
        logoLoadedRef.current = true
      }
      img.onerror = () => { if (!cancelled) onFail() }
      img.src = src
    }
    tryLoad('/images/PARTYTIME-RENTALS-LOGO.png', () => {
      tryLoad('/ptr-mark.png', () => {
        logoLoadedRef.current = false
      })
    })
    return () => { cancelled = true }
  }, [])

  // Load personal best + userId.
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
        .eq('game_type', 'party_kong')
        .order('score', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      setBest(data?.score ?? 0)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Canvas setup + game loop.
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

    const family = window.getComputedStyle(canvas).fontFamily || 'system-ui, sans-serif'
    fontFamilyRef.current = family

    function frame(ts: number) {
      const last = lastTsRef.current ?? ts
      const dt = Math.min(48, ts - last)
      lastTsRef.current = ts
      const u = dt / (1000 / 60)  // frame-scale factor

      const s = stateRef.current
      s.bgFrame += u
      s.goalGlow += u * 0.08

      if (phaseRef.current === 'playing') {
        step(s, u)
        const sf = Math.floor(s.score)
        if (sf !== scoreLastRef.current) {
          scoreLastRef.current = sf
          setScoreDisplay(sf)
        }
        if (s.lives !== livesLastRef.current) {
          livesLastRef.current = s.lives
          setLivesDisplay(s.lives)
        }
        const ladderHere = isNearLadderHint(s.player)
        if (ladderHere !== nearLadderRef.current) {
          nearLadderRef.current = ladderHere
          setNearLadder(ladderHere)
        }
        // Game over when lives run out.
        if (s.lives <= 0) {
          phaseRef.current = 'gameover'
          setPhase('gameover')
          sfxGameOver()
          const finalS = Math.floor(s.score)
          setFinalScore(finalS)
          if (finalS > best) { setIsNewBest(true); setBest(finalS) }
          if (userId && finalS > 0) submitScore('party_kong', finalS).catch(() => {})
        }
      }

      ctx.clearRect(0, 0, W, H)
      drawScene(ctx, s, fontFamilyRef.current, logoRef.current, logoLoadedRef.current)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best, userId])

  const scoreLastRef = useRef<number>(0)
  const livesLastRef = useRef<number>(3)
  const nearLadderRef = useRef<boolean>(false)

  // Win detection: poll once per RAF tick via interval (cheap, decoupled).
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = stateRef.current
      if (phaseRef.current !== 'playing') return
      if (s.player.onPlatform === 4 && s.player.x > WIN_X) {
        const isLast = s.level === 4
        sfxLevelComplete()
        if (isLast) {
          phaseRef.current = 'won'
          setPhase('won')
          const finalS = Math.floor(s.score)
          setFinalScore(finalS)
          if (finalS > best) { setIsNewBest(true); setBest(finalS) }
          if (userId && finalS > 0) submitScore('party_kong', finalS).catch(() => {})
        } else {
          phaseRef.current = 'level_complete'
          setPhase('level_complete')
        }
      }
    }, 90)
    return () => window.clearInterval(id)
  }, [best, userId, submitScore])

  // Keyboard input
  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      ensureAudio()
      const s = stateRef.current
      if (phaseRef.current === 'start' || phaseRef.current === 'gameover' || phaseRef.current === 'won') {
        if (e.key === ' ' || e.key === 'Enter') {
          if (phaseRef.current === 'start') startGame()
          else if (phaseRef.current === 'gameover' || phaseRef.current === 'won') startGame()
          e.preventDefault()
          return
        }
      }
      if (phaseRef.current === 'level_complete') {
        if (e.key === ' ' || e.key === 'Enter') {
          advanceLevel()
          e.preventDefault()
          return
        }
      }
      if (phaseRef.current !== 'playing') return
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          s.input.left = true
          e.preventDefault()
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          s.input.right = true
          e.preventDefault()
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          s.input.up = true
          e.preventDefault()
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          s.input.down = true
          e.preventDefault()
          break
        case ' ':
          s.jumpQueued = true
          e.preventDefault()
          break
      }
    }
    function onUp(e: KeyboardEvent) {
      const s = stateRef.current
      switch (e.key) {
        case 'ArrowLeft':
        case 'a': case 'A':  s.input.left = false; break
        case 'ArrowRight':
        case 'd': case 'D':  s.input.right = false; break
        case 'ArrowUp':
        case 'w': case 'W':  s.input.up = false; break
        case 'ArrowDown':
        case 's': case 'S':  s.input.down = false; break
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startGame = useCallback(() => {
    stateRef.current = makeFreshState(1, 0, 3)
    scoreLastRef.current = 0
    livesLastRef.current = 3
    setScoreDisplay(0)
    setLivesDisplay(3)
    setLevelDisplay(1)
    setFinalScore(0)
    setIsNewBest(false)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  const advanceLevel = useCallback(() => {
    const cur = stateRef.current
    const nextLvl = Math.min(4, cur.level + 1) as Level
    stateRef.current = makeFreshState(nextLvl, cur.score, cur.lives, cur.bonusLifeAwarded)
    setLevelDisplay(nextLvl)
    phaseRef.current = 'playing'
    setPhase('playing')
  }, [])

  // Touch input handlers for D-pad + jump
  const press = useCallback((k: 'left' | 'right' | 'up' | 'down', v: boolean) => {
    ensureAudio()
    if (phaseRef.current !== 'playing') return
    stateRef.current.input[k] = v
  }, [])
  const tapJump = useCallback(() => {
    ensureAudio()
    if (phaseRef.current === 'start') return startGame()
    if (phaseRef.current === 'level_complete') return advanceLevel()
    if (phaseRef.current === 'gameover' || phaseRef.current === 'won') return startGame()
    if (phaseRef.current === 'playing') stateRef.current.jumpQueued = true
  }, [startGame, advanceLevel])

  const tapCanvas = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    ensureAudio()
    if (phaseRef.current === 'start') return startGame()
    if (phaseRef.current === 'level_complete') return advanceLevel()
    if (phaseRef.current === 'gameover' || phaseRef.current === 'won') return startGame()
    if (phaseRef.current !== 'playing') return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0) : (e as React.MouseEvent).clientX
    const x = clientX - rect.left
    // Tap to move sideways quickly as a fallback to the D-pad.
    if (x < rect.width / 2) stateRef.current.input.left = true
    else                    stateRef.current.input.right = true
    window.setTimeout(() => {
      stateRef.current.input.left = false
      stateRef.current.input.right = false
    }, 120)
  }, [startGame, advanceLevel])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#05050C',
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
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.04em',
            padding: 0,
          }}
        >
          ← Arcade
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.28em',
              color: '#FFB800',
              textTransform: 'uppercase',
            }}
          >
            Party Kong
          </div>
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              cursor: 'pointer',
              color: muted ? 'rgba(255,255,255,0.4)' : '#FFB800',
              fontFamily: 'inherit',
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <SpeakerIcon muted={muted} />
          </button>
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
          onClick={tapCanvas}
          onTouchStart={(e) => { e.preventDefault(); tapCanvas(e) }}
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
        />

        {phase === 'start' && (
          <StartOverlay best={best} onPlay={startGame} />
        )}
        {phase === 'level_complete' && (
          <LevelCompleteOverlay
            level={stateRef.current.level}
            score={Math.floor(stateRef.current.score)}
            onNext={advanceLevel}
          />
        )}
        {(phase === 'gameover' || phase === 'won') && (
          <GameOverOverlay
            won={phase === 'won'}
            score={finalScore}
            best={best}
            isNewBest={isNewBest}
            userId={userId}
            onRestart={startGame}
            onExit={() => router.push('/training/arcade')}
          />
        )}

        {phase === 'playing' && (
          <HudOverlay
            score={scoreDisplay}
            lives={livesDisplay}
            level={levelDisplay}
            levelName={levelCfg(levelDisplay).name}
            ladderHint={nearLadder}
          />
        )}
      </div>

      {/* On-screen controls: D-pad + jump */}
      <div
        style={{
          marginTop: 16,
          width: W,
          maxWidth: '100%',
          padding: '0 16px',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 14,
          alignItems: 'center',
        }}
      >
        {/* D-pad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(3, 1fr)',
            gap: 6,
            aspectRatio: '3 / 3',
          }}
        >
          <span />
          <DpadBtn label="▲" disabled={phase !== 'playing'} onPress={() => press('up', true)}   onRelease={() => press('up', false)}   />
          <span />
          <DpadBtn label="◀" disabled={phase !== 'playing'} onPress={() => press('left', true)} onRelease={() => press('left', false)} />
          <span />
          <DpadBtn label="▶" disabled={phase !== 'playing'} onPress={() => press('right', true)} onRelease={() => press('right', false)} />
          <span />
          <DpadBtn label="▼" disabled={phase !== 'playing'} onPress={() => press('down', true)}  onRelease={() => press('down', false)}  />
          <span />
        </div>
        {/* Jump */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={tapJump}
            onTouchStart={(e) => { e.preventDefault(); tapJump() }}
            style={{
              width: 110, height: 110,
              borderRadius: '50%',
              background: phase === 'playing' ? '#FFB800' : 'rgba(255,255,255,0.05)',
              color: phase === 'playing' ? '#0A0A14' : 'rgba(255,255,255,0.3)',
              border: 0,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '0.12em',
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: phase === 'playing' ? '0 10px 30px -8px rgba(255,184,0,0.6)' : 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            JUMP
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── UI sub-components ───────────────────────────────────────────────────────
function SpeakerIcon({ muted }: { muted: boolean }) {
  // 16x16 viewBox, currentColor stroke. Speaker cone + sound waves (or X when muted).
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4L4 6.5H2V9.5H4L7 12V4Z" fill="currentColor" stroke="currentColor" />
      {muted ? (
        <>
          <path d="M10.5 6L13.5 10" />
          <path d="M13.5 6L10.5 10" />
        </>
      ) : (
        <>
          <path d="M10 6.5C10.5 7 10.7 7.5 10.7 8C10.7 8.5 10.5 9 10 9.5" />
          <path d="M12 5C13 5.8 13.5 6.8 13.5 8C13.5 9.2 13 10.2 12 11" />
        </>
      )}
    </svg>
  )
}

function DpadBtn({ label, onPress, onRelease, disabled }: {
  label: string
  onPress: () => void
  onRelease: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onPress() }}
      onMouseUp={(e) => { e.preventDefault(); onRelease() }}
      onMouseLeave={() => onRelease()}
      onTouchStart={(e) => { e.preventDefault(); onPress() }}
      onTouchEnd={(e) => { e.preventDefault(); onRelease() }}
      disabled={disabled}
      style={{
        background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
        color: disabled ? 'rgba(255,255,255,0.3)' : '#fff',
        border: `1px solid rgba(255,255,255,0.08)`,
        borderRadius: 12,
        fontSize: 20,
        fontWeight: 900,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        padding: 0,
      }}
    >
      {label}
    </button>
  )
}

function HudOverlay({ score, lives, level, levelName, ladderHint }: {
  score: number
  lives: number
  level: Level
  levelName: string
  ladderHint: boolean
}) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'rgba(8,8,18,0.78)',
            border: '1px solid rgba(255,184,0,0.3)',
            borderRadius: 999,
            padding: '6px 12px',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase' }}>Score</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {score.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            background: 'rgba(8,8,18,0.78)',
            border: '1px solid rgba(255,184,0,0.3)',
            borderRadius: 999,
            padding: '6px 12px',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase' }}>
            Lvl {level}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', lineHeight: 1, marginTop: 2, letterSpacing: '0.02em' }}>
            {levelName}
          </div>
        </div>

        <div
          style={{
            background: 'rgba(8,8,18,0.78)',
            border: '1px solid rgba(255,184,0,0.3)',
            borderRadius: 999,
            padding: '6px 10px',
            display: 'flex',
            gap: 3,
            alignItems: 'center',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: '#FFB800', textTransform: 'uppercase', marginRight: 4 }}>
            Lives
          </div>
          {/* Always render 5 slots; lives can grow via bonus life thresholds. Dots shrink to 12px so the pill width stays close to the 3-life baseline. */}
          {Array.from({ length: 5 }).map((_, i) => {
            const filled = i < lives
            return (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: filled
                    ? 'radial-gradient(circle at 30% 30%, #FFE070, #FFB800 60%, #8a6000)'
                    : 'rgba(255,255,255,0.07)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 7,
                  fontWeight: 900,
                  color: filled ? '#1a0a00' : 'rgba(255,255,255,0.14)',
                }}
              >
                P
              </div>
            )
          })}
        </div>
      </div>
      {ladderHint && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: 0,
            right: 0,
            textAlign: 'center',
            pointerEvents: 'none',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(255,184,0,0.85)',
            textShadow: '0 1px 6px rgba(0,0,0,0.7)',
            animation: 'pkPulse 1100ms ease-in-out infinite',
          }}
        >
          ▲ Climb
        </div>
      )}
      <style>{`@keyframes pkPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
    </>
  )
}

function StartOverlay({ best, onPlay }: { best: number; onPlay: () => void }) {
  return (
    <div
      onClick={onPlay}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(6,6,18,0.55) 0%, rgba(6,6,18,0.86) 60%, rgba(6,6,18,0.96) 100%)',
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
        Party
        <br />
        <span style={{ color: '#FFB800' }}>Kong</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', maxWidth: '30ch', lineHeight: 1.4 }}>
        Climb the warehouse. Dodge the tables. Save the contract.
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

function LevelCompleteOverlay({ level, score, onNext }: {
  level: Level
  score: number
  onNext: () => void
}) {
  return (
    <div
      onClick={onNext}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(6,6,18,0.7)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#3FE08A' }}>
        Level {level} Cleared
      </div>
      <div style={{ marginTop: 12, fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
        Contract<br/><span style={{ color: '#FFB800' }}>Signed</span>
      </div>
      <div style={{ marginTop: 16, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
        Next up: <span style={{ color: '#fff', fontWeight: 700 }}>{LEVELS[level].name}</span>
      </div>
      <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
        Score · <span style={{ color: '#fff' }}>{score.toLocaleString()}</span>
      </div>
      <div
        style={{
          marginTop: 30,
          padding: '14px 30px',
          background: '#FFB800',
          color: '#0A0A14',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 900,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          boxShadow: '0 8px 28px -10px rgba(255,184,0,0.7)',
        }}
      >
        Continue
      </div>
    </div>
  )
}

function GameOverOverlay({
  won, score, best, isNewBest, userId, onRestart, onExit,
}: {
  won: boolean
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
        background: 'rgba(6,6,18,0.6)',
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
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.28em', textTransform: 'uppercase', color: won ? '#3FE08A' : 'rgba(255,255,255,0.5)' }}>
          {won ? 'You Won' : 'Game Over'}
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
            gameType="party_kong"
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
function isNearLadderHint(p: Player): boolean {
  if (p.onLadder) return false
  if (p.onPlatform == null) return false
  for (const l of LADDERS) {
    if (Math.abs(p.x - l.cx) < LADDER_GRAB_WIDTH) {
      if (p.onPlatform === l.bottomP || p.onPlatform === l.topP) return true
    }
  }
  return false
}

function step(s: GameState, u: number) {
  s.frameN += u

  // ── Player ───────────────────────────────────────────────────────────────
  const p = s.player
  if (p.invincible > 0) p.invincible = Math.max(0, p.invincible - u)
  if (p.jumpCooldown > 0) p.jumpCooldown = Math.max(0, p.jumpCooldown - u)

  // Ladder grab attempts
  if (!p.onLadder && p.onPlatform != null) {
    for (const l of LADDERS) {
      if (Math.abs(p.x - l.cx) >= LADDER_GRAB_WIDTH) continue
      if (s.input.up   && p.onPlatform === l.bottomP) { p.onLadder = true; p.ladderIdx = l.idx; p.x = l.cx; p.vy = 0; p.vx = 0; break }
      if (s.input.down && p.onPlatform === l.topP)    { p.onLadder = true; p.ladderIdx = l.idx; p.x = l.cx; p.vy = 0; p.vx = 0; break }
    }
  }

  if (p.onLadder && p.ladderIdx != null) {
    const lad = LADDERS[p.ladderIdx]
    const top    = PLATFORMS[lad.topP]
    const bottom = PLATFORMS[lad.bottomP]
    const topY    = psy(top,    lad.cx)
    const bottomY = psy(bottom, lad.cx)
    // Vertical motion
    let vy = 0
    if (s.input.up)   vy -= LADDER_SPEED
    if (s.input.down) vy += LADDER_SPEED
    p.y += vy * u
    p.walking = false
    p.walkAnim += Math.abs(vy) * u * 0.4
    // Jump from ladder
    if (s.jumpQueued && p.jumpCooldown === 0) {
      s.jumpQueued = false
      p.onLadder = false
      p.ladderIdx = null
      p.vy = -JUMP_SPEED
      p.vx = s.input.left ? -WALK_SPEED : s.input.right ? WALK_SPEED : 0
      p.jumpCooldown = JUMP_COOLDOWN_FRAMES
      p.onPlatform = null
      sfxJump()
    } else if (p.y <= topY) {
      // Exit at top
      p.y = topY
      p.onLadder = false
      p.ladderIdx = null
      p.onPlatform = lad.topP
      p.vy = 0
    } else if (p.y >= bottomY) {
      // Exit at bottom
      p.y = bottomY
      p.onLadder = false
      p.ladderIdx = null
      p.onPlatform = lad.bottomP
      p.vy = 0
    }
  } else {
    // On platform or airborne
    let wantVx = 0
    if (s.input.left)  { wantVx -= WALK_SPEED; p.facing = -1 }
    if (s.input.right) { wantVx += WALK_SPEED; p.facing =  1 }
    p.walking = wantVx !== 0 && p.onPlatform != null

    if (p.onPlatform != null) {
      p.vx = wantVx
      p.vy = 0
      p.x += p.vx * u
      // Jump
      if (s.jumpQueued && p.jumpCooldown === 0) {
        s.jumpQueued = false
        p.vy = -JUMP_SPEED
        p.jumpCooldown = JUMP_COOLDOWN_FRAMES
        p.onPlatform = null
        s.score += 5
        sfxJump()
      }
      // Score popup not visible for +5 jumps (too noisy); just accumulate.
      // Stay on platform: snap y
      if (p.onPlatform != null) {
        const pp = PLATFORMS[p.onPlatform]
        // walked off edge?
        if (p.x < pp.x1 || p.x > pp.x2) {
          p.onPlatform = null
        } else {
          p.y = psy(pp, p.x)
        }
      }
    }

    if (p.onPlatform == null) {
      // Airborne
      p.vy += GRAVITY * u
      const oldY = p.y
      p.x += p.vx * u
      p.y += p.vy * u
      // Clamp x to screen
      if (p.x < 6) p.x = 6
      if (p.x > W - 6) p.x = W - 6
      // Land on highest platform that surface lies between oldY..p.y at p.x
      if (p.vy > 0) {
        let landed: PlatformDef | null = null
        for (const pl of PLATFORMS) {
          if (p.x < pl.x1 || p.x > pl.x2) continue
          const surf = psy(pl, p.x)
          if (oldY <= surf + 0.5 && p.y >= surf - 0.5) {
            if (!landed || surf < psy(landed, p.x) /* higher */) {
              // Actually we want the surface we crossed — prefer the smallest y (highest visually).
              // But if multiple, we cross the topmost first. Take the one with smallest surf >= oldY.
              if (!landed) landed = pl
              else if (surf < psy(landed, p.x)) landed = pl
            }
          }
        }
        if (landed) {
          p.onPlatform = landed.idx
          p.y = psy(landed, p.x)
          p.vy = 0
          p.vx = 0
          sfxLand()
        }
      }
    }

    p.walkAnim += Math.abs(p.vx) * u * 0.18
  }

  // ── Walk / climb sound timers ────────────────────────────────────────────
  if (p.walking) {
    s.walkSoundTimer += u
    if (s.walkSoundTimer >= 8) {
      s.walkSoundTimer = 0
      sfxWalk()
    }
  } else {
    s.walkSoundTimer = 0
  }
  const climbing = p.onLadder && (s.input.up || s.input.down)
  if (climbing) {
    s.climbSoundTimer += u
    if (s.climbSoundTimer >= 10) {
      s.climbSoundTimer = 0
      sfxClimb()
    }
  } else {
    s.climbSoundTimer = 0
  }

  // Hit detection (player vs tables)
  if (p.invincible === 0) {
    for (const t of s.tables) {
      if (Math.abs(p.x - t.x) < TABLE_HIT_DX && Math.abs(p.y - t.y - 10) < TABLE_HIT_DY) {
        playerHit(s)
        break
      }
    }
  }
  if (p.invincible === 0) {
    for (const d of s.dollies) {
      if (Math.abs(p.x - d.x) < DOLLY_HIT_DX && Math.abs(p.y - d.y - 14) < DOLLY_HIT_DY) {
        playerHit(s)
        break
      }
    }
  }

  // ── Tables ───────────────────────────────────────────────────────────────
  const cfg = levelCfg(s.level)
  s.throwTimer += u
  s.kongThrowFlash += u
  // Throw interval shrinks with score.
  const throwInterval = Math.max(
    cfg.throwIntervalMin,
    cfg.throwIntervalStart - Math.floor(s.score / 8),
  )
  s.nextThrowAt = throwInterval

  if (s.throwTimer >= s.nextThrowAt) {
    s.throwTimer = 0
    spawnTable(s)
    s.kongThrowFlash = 0
  }

  // Kong arm anim: raise during last 30 frames of cycle, hold for 8, lower.
  const sinceThrow = s.kongThrowFlash
  if (sinceThrow < 12) {
    s.kongArm = Math.min(1, sinceThrow / 12)
  } else if (sinceThrow < 40) {
    s.kongArm = 1
  } else if (sinceThrow < 70) {
    s.kongArm = Math.max(0, 1 - (sinceThrow - 40) / 30)
  } else {
    s.kongArm = 0
  }

  for (const t of s.tables) {
    updateTable(t, u, s)
  }
  // Cull tables off-screen.
  s.tables = s.tables.filter((t) => t.y < H + 80 && t.x > -40 && t.x < W + 40)

  // ── Dollies ──────────────────────────────────────────────────────────────
  for (const d of s.dollies) {
    const pl = PLATFORMS[d.onPlatform]
    d.x += d.vx * u
    if (d.x < pl.x1 + 12) { d.x = pl.x1 + 12; d.vx = Math.abs(d.vx) }
    if (d.x > pl.x2 - 12) { d.x = pl.x2 - 12; d.vx = -Math.abs(d.vx) }
    d.y = psy(pl, d.x)
  }

  // ── Score: survival drip ─────────────────────────────────────────────────
  s.score += (3 / 55) * u  // +3 every 55 frames

  // ── Bonus life thresholds ────────────────────────────────────────────────
  if (!s.bonusLifeAwarded[BONUS_LIFE_SCORE_1] && s.score >= BONUS_LIFE_SCORE_1) {
    s.bonusLifeAwarded[BONUS_LIFE_SCORE_1] = true
    s.lives = Math.min(s.lives + 1, MAX_LIVES)
    s.bonusFlashFrames = BONUS_FLASH_FRAMES
    sfxBonusLife()
  }
  if (!s.bonusLifeAwarded[BONUS_LIFE_SCORE_2] && s.score >= BONUS_LIFE_SCORE_2) {
    s.bonusLifeAwarded[BONUS_LIFE_SCORE_2] = true
    s.lives = Math.min(s.lives + 1, MAX_LIVES)
    s.bonusFlashFrames = BONUS_FLASH_FRAMES
    sfxBonusLife()
  }
  if (s.bonusFlashFrames > 0) s.bonusFlashFrames = Math.max(0, s.bonusFlashFrames - u)

  // ── Popups ───────────────────────────────────────────────────────────────
  for (const pp of s.popups) pp.t += u
  s.popups = s.popups.filter((pp) => pp.t < 50)
}

function playerHit(s: GameState) {
  s.lives = Math.max(0, s.lives - 1)
  s.player.invincible = INVINCIBLE_FRAMES
  sfxHit()
  if (s.lives > 0) {
    // Stay on the current level — reset player position and clear active
    // hazards so the respawn window is fair. Score is preserved.
    s.player.x = PLAYER_START_X
    s.player.y = PLAYER_START_Y
    s.player.vx = 0
    s.player.vy = 0
    s.player.onPlatform = 0
    s.player.onLadder = false
    s.player.ladderIdx = null
    s.player.facing = 1
    s.player.walking = false
    s.tables = []
    s.throwTimer = 0
    s.kongThrowFlash = 9999
    s.walkSoundTimer = 0
    s.climbSoundTimer = 0
  }
}

function spawnTable(s: GameState) {
  // Spawn near Tent Kong on P4 left side.
  const x = 95
  const y = psy(PLATFORMS[4], x) - TABLE_RADIUS
  s.tables.push({
    x, y,
    vx: TABLE_INITIAL_VX,
    vy: 0,
    rot: 0,
    onPlatform: 4,
  })
  sfxKongThrow()
}

function updateTable(t: RollingTable, u: number, s: GameState) {
  if (t.onPlatform != null) {
    const pl = PLATFORMS[t.onPlatform]
    const sd = slopeDir(pl)
    if (sd === 0) {
      // Flat: keep momentum, slight friction-less.
      t.vx += 0  // unchanged
    } else {
      // Accelerate toward slope direction, clamped.
      t.vx += sd * TABLE_ACCEL * u
      const cap = sd * TABLE_MAX_VX
      if (sd > 0) t.vx = Math.min(t.vx, cap)
      else        t.vx = Math.max(t.vx, cap)
    }
    t.x += t.vx * u
    t.rot += t.vx * 0.08 * u

    // Off the edge? Fall straight down so the table reliably lands on the
    // platform below (zigzag pattern). Retaining vx makes tables fly past
    // the inset platforms on slopes.
    if (t.x < pl.x1 || t.x > pl.x2) {
      t.onPlatform = null
      t.vy = 0
      t.vx = 0
      sfxTableFall()
    } else {
      t.y = psy(pl, t.x) - TABLE_RADIUS
    }
  } else {
    // Airborne
    t.vy += GRAVITY * u
    const oldY = t.y
    t.x += t.vx * u
    t.y += t.vy * u
    t.rot += t.vx * 0.08 * u
    // Landing detection
    let landed: PlatformDef | null = null
    for (const pl of PLATFORMS) {
      if (t.x < pl.x1 || t.x > pl.x2) continue
      const surf = psy(pl, t.x) - TABLE_RADIUS
      if (oldY <= surf + 0.5 && t.y >= surf - 0.5) {
        if (!landed) landed = pl
        else if (psy(pl, t.x) < psy(landed, t.x)) landed = pl
      }
    }
    if (landed) {
      t.onPlatform = landed.idx
      t.y = psy(landed, t.x) - TABLE_RADIUS
      t.vy = 0
      const sd = slopeDir(landed)
      if (sd !== 0) t.vx = sd * TABLE_BASE_ROLL
      sfxTableBounce()
      // Score for landing on a lower platform.
      if (landed.idx < 4) {
        s.score += 10
        s.popups.push({ x: t.x, y: t.y - 14, t: 0, text: '+10', color: 'rgba(255,184,0,0.95)' })
      }
    }
  }
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawScene(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  family: string,
  logo: HTMLImageElement | null,
  logoLoaded: boolean,
) {
  const cfg = levelCfg(s.level)
  drawBackground(ctx, s, cfg.bg, family, logo, logoLoaded)
  drawPlatforms(ctx)
  drawLadders(ctx)
  drawGoal(ctx, s, family)
  drawTentKong(ctx, s, family)
  drawDollies(ctx, s)
  drawTables(ctx, s)
  drawPlayer(ctx, s, family)
  drawPopups(ctx, s, family)
  drawBonusLifeFlash(ctx, s, family)
}

function drawBonusLifeFlash(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  if (s.bonusFlashFrames <= 0) return
  // Fade over the last 30 frames of the 90-frame flash.
  const alpha = s.bonusFlashFrames < 30 ? s.bonusFlashFrames / 30 : 1
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // Soft amber glow backdrop
  ctx.shadowColor = `rgba(255,184,0,${alpha * 0.85})`
  ctx.shadowBlur = 16
  ctx.fillStyle = `rgba(255,215,80,${alpha})`
  ctx.font = `900 36px ${family}`
  ctx.fillText('BONUS LIFE! ★', W / 2, H / 2)
  ctx.restore()
}

// ─── Backgrounds ─────────────────────────────────────────────────────────────
function drawBackground(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  kind: LevelConfig['bg'],
  family: string,
  logo: HTMLImageElement | null,
  logoLoaded: boolean,
) {
  // Base
  ctx.fillStyle = C.BG_BASE
  ctx.fillRect(0, 0, W, H)

  switch (kind) {
    case 'warehouse':  drawWarehouseBg(ctx, s, family, logo, logoLoaded); break
    case 'dock':       drawDockBg(ctx, s, family, logo, logoLoaded);      break
    case 'outdoor':    drawOutdoorBg(ctx, s, family);                     break
    case 'ballroom':   drawBallroomBg(ctx, s, family);                    break
  }
}

function drawWarehouseBg(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  family: string,
  logo: HTMLImageElement | null,
  logoLoaded: boolean,
) {
  // Back wall
  ctx.fillStyle = C.WALL_BG
  ctx.fillRect(0, 0, W, H * 0.92)

  // Wall grid panel seams
  ctx.fillStyle = 'rgba(255,255,255,0.022)'
  for (let x = 0; x < W; x += 60) ctx.fillRect(x, 0, 1, H * 0.92)
  for (let y = 0; y < H * 0.92; y += 60) ctx.fillRect(0, y, W, 1)

  // Background shelving silhouettes
  ctx.fillStyle = 'rgba(255,255,255,0.022)'
  ctx.fillRect(2, 80,  18, 460)
  ctx.fillRect(W - 20, 80, 18, 460)

  // Amber wall sconces × 4
  drawSconce(ctx, 24, 130)
  drawSconce(ctx, 24, 360)
  drawSconce(ctx, W - 24, 130)
  drawSconce(ctx, W - 24, 360)

  // Fluorescent ceiling strips × 3
  drawFluorescent(ctx, W * 0.22, 4)
  drawFluorescent(ctx, W * 0.50, 4)
  drawFluorescent(ctx, W * 0.78, 4)

  // PTR sign — center back wall, above the action.
  drawPtrSign(ctx, W / 2, 78, 168, 80, family, logo, logoLoaded)
  // Tagline
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.font = `700 6px ${family}`
  ctx.textAlign = 'center'
  ctx.fillText("HUDSON VALLEY'S TENT & EVENT SPECIALISTS", W / 2, 124)

  // Floor
  const floorGrad = ctx.createLinearGradient(0, H * 0.92, 0, H)
  floorGrad.addColorStop(0, '#1A1428')
  floorGrad.addColorStop(1, '#0E0C18')
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, H * 0.92, W, H * 0.08)
  // Amber bounce
  ctx.fillStyle = 'rgba(255,110,20,0.06)'
  ctx.fillRect(0, H * 0.93, W, H * 0.07)
}

function drawSconce(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Glow
  const g = ctx.createRadialGradient(x, y, 4, x, y, 85)
  g.addColorStop(0, 'rgba(255,140,20,0.28)')
  g.addColorStop(1, 'rgba(255,140,20,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, 85, 0, Math.PI * 2)
  ctx.fill()
  // Sconce body
  ctx.fillStyle = '#CC7010'
  ctx.fillRect(x - 3, y - 6, 6, 12)
  ctx.fillStyle = '#8B4A0A'
  ctx.fillRect(x - 3, y + 4, 6, 2)
}

function drawFluorescent(ctx: CanvasRenderingContext2D, cx: number, y: number) {
  // Strip
  ctx.fillStyle = 'rgba(240,248,255,0.92)'
  ctx.fillRect(cx - 18, y, 36, 4)
  // Light cone
  const g = ctx.createLinearGradient(0, y, 0, y + 190)
  g.addColorStop(0, 'rgba(220,235,255,0.12)')
  g.addColorStop(1, 'rgba(220,235,255,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(cx - 20, y + 4)
  ctx.lineTo(cx + 20, y + 4)
  ctx.lineTo(cx + 80, y + 190)
  ctx.lineTo(cx - 80, y + 190)
  ctx.closePath()
  ctx.fill()
}

function drawPtrSign(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, w: number, h: number,
  family: string,
  logo: HTMLImageElement | null,
  logoLoaded: boolean,
) {
  const ax = cx - w / 2
  const ay = cy - h / 2
  // Wall shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(ax + 4, ay + 6, w, h)
  // Side depth face (right)
  ctx.fillStyle = '#1A1A1A'
  ctx.beginPath()
  ctx.moveTo(ax + w, ay)
  ctx.lineTo(ax + w + 4, ay + 4)
  ctx.lineTo(ax + w + 4, ay + h + 4)
  ctx.lineTo(ax + w, ay + h)
  ctx.closePath()
  ctx.fill()
  // Bottom depth
  ctx.fillStyle = '#1E1E1E'
  ctx.beginPath()
  ctx.moveTo(ax, ay + h)
  ctx.lineTo(ax + 4, ay + h + 4)
  ctx.lineTo(ax + w + 4, ay + h + 4)
  ctx.lineTo(ax + w, ay + h)
  ctx.closePath()
  ctx.fill()
  // Aluminum frame
  const frame = ctx.createLinearGradient(ax, ay, ax, ay + h)
  frame.addColorStop(0,    '#D0D0D0')
  frame.addColorStop(0.5,  '#EBEBEB')
  frame.addColorStop(1,    '#A8A8A8')
  ctx.fillStyle = frame
  ctx.fillRect(ax, ay, w, h)
  // Inner bevel
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(ax + 3, ay + 3, w - 6, 1)
  ctx.fillRect(ax + 3, ay + h - 4, w - 6, 1)
  ctx.fillRect(ax + 3, ay + 3, 1, h - 6)
  ctx.fillRect(ax + w - 4, ay + 3, 1, h - 6)
  // Acrylic face
  const acrylic = ctx.createLinearGradient(ax, ay, ax, ay + h)
  acrylic.addColorStop(0,   '#F0F4FF')
  acrylic.addColorStop(0.5, '#FFFFFF')
  acrylic.addColorStop(1,   '#E8EEFF')
  const fx = ax + 5, fy = ay + 5, fw = w - 10, fh = h - 10
  ctx.fillStyle = acrylic
  ctx.fillRect(fx, fy, fw, fh)
  // Gloss reflection
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.moveTo(fx, fy)
  ctx.lineTo(fx + fw * 0.45, fy)
  ctx.lineTo(fx, fy + fh * 0.55)
  ctx.closePath()
  ctx.fill()
  // Backlit edge glow
  ctx.fillStyle = 'rgba(0,0,200,0.08)'
  ctx.fillRect(fx, fy, fw, 4)
  ctx.fillRect(fx, fy + fh - 4, fw, 4)
  ctx.fillRect(fx, fy, 4, fh)
  ctx.fillRect(fx + fw - 4, fy, 4, fh)

  if (logo && logoLoaded) {
    // Fit logo into face with padding
    const pad = 6
    const iw = fw - pad * 2
    const ih = fh - pad * 2
    // Maintain aspect ratio
    const ar = (logo.naturalWidth || 1) / (logo.naturalHeight || 1)
    let drawW = iw
    let drawH = drawW / ar
    if (drawH > ih) {
      drawH = ih
      drawW = drawH * ar
    }
    const dx = fx + (fw - drawW) / 2
    const dy = fy + (fh - drawH) / 2
    ctx.drawImage(logo, dx, dy, drawW, drawH)
  } else {
    // Procedural fallback wordmark.
    ctx.fillStyle = '#0000CC'
    ctx.font = `900 22px ${family}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('PARTYTIME', cx, cy - 8)
    ctx.fillStyle = '#FFB800'
    ctx.font = `900 14px ${family}`
    ctx.fillText('RENTALS', cx, cy + 14)
  }
}

function drawDockBg(
  ctx: CanvasRenderingContext2D,
  s: GameState,
  family: string,
  logo: HTMLImageElement | null,
  logoLoaded: boolean,
) {
  // Walls
  ctx.fillStyle = '#0C0916'
  ctx.fillRect(0, 0, W, H * 0.92)

  // Loading bay door — open, daylight beyond
  const bayX = 75, bayY = 30, bayW = W - 150, bayH = 200
  // Daylight gradient inside
  const dl = ctx.createLinearGradient(bayX, bayY, bayX, bayY + bayH)
  dl.addColorStop(0, '#3a4860')
  dl.addColorStop(0.5, '#5a6e90')
  dl.addColorStop(1, '#1c2438')
  ctx.fillStyle = dl
  ctx.fillRect(bayX, bayY, bayW, bayH)
  // Frame
  ctx.fillStyle = '#2A2A36'
  ctx.fillRect(bayX - 4, bayY - 4, bayW + 8, 4)
  ctx.fillRect(bayX - 4, bayY - 4, 4, bayH + 8)
  ctx.fillRect(bayX + bayW, bayY - 4, 4, bayH + 8)
  // Raised door panels at top
  ctx.fillStyle = '#1a1a26'
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(bayX, bayY + i * 6, bayW, 4)
  }
  // Distant truck silhouette
  ctx.fillStyle = '#15192a'
  ctx.fillRect(bayX + 30, bayY + bayH - 60, bayW - 60, 50)
  ctx.fillRect(bayX + 50, bayY + bayH - 80, bayW - 100, 22)

  // Pallet stacks left/right
  drawPalletStack(ctx, 24, 220, 4)
  drawPalletStack(ctx, W - 50, 230, 3)
  drawPalletStack(ctx, 18, 360, 2)
  drawPalletStack(ctx, W - 56, 380, 5)

  // Sconces (fewer than warehouse)
  drawSconce(ctx, 28, 410)
  drawSconce(ctx, W - 28, 420)

  // Small PTR badge on the wall above the door
  drawPtrSign(ctx, W / 2, 12, 120, 22, family, logo, logoLoaded)

  // Floor
  const floorGrad = ctx.createLinearGradient(0, H * 0.92, 0, H)
  floorGrad.addColorStop(0, '#1F1726')
  floorGrad.addColorStop(1, '#0F0E18')
  ctx.fillStyle = floorGrad
  ctx.fillRect(0, H * 0.92, W, H * 0.08)
}

function drawPalletStack(ctx: CanvasRenderingContext2D, x: number, y: number, n: number) {
  for (let i = 0; i < n; i++) {
    const py = y - i * 7
    ctx.fillStyle = '#3a2a18'
    ctx.fillRect(x, py, 28, 6)
    ctx.fillStyle = '#5a4028'
    ctx.fillRect(x, py, 28, 2)
    ctx.fillStyle = '#251a0e'
    ctx.fillRect(x + 4, py + 4, 2, 2)
    ctx.fillRect(x + 22, py + 4, 2, 2)
  }
}

function drawOutdoorBg(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7)
  sky.addColorStop(0, '#1a0830')
  sky.addColorStop(0.6, '#4a1f6a')
  sky.addColorStop(1, '#704020')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H * 0.7)

  // Star dots
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < 30; i++) {
    const sx = (i * 37) % W
    const sy = (i * 53) % 120
    ctx.fillRect(sx, sy, 1, 1)
  }

  // Distant tent silhouettes
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  for (let i = 0; i < 5; i++) {
    const tx = 30 + i * 70
    const ty = 380
    ctx.beginPath()
    ctx.moveTo(tx - 30, ty)
    ctx.lineTo(tx, ty - 30)
    ctx.lineTo(tx + 30, ty)
    ctx.closePath()
    ctx.fill()
  }

  // PTR truck silhouette far right
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(W - 90, 400, 70, 35)
  ctx.fillStyle = 'rgba(0,0,0,0.7)'
  ctx.fillRect(W - 88, 388, 40, 14)
  // Truck side glow (PTR brand)
  ctx.fillStyle = 'rgba(0,0,170,0.4)'
  ctx.fillRect(W - 88, 408, 60, 16)
  ctx.fillStyle = '#FFB800'
  ctx.font = `900 6px ${family}`
  ctx.textAlign = 'center'
  ctx.fillText('PTR', W - 58, 418)

  // Ground/grass
  const grass = ctx.createLinearGradient(0, H * 0.7, 0, H)
  grass.addColorStop(0, '#1a2618')
  grass.addColorStop(1, '#0e1208')
  ctx.fillStyle = grass
  ctx.fillRect(0, H * 0.7, W, H * 0.3)

  // Cool purple ambient light tint over everything
  ctx.fillStyle = 'rgba(80,40,150,0.06)'
  ctx.fillRect(0, 0, W, H)
}

function drawBallroomBg(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  // Deep warm ambient
  const amb = ctx.createLinearGradient(0, 0, 0, H * 0.92)
  amb.addColorStop(0,   '#1e1024')
  amb.addColorStop(0.5, '#2c1a30')
  amb.addColorStop(1,   '#1a0c1c')
  ctx.fillStyle = amb
  ctx.fillRect(0, 0, W, H * 0.92)

  // Fairy lights
  for (let i = 0; i < 60; i++) {
    const fx = (i * 41) % W
    const fy = (i * 23) % (H * 0.85)
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 5)
    g.addColorStop(0, 'rgba(255,210,140,0.85)')
    g.addColorStop(1, 'rgba(255,210,140,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(fx, fy, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Chandelier silhouettes
  drawChandelier(ctx, 90, 70)
  drawChandelier(ctx, W - 90, 70)

  // Ornate arch where the PTR sign would be (center top)
  const ax = W / 2, ay = 70
  ctx.fillStyle = 'rgba(255,200,120,0.18)'
  ctx.beginPath()
  ctx.ellipse(ax, ay, 90, 38, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3a2818'
  ctx.beginPath()
  ctx.ellipse(ax, ay + 4, 70, 28, 0, Math.PI, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFB800'
  ctx.font = `900 9px ${family}`
  ctx.textAlign = 'center'
  ctx.fillText('PARTYTIME', ax, ay + 4)
  ctx.font = `700 7px ${family}`
  ctx.fillText('GRAND BALLROOM', ax, ay + 14)

  // Warm floor
  const floor = ctx.createLinearGradient(0, H * 0.92, 0, H)
  floor.addColorStop(0, '#2a1a26')
  floor.addColorStop(1, '#180c18')
  ctx.fillStyle = floor
  ctx.fillRect(0, H * 0.92, W, H * 0.08)
  // Warm bounce
  ctx.fillStyle = 'rgba(255,180,80,0.06)'
  ctx.fillRect(0, H * 0.85, W, H * 0.15)
}

function drawChandelier(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Chain
  ctx.fillStyle = 'rgba(255,200,120,0.4)'
  ctx.fillRect(cx - 1, 0, 2, cy - 12)
  // Ring
  ctx.strokeStyle = 'rgba(220,170,90,0.55)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(cx, cy, 22, 6, 0, 0, Math.PI * 2)
  ctx.stroke()
  // Bulbs
  for (let i = 0; i < 5; i++) {
    const bx = cx - 18 + i * 9
    const g = ctx.createRadialGradient(bx, cy + 2, 0, bx, cy + 2, 8)
    g.addColorStop(0, 'rgba(255,220,140,0.9)')
    g.addColorStop(1, 'rgba(255,220,140,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(bx, cy + 2, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ─── Platforms ───────────────────────────────────────────────────────────────
function drawPlatforms(ctx: CanvasRenderingContext2D) {
  for (const p of PLATFORMS) {
    drawPlatformTile(ctx, p)
  }
}

function drawPlatformTile(ctx: CanvasRenderingContext2D, p: PlatformDef) {
  const x1 = p.x1, x2 = p.x2
  const y1 = p.y1, y2 = p.y2
  const dx = x2 - x1
  const dy = y2 - y1
  const height = 10
  const underHeight = 5

  // Drop shadow
  ctx.save()
  const sg = ctx.createLinearGradient(0, y1 + height + 18, 0, y1 + height + 30)
  sg.addColorStop(0, 'rgba(0,0,0,0.32)')
  sg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sg
  ctx.beginPath()
  ctx.moveTo(x1, y1 + height + 4)
  ctx.lineTo(x2, y2 + height + 4)
  ctx.lineTo(x2, y2 + height + 24)
  ctx.lineTo(x1, y1 + height + 24)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Underside
  ctx.fillStyle = C.PLATFORM_UNDER
  ctx.beginPath()
  ctx.moveTo(x1, y1 + height)
  ctx.lineTo(x2, y2 + height)
  ctx.lineTo(x2, y2 + height + underHeight)
  ctx.lineTo(x1, y1 + height + underHeight)
  ctx.closePath()
  ctx.fill()

  // Top surface — gradient
  const grad = ctx.createLinearGradient(0, Math.min(y1, y2), 0, Math.max(y1, y2) + height)
  grad.addColorStop(0, C.PLATFORM_HI)
  grad.addColorStop(0.4, C.PLATFORM_MID)
  grad.addColorStop(0.75, C.PLATFORM_LO)
  grad.addColorStop(1, C.PLATFORM_VLO)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x2, y2 + height)
  ctx.lineTo(x1, y1 + height)
  ctx.closePath()
  ctx.fill()

  // Specular sheen
  ctx.fillStyle = 'rgba(255,255,200,0.22)'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.lineTo(x2, y2 + 3)
  ctx.lineTo(x1, y1 + 3)
  ctx.closePath()
  ctx.fill()

  // Rivets at ends
  drawRivet(ctx, x1 + 6, y1 + 5)
  drawRivet(ctx, x2 - 6, y2 + 5)
  // Mid rivets
  if (dx > 100) {
    drawRivet(ctx, x1 + dx * 0.33, y1 + dy * 0.33 + 5)
    drawRivet(ctx, x1 + dx * 0.66, y1 + dy * 0.66 + 5)
  }

  // Stanchions for floating platforms (P1, P2, P3)
  if (p.idx >= 1 && p.idx <= 3) {
    const below = PLATFORMS[p.idx - 1]
    const cx = (x1 + x2) / 2
    const topY = (y1 + y2) / 2 + height
    const botY = psy(below, cx)
    // Stanchion gradient
    const stG = ctx.createLinearGradient(cx - 4, 0, cx + 4, 0)
    stG.addColorStop(0, '#3a3422')
    stG.addColorStop(0.5, '#6a5a32')
    stG.addColorStop(1, '#2a2418')
    ctx.fillStyle = stG
    ctx.fillRect(cx - 3, topY, 6, botY - topY)
    // Foot plate
    ctx.fillStyle = '#1a1408'
    ctx.fillRect(cx - 8, botY - 3, 16, 3)
  }
}

function drawRivet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#2A1A08'
  ctx.beginPath()
  ctx.arc(x, y, 2.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#C8A040'
  ctx.beginPath()
  ctx.arc(x, y, 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#FFE0A0'
  ctx.beginPath()
  ctx.arc(x - 0.5, y - 0.5, 0.5, 0, Math.PI * 2)
  ctx.fill()
}

// ─── Ladders ─────────────────────────────────────────────────────────────────
function drawLadders(ctx: CanvasRenderingContext2D) {
  for (const l of LADDERS) {
    const top = PLATFORMS[l.topP]
    const bot = PLATFORMS[l.bottomP]
    const yTop = psy(top, l.cx)
    const yBot = psy(bot, l.cx)
    drawLadder(ctx, l.cx, yTop, yBot)
  }
}

function drawLadder(ctx: CanvasRenderingContext2D, cx: number, yTop: number, yBot: number) {
  const railOffset = 7
  // Left rail
  const lg = ctx.createLinearGradient(cx - railOffset - 3, 0, cx - railOffset + 3, 0)
  lg.addColorStop(0,   C.LADDER_LO)
  lg.addColorStop(0.4, C.LADDER_MID)
  lg.addColorStop(0.6, C.LADDER_HI)
  lg.addColorStop(1,   C.LADDER_VLO)
  ctx.fillStyle = lg
  ctx.fillRect(cx - railOffset - 2, yTop, 4, yBot - yTop)
  // Right rail
  const rg = ctx.createLinearGradient(cx + railOffset - 3, 0, cx + railOffset + 3, 0)
  rg.addColorStop(0,   C.LADDER_LO)
  rg.addColorStop(0.4, C.LADDER_MID)
  rg.addColorStop(0.6, C.LADDER_HI)
  rg.addColorStop(1,   C.LADDER_VLO)
  ctx.fillStyle = rg
  ctx.fillRect(cx + railOffset - 2, yTop, 4, yBot - yTop)
  // Rungs
  const rungStep = 14
  for (let y = yTop + 6; y < yBot - 2; y += rungStep) {
    ctx.fillStyle = '#7A5000'
    ctx.fillRect(cx - railOffset, y, railOffset * 2, 3)
    ctx.fillStyle = '#D49020'
    ctx.fillRect(cx - railOffset, y, railOffset * 2, 1)
  }
  // Joint collars (every 50px)
  for (let y = yTop + 30; y < yBot - 30; y += 50) {
    ctx.fillStyle = '#3a2400'
    ctx.fillRect(cx - railOffset - 3, y, (railOffset + 3) * 2, 5)
    ctx.fillStyle = '#7A5000'
    ctx.fillRect(cx - railOffset - 3, y, (railOffset + 3) * 2, 1)
  }
}

// ─── Goal (signed contract) ──────────────────────────────────────────────────
function drawGoal(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  const p4 = PLATFORMS[4]
  const gx = p4.x2 - 24
  const gy = psy(p4, gx) - 22
  // Pulsing glow
  const pulse = 0.7 + Math.sin(s.goalGlow) * 0.25
  const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, 38)
  g.addColorStop(0, `rgba(255,200,60,${0.55 * pulse})`)
  g.addColorStop(1, 'rgba(255,200,60,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(gx, gy, 38, 0, Math.PI * 2)
  ctx.fill()
  // Paper
  ctx.fillStyle = '#F8F0D8'
  ctx.fillRect(gx - 10, gy - 14, 20, 26)
  // Page lines
  ctx.fillStyle = 'rgba(60,40,20,0.4)'
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(gx - 7, gy - 9 + i * 4, 14, 1)
  }
  // SIGNED stamp
  ctx.save()
  ctx.translate(gx, gy + 5)
  ctx.rotate(-0.25)
  ctx.fillStyle = 'rgba(180,30,30,0.65)'
  ctx.strokeStyle = 'rgba(180,30,30,0.65)'
  ctx.lineWidth = 1
  ctx.strokeRect(-9, -4, 18, 8)
  ctx.font = `900 5.5px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('SIGNED', 0, 0)
  ctx.restore()
  // Gold star at top corner
  ctx.fillStyle = '#FFD040'
  drawStar(ctx, gx + 6, gy - 12, 4)
  // Label
  ctx.fillStyle = 'rgba(255,184,0,0.95)'
  ctx.font = `900 8px ${family}`
  ctx.textAlign = 'center'
  ctx.fillText('GOAL', gx, gy + 22)
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    const a2 = a + Math.PI / 5
    ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45)
  }
  ctx.closePath()
  ctx.fill()
}

// ─── Tent Kong ───────────────────────────────────────────────────────────────
function drawTentKong(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  const baseX = 70
  const baseY = psy(PLATFORMS[4], baseX)
  const bob = Math.sin(s.bgFrame * 0.06) * 1.4
  const cx = baseX
  const cy = baseY - 30 + bob

  // Ground shadow
  const sh = ctx.createRadialGradient(cx, baseY + 2, 4, cx, baseY + 2, 30)
  sh.addColorStop(0, 'rgba(0,0,0,0.55)')
  sh.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sh
  ctx.beginPath()
  ctx.ellipse(cx, baseY + 2, 30, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // Feet (two ellipses each, dark to mid)
  ctx.fillStyle = '#180C04'
  ctx.beginPath(); ctx.ellipse(cx - 10, baseY - 1, 8, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 10, baseY - 1, 8, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#2C1808'
  ctx.beginPath(); ctx.ellipse(cx - 10, baseY - 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 10, baseY - 2, 7, 3, 0, 0, Math.PI * 2); ctx.fill()

  // Legs (three-stroke per leg)
  drawKongLeg(ctx, cx - 8, baseY - 4, cx - 7, cy + 16)
  drawKongLeg(ctx, cx + 8, baseY - 4, cx + 7, cy + 16)

  // Body — four ellipse layers
  // Largest shadow
  ctx.fillStyle = C.FUR_SHADOW
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 26, 22, 0, 0, Math.PI * 2); ctx.fill()
  // Base
  ctx.fillStyle = C.FUR_BASE
  ctx.beginPath(); ctx.ellipse(cx, cy + 2, 24, 21, 0, 0, Math.PI * 2); ctx.fill()
  // Mid (offset upper-left)
  ctx.fillStyle = C.FUR_MID
  ctx.beginPath(); ctx.ellipse(cx - 3, cy - 1, 22, 19, 0, 0, Math.PI * 2); ctx.fill()
  // Highlight (small upper-left)
  ctx.fillStyle = C.FUR_HIGHLIGHT
  ctx.beginPath(); ctx.ellipse(cx - 8, cy - 6, 11, 7, 0, 0, Math.PI * 2); ctx.fill()

  // Chest patch (warm cream, lighter brown layers)
  ctx.fillStyle = '#503014'
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 13, 11, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#7A4818'
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 11, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#a0683a'
  ctx.beginPath(); ctx.ellipse(cx - 2, cy + 3, 8, 6, 0, 0, Math.PI * 2); ctx.fill()

  // PTR shirt: gradient rect with highlight
  const shirtY = cy - 1, shirtH = 16
  const shirtG = ctx.createLinearGradient(0, shirtY, 0, shirtY + shirtH)
  shirtG.addColorStop(0, '#0000CC')
  shirtG.addColorStop(1, '#000088')
  ctx.fillStyle = shirtG
  ctx.fillRect(cx - 10, shirtY, 20, shirtH)
  // Top highlight
  ctx.fillStyle = 'rgba(100,100,255,0.22)'
  ctx.fillRect(cx - 10, shirtY, 20, 3)
  // PTR text
  ctx.fillStyle = '#FFB800'
  ctx.font = `900 7px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PTR', cx, shirtY + shirtH / 2)

  // Shoulder masses
  ctx.fillStyle = C.FUR_SHADOW
  ctx.beginPath(); ctx.ellipse(cx - 18, cy - 6, 10, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 18, cy - 6, 10, 9, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_BASE
  ctx.beginPath(); ctx.ellipse(cx - 18, cy - 7, 8, 7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 18, cy - 7, 8, 7, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_HIGHLIGHT
  ctx.beginPath(); ctx.ellipse(cx - 20, cy - 9, 4, 3, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 16, cy - 9, 4, 3, 0, 0, Math.PI * 2); ctx.fill()

  // Arms
  // Right arm (hanging down)
  drawKongArm(ctx, cx + 18, cy - 4, cx + 22, cy + 18, false)
  // Left arm (raised throw position based on kongArm)
  const armLift = s.kongArm
  const lShoulderX = cx - 18, lShoulderY = cy - 6
  const lHandX = cx - 22 - armLift * 6
  const lHandY = cy + 8 - armLift * 28
  drawKongArm(ctx, lShoulderX, lShoulderY, lHandX, lHandY, true)
  // Mini table in throw hand when arm is up
  if (armLift > 0.3) {
    const a = armLift
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.beginPath(); ctx.ellipse(lHandX, lHandY + 4, 8, 2, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#C0B490'
    ctx.beginPath(); ctx.ellipse(lHandX, lHandY, 8, 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#EEE4C8'
    ctx.beginPath(); ctx.ellipse(lHandX, lHandY - 1, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.beginPath(); ctx.ellipse(lHandX - 2, lHandY - 1.5, 2, 0.7, 0, 0, Math.PI * 2); ctx.fill()
  }

  // Head — 4-tone
  const hcy = cy - 18
  ctx.fillStyle = C.FUR_SHADOW
  ctx.beginPath(); ctx.ellipse(cx, hcy + 2, 17, 16, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_BASE
  ctx.beginPath(); ctx.ellipse(cx, hcy + 1, 16, 15, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_MID
  ctx.beginPath(); ctx.ellipse(cx - 2, hcy - 1, 15, 14, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_HIGHLIGHT
  ctx.beginPath(); ctx.ellipse(cx - 5, hcy - 5, 7, 5, 0, 0, Math.PI * 2); ctx.fill()

  // Sagittal crest
  ctx.fillStyle = C.FUR_SHADOW
  ctx.beginPath()
  ctx.moveTo(cx - 6, hcy - 12)
  ctx.quadraticCurveTo(cx, hcy - 20, cx + 6, hcy - 12)
  ctx.lineTo(cx + 4, hcy - 10)
  ctx.quadraticCurveTo(cx, hcy - 16, cx - 4, hcy - 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = C.FUR_MID
  ctx.beginPath()
  ctx.moveTo(cx - 4, hcy - 12)
  ctx.quadraticCurveTo(cx, hcy - 18, cx + 4, hcy - 12)
  ctx.lineTo(cx + 2, hcy - 11)
  ctx.quadraticCurveTo(cx, hcy - 15, cx - 2, hcy - 11)
  ctx.closePath()
  ctx.fill()

  // Face skin area (dark warm brown)
  ctx.fillStyle = '#3A1808'
  ctx.beginPath(); ctx.ellipse(cx, hcy + 1, 11, 10, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#5A2A0C'
  ctx.beginPath(); ctx.ellipse(cx, hcy + 1, 9, 8, 0, 0, Math.PI * 2); ctx.fill()

  // Heavy brow ridge
  ctx.fillStyle = C.FUR_SHADOW
  ctx.beginPath()
  ctx.moveTo(cx - 9, hcy - 5)
  ctx.quadraticCurveTo(cx, hcy - 9, cx + 9, hcy - 5)
  ctx.quadraticCurveTo(cx + 8, hcy - 2, cx, hcy - 3)
  ctx.quadraticCurveTo(cx - 8, hcy - 2, cx - 9, hcy - 5)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = C.FUR_BASE
  ctx.beginPath()
  ctx.moveTo(cx - 8, hcy - 5)
  ctx.quadraticCurveTo(cx, hcy - 8, cx + 8, hcy - 5)
  ctx.quadraticCurveTo(cx + 7, hcy - 3, cx, hcy - 4)
  ctx.quadraticCurveTo(cx - 7, hcy - 3, cx - 8, hcy - 5)
  ctx.closePath()
  ctx.fill()

  // Eyes
  ctx.fillStyle = '#FFF8EA'
  ctx.beginPath(); ctx.ellipse(cx - 4, hcy - 1, 1.8, 2.2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 4, hcy - 1, 1.8, 2.2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#CC4400'
  ctx.beginPath(); ctx.ellipse(cx - 4, hcy - 0.5, 1.1, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 4, hcy - 0.5, 1.1, 1.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#220500'
  ctx.beginPath(); ctx.arc(cx - 4, hcy - 0.3, 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 4, hcy - 0.3, 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FFF'
  ctx.beginPath(); ctx.arc(cx - 4.4, hcy - 0.7, 0.3, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(cx + 3.6, hcy - 0.7, 0.3, 0, Math.PI * 2); ctx.fill()

  // Nose (wide flat gorilla)
  ctx.fillStyle = '#2A1004'
  ctx.beginPath(); ctx.ellipse(cx, hcy + 3, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#1a0800'
  ctx.beginPath(); ctx.ellipse(cx - 1.6, hcy + 3.4, 0.7, 0.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx + 1.6, hcy + 3.4, 0.7, 0.5, 0, 0, Math.PI * 2); ctx.fill()

  // Mouth grimace + teeth
  ctx.fillStyle = '#1a0500'
  ctx.fillRect(cx - 5, hcy + 6, 10, 2)
  ctx.fillStyle = '#fff8e0'
  ctx.fillRect(cx - 4, hcy + 6, 1.6, 1.4)
  ctx.fillRect(cx - 1.4, hcy + 6, 1.6, 1.4)
  ctx.fillRect(cx + 1.2, hcy + 6, 1.6, 1.4)
  // Upper lip
  ctx.fillStyle = '#3a1808'
  ctx.fillRect(cx - 5, hcy + 5.5, 10, 0.8)

  // Chin lighter tone
  ctx.fillStyle = '#5A2A0C'
  ctx.beginPath(); ctx.ellipse(cx, hcy + 9, 4, 2, 0, 0, Math.PI * 2); ctx.fill()

  // Party hat
  drawPartyHat(ctx, cx, hcy - 12)

  // Label
  ctx.fillStyle = 'rgba(200,80,60,0.85)'
  ctx.font = `800 8.5px ${family}`
  ctx.textAlign = 'center'
  ctx.fillText('TENT KONG', cx, cy + 38)
}

function drawKongArm(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, raised: boolean) {
  // Bezier curve
  const mx = (x1 + x2) / 2 + (raised ? -8 : 6)
  const my = (y1 + y2) / 2
  // Four stroke passes (decreasing widths)
  const widths = [21, 17, 12, 6]
  const colors = ['#1A0C04', '#2C1808', C.FUR_BASE, C.FUR_HIGHLIGHT]
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = colors[i]
    ctx.lineWidth = widths[i]
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.quadraticCurveTo(mx, my, x2, y2)
    ctx.stroke()
  }
  // Knuckles (3-layer ellipse at hand)
  ctx.fillStyle = C.FUR_SHADOW
  ctx.beginPath(); ctx.ellipse(x2, y2, 6, 5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_BASE
  ctx.beginPath(); ctx.ellipse(x2, y2 - 0.5, 5, 4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = C.FUR_HIGHLIGHT
  ctx.beginPath(); ctx.ellipse(x2 - 1, y2 - 1.5, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill()
}

function drawKongLeg(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const widths = [16, 12, 6]
  const colors = ['#1A0E04', C.FUR_BASE, C.FUR_HIGHLIGHT]
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = colors[i]
    ctx.lineWidth = widths[i]
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1 - (i === 2 ? 1 : 0), y1 - (i === 2 ? 2 : 0))
    ctx.lineTo(x2 - (i === 2 ? 1 : 0), y2)
    ctx.stroke()
  }
}

function drawPartyHat(ctx: CanvasRenderingContext2D, cx: number, baseY: number) {
  // Cone shadow base
  ctx.fillStyle = '#6a0030'
  ctx.beginPath()
  ctx.moveTo(cx - 8, baseY)
  ctx.lineTo(cx + 8, baseY)
  ctx.lineTo(cx + 1, baseY - 18)
  ctx.closePath()
  ctx.fill()
  // Base color
  ctx.fillStyle = '#CC1A66'
  ctx.beginPath()
  ctx.moveTo(cx - 7, baseY)
  ctx.lineTo(cx + 7, baseY)
  ctx.lineTo(cx + 0.5, baseY - 17)
  ctx.closePath()
  ctx.fill()
  // Highlight (upper-left edge)
  ctx.fillStyle = '#FF7AB8'
  ctx.beginPath()
  ctx.moveTo(cx - 5, baseY - 2)
  ctx.lineTo(cx - 2, baseY - 2)
  ctx.lineTo(cx, baseY - 14)
  ctx.closePath()
  ctx.fill()
  // Stripe
  ctx.fillStyle = '#FFD040'
  ctx.fillRect(cx - 5, baseY - 7, 10, 1.5)
  // Pom pom
  ctx.fillStyle = '#FFD040'
  ctx.beginPath(); ctx.arc(cx + 1, baseY - 18, 2.4, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#FFF080'
  ctx.beginPath(); ctx.arc(cx + 0.4, baseY - 18.6, 1, 0, Math.PI * 2); ctx.fill()
}

// ─── Player ──────────────────────────────────────────────────────────────────
function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  const p = s.player
  // Invincibility flicker
  if (p.invincible > 0 && Math.floor(p.invincible / 6) % 2 === 0) return
  const x = p.x
  const y = p.y  // foot y
  const stride = p.walking ? Math.sin(p.walkAnim) * 3.5 : 0
  const facing = p.facing

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.42)'
  ctx.beginPath(); ctx.ellipse(x, y + 2, 10, 3, 0, 0, Math.PI * 2); ctx.fill()

  // Legs (2-tone)
  // Back leg
  ctx.fillStyle = '#0c0e1a'
  ctx.fillRect(x - 4, y - 14, 3, 14 + stride * 0.3)
  ctx.fillRect(x + 1, y - 14, 3, 14 - stride * 0.3)
  ctx.fillStyle = '#1c1e2e'
  ctx.fillRect(x - 4, y - 14, 1.5, 14)
  ctx.fillRect(x + 1, y - 14, 1.5, 14)
  // Boots
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(x - 5, y - 2, 4, 3)
  ctx.fillRect(x + 1, y - 2, 4, 3)

  // Body — shirt (PTR blue gradient)
  const bodyTop = y - 28
  const bodyH = 14
  const bg = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyH)
  bg.addColorStop(0,   '#0000AA')
  bg.addColorStop(0.5, '#0000EE')
  bg.addColorStop(1,   '#000088')
  ctx.fillStyle = bg
  ctx.fillRect(x - 6, bodyTop, 12, bodyH)
  ctx.fillStyle = 'rgba(100,100,255,0.22)'
  ctx.fillRect(x - 6, bodyTop, 12, 2)
  // PTR mark (small)
  ctx.fillStyle = '#FFB800'
  ctx.font = `900 5px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PTR', x, bodyTop + bodyH / 2)

  // Arms (2-stroke)
  ctx.strokeStyle = '#0a0a14'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - 6, bodyTop + 2); ctx.lineTo(x - 9 + facing * 2, bodyTop + 10)
  ctx.moveTo(x + 6, bodyTop + 2); ctx.lineTo(x + 9 + facing * 2, bodyTop + 10)
  ctx.stroke()
  ctx.strokeStyle = '#0000AA'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x - 6, bodyTop + 2); ctx.lineTo(x - 9 + facing * 2, bodyTop + 10)
  ctx.moveTo(x + 6, bodyTop + 2); ctx.lineTo(x + 9 + facing * 2, bodyTop + 10)
  ctx.stroke()

  // Skin (head + face) - 3-tone
  const headCy = y - 35
  ctx.fillStyle = '#7a3a14'  // shadow
  ctx.beginPath(); ctx.ellipse(x, headCy + 1, 6, 5.5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#d18858'
  ctx.beginPath(); ctx.ellipse(x, headCy, 5.5, 5, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#f0b888'
  ctx.beginPath(); ctx.ellipse(x - 1, headCy - 1, 3.5, 3, 0, 0, Math.PI * 2); ctx.fill()
  // Eyes
  ctx.fillStyle = '#0a0a14'
  ctx.beginPath(); ctx.arc(x - 2 + facing * 0.5, headCy, 0.7, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 2 + facing * 0.5, headCy, 0.7, 0, Math.PI * 2); ctx.fill()

  // Hard hat (3-tone)
  ctx.fillStyle = '#886000'
  ctx.beginPath(); ctx.ellipse(x, headCy - 4, 7, 4, 0, Math.PI, 0); ctx.fill()
  ctx.fillStyle = '#CCAA00'
  ctx.beginPath(); ctx.ellipse(x, headCy - 4.5, 6, 3.5, 0, Math.PI, 0); ctx.fill()
  ctx.fillStyle = '#FFD020'
  ctx.beginPath(); ctx.ellipse(x - 2, headCy - 6, 3, 1.5, 0, Math.PI, 0); ctx.fill()
  // Brim
  ctx.fillStyle = '#886000'
  ctx.fillRect(x - 8, headCy - 3, 16, 1.5)
  ctx.fillStyle = '#a87600'
  ctx.fillRect(x - 8, headCy - 3, 16, 0.5)
}

// ─── Rolling tables ──────────────────────────────────────────────────────────
function drawTables(ctx: CanvasRenderingContext2D, s: GameState) {
  for (const t of s.tables) {
    drawTable(ctx, t)
  }
}

function drawTable(ctx: CanvasRenderingContext2D, t: RollingTable) {
  const x = t.x, y = t.y
  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.beginPath(); ctx.ellipse(x, y + TABLE_RADIUS + 3, TABLE_RADIUS + 2, 3, 0, 0, Math.PI * 2); ctx.fill()
  // Tablecloth edge
  ctx.fillStyle = '#C0B490'
  ctx.beginPath(); ctx.arc(x, y, TABLE_RADIUS + 1, 0, Math.PI * 2); ctx.fill()
  // Tablecloth base
  ctx.fillStyle = '#EEE4C8'
  ctx.beginPath(); ctx.arc(x, y, TABLE_RADIUS, 0, Math.PI * 2); ctx.fill()
  // Fold lines (rotating)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(t.rot)
  ctx.strokeStyle = 'rgba(165,148,115,0.5)'
  ctx.lineWidth = 0.8
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * TABLE_RADIUS, Math.sin(a) * TABLE_RADIUS)
    ctx.stroke()
  }
  ctx.restore()
  // Inner surface
  ctx.fillStyle = '#D8C8A4'
  ctx.beginPath(); ctx.arc(x, y, TABLE_RADIUS * 0.55, 0, Math.PI * 2); ctx.fill()
  // Gloss highlight
  ctx.fillStyle = 'rgba(255,250,235,0.55)'
  ctx.beginPath(); ctx.ellipse(x - 3, y - 3, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill()
  // Center hub
  ctx.fillStyle = '#9A8860'
  ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#fff8d0'
  ctx.beginPath(); ctx.arc(x - 0.5, y - 0.5, 0.6, 0, Math.PI * 2); ctx.fill()
}

// ─── Chair stack dollies ─────────────────────────────────────────────────────
function drawDollies(ctx: CanvasRenderingContext2D, s: GameState) {
  for (const d of s.dollies) {
    drawDolly(ctx, d)
  }
}

function drawDolly(ctx: CanvasRenderingContext2D, d: ChairDolly) {
  const x = d.x, y = d.y
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)'
  ctx.beginPath(); ctx.ellipse(x, y + 3, 12, 2.5, 0, 0, Math.PI * 2); ctx.fill()
  // Dolly base (cart)
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(x - 10, y - 4, 20, 5)
  ctx.fillStyle = '#5a5a5a'
  ctx.fillRect(x - 10, y - 4, 20, 1.5)
  // Wheels
  ctx.fillStyle = '#0a0a14'
  ctx.beginPath(); ctx.arc(x - 8, y + 1, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 8, y + 1, 2, 0, Math.PI * 2); ctx.fill()
  // Stack of chairs (folded)
  for (let i = 0; i < 4; i++) {
    const cy = y - 8 - i * 4
    // Chair shadow
    ctx.fillStyle = '#2a1a08'
    ctx.fillRect(x - 7, cy, 14, 3)
    // Chair body
    ctx.fillStyle = '#5a3a18'
    ctx.fillRect(x - 7, cy, 14, 2)
    // Highlight
    ctx.fillStyle = '#8a5a28'
    ctx.fillRect(x - 7, cy, 14, 0.5)
  }
  // Handle going to dolly's direction of travel
  const hx = d.vx >= 0 ? x - 10 : x + 10
  ctx.strokeStyle = '#3a3a3a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(hx, y - 4)
  ctx.lineTo(hx + (d.vx >= 0 ? -4 : 4), y - 12)
  ctx.stroke()
}

// ─── Popups ──────────────────────────────────────────────────────────────────
function drawPopups(ctx: CanvasRenderingContext2D, s: GameState, family: string) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const pp of s.popups) {
    const fade = 1 - pp.t / 50
    const dy = -pp.t * 0.7
    ctx.fillStyle = pp.color
      ? pp.color.replace(/[\d.]+\)$/, `${(0.95 * fade).toFixed(2)})`)
      : `rgba(255,184,0,${0.95 * fade})`
    ctx.font = `900 13px ${family}`
    ctx.fillText(pp.text, pp.x, pp.y + dy)
  }
}
