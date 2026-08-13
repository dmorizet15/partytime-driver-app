// Arcade sound engine — Web Audio, no files, no dependencies, offline-safe.
//
// Everything (Track A "Warehouse Floor" background music + all SFX) is
// synthesized live, so nothing to download and it works in a dead zone. One
// master mute preference is persisted per device under `ptd_arcade_muted` and
// shared across every arcade game (currently Load Out is the only consumer).
//
// Browsers block audio until a user gesture, so call `unlock()` from the first
// tap/keypress. `start()`/`stop()` manage the music loop; the sfx.* helpers are
// one-shots. All functions no-op safely on the server or before unlock.

const MUTE_KEY = 'ptd_arcade_muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let bus: GainNode | null = null
let noise: AudioBuffer | null = null
let musicTimer: ReturnType<typeof setInterval> | null = null
let muted = false
let prefLoaded = false

function browser(): boolean {
  return typeof window !== 'undefined'
}

export function loadMutePref(): boolean {
  if (!browser()) return false
  if (!prefLoaded) {
    try { muted = window.localStorage.getItem(MUTE_KEY) === '1' } catch { muted = false }
    prefLoaded = true
  }
  return muted
}

export function isMuted(): boolean {
  return loadMutePref()
}

export function setMuted(next: boolean): void {
  muted = next
  prefLoaded = true
  try { window.localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.85, ctx.currentTime, 0.02)
}

// Create/resume the AudioContext inside a user gesture. Returns true if ready.
export function unlock(): boolean {
  if (!browser()) return false
  loadMutePref()
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.85
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14; comp.knee.value = 24; comp.ratio.value = 6
    comp.attack.value = 0.003; comp.release.value = 0.2
    bus = ctx.createGain(); bus.gain.value = 0.9
    bus.connect(comp); comp.connect(master); master.connect(ctx.destination)
    const len = ctx.sampleRate * 2
    const b = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    noise = b
  }
  if (ctx.state === 'suspended') ctx.resume()
  return true
}

// ── instruments ──────────────────────────────────────────────────────────────
function kick(t: number, g = 1): void {
  if (!ctx || !bus) return
  const o = ctx.createOscillator(), ga = ctx.createGain()
  o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  ga.gain.setValueAtTime(g, t); ga.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  o.connect(ga).connect(bus); o.start(t); o.stop(t + 0.32)
}
function hat(t: number, g = 0.28, dur = 0.03): void {
  if (!ctx || !bus || !noise) return
  const s = ctx.createBufferSource(); s.buffer = noise
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500
  const ga = ctx.createGain(); ga.gain.setValueAtTime(g, t); ga.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(hp).connect(ga).connect(bus); s.start(t); s.stop(t + dur + 0.02)
}
function clank(t: number, g = 0.4, base = 320, dur = 0.17): void {
  if (!ctx || !bus) return
  const c = ctx.createOscillator(); c.type = 'square'
  const m = ctx.createOscillator(); m.type = 'square'
  const mg = ctx.createGain()
  c.frequency.value = base; m.frequency.value = base * 1.97; mg.gain.value = base * 2.4
  m.connect(mg).connect(c.frequency)
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base * 3.1; bp.Q.value = 3.5
  const ga = ctx.createGain(); ga.gain.setValueAtTime(g, t); ga.gain.exponentialRampToValueAtTime(0.001, t + dur)
  c.connect(bp).connect(ga).connect(bus); c.start(t); m.start(t); c.stop(t + dur); m.stop(t + dur)
}
function bass(t: number, freq: number, dur: number, g = 0.5, type: OscillatorType = 'sawtooth'): void {
  if (!ctx || !bus) return
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'
  lp.frequency.setValueAtTime(750, t); lp.frequency.exponentialRampToValueAtTime(200, t + dur)
  const ga = ctx.createGain()
  ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(g, t + 0.012)
  ga.gain.setValueAtTime(g, t + dur * 0.6); ga.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(lp).connect(ga).connect(bus); o.start(t); o.stop(t + dur + 0.02)
}
function pluck(t: number, freq: number, dur: number, g = 0.28): void {
  if (!ctx || !bus) return
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = freq * 1.005
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'
  lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + dur)
  const ga = ctx.createGain()
  ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(g, t + 0.006); ga.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(lp); o2.connect(lp); lp.connect(ga).connect(bus)
  o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02)
}
function hiss(t: number, dur = 0.25, g = 0.22, f = 3000): void {
  if (!ctx || !bus || !noise) return
  const s = ctx.createBufferSource(); s.buffer = noise
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.8
  const ga = ctx.createGain(); ga.gain.setValueAtTime(0.0001, t); ga.gain.exponentialRampToValueAtTime(g, t + 0.03); ga.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(bp).connect(ga).connect(bus); s.start(t); s.stop(t + dur + 0.02)
}

// ── Track A · Warehouse Floor (128 BPM) ──────────────────────────────────────
const BASS_PAT = [55, 0, 0, 55, 0, 0, 82, 0, 55, 0, 0, 73, 0, 0, 49, 0]
let step = 0, bar = 0, nextTime = 0

function schedule(): void {
  if (!ctx) return
  const stepDur = (60 / 128) / 4
  while (nextTime < ctx.currentTime + 0.13) {
    const s = step, t = nextTime
    if (s % 4 === 0) kick(t, 1.0)
    if (s % 2 === 0) hat(t, 0.18, 0.025)
    if (s === 6 || s === 14) clank(t, 0.32, 300, 0.14)
    if (s === 10) hat(t, 0.3, 0.05)
    if (BASS_PAT[s]) bass(t, BASS_PAT[s], 0.16, 0.5, 'sawtooth')
    if (bar % 2 === 1 && s === 8) clank(t, 0.28, 196, 0.3)
    step++
    if (step >= 16) { step = 0; bar = (bar + 1) % 4 }
    nextTime += stepDur
  }
}

export function startMusic(): void {
  if (!ctx || musicTimer || muted) return
  step = 0; bar = 0; nextTime = ctx.currentTime + 0.06
  musicTimer = setInterval(schedule, 25)
}
export function stopMusic(): void {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null }
}
export function musicRunning(): boolean {
  return musicTimer !== null
}

// ── SFX ──────────────────────────────────────────────────────────────────────
export const sfx = {
  swipe(): void {
    if (!ctx || !bus || !noise || muted) return
    const t = ctx.currentTime
    const s = ctx.createBufferSource(); s.buffer = noise
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'
    bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(380, t + 0.13); bp.Q.value = 1.1
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.24, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    s.connect(bp).connect(g).connect(bus); s.start(t); s.stop(t + 0.16)
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.1)
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.15, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    o.connect(g2).connect(bus); o.start(t); o.stop(t + 0.13)
  },
  // level = ladder tier index of the tile just made (0 = chair … 10 = big top)
  merge(level = 0): void {
    if (!ctx || !bus || !noise || muted) return
    const t = ctx.currentTime
    const base = 200 * Math.pow(1.09, level)
    clank(t, 0.4, base, 0.16)
    const s = ctx.createBufferSource(); s.buffer = noise
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2000
    const g = ctx.createGain(); g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    s.connect(hp).connect(g).connect(bus); s.start(t); s.stop(t + 0.07)
  },
  // special sound at every 3rd level-up
  milestone(): void {
    if (!ctx || !bus || muted) return
    const t = ctx.currentTime
    const root = 196
    const notes = [root, root * 1.5, root * 2]
    notes.forEach((f, i) => { const tt = t + i * 0.09; clank(tt, 0.4, f * 1.6, 0.2); pluck(tt, f, 0.28, 0.3) })
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.4)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    o.connect(g).connect(bus); o.start(t); o.stop(t + 0.47)
    hiss(t + 0.18, 0.5, 0.16, 5200)
  },
  // distinct, grander sound reserved for the FINAL level-up (top tile / win)
  finale(): void {
    if (!ctx || !bus || muted) return
    const t = ctx.currentTime
    const root = 262 // C4
    const run = [1, 1.25, 1.5, 2, 2.5, 3] // ascending run
    run.forEach((r, i) => {
      const tt = t + i * 0.085
      pluck(tt, root * r, 0.3, 0.32)
      clank(tt, 0.32, root * r * 1.5, 0.22)
    })
    // triumphant sustained chord at the top of the run
    const chordAt = t + run.length * 0.085
    ;[root * 2, root * 2.5, root * 3, root * 4].forEach((f) => bass(chordAt, f, 0.9, 0.16, 'sawtooth'))
    // sub boom
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(41, t + 0.9)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0)
    o.connect(g).connect(bus); o.start(t); o.stop(t + 1.02)
    // shimmering crash (long filtered noise)
    hiss(t, 1.2, 0.24, 6500)
    hiss(chordAt, 1.0, 0.18, 4000)
  },
}
