'use client'

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
} from 'react'
import { Route, Stop, StopStatus } from '@/types'
import { MOCK_ROUTES, MOCK_STOPS } from '@/data/mockData'

// ─── State ────────────────────────────────────────────────────────────────────
interface AppState {
  routes: Route[]
  stops: Stop[]
}

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'MARK_OTW'; payload: { stop_id: string; sent_at: string } }
  | { type: 'MARK_COMPLETE'; payload: { stop_id: string; completed_at: string } }

// ─── Reducer ──────────────────────────────────────────────────────────────────
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'MARK_OTW':
      return {
        ...state,
        stops: state.stops.map((s) =>
          s.stop_id === action.payload.stop_id
            ? {
                ...s,
                current_status: 'on_the_way_sent' as StopStatus,
                on_the_way_sent: true,
                on_the_way_sent_at: action.payload.sent_at,
              }
            : s
        ),
      }
    case 'MARK_COMPLETE':
      return {
        ...state,
        stops: state.stops.map((s) =>
          s.stop_id === action.payload.stop_id
            ? {
                ...s,
                current_status: 'completed' as StopStatus,
                completed_at: action.payload.completed_at,
              }
            : s
        ),
      }
    default:
      return state
  }
}

// ─── Context value shape ──────────────────────────────────────────────────────
interface AppStateContextValue {
  routes: Route[]
  stops: Stop[]
  getRoutesForDate: (date: string) => Route[]
  getStopsForRoute: (routeId: string) => Stop[]
  getStop: (stopId: string) => Stop | undefined
  getRoute: (routeId: string) => Route | undefined
  markOtw: (stopId: string, sentAt: string) => void
  markComplete: (stopId: string, completedAt: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppStateContext = createContext<AppStateContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, {
    routes: MOCK_ROUTES,
    stops: MOCK_STOPS,
  })

  const getRoutesForDate = useCallback(
    (date: string) => state.routes.filter((r) => r.operating_date === date),
    [state.routes]
  )

  const getStopsForRoute = useCallback(
    (routeId: string) =>
      state.stops
        .filter((s) => s.route_id === routeId)
        .sort((a, b) => a.stop_sequence - b.stop_sequence),
    [state.stops]
  )

  const getStop = useCallback(
    (stopId: string) => state.stops.find((s) => s.stop_id === stopId),
    [state.stops]
  )

  const getRoute = useCallback(
    (routeId: string) => state.routes.find((r) => r.route_id === routeId),
    [state.routes]
  )

  const markOtw = useCallback((stopId: string, sentAt: string) => {
    dispatch({ type: 'MARK_OTW', payload: { stop_id: stopId, sent_at: sentAt } })
  }, [])

  const markComplete = useCallback((stopId: string, completedAt: string) => {
    dispatch({
      type: 'MARK_COMPLETE',
      payload: { stop_id: stopId, completed_at: completedAt },
    })
  }, [])

  return (
    <AppStateContext.Provider
      value={{
        routes: state.routes,
        stops: state.stops,
        getRoutesForDate,
        getStopsForRoute,
        getStop,
        getRoute,
        markOtw,
        markComplete,
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) {
    throw new Error('useAppState must be used within an AppStateProvider')
  }
  return ctx
}
