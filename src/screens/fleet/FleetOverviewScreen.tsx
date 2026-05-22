'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { FC, FONT_BODY, FONT_DISPLAY } from '@/lib/fleet/theme'
import { fetchFleetOverview } from '@/lib/fleet/queries'
import type { FleetOverview, OverviewAsset, WorkOrderListItem } from '@/lib/fleet/types'
import { HealthPill, PriorityPill, SourcePill, StatusDot } from '@/components/fleet/FleetPills'
import {
  BoxIcon,
  ChevronRightIcon,
  ClipboardIcon,
  TruckIcon,
} from '@/components/fleet/fleetIcons'

export default function FleetOverviewScreen() {
  const router = useRouter()
  const [data, setData] = useState<FleetOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchFleetOverview()
      .then((d) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="screen" style={{ background: FC.bg, fontFamily: FONT_BODY, color: FC.white }}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: FC.blue, color: FC.white,
        padding: '32px 22px 26px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <svg
          aria-hidden="true"
          width={200} height={200} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -28, top: -16, opacity: 0.22,
            transform: 'rotate(25deg)', transformOrigin: 'center', pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={FC.amber} />
        </svg>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <button
            onClick={() => router.push('/tools')}
            aria-label="Back to tools"
            style={{
              background: 'transparent', border: 0, color: FC.amber,
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              cursor: 'pointer', fontFamily: 'inherit', padding: 0, textTransform: 'uppercase',
            }}
          >
            ← Tools
          </button>
          <div style={{
            width: 32, height: 32, borderRadius: 9, background: FC.white,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ptr-mark.png" alt="PartyTime Rentals" style={{ width: '74%', height: '74%', objectFit: 'contain' }} />
          </div>
        </div>

        <div style={{
          marginTop: 18, position: 'relative',
          fontFamily: FONT_DISPLAY, fontSize: 36, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em', color: FC.white, textTransform: 'uppercase',
        }}>
          Fleet<br />Maintenance
        </div>
        <div style={{
          marginTop: 10, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, maxWidth: '36ch',
        }}>
          Work orders · PM schedules · service log
        </div>
      </div>

      {/* ── Scroll body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ background: FC.bg }}>
        {loading && <CenterNote>Loading fleet…</CenterNote>}
        {!loading && error && <CenterNote tone="error">Couldn’t load fleet data. Pull to retry.</CenterNote>}

        {!loading && !error && data && (
          <>
            {/* Summary counts */}
            <div style={{
              padding: '20px 18px 0',
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
            }}>
              <SummaryCard
                value={data.openWorkOrderCount}
                label="Open work orders"
                accent={data.openWorkOrderCount > 0 ? FC.red : FC.muted}
              />
              <SummaryCard
                value={data.pmDueCount}
                label="PM due soon"
                accent={data.pmDueCount > 0 ? FC.amber : FC.muted}
              />
            </div>

            {/* Trucks */}
            <SectionHeader label="Trucks" count={data.trucks.length} />
            <div style={{ padding: '0 18px' }}>
              {data.trucks.length === 0
                ? <EmptyRow text="No active trucks" />
                : (
                  <div style={cardListStyle}>
                    {data.trucks.map((a, i) => (
                      <AssetRow key={a.id} asset={a} kind="truck" last={i === data.trucks.length - 1} />
                    ))}
                  </div>
                )}
            </div>

            {/* Equipment */}
            <SectionHeader label="Equipment" count={data.equipment.length} />
            <div style={{ padding: '0 18px' }}>
              {data.equipment.length === 0
                ? <EmptyRow text="No active equipment" />
                : (
                  <div style={cardListStyle}>
                    {data.equipment.map((a, i) => (
                      <AssetRow key={a.id} asset={a} kind="equipment" last={i === data.equipment.length - 1} />
                    ))}
                  </div>
                )}
            </div>

            {/* Work orders */}
            <SectionHeader label="Open work orders" count={data.workOrders.length} />
            <div style={{ padding: '0 18px 28px' }}>
              {data.workOrders.length === 0
                ? <EmptyRow text="No open work orders" />
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.workOrders.map((wo) => (
                      <WorkOrderRow
                        key={wo.id}
                        wo={wo}
                        onTap={() => router.push(`/tools/fleet/work-orders/${wo.id}`)}
                      />
                    ))}
                  </div>
                )}
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

const cardListStyle: React.CSSProperties = {
  background: FC.card,
  border: `0.5px solid ${FC.cardBorder}`,
  borderRadius: 14,
  overflow: 'hidden',
}

function CenterNote({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: tone === 'error' ? FC.red : FC.muted, fontSize: 14 }}>
      {children}
    </div>
  )
}

function SummaryCard({ value, label, accent }: { value: number; label: string; accent: string }) {
  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 14, padding: '16px 14px',
    }}>
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 900,
        lineHeight: 1, color: accent, letterSpacing: '-0.02em',
      }}>
        {value}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: FC.muted, lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{
      padding: '22px 22px 8px',
      display: 'flex', alignItems: 'baseline', gap: 8,
      fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 800,
      letterSpacing: '0.2em', textTransform: 'uppercase', color: FC.muted,
    }}>
      <span>{label}</span>
      <span style={{ color: FC.faint, letterSpacing: '0.1em' }}>{count}</span>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 14, padding: '18px 16px',
      fontSize: 13, color: FC.muted, textAlign: 'center',
    }}>
      {text}
    </div>
  )
}

function AssetRow({ asset, kind, last }: { asset: OverviewAsset; kind: 'truck' | 'equipment'; last: boolean }) {
  const Icon = kind === 'truck' ? TruckIcon : BoxIcon
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 14px',
      borderBottom: last ? 'none' : `0.5px solid ${FC.divider}`,
    }}>
      <StatusDot health={asset.health} />
      <div style={{ flexShrink: 0, opacity: 0.55, display: 'flex' }}>
        <Icon size={18} color={FC.muted} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: FC.white,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {asset.name}
        </div>
        <div style={{
          marginTop: 2, fontSize: 12, color: FC.muted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {asset.subtitle}
        </div>
      </div>
      <HealthPill health={asset.health} />
    </div>
  )
}

function WorkOrderRow({ wo, onTap }: { wo: WorkOrderListItem; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      aria-label={`Work order: ${wo.title}`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
        borderRadius: 14, padding: '14px 14px',
        display: 'flex', alignItems: 'center', gap: 12, color: FC.white,
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ClipboardIcon size={20} color={FC.muted} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 800, color: FC.white, lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {wo.title}
        </div>
        <div style={{
          marginTop: 2, fontSize: 12, color: FC.muted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {wo.assetName}
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <PriorityPill priority={wo.priority} />
          <SourcePill source={wo.source} />
        </div>
      </div>
      <ChevronRightIcon size={20} color={FC.faint} />
    </button>
  )
}
