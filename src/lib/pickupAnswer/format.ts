// Pickup Answer — America/New_York display formatting (LOCKED tz rule).
//
// Every pickup timestamp displays in America/New_York, converted from UTC,
// DST-safe (Intl handles the offset — never hardcode -04:00/-05:00). "No
// earlier than [time]" makes any tz bug instantly customer-visible: a floor
// stored 2026-09-27 00:00 UTC is 8:00 PM ET on 09-26, NOT midnight on the 27th.
//
// The early-pickup guard's own `formatLocalClock` uses the DEVICE clock, which
// is correct for an ET device (the driver fleet). These force ET so the card
// is right regardless of device tz, while reading the IDENTICAL committed VALUE
// (`effectiveWindow().startsAt`) the guard blocks on — value parity, display
// parity for the ET fleet.

const NY = 'America/New_York'

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

// "8:00 PM"
export function formatEtClock(iso: string | null | undefined): string | null {
  const d = toDate(iso)
  if (!d) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NY, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d)
}

// "Sat, Sep 26"
export function formatEtDate(iso: string | null | undefined): string | null {
  const d = toDate(iso)
  if (!d) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NY, weekday: 'short', month: 'short', day: 'numeric',
  }).format(d)
}

// "Sat, Sep 26 · 8:00 PM"
export function formatEtDateTime(iso: string | null | undefined): string | null {
  const date = formatEtDate(iso)
  const clock = formatEtClock(iso)
  if (!date || !clock) return date ?? clock
  return `${date} · ${clock}`
}

// ET calendar-day key ("YYYY-MM-DD") for same-day comparisons (imminent floor).
export function etDateKey(iso: string | null | undefined): string | null {
  const d = toDate(iso)
  if (!d) return null
  // en-CA yields ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

// Format a BARE calendar date ("YYYY-MM-DD", e.g. scheduled_date) as "Sat,
// Sep 26" WITHOUT tz conversion — it's a date, not an instant, so treat the
// Y-M-D verbatim (parsing via `new Date(iso)` would apply a UTC→local shift).
export function formatCalendarDay(dateStr: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? '')
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(d)
}
