'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAppState } from '@/context/AppStateContext'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  cream: '#FFF9EE',
  ink:   '#0A0B14',
  gold:  '#FFB800',
} as const

const FONT_BODY = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Inline icons — outline style, stroke 2 ──────────────────────────────────
type IconProps = { size?: number; color?: string }
const STROKE = 2

function HomeIcon({ size = 22, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>
    </svg>
  )
}

function RoutesIcon({ size = 22, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="4" x2="6" y2="20"/>
      <circle cx="6"  cy="6"  r="2" fill={color}/>
      <circle cx="6"  cy="12" r="2" fill={color}/>
      <circle cx="6"  cy="18" r="2" fill={color}/>
      <line x1="11" y1="6"  x2="20" y2="6"/>
      <line x1="11" y1="12" x2="20" y2="12"/>
      <line x1="11" y1="18" x2="20" y2="18"/>
    </svg>
  )
}

function ToolsIcon({ size = 22, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a3.5 3.5 0 0 0 4.95 4.95l-9.55 9.55a2.5 2.5 0 1 1-3.54-3.54L13 13"/>
      <path d="M14.7 6.3L18 3"/>
    </svg>
  )
}

function TrainingIcon({ size = 22, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 10l10-5 10 5-10 5z"/>
      <path d="M6 12v5c0 1.5 3 2.5 6 2.5s6-1 6-2.5v-5"/>
      <line x1="22" y1="10" x2="22" y2="15"/>
    </svg>
  )
}

function ProfileIcon({ size = 22, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 22c0-4 4-7 8-7s8 3 8 7"/>
    </svg>
  )
}

// ─── Tab catalog ─────────────────────────────────────────────────────────────
type Tab = {
  id:           string
  label:        string
  href:         string
  isActive:     (pathname: string) => boolean
  Icon:         (props: IconProps) => JSX.Element
  rolesAllowed?: string[]
}

// Routes tab is special-cased: its href is computed at render time from
// AppStateContext. With an assigned route, it deep-links to /route/<route_id>
// (the stop-list execution view per the May 9 design lock). Without an
// assignment, it falls through to '/' so the driver sees the same no-assignment
// state Home shows. The placeholder href below is overridden in render.
// rolesAllowed: when present, the tab is visible only to users whose `roles`
// array overlaps the list. Home is visible to driver, super_admin, AND
// tools_only (tools_only sees a minimal Home variant as of 2026-05-11 —
// reversal of the May-10 redirect-to-/tools rule). Routes stays driver/
// super_admin only — tools_only has no route assignments. Tools / Training
// / Profile have no allow-list — every authenticated driver-app user can
// see them.
const TABS: Tab[] = [
  { id: 'home',     label: 'Home',     href: '/',         isActive: (p) => p === '/',                  Icon: HomeIcon, rolesAllowed: ['driver', 'super_admin', 'tools_only'] },
  { id: 'routes',   label: 'Routes',   href: '/',         isActive: (p) => p.startsWith('/route'),     Icon: RoutesIcon, rolesAllowed: ['driver', 'super_admin'] },
  { id: 'tools',    label: 'Tools',    href: '/tools',    isActive: (p) => p.startsWith('/tools'),     Icon: ToolsIcon },
  { id: 'training', label: 'Training', href: '/training', isActive: (p) => p.startsWith('/training'),  Icon: TrainingIcon },
  { id: 'profile',  label: 'Profile',  href: '/profile',  isActive: (p) => p.startsWith('/profile'),   Icon: ProfileIcon },
]

// ─── Component ───────────────────────────────────────────────────────────────
export default function BottomNav() {
  const router   = useRouter()
  const pathname = usePathname() ?? ''
  const { roles } = useAuth()
  const { getRoutesForDate } = useAppState()

  // Routes tab destination resolves at render time. Reads whatever AppState
  // currently has — Home triggers loadDay on mount, so by the time the driver
  // taps tabs the cache is populated. Deep-link entry (e.g. notification land
  // on /tools first) means routes is empty here and the tab falls back to /,
  // which is fine: driver lands on Home, sees the no-assignment state.
  const today = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const primaryRouteId = getRoutesForDate(today)[0]?.route_id
  const routesHref     = primaryRouteId ? `/route/${primaryRouteId}` : '/'

  const visibleTabs = TABS.filter((t) => {
    if (!t.rolesAllowed) return true
    return !!roles && roles.some((r) => t.rolesAllowed!.includes(r))
  })

  return (
    <nav
      aria-label="Primary"
      style={{
        flexShrink: 0,
        // Total height grows by the iOS safe-area inset; padding pushes the
        // 80px button row up clear of the home indicator. On non-iOS devices
        // env() resolves to 0 — total height stays 80.
        height: 'calc(80px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: C.cream,
        borderTop: '1px solid rgba(10,11,20,0.10)',
        display: 'flex',
        alignItems: 'stretch',
        fontFamily: FONT_BODY,
      }}
    >
      {visibleTabs.map((tab) => {
        const active = tab.isActive(pathname)
        const color  = active ? C.gold : 'rgba(10,11,20,0.40)'
        // Routes tab destination is dynamic; everything else uses its static href.
        const href   = tab.id === 'routes' ? routesHref : tab.href
        return (
          <button
            key={tab.id}
            onClick={() => router.push(href)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              background: 'transparent',
              border: 0, cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 6,
              color,
              fontFamily: 'inherit',
              padding: '0 4px',
            }}
          >
            <tab.Icon size={22} color={color}/>
            <span style={{
              fontSize: 11,
              fontWeight: active ? 800 : 600,
              letterSpacing: '-0.005em',
            }}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
