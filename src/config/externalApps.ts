// ─── TapGoods ────────────────────────────────────────────────────────────────
// Replace {order_id} at runtime with stop.order_id
export const TAPGOODS_ORDER_URL_TEMPLATE =
  'https://business.tapgoods.com/orders/rentals/{order_id}/pickList'

// ─── Easy RFID Pro ────────────────────────────────────────────────────────────
// Android package name for Easy RFID Pro V7.
// Verify on device: adb shell pm list packages | grep pts
// Used to construct an Android intent:// URL for direct app launch.
export const EASY_RFID_ANDROID_PACKAGE = 'com.pts.publisher.EasyRFIDProV7'
