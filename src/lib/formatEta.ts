// Format the dispatcher-calculated ETA (timestamptz from dispatch_stops)
// for the driver app UI. Lowercase a/p, no period — e.g. "8:30a", "10:45p".
// Null / undefined / unparseable → "--:--" so the UI never shows "NaN".
export function formatEta(iso: string | null | undefined): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'p' : 'a'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')}${ampm}`
}
