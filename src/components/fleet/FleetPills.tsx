// ─── Fleet Maintenance — status pills + dots ────────────────────────────────

import { FC } from '@/lib/fleet/theme'
import { PRIORITY_LABEL, SOURCE_LABEL, STATUS_LABEL } from '@/lib/fleet/format'
import type {
  AssetHealth,
  PmLevel,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from '@/lib/fleet/types'

type Tone = {
  bg: string
  text: string
  border: string
}

const TONE: Record<'red' | 'amber' | 'green' | 'blue' | 'gray', Tone> = {
  red:   { bg: FC.redBg,   text: FC.red,   border: FC.redBorder },
  amber: { bg: FC.amberBg, text: FC.amber, border: FC.amberBorder },
  green: { bg: FC.greenBg, text: FC.green, border: FC.greenBorder },
  blue:  { bg: 'rgba(96,140,255,0.16)', text: '#7DA0FF', border: 'rgba(96,140,255,0.32)' },
  gray:  { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.12)' },
}

const DOT_COLOR: Record<AssetHealth, string> = {
  work_order: FC.red,
  pm_due:     FC.amber,
  ok:         FC.green,
}

const HEALTH_TONE: Record<AssetHealth, Tone> = {
  work_order: TONE.red,
  pm_due:     TONE.amber,
  ok:         TONE.green,
}
const HEALTH_LABEL: Record<AssetHealth, string> = {
  work_order: 'Work order',
  pm_due:     'PM due',
  ok:         'OK',
}

const PRIORITY_TONE: Record<WorkOrderPriority, Tone> = {
  routine:  TONE.gray,
  urgent:   TONE.amber,
  critical: TONE.red,
}

const STATUS_TONE: Record<WorkOrderStatus, Tone> = {
  open:        TONE.amber,
  in_progress: TONE.blue,
  resolved:    TONE.green,
}

const SOURCE_TONE: Record<WorkOrderSource, Tone> = {
  dvir_defect: TONE.blue,
  manual:      TONE.gray,
}

const PM_TONE: Record<PmLevel, Tone> = {
  ok:       TONE.green,
  due_soon: TONE.amber,
  overdue:  TONE.red,
}
const PM_LABEL: Record<PmLevel, string> = {
  ok:       'OK',
  due_soon: 'Due soon',
  overdue:  'Overdue',
}
const PM_DOT: Record<PmLevel, string> = {
  ok:       FC.green,
  due_soon: FC.amber,
  overdue:  FC.red,
}

// ─── Base pill ──────────────────────────────────────────────────────────────

export function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: tone.bg, color: tone.text,
        border: `0.5px solid ${tone.border}`,
        padding: '3px 9px', borderRadius: 999,
        fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
        textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  )
}

// ─── Status dot ─────────────────────────────────────────────────────────────

export function StatusDot({ health, size = 10 }: { health: AssetHealth; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: DOT_COLOR[health], flexShrink: 0,
        display: 'inline-block',
      }}
    />
  )
}

// ─── Specific pills ─────────────────────────────────────────────────────────

export function HealthPill({ health }: { health: AssetHealth }) {
  return <Pill label={HEALTH_LABEL[health]} tone={HEALTH_TONE[health]} />
}

export function PriorityPill({ priority }: { priority: string }) {
  const key = priority as WorkOrderPriority
  return <Pill label={PRIORITY_LABEL[key] ?? priority} tone={PRIORITY_TONE[key] ?? TONE.gray} />
}

export function SourcePill({ source }: { source: string }) {
  const key = source as WorkOrderSource
  return <Pill label={SOURCE_LABEL[key] ?? source} tone={SOURCE_TONE[key] ?? TONE.gray} />
}

export function WorkOrderStatusPill({ status }: { status: string }) {
  const key = status as WorkOrderStatus
  return <Pill label={STATUS_LABEL[key] ?? status} tone={STATUS_TONE[key] ?? TONE.gray} />
}

export function PmLevelPill({ level }: { level: PmLevel }) {
  return <Pill label={PM_LABEL[level]} tone={PM_TONE[level]} />
}

export function PmDot({ level, size = 10 }: { level: PmLevel; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%',
        background: PM_DOT[level], flexShrink: 0, display: 'inline-block',
      }}
    />
  )
}
