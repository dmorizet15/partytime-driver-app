'use client'

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
} from 'react'
import { Route, Stop, StopStatus } from '@/types'
import { useAuthContext } from '@/context/AuthContext'
import { stopStateService } from '@/services/StopStateService'

// ─── State ────────────────────────────────────────────────────────────────────
interface AppState {
  routes:     Route[]
  stops:      Stop[]
  isLoading:  boolean
  error:      string | null
  loadedDate: string | null   // YYYY-MM-DD of the last successful load
}

const INITIAL_STATE: AppState = {
  routes:     [],
  stops:      [],
  isLoading:  false,
  error:      null,
  loadedDate: null,
}

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: { routes: Route[]; stops: Stop[]; date: string } }
  | { type: 'LOAD_ERROR';   payload: { error: string } }
  | { type: 'MARK_OTW';     payload: { stop_id: string; sent_at: string } }
  | { type: 'MARK_COMPLETE'; payload: { stop_id: string; completed_at: string } }

// ─── Reducer ──────────────────────────────────────────────────────────────────
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null }

    case 'LOAD_SUCCESS':
      return {
        ...state,
        isLoading:  false,
        error:      null,
        routes:     action.payload.routes,
        stops:      action.payload.stops,
        loadedDate: action.payload.date,
      }

    case 'LOAD_ERROR':
      return {
        ...state,
        isLoading: false,
        error:     action.payload.error,
        routes:    [],
        stops:     [],
      }

    case 'MARK_OTW':
      return {
        ...state,
        stops: state.stops.map((s) =>
          s.stop_id === action.payload.stop_id
            ? {
                ...s,
                current_status:     'on_the_way_sent' as StopStatus,
                on_the_way_sent:    true,
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
                completed_at:   action.payload.completed_at,
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
  routes:     Route[]
  stops:      Stop[]
  isLoading:  boolean
  error:      string | null
  loadedDate: string | null
  getRoutesForDate: (date: string) => Route[]
  getStopsForRoute: (routeId: string) => Stop[]
  getStop:          (stopId: string)  => Stop | undefined
  getRoute:         (routeId: string) => Route | undefined
  loadDay:      (date: string) => Promise<void>
  markOtw:      (stopId: string, sentAt: string)      => void
  markComplete: (stopId: string, completedAt: string) => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppStateContext = createContext<AppStateContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE)
  const { user } = useAuthContext()

  // ── Async loader ───────────────────────────────────────────────────────────
  const loadDay = useCallback(async (date: string) => {
    if (state.loadedDate === date && !state.error) return

    dispatch({ type: 'LOAD_START' })

    try {
      const res  = await fetch(`/api/routes?date=${date}`)
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)

      const supabaseStops = json.stops as Stop[]
      const stopIds       = supabaseStops.map((s) => s.stop_id)

      // Flush any queued offline OTW writes now that we have connectivity
      if (user?.id) stopStateService.syncOnReconnect(user.id)

      // Read OTW status from Supabase for this batch of stops
      const supabaseOtw = await stopStateService.readOtwStatus(stopIds)

      // Merge priority: Supabase OTW > localStorage > server default
      const mergedStops = supabaseStops.map((s) => {
        if (supabaseOtw.has(s.stop_id)) {
          return { ...s, ...supabaseOtw.get(s.stop_id) }
        }
        try {
          const saved = localStorage.getItem(`ptd_stop_${s.stop_id}`)
          if (saved) return { ...s, ...JSON.parse(saved) }
        } catch {}
        return s
      })

      dispatch({
        type:    'LOAD_SUCCESS',
        payload: { routes: json.routes, stops: mergedStops, date },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[AppState] loadDay error:', message)
      dispatch({ type: 'LOAD_ERROR', payload: { error: message } })
    }
  }, [state.loadedDate, state.error, user])

  // ── Selectors ──────────────────────────────────────────────────────────────
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

  const getStop  = useCallback((stopId: string)  => state.stops.find((s) => s.stop_id === stopId),  [state.stops])
  const getRoute = useCallback((routeId: string) => state.routes.find((r) => r.route_id === routeId), [state.routes])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const markOtw = useCallback((stopId: string, sentAt: string) => {
    dispatch({ type: 'MARK_OTW', payload: { stop_id: stopId, sent_at: sentAt } })
    stopStateService.writeOtw(stopId, user?.id ?? '', sentAt)
  }, [user])

  const markComplete = useCallback((stopId: string, completedAt: string) => {
    dispatch({ type: 'MARK_COMPLETE', payload: { stop_id: stopId, completed_at: completedAt } })
    try {
      const prev = JSON.parse(localStorage.getItem(`ptd_stop_${stopId}`) ?? '{}')
      localStorage.setItem(`ptd_stop_${stopId}`, JSON.stringify({ ...prev, current_status: 'completed', completed_at: completedAt }))
    } catch {}
  }, [])

  return (
    <AppStateContext.Provider
      value={{
        routes:     state.routes,
        stops:      state.stops,
        isLoading:  state.isLoading,
        error:      state.error,
        loadedDate: state.loadedDate,
        getRoutesForDate,
        getStopsForRoute,
        getStop,
        getRoute,
        loadDay,
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
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider')
  return ctx
}
