// @vitest-environment jsdom
// ─── Screen render tests — acceptance criteria 6/7 at the UI layer ──────────
// Mount the real screens inside <RfidModuleProvider> with the fake stack
// (MockScanner, ScriptedBridge, FakeTagBackend, RecordingOrderSystem) and
// drive them like a driver would under the CORRECTED scan model: choose the
// status first (pickup), press-and-hold the trigger, watch tags resolve the
// instant they land, Clear/commit the tray, hit a conflict, override, review
// the summary, complete, verify queue + dry-run.

import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RfidModuleProvider } from '../provider/RfidModuleProvider'
import { DeliveryCheckoutScreen } from '../screens/DeliveryCheckoutScreen'
import { PickupReturnScreen } from '../screens/PickupReturnScreen'
import { MockScanner } from '../testing/mockScanner'
import { ScriptedBridge } from '../testing/scriptedBridge'
import { FakeTagBackend } from '../testing/fakeTagBackend'
import { RecordingOrderSystem } from '../testing/recordingOrderSystem'
import { EPC, FIXTURE_CONTRACT, fixtureItems } from '../testing/fixtures'
import { openRfidDb } from '../offline/db'
import { ItemReplica } from '../offline/replica'
import type { GeoPoint, RfidModuleAdapters, StopContext } from '../adapters/types'

afterEach(cleanup)

const gps: GeoPoint = { lat: 35.05, lng: -85.31, capturedAt: 1 }

function stopContext(kind: 'delivery' | 'pickup'): StopContext {
  return {
    stopId: 'stop-1',
    kind,
    orderId: 'TG-100',
    contractNumber: FIXTURE_CONTRACT,
    clientName: 'Riverbend Events',
    expectedItems: [
      { lineId: '11', rentalClassId: 'RC-TENT-20X20', name: 'TENT 20X20 FRAME', quantity: 1 },
      { lineId: '12', rentalClassId: 'RC-LINEN-90RND', name: 'LINEN 90IN ROUND WHITE', quantity: 1 },
      // Non-RFID line: never scannable, completed manually.
      { lineId: null, rentalClassId: null, name: 'DANCE FLOOR 12X12', quantity: 2 },
    ],
  }
}

function adapters(kind: 'delivery' | 'pickup'): RfidModuleAdapters {
  const context = stopContext(kind) // stable identity, like the real host adapter
  return {
    stopContext: { getCurrentStop: () => context },
    identity: { getCurrentDriver: async () => ({ id: 'u-1', displayName: 'Test Driver' }) },
    auth: { getAccessToken: async () => null },
    location: { getCurrentPosition: async () => gps },
    navigation: { exitModule: () => {}, openMap: () => {} },
  }
}

/** Seed the module DB the runtime will open (same global fake-indexeddb). */
async function seedModuleDb() {
  const db = await openRfidDb()
  const replica = new ItemReplica(db)
  await replica.seedFromBackend(new FakeTagBackend(fixtureItems()))
  db.close()
}

function makeStack() {
  const scanner = new MockScanner()
  const bridge = new ScriptedBridge()
  const tagBackend = new FakeTagBackend(fixtureItems())
  const orderSystem = new RecordingOrderSystem()
  return { scanner, bridge, tagBackend, orderSystem }
}

/** Press-and-hold: pointer down, wait for the radio, run emissions, release. */
async function holdAndScan(scanner: MockScanner, emit: () => void) {
  const trigger = await screen.findByTestId('scan-trigger')
  fireEvent.pointerDown(trigger)
  await waitFor(() => expect(scanner.state.inventoryRunning).toBe(true))
  emit()
  fireEvent.pointerUp(trigger)
}

describe('DeliveryCheckoutScreen', () => {
  it('mass pull: hold accumulates, tags resolve instantly, commit checks off + interrupts on conflict, completes into the queue', async () => {
    await seedModuleDb()
    const stack = makeStack()

    render(
      <RfidModuleProvider adapters={adapters('delivery')} {...stack}>
        <DeliveryCheckoutScreen />
      </RfidModuleProvider>,
    )

    // Contract + client came from the adapter — rendered, never typed.
    await screen.findByText(/Riverbend Events/)
    screen.getByText(new RegExp(`Contract ${FIXTURE_CONTRACT}`))
    expect(screen.getByText('TENT 20X20 FRAME')).toBeTruthy()

    // The non-RFID line lives in the manual section, not the scan list.
    const manual = screen.getByTestId('manual-items')
    expect(manual.textContent).toContain('DANCE FLOOR 12X12')

    // Mass pull: hold the trigger, everything in range accumulates.
    fireEvent.click(screen.getByText('Mass scan'))
    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitTag(EPC.rentable)
      stack.scanner.emitTag(EPC.inWash)
      stack.scanner.emitDuplicates(EPC.rentable, 3) // burst collapses in the tray
    })
    await waitFor(() => expect(stack.scanner.state.inventoryRunning).toBe(false))

    // Instant resolution: names + current status visible BEFORE commit.
    const tray = await screen.findByTestId('scan-tray')
    await waitFor(() => {
      expect(tray.textContent).toContain('TENT 20X20 FRAME')
      expect(tray.textContent).toContain('currently Wash') // the linen's live status
      expect(tray.textContent).toContain('2 tag(s)')
    })

    // Commit → the washing linen raises the full-screen conflict.
    fireEvent.click(screen.getByText('Add 2 to delivery'))
    await screen.findByRole('alertdialog')
    screen.getByText(/BLOCKED — NOT RENTABLE/)
    // Two-tap override.
    fireEvent.click(screen.getByText('Override (send anyway)'))
    fireEvent.click(screen.getByText('Tap again to send it anyway'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    // Both scannable lines checked off; complete the manual line in bulk.
    expect(screen.getAllByText('1/1')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Bulk quantity for DANCE FLOOR 12X12'), {
      target: { value: '2' },
    })

    // Review → summary shows zero shorts; complete → done message.
    fireEvent.click(screen.getByText('Review & complete'))
    await screen.findByTestId('checkout-summary')
    fireEvent.click(screen.getByText('Confirm & write'))
    await screen.findByText(/Delivery recorded/)

    // The order completion was recorded (dry-run analog) with absolute quantities.
    await waitFor(() => expect(stack.orderSystem.deliveries).toHaveLength(1))
    expect(stack.orderSystem.deliveries[0].lines).toEqual([
      { lineId: '11', quantity: 1 },
      { lineId: '12', quantity: 1 },
      { lineId: null, quantity: 2 },
    ])
    // Status batch reached the backend via the sync engine kick (online default).
    await waitFor(() => expect(stack.tagBackend.appliedWrites).toHaveLength(1))
    expect(stack.tagBackend.appliedWrites[0].map((w) => w.epc).sort()).toEqual(
      [EPC.rentable, EPC.inWash].sort(),
    )
    expect(stack.tagBackend.appliedWrites[0].every((w) => w.status === 'Delivered')).toBe(true)
  })

  it('individual pull: first tag only, radio drops on capture, Clear discards and the same screen re-pulls', async () => {
    await seedModuleDb()
    const stack = makeStack()

    render(
      <RfidModuleProvider adapters={adapters('delivery')} {...stack}>
        <DeliveryCheckoutScreen />
      </RfidModuleProvider>,
    )
    await screen.findByText(/Riverbend Events/)

    // Individual is the default mode. Hold; the FIRST tag captures and the
    // radio drops immediately — later reads never land.
    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitTag(EPC.rentable)
    })
    const tray = await screen.findByTestId('scan-tray')
    await waitFor(() => expect(tray.textContent).toContain('TENT 20X20 FRAME'))
    expect(stack.scanner.state.inventoryRunning).toBe(false)
    expect(stack.scanner.emitTag(EPC.inWash)).toBe(false) // radio is off — first tag only

    // Clear discards the pull without recording anything.
    fireEvent.click(screen.getByText('Clear'))
    await waitFor(() => expect(screen.queryByTestId('scan-tray')).toBeNull())

    // Re-pull on the same screen (a different unit here; same-tag re-pull is
    // window-dedupe-bounded and covered in flows.test.ts).
    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitTag(EPC.qualityA)
    })
    await screen.findByTestId('scan-tray')
    fireEvent.click(screen.getByText('Add to delivery'))
    await waitFor(() => expect(screen.queryByTestId('scan-tray')).toBeNull())
    // The chair line isn't on this stop — it lands in the unexpected queue,
    // never force-matched.
    await screen.findByTestId('unexpected-queue')
  })
})

describe('PickupReturnScreen', () => {
  it('status is chosen BEFORE scanning: trigger gated, Wash reasons collected at arm time, scans stamped, unscanned items unwritten', async () => {
    await seedModuleDb()
    const stack = makeStack()

    render(
      <RfidModuleProvider adapters={adapters('pickup')} {...stack}>
        <PickupReturnScreen />
      </RfidModuleProvider>,
    )
    await screen.findByText(/Riverbend Events/)

    // No status armed → the trigger is disabled and says why.
    const trigger = await screen.findByTestId('scan-trigger')
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    screen.getByText('Choose a status first')

    // Arm Wash → the required-reason sheet opens BEFORE any scan.
    fireEvent.click(screen.getByRole('button', { name: 'Wash *' }))
    const dialog = await screen.findByRole('dialog', { name: 'Wash reasons' })
    expect(dialog).toBeTruthy()
    const apply = screen.getByText('Apply Wash') as HTMLButtonElement
    expect(apply.disabled).toBe(true) // no reason picked yet
    fireEvent.click(screen.getByRole('button', { name: 'Leaves' }))
    fireEvent.click(screen.getByText('Apply Wash'))
    await screen.findByTestId('armed-status')
    screen.getByText(/Armed: Wash — Leaves/)
    await waitFor(() => expect((screen.getByTestId('scan-trigger') as HTMLButtonElement).disabled).toBe(false))

    // Hold → first tag captures (individual default) → commit as Wash.
    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitTag(EPC.rentable) // the tent comes back dirty
    })
    await screen.findByTestId('scan-tray')
    fireEvent.click(screen.getByText('Commit as Wash'))
    await screen.findByTestId(`scanned-${EPC.rentable}`)
    screen.getByText(/→ Wash: Leaves/)

    // The linen is never scanned back — it must get NO write.
    fireEvent.click(screen.getByText('Review & complete'))
    await screen.findByTestId('checkout-summary')
    fireEvent.click(screen.getByText('Confirm & write'))
    await screen.findByText(/Pickup recorded/)

    await waitFor(() => expect(stack.orderSystem.pickups).toHaveLength(1))
    await waitFor(() => expect(stack.tagBackend.appliedWrites).toHaveLength(1))
    const batch = stack.tagBackend.appliedWrites[0]
    expect(batch).toHaveLength(1) // ONLY the scanned tent — no default status for the rest
    expect(batch[0]).toMatchObject({ epc: EPC.rentable, status: 'Wash', statusNotes: 'Wash: Leaves' })
    expect(batch[0].scannedBy).toBe('Test Driver')
  })
})
