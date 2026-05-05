'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

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

// NOTE on the Routes tab destination:
// There's no top-level routes-list page in the app today — only
// `/route/[routeId]` (RouteListScreen). Until a real routes-hub exists, the
// Routes tab points to `/` (the day route picker), with active-state matching
// `pathname.startsWith('/route')` so the tab still highlights when the user
// drills into a specific route. Side effect: tapping Routes from a non-route
// screen lands at `/` and lights the **Home** tab (because `pathname === '/'`
// after navigation). Confusing — fix when a `/route` hub ships.
const TABS: Tab[] = [
  { id: 'home',     label: 'Home',     href: '/',         isActive: (p) => p === '/',                  Icon: HomeIcon },
  { id: 'routes',   label: 'Routes',   href: '/',         isActive: (p) => p.startsWith('/route'),     Icon: RoutesIcon, rolesAllowed: ['driver', 'super_admin'] },
  { id: 'tools',    label: 'Tools',    href: '/tools',    isActive: (p) => p.startsWith('/tools'),     Icon: ToolsIcon },
  { id: 'training', label: 'Training', href: '/training', isActive: (p) => p.startsWith('/training'),  Icon: TrainingIcon },
  { id: 'profile',  label: 'Profile',  href: '/profile',  isActive: (p) => p.startsWith('/profile'),   Icon: ProfileIcon },
]

// ─── Component ───────────────────────────────────────────────────────────────
export default function BottomNav() {
  const router   = useRouter()
  const pathname = usePathname() ?? ''
  const { role } = useAuth()

  const visibleTabs = TABS.filter((t) => {
    if (!t.rolesAllowed) return true
    return !!role && t.rolesAllowed.includes(role)
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
        return (
          <button
            key={tab.id}
            onClick={() => router.push(tab.href)}
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
