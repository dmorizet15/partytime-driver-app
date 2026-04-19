import { Stop } from '@/types'

// ─── Result shape ─────────────────────────────────────────────────────────────
export interface OTWResult {
  success: boolean
  sent_at?: string   // ISO timestamp on success
  error?: string     // error message on failure
}

// ─── Interface ────────────────────────────────────────────────────────────────
// Phase 2: replace StubNotificationService with TwilioNotificationService
// or a backend proxy endpoint — no screen components need to change.
export interface INotificationService {
  sendOnTheWayText(stop: Stop): Promise<OTWResult>
}

// ─── V1 Implementation — stub ─────────────────────────────────────────────────
export class StubNotificationService implements INotificationService {
  async sendOnTheWayText(stop: Stop): Promise<OTWResult> {
    // ── STUB ────────────────────────────────────────────────────────────────
    // Phase 2: POST to /api/notify/otw → Twilio SMS send
    // Body: { stop_id, customer_phone, customer_name, order_id }
    console.log('[NotificationService] STUB — would send OTW SMS')
    console.log('[NotificationService] To:', stop.customer_phone)
    console.log('[NotificationService] Customer:', stop.customer_name)

    // Simulate realistic network latency
    await new Promise((resolve) => setTimeout(resolve, 700))

    const sent_at = new Date().toISOString()
    console.log('[NotificationService] STUB success at:', sent_at)

    return { success: true, sent_at }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const notificationService: INotificationService = new StubNotificationService()
