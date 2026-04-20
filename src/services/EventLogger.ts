import { WorkflowEvent, WorkflowEventType } from '@/types'

// ─── Interface ────────────────────────────────────────────────────────────────
// Phase 2: replace ConsoleEventLogger with an API-backed logger that
// POSTs to /api/events — no callers need to change.
export interface IEventLogger {
  log(event: WorkflowEvent): void
}

// ─── V1 Implementation — console stub ────────────────────────────────────────
export class ConsoleEventLogger implements IEventLogger {
  log(event: WorkflowEvent): void {
    console.log(
      `%c[EventLogger] ${event.event_type}`,
      'color: #2563eb; font-weight: bold',
      {
        route_id: event.route_id,
        stop_id: event.stop_id,
        order_id: event.order_id,
        actor: event.actor,
        timestamp: event.timestamp,
        details: event.details,
      }
    )
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const eventLogger: IEventLogger = new ConsoleEventLogger()

// ─── Helper ───────────────────────────────────────────────────────────────────
// Convenience wrapper — screens call logEvent(...) instead of
// constructing the full WorkflowEvent object manually.
export function logEvent(
  type: WorkflowEventType,
  routeId: string,
  stopId: string,
  orderId?: string,
  details?: Record<string, unknown>
): void {
  eventLogger.log({
    event_type: type,
    route_id: routeId,
    stop_id: stopId,
    order_id: orderId,
    actor: 'driver-v1', // Phase 2: replace with authenticated driver ID
    timestamp: new Date().toISOString(),
    details,
  })
}
