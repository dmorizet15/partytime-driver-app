// PWA install/update helpers shared by the home-screen prompts.
//
// localStorage keys — never reused elsewhere (collision-checked against the
// existing ptd_*/ptr_*/ava_* keys):
//   ptr_install_prompted  — once 'true', the re-install banner never shows again
//   ptr_last_seen_version  — last VERSION the driver acknowledged in What's New

export const INSTALL_PROMPTED_KEY = 'ptr_install_prompted'
export const LAST_SEEN_VERSION_KEY = 'ptr_last_seen_version'

// True when the app is running as an installed PWA (standalone), false when it
// is open in a browser tab or from an old Safari bookmark. Checks the standard
// display-mode media query AND the iOS-Safari legacy `navigator.standalone`
// flag (older iOS doesn't report display-mode reliably). SSR-safe: returns
// false on the server.
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  } catch {
    // matchMedia unavailable — fall through to the iOS flag.
  }
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

// True on iOS / iPadOS (including iPad reporting as MacIntel with touch). Drives
// the re-install instructions: iOS needs the Share-sheet → Add to Home Screen
// flow, while Android Chrome (the RFID platform many drivers run as primary)
// uses the ⋮ menu → Add to Home Screen. Client-only — call after mount.
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
