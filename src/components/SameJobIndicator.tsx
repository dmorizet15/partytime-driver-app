'use client'

// ─── SameJobIndicator ────────────────────────────────────────────────────────
// Next Day Route Preview — Session 3. A compact "N trucks on this job" chip
// shown when a job (TapGoods reservation) is split across multiple trucks/routes
// on the same day. Tap → bottom sheet listing each sibling truck/driver. Fully
// self-contained: returns null when reservation_id is null or no siblings exist.
//
// Data comes from GET /api/stops/same-job (service-role — sibling crew/truck
// reads are RLS-gated to the caller's own routes, so a direct client query would
// return empty crew). reservation_id is never null on real delivery/pickup rows
// (verified live: 0/848), but the component still hard-returns null on null.

import { useEffect, useState } from 'react'

const BLUE = '#1F46FF'
const GOLD = '#FFB800'

interface Sibling {
  route_id: string
  route_number: number | null
  driver_name: string | null
  co_driver_name: string | null
  truck_name: string | null
}

interface SameJobIndicatorProps {
  reservation_id: string | null
  route_date: string
  current_route_id: string
}

function TruckIcon({ size = 13, color = BLUE }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h11v9H3z"/>
      <path d="M14 10h4l3 3v3h-7z"/>
      <circle cx="7.5" cy="17.5" r="1.8"/>
      <circle cx="17" cy="17.5" r="1.8"/>
    </svg>
  )
}

export default function SameJobIndicator({
  reservation_id, route_date, current_route_id,
}: SameJobIndicatorProps) {
  const [siblings, setSiblings] = useState<Sibling[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!reservation_id) { setSiblings([]); return }
    let cancelled = false
    const qs = new URLSearchParams({
      reservation_id,
      date: route_date,
      exclude_route_id: current_route_id,
    })
    fetch(`/api/stops/same-job?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.siblings)) setSiblings(json.siblings as Sibling[])
      })
      .catch((err) => {
        console.warn('[SameJobIndicator] fetch failed (non-fatal):', err instanceof Error ? err.message : err)
      })
    return () => { cancelled = true }
  }, [reservation_id, route_date, current_route_id])

  // Hard guards — null reservation OR no other trucks on this job.
  if (!reservation_id) return null
  if (siblings.length === 0) return null

  const n = siblings.length + 1 // siblings + this truck

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-label={`${n} trucks on this job — view details`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(31,70,255,0.10)', border: `1px solid rgba(31,70,255,0.30)`,
          color: BLUE, borderRadius: 999, padding: '4px 10px',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.02em', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <TruckIcon size={13} color={BLUE} />
        {n} trucks on this job
      </button>

      {open && (
        <div
          role="dialog" aria-modal="true" aria-label="Trucks on this job"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 448, background: '#0F172A', color: '#fff',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: '16px 22px calc(22px + env(safe-area-inset-bottom))',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ width: 44, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 14px' }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span aria-hidden="true" style={{
                width: 30, height: 30, borderRadius: 8, background: BLUE,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <TruckIcon size={16} color="#fff" />
              </span>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{n} trucks on this job</div>
              <button
                type="button" onClick={() => setOpen(false)} aria-label="Close"
                style={{
                  marginLeft: 'auto', background: 'transparent', border: 0, color: '#94A3B8',
                  fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4,
                }}
              >×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {siblings.map((s) => (
                <div key={s.route_id} style={{
                  background: '#1E293B', borderRadius: 12, padding: '11px 14px',
                  fontSize: 14, lineHeight: 1.4,
                }}>
                  <div style={{ fontWeight: 800, color: '#fff' }}>
                    {s.route_number != null ? `Route ${s.route_number}` : 'Route'}
                    {s.driver_name && <span style={{ fontWeight: 600, color: '#CBD5E1' }}> · {s.driver_name}</span>}
                  </div>
                  <div style={{ marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {s.truck_name && (
                      <span style={{
                        background: 'rgba(255,184,0,0.16)', color: GOLD, border: '1px solid rgba(255,184,0,0.4)',
                        borderRadius: 999, padding: '2px 9px', fontSize: 10.5, fontWeight: 800,
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>{s.truck_name}</span>
                    )}
                    {s.co_driver_name && (
                      <span style={{ fontSize: 12, color: '#94A3B8', alignSelf: 'center' }}>
                        Co-driver: {s.co_driver_name}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
