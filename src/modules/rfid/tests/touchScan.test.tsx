// @vitest-environment jsdom
// ─── Touch Scan tests — acceptance criterion 8 ───────────────────────────────
// Individual and Mass modes return FULL item details from the replica with the
// network dead (backend scripted to timeout on every call). Writes queue and
// survive the outage instead of being lost.

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

describe('TouchScanScreen — offline', () => {
  it('Individual: full details from the replica with the network dead; edit queues, never lost', async () => {
    await seedModuleDb()
    const stack = deadNetworkStack()

    render(
      <RfidModuleProvider adapters={toolAdapters()} {...stack}>
        <TouchScanScreen />
      </RfidModuleProvider>,
    )

    fireEvent.click(await screen.findByText('RFID scan'))
    await waitFor(() => expect(stack.scanner.state.inventoryRunning).toBe(true))
    // Live-app default power for Individual is 15.
    expect(await stack.scanner.getOutputPower()).toBe(15)

    stack.scanner.emitTag(EPC.rentable)
    await screen.findByTestId('item-detail')

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
    const item = await replica.getByEpc(EPC.rentable)
    expect(item?.currentStatus).toBe('Staged') // local overlay immediate
    expect(item?.syncState).not.toBe('synced') // honest: NOT synced yet
    db.close()
  })

  it('Mass: accumulates a grid of Status/Quality/Bin/Common Name from the replica, row opens details', async () => {
    await seedModuleDb()
    const stack = deadNetworkStack()

    render(
      <RfidModuleProvider adapters={toolAdapters()} {...stack}>
        <TouchScanScreen initialMode="mass" />
      </RfidModuleProvider>,
    )

    fireEvent.click(await screen.findByText('RFID scan'))
    await waitFor(() => expect(stack.scanner.state.inventoryRunning).toBe(true))
    expect(await stack.scanner.getOutputPower()).toBe(25) // mass default

    stack.scanner.emitBurst([EPC.rentable, EPC.inWash, EPC.qualityA])
    stack.scanner.emitDuplicates(EPC.rentable, 3) // duplicates collapse in the list

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
  })

  it('Status: batch-applies a status to all recognized tags through the queue', async () => {
    await seedModuleDb()
    const stack = deadNetworkStack()

    render(
      <RfidModuleProvider adapters={toolAdapters()} {...stack}>
        <TouchScanScreen initialMode="status" />
      </RfidModuleProvider>,
    )

    fireEvent.click(await screen.findByText('RFID scan'))
    await waitFor(() => expect(stack.scanner.state.inventoryRunning).toBe(true))
    stack.scanner.emitBurst([EPC.qualityA, EPC.qualityB])
    await screen.findByTestId(`grid-row-${EPC.qualityB}`)

    fireEvent.click(screen.getByRole('button', { name: 'Staged' }))
    await screen.findByText(/2 update\(s\) queued/)

    const db = await openRfidDb()
    const replica = new ItemReplica(db)
    expect((await replica.getByEpc(EPC.qualityA))?.currentStatus).toBe('Staged')
    expect((await replica.getByEpc(EPC.qualityB))?.currentStatus).toBe('Staged')
    db.close()
  })
})
