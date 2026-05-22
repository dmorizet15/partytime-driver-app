'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import WorkOrderCard from '@/components/fleet/WorkOrderCard'
import { FC, FONT_BODY, FONT_DISPLAY } from '@/lib/fleet/theme'
import { fetchFleetOverview } from '@/lib/fleet/queries'
import type { FleetOverview, OverviewAsset, WorkOrderListItem } from '@/lib/fleet/types'
import { HealthPill, StatusDot } from '@/components/fleet/FleetPills'
import {
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockIcon,
  TruckIcon,
} from '@/components/fleet/fleetIcons'

const EQUIP_MGMT_MSG =
  'Equipment management coming soon — contact your administrator to add or update equipment.'

export default function FleetOverviewScreen() {
  const router = useRouter()
  const [data, setData] = useState<FleetOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // null = follow the default rule (expanded iff there are open equipment WOs).
  const [equipExpanded, setEquipExpanded] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchFleetOverview()
      .then((d) => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [toast])

  const equipWOCount = data?.equipmentWorkOrders.length ?? 0
  const equipOpen = equipExpanded ?? equipWOCount > 0

  const openAsset = (a: OverviewAsset) =>
    router.push(`/tools/fleet/assets/${a.assetType}/${a.id}`)
  const openWorkOrder = (wo: WorkOrderListItem) =>
    router.push(`/tools/fleet/work-orders/${wo.id}`)

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

            {/* ── TRUCKS ───────────────────────────────────────────────── */}
            <SectionHeader label="Trucks" count={data.trucks.length} />
            <div style={{ padding: '0 18px' }}>
              {data.truckWorkOrders.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {data.truckWorkOrders.map((wo) => (
                    <WorkOrderCard key={wo.id} wo={wo} subtitle={wo.assetName} onTap={() => openWorkOrder(wo)} />
                  ))}
                </div>
              )}
              {data.trucks.length === 0
                ? <EmptyRow text="No active trucks" />
                : (
                  <div style={cardListStyle}>
                    {data.trucks.map((a, i) => (
                      <AssetRow key={a.id} asset={a} last={i === data.trucks.length - 1} onTap={() => openAsset(a)} />
                    ))}
                  </div>
                )}
            </div>

            {/* ── EQUIPMENT ────────────────────────────────────────────── */}
            <EquipmentHeader count={data.equipment.length} onManage={() => setToast(EQUIP_MGMT_MSG)} />
            <div style={{ padding: '0 18px' }}>
              {data.equipmentWorkOrders.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {data.equipmentWorkOrders.map((wo) => (
                    <WorkOrderCard key={wo.id} wo={wo} subtitle={wo.assetName} onTap={() => openWorkOrder(wo)} />
                  ))}
                </div>
              )}
              {data.equipment.length === 0
                ? <EmptyRow text="No active equipment" />
                : (
                  <>
                    <CollapseToggle
                      label="All equipment"
                      count={data.equipment.length}
                      open={equipOpen}
                      onToggle={() => setEquipExpanded(!equipOpen)}
                    />
                    {equipOpen && (
                      <div style={{ ...cardListStyle, marginTop: 8 }}>
                        {data.equipment.map((a, i) => (
                          <AssetRow key={a.id} asset={a} last={i === data.equipment.length - 1} onTap={() => openAsset(a)} />
                        ))}
                      </div>
                    )}
                  </>
                )}
            </div>

            {/* ── OTHER WORK ORDERS — catch-all ────────────────────────── */}
            {data.otherWorkOrders.length > 0 && (
              <>
                <SectionHeader label="Other work orders" count={data.otherWorkOrders.length} />
                <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.otherWorkOrders.map((wo) => (
                    <WorkOrderCard key={wo.id} wo={wo} subtitle={wo.assetName} onTap={() => openWorkOrder(wo)} />
                  ))}
                </div>
              </>
            )}

            <div style={{ height: 28 }} />
          </>
        )}
      </div>

      <BottomNav />

      {toast && <Toast text={toast} />}
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

/** Equipment section header — carries the disabled "Manage equipment" affordance. */
function EquipmentHeader({ count, onManage }: { count: number; onManage: () => void }) {
  return (
    <div style={{
      padding: '22px 18px 8px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 800,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: FC.muted,
        paddingLeft: 4,
      }}>
        <span>Equipment</span>
        <span style={{ color: FC.faint, letterSpacing: '0.1em' }}>{count}</span>
      </div>
      <button
        onClick={onManage}
        aria-label="Manage equipment — coming soon"
        style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: `0.5px solid ${FC.cardBorder}`,
          borderRadius: 999, padding: '5px 10px',
          cursor: 'pointer', fontFamily: 'inherit',
          color: FC.faint, fontSize: 10, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}
      >
        <LockIcon size={12} color={FC.faint} />
        Manage equipment
      </button>
    </div>
  )
}

/** Collapse / expand control for the equipment list (the list only — work
 *  orders above it are never collapsed). */
function CollapseToggle({
  label, count, open, onToggle,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      style={{
        width: '100%', cursor: 'pointer', fontFamily: 'inherit',
        background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
        borderRadius: 14, padding: '13px 14px',
        display: 'flex', alignItems: 'center', gap: 8, color: FC.white,
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: FC.faint }}>{count}</span>
      <span style={{ flex: 1 }} />
      <span style={{
        fontSize: 10.5, fontWeight: 800, color: FC.muted,
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {open ? 'Hide' : 'Show'}
      </span>
      <span style={{
        display: 'flex',
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.15s ease',
      }}>
        <ChevronDownIcon size={18} color={FC.muted} />
      </span>
    </button>
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

function AssetRow({ asset, last, onTap }: { asset: OverviewAsset; last: boolean; onTap: () => void }) {
  const Icon = asset.assetType === 'truck' ? TruckIcon : BoxIcon
  return (
    <button
      onClick={onTap}
      aria-label={`${asset.name} — view details`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: 'transparent', color: FC.white,
        border: 0, borderBottom: last ? 'none' : `0.5px solid ${FC.divider}`,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 14px',
      }}
    >
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
      <ChevronRightIcon size={18} color={FC.faint} />
    </button>
  )
}

function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: '50%',
        bottom: 'calc(108px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        background: FC.cardRaised, color: FC.white,
        padding: '12px 18px', borderRadius: 16,
        fontSize: 13, fontWeight: 600, lineHeight: 1.4,
        border: `0.5px solid ${FC.cardBorder}`,
        boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)',
        zIndex: 300, maxWidth: '84vw', textAlign: 'center',
      }}
    >
      {text}
    </div>
  )
}
