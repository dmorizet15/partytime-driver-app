'use client'

// usePendingPulls — the staging list between the hold-to-scan trigger and a
// commit. Individual mode captures the FIRST tag only (the screen stops the
// radio via onIndividualCapture and the driver Clears to re-pull); mass mode
// accumulates every distinct tag read while the trigger is held. Hits are
// deduplicated against the tray and against the screen-supplied reject
// predicate (already-committed units), never against time — the ScanSession
// window dedupe handles read bursts.

import { useCallback, useRef, useState } from 'react'
import type { ScanHit } from '../flows/scanSession'

export interface PendingPullsApi {
  pending: ScanHit[]
  /** Wire as the ScanSession onHit. */
  capture: (hit: ScanHit) => void
  /** Discard the tray (Clear button). */
  clear: () => void
  /** Empty the tray and return its contents (commit path). */
  drain: () => ScanHit[]
}

export function usePendingPulls(opts: {
  mode: 'individual' | 'mass'
  /** Return true to drop a hit (e.g. its unit is already committed to the flow). */
  reject?: (hit: ScanHit) => boolean
  /** Individual mode: fired on each capture — screens stop the radio here (idempotent). */
  onIndividualCapture?: () => void
}): PendingPullsApi {
  const [pending, setPending] = useState<ScanHit[]>([])
  const pendingRef = useRef<ScanHit[]>(pending)
  const optsRef = useRef(opts)
  optsRef.current = opts

  const capture = useCallback((hit: ScanHit) => {
    const { mode, reject, onIndividualCapture } = optsRef.current
    if (reject?.(hit)) return
    const prev = pendingRef.current
    if (mode === 'individual' && prev.length >= 1) return // first tag only
    if (prev.some((p) => p.identifier === hit.identifier)) return
    if (hit.item && prev.some((p) => p.item?.epc === hit.item?.epc)) return // same unit via another modality
    pendingRef.current = [...prev, hit]
    setPending(pendingRef.current)
    if (mode === 'individual') onIndividualCapture?.()
  }, [])

  const clear = useCallback(() => {
    pendingRef.current = []
    setPending([])
  }, [])

  const drain = useCallback(() => {
    const drained = pendingRef.current
    pendingRef.current = []
    setPending([])
    return drained
  }, [])

  return { pending, capture, clear, drain }
}
