// ─── ConnectivityPort — how the offline core learns about the network ───────
// The sync engine and write queue consult THIS, never navigator.onLine
// directly, so tests toggle the network deterministically and a future host
// can substitute better signals (e.g. captive-portal-aware checks).

export interface ConnectivityPort {
  isOnline(): boolean
  /** Fires on every online/offline transition. Returns unsubscribe. */
  onChange(listener: (online: boolean) => void): () => void
}

/** Browser implementation over navigator.onLine + window events. */
export function browserConnectivity(): ConnectivityPort {
  return {
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    onChange: (listener) => {
      if (typeof window === 'undefined') return () => {}
      const onUp = () => listener(true)
      const onDown = () => listener(false)
      window.addEventListener('online', onUp)
      window.addEventListener('offline', onDown)
      return () => {
        window.removeEventListener('online', onUp)
        window.removeEventListener('offline', onDown)
      }
    },
  }
}

/** Test implementation — the harness's network toggle. */
export class FakeConnectivity implements ConnectivityPort {
  private online: boolean
  private listeners = new Set<(online: boolean) => void>()

  constructor(initiallyOnline = true) {
    this.online = initiallyOnline
  }

  isOnline(): boolean {
    return this.online
  }

  onChange(listener: (online: boolean) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setOnline(online: boolean): void {
    if (this.online === online) return
    this.online = online
    this.listeners.forEach((cb) => cb(online))
  }
}
