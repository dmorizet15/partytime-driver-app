'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { useOpenWorkOrders } from '@/hooks/fleet/useOpenWorkOrders'
import { useOpenWorkOrdersCount } from '@/hooks/workOrders/useOpenWorkOrdersCount'
import { WrenchIcon } from '@/components/fleet/fleetIcons'

// ─── PTR design tokens — dark hub palette ───────────────────────────────────
const C = {
  bg:          '#0D0D0D',
  card:        '#1A1A1A',
  cardBorder:  'rgba(255,255,255,0.07)',
  divider:     'rgba(255,255,255,0.07)',
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
  soonBorder:  'rgba(255,255,255,0.1)',
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

function CloudStormIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M7 17a4 4 0 0 1 0 -8a5 4.5 0 0 1 10 1.5h1a3 3 0 0 1 1 5.8" />
      <path d="M11 13l-2 4h3l-2 4" />
    </IconSvg>
  )
}

function BooksIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <rect x="4" y="4" width="4" height="16" rx="1" />
      <rect x="9" y="4" width="4" height="16" rx="1" />
      <path d="M15 6l3.5 -1l3.4 14.5l-3.5 1z" />
    </IconSvg>
  )
}

function EngineIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M9 4h6" />
      <path d="M12 4v3" />
      <rect x="5" y="7" width="14" height="12" rx="2" />
      <path d="M3 12h2" />
      <path d="M19 12h2" />
      <path d="M9 11v4" />
      <path d="M15 11v4" />
    </IconSvg>
  )
}

function AlertIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86l-8.18 14.18a2 2 0 0 0 1.71 3h16.36a2 2 0 0 0 1.71 -3l-8.18 -14.18a2 2 0 0 0 -3.42 0z" />
    </IconSvg>
  )
}

function ClipboardListIcon({ size = 22, color = C.white }: IconProps) {
  return (
    <IconSvg size={size} color={color}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 4H6a2 2 0 0 0 -2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2V6a2 2 0 0 0 -2 -2h-3" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
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
    href: '/tools/tenting',
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
  {
    id: 'weather',
    name: 'Weather',
    detail: 'Live forecast by job site',
    Icon: CloudStormIcon,
    iconBg: 'rgba(100,180,255,0.15)',
    iconColor: '#64B4FF',
    badge: { text: 'Live', kind: 'live' },
    href: '/tools/weather',
  },
  {
    id: 'equipment-guides',
    name: 'Equipment guides',
    detail: 'Heater, generator & equipment docs',
    Icon: BooksIcon,
    iconBg: 'rgba(150,100,255,0.15)',
    iconColor: '#A57FFF',
    badge: { text: 'Live', kind: 'live' },
    href: '/reference/library',
  },
]

const GENERATORS: Category = {
  id: 'generators',
  name: 'Generators',
  detail: 'Manuals · Sizing charts · Placement',
  Icon: EngineIcon,
  iconBg: 'rgba(255,140,0,0.15)',
  iconColor: '#FF8C00',
  badge: { text: 'Coming soon', kind: 'soon' },
}

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
      border: `0.5px solid ${C.soonBorder}`,
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

// ─── Fleet Maintenance card — role-gated ────────────────────────────────────
// Renders null entirely for users without fleet_maintenance_access, so a
// standard driver sees the Tools Hub with no trace of the module. The red pill
// surfaces the open work-order count (hidden at zero — nothing to flag).
function FleetMaintenanceCard({ onTap }: { onTap: () => void }) {
  const { count, hasAccess, loading } = useOpenWorkOrders()
  if (loading || !hasAccess) return null

  return (
    <div style={{ padding: '12px 18px 0' }}>
      <button
        onClick={onTap}
        aria-label="Fleet Maintenance"
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
        <IconWrap bg="rgba(150,160,180,0.16)">
          <WrenchIcon size={22} color="#AEB6C6" />
        </IconWrap>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800,
            color: C.white, letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>
            Fleet Maintenance
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            Work orders · PM · service log
          </div>
        </div>
        {count > 0 && (
          <span style={{
            display: 'inline-block',
            background: 'rgba(229,72,77,0.15)', color: '#E5484D',
            border: '0.5px solid rgba(229,72,77,0.35)',
            padding: '3px 9px', borderRadius: 999,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.2,
          }}>
            {count} open
          </span>
        )}
      </button>
    </div>
  )
}

// ─── Report an Issue card — ungated (any authed user can file) ──────────────
// Sits below the role-gated Fleet card so the action lives in the same band
// for drivers who don't have fleet/technician permissions but still need to
// flag a field problem.
function ReportIssueCard({ onTap }: { onTap: () => void }) {
  return (
    <div style={{ padding: '12px 18px 0' }}>
      <button
        onClick={onTap}
        aria-label="Report an issue"
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
        <IconWrap bg="rgba(255,90,60,0.16)">
          <AlertIcon size={22} color="#FF7A5A" />
        </IconWrap>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800,
            color: C.white, letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>
            Report an Issue
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            Truck, equipment, or field item
          </div>
        </div>
      </button>
    </div>
  )
}

// ─── Work Orders card — technician-only ─────────────────────────────────────
// Mirrors FleetMaintenanceCard. Renders null without work_order_technician;
// red pill surfaces the open + in_progress count (hidden at zero).
function WorkOrdersCard({ onTap }: { onTap: () => void }) {
  const { count, hasAccess, loading } = useOpenWorkOrdersCount()
  if (loading || !hasAccess) return null

  return (
    <div style={{ padding: '12px 18px 0' }}>
      <button
        onClick={onTap}
        aria-label="Work Orders"
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
        <IconWrap bg="rgba(255,184,0,0.16)">
          <ClipboardListIcon size={22} color={C.gold} />
        </IconWrap>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 800,
            color: C.white, letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>
            Work Orders
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.muted, lineHeight: 1.4 }}>
            Field issues filed by drivers
          </div>
        </div>
        {count > 0 && (
          <span style={{
            display: 'inline-block',
            background: 'rgba(229,72,77,0.15)', color: '#E5484D',
            border: '0.5px solid rgba(229,72,77,0.35)',
            padding: '3px 9px', borderRadius: 999,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
            textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.2,
          }}>
            {count} open
          </span>
        )}
      </button>
    </div>
  )
}

// ─── Screen ─────────────────────────────────────────────────────────────────
export default function ToolsScreen() {
  const router = useRouter()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  function handleTap(cat: Category) {
    if (cat.href) router.push(cat.href)
    else setToast('Coming soon')
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
          textTransform: 'uppercase',
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
        {/* 2-col category grid (6 tiles) */}
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

        {/* Fleet Maintenance — role-gated; renders null without access */}
        <FleetMaintenanceCard onTap={() => router.push('/tools/fleet')} />

        {/* Report an Issue — ungated; any signed-in user can file */}
        <ReportIssueCard onTap={() => router.push('/tools/report-issue')} />

        {/* Work Orders — technician-only; renders null without access */}
        <WorkOrdersCard onTap={() => router.push('/tools/work-orders')} />

        {/* Full-width: Generators (above divider) */}
        <div style={{ padding: '12px 18px 0' }}>
          <CategoryCardWide cat={GENERATORS} onTap={handleTap} />
        </div>

        {/* Thin divider */}
        <div style={{ padding: '16px 18px 0' }}>
          <div style={{ height: 1, background: C.divider, width: '100%' }} />
        </div>

        {/* Full-width: Party layouts (below divider, anchors bottom) */}
        <div style={{ padding: '16px 18px 28px' }}>
          <CategoryCardWide cat={PARTY_LAYOUTS} onTap={handleTap} />
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
            padding: '10px 18px', borderRadius: 999,
            fontSize: 13, fontWeight: 600,
            border: `0.5px solid ${C.cardBorder}`,
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
