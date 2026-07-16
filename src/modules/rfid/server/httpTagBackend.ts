// ─── HttpTagBackend — the CLIENT-side TagBackendPort ─────────────────────────
// Browser code can't hold Easy RFID Pro credentials, so the client-side port
// implementation calls the module's own API routes (mounted by the host, see
// routeHandlers.ts) and maps transport/status failures onto TagBackendError
// kinds the write queue's retry policy understands.

import {
  TagBackendError,
  type ItemRecord,
  type ItemStatusWrite,
  type TagBackendPort,
  type TagBackendWriteResult,
} from '../ports/tagBackend'

export interface HttpTagBackendOptions {
  /** Route mount prefix in the host app. */
  basePath?: string
  fetchImpl?: typeof fetch
}

export class HttpTagBackend implements TagBackendPort {
  private readonly basePath: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: HttpTagBackendOptions = {}) {
    this.basePath = (opts.basePath ?? '/api/rfid-module').replace(/\/$/, '')
    // Wrap, don't store, the global: `this.fetchImpl(...)` would otherwise call
    // fetch with the class instance as receiver — an "Illegal invocation"
    // TypeError in real browsers (Node's fetch tolerates it, so only device
    // contact catches this; found live on the XR2 2026-07-16).
    this.fetchImpl = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  }

  async fetchAllItems(): Promise<ItemRecord[]> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.basePath}/items`, { cache: 'no-store' })
    } catch {
      throw new TagBackendError('items fetch failed (offline?)', 'network')
    }
    if (!res.ok) throw new TagBackendError(`items fetch returned ${res.status}`, this.kindFor(res.status))
    const body = (await res.json().catch(() => null)) as { items?: ItemRecord[] } | null
    if (!body?.items) throw new TagBackendError('items response malformed', 'rejected')
    return body.items
  }

  async writeItemStatuses(writes: ItemStatusWrite[]): Promise<TagBackendWriteResult> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.basePath}/status-writes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes }),
      })
    } catch {
      throw new TagBackendError('status write failed (offline?)', 'network')
    }
    const body = (await res.json().catch(() => null)) as TagBackendWriteResult | { error?: string } | null

    if (res.ok && body && 'ok' in body) return body
    if (res.status === 502 && body && 'ok' in body) return body // body-checked upstream rejection
    throw new TagBackendError(
      `status write returned ${res.status}${body && 'error' in body ? ` (${body.error})` : ''}`,
      this.kindFor(res.status),
    )
  }

  private kindFor(status: number): TagBackendError['kind'] {
    if (status === 403) return 'guard'
    if (status === 401 || status === 503) return 'auth'
    if (status >= 500) return 'network'
    return 'rejected'
  }
}
