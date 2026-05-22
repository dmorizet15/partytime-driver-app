// ─── Fleet Maintenance — shared design tokens ───────────────────────────────
// Fleet screens live under the Tools Hub, so they inherit its dark hub palette
// (#0D0D0D bg, #1A1A1A cards). Shared here so the four screens + home/Tools
// cards never drift. Matches ToolsScreen.tsx / TentingHubScreen.tsx tokens.

export const FC = {
  bg:          '#0D0D0D',
  card:        '#1A1A1A',
  cardRaised:  '#202020',
  cardBorder:  'rgba(255,255,255,0.07)',
  divider:     'rgba(255,255,255,0.07)',
  blue:        '#0000FF',
  white:       '#FFFFFF',
  ink:         '#0A0B14',
  muted:       'rgba(255,255,255,0.4)',
  faint:       'rgba(255,255,255,0.28)',
  paper:       '#FFFFFF',

  // status — red / amber / green
  red:         '#E5484D',
  redBg:       'rgba(229,72,77,0.15)',
  redBorder:   'rgba(229,72,77,0.35)',
  amber:       '#FFB800',
  amberBg:     'rgba(255,184,0,0.15)',
  amberBorder: 'rgba(255,184,0,0.32)',
  green:       '#1FBF6B',
  greenBg:     'rgba(31,191,107,0.15)',
  greenBorder: 'rgba(31,191,107,0.3)',
} as const

export const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
export const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"
