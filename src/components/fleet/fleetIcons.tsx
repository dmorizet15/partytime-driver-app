// ─── Fleet Maintenance — Tabler-style outline icons (24×24, stroke 2) ───────

export type IconProps = { size?: number; color?: string }

function Svg({ size, color, children }: { size: number; color: string; children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function WrenchIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5" />
    </Svg>
  )
}

export function TruckIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
    </Svg>
  )
}

export function BoxIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M12 3l8 4.5v9l-8 4.5l-8 -4.5v-9l8 -4.5" />
      <path d="M12 12l8 -4.5" />
      <path d="M12 12v9" />
      <path d="M12 12l-8 -4.5" />
    </Svg>
  )
}

export function ClipboardIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
      <path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />
      <path d="M9 12l.01 0" /><path d="M13 12l2 0" />
      <path d="M9 16l.01 0" /><path d="M13 16l2 0" />
    </Svg>
  )
}

export function CameraIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
      <path d="M12 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    </Svg>
  )
}

export function FileIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
      <path d="M9 13l6 0" /><path d="M9 17l4 0" />
    </Svg>
  )
}

export function PhoneIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
    </Svg>
  )
}

export function ChevronRightIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M9 6l6 6l-6 6" />
    </Svg>
  )
}

export function PlusIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M12 5v14" /><path d="M5 12h14" />
    </Svg>
  )
}

export function CloseIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M18 6l-12 12" /><path d="M6 6l12 12" />
    </Svg>
  )
}

export function CheckIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M5 12l5 5l10 -10" />
    </Svg>
  )
}

export function AlertTriangleIcon({ size = 22, color = '#fff' }: IconProps): JSX.Element {
  return (
    <Svg size={size} color={color}>
      <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </Svg>
  )
}
