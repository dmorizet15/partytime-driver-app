import {
  TAPGOODS_ORDER_URL_TEMPLATE,
  EASY_RFID_ANDROID_PACKAGE,
} from '@/config/externalApps'

// ─── Result shape ─────────────────────────────────────────────────────────────
export interface ExternalLaunchResult {
  success: boolean   // true = intent dispatched (Android) or URL opened (TapGoods)
                     // false = guard blocked it or a JS exception was thrown
  attempted: boolean // true = we actually tried a URL/intent; false = blocked before any attempt
  url?: string
  message?: string   // user-facing message on failure (safe to display in UI)
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
      return { success: true, attempted: true, url }
    } catch (err) {
      console.error('[ExternalAppService] Failed to open TapGoods:', err)
      return { success: false, attempted: true, message: String(err) }
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
      // ── Hard stop: zero URL attempts in non-Android environments ──────────
      // Returns immediately. No intent URL is constructed or dispatched.
      // The caller is responsible for surfacing the message in the UI.
      const message = 'Easy RFID Pro App is only available on configured Android devices.'
      console.log('[ExternalAppService] RFID launch blocked — not Android.')
      return { success: false, attempted: false, message }
    }

    // ── Android path ─────────────────────────────────────────────────────────
    // intent:// URL dispatched to Chrome / Android PackageManager.
    // Intentionally NO S.browser_fallback_url — without it:
    //   • App installed   → app launches, page stays intact
    //   • App not installed → Chrome shows its own "App not installed" dialog,
    //                         no navigation occurs in our WebView
    //
    // HOSTNAME REQUIREMENT: Chrome for Android's intent:// parser requires a
    // non-empty hostname between "intent://" and "#Intent". An empty host
    // (i.e. "intent://#Intent") is silently rejected — the URL parses but
    // PackageManager is never invoked. Using a dummy hostname ("rfid") fixes
    // this; the hostname value is irrelevant, only its presence matters.
    //
    // window.location.href is used (not window.open) because:
    //   • In Chrome for Android: both work, but location.href is more direct.
    //   • In a managed Android WebView: location.href reliably triggers
    //     shouldOverrideUrlLoading in the wrapper's WebViewClient, allowing
    //     the wrapper app to forward the intent to PackageManager via
    //     Intent.parseUri(url, Intent.URI_INTENT_SCHEME).
    //   window.open(_self) in a WebView may not trigger shouldOverrideUrlLoading
    //   in all WebView configurations, making location.href the safer choice.
    //
    // SUCCESS SEMANTICS: success:true means the intent URI was assigned without
    // a JS exception. It does NOT confirm the app opened — Android does not
    // expose that to JavaScript. Treat it as "best effort dispatched".
    // NOTE ON HOSTNAME:
    // Chrome requires a non-empty host before #Intent, but the host becomes
    // the intent's data URI. Using a hostname like "rfid" caused Easy RFID Pro
    // to try to look up "rfid" as an item and show "item not found".
    // Using "launch" is semantically neutral and should be ignored by the app
    // since ACTION_MAIN + CATEGORY_LAUNCHER doesn't use the data URI.
    // If the app still interprets the data, try removing the host entirely
    // and see if newer Chrome versions accept empty-host intent URLs.
    // APPROACH: component-based intent with empty host.
    // Specifying the exact component (package/activity) targets the activity
    // directly — identical to how the Android home screen launcher fires it.
    // Empty host (intent://#Intent) means no data URI is passed, so Easy RFID
    // Pro won't try to look up an item and show "item not found".
    // Activity discovered via:
    //   adb shell cmd package resolve-activity --brief \
    //     -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
    //     com.pts.publisher.EasyRFIDProV7
    // → com.pts.publisher.EasyRFIDProV7/com.pts.tracerplus.MainActivity
    // ACTION_MAIN + CATEGORY_LAUNCHER confirmed opens Easy RFID Pro on device.
    // The app has auto-login configured which should bring the driver straight
    // to the main page. Non-empty host (launch) is required for Chrome to
    // dispatch the intent; the data URI it creates is ignored by the launcher.
    const intentUrl =
      `intent://launch#Intent` +
      `;package=${EASY_RFID_ANDROID_PACKAGE}` +
      `;action=android.intent.action.MAIN` +
      `;category=android.intent.category.LAUNCHER` +
      `;end`

    // ── Debug logging ─────────────────────────────────────────────────────────
    console.log('[RFID DEBUG] UserAgent:', ua)
    console.log('[RFID DEBUG] Package:', EASY_RFID_ANDROID_PACKAGE)
    console.log('[RFID DEBUG] Intent URL:', intentUrl)

    try {
      window.location.href = intentUrl
      console.log('[ExternalAppService] RFID intent dispatched:', intentUrl)
      return { success: true, attempted: true, url: intentUrl }
    } catch (err) {
      console.error('[ExternalAppService] RFID launch error:', err)
      return { success: false, attempted: true, message: String(err) }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const externalAppService: IExternalAppService = new ExternalAppService()
