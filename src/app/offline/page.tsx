import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline · PTR Work',
}

// Static fallback served by the service worker when a page navigation fails
// with no network. Kept fully static (no data, no client hooks) so it can be
// precached and rendered with zero connectivity.
export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
        background: '#000000',
        color: '#FFFFFF',
        fontFamily: 'var(--font-inter), Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 1, color: '#FFB800' }}>
        You&rsquo;re offline
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 320, opacity: 0.85 }}>
        No connection right now. Your route and stop data need the network — reconnect
        and this screen will reload automatically.
      </p>
      <p style={{ fontSize: 13, opacity: 0.5, marginTop: 8 }}>PTR Work</p>
    </div>
  )
}
