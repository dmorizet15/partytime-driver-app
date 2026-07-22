// App version + per-release changelog — drives the "What's New" sheet.
//
// HOW TO SHIP A RELEASE: add ONE new entry at the TOP of RELEASES with the new
// version, today's date, and only THIS release's driver-facing bullets. That's
// it — VERSION is derived from RELEASES[0], so the number and its bullets can
// never drift apart, and the pre-push version guard reads the same top entry.
//
// NEVER append bullets to an existing release's list to "get them seen" — the
// sheet shows a driver every release NEWER than their last-seen version, so a
// new entry is always what surfaces. (Until 2026-07-13 this file was ONE flat
// array and WhatsNewSheet rendered all of it, so every update dumped the entire
// product history under the newest version number. Keep the releases separate.)
//
// Keep bullets short, plain-language, and driver-facing (no engineering terms).
// Backticks avoid escaping — the copy is full of both ' and ".

export interface Release {
  version: string
  // ISO date (YYYY-MM-DD) — rendered as "Jul 13" next to the version.
  date: string
  bullets: string[]
}

// Newest FIRST. RELEASES[0] is the live version.
export const RELEASES: readonly Release[] = [
  {
    version: '2.8.0',
    date: '2026-07-22',
    bullets: [
      `New: connect your Google Calendar from your Profile — your WhenIWork shifts then show up automatically as "Busy", so you don't get booked over`,
      `Turn shift syncing on or off, or disconnect, anytime from your Profile`,
    ],
  },
  {
    version: '2.7.2',
    date: '2026-07-13',
    bullets: [
      `The equipment question on a pickup now keeps asking until you answer it — tap "Yes, got everything", or enter what you actually brought back`,
      `If you report equipment left at the site, dispatch is told straight away exactly what's still there`,
    ],
  },
  {
    version: '2.7.1',
    date: '2026-07-13',
    bullets: [
      `What's New now shows only what changed since your last update — not the whole history every time`,
    ],
  },
  {
    version: '2.7.0',
    date: '2026-07-13',
    bullets: [
      `Equipment to bring back now sits at the TOP of a pickup stop, above the item list — no more scrolling to find it`,
      `If the delivery crew left cords, racks or chair carts on site, completing the pickup now asks you straight out: "Did you get the equipment?" — one tap for "got everything"`,
      `Dispatch is no longer told equipment was left behind just because nobody tapped the confirm button`,
    ],
  },
  {
    version: '2.6.1',
    date: '2026-07-10',
    bullets: [
      `Stage and deck pieces now show the size you're actually building — "STAGE 12'X20'" sits above its 15 loose 4x4 decks while you check the stop off, not just after`,
      `Ask Ava what size stage you're building and she'll tell you the finished size, not just the piece count`,
    ],
  },
  {
    version: '2.6.0',
    date: '2026-07-10',
    bullets: [
      `Ask Ava about a stop by name — "what am I delivering to Camp Kinder Ring?" now works even when the order is booked under a contact's name`,
      `Ask Ava by stop number too — "what's on my second stop?", "what's next?", "how many stops away is the pickup?"`,
      `Ava counts your stops in the order you actually drive them, so her stop numbers always match your route list — pickups included`,
      `Ava now tells you straight when a place isn't on your route, instead of saying she'll look into it`,
      `See every truck running your route, even when you don't have one assigned to you`,
      `Helpers can now open the route and see the stops (view only)`,
    ],
  },
  {
    version: '2.5.0',
    date: '2026-07-06',
    bullets: [
      `Delivery stops now answer "when are you picking up?" at a glance — a gold card shows the committed pickup time (inflatables) or the day and window (tents), plus a live ETA when the pickup is routed`,
      `The pickup time on that card always matches the "you're early" cutoff, so what you tell the customer can never disagree with the app`,
    ],
  },
  {
    version: '2.4.0',
    date: '2026-07-02',
    bullets: [
      `Dispatch notes for your route now stay visible on Home after your pre-trip, right above your stops`,
    ],
  },
  {
    version: '2.3.1',
    date: '2026-07-02',
    bullets: [
      `Arcade: the Play button is now reachable on every phone`,
      `Weather: the snow forecast only shows during the winter months`,
      `Training: sections that aren't ready yet now correctly read "Coming Soon"`,
    ],
  },
  {
    version: '2.3.0',
    date: '2026-07-02',
    bullets: [
      `Pickup stops now show a pre-filled count of equipment to bring back — one tap confirms it, or correct it to what you actually found`,
      `Counts carry across split jobs: if another crew already grabbed some of it, your number reflects what's actually left`,
    ],
  },
  {
    version: '2.2.0',
    date: '2026-07-02',
    bullets: [
      `Log extension cords, racks, crates, and chair carts you leave at a delivery — the pickup crew will see exactly what to grab`,
    ],
  },
  {
    version: '2.1.0',
    date: '2026-06-28',
    bullets: [
      `See your next shift and preview the full route before you start the day`,
      `Ask Ava about your route — including what you're delivering vs. picking up`,
      `Completing a stop no longer freezes if you lose signal mid-tap`,
      `See when other trucks are working the same job`,
      `Staging and flooring pieces now group together on the stop manifest`,
    ],
  },
  {
    version: '2.0.0',
    date: '2026-06-14',
    bullets: [
      `Your route now loads even without signal`,
      `App installs to your home screen with the PartyTime Work icon`,
      `Offline indicator shows when you're working without connection`,
      `App updates automatically when a new version is available`,
    ],
  },
]

// The live version. Derived — never hand-edit this, add a release above.
export const VERSION = RELEASES[0].version

// Numeric compare so "2.10.0" sorts above "2.9.0" (a string compare would not).
function versionRank(v: string): number[] {
  return v.split('.').map((p) => parseInt(p, 10) || 0)
}

function isNewer(a: string, b: string): boolean {
  const [x, y] = [versionRank(a), versionRank(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

// How many releases the sheet will ever show at once, and the bullet ceiling
// across them — a driver back from a month off gets the recent releases, not a
// wall of text. Anything trimmed is summarised by a single muted line.
export const MAX_RELEASES_SHOWN = 3
export const MAX_BULLETS_SHOWN  = 10

export interface WhatsNewContent {
  releases: Release[]
  // Releases withheld by the caps above (0 when everything fit).
  olderCount: number
}

// What to show a driver whose last acknowledged version is `lastSeen`.
//   • null/unknown (fresh install, cleared storage) → just the current release.
//   • behind by several → every release newer than theirs, newest first, capped.
//   • up to date → nothing (the coordinator won't open the sheet anyway).
export function releasesSince(lastSeen: string | null): WhatsNewContent {
  const newer = lastSeen
    ? RELEASES.filter((r) => isNewer(r.version, lastSeen))
    : RELEASES.slice(0, 1)

  // Never show an empty sheet: an unrecognised last-seen value (a downgrade, a
  // hand-edited key) falls back to the current release rather than nothing.
  const candidates = newer.length > 0 ? newer : RELEASES.slice(0, 1)

  const shown: Release[] = []
  let bullets = 0
  for (const r of candidates) {
    // Always show the newest release whole, even if it alone exceeds the cap —
    // the whole point of the sheet is "what changed just now".
    if (shown.length > 0) {
      if (shown.length >= MAX_RELEASES_SHOWN) break
      if (bullets + r.bullets.length > MAX_BULLETS_SHOWN) break
    }
    shown.push(r)
    bullets += r.bullets.length
  }

  return { releases: shown, olderCount: candidates.length - shown.length }
}
