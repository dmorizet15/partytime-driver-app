'use client'

import { useEffect, useState } from 'react'
import { isStandalone, INSTALL_PROMPTED_KEY, LAST_SEEN_VERSION_KEY } from '@/lib/pwa'
import { VERSION } from '@/lib/appVersion'
import ReinstallBanner from './ReinstallBanner'
import WhatsNewSheet from './WhatsNewSheet'

// ─── Home-screen PWA prompts coordinator (Features 1 + 3) ────────────────────
// Owns the single decision point for the two coupled prompts so they can never
// race or stack:
//   • Re-install banner (Feature 1) shows when NOT standalone and not yet
//     dismissed (ptr_install_prompted).
//   • What's New sheet (Feature 3) shows on a VERSION mismatch — but is
//     suppressed this session if the re-install banner is showing (per spec:
//     check What's New AFTER the re-install banner; don't stack them).
//
// All localStorage reads happen here once in a mount effect (client-only, so no
// hydration mismatch). Each child persists its own acknowledgement on close.
export default function PwaHomePrompts() {
  const [showReinstall, setShowReinstall] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  useEffect(() => {
    let reinstall = false
    let whatsNew = false
    try {
      reinstall = !isStandalone() && localStorage.getItem(INSTALL_PROMPTED_KEY) !== 'true'
      const versionMismatch = localStorage.getItem(LAST_SEEN_VERSION_KEY) !== VERSION
      // Suppress What's New while the re-install banner is up — show it next open.
      whatsNew = versionMismatch && !reinstall
    } catch {
      // localStorage blocked (private mode) — show nothing rather than risk a loop.
    }
    setShowReinstall(reinstall)
    setShowWhatsNew(whatsNew)
  }, [])

  return (
    <>
      {showReinstall && <ReinstallBanner onDismiss={() => setShowReinstall(false)} />}
      {showWhatsNew && <WhatsNewSheet onClose={() => setShowWhatsNew(false)} />}
    </>
  )
}
