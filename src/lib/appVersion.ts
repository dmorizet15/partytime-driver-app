// App version + changelog — drives the "What's New" sheet (PWA update prompts).
//
// Bump VERSION on every deploy that has driver-facing changes worth surfacing,
// and prepend the new bullets to CHANGELOG. On app mount the Home screen
// compares VERSION against localStorage `ptr_last_seen_version`; a mismatch
// (or a missing value) slides up the What's New sheet once. Tapping "Got it"
// writes VERSION back, so the sheet never reappears until the next bump.
//
// Keep bullets short, plain-language, and driver-facing (no engineering terms).

export const VERSION = '2.6.0'

export const CHANGELOG: string[] = [
  'Ask Ava about a stop by name — "what am I delivering to Camp Kinder Ring?" now works even when the order is booked under a contact\'s name',
  'Ask Ava by stop number too — "what\'s on my second stop?", "what\'s next?", "how many stops away is the pickup?"',
  'Ava counts your stops in the order you actually drive them, so her stop numbers always match your route list — pickups included',
  'Ava now tells you straight when a place isn\'t on your route, instead of saying she\'ll look into it',
  'See every truck running your route, even when you don\'t have one assigned to you',
  'Helpers can now open the route and see the stops (view only)',
  'Delivery stops now answer "when are you picking up?" at a glance — a gold card shows the committed pickup time (inflatables) or the day and window (tents), plus a live ETA when the pickup is routed',
  'The pickup time on that card always matches the "you\'re early" cutoff, so what you tell the customer can never disagree with the app',
  'Dispatch notes for your route now stay visible on Home after your pre-trip, right above your stops',
  'Arcade: the Play button is now reachable on every phone',
  'Weather: the snow forecast only shows during the winter months',
  'Training: sections that aren\'t ready yet now correctly read "Coming Soon"',
  'Pickup stops now show a pre-filled count of equipment to bring back — one tap confirms it, or correct it to what you actually found',
  'Counts carry across split jobs: if another crew already grabbed some of it, your number reflects what’s actually left',
  'Log extension cords, racks, crates, and chair carts you leave at a delivery — the pickup crew will see exactly what to grab',
  'See your next shift and preview the full route before you start the day',
  "Ask Ava about your route — including what you're delivering vs. picking up",
  'Completing a stop no longer freezes if you lose signal mid-tap',
  'See when other trucks are working the same job',
  'Staging and flooring pieces now group together on the stop manifest',
]
