'use client'

// ─── Host-side RFID adapter implementations ──────────────────────────────────
// HOST code (not module code): this is the one place driver-app internals meet
// the RFID module's adapter contract. The module never imports from here —
// StopDetailScreen (and any other mount point) builds these and hands them to
// <RfidModuleProvider>. A fresh app writes its own version of this file; the
// module stays untouched (the extraction test).

import { supabase } from '@/lib/supabase'
import { readCachedUser, readCachedProfile } from '@/lib/authCache'
import type { Stop } from '@/types'
import type {
  AuthAdapter,
  GeoPoint,
  IdentityAdapter,
  LocationAdapter,
  NavigationAdapter,
  RfidModuleAdapters,
  StopContext,
  StopContextAdapter,
  ThemeAdapter,
} from '@/modules/rfid'

// ── Stop context ──────────────────────────────────────────────────────────────

export function stopToStopContext(stop: Stop): StopContext {
  return {
    stopId: stop.stop_id,
    kind: stop.stop_type === 'delivery' ? 'delivery' : stop.stop_type === 'pickup' ? 'pickup' : 'other',
    orderId: stop.order_id,
    // PTR uses the TapGoods order id as the tag-backend contract number.
    contractNumber: stop.order_id,
    clientName: stop.customer_name,
    expectedItems: (stop.items ?? []).map((item) => ({
      lineId:
        typeof item.tapgoods_pick_list_item_id === 'number'
          ? String(item.tapgoods_pick_list_item_id)
          : null,
      // rfid_to_tapgoods_map join lands at merge time (module ASSUMPTIONS.md);
      // until then the module falls back to normalized-name matching.
      rentalClassId: null,
      name: item.name?.trim() || 'Unnamed item',
      quantity: typeof item.qty === 'number' && item.qty > 0 ? Math.floor(item.qty) : 0,
    })),
  }
}

function makeStopContextAdapter(stop: Stop): StopContextAdapter {
  const context = stopToStopContext(stop)
  return { getCurrentStop: () => context }
}

// ── Identity / auth ───────────────────────────────────────────────────────────

const identityAdapter: IdentityAdapter = {
  async getCurrentDriver() {
    // Offline-capable: the cached user/profile survive cold starts (authCache).
    const user = readCachedUser()
    if (!user) return null
    const profile = readCachedProfile(user.id)
    return {
      id: user.id,
      displayName: profile?.display_name ?? user.email ?? user.id,
    }
  },
}

const authAdapter: AuthAdapter = {
  async getAccessToken() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      return session?.access_token ?? null
    } catch {
      return null
    }
  },
}

// ── Location (60s cache like writeHelpers.captureGps — bulk scans don't hammer the radio) ──

let cachedFix: GeoPoint | null = null

const locationAdapter: LocationAdapter = {
  getCurrentPosition() {
    if (cachedFix && Date.now() - cachedFix.capturedAt < 60_000) {
      return Promise.resolve(cachedFix)
    }
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          cachedFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            capturedAt: Date.now(),
          }
          resolve(cachedFix)
        },
        () => resolve(null), // denial/timeout → coordinate-less write, never a rejection
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
      )
    })
  },
}

// ── Navigation ────────────────────────────────────────────────────────────────

function makeNavigationAdapter(onExit: () => void): NavigationAdapter {
  return {
    exitModule: onExit,
    openMap(point, label) {
      const q = `${point.lat},${point.lng}`
      window.open(`https://maps.google.com/?q=${encodeURIComponent(label ? `${label}@${q}` : q)}`, '_blank')
    },
  }
}

// ── Theme (Direction 03 Editorial — the host's real tokens, injected not copied) ──

const themeAdapter: ThemeAdapter = {
  getTheme: () => ({
    colors: {
      primary: '#0000FF',
      ink: '#0A0B14',
      background: '#FFF9EE',
      surface: '#FFFFFF',
      surfaceMuted: '#F4F6FA',
      accent: '#FFB800',
      accentSoft: '#FFEFC2',
      danger: '#FF5A3C',
      success: '#1FBF6B',
      muted: '#6B7488',
    },
    fonts: {
      display: "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif",
      body: "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
    },
    touchTargetPx: 56,
  }),
}

// ── Aggregate ────────────────────────────────────────────────────────────────

export function buildStopAdapters(stop: Stop, onExit: () => void): RfidModuleAdapters {
  return {
    stopContext: makeStopContextAdapter(stop),
    identity: identityAdapter,
    auth: authAdapter,
    location: locationAdapter,
    navigation: makeNavigationAdapter(onExit),
    theme: themeAdapter,
  }
}

/** Adapters for surfaces with no stop (Touch Scan from the Tools hub). */
export function buildToolAdapters(onExit: () => void): RfidModuleAdapters {
  return {
    stopContext: { getCurrentStop: () => null },
    identity: identityAdapter,
    auth: authAdapter,
    location: locationAdapter,
    navigation: makeNavigationAdapter(onExit),
    theme: themeAdapter,
  }
}
