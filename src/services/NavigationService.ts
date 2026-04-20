import { Stop } from '@/types'

// ─── Result shape ─────────────────────────────────────────────────────────────
export interface NavigationResult {
  success: boolean    // true = geo: URI dispatched; false = blocked or error
  attempted: boolean  // true = we sent a URI; false = blocked before any attempt
  uri?: string
  message?: string    // user-facing message on failure (safe to show in UI)
}

// ─── Interface ────────────────────────────────────────────────────────────────
export interface INavigationService {
  navigateTo(stop: Stop): Promise<NavigationResult>
}

// ─── Implementation ───────────────────────────────────────────────────────────
// CoPilot launch strategy:
//
// BROWSER BEHAVIOUR (non-Android):
//   Returns immediately with success: false and a user-facing message.
//   Zero navigation — no URI is attempted.
//
// ANDROID BEHAVIOUR:
//   Dispatches a geo: URI via window.location.href.
//   On Chrome for Android: opens the system navigation chooser. If CoPilot is
//   installed and set as the default nav app, it opens directly.
//   In a managed Android WebView: shouldOverrideUrlLoading intercepts the geo:
//   URI and the wrapper app must forward it to CoPilot via an explicit Intent:
//     Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(geoUri));
//     intent.setPackage("com.alk.copilot.mapviewer");  // lock to CoPilot
//     context.startActivity(intent);
//
// PACKAGE NAME TO VERIFY ON DEVICE:
//   adb shell pm list packages | grep alk
//   Expected: com.alk.copilot.mapviewer  (consumer/fleet variant)
//
// PHASE 2 UPGRADE PATH:
//   1. CoPilot URL Launch scheme (no SDK, no Partner Portal):
//      copilot://v1/navigate?destination=ADDRESS — opens CoPilot directly if installed
//   2. CPIK: embed CoPilot SDK — requires Trimble Partner Portal access
export class CopilotNavigation implements INavigationService {
  async navigateTo(stop: Stop): Promise<NavigationResult> {

    // ── Hard guard: never attempt navigation in non-Android environments ─────
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isAndroid = /android/i.test(ua)

    if (!isAndroid) {
      const message = 'Navigation is only available on configured Android devices.'
      console.log('[NavigationService] Navigation blocked — not Android.')
      return { success: false, attempted: false, message }
    }

    // ── Build geo: URI ────────────────────────────────────────────────────────
    const addressParts = [
      stop.address_line_1,
      stop.address_line_2,
      stop.city,
      stop.state,
      stop.postal_code,
    ].filter(Boolean)

    const encodedAddress = encodeURIComponent(addressParts.join(', '))

    // Prefer lat/lng for precision; fall back to address-only query
    const uri =
      stop.latitude && stop.longitude
        ? `geo:${stop.latitude},${stop.longitude}?q=${encodedAddress}`
        : `geo:0,0?q=${encodedAddress}`

    // ── Dispatch ──────────────────────────────────────────────────────────────
    // window.location.href triggers shouldOverrideUrlLoading in WebViews,
    // making it reliably interceptable by the Android wrapper app.
    try {
      window.location.href = uri
      console.log('[NavigationService] geo: URI dispatched:', uri)
      return { success: true, attempted: true, uri }
    } catch (err) {
      console.error('[NavigationService] Dispatch error:', err)
      return { success: false, attempted: true, message: String(err) }
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const navigationService: INavigationService = new CopilotNavigation()
