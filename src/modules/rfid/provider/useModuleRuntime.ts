'use client'

// ─── Module runtime — async composition of the offline core + hardware ──────
// Builds (once per provider mount) everything screens need: DB → replica →
// queue → sync engine, bridge → scanner, port implementations. Explicit
// wiring from the provider always wins (tests inject fakes); defaults follow
// the composition rules (windowRfidBridge, selectScanner, HttpTagBackend,
// TapGoodsOrderSystem — dry-run locked).

import { useEffect, useRef, useState } from 'react'
import { openRfidDb, type RfidDb } from '../offline/db'
import { ItemReplica } from '../offline/replica'
import { WriteQueue } from '../offline/writeQueue'
import { SyncEngine } from '../offline/syncEngine'
import { browserConnectivity, type ConnectivityPort } from '../offline/connectivity'
import { windowRfidBridge } from '../hal/windowRfidBridge'
import { selectScanner } from '../hal/deviceSelect'
import type { NativeBridge } from '../hal/bridge'
import type { RfidScanner } from '../hal/types'
import { HttpTagBackend } from '../server/httpTagBackend'
import { TapGoodsOrderSystem } from '../server/tapGoodsOrderSystem'
import type { OrderSystemPort } from '../ports/orderSystem'
import type { TagBackendPort } from '../ports/tagBackend'
import { useModuleWiring } from './RfidModuleProvider'

export interface ModuleRuntime {
  db: RfidDb
  replica: ItemReplica
  queue: WriteQueue
  syncEngine: SyncEngine
  connectivity: ConnectivityPort
  bridge: NativeBridge
  scanner: RfidScanner
  tagBackend: TagBackendPort
  orderSystem: OrderSystemPort
}

export type RuntimeState =
  | { status: 'starting' }
  | { status: 'ready'; runtime: ModuleRuntime }
  | { status: 'error'; message: string }

export function useModuleRuntime(): RuntimeState {
  const wiring = useModuleWiring()
  const [state, setState] = useState<RuntimeState>({ status: 'starting' })
  const runtimeRef = useRef<ModuleRuntime | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const db = await openRfidDb()
        const replica = new ItemReplica(db)
        const queue = new WriteQueue(db)
        await queue.recover()

        const bridge = wiring.bridge ?? windowRfidBridge()
        const scanner =
          wiring.scanner ??
          selectScanner({ bridge, isDevBuild: process.env.NODE_ENV !== 'production' })
        const tagBackend = wiring.tagBackend ?? new HttpTagBackend()
        const orderSystem =
          wiring.orderSystem ?? new TapGoodsOrderSystem({ auth: wiring.adapters.auth })
        const connectivity = browserConnectivity()
        const syncEngine = new SyncEngine(queue, connectivity, {
          tagBackend,
          orderSystem,
          replica,
        }).start()
        void syncEngine.kick() // opportunistic drain of anything left from last run

        const runtime: ModuleRuntime = {
          db,
          replica,
          queue,
          syncEngine,
          connectivity,
          bridge,
          scanner,
          tagBackend,
          orderSystem,
        }
        runtimeRef.current = runtime
        if (!cancelled) setState({ status: 'ready', runtime })
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      }
    })()
    return () => {
      cancelled = true
      runtimeRef.current?.syncEngine.stop()
      runtimeRef.current?.db.close()
      runtimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wiring is provider-stable by contract
  }, [])

  return state
}
