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

// ─── Spoken-copy helpers ─────────────────────────────────────────────────────
// These lines are read aloud by a voice AI, so they follow ElevenLabs-optimized
// rules: no em dashes (natural sentence breaks instead), contractions
// throughout, short sentences, and numbers under ten spelled out ("two tents",
// not "2 tents") since the voice reads words more naturally than digits.
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const

function spellNumber(n: number): string {
  return n >= 0 && n < 10 ? NUMBER_WORDS[n] : String(n)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Sentence-start spelled count (e.g. "Two tents to raise.").
function spellNumberCap(n: number): string {
  return capitalize(spellNumber(n))
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

  const stops = s.stopCount === 1 ? 'one stop' : `${spellNumber(s.stopCount)} stops`

  // Wind is woven in as a natural, hash-picked sentence rather than a flat tail.
  const windVariants = [
    "Heads up. It's windy out there today. Stake everything twice.",
    "There's a wind advisory on your route. Make sure your tents are secure. Extra stakes and ratchets based on the soil and exposure at each site.",
    "It's breezy out there. Double-check every stake and anchor before you leave a site.",
  ]
  const windTail = s.hasWeatherFlag
    ? ` ${windVariants[pickVariantIndex(`${seed}|wind`, windVariants.length)]}`
    : ''

  // Heavy-tent framing only for a genuinely big day (5+). For 1–4 tents we let
  // the message fall through to the generic stop/COD lines — no "big tent day"
  // hype when it's a routine couple of tents.
  if (s.tentCount >= 5) {
    const tentDay = [
      `Big tent day. ${spellNumberCap(s.tentCount)} tents across ${stops}. Show Darren why you're his best installer.`,
      `You've got ${stops} today. ${spellNumberCap(s.tentCount)} tents to raise. Work smart and you'll crush it.`,
      `Heavy setup day. ${spellNumberCap(s.tentCount)} tents across ${stops}. Take your time and do it right.`,
    ]
    return `${tentDay[pickVariantIndex(seed, tentDay.length)]}${windTail}`
  }
  if (s.stopCount >= 4) {
    return `Full day ahead. You've got ${stops} on your route. Get rolling early and you'll stay ahead of it.${windTail}`
  }
  if (s.codCount >= 2) {
    return `You've got ${stops} today. ${spellNumberCap(s.codCount)} cash collections. Stay organized on the money side.${windTail}`
  }
  if (s.codCount === 1) {
    if (s.stopCount === 1) return `One stop today. It's a cash collection. Quick one. Grab the money and you're done.${windTail}`
    return `You've got ${stops} today. One's a cash collection. Knock them out in order and you'll be set.${windTail}`
  }
  if (s.stopCount === 1) return `Just one stop today. Get in, set it up right, and you're done.${windTail}`
  return `You've got ${stops} on your route today. Nothing wild. Get rolling and keep it moving.${windTail}`
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
      "Clear calendar. That's a rare one. Take it.",
      "Zero stops. Sounds like hammock weather to me.",
    ]
  }

  const stops  = s.stopCount === 1 ? 'one stop' : `${spellNumber(s.stopCount)} stops`
  const Stops  = capitalize(stops) // sentence-initial form
  const weatherTail = s.hasWeatherFlag ? " Oh, and weather's got something to say. Peek at it before you head out." : ''

  // Heavy-tent framing only at 5+ (see directMessage). 1–4 tents fall through.
  if (s.tentCount >= 5) {
    return [
      `Tent fortress day. ${Stops}, ${spellNumber(s.tentCount)} tents to raise. Channel your inner architect.${weatherTail}`,
      `You've got ${stops} today. ${spellNumberCap(s.tentCount)} tents to raise. I'd grab a strong coffee before you head out.${weatherTail}`,
      `Heavy tent run. ${Stops}, ${spellNumber(s.tentCount)} tents. I'd stretch first if I were you.${weatherTail}`,
    ]
  }
  if (s.stopCount >= 4) {
    return [
      `You've got ${stops} today. Big board. Pace yourself.${weatherTail}`,
      `${Stops} on deck. Long one. Stay hydrated.${weatherTail}`,
      `Today's a marathon. ${Stops}. One stop at a time and you'll get through it.${weatherTail}`,
    ]
  }
  if (s.codCount >= 2) {
    return [
      `You've got ${stops} today. ${spellNumberCap(s.codCount)} cash collections. Two wallets, one route. Let's go.${weatherTail}`,
      `${Stops} on the board. ${spellNumberCap(s.codCount)} paying at the door. Cash whisperer mode activated.${weatherTail}`,
      `You've got ${stops} today. ${spellNumberCap(s.codCount)} cash collections. Make sure your pockets are ready.${weatherTail}`,
    ]
  }
  if (s.codCount === 1) {
    return [
      `${Stops} today. One wants cash. Be the cash whisperer.${weatherTail}`,
      `${Stops} today. One COD. Easy money. Literally.${weatherTail}`,
      `${Stops} on the board. One's paying at the door. Let's roll.${weatherTail}`,
      `${Stops} today. One cash collect. Standard day.${weatherTail}`,
    ]
  }
  if (s.stopCount === 1) {
    return [
      `One stop today. Quick win.${weatherTail}`,
      `Single stop today. In and out.${weatherTail}`,
      `One on the board. Hardly counts.${weatherTail}`,
    ]
  }
  return [
    `${Stops} today. Let's roll.${weatherTail}`,
    `${Stops} on the board. Smooth start.${weatherTail}`,
    `${Stops} lined up. Nice and standard.${weatherTail}`,
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
