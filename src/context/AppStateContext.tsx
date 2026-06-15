'use client'

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Route, Stop, StopStatus } from '@/types'
import { useAuthContext } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { stopStateService } from '@/services/StopStateService'
import { flushCheckoffQueue } from '@/lib/checkoff/service'
import { flushCompleteQueue } from '@/lib/completeQueue'
import { writeRouteCache, readRouteCache, pruneOldRouteCache, warmRouteShells } from '@/lib/routeCache'
import { clearCachedUser, writeCachedProfile } from '@/lib/authCache'
import { getUserRole } from '@/lib/auth'

// Local-timezone YYYY-MM-DD (matches DayRouteSelectorScreen.todayStr). Used by
// the reconnect handler to refresh today's route.
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── State ────────────────────────────────────────────────────────────────────
interface AppState {
  routes:        Route[]
  stops:         Stop[]
  isLoading:     boolean
  error:         string | null
  loadedDate:    string | null   // YYYY-MM-DD of the last successful load
  isOfflineMode: boolean         // true ⇒ data served from the last-saved cache
}

const INITIAL_STATE: AppState = {
  routes:        [],
  stops:         [],
  isLoading:     false,
  error:         null,
  loadedDate:    null,
  isOfflineMode: false,
}

// ─── Actions ──────────────────────────────────────────────────────────────────
type Action =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; payload: { routes: Route[]; stops: Stop[]; date: string } }
  | { type: 'LOAD_OFFLINE'; payload: { routes: Route[]; stops: Stop[]; date: string } }
  | { type: 'LOAD_ERROR';   payload: { error: string } }
  | { type: 'SET_OFFLINE';  payload: { value: boolean } }
  | { type: 'MARK_OTW';     payload: { stop_id: string; sent_at: string } }
  | { type: 'MARK_COMPLETE'; payload: { stop_id: string; completed_at: string } }
  | { type: 'MARK_ARRIVED'; payload: { stop_id: string; arrived_at: string } }
  | { type: 'CLEAR_CACHE' }

// ─── Reducer ──────────────────────────────────────────────────────────────────
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true, error: null }

    case 'LOAD_SUCCESS':
      return {
        ...state,
        isLoading:     false,
        error:         null,
        routes:        action.payload.routes,
        stops:         action.payload.stops,
        loadedDate:    action.payload.date,
        isOfflineMode: false,   // fresh data — clear any offline banner
      }

    case 'LOAD_OFFLINE':
      // Served from the last-saved cache after a failed network load. Same
      // data shape as LOAD_SUCCESS but flags the offline banner on.
      return {
        ...state,
        isLoading:     false,
        error:         null,
        routes:        action.payload.routes,
        stops:         action.payload.stops,
        loadedDate:    action.payload.date,
        isOfflineMode: true,
      }

    case 'LOAD_ERROR':
      return {
        ...state,
        isLoading: false,
        error:     action.payload.error,
        routes:    [],
        stops:     [],
      }

    case 'SET_OFFLINE':
      // Connectivity-event flag flip. Does NOT touch route/stop data — the
      // window 'offline' event sets this immediately; a later cache-served
      // load (LOAD_OFFLINE) or fresh load (LOAD_SUCCESS) reconciles it.
      return { ...state, isOfflineMode: action.payload.value }

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

    case 'MARK_ARRIVED':
      // arrived_at is terminal — once set, the geofence hook stops watching
      // and won't re-fire. Skip the mutation if a value already exists so a
      // late realtime / refetch with a slightly earlier server timestamp
      // can't be clobbered by an optimistic local write.
      return {
        ...state,
        stops: state.stops.map((s) =>
          s.stop_id === action.payload.stop_id && !s.arrived_at
            ? { ...s, arrived_at: action.payload.arrived_at }
            : s
        ),
      }

    case 'CLEAR_CACHE':
      // Reset cached route/stop data without disturbing any in-flight load.
      // Used by the home screen when the assigned-route check resolves to
      // 'no-assignment' so a previous session's data can't bleed through.
      return {
        ...state,
        routes:     [],
        stops:      [],
        loadedDate: null,
      }

    default:
      return state
  }
}

// ─── Context value shape ──────────────────────────────────────────────────────
interface AppStateContextValue {
  routes:        Route[]
  stops:         Stop[]
  isLoading:     boolean
  error:         string | null
  loadedDate:    string | null
  isOfflineMode: boolean
  getRoutesForDate: (date: string) => Route[]
  getStopsForRoute: (routeId: string) => Stop[]
  getStop:          (stopId: string)  => Stop | undefined
  getRoute:         (routeId: string) => Route | undefined
  loadDay:      (date: string, force?: boolean) => Promise<void>
  markOtw:      (stopId: string, sentAt: string)      => void
  markComplete: (stopId: string, completedAt: string) => void
  markArrived:  (stopId: string, arrivedAt: string)   => void
  clearCache:   () => void
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AppStateContext = createContext<AppStateContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, INITIAL_STATE)
  const { user } = useAuthContext()
  const router = useRouter()

  // ── Async loader ───────────────────────────────────────────────────────────
  const loadDay = useCallback(async (date: string, force = false) => {
    if (!force && state.loadedDate === date && !state.error) return

    dispatch({ type: 'LOAD_START' })

    // ── Offline fast-path ─────────────────────────────────────────────────────
    // A doomed /api/routes fetch can HANG with no rejection on iOS standalone
    // (no network timeout — same class as the documented supabase refresh hang).
    // That strands isLoading=true, and Home force-reloads on every mount AND
    // gates its body on isLoading, so it spins forever. When we already know
    // we're offline, skip the fetch and serve the last-saved cache immediately.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const cachedOffline = readRouteCache(date)
      if (cachedOffline) {
        dispatch({ type: 'LOAD_OFFLINE', payload: { routes: cachedOffline.routes, stops: cachedOffline.stops, date } })
      } else {
        dispatch({ type: 'LOAD_ERROR', payload: { error: 'offline' } })
      }
      return
    }

    try {
      // Bound the fetch so an iOS standalone network hang (navigator.onLine can
      // read `true` in airplane mode for a beat) can't strand isLoading. On
      // timeout we abort → the catch below serves the cache, same as any failure.
      const controller = new AbortController()
      const timeoutId  = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(`/api/routes?date=${date}`, { signal: controller.signal })
        .finally(() => clearTimeout(timeoutId))

      if (res.status === 401) {
        // Server rejected the token → real sign-out. Clear the offline identity
        // cache (direct supabase.auth.signOut() bypasses the lib/auth wrapper).
        clearCachedUser()
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }

      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)

      const supabaseStops = json.stops as Stop[]
      const stopIds       = supabaseStops.map((s) => s.stop_id)

      // Flush any queued offline OTW writes now that we have connectivity
      if (user?.id) stopStateService.syncOnReconnect(user.id)

      // Same trigger for queued item check-off writes (audit inserts +
      // TapGoods write-backs) — fire-and-forget, the queue self-prunes.
      if (user?.id) void flushCheckoffQueue()

      // And queued offline stop completions (Part 1) — replays each
      // /api/complete-stop POST, drops on 2xx/4xx, retries 5xx/network.
      // Fire-and-forget; never throws.
      if (user?.id) void flushCompleteQueue()

      // Read OTW status from Supabase for this batch of stops
      const supabaseOtw = await stopStateService.readOtwStatus(stopIds)

      // Merge priority: server-completed > Supabase OTW > localStorage > server default.
      // Completion is terminal — once dispatch_stops.stop_status='completed',
      // OTW state is stale and must not clobber the completed marker. (Before
      // this guard, a stop that had OTW sent before being marked complete
      // would re-surface the Mark Stop Complete button after the post-complete
      // force-reload because the OTW row overrode the server's completion.)
      const mergedStops = supabaseStops.map((s) => {
        if (s.current_status === 'completed') return s
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

      // ── Step 2: cache the MERGED payload for offline fallback ──────────────
      // Cache mergedStops (OTW + ptd_stop_* overlays already applied), never
      // the raw server stops, so the offline view matches what was on screen.
      // try/catch lives inside the helper — a cache-write failure can't break
      // a load that already succeeded. Prune any prior day's cache on success.
      writeRouteCache(date, json.routes, mergedStops)
      pruneOldRouteCache(date)

      // ── Warm the dynamic /route/* page shells into the SW cache ────────────
      // So an OFFLINE hard-navigation to the Routes tab / a stop page is served
      // the real shell (which re-renders from the cache above) instead of the
      // /offline screen. Online-only, session-deduped, best-effort.
      warmRouteShells(json.routes, mergedStops)

      // ── Refresh the cached profile (Part 3 — auto-ETA) ─────────────────────
      // Admin-set flags (auto_send_eta) can change mid-day; refresh the
      // ptd_profile_<userId> cache on each online load so StopDetailScreen's
      // fireAutoEta reads the current value next completion — no app restart.
      // The in-memory AuthContext profile only updates on auth events, so the
      // cache is the live source here. Best-effort, fire-and-forget — never
      // blocks or fails the route load. No /api/profile route exists;
      // getUserRole is the canonical profile loader and writeCachedProfile
      // mirrors the same cache the offline-auth layer already uses.
      if (user?.id) {
        const uid = user.id
        void (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (!token) return
            const fresh = await getUserRole(uid, token)
            if (fresh) writeCachedProfile(uid, fresh)
          } catch { /* best-effort */ }
        })()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[AppState] loadDay error:', message)

      // ── Step 3: offline fallback — serve the last-saved route for this day ─
      // If we have a cached payload for the exact date requested, surface it
      // with the offline banner instead of an error screen. A corrupt/missing
      // cache returns null and falls through to LOAD_ERROR (unchanged).
      const cached = readRouteCache(date)
      if (cached) {
        console.warn('[AppState] loadDay failed — serving cached route for', date)
        dispatch({
          type:    'LOAD_OFFLINE',
          payload: { routes: cached.routes, stops: cached.stops, date },
        })
        return
      }

      dispatch({ type: 'LOAD_ERROR', payload: { error: message } })
    }
  }, [state.loadedDate, state.error, user, router])

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

  // arrived_at is server-authoritative — set once by /api/stops/arrived,
  // never overwritten. Optimistic update only; no localStorage mirror,
  // because the next /api/routes refetch carries the canonical value.
  const markArrived = useCallback((stopId: string, arrivedAt: string) => {
    dispatch({ type: 'MARK_ARRIVED', payload: { stop_id: stopId, arrived_at: arrivedAt } })
  }, [])

  const clearCache = useCallback(() => {
    dispatch({ type: 'CLEAR_CACHE' })
  }, [])

  // ── Step 5: connectivity events ────────────────────────────────────────────
  // On mount, seed the offline flag from navigator.onLine. Then:
  //   • 'offline' → flip the banner on immediately (no wait for a failed load).
  //   • 'online'  → refresh today's route. The loadDay SUCCESS path already
  //                 fires syncOnReconnect (queued OTW writes) + flushCheckoffQueue,
  //                 so no separate flush wiring is needed here, and a successful
  //                 load clears isOfflineMode via LOAD_SUCCESS.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      dispatch({ type: 'SET_OFFLINE', payload: { value: true } })
    }

    const handleOnline = () => { void loadDay(todayStr(), true) }
    const handleOffline = () => { dispatch({ type: 'SET_OFFLINE', payload: { value: true } }) }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadDay])

  // ── Realtime: co-driver stop completions propagate to every crew member ──────
  // dispatch_stops had NO realtime subscription anywhere — the only other channel
  // (DayRouteSelectorScreen) watches `routes` for transfer state. When a co-driver
  // marked a stop complete, /api/complete-stop wrote dispatch_stops but nothing
  // told the primary's client to refetch, so completions surfaced only by accident
  // (mount / foreground / the driver's own completion).
  //
  // This lives in the root-layout AppStateProvider (always mounted) — NOT in a
  // screen — because the App Router unmounts page screens on navigation, so a
  // screen-scoped channel would silently drop the moment the driver opens a stop
  // (exactly the bug scenario). dispatch_stops is in the supabase_realtime
  // publication AND has an authenticated-read RLS policy (both required —
  // publication alone is a false green). On any UPDATE to a stop on one of today's
  // routes, refetch the day. Client-side route-id filter mirrors the proven
  // routes channel. The joined id string only changes when the day's ROUTE set
  // changes (not on a stop UPDATE), so a refetch can't re-trigger this effect.
  const subscribedRouteIdsKey = state.routes.map((r) => r.route_id).join(',')
  useEffect(() => {
    if (!subscribedRouteIdsKey) return
    const ids = new Set(subscribedRouteIdsKey.split(','))
    const channel = supabase
      .channel('dispatch-stops-completions')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dispatch_stops' },
        (payload) => {
          const routeId = (payload.new as { route_id?: string } | null)?.route_id
          if (routeId && ids.has(routeId)) loadDay(todayStr(), true)
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [subscribedRouteIdsKey, loadDay])

  return (
    <AppStateContext.Provider
      value={{
        routes:        state.routes,
        stops:         state.stops,
        isLoading:     state.isLoading,
        error:         state.error,
        loadedDate:    state.loadedDate,
        isOfflineMode: state.isOfflineMode,
        getRoutesForDate,
        getStopsForRoute,
        getStop,
        getRoute,
        loadDay,
        markOtw,
        markComplete,
        markArrived,
        clearCache,
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
