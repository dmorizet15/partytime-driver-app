// ─── TapGoodsOrderSystem — OrderSystemPort, DRY-RUN LOCKED ───────────────────
// GUARDRAIL (session-binding, see CLAUDE.md): there is no TapGoods sandbox, so
// ZERO live TapGoods writes this session. Live mode requires BOTH:
//   1. env TAPGOODS_DRY_RUN === 'false'   (deliberate env change), AND
//   2. constructor { allowLive: true }     (deliberate code change at the
//      composition root)
// — one flag can never flip it accidentally. This session sets neither.
//
// The wire shape is the PROVEN driver-app write-back path (checkoff/service.ts):
//   POST {dashboard}/api/tapgoods/dispatch/write-back
//   Authorization: Bearer <host session token via AuthAdapter>
//   { stop_id, lines: [{ tapgoods_pick_list_item_id, qty }] }
// The status transition the legacy flow implies ('in_use' on delivery,
// 'checked_in' on pickup) is NOT part of that proven shape — it is carried in
// the logged dry-run record under `speculative`, clearly marked, never sent
// (docs/ASSUMPTIONS.md).

import type { AuthAdapter } from '../adapters/types'
import type {
  OrderSystemPort,
  OrderSystemResult,
  StopCompletionReport,
} from '../ports/orderSystem'

export interface TapGoodsOrderSystemOptions {
  auth: AuthAdapter
  /** Dashboard origin (host env NEXT_PUBLIC_DASHBOARD_URL). Only used in live mode. */
  dashboardUrl?: string
  /** env TAPGOODS_DRY_RUN — anything except the literal string 'false' means dry-run. */
  dryRunEnv?: string
  /** Second gate. Never true this session. */
  allowLive?: boolean
  fetchImpl?: typeof fetch
  /** Sink for dry-run payload logs (default console.info). */
  logSink?: (message: string, payload: unknown) => void
}

interface WriteBackPayload {
  stop_id: string
  lines: Array<{ tapgoods_pick_list_item_id: number | null; qty: number }>
}

export class TapGoodsOrderSystem implements OrderSystemPort {
  private readonly dryRun: boolean

  constructor(private readonly opts: TapGoodsOrderSystemOptions) {
    const envSaysLive = (opts.dryRunEnv ?? process.env.TAPGOODS_DRY_RUN) === 'false'
    const bothGatesOpen = envSaysLive && opts.allowLive === true
    this.dryRun = !bothGatesOpen
    if (envSaysLive && !bothGatesOpen) {
      console.warn(
        '[rfid][tapgoods] TAPGOODS_DRY_RUN=false but allowLive was not passed at the composition root — staying in DRY-RUN',
      )
    }
  }

  recordDeliveryCompletion(report: StopCompletionReport): Promise<OrderSystemResult> {
    return this.record(report, 'delivery', 'in_use')
  }

  recordPickupCompletion(report: StopCompletionReport): Promise<OrderSystemResult> {
    return this.record(report, 'pickup', 'checked_in')
  }

  private buildPayload(report: StopCompletionReport): WriteBackPayload {
    return {
      stop_id: report.stopId,
      lines: report.lines.map((l) => ({
        tapgoods_pick_list_item_id: l.lineId !== null ? Number(l.lineId) : null,
        qty: l.quantity,
      })),
    }
  }

  private async record(
    report: StopCompletionReport,
    kind: 'delivery' | 'pickup',
    speculativeStatus: string,
  ): Promise<OrderSystemResult> {
    const payload = this.buildPayload(report)
    const logged = {
      kind,
      wouldPost: '/api/tapgoods/dispatch/write-back',
      payload,
      completedAt: report.completedAt,
      gps: report.gps,
      speculative: {
        statusTransition: speculativeStatus,
        note: 'UI label only — real API value unverified, NEVER sent (docs/ASSUMPTIONS.md)',
      },
    }

    if (this.dryRun) {
      const log = this.opts.logSink ?? ((m: string, p: unknown) => console.info(m, JSON.stringify(p)))
      log(`[rfid][TAPGOODS DRY-RUN] ${kind} completion for stop ${report.stopId} — NOT SENT`, logged)
      return { ok: true, dryRun: true, payload: logged }
    }

    return this.sendLive(payload, logged)
  }

  /** Live path — unreachable this session (double gate). Kept honest for the merge session. */
  private async sendLive(payload: WriteBackPayload, logged: unknown): Promise<OrderSystemResult> {
    const origin = this.opts.dashboardUrl?.replace(/\/$/, '')
    if (!origin) return { ok: false, dryRun: false, reason: 'network', payload: logged }
    const token = await this.opts.auth.getAccessToken()
    if (!token) return { ok: false, dryRun: false, reason: 'auth', payload: logged }
    try {
      const res = await (this.opts.fetchImpl ?? fetch)(`${origin}/api/tapgoods/dispatch/write-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      if (res.status === 401 || res.status === 403) {
        return { ok: false, dryRun: false, reason: 'rejected:auth-ownership', payload: logged }
      }
      if (!res.ok) return { ok: false, dryRun: false, reason: 'network', payload: logged }
      const body = (await res.json().catch(() => null)) as { synced?: boolean; reason?: string } | null
      if (body?.synced === true) return { ok: true, dryRun: false, payload: logged }
      return { ok: false, dryRun: false, reason: body?.reason ?? 'network', payload: logged }
    } catch {
      return { ok: false, dryRun: false, reason: 'network', payload: logged }
    }
  }
}
