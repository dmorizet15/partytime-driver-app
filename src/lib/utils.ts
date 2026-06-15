// Shared string/display utilities.

// Strip HTML tags from a string for plain-text display. Used at RENDER time
// (not in the transform layer) so the raw value stays intact in the DB / other
// consumers — e.g. TapGoods employee-authored notes (`notes_employee_authored`)
// arrive as rich text with <p>/<br>/<div> tags that would otherwise show as
// literal markup in the driver UI.
export const stripHtml = (s?: string | null): string =>
  s?.replace(/<[^>]*>/g, '').trim() ?? ''
