// @vitest-environment jsdom
// ─── Screen render tests — acceptance criteria 6/7 at the UI layer ──────────
// Mount the real screens inside <RfidModuleProvider> with the fake stack
// (MockScanner, ScriptedBridge, FakeTagBackend, RecordingOrderSystem) and
// drive them like a driver would: toggle scanning, emit reads, hit a
// conflict, override, review the summary, complete, verify queue + dry-run.

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

describe('DeliveryCheckoutScreen', () => {
  it('renders from stop context, checks off scans, interrupts on conflict, completes into the queue', async () => {
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

    // Start RFID and scan the expected tent.
    fireEvent.click(await screen.findByText('RFID scan'))
    await waitFor(() => expect(stack.scanner.state.inventoryRunning).toBe(true))
    stack.scanner.emitTag(EPC.rentable)
    await screen.findByText('1/1')

    // Scan the linen that is sitting in Wash → full-screen conflict.
    stack.scanner.emitTag(EPC.inWash)
    await screen.findByRole('alertdialog')
    screen.getByText(/BLOCKED — NOT RENTABLE/)
    // Two-tap override.
    fireEvent.click(screen.getByText('Override (send anyway)'))
    fireEvent.click(screen.getByText('Tap again to send it anyway'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

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
    ])
    // Status batch reached the backend via the sync engine kick (online default).
    await waitFor(() => expect(stack.tagBackend.appliedWrites).toHaveLength(1))
    expect(stack.tagBackend.appliedWrites[0].map((w) => w.epc).sort()).toEqual(
      [EPC.rentable, EPC.inWash].sort(),
    )
  })
})

describe('PickupReturnScreen', () => {
  it('scans items back, flags Wash with required reasons via DamageDetailForm, batch summary completes', async () => {
    await seedModuleDb()
    const stack = makeStack()

    render(
      <RfidModuleProvider adapters={adapters('pickup')} {...stack}>
        <PickupReturnScreen />
      </RfidModuleProvider>,
    )
    await screen.findByText(/Riverbend Events/)

    fireEvent.click(await screen.findByText('RFID scan'))
    await waitFor(() => expect(stack.scanner.state.inventoryRunning).toBe(true))
    stack.scanner.emitTag(EPC.rentable) // tent comes back
    await screen.findByTestId(`scanned-${EPC.rentable}`)

    // Flag → status picker → Wash → reason form (required) → apply.
    fireEvent.click(screen.getByText('Flag'))
    fireEvent.click(await screen.findByText(/^Wash — reasons required$/))
    const dialog = await screen.findByRole('dialog', { name: 'Wash reasons' })
    expect(dialog).toBeTruthy()
    // Apply is disabled until a reason is picked.
    const apply = screen.getByText('Apply Wash') as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Leaves' }))
    expect((screen.getByText('Apply Wash') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByText('Apply Wash'))
    await screen.findByText(/→ Wash: Leaves/)

    fireEvent.click(screen.getByText('Review & complete'))
    await screen.findByTestId('checkout-summary')
    fireEvent.click(screen.getByText('Confirm & write'))
    await screen.findByText(/Pickup recorded/)

    await waitFor(() => expect(stack.orderSystem.pickups).toHaveLength(1))
    await waitFor(() => expect(stack.tagBackend.appliedWrites).toHaveLength(1))
    const write = stack.tagBackend.appliedWrites[0].find((w) => w.epc === EPC.rentable)
    expect(write).toMatchObject({ status: 'Wash', statusNotes: 'Wash: Leaves' })
    expect(write?.scannedBy).toBe('Test Driver')
  })
})
