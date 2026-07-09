# RFID Module — Boundary Contract

Self-contained multi-modal scanning module (RFID / barcode / NFC): offline-first
replica + write queue, hardware abstraction layer, delivery checkout, pickup
return, touch scan. Built inside `partytime-driver-app` but designed for
extraction as a standalone product — the scanning engine and flows are
customer-agnostic; only the injected edges know they're in PartyTime.

## The extraction test

**A fresh app adopts this module by writing adapter implementations, mounting
the exported API route handlers, and setting env config — with ZERO changes to
module code.** If a change ever requires more than that, the boundary is wrong:
widen an adapter interface, don't import around it.

## The boundary, precisely

1. **Module code never imports from host internals.** No `@/lib/*`, `@/context/*`,
   `@/components/*`, etc. Allowed imports inside `src/modules/rfid/`: relative
   paths within the module, `react`, and type-only Next.js plumbing where a
   route handler signature requires it. Enforced by `tests/boundary.test.ts` —
   a violation is a red suite.
2. **The host imports from the module** (`@/modules/rfid` or its `adapters` /
   `ports` / `hal` barrels) — never the reverse, and never from deeper paths.
3. **App data crosses only through injected adapters** (`adapters/types.ts`):
   - `StopContextAdapter` — current stop, order/contract number, client name,
     expected item list. This is what makes manual Contract # / Client Name
     entry unnecessary.
   - `IdentityAdapter` — signed-in driver (id + display name). Kills the
     `'ptr-driver'` placeholder.
   - `AuthAdapter` — bearer token supply for host-mediated calls. Deliberately
     separate from identity: the two concerns only coincide in PartyTime.
   - `LocationAdapter` — GPS, resolve-null-never-reject.
   - `NavigationAdapter` — exit + external-map callbacks; the module never
     touches the host router.
   - `ThemeAdapter` — host-injected design tokens so the module looks native
     without importing the host's Tailwind config or duplicating its values
     (duplication guarantees drift). Ships a brand-neutral default only.
4. **Vendor systems sit behind ports** (`ports/`):
   - `TagBackendPort` — the tag/item system of record. Implementation:
     `EasyRfidProBackend` (sandbox-guarded per session guardrails). Test fake:
     `FakeTagBackend`.
   - `OrderSystemPort` — order management. Implementation:
     `TapGoodsOrderSystem` (**dry-run only this session** — `TAPGOODS_DRY_RUN`
     defaults true). Test fake: `RecordingOrderSystem`.
   Business logic depends on the ports only; vendor names appear in
   implementation files and the composition root, nowhere else.
5. **Hardware sits behind the HAL** (`hal/types.ts` — `RfidScanner`), and the
   HAL's device implementations sit behind a device-NEUTRAL transport
   (`hal/bridge.ts` — `NativeBridge`). The bridge is not XR2-shaped: Xr2Scanner
   consumes it today; a C72 native wrapper implements the same events/calls and
   `C72Scanner` consumes it unchanged. Exactly one file may read
   `window.rfidBridge` (the window-backed `NativeBridge` implementation);
   everything else receives the bridge via `<RfidModuleProvider>`.
6. **Composition happens in one place**: `provider/RfidModuleProvider.tsx`.
   Host wiring in, hooks out. Tests inject fakes through the same props.

## What a fresh app writes (nothing else)

| Piece | Size | Why it exists |
|---|---|---|
| 6 adapter implementations | ~a screen of code each | app data / look & feel |
| API route mount stubs | ~5 one-line re-exports | Next.js requires routes in the host `app/` dir; credentials are server-side |
| Env config | `.env` entries | `EASY_RFID_BASE_URL` (+ credentials), `TAPGOODS_DRY_RUN`, flags |
| Render the entry components | a few lines | mount `<RfidModuleProvider>` + screens |

## Layout

```
adapters/   host adapter interfaces + shared value types (the contract)
ports/      vendor-neutral backend ports (TagBackendPort, OrderSystemPort)
hal/        scanner HAL (RfidScanner) + native transport (NativeBridge)
provider/   RfidModuleProvider — composition root, use* hooks
offline/    replica, sync-state, durable write queue        (Task 4)
server/     port implementations + exported route handlers  (Tasks 3–6)
screens/    delivery checkout, pickup return, touch scan    (Tasks 6–8)
components/ module-owned UI                                 (Tasks 6–8)
testing/    MockScanner, fixtures, fakes, network toggle    (Task 3)
tests/      boundary test + suites                          (Task 3+)
```

Session guardrails (binding): see "RFID Session Guardrails" in the repo-root
`CLAUDE.md`. Unknowns go to `docs/ASSUMPTIONS.md`, never guessed.
