import { Stop } from '@/types'

// ─── Interface ────────────────────────────────────────────────────────────────
// Phase 2: swap CopilotIntentNavigation for CopilotUrlLaunchNavigation or
// CopilotCpikNavigation without touching any screen components.
export interface INavigationService {
  navigateTo(stop: Stop): Promise<void>
}

// ─── V1 Implementation — geo: URI / Android Intent stub ───────────────────────
// In the Android WebView wrapper, the host app intercepts geo: URIs and
// redirects them to CoPilot via an explicit intent.
// Verify the installed package name on PartyTime test devices:
//   adb shell pm list packages | grep alk
// Expected: com.alk.copilot.mapviewer (consumer) or enterprise variant
export class CopilotIntentNavigation implements INavigationService {
  async navigateTo(stop: Stop): Promise<void> {
    const addressParts = [
      stop.address_line_1,
      stop.address_line_2,
      stop.city,
      stop.state,
      stop.postal_code,
    ].filter(Boolean)

    const encodedAddress = encodeURIComponent(addressParts.join(', '))

    const uri =
      stop.latitude && stop.longitude
        ? `geo:${stop.latitude},${stop.longitude}?q=${encodedAddress}`
        : `geo:0,0?q=${encodedAddress}`

    // ── STUB ────────────────────────────────────────────────────────────────
    // In the browser prototype this logs only.
    // In production Android WebView:
    //   window.location.href = uri
    // Or via Android JavascriptInterface bridge registered on the WebView.
    console.log('[NavigationService] STUB — CoPilot launch')
    console.log('[NavigationService] geo: URI:', uri)
    console.log('[NavigationService] Package to verify: com.alk.copilot.mapviewer')

    // Phase 2 upgrade path:
    // 1. URL Launch: use CoPilot's proprietary URL scheme for multi-stop / driver auth
    // 2. CPIK: embed CoPilot library — requires Trimble Partner Portal access
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const navigationService: INavigationService = new CopilotIntentNavigation()
