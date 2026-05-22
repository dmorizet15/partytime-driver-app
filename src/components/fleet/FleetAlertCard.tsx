'use client'

import { useRouter } from 'next/navigation'
import { useOpenWorkOrders } from '@/hooks/fleet/useOpenWorkOrders'
import { AlertTriangleIcon } from './fleetIcons'

// Home screen is the light editorial theme — this card is styled for it
// (white surface, red border), independent of the dark Tools-hub palette.
const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const RED      = '#E5484D'
const RED_DEEP = '#B11B20'
const RED_SOFT = '#FFF1F1'
const INK      = '#0A0B14'

/**
 * Home-screen fleet alert card. Renders between the COD card and the day list,
 * only for fleet-access users with ≥1 open work order. Self-fetches via
 * useOpenWorkOrders — no spinner, simply absent until data resolves.
 */
export default function FleetAlertCard() {
  const router = useRouter()
  const { count, assets, hasAccess, loading } = useOpenWorkOrders()

  if (loading || !hasAccess || count === 0) return null

  const names = assets.map((a) => a.name)
  const shown = names.slice(0, 2)
  const extra = names.length - shown.length
  const subtitle = extra > 0 ? `${shown.join(', ')} + ${extra} more` : shown.join(', ')

  return (
    <div style={{ padding: '12px 18px 0' }}>
      <button
        onClick={() => router.push('/tools/fleet')}
        aria-label={`${count} open work orders — open Fleet Maintenance`}
        style={{
          width: '100%',
          background: RED_SOFT,
          border: `1.5px solid ${RED}`,
          borderRadius: 18,
          padding: '14px 16px',
          display: 'flex', alignItems: 'flex-start', gap: 14,
          boxShadow: '0 14px 28px -16px rgba(229,72,77,0.45)',
          cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: RED, border: `2px solid ${INK}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
          }}
        >
          <AlertTriangleIcon size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              color: RED_DEEP, textTransform: 'uppercase',
            }}
          >
            Fleet Alert
          </div>
          <div
            style={{
              marginTop: 2, fontSize: 15, fontWeight: 800, color: INK,
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em', lineHeight: 1.25,
            }}
          >
            {count} open work order{count === 1 ? '' : 's'}
          </div>
          {subtitle && (
            <div style={{ marginTop: 4, fontSize: 12.5, color: RED_DEEP, lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>
      </button>
    </div>
  )
}
