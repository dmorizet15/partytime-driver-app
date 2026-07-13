// @vitest-environment jsdom
// ─── Touch Scan tests — acceptance criterion 8 ───────────────────────────────
// Corrected scan model: Individual = press-and-hold, FIRST tag only, Clear to
// re-pull; Mass = press-and-hold accumulate + Clear list; Status = arm the
// status FIRST, then accumulate, then commit. All modes return FULL item
// details from the replica the instant a tag lands, with the network dead
// (backend scripted to timeout on every call). Writes queue and survive the
// outage instead of being lost.

import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RfidModuleProvider } from '../provider/RfidModuleProvider'
import { TouchScanScreen } from '../screens/TouchScanScreen'
import { MockScanner } from '../testing/mockScanner'
import { ScriptedBridge } from '../testing/scriptedBridge'
import { FakeTagBackend } from '../testing/fakeTagBackend'
import { RecordingOrderSystem } from '../testing/recordingOrderSystem'
import { EPC, fixtureItems } from '../testing/fixtures'
import { openRfidDb } from '../offline/db'
import { ItemReplica } from '../offline/replica'
import { WriteQueue } from '../offline/writeQueue'
import type { RfidModuleAdapters } from '../adapters/types'

afterEach(cleanup)

const mapLaunches: Array<{ lat: number; lng: number }> = []

function toolAdapters(): RfidModuleAdapters {
  return {
    stopContext: { getCurrentStop: () => null }, // standalone — no stop
    identity: { getCurrentDriver: async () => ({ id: 'u-1', displayName: 'Test Driver' }) },
    auth: { getAccessToken: async () => null },
    location: { getCurrentPosition: async () => null },
    navigation: { exitModule: () => {}, openMap: (p) => mapLaunches.push(p) },
  }
}

async function seedModuleDb() {
  const db = await openRfidDb()
  const replica = new ItemReplica(db)
  await replica.seedFromBackend(new FakeTagBackend(fixtureItems()))
  db.close()
}

function deadNetworkStack() {
  const scanner = new MockScanner()
  const bridge = new ScriptedBridge()
  const tagBackend = new FakeTagBackend(fixtureItems())
  tagBackend.setDefaultOutcome('timeout') // the radio is off — every network call dies
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

describe('TouchScanScreen — offline', () => {
  it('Individual: hold captures the FIRST tag only, details resolve instantly, Clear re-pulls; edit queues, never lost', async () => {
    await seedModuleDb()
    const stack = deadNetworkStack()

    render(
      <RfidModuleProvider adapters={toolAdapters()} {...stack}>
        <TouchScanScreen />
      </RfidModuleProvider>,
    )

    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitTag(EPC.rentable)
    })
    await screen.findByTestId('item-detail')
    // Live-app default power for Individual is 15.
    expect(await stack.scanner.getOutputPower()).toBe(15)

    // FIRST tag only: capturing dropped the radio; nothing else can land.
    expect(stack.scanner.state.inventoryRunning).toBe(false)
    expect(stack.scanner.emitTag(EPC.inWash)).toBe(false)

    // Full detail set straight from the replica — zero network.
    screen.getByText('TENT 20X20 FRAME')
    screen.getByText('RC-TENT-20X20')
    fireEvent.click(screen.getByText('Additional details'))
    const details = await screen.findByTestId('additional-details')
    expect(details.textContent).toContain('SN-1001') // Serial #
    expect(details.textContent).toContain('C-3877') // Last Contract #
    expect(details.textContent).toContain('35.0456') // GPS Latitude
    fireEvent.click(screen.getByText('Launch Map'))
    expect(mapLaunches.at(-1)).toEqual({ lat: 35.0456, lng: -85.3097 })

    // Clear discards the pull and the same screen re-pulls immediately.
    // (Re-pull a unit no other test asserts on: the module DB is shared
    // across this file and local edits survive the reseed by design.)
    fireEvent.click(screen.getByText('Clear — pull again'))
    await waitFor(() => expect(screen.queryByTestId('item-detail')).toBeNull())
    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitTag(EPC.inRepair)
    })
    const redrawn = await screen.findByTestId('item-detail')
    expect(redrawn.textContent).toContain('TENT SIDEWALL 20FT')

    // Edit status → submit → rides the queue; drain fails (network dead) but
    // NOTHING is dropped: the badge shows it, the replica shows the overlay.
    fireEvent.change(screen.getByLabelText('Current status'), { target: { value: 'Staged' } })
    fireEvent.click(screen.getByText('Submit update'))
    await screen.findByText(/queued — they sync automatically/)
    await screen.findByTestId('unsynced-badge')

    const db = await openRfidDb()
    const queue = new WriteQueue(db)
    const entries = await queue.entries()
    expect(entries.length).toBeGreaterThanOrEqual(1)
    const replica = new ItemReplica(db)
    const item = await replica.getByEpc(EPC.inRepair)
    expect(item?.currentStatus).toBe('Staged') // local overlay immediate
    expect(item?.syncState).not.toBe('synced') // honest: NOT synced yet
    db.close()
  })

  it('Mass: hold accumulates a grid of Status/Quality/Bin/Common Name from the replica; row opens details; Clear resets', async () => {
    await seedModuleDb()
    const stack = deadNetworkStack()

    render(
      <RfidModuleProvider adapters={toolAdapters()} {...stack}>
        <TouchScanScreen initialMode="mass" />
      </RfidModuleProvider>,
    )

    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitBurst([EPC.rentable, EPC.inWash, EPC.qualityA])
      stack.scanner.emitDuplicates(EPC.rentable, 3) // duplicates collapse in the list
    })
    expect(await stack.scanner.getOutputPower()).toBe(25) // mass default

    await screen.findByTestId(`grid-row-${EPC.qualityA}`)
    const grid = screen.getByTestId('accumulated-grid')
    expect(grid.textContent).toContain('Wash') // status column
    expect(grid.textContent).toContain('W-BIN') // bin column
    expect(grid.textContent).toContain('LINEN 90IN ROUND WHITE')
    // Exactly 3 rows despite duplicate reads.
    expect(screen.getAllByTestId(/^grid-row-/)).toHaveLength(3)

    fireEvent.click(screen.getByTestId(`grid-row-${EPC.inWash}`))
    const detail = await screen.findByTestId('item-detail')
    expect(detail.textContent).toContain('LINEN 90IN ROUND WHITE')

    // Clear resets the accumulated list for the next sweep.
    fireEvent.click(screen.getByText('Clear list'))
    await waitFor(() => expect(screen.queryAllByTestId(/^grid-row-/)).toHaveLength(0))
  })

  it('Status: the status is armed BEFORE scanning (trigger gated), then commit batch-applies it through the queue', async () => {
    await seedModuleDb()
    const stack = deadNetworkStack()

    render(
      <RfidModuleProvider adapters={toolAdapters()} {...stack}>
        <TouchScanScreen initialMode="status" />
      </RfidModuleProvider>,
    )

    // No status armed → the trigger is disabled and says why.
    const trigger = await screen.findByTestId('scan-trigger')
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    screen.getByText('Choose a status first')

    fireEvent.click(screen.getByRole('button', { name: 'Staged' }))
    await screen.findByTestId('armed-status')
    await waitFor(() => expect((screen.getByTestId('scan-trigger') as HTMLButtonElement).disabled).toBe(false))

    await holdAndScan(stack.scanner, () => {
      stack.scanner.emitBurst([EPC.qualityA, EPC.qualityB])
    })
    await screen.findByTestId(`grid-row-${EPC.qualityB}`)

    fireEvent.click(screen.getByTestId('commit-status'))
    await screen.findByText(/2 update\(s\) queued/)

    const db = await openRfidDb()
    const replica = new ItemReplica(db)
    expect((await replica.getByEpc(EPC.qualityA))?.currentStatus).toBe('Staged')
    expect((await replica.getByEpc(EPC.qualityB))?.currentStatus).toBe('Staged')
    db.close()
  })
})
