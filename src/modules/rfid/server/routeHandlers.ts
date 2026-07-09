// ─── Exported API route handlers — the host mounts these ────────────────────
// Next.js requires route files to live in the host's app/ directory; the
// module can't own them in place. So the module exports web-standard
// (Request → Response) handlers and the host mounts each with a one-line
// re-export file, e.g.:
//
//   // src/app/api/rfid-module/items/route.ts
//   export { rfidItemsGET as GET } from '@/modules/rfid'
//
// These use plain Request/Response (no next/server import) so the module
// stays framework-portable and boundary-clean.

import { TagBackendError, type ItemStatusWrite } from '../ports/tagBackend'
import { EasyRfidProBackend } from './easyRfidProBackend'

function errorResponse(err: unknown): Response {
  if (err instanceof TagBackendError) {
    const status =
      err.kind === 'guard' ? 403 : err.kind === 'auth' ? 503 : err.kind === 'rejected' ? 502 : 502
    return Response.json({ error: err.kind, message: err.message }, { status })
  }
  return Response.json({ error: 'internal', message: 'unexpected failure' }, { status: 500 })
}

export interface RfidRouteHandlers {
  /** GET — full Item Master for replica seeding. */
  itemsGET: (req: Request) => Promise<Response>
  /** POST { writes: ItemStatusWrite[] } — batched status upsert (body-checked). */
  statusWritesPOST: (req: Request) => Promise<Response>
}

export function createRfidRouteHandlers(
  backend: EasyRfidProBackend = new EasyRfidProBackend(),
): RfidRouteHandlers {
  return {
    async itemsGET(): Promise<Response> {
      try {
        const items = await backend.fetchAllItems()
        return Response.json({ items, count: items.length })
      } catch (err) {
        return errorResponse(err)
      }
    },

    async statusWritesPOST(req: Request): Promise<Response> {
      try {
        const body = (await req.json().catch(() => null)) as { writes?: ItemStatusWrite[] } | null
        if (!body?.writes?.length) {
          return Response.json({ error: 'bad_request', message: 'writes[] required' }, { status: 400 })
        }
        const result = await backend.writeItemStatuses(body.writes)
        // The upstream can fail inside an HTTP 200 — reflect the body-checked
        // truth in OUR status code so clients can't mistake it.
        return Response.json(result, { status: result.ok ? 200 : 502 })
      } catch (err) {
        return errorResponse(err)
      }
    },
  }
}
