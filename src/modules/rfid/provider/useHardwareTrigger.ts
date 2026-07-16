'use client'

// useHardwareTrigger — routes the device's physical trigger (XR2 side trigger,
// delivered as the bridge's `trigger-event`) into the SAME press-and-hold
// handlers the on-screen HOLD TO SCAN button uses, so first-tag-wins,
// status-gating, and mass-accumulate behave identically however the driver
// holds. Device-neutral: subscribes only when the selected scanner reports
// `capabilities.hardwareTrigger`; on any other device the hook is inert and
// the on-screen trigger stands alone.
//
// Returns a mutable handlers ref instead of taking callbacks: screens define
// scanStart/scanEnd AFTER their runtime early-returns, so they assign the ref
// each render (the usePendingPulls latest-value pattern) and the one
// subscription always sees the current handlers. On early-return renders the
// ref keeps its no-ops — correct, since there is no scan session yet.

import { useEffect, useRef, type MutableRefObject } from 'react'
import type { RfidScanner } from '../hal/types'

export interface TriggerHandlers {
  onPress: () => void
  onRelease: () => void
}

export function useHardwareTrigger(scanner: RfidScanner | null): MutableRefObject<TriggerHandlers> {
  const handlers = useRef<TriggerHandlers>({ onPress: () => {}, onRelease: () => {} })

  useEffect(() => {
    if (!scanner || !scanner.capabilities.hardwareTrigger) return
    return scanner.onTrigger((pressed) =>
      pressed ? handlers.current.onPress() : handlers.current.onRelease(),
    )
  }, [scanner])

  return handlers
}
