// App version + changelog — drives the "What's New" sheet (PWA update prompts).
//
// Bump VERSION on every deploy that has driver-facing changes worth surfacing,
// and prepend the new bullets to CHANGELOG. On app mount the Home screen
// compares VERSION against localStorage `ptr_last_seen_version`; a mismatch
// (or a missing value) slides up the What's New sheet once. Tapping "Got it"
// writes VERSION back, so the sheet never reappears until the next bump.
//
// Keep bullets short, plain-language, and driver-facing (no engineering terms).

export const VERSION = '2.0.0'

export const CHANGELOG: string[] = [
  'Your route now loads even without signal',
  'App installs to your home screen with the PartyTime Work icon',
  "Offline indicator shows when you're working without connection",
  'App updates automatically when a new version is available',
]
