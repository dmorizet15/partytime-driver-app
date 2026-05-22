'use client'

import { FC, FONT_BODY, FONT_DISPLAY } from '@/lib/fleet/theme'

/**
 * Dark-themed bottom sheet for fleet action flows (resolve / assign / upload).
 * Tap-scrim to dismiss; panel click is swallowed.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.62)',
        display: 'flex', alignItems: 'flex-end',
        fontFamily: FONT_BODY,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: FC.card,
          borderRadius: '20px 20px 0 0',
          borderTop: `0.5px solid ${FC.cardBorder}`,
          padding: '12px 18px calc(22px + env(safe-area-inset-bottom))',
          maxHeight: '82vh', overflowY: 'auto',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 38, height: 4, borderRadius: 999,
            background: 'rgba(255,255,255,0.18)',
            margin: '0 auto 14px',
          }}
        />
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 800,
          color: FC.white, letterSpacing: '-0.01em', marginBottom: 14,
        }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}
