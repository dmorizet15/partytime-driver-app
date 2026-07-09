'use client'

// Touch Scan — standalone RFID module surface, reachable from the Tools hub.
// Works fully offline (replica reads, queued writes). Host wiring only; all
// behavior lives in the module.

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RfidModuleProvider } from '@/modules/rfid'
import { TouchScanScreen } from '@/modules/rfid/screens/TouchScanScreen'
import { buildToolAdapters } from '@/lib/rfid/hostAdapters'

export default function TouchScanPage() {
  const router = useRouter()
  const adapters = useMemo(() => buildToolAdapters(() => router.push('/tools')), [router])
  return (
    <div style={{ minHeight: '100vh', background: '#FFF9EE' }}>
      <RfidModuleProvider adapters={adapters}>
        <TouchScanScreen onDone={() => router.push('/tools')} />
      </RfidModuleProvider>
    </div>
  )
}
