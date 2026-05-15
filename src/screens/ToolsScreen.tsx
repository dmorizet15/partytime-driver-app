'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

// ─── PTR design tokens — dark hub palette ───────────────────────────────────
const C = {
  bg:          '#0D0D0D',
  card:        '#1A1A1A',
  cardBorder:  'rgba(255,255,255,0.07)',
  blue:        '#0000FF',
  white:       '#fff',
  muted:       'rgba(255,255,255,0.4)',
  gold:        '#FFB800',
  paper:       '#FFFFFF',
  // badges
  liveBg:      'rgba(31,191,107,0.15)',
  liveText:    '#1FBF6B',
  liveBorder:  'rgba(31,191,107,0.3)',
  soonBg:      'rgba(255,255,255,0.07)',
  soonText:    'rgba(255,255,255,0.35)',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Tabler-style outline icons (24×24, stroke-width 2) ─────────────────────
type IconProps = { size?: number; color?: string }
const SW = 2
const IconSvg = (props: { children: React.ReactNode; size: number; color: string }) => (
  <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none"
       stroke={props.color} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    {props.children}
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

function FlameIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M12 12c2 -3 0 -7 -1 -8c0 3 -1.8 4.7 -3 6c-1.2 1.3 -2 3.2 -2 5a6 6 0 1 0 12 0c0 -1.5 -1 -3.9 -2 -5c-1.8 3 -2.8 3 -4 2z" />
    </IconSvg>
  )
}

function ShieldCheckIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M12 3l8 3v6c0 4.5 -3.4 8.5 -8 9c-4.6 -.5 -8 -4.5 -8 -9V6l8 -3z" />
      <path d="M9 12l2 2 4 -4" />
    </IconSvg>
  )
}

function LayoutGridIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <rect x="4"  y="4"  width="7" height="7" rx="1" />
      <rect x="13" y="4"  width="7" height="7" rx="1" />
      <rect x="4"  y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </IconSvg>
  )
}

function Layout2Icon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <rect x="4"  y="4"  width="7" height="16" rx="1" />
      <rect x="13" y="4"  width="7" height="7"  rx="1" />
      <rect x="13" y="13" width="7" height="7"  rx="1" />
    </IconSvg>
  )
}

// ─── Category catalog ───────────────────────────────────────────────────────
type Badge = { text: string; kind: 'live' | 'soon' }
type Category = {
  id: string
  name: string
  detail: string
  Icon: (p: IconProps) => JSX.Element
  iconBg: string
  iconColor: string
  badge: Badge
  href?: string
}

const GRID_CATEGORIES: Category[] = [
  {
    id: 'tenting',
    name: 'Tenting',
    detail: 'Calcs · Drawings · Certs',
    Icon: TentIcon,
    iconBg: 'rgba(0,0,255,0.18)',
    iconColor: '#6B8FFF',
    badge: { text: '3 live', kind: 'live' },
    href: '/tools/tent-squaring',
  },
  {
    id: 'hvac',
    name: 'HVAC',
    detail: 'Propane · BTU · Generator',
    Icon: FlameIcon,
    iconBg: 'rgba(255,184,0,0.15)',
    iconColor: C.gold,
    badge: { text: 'Coming soon', kind: 'soon' },
  },
  {
    id: 'safety',
    name: 'Safety & compliance',
    detail: 'Fire code · Compliance',
    Icon: ShieldCheckIcon,
    iconBg: 'rgba(220,50,50,0.15)',
    iconColor: '#E05555',
    badge: { text: 'Coming soon', kind: 'soon' },
  },
  {
    id: 'flooring',
    name: 'Flooring',
    detail: 'Piece calcs by type',
    Icon: LayoutGridIcon,
    iconBg: 'rgba(31,191,107,0.12)',
    iconColor: '#1FBF6B',
    badge: { text: 'Coming soon', kind: 'soon' },
  },
]

const PARTY_LAYOUTS: Category = {
  id: 'party-layouts',
  name: 'Party layouts',
  detail: 'Setup drawings · Send to customer',
  Icon: Layout2Icon,
  iconBg: 'rgba(150,100,255,0.15)',
  iconColor: '#A57FFF',
  badge: { text: 'Coming soon', kind: 'soon' },
}

// ─── Tiny presentational components ─────────────────────────────────────────
function BadgePill({ badge }: { badge: Badge }) {
  if (badge.kind === 'live') {
    return (
      <span style={{
        display: 'inline-block',
        background: C.liveBg, color: C.liveText,
        border: `0.5px solid ${C.liveBorder}`,
        padding: '3px 9px', borderRadius: 999,
        fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}>
        {badge.text}
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-block',
      background: C.soonBg, color: C.soonText,
      padding: '3px 9px', borderRadius: 999,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      lineHeight: 1.2,
    }}>
      {badge.text}
    </span>
  )
}

function IconWrap({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10,
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {children}
    </div>
  )
}

function CategoryCardGrid({ cat, onTap }: { cat: Category; onTap: (c: Category) => void }) {
  const { Icon } = cat
  return (
    <button
      onClick={() => onTap(cat)}
      aria-label={cat.name}
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
        <IconWrap bg={cat.iconBg}><Icon size={22} color={cat.iconColor} /></IconWrap>
        <BadgePill badge={cat.badge} />
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800,
          color: C.white, letterSpacing: '-0.01em', lineHeight: 1.2,
        }}>
          {cat.name}
        </div>
        <div style={{
          marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.4,
        }}>
          {cat.detail}
        </div>
      </div>
    </button>
  )
}

function CategoryCardWide({ cat, onTap }: { cat: Category; onTap: (c: Category) => void }) {
  const { Icon } = cat
  return (
    <button
      onClick={() => onTap(cat)}
      aria-label={cat.name}
      style={{
        background: C.card,
        border: `0.5px solid ${C.cardBorder}`,
        borderRadius: 14,
        padding: '16px 14px',
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 14,
        color: C.white,
        width: '100%',
      }}
    >
      <IconWrap bg={cat.iconBg}><Icon size={22} color={cat.iconColor} /></IconWrap>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800,
          color: C.white, letterSpacing: '-0.01em', lineHeight: 1.2,
        }}>
          {cat.name}
        </div>
        <div style={{
          marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.4,
        }}>
          {cat.detail}
        </div>
      </div>
      <BadgePill badge={cat.badge} />
    </button>
  )
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function ToolsScreen() {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function handleTap(cat: Category) {
    if (cat.href) router.push(cat.href)
    else setToast('Coming soon — this feature is in development.')
  }

  return (
    <div className="screen" style={{ background: C.bg, fontFamily: FONT_BODY, color: C.white }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
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

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: C.gold, textTransform: 'uppercase',
          }}>
            Driver tools
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: C.paper,
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
          color: C.white,
        }}>
          Tools hub
        </div>

        <div style={{
          marginTop: 10, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4,
          maxWidth: '36ch',
        }}>
          Calculators, references & compliance
        </div>
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ background: C.bg }}>
        {/* 2-col category grid */}
        <div style={{
          padding: '20px 18px 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}>
          {GRID_CATEGORIES.map((cat) => (
            <CategoryCardGrid key={cat.id} cat={cat} onTap={handleTap} />
          ))}
        </div>

        {/* Full-width: Party layouts */}
        <div style={{ padding: '12px 18px 0' }}>
          <CategoryCardWide cat={PARTY_LAYOUTS} onTap={handleTap} />
        </div>

        {/* Footer line */}
        <div style={{
          padding: '20px 18px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          color: C.muted, fontSize: 12,
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span>Weather · Reference library also in Tools</span>
        </div>
      </div>

      <BottomNav/>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(108px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            background: C.card, color: C.white,
            padding: '12px 18px', borderRadius: 999,
            fontSize: 13, fontWeight: 700,
            borderLeft: `4px solid ${C.gold}`,
            boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)',
            zIndex: 100,
            maxWidth: '80vw',
            fontFamily: 'inherit',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
