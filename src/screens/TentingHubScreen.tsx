'use client'

import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

const C = {
  bg:         '#0D0D0D',
  card:       '#1A1A1A',
  cardBorder: 'rgba(255,255,255,0.07)',
  blue:       '#0000FF',
  white:      '#fff',
  muted:      'rgba(255,255,255,0.4)',
  gold:       '#FFB800',
  liveBg:     'rgba(31,191,107,0.15)',
  liveText:   '#1FBF6B',
  liveBorder: 'rgba(31,191,107,0.3)',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

type IconProps = { size?: number; color?: string }
const SW = 2
const IconSvg = (p: { children: React.ReactNode; size: number; color: string }) => (
  <svg width={p.size} height={p.size} viewBox="0 0 24 24" fill="none"
       stroke={p.color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    {p.children}
  </svg>
)

function TentIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M3 20 L12 4 L21 20" />
      <path d="M12 4 L12 20" />
      <path d="M3 20 L21 20" />
    </IconSvg>
  )
}

function RulerIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M3 3l18 18" />
      <path d="M3 9l6-6" />
      <path d="M7.5 13.5l3-3" />
      <path d="M12 18l6-6" />
      <path d="M15 21l6-6" />
    </IconSvg>
  )
}

function FileIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </IconSvg>
  )
}

interface Tile {
  id:        string
  name:      string
  detail:    string
  Icon:      (p: IconProps) => JSX.Element
  iconBg:    string
  iconColor: string
  href:      string
}

const TILES: Tile[] = [
  {
    id:        'calculator',
    name:      'Tent calculator',
    detail:    'Squaring · diagonal from size',
    Icon:      RulerIcon,
    iconBg:    'rgba(0,0,255,0.18)',
    iconColor: '#6B8FFF',
    href:      '/tools/tent-squaring',
  },
  {
    id:        'drawings',
    name:      'Drawings & certs',
    detail:    'Manufacturer drawings · flame certs',
    Icon:      FileIcon,
    iconBg:    'rgba(31,191,107,0.12)',
    iconColor: '#1FBF6B',
    href:      '/reference/tents',
  },
]

export default function TentingHubScreen() {
  const router = useRouter()

  return (
    <div className="screen" style={{ background: C.bg, fontFamily: FONT_BODY, color: C.white }}>
      {/* Hero */}
      <div style={{
        background: C.blue, color: C.white,
        padding: '32px 22px 28px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <svg
          aria-hidden="true"
          width={200} height={200} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -28, top: -16,
            opacity: 0.22,
            transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <button
            onClick={() => router.push('/tools')}
            aria-label="Back to tools"
            style={{
              background: 'transparent', border: 0, color: C.gold,
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              cursor: 'pointer', fontFamily: 'inherit', padding: 0,
              textTransform: 'uppercase',
            }}
          >
            ← Tools
          </button>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: C.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ptr-mark.png"
              alt="PartyTime Rentals"
              style={{ width: '74%', height: '74%', objectFit: 'contain' }}
            />
          </div>
        </div>

        <div style={{
          marginTop: 18, position: 'relative',
          fontFamily: FONT_DISPLAY,
          fontSize: 38, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: C.white, textTransform: 'uppercase',
        }}>
          Tenting
        </div>

        <div style={{
          marginTop: 10, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4,
          maxWidth: '36ch',
        }}>
          Calculator · drawings · flame certs
        </div>
      </div>

      {/* Tile grid */}
      <div className="flex-1 overflow-y-auto" style={{ background: C.bg }}>
        <div style={{
          padding: '20px 18px 28px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}>
          {TILES.map((tile) => (
            <TileCard key={tile.id} tile={tile} onTap={() => router.push(tile.href)} />
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}

function TileCard({ tile, onTap }: { tile: Tile; onTap: () => void }) {
  const { Icon } = tile
  return (
    <button
      onClick={onTap}
      aria-label={tile.name}
      style={{
        background: C.card,
        border: `0.5px solid ${C.cardBorder}`,
        borderRadius: 14,
        padding: '16px 14px',
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left',
        minHeight: 132,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        color: C.white,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: tile.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={22} color={tile.iconColor} />
        </div>
        <span style={{
          display: 'inline-block',
          background: C.liveBg, color: C.liveText,
          border: `0.5px solid ${C.liveBorder}`,
          padding: '3px 9px', borderRadius: 999,
          fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}>
          Live
        </span>
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800,
          color: C.white, letterSpacing: '-0.01em', lineHeight: 1.2,
        }}>
          {tile.name}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
          {tile.detail}
        </div>
      </div>
    </button>
  )
}
