// AVA TTS — ElevenLabs primary, Web Speech fallback.
//
// Phase 1 driver app: API key is exposed via NEXT_PUBLIC_ so it ships to the
// browser. Acceptable here because the driver app is gated to authenticated
// PTR employees, not the public — see Session 5 brief. If a wider audience
// ever ships, move this through a server proxy.
//
// Single call site is speak(text). Failures fall through silently to the
// Web Speech API; if that's also unavailable, the call resolves with no
// audio and no error toast — message stays visible as text.
//
// iOS Safari autoplay: AudioContext starts in 'suspended' state until a user
// gesture in the same task. Auto-speak on mount may be blocked on first load;
// the toggle press is itself a gesture so subsequent voice playback works.

const ELEVENLABS_VOICE_ID = 'uYXf8XasLslADfZ2MB4u'
const ELEVENLABS_API_URL  = 'https://api.elevenlabs.io/v1/text-to-speech'

let currentAudioCtx: AudioContext | null = null
let currentSource:   AudioBufferSourceNode | null = null

type AudioContextCtor = typeof AudioContext
type WindowWithAudio  = Window & {
  AudioContext?:        AudioContextCtor
  webkitAudioContext?:  AudioContextCtor
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as WindowWithAudio
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export async function speakWithElevenLabs(text: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ElevenLabs API key not configured')

  const Ctor = getAudioContextCtor()
  if (!Ctor) throw new Error('Web Audio API not available')

  const resp = await fetch(`${ELEVENLABS_API_URL}/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key':  apiKey,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })
  if (!resp.ok) throw new Error(`ElevenLabs HTTP ${resp.status}`)

  const audioBytes = await resp.arrayBuffer()
  const ctx        = new Ctor()
  currentAudioCtx  = ctx

  if (ctx.state === 'suspended') {
    try { await ctx.resume() } catch { /* gesture not present; play call may still fire */ }
  }

  const buffer = await ctx.decodeAudioData(audioBytes)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  currentSource = source

  await new Promise<void>((resolve) => {
    source.onended = () => resolve()
    try {
      source.start(0)
    } catch {
      resolve()
    }
  })

  if (currentSource === source) currentSource = null
  if (currentAudioCtx === ctx) {
    try { await ctx.close() } catch { /* already closed */ }
    currentAudioCtx = null
  }
}

export async function speakWithWebSpeech(text: string): Promise<void> {
  if (typeof window === 'undefined') return
  if (!('speechSynthesis' in window)) return

  return new Promise<void>((resolve) => {
    const synth     = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    const voices    = synth.getVoices()
    const englishVoice = voices.find((v) => v.lang.toLowerCase().startsWith('en'))
    if (englishVoice) utterance.voice = englishVoice
    utterance.rate   = 1.0
    utterance.pitch  = 1.0
    utterance.volume = 1.0
    utterance.onend   = () => resolve()
    utterance.onerror = () => resolve()
    try {
      synth.speak(utterance)
    } catch {
      resolve()
    }
  })
}

export async function speak(text: string): Promise<void> {
  if (!text) return
  if (typeof window === 'undefined') return
  try {
    await speakWithElevenLabs(text)
  } catch {
    await speakWithWebSpeech(text)
  }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  if (currentSource) {
    try { currentSource.stop() } catch { /* already stopped */ }
    currentSource = null
  }
  if (currentAudioCtx) {
    try { currentAudioCtx.close() } catch { /* already closed */ }
    currentAudioCtx = null
  }
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel() } catch { /* noop */ }
  }
}
