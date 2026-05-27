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
// Single template per condition set, route-weight-aware. Joey + Austin + Lucas
// default. The driver who said "straight and to the point" gets exactly that.
function directMessage(s: MorningSummary): string {
  if (s.stopCount === 0) return 'No stops today. Take it easy.'

  const stops = s.stopCount === 1 ? '1 stop' : `${s.stopCount} stops`
  const weather = s.hasWeatherFlag ? ' Watch the weather.' : ''

  if (s.tentCount >= 2) {
    const tents = s.tentCount === 1 ? '1 tent' : `${s.tentCount} tents`
    return `Heavy tent day — ${stops}, ${tents}. Steady wins.${weather}`
  }
  if (s.stopCount >= 4) {
    return `Big day — ${stops}. Let's get to it.${weather}`
  }
  if (s.codCount >= 2) {
    return `${stops} today. ${s.codCount} CODs. Let's go.${weather}`
  }
  if (s.codCount === 1) {
    if (s.stopCount === 1) return `1 stop today, cash on arrival. Let's go.${weather}`
    return `${stops} today. One COD. Let's go.${weather}`
  }
  if (s.stopCount === 1) return `1 stop today. Easy.${weather}`
  return `${stops} today. Let's go.${weather}`
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
      "Empty calendar — rare gift. Take it.",
      "Zero stops. Hammock weather.",
    ]
  }

  const stops = s.stopCount === 1 ? '1 stop' : `${s.stopCount} stops`
  const weatherTail = s.hasWeatherFlag ? ' Weather wants a word — peek at it.' : ''

  if (s.tentCount >= 2) {
    return [
      `Tent fortress day — ${stops}, ${s.tentCount} tents. Channel your inner architect.${weatherTail}`,
      `${stops} today, ${s.tentCount} tents to raise. Strong coffee recommended.${weatherTail}`,
      `Heavy tent run: ${stops}, ${s.tentCount} canopies. Stretch first.${weatherTail}`,
    ]
  }
  if (s.stopCount >= 4) {
    return [
      `${stops}. Big board. Pace yourself.${weatherTail}`,
      `${stops} on deck — long one. Hydrate.${weatherTail}`,
      `Today's a marathon: ${stops}. One foot in front of the other.${weatherTail}`,
    ]
  }
  if (s.codCount >= 2) {
    return [
      `${stops}, ${s.codCount} CODs. Two wallets, one route. Let's collect.${weatherTail}`,
      `${stops} on the board, ${s.codCount} paying at the door. Cash whisperer mode.${weatherTail}`,
      `${stops} today — ${s.codCount} cash collections. Pockets ready.${weatherTail}`,
    ]
  }
  if (s.codCount === 1) {
    return [
      `${stops}, one wants cash. Be the cash whisperer today.${weatherTail}`,
      `${stops}, one COD. Easy money — literally.${weatherTail}`,
      `${stops} on the board, one paying at the door. Let's roll.${weatherTail}`,
      `${stops} today, one cash collect. Standard day.${weatherTail}`,
    ]
  }
  if (s.stopCount === 1) {
    return [
      `One stop. Quick win.${weatherTail}`,
      `Single stop today. In and out.${weatherTail}`,
      `One on the board. Hardly counts.${weatherTail}`,
    ]
  }
  return [
    `${stops} today. Let's roll.${weatherTail}`,
    `${stops} on the board. Smooth start.${weatherTail}`,
    `${stops} lined up. Standard day.${weatherTail}`,
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
  if (preference === 'direct') return directMessage(summary)
  const variants = personalityVariants(summary)
  return variants[pickVariantIndex(`${driverId}|${dateKey}`, variants.length)]
}
