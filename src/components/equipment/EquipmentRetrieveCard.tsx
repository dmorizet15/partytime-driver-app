'use client'

// ─── EquipmentRetrieveCard ───────────────────────────────────────────────────
// Equipment Return Tracking — pickup-side display. Shows what the delivery
// crew logged as left on-site ("Retrieve 3 extension cords", "Retrieve 1
// chair cart") on the linked delivery stop. Fully self-contained (the
// SameJobIndicator pattern): fetches GET /api/stops/equipment-returns —
// which resolves linked_stop_id with the reservation_id fallback server-side
// — and returns null when there's nothing to retrieve, so it can be dropped
// onto any pickup-stop surface without gating. Labels come from the shared
// rules config (equipmentReturns/rules.ts) so the two sides never drift.
//
// Styling mirrors SameJobIndicator's blue-tint treatment.

import { useEffect, useState } from 'react'
import { retrieveLabel } from '@/lib/equipmentReturns/rules'

const BLUE = '#1F46FF'

interface RetrieveRow {
  equipment_key: string
  quantity: number
}

interface EquipmentRetrieveCardProps {
  stopId: string
}

function BoxIcon({ size = 13, color = BLUE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/>
      <path d="M3 8l9 5 9-5"/>
      <path d="M12 13v8"/>
    </svg>
  )
}

export default function EquipmentRetrieveCard({ stopId }: EquipmentRetrieveCardProps) {
  const [rows, setRows] = useState<RetrieveRow[]>([])

  useEffect(() => {
    if (!stopId) { setRows([]); return }
    let cancelled = false
    fetch(`/api/stops/equipment-returns?stop_id=${encodeURIComponent(stopId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.returns)) setRows(json.returns as RetrieveRow[])
      })
      .catch((err) => {
        console.warn('[EquipmentRetrieveCard] fetch failed (non-fatal):', err instanceof Error ? err.message : err)
      })
    return () => { cancelled = true }
  }, [stopId])

  if (rows.length === 0) return null

  return (
    <div style={{
      background: 'rgba(31,70,255,0.10)',
      border: '1px solid rgba(31,70,255,0.30)',
      borderRadius: 12,
      padding: '10px 12px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: BLUE,
      }}>
        <BoxIcon size={13} color={BLUE} />
        Retrieve from this site
      </div>
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((r) => (
          <div key={r.equipment_key} style={{
            fontSize: 13, fontWeight: 700, color: BLUE, lineHeight: 1.35,
          }}>
            {retrieveLabel(r.equipment_key, r.quantity)}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: 'rgba(31,70,255,0.75)', lineHeight: 1.3 }}>
        Logged by the delivery crew when this order was dropped off
      </div>
    </div>
  )
}
