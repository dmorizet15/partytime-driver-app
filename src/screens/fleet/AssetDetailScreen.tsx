'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import WorkOrderCard from '@/components/fleet/WorkOrderCard'
import ServiceLogEntry from '@/components/fleet/ServiceLogEntry'
import FleetServiceToast from '@/components/fleet/FleetServiceToast'
import PartCard from '@/components/fleet/PartCard'
import PillTabs from '@/components/fleet/PillTabs'
import ComplianceBadges from '@/components/fleet/ComplianceBadges'
import { HealthPill, PmDot, PmLevelPill } from '@/components/fleet/FleetPills'
import { FC, FONT_BODY, FONT_DISPLAY } from '@/lib/fleet/theme'
import { fetchAssetDetail } from '@/lib/fleet/queries'
import { formatDate, hours, mileage, prettyServiceType } from '@/lib/fleet/format'
import type { AssetDetail, AssetScheduleView, AssetType } from '@/lib/fleet/types'

type Tab = 'history' | 'pm' | 'parts'

function validAssetType(raw: string): AssetType | null {
  return raw === 'truck' || raw === 'equipment' ? raw : null
}

export default function AssetDetailScreen({
  assetType, assetId,
}: {
  assetType: string
  assetId: string
}) {
  const router = useRouter()
  const type = validAssetType(assetType)

  const [data, setData] = useState<AssetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showAllWO, setShowAllWO] = useState(false)
  const [tab, setTab] = useState<Tab>('history')

  useEffect(() => {
    if (!type) { setNotFound(true); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    fetchAssetDetail(type, assetId)
      .then((d) => {
        if (cancelled) return
        if (!d) { setNotFound(true); setLoading(false); return }
        setData(d); setLoading(false)
      })
      .catch(() => { if (!cancelled) { setNotFound(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [type, assetId])

  const asset = data?.asset
  const openWOs   = data ? data.workOrders.filter((w) => w.status !== 'resolved') : []
  const resolvedExist = data ? data.workOrders.length > openWOs.length : false
  const shownWOs  = showAllWO ? (data?.workOrders ?? []) : openWOs

  return (
    <div className="screen" style={{ background: FC.bg, fontFamily: FONT_BODY, color: FC.white }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, background: FC.bg,
        borderBottom: `0.5px solid ${FC.divider}`,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center',
      }}>
        <button
          onClick={() => router.push('/tools/fleet')}
          aria-label="Back to fleet"
          style={{
            background: 'transparent', border: 0, color: FC.amber,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
            cursor: 'pointer', fontFamily: 'inherit', padding: 0, textTransform: 'uppercase',
          }}
        >
          ← Fleet
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ background: FC.bg }}>
        {loading && <CenterNote>Loading asset…</CenterNote>}
        {!loading && notFound && <CenterNote tone="error">Asset not found.</CenterNote>}

        {!loading && data && asset && (
          <div style={{ padding: '20px 18px 28px' }}>
            {/* Title */}
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 900,
              lineHeight: 1.12, letterSpacing: '-0.02em', color: FC.white,
            }}>
              {asset.name}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: FC.muted }}>
              {asset.vehicleSpec}
            </div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <HealthPill health={data.health} />
              {asset.compliance && <ComplianceBadges compliance={asset.compliance} />}
            </div>

            {/* Identity / usage */}
            <Card style={{ marginTop: 16 }}>
              <MetaRow label={asset.identifierLabel} value={asset.identifier ?? '—'} />
              {asset.assetType === 'truck'
                ? <MetaRow label="Mileage" value={mileage(asset.currentMileage)} last />
                : <MetaRow label="Hours" value={hours(asset.currentHours)} last />}
            </Card>

            {/* Open work orders — persistent, above the tabs (never lost) */}
            {(shownWOs.length > 0 || resolvedExist) && (
              <>
                <SectionTitle>
                  {showAllWO ? 'Work orders' : 'Open work orders'}
                </SectionTitle>
                {shownWOs.length === 0 ? (
                  <EmptyCard text="No open work orders for this asset." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {shownWOs.map((wo) => (
                      <WorkOrderCard
                        key={wo.id}
                        wo={wo}
                        subtitle={`Opened ${formatDate(wo.created_at)}`}
                        onTap={() => router.push(`/tools/fleet/work-orders/${wo.id}`)}
                      />
                    ))}
                  </div>
                )}
                {resolvedExist && (
                  <button
                    onClick={() => setShowAllWO((v) => !v)}
                    style={{ ...secondaryBtn, marginTop: 10 }}
                  >
                    {showAllWO
                      ? 'Show open work orders only'
                      : `View all work orders (${data.workOrders.length})`}
                  </button>
                )}
              </>
            )}

            {/* Tabs */}
            <div style={{ marginTop: 22 }}>
              <PillTabs
                active={tab}
                onChange={(k) => setTab(k as Tab)}
                tabs={[
                  { key: 'history', label: 'History',     count: data.serviceRecords.length },
                  { key: 'pm',      label: 'PM Schedule', count: data.schedules.length },
                  { key: 'parts',   label: 'Parts',       count: data.parts.length },
                ]}
              />
            </div>

            <div style={{ marginTop: 14 }}>
              {/* History tab */}
              {tab === 'history' && (
                data.serviceRecords.length === 0 ? (
                  <EmptyCard text="No service entries logged for this asset yet." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.serviceRecords.map((r) => <ServiceLogEntry key={r.id} record={r} />)}
                  </div>
                )
              )}

              {/* PM Schedule tab */}
              {tab === 'pm' && (
                data.schedules.length === 0 ? (
                  <EmptyCard text="No preventive-maintenance schedule set for this asset." />
                ) : (
                  <div style={cardListStyle}>
                    {data.schedules.map((v, i) => (
                      <ScheduleRow key={v.schedule.id} view={v} last={i === data.schedules.length - 1} />
                    ))}
                  </div>
                )
              )}

              {/* Parts tab */}
              {tab === 'parts' && (
                data.parts.length === 0 ? (
                  <EmptyCard text="No parts mapped to this asset." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.parts.map((p) => <PartCard key={p.part.id} entry={p} />)}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer — Log service (persistent primary CTA) */}
      {!loading && data && asset && (
        <div style={{
          flexShrink: 0, background: FC.bg,
          borderTop: `0.5px solid ${FC.divider}`,
          padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
        }}>
          <button
            onClick={() => router.push(`/tools/fleet/assets/${asset.assetType}/${asset.id}/log-service`)}
            style={primaryBtn}
          >
            Log service
          </button>
        </div>
      )}

      <BottomNav />
      <FleetServiceToast />
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

function ScheduleRow({ view, last }: { view: AssetScheduleView; last: boolean }) {
  const { schedule: s, pmLevel } = view
  const dueParts: string[] = []
  if (s.next_due_date) dueParts.push(formatDate(s.next_due_date))
  if (s.next_due_miles != null) dueParts.push(mileage(s.next_due_miles))
  if (s.next_due_hours != null) dueParts.push(hours(s.next_due_hours))
  const due = dueParts.length ? dueParts.join(' · ') : 'No due date set'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 14px',
      borderBottom: last ? 'none' : `0.5px solid ${FC.divider}`,
    }}>
      <PmDot level={pmLevel} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 700, color: FC.white,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {s.service_label || prettyServiceType(s.service_type)}
        </div>
        <div style={{ marginTop: 2, fontSize: 12, color: FC.muted }}>
          Due {due}
        </div>
      </div>
      <PmLevelPill level={pmLevel} />
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 14, padding: '14px 14px', ...style,
    }}>
      {children}
    </div>
  )
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '7px 0',
      borderBottom: last ? 'none' : `0.5px solid ${FC.divider}`,
    }}>
      <span style={{ fontSize: 12.5, color: FC.muted }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: FC.white, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '24px 0 10px',
      fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 800,
      letterSpacing: '0.2em', textTransform: 'uppercase', color: FC.muted,
    }}>
      {children}
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
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

function CenterNote({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: tone === 'error' ? FC.red : FC.muted, fontSize: 14 }}>
      {children}
    </div>
  )
}

// ─── Button styles ──────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', fontFamily: 'inherit',
  background: FC.blue, color: FC.white,
  border: 0, borderRadius: 12, padding: '14px 16px',
  fontSize: 14, fontWeight: 800, letterSpacing: '0.01em',
}

const secondaryBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', fontFamily: 'inherit',
  background: FC.card, color: FC.white,
  border: `0.5px solid ${FC.cardBorder}`, borderRadius: 12, padding: '13px 16px',
  fontSize: 13.5, fontWeight: 700,
}
