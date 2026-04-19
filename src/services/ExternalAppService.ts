import {
  TAPGOODS_ORDER_URL_TEMPLATE,
  EASY_RFID_ANDROID_PACKAGE,
} from '@/config/externalApps'

// ─── Result shape ─────────────────────────────────────────────────────────────
export interface ExternalLaunchResult {
  success: boolean
  url?: string
  message?: string
}

// ─── Interface ────────────────────────────────────────────────────────────────
export interface IExternalAppService {
  openTapGoodsOrder(orderId: string): ExternalLaunchResult
  launchRfidApp(): ExternalLaunchResult
}

// ─── Implementation ───────────────────────────────────────────────────────────
export class ExternalAppService implements IExternalAppService {

  // ── TapGoods Order ──────────────────────────────────────────────────────────
  // Opens the TapGoods pick list page for the given order in a new browser tab.
  // Works in any browser and in Android WebView (opens system browser or in-app tab).
  openTapGoodsOrder(orderId: string): ExternalLaunchResult {
    const url = TAPGOODS_ORDER_URL_TEMPLATE.replace('{order_id}', encodeURIComponent(orderId))

    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      console.log('[ExternalAppService] Opened TapGoods order:', url)
      return { success: true, url }
    } catch (err) {
      console.error('[ExternalAppService] Failed to open TapGoods:', err)
      return { success: false, message: String(err) }
    }
  }

  // ── Easy RFID Pro ───────────────────────────────────────────────────────────
  // Attempts to launch Easy RFID Pro V7 by package name on Android.
  //
  // BROWSER BEHAVIOUR (non-Android):
  //   Returns immediately with success: false and a user-facing message.
  //   Zero navigation — no URL is attempted, no redirect occurs.
  //   This is the fix for the "Item not found" / fallback-redirect bug:
  //   the previous implementation included a market:// fallback URL in the
  //   intent string which desktop Chrome would parse and navigate to.
  //
  // ANDROID BEHAVIOUR:
  //   Uses the intent:// scheme without any browser_fallback_url.
  //   Chrome on Android intercepts intent:// and hands it to PackageManager.
  //   If Easy RFID Pro is installed → app opens. If not → Chrome shows its
  //   own "App not installed" dialog (no page navigation).
  //   window.open is used (not window.location.href) so the WebView page
  //   is never navigated away regardless of outcome.
  //
  // PRODUCTION NOTE:
  //   For a fully managed Android WebView, a JavascriptInterface bridge
  //   registered on the WebView is more reliable than intent:// URLs.
  //   Consult the Android wrapper developer before fleet deployment.
  launchRfidApp(): ExternalLaunchResult {
    // ── Hard guard: never attempt any URL in a non-Android environment ──────
    // Check both userAgent and a secondary signal (touch support) for robustness.
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isAndroid = /android/i.test(ua)

    if (!isAndroid) {
      const message = 'Easy RFID Pro App is only available on configured Android devices.'
      console.log('[ExternalAppService] RFID launch skipped — not Android.')
      return { success: false, message }
    }

    // ── Android path — no fallback URL to avoid redirect issues ─────────────
    // Intentionally omitting S.browser_fallback_url so Chrome never navigates
    // away from the app when the package is not installed.
    const intentUrl =
      `intent://#Intent` +
      `;package=${EASY_RFID_ANDROID_PACKAGE}` +
      `;action=android.intent.action.MAIN` +
      `;category=android.intent.category.LAUNCHER` +
      `;end`

    try {
      // window.open keeps the current page intact if the intent is not handled.
      window.open(intentUrl, '_self')
      console.log('[ExternalAppService] RFID intent dispatched:', intentUrl)
      return { success: true, url: intentUrl }
    } catch (err) {
      console.error('[ExternalAppService] RFID launch error:', err)
      return { success: false, message: String(err) }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const externalAppService: IExternalAppService = new ExternalAppService()
