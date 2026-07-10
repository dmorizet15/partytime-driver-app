'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useAppState } from '@/context/AppStateContext'
import AvaConversationSheet from '@/components/ava/AvaConversationSheet'

// AVA Tier 1 presence chip — animated waveform in a blue circle, top-right of
// every screen's header. Single tap opens the shared Haiku-backed
// AvaConversationSheet (the same sheet behind the Home "Ask Ava about today"
// button and the Training Hub SOP search). Because the chip renders on every
// screen, the sheet opens from anywhere in the app.
//
// Route context is passed only when the day has a single, unambiguous route
// loaded in AppStateContext — there is no "current route/stop" at the chip's
// render level without prop drilling, so any other case opens the sheet
// context-free (graceful degradation; AVA still answers general/terminology/
// SOP questions). Empty seedContext is fully supported by the sheet.

const BLUE = '#0000FF'

interface AvaChipProps {
  ariaLabel?: string
}

export default function AvaChip({ ariaLabel = 'Open AVA' }: AvaChipProps) {
  const [open, setOpen] = useState(false)
  const { routes } = useAppState()
  const params = useParams<{ routeId?: string }>()

  // The route the driver is asking about, when it's genuinely unambiguous:
  // the URL segment on /route/[routeId] and /route/[routeId]/stop/[stopId],
  // else a single-route day. On a multi-route day from a non-route screen we
  // send null and the server lists every route, each numbered from 1 — better
  // than silently picking one and answering ordinals against the wrong route.
  const urlRouteId = typeof params?.routeId === 'string' ? params.routeId : null
  const routeId = urlRouteId ?? (routes.length === 1 ? routes[0].route_id : null)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: BLUE, border: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 2, padding: 0, flexShrink: 0,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="ava-wave-bar"
            style={{
              width: 2, height: 12,
              background: '#fff', borderRadius: 1,
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </button>

      <AvaConversationSheet
        open={open}
        onClose={() => setOpen(false)}
        seedContext={{}}
        routeId={routeId}
      />
    </>
  )
}
