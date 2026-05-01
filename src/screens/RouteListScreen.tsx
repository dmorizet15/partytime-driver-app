'use client'

import { useRouter } from 'next/navigation'
import { useAppState } from '@/context/AppStateContext'
import AppHeader from '@/components/AppHeader'
import ProgressBar from '@/components/ProgressBar'
import StopStatusBadge from '@/components/StopStatusBadge'
import { Stop } from '@/types'

interface RouteListScreenProps {
  routeId: string
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function RouteListScreen({ routeId }: RouteListScreenProps) {
  const router = useRouter()
  const { getRoute, getStopsForRoute } = useAppState()

  const route = getRoute(routeId)
  const stops = getStopsForRoute(routeId)
  const completedCount = stops.filter((s) => s.current_status === 'completed').length

  if (!route) {
    return (
      <div className="screen">
        <AppHeader
          title="Route not found"
          onBack={() => router.push('/')}
        />
        <div className="flex-1 flex items-center justify-center
                        text-gray-400 text-sm p-8 text-center">
          This route could not be found. Please go back and select a valid route.
        </div>
      </div>
    )
  }

  function handleStopTap(stop: Stop) {
    router.push(`/route/${routeId}/stop/${stop.stop_id}`)
  }

  const trucksLabel = [route.truck_name, route.truck_2_name].filter(Boolean).join(' · ')
  const subtitleParts = [
    formatDate(route.operating_date),
    `${stops.length} stops`,
    ...(trucksLabel ? [trucksLabel] : []),
  ]

  return (
    <div className="screen">
      <AppHeader
        title={route.route_name}
        subtitle={subtitleParts.join(' · ')}
        onBack={() => router.push('/')}
      />

      <ProgressBar total={stops.length} completed={completedCount} />

      {/* ── Stop list ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {stops.map((stop) => {
          const isCompleted = stop.current_status === 'completed'

          return (
            <button
              key={stop.stop_id}
              onClick={() => handleStopTap(stop)}
              className="w-full flex items-center gap-3
                         px-4 py-3.5 border-b border-gray-100
                         active:bg-gray-50 text-left min-h-[72px]
                         transition-colors"
            >
              {/* Stop number / check circle */}
              <div
                className={`
                  w-9 h-9 rounded-full border-2 flex-shrink-0
                  flex items-center justify-center text-sm font-bold
                  ${isCompleted
                    ? 'bg-gray-900 border-gray-900 text-white'
                    : 'bg-white border-gray-800 text-gray-900'}
                `}
                aria-hidden="true"
              >
                {isCompleted ? '✓' : stop.stop_sequence}
              </div>

              {/* Stop info */}
              <div className="flex-1 min-w-0">
                {stop.company_name && (
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 truncate">
                    {stop.company_name}
                  </div>
                )}
                <div
                  className={`text-[14px] font-bold truncate ${
                    isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
                  }`}
                >
                  {stop.customer_name}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                  {[stop.address_line_1, stop.city].filter(Boolean).join(', ')}
                </div>
                {stop.items_text && (
                  <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                    {stop.items_text}
                  </div>
                )}
              </div>

              {/* Status badge + chevron */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <StopStatusBadge status={stop.current_status} />
                <span className="text-gray-300 text-lg" aria-hidden="true">›</span>
              </div>
            </button>
          )
        })}

        {stops.length === 0 && (
          <div className="px-6 py-14 text-center text-gray-400 text-sm">
            No stops found for this route.
          </div>
        )}
      </div>
    </div>
  )
}
