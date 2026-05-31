'use client'

// ─── AvaConversationSheet ────────────────────────────────────────────────────
// AVA Phase 2 — Session 2. Real Haiku-backed conversation behind the home
// "Ask Ava about today" button. Shared dark bottom-sheet (same shell pattern as
// AvaDispatchNotesSheet) so the AvaChip drawer can reuse it in a later session.
//
// - Session-local message list (not persisted; the server keeps the audit trail).
// - Text input only — voice input is future scope.
// - AVA replies are spoken via speak() (ElevenLabs → WebSpeech fallback) when the
//   VOICE toggle is on; TEXT mode shows the reply silently.
// - Loading shows the AVA waveform (reuses the .ava-wave-bar keyframes).

import { useEffect, useRef, useState } from 'react'
import { speak, stopSpeaking } from '@/lib/ava/elevenLabs'

const BLUE = '#0000FF'
const GOLD = '#FFB800'
const INK  = '#0A0B14'

export interface AvaSeedContext {
  driverName?:      string | null
  stopCount?:       number | null
  codCount?:        number | null
  hasWeatherFlag?:  boolean | null
  weatherStops?:    string[]
  dispatcherNotes?: string[]
  manifestSummary?: string | null
}

interface Message { role: 'user' | 'ava'; text: string }

interface AvaConversationSheetProps {
  open:         boolean
  onClose:      () => void
  seedContext:  AvaSeedContext
  routeId?:     string | null
  /** Optional first question to pre-fill (e.g. from a failed SOP search). */
  initialQuestion?: string
}

function Waveform({ small }: { small?: boolean }) {
  const h = small ? 12 : 14
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} aria-hidden="true" className="ava-wave-bar"
          style={{ width: 2, height: h, background: small ? '#fff' : BLUE, borderRadius: 1, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  )
}

export default function AvaConversationSheet({
  open, onClose, seedContext, routeId = null, initialQuestion,
}: AvaConversationSheetProps) {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [voiceMode, setVoiceMode] = useState(true)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Pre-fill once when opened with a seeded question (SOP "Ask Ava instead").
  useEffect(() => {
    if (open && initialQuestion) setInput(initialQuestion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Stop any in-flight audio when the sheet closes/unmounts.
  useEffect(() => {
    if (!open) stopSpeaking()
    return () => stopSpeaking()
  }, [open])

  // Keep the latest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  if (!open) return null

  function handleClose() {
    stopSpeaking()
    onClose()
  }

  function handleVoiceToggle(next: boolean) {
    if (next === voiceMode) return
    if (voiceMode && !next) stopSpeaking() // switching to TEXT cuts current playback
    setVoiceMode(next)
  }

  async function handleSend() {
    const question = input.trim()
    if (!question || sending) return

    const history = messages.slice()       // turns before this question
    const next: Message[] = [...history, { role: 'user', text: question }]
    setMessages(next)
    setInput('')
    setError(null)
    setSending(true)
    stopSpeaking()

    try {
      const res = await fetch('/api/ava/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history, context: seedContext, routeId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { answer?: string }
      const answer = (data.answer ?? '').trim()
      if (!answer) throw new Error('empty answer')

      setMessages((m) => [...m, { role: 'ava', text: answer }])
      if (voiceMode) speak(answer)
    } catch {
      setError("AVA is unavailable right now. Try again in a moment.")
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); handleSend() }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ask AVA about today"
      onClick={handleClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 448,
          background: '#0F172A', color: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '16px 22px calc(20px + env(safe-area-inset-bottom))',
          height: '82vh', maxHeight: 680,
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2,
          margin: '0 auto 14px', flexShrink: 0,
        }}/>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Waveform small />
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Ask AVA about today
          </div>

          {/* VOICE / TEXT toggle */}
          <div style={{
            marginLeft: 'auto', display: 'inline-flex',
            background: '#1E293B', borderRadius: 999, padding: 2,
          }}>
            <button
              type="button" onClick={() => handleVoiceToggle(true)} aria-pressed={voiceMode}
              style={{
                border: 0, borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em',
                background: voiceMode ? GOLD : 'transparent',
                color: voiceMode ? INK : '#94A3B8',
              }}
            >VOICE</button>
            <button
              type="button" onClick={() => handleVoiceToggle(false)} aria-pressed={!voiceMode}
              style={{
                border: 0, borderRadius: 999, padding: '4px 10px', cursor: 'pointer',
                fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em',
                background: !voiceMode ? GOLD : 'transparent',
                color: !voiceMode ? INK : '#94A3B8',
              }}
            >TEXT</button>
          </div>

          <button
            type="button" onClick={handleClose} aria-label="Close"
            style={{
              background: 'transparent', border: 0,
              color: '#94A3B8', fontSize: 26, lineHeight: 1, cursor: 'pointer',
              padding: 4, marginLeft: 4,
            }}
          >×</button>
        </div>

        {/* Message list */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
          {messages.length === 0 && !sending && (
            <div style={{
              color: '#94A3B8', fontSize: 14, lineHeight: 1.5,
              padding: '8px 2px 0',
            }}>
              Ask me anything about today&apos;s route — your stops, what&apos;s loaded,
              cash collection, dispatch notes, or wind on your tents.
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginTop: 12,
            }}>
              <div style={{
                maxWidth: '82%',
                background: m.role === 'user' ? GOLD : '#1E293B',
                color: m.role === 'user' ? INK : '#E2E8F0',
                borderRadius: 14,
                borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                borderBottomLeftRadius:  m.role === 'ava'  ? 4 : 14,
                padding: '9px 13px', fontSize: 14.5, lineHeight: 1.45,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontWeight: m.role === 'user' ? 700 : 500,
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, color: '#94A3B8' }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: BLUE,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Waveform small />
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>AVA is thinking…</span>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 14, padding: '10px 13px',
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, color: '#FCA5A5', fontSize: 13.5, lineHeight: 1.45,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          marginTop: 12, flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about today…"
            aria-label="Your question for AVA"
            enterKeyHint="send"
            style={{
              flex: 1, minWidth: 0,
              background: '#1E293B', color: '#fff',
              border: '1px solid #334155', borderRadius: 999,
              padding: '11px 16px', fontSize: 15, outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button" onClick={handleSend}
            disabled={!input.trim() || sending}
            aria-label="Send"
            style={{
              flexShrink: 0,
              background: (!input.trim() || sending) ? '#334155' : GOLD,
              color: (!input.trim() || sending) ? '#64748B' : INK,
              border: 0, borderRadius: 999, padding: '11px 18px',
              cursor: (!input.trim() || sending) ? 'default' : 'pointer',
              fontSize: 14, fontWeight: 800, letterSpacing: '0.02em',
            }}
          >Send</button>
        </div>
      </div>
    </div>
  )
}
