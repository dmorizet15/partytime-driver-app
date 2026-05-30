// AVA Tier 2 morning brief — pure-functional message generator.
// No API, no system prompt: Phase 1 ships direct templates + a small set of
// personality variants. Cloud-driven generation lands when Claude API wiring
// goes in (Session 5+).

export type PersonalityPreference = 'direct' | 'personality'

export interface MorningSummary {
  stopCount:       number
  codCount:        number
  tentCount:       number   // count of tent items across today's manifest
  hasWeatherFlag:  boolean  // true if WeatherFlagCard is showing wind/rain/snow
}

// Stable-within-day RNG: same driver + same date returns the same variant
// index, so the message doesn't flip between renders. Different days vary.
function pickVariantIndex(seed: string, variantCount: number): number {
  if (variantCount <= 1) return 0
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % variantCount
}

// ─── Direct mode ─────────────────────────────────────────────────────────────
// Spoken-first copy: these lines are read aloud by a voice AI, so they're
// conversational and warm rather than terse text-notification fragments. Tent
// days and wind advisories hash-pick across variants (seeded by driver + date,
// stable within a day); the rest are single lines. Joey + Austin + Lucas
// default. Read every line aloud before changing it — if it sounds like a text
// notification, rewrite it.
function directMessage(s: MorningSummary, seed: string): string {
  if (s.stopCount === 0) return "You've got nothing on the route today. Enjoy the time off."

  const stops = s.stopCount === 1 ? '1 stop' : `${s.stopCount} stops`

  // Wind is woven in as a natural, hash-picked sentence rather than a flat tail.
  const windVariants = [
    "Heads up — it's windy out there today. Stake everything twice.",
    "There's a wind advisory on your route. Make sure your tents are secure — extra stakes and ratchets based on the soil and exposure at each site.",
    "It's breezy out there — double-check every stake and anchor before you leave a site.",
  ]
  const windTail = s.hasWeatherFlag
    ? ` ${windVariants[pickVariantIndex(`${seed}|wind`, windVariants.length)]}`
    : ''

  if (s.tentCount >= 2) {
    const tentDay = [
      `Big tent day — ${s.tentCount} tents across ${stops}. Show Darren why you're his best installer.`,
      `You've got ${stops} today — ${s.tentCount} tents to raise. Work smart and you'll crush it.`,
      `Heavy setup day — ${s.tentCount} tents across ${stops}. Take your time and do it right.`,
    ]
    return `${tentDay[pickVariantIndex(seed, tentDay.length)]}${windTail}`
  }
  if (s.stopCount >= 4) {
    return `Full day ahead — ${stops} on your route. Get rolling early and you'll stay ahead of it.${windTail}`
  }
  if (s.codCount >= 2) {
    return `You've got ${stops} today — ${s.codCount} cash collections. Stay organized on the money side.${windTail}`
  }
  if (s.codCount === 1) {
    if (s.stopCount === 1) return `One stop today — and it's a cash collection. Quick one. Grab the money and you're done.${windTail}`
    return `You've got ${stops} today — one's a cash collection. Knock them out in order and you'll be set.${windTail}`
  }
  if (s.stopCount === 1) return `Just one stop today. Get in, set it up right, and you're done.${windTail}`
  return `You've got ${stops} on your route today. Nothing wild — get rolling and keep it moving.${windTail}`
}

// ─── Personality mode ────────────────────────────────────────────────────────
// 3–4 variants per condition set; deterministic pick by (date + driverId)
// hash so the same morning brief renders consistently within a session and
// rotates across days. Dylan + anyone else who flips personality_preference on.
// Add variants as we learn what lands without rewriting any consumer.

function personalityVariants(s: MorningSummary): string[] {
  if (s.stopCount === 0) {
    return [
      "Nothing on the board today. Enjoy the quiet.",
      "Clear calendar — that's a rare one. Take it.",
      "Zero stops. Sounds like hammock weather to me.",
    ]
  }

  const stops = s.stopCount === 1 ? '1 stop' : `${s.stopCount} stops`
  const weatherTail = s.hasWeatherFlag ? " Oh — and weather's got something to say. Peek at it before you head out." : ''

  if (s.tentCount >= 2) {
    return [
      `Tent fortress day — ${stops}, ${s.tentCount} tents to raise. Channel your inner architect.${weatherTail}`,
      `You've got ${stops} today — ${s.tentCount} tents to raise. I'd grab a strong coffee before you head out.${weatherTail}`,
      `Heavy tent run — ${stops}, ${s.tentCount} canopies. I'd stretch first if I were you.${weatherTail}`,
    ]
  }
  if (s.stopCount >= 4) {
    return [
      `You've got ${stops} today. Big board — pace yourself.${weatherTail}`,
      `${stops} on deck — long one. Stay hydrated.${weatherTail}`,
      `Today's a marathon — ${stops}. One stop at a time and you'll get through it.${weatherTail}`,
    ]
  }
  if (s.codCount >= 2) {
    return [
      `You've got ${stops} today — ${s.codCount} cash collections. Two wallets, one route. Let's go.${weatherTail}`,
      `${stops} on the board — ${s.codCount} paying at the door. Cash whisperer mode — activated.${weatherTail}`,
      `You've got ${stops} today — ${s.codCount} cash collections. Make sure your pockets are ready.${weatherTail}`,
    ]
  }
  if (s.codCount === 1) {
    return [
      `${stops} today — one wants cash. Be the cash whisperer.${weatherTail}`,
      `${stops} today — one COD. Easy money. Literally.${weatherTail}`,
      `${stops} on the board — one's paying at the door. Let's roll.${weatherTail}`,
      `${stops} today — one cash collect. Standard day.${weatherTail}`,
    ]
  }
  if (s.stopCount === 1) {
    return [
      `One stop today. Quick win.${weatherTail}`,
      `Single stop today — in and out.${weatherTail}`,
      `One on the board. Hardly counts.${weatherTail}`,
    ]
  }
  return [
    `${stops} today. Let's roll.${weatherTail}`,
    `${stops} on the board. Smooth start.${weatherTail}`,
    `${stops} lined up. Nice and standard.${weatherTail}`,
  ]
}

/**
 * Build the morning brief message. `driverId` + `dateKey` (e.g. 'YYYY-MM-DD')
 * drive personality-variant selection — pass both so different drivers on the
 * same day see different lines, and the same driver sees a different line
 * the next day.
 */
export function getMorningMessage(
  preference: PersonalityPreference,
  summary: MorningSummary,
  driverId: string,
  dateKey: string,
): string {
  if (preference === 'direct') return directMessage(summary, `${driverId}|${dateKey}`)
  const variants = personalityVariants(summary)
  return variants[pickVariantIndex(`${driverId}|${dateKey}`, variants.length)]
}
