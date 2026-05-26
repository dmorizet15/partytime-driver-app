// Work Orders module palette. Matches the editorial tokens used across
// the driver app (StopDetailScreen, ToolsScreen) so cards and forms feel
// native — no new design language introduced.

export const WC = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  muted:    '#6B7488',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  green:    '#1FBF6B',
  amber:    '#F5A623',
  red:      '#E5484D',
  coral:    '#FF5A3C',
  // dark hub palette — Tools Hub / fleet screens
  bgDark:         '#0D0D0D',
  cardDark:       '#1A1A1A',
  cardDarkBorder: 'rgba(255,255,255,0.07)',
  whiteDim:       'rgba(255,255,255,0.4)',
} as const

export const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
export const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// Priority → color. Used on cards (left border) + pills.
export const PRIORITY_COLOR: Record<'low' | 'medium' | 'high', string> = {
  low:    WC.green,
  medium: WC.amber,
  high:   WC.red,
}

// Status → display label.
export const STATUS_LABEL: Record<'open' | 'in_progress' | 'done', string> = {
  open:        'Open',
  in_progress: 'In Progress',
  done:        'Done',
}
