'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppState } from '@/context/AppStateContext'
import AppHeader from '@/components/AppHeader'
import { Route } from '@/types'

// ─── Date helpers ─────────────────────────────────────────────────────────────
// Parse as local date to avoid UTC midnight offset issues on mobile.
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

function shiftDate(dateStr: string, days: number): string {
  const d = parseLocal(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function formatDisplayDate(dateStr: string): string {
  return parseLocal(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DayRouteSelectorScreen() {
  const router = useRouter()
  const { getRoutesForDate } = useAppState()

  const [selectedDate, setSelectedDate] = useState<string>(todayStr())

  const isToday = selectedDate === todayStr()
  const routes = getRoutesForDate(selectedDate)

  function handleRouteSelect(route: Route) {
    router.push(`/route/${route.route_id}`)
  }

  return (
    <div className="screen">
      <AppHeader title="Select Route" />

      {/* ── Date selector ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3
                      bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
          className="w-10 h-10 flex items-center justify-center
                     border border-gray-300 rounded-xl bg-white
                     text-xl font-bold text-gray-600
                     active:bg-gray-100 transition-colors"
          aria-label="Previous day"
        >
          ‹
        </button>

        <div className="text-center">
          {isToday && (
            <span className="inline-block px-2 py-0.5 mb-1
                             bg-gray-900 text-white
                             text-[9px] font-bold uppercase tracking-widest rounded">
              Today
            </span>
          )}
          <div className="text-[15px] font-bold text-gray-900">
            {formatDisplayDate(selectedDate)}
          </div>
        </div>

        <button
          onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
          className="w-10 h-10 flex items-center justify-center
                     border border-gray-300 rounded-xl bg-white
                     text-xl font-bold text-gray-600
                     active:bg-gray-100 transition-colors"
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {/* ── Route list ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-3 pb-1
                        text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Routes for this day
        </div>

        {routes.length === 0 ? (
          <div className="px-6 py-14 text-center text-gray-400 text-sm leading-relaxed">
            No routes scheduled for this day.
          </div>
        ) : (
          routes.map((route) => (
            <button
              key={route.route_id}
              onClick={() => handleRouteSelect(route)}
              className="w-full flex items-center gap-3
                         px-4 py-4 border-b border-gray-100
                         active:bg-gray-50 text-left min-h-[76px]
                         transition-colors"
            >
              {/* Truck icon */}
              <div className="w-11 h-11 rounded-xl border border-gray-200
                              bg-gray-100 flex items-center justify-center
                              text-xl flex-shrink-0">
                🚚
              </div>

              {/* Route info */}
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-gray-900 truncate">
                  {route.route_name}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {route.stop_count} stop{route.stop_count !== 1 ? 's' : ''}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {route.assigned_driver
                    ? `Driver: ${route.assigned_driver}`
                    : 'Unassigned'}
                </div>
              </div>

              {/* Chevron */}
              <span className="text-gray-300 text-xl flex-shrink-0" aria-hidden="true">
                ›
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
