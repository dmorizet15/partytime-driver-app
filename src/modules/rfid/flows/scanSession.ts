// ─── ScanSession — multi-modal scan intake, framework-free ───────────────────
// One object owns "the gun is hot": RFID inventory via the HAL scanner,
// barcode + NFC via the native bridge events. Every hit is deduplicated and
// resolved against the replica BEFORE the UI sees it — components subscribe,
// they never touch the scanner or bridge directly.
//
// Dedupe policy (CLAUDE.md doctrine): the Android layer already drops same-EPC
// reads inside 500ms; the web layer keeps its own session-scoped Set as the
// second safety layer. 'session' mode = each identifier counts once per
// session (checkout flows); 'window' mode = only the time-window dedupe
// (Touch Scan, where re-scanning the same tag is the point).

import type { NativeBridge } from '../hal/bridge'
import type { RfidScanner } from '../hal/types'
import type { ItemReplica } from '../offline/replica'
import type { ReplicaItem } from '../offline/types'

export type ScanModality = 'rfid' | 'barcode' | 'nfc'

export interface ScanHit {
  modality: ScanModality
  /** EPC / barcode value / NFC UID — uppercased for rfid+nfc. */
  identifier: string
  /** Resolved replica item; null = identifier unknown to the replica. */
  item: ReplicaItem | null
  at: number
}

export type DedupeMode = 'session' | 'window'

export interface ScanSessionOptions {
  scanner: RfidScanner
  bridge: NativeBridge
  replica: ItemReplica
  onHit: (hit: ScanHit) => void
  dedupeMode?: DedupeMode
  dedupeWindowMs?: number
  now?: () => number
}

export class ScanSession {
  private readonly seen = new Set<string>()
  private readonly lastSeenAt = new Map<string, number>()
  private readonly subscriptions: Array<() => void> = []
  private rfidActive = false
  private rfidSubscribed = false
  private barcodeActive = false
  private nfcActive = false
  private disposed = false

  constructor(private readonly opts: ScanSessionOptions) {}

  // ── Modality control ───────────────────────────────────────────────────────

  async startRfid(): Promise<void> {
    this.assertLive()
    if (this.rfidActive) return
    // Power doctrine: the radio comes up only when scanning is wanted.
    // initialize() is idempotent per the HAL contract.
    await this.opts.scanner.initialize()
    // Subscribe ONCE per session: press-and-hold triggers start/stop many
    // times, and a per-start subscription would multiply every read.
    if (!this.rfidSubscribed) {
      this.rfidSubscribed = true
      this.subscriptions.push(
        this.opts.scanner.onTagRead((read) => void this.ingest('rfid', read.epc, read.timestamp)),
      )
    }
    await this.opts.scanner.startInventory()
    this.rfidActive = true
  }

  async stopRfid(): Promise<void> {
    if (!this.rfidActive) return
    await this.opts.scanner.stopInventory()
    this.rfidActive = false
  }

  private barcodeSubscribed = false

  startBarcode(): void {
    this.assertLive()
    if (this.barcodeActive) return
    if (!this.barcodeSubscribed) {
      this.barcodeSubscribed = true
      this.subscriptions.push(
        this.opts.bridge.on('barcode-scan', (d) => void this.ingest('barcode', d.value, d.timestamp)),
      )
    }
    this.opts.bridge.startBarcode()
    this.barcodeActive = true
  }

  stopBarcode(): void {
    if (!this.barcodeActive) return
    this.opts.bridge.stopBarcode()
    this.barcodeActive = false
  }

  private nfcSubscribed = false

  /** NFC foreground dispatch is armed ONLY while a screen wants taps (doctrine). */
  enableNfc(): void {
    this.assertLive()
    if (this.nfcActive) return
    if (!this.nfcSubscribed) {
      this.nfcSubscribed = true
      this.subscriptions.push(
        this.opts.bridge.on('nfc-scan', (d) => void this.ingest('nfc', d.uid, d.timestamp)),
      )
    }
    this.opts.bridge.enableNfc()
    this.nfcActive = true
  }

  disableNfc(): void {
    if (!this.nfcActive) return
    this.opts.bridge.disableNfc()
    this.nfcActive = false
  }

  /** Tear everything down. The session is single-use — build a new one per screen mount. */
  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const hadRfid = this.rfidActive
    await this.stopRfid()
    this.stopBarcode()
    this.disableNfc()
    this.subscriptions.forEach((off) => off())
    this.subscriptions.length = 0
    // Power doctrine: full power-down when the screen stops scanning (the XR2
    // module is power-hungry and release() is its only real off-switch).
    if (hadRfid) await this.opts.scanner.release()
  }

  get active(): { rfid: boolean; barcode: boolean; nfc: boolean } {
    return { rfid: this.rfidActive, barcode: this.barcodeActive, nfc: this.nfcActive }
  }

  // ── Intake ────────────────────────────────────────────────────────────────

  private async ingest(modality: ScanModality, rawIdentifier: string, at: number): Promise<void> {
    if (this.disposed) return
    const identifier = modality === 'barcode' ? rawIdentifier : rawIdentifier.toUpperCase()
    const key = `${modality}:${identifier}`
    const mode = this.opts.dedupeMode ?? 'session'
    const windowMs = this.opts.dedupeWindowMs ?? 500
    const now = this.opts.now?.() ?? Date.now()

    if (mode === 'session' && this.seen.has(key)) return
    const last = this.lastSeenAt.get(key)
    if (last !== undefined && now - last < windowMs) return
    this.seen.add(key)
    this.lastSeenAt.set(key, now)

    const item = await this.resolve(modality, identifier)
    if (this.disposed) return
    this.opts.onHit({ modality, identifier, item: item ?? null, at })
  }

  private resolve(modality: ScanModality, identifier: string): Promise<ReplicaItem | undefined> {
    switch (modality) {
      case 'rfid':
        return this.opts.replica.getByEpc(identifier)
      case 'barcode':
        return this.opts.replica.getByBarcode(identifier)
      case 'nfc':
        return this.opts.replica.getByNfcUid(identifier)
    }
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('ScanSession disposed — create a new session')
  }
}
