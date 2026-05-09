'use client'

import { useEffect, useReducer } from 'react'
import { useRouter }             from 'next/navigation'
import { useAppState }           from '@/context/AppStateContext'

interface InspectionScreenProps {
  routeId: string
}

// ─── Domain types ────────────────────────────────────────────────────────────

export type FlowStep =
  | 'loading'           // Screen 1 transit — resolving truck + previous DVIR
  | 'never_prompt'      // Screen 1 UI variant — dvir_requirement === 'never'
  | 'review_clean'      // Screen 2 — prior inspection exists, no open defects
  | 'review_defects'    // Screen 3 — prior inspection exists, has open defects
  | 'towing'            // Screen 4 — only for 'when_towing' trucks
  | 'checklist'         // Screen 5 — 11 federal + 1 conditional trailer
  | 'sign_submit'       // Screen 6 — summary + certify checkbox + submit
  | 'complete'          // Screen 7 — terminal; sub-render by submitResult.outcome

export type DvirRequirement = 'always' | 'when_towing' | 'never'

export type CategoryKey =
  | 'service_brakes'
  | 'trailer_brake_connections'   // only included when towing
  | 'parking_brake'
  | 'steering_mechanism'
  | 'lighting_devices'
  | 'tires'
  | 'horn'
  | 'windshield_wipers'
  | 'rear_vision_mirrors'
  | 'coupling_devices'             // only included when towing
  | 'wheels_and_rims'
  | 'emergency_equipment'

export const ALL_CATEGORIES: CategoryKey[] = [
  'service_brakes',
  'trailer_brake_connections',
  'parking_brake',
  'steering_mechanism',
  'lighting_devices',
  'tires',
  'horn',
  'windshield_wipers',
  'rear_vision_mirrors',
  'coupling_devices',
  'wheels_and_rims',
  'emergency_equipment',
]

// Trailer-conditional categories. Hidden in Screen 5 + omitted from submit
// payload when towingTrailer === false.
export const TRAILER_CATEGORIES: ReadonlySet<CategoryKey> = new Set<CategoryKey>([
  'trailer_brake_connections',
  'coupling_devices',
])

// OOS-default set per brief: "OOS default for: service brakes, steering, tires
// (flat/separated), coupling devices (if towing). Non-OOS default for: all
// others." trailer_brake_connections defaults non_oos per literal reading;
// driver overrides via the prompt if disconnect/leak.
export const OOS_DEFAULT_CATEGORIES: ReadonlySet<CategoryKey> = new Set<CategoryKey>([
  'service_brakes',
  'steering_mechanism',
  'tires',
  'coupling_devices',
])

// CFR section refs for each category, surfaced on Screen 5 row labels per
// emergent feature E3 (Design Decisions Locked, May 8 2026).
export const CFR_SECTIONS: Record<CategoryKey, string> = {
  service_brakes:             '§396.11(1)',
  trailer_brake_connections:  '§396.11(1)',
  parking_brake:              '§396.11(2)',
  steering_mechanism:         '§396.11(3)',
  lighting_devices:           '§396.11(4)',
  tires:                      '§396.11(5)',
  horn:                       '§396.11(6)',
  windshield_wipers:          '§396.11(7)',
  rear_vision_mirrors:        '§396.11(8)',
  coupling_devices:           '§396.11(9)',
  wheels_and_rims:            '§396.11(10)',
  emergency_equipment:        '§396.11(11)',
}

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  service_brakes:             'Service brakes',
  trailer_brake_connections:  'Trailer brake connections',
  parking_brake:              'Parking brake',
  steering_mechanism:         'Steering mechanism',
  lighting_devices:           'Lighting devices and reflectors',
  tires:                      'Tires',
  horn:                       'Horn',
  windshield_wipers:          'Windshield wipers',
  rear_vision_mirrors:        'Rear-vision mirrors',
  coupling_devices:           'Coupling devices',
  wheels_and_rims:            'Wheels and rims',
  emergency_equipment:        'Emergency equipment',
}

export type ChecklistItem =
  | { state: 'pass' }                                                          // default
  | { state: 'fail_pending_severity' }                                         // tapped Fail, awaiting severity
  | { state: 'fail'; severity: 'oos' | 'non_oos'; description: string }        // resolved

export interface OpenDefect {
  id:          string
  category:    string
  severity:    'oos' | 'non_oos'
  description: string
}

export interface PreviousInspection {
  id:               string
  inspection_date:  string
  has_open_defects: boolean
  open_defects:     OpenDefect[]
}

export interface InspectionForm {
  // Resolved on entry (read-only after loading)
  routeId:            string
  truckId:            string | null
  truckName:          string | null
  dvirRequirement:    DvirRequirement | null
  previousInspection: PreviousInspection | null

  // Step inputs
  previousDvirAcknowledged: boolean
  defectAcknowledgments:    Set<string>
  towingTrailer:            boolean | null
  checklist:                Record<CategoryKey, ChecklistItem>
  signed:                   boolean

  // Submit lifecycle
  submitting:    boolean
  submitError:   string | null
  submitResult:  { id: string; outcome: 'clear' | 'non_oos' | 'oos' } | null
}

interface State {
  step:      FlowStep
  form:      InspectionForm
  loadError: string | null
}

type Action =
  | { type: 'SET_LOADING_RESULT'
      payload: {
        truckId:            string
        truckName:          string
        dvirRequirement:    DvirRequirement
        previousInspection: PreviousInspection | null
      } }
  | { type: 'SET_LOADING_ERROR';   payload: { error: string } }
  | { type: 'GO_TO';               payload: { step: FlowStep } }
  | { type: 'ACK_PREVIOUS_DVIR' }
  | { type: 'TOGGLE_DEFECT_ACK';   payload: { defectId: string } }
  | { type: 'SET_TOWING';          payload: { towing: boolean } }
  | { type: 'SET_CHECKLIST_ITEM';  payload: { category: CategoryKey; item: ChecklistItem } }
  | { type: 'SET_SIGNED';          payload: { signed: boolean } }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS';      payload: { id: string; outcome: 'clear' | 'non_oos' | 'oos' } }
  | { type: 'SUBMIT_ERROR';        payload: { error: string } }

// ─── Initial state + reducer ──────────────────────────────────────────────────

function buildInitialChecklist(): Record<CategoryKey, ChecklistItem> {
  const out = {} as Record<CategoryKey, ChecklistItem>
  for (const k of ALL_CATEGORIES) out[k] = { state: 'pass' }
  return out
}

function initialState(routeId: string): State {
  return {
    step:      'loading',
    loadError: null,
    form: {
      routeId,
      truckId:            null,
      truckName:          null,
      dvirRequirement:    null,
      previousInspection: null,
      previousDvirAcknowledged: false,
      defectAcknowledgments:    new Set(),
      towingTrailer:            null,
      checklist:                buildInitialChecklist(),
      signed:                   false,
      submitting:               false,
      submitError:              null,
      submitResult:             null,
    },
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_LOADING_RESULT':
      return {
        ...state,
        loadError: null,
        form: {
          ...state.form,
          truckId:            action.payload.truckId,
          truckName:          action.payload.truckName,
          dvirRequirement:    action.payload.dvirRequirement,
          previousInspection: action.payload.previousInspection,
        },
      }

    case 'SET_LOADING_ERROR':
      return { ...state, loadError: action.payload.error }

    case 'GO_TO':
      return { ...state, step: action.payload.step }

    case 'ACK_PREVIOUS_DVIR':
      return { ...state, form: { ...state.form, previousDvirAcknowledged: true } }

    case 'TOGGLE_DEFECT_ACK': {
      const next = new Set(state.form.defectAcknowledgments)
      if (next.has(action.payload.defectId)) next.delete(action.payload.defectId)
      else                                   next.add(action.payload.defectId)
      return { ...state, form: { ...state.form, defectAcknowledgments: next } }
    }

    case 'SET_TOWING':
      return { ...state, form: { ...state.form, towingTrailer: action.payload.towing } }

    case 'SET_CHECKLIST_ITEM':
      return {
        ...state,
        form: {
          ...state.form,
          checklist: { ...state.form.checklist, [action.payload.category]: action.payload.item },
        },
      }

    case 'SET_SIGNED':
      return { ...state, form: { ...state.form, signed: action.payload.signed } }

    case 'SUBMIT_START':
      return { ...state, form: { ...state.form, submitting: true, submitError: null } }

    case 'SUBMIT_SUCCESS':
      return {
        ...state,
        form: {
          ...state.form,
          submitting:   false,
          submitResult: action.payload,
        },
      }

    case 'SUBMIT_ERROR':
      return {
        ...state,
        form: { ...state.form, submitting: false, submitError: action.payload.error },
      }

    default:
      return state
  }
}

// ─── Flow routing helpers ─────────────────────────────────────────────────────

// Decide where to land after the loading screen resolves truck + previous DVIR.
export function nextAfterEntry(form: InspectionForm): FlowStep {
  if (form.dvirRequirement === 'never') return 'never_prompt'
  if (form.previousInspection) {
    return form.previousInspection.open_defects.length > 0 ? 'review_defects' : 'review_clean'
  }
  return form.dvirRequirement === 'when_towing' ? 'towing' : 'checklist'
}

// After the previous-DVIR review (clean or defects). Towing question only
// renders for when_towing trucks; always-trucks skip straight to checklist.
export function nextAfterReview(form: InspectionForm): FlowStep {
  return form.dvirRequirement === 'when_towing' ? 'towing' : 'checklist'
}

// Progress-dot total — depends on the truck's flow shape, not the live step.
// Loading / never_prompt / complete are not counted as "working steps."
export function progressTotal(form: InspectionForm): number {
  let n = 0
  if (form.previousInspection)                     n += 1 // review_clean | review_defects
  if (form.dvirRequirement === 'when_towing')      n += 1 // towing
  n += 1                                                  // checklist
  n += 1                                                  // sign_submit
  return n
}

// Index of the active dot (0-based), or -1 when current step isn't a dot.
export function progressIndex(step: FlowStep, form: InspectionForm): number {
  const dots: FlowStep[] = []
  if (form.previousInspection) {
    dots.push(form.previousInspection.open_defects.length > 0 ? 'review_defects' : 'review_clean')
  }
  if (form.dvirRequirement === 'when_towing') dots.push('towing')
  dots.push('checklist')
  dots.push('sign_submit')
  return dots.indexOf(step)
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function InspectionScreen({ routeId }: InspectionScreenProps) {
  const router = useRouter()
  const { getRoute, loadDay, loadedDate } = useAppState()
  const [state, dispatch] = useReducer(reducer, routeId, initialState)

  // ── Loading effect ─────────────────────────────────────────────────────────
  // Resolves truck info from AppStateContext (already populated by Home in the
  // typical flow) and fetches the previous-DVIR + current-route inspection
  // status from the server. On success, dispatches SET_LOADING_RESULT then
  // GO_TO with the routing-matrix destination.
  //
  // If AppStateContext routes are empty (deep-link entry, e.g. notification),
  // calls loadDay(today) to populate first.
  useEffect(() => {
    if (state.step !== 'loading') return

    const today = (() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    let cancelled = false

    async function run() {
      // Ensure routes are loaded; loadDay is idempotent on (date) key.
      if (loadedDate !== today) {
        await loadDay(today)
      }
      if (cancelled) return

      const route = getRoute(routeId)
      if (!route) {
        dispatch({ type: 'SET_LOADING_ERROR', payload: { error: 'Route not found.' } })
        return
      }
      if (!route.truck_id || !route.truck_dvir_requirement) {
        dispatch({ type: 'SET_LOADING_ERROR', payload: { error: 'Route has no assigned truck or DVIR setting.' } })
        return
      }

      // Fetch previous DVIR + current-route inspection status. Same endpoint
      // Home uses; this screen reads `previous` for review screens (Home only
      // reads `current`).
      try {
        const res  = await fetch(`/api/inspection/status?route_id=${routeId}&truck_id=${route.truck_id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        if (cancelled) return

        // If a current inspection already exists for this route+driver, the
        // gate is open — bail straight back to Home rather than letting the
        // driver re-inspect. (Edge case: deep-link to /inspection after the
        // gate has already opened.)
        if (json.current) {
          router.replace('/')
          return
        }

        const previous = (json.previous ?? null) as PreviousInspection | null

        dispatch({
          type: 'SET_LOADING_RESULT',
          payload: {
            truckId:            route.truck_id!,
            truckName:          route.truck_name ?? '',
            dvirRequirement:    route.truck_dvir_requirement!,
            previousInspection: previous,
          },
        })
        // Compute next step from the just-resolved form. We construct a
        // synthetic form snapshot for the routing helper since the reducer
        // dispatch hasn't flushed state yet.
        const snapshot: InspectionForm = {
          ...state.form,
          truckId:            route.truck_id!,
          truckName:          route.truck_name ?? '',
          dvirRequirement:    route.truck_dvir_requirement!,
          previousInspection: previous,
        }
        dispatch({ type: 'GO_TO', payload: { step: nextAfterEntry(snapshot) } })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) {
          console.error('[Inspection] loading failed:', message)
          dispatch({ type: 'SET_LOADING_ERROR', payload: { error: message } })
        }
      }
    }

    run()
    return () => { cancelled = true }
    // Intentionally narrow deps — this effect should only fire once per
    // mount per routeId. loadedDate / getRoute / loadDay are stable enough
    // that re-runs on their identity churn would just retry the same logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, state.step])

  // ── Render: error state takes priority over the step switch ────────────────
  if (state.loadError) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Inspection unavailable</h2>
        <p>{state.loadError}</p>
        <button onClick={() => router.replace('/')}>Return to Home</button>
      </div>
    )
  }

  // ── Step switch (placeholders — UI TBD next pass) ─────────────────────────
  switch (state.step) {
    case 'loading':
      return <Placeholder title="Screen 1 — loading"/>
    case 'never_prompt':
      return <Placeholder title="Screen 1 (variant) — never_prompt" onAdvance={() => dispatch({ type: 'GO_TO', payload: { step: 'checklist' } })}/>
    case 'review_clean':
      return <Placeholder title="Screen 2 — review_clean" onAdvance={() => {
        dispatch({ type: 'ACK_PREVIOUS_DVIR' })
        dispatch({ type: 'GO_TO', payload: { step: nextAfterReview(state.form) } })
      }}/>
    case 'review_defects':
      return <Placeholder title="Screen 3 — review_defects" onAdvance={() => {
        dispatch({ type: 'ACK_PREVIOUS_DVIR' })
        dispatch({ type: 'GO_TO', payload: { step: nextAfterReview(state.form) } })
      }}/>
    case 'towing':
      return <Placeholder title="Screen 4 — towing" onAdvance={() => {
        // Default to false in placeholder; real UI will collect user input.
        dispatch({ type: 'SET_TOWING', payload: { towing: false } })
        dispatch({ type: 'GO_TO', payload: { step: 'checklist' } })
      }}/>
    case 'checklist':
      return <Placeholder title="Screen 5 — checklist" onAdvance={() => dispatch({ type: 'GO_TO', payload: { step: 'sign_submit' } })}/>
    case 'sign_submit':
      return <Placeholder title="Screen 6 — sign_submit" onAdvance={() => {
        // Placeholder submit — UI pass will wire to /api/inspection/submit.
        dispatch({ type: 'SUBMIT_SUCCESS', payload: { id: 'placeholder', outcome: 'clear' } })
        dispatch({ type: 'GO_TO', payload: { step: 'complete' } })
      }}/>
    case 'complete':
      return <Placeholder title={`Screen 7 — complete (${state.form.submitResult?.outcome ?? 'unknown'})`} onAdvance={() => router.replace('/')} advanceLabel="Return to Home"/>
  }
}

// ─── Placeholder ──────────────────────────────────────────────────────────────
// Visible scaffolding so the state machine is testable without UI commitment.
// Replaced screen-by-screen in the next pass.
function Placeholder({ title, onAdvance, advanceLabel }: { title: string; onAdvance?: () => void; advanceLabel?: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 24,
      background: '#FFF9EE', color: '#0A0B14',
      fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      {onAdvance && (
        <button
          onClick={onAdvance}
          style={{
            background: '#FFB800', color: '#0A0B14',
            border: 0, padding: '12px 22px', borderRadius: 999,
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
          }}
        >
          {advanceLabel ?? 'Advance →'}
        </button>
      )}
    </div>
  )
}
