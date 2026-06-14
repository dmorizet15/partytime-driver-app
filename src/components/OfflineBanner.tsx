'use client'

import { useAppState } from '@/context/AppStateContext'

// ─── Offline banner (PWA Session B, Step 4) ─────────────────────────────────
// Sticky amber bar shown ONLY while AppStateContext.isOfflineMode is true —
// i.e. the day view is being served from the last-saved route cache. Renders
// nothing when online. Mounted only on route/stop surfaces (Home day view,
// Route list, Stop detail); intentionally absent from Tools, Will Call, and
// Profile, which don't depend on the cached route payload.
export function OfflineBanner() {
  const { isOfflineMode } = useAppState()
  if (!isOfflineMode) return null

  return (
    <div
      role="status"
      style={{
        position:      'sticky',
        top:           0,
        zIndex:        50,
        width:         '100%',
        background:    '#FFB800',
        color:         '#1a1a1a',
        fontSize:      13,
        fontWeight:    700,
        textAlign:     'center',
        padding:       '8px 12px',
        letterSpacing: 0.2,
      }}
    >
      Offline — showing last saved route
    </div>
  )
}
