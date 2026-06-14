'use client'

import { useEffect } from 'react'

// Renders nothing — exists only to reload the offline page the moment the
// network returns, fulfilling the "will reload automatically when you
// reconnect" promise in the copy. Lives in its own client component so the
// page itself can stay a static server component (and keep its metadata export).
export default function ReloadOnReconnect() {
  useEffect(() => {
    const onOnline = () => window.location.reload()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  return null
}
