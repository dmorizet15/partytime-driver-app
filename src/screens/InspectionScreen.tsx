'use client'

import { useEffect, useReducer } from 'react'
import { useRouter }             from 'next/navigation'
import { useAppState }           from '@/context/AppStateContext'

interface InspectionScreenProps {
  routeId: string
}

// ─── Direction 03 (Editorial) tokens — match Home/RouteList ──────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFEFC2',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
  amber:    '#F59E0B',
  red:      '#DC2626',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

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
  odometer:                 string            // current odometer reading, miles — digit-only string, '' until entered
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
  | { type: 'SET_ODOMETER';        payload: { value: string } }
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
      odometer:                 '',
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

    case 'SET_ODOMETER':
      return { ...state, form: { ...state.form, odometer: action.payload.value } }

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

  // ── Step switch ─────────────────────────────────────────────────────────────
  switch (state.step) {
    case 'loading':
      return (
        <Shell>
          <Hero
            eyebrow="Pre-trip"
            title="Pre-trip inspection"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
          />
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, padding: '40px 24px',
          }}>
            <div style={{
              width: 28, height: 28,
              border: '2px solid rgba(10,11,20,0.15)',
              borderTopColor: C.ink,
              borderRadius: '50%',
              animation: 'ptw-spin 0.9s linear infinite',
            }}/>
            <span style={{ fontSize: 13, color: C.muted }}>
              Resolving truck and previous DVIR…
            </span>
            <style>{`@keyframes ptw-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </Shell>
      )

    case 'never_prompt':
      // Soft prompt for trucks with dvir_requirement = 'never'. Best-practice
      // message, not a regulatory gate. Tapping Continue advances into the
      // checklist same as the federal flow — the driver still produces an
      // inspection record on submit.
      return (
        <Shell>
          <Hero
            eyebrow="Best practice"
            title="Quick inspection"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
          />
          <div style={{ flex: 1, padding: '24px 22px 0', overflowY: 'auto' }}>
            <div style={{
              background: C.paper,
              border: `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 18,
              padding: '22px 20px',
              boxShadow: `4px 4px 0 ${C.gold}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: C.goldDeep,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                Not federally required
              </div>
              <div style={{
                marginTop: 8,
                fontFamily: FONT_DISPLAY,
                fontSize: 22, fontWeight: 900, color: C.ink,
                lineHeight: 1.15, letterSpacing: '-0.02em',
              }}>
                This truck is below the DVIR threshold.
              </div>
              <div style={{
                marginTop: 10,
                fontSize: 14, color: C.ink, lineHeight: 1.5,
              }}>
                A full pre-trip is still good practice — a few seconds spent here
                catches issues before the road. Same checklist; the record on
                file matters if anything goes wrong.
              </div>
            </div>
          </div>
          <Footer>
            <PrimaryCTA
              label="Continue to checklist"
              onClick={() => dispatch({ type: 'GO_TO', payload: { step: 'checklist' } })}
            />
          </Footer>
        </Shell>
      )
    case 'review_clean': {
      const prior = state.form.previousInspection
      // Defensive fallback — routing matrix shouldn't land here without a prior,
      // but the !state-flag covers a manual GO_TO in the future.
      if (!prior) {
        dispatch({ type: 'GO_TO', payload: { step: nextAfterReview(state.form) } })
        return null
      }
      return (
        <Shell>
          <Hero
            eyebrow={`Previous DVIR · ${formatPriorDate(prior.inspection_date)}`}
            title="Review previous report"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
            progress={{ total: progressTotal(state.form), index: progressIndex('review_clean', state.form) }}
          />
          <div style={{ flex: 1, padding: '24px 22px 0', overflowY: 'auto' }}>
            <div style={{
              background: C.paper,
              border: `1.5px solid ${C.green}`,
              borderRadius: 18,
              padding: '22px 20px',
              boxShadow: `4px 4px 0 ${C.green}`,
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: C.green, color: '#fff',
                padding: '5px 12px', borderRadius: 999,
                fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}>
                <CheckCircleIcon size={14} color="#fff"/>
                No defects
              </div>
              <div style={{
                marginTop: 12,
                fontFamily: FONT_DISPLAY,
                fontSize: 22, fontWeight: 900, color: C.ink,
                lineHeight: 1.15, letterSpacing: '-0.02em',
              }}>
                Truck was clean at last inspection.
              </div>
              <div style={{
                marginTop: 10,
                fontSize: 14, color: C.ink, lineHeight: 1.5,
              }}>
                {formatPriorDate(prior.inspection_date)} — no defects reported.
                Confirm you&apos;ve reviewed the report and continue to your own
                pre-trip.
              </div>
            </div>
          </div>
          <Footer>
            <PrimaryCTA
              label="I've reviewed the report"
              onClick={() => {
                dispatch({ type: 'ACK_PREVIOUS_DVIR' })
                dispatch({ type: 'GO_TO', payload: { step: nextAfterReview(state.form) } })
              }}
            />
          </Footer>
        </Shell>
      )
    }

    case 'review_defects': {
      const prior = state.form.previousInspection
      if (!prior || prior.open_defects.length === 0) {
        dispatch({ type: 'GO_TO', payload: { step: nextAfterReview(state.form) } })
        return null
      }
      const defects  = prior.open_defects
      const allAcked = defects.every((d) => state.form.defectAcknowledgments.has(d.id))
      const oosCount = defects.filter((d) => d.severity === 'oos').length

      return (
        <Shell>
          <Hero
            eyebrow={`Previous DVIR · ${formatPriorDate(prior.inspection_date)}`}
            title="Acknowledge open defects"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
            progress={{ total: progressTotal(state.form), index: progressIndex('review_defects', state.form) }}
          />
          <div style={{ flex: 1, padding: '14px 18px 22px', overflowY: 'auto' }}>
            <div style={{
              padding: '10px 4px 14px',
              fontSize: 12.5, color: C.muted, lineHeight: 1.45,
            }}>
              <strong style={{ color: C.ink, fontWeight: 800 }}>
                {defects.length} open defect{defects.length === 1 ? '' : 's'}
              </strong>
              {oosCount > 0 && (
                <> · <span style={{ color: C.red, fontWeight: 800 }}>{oosCount} OOS</span></>
              )}
              {' '}must be acknowledged before continuing. Tap each card to confirm
              you&apos;ve read it.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {defects.map((d) => (
                <DefectCard
                  key={d.id}
                  defect={d}
                  acknowledged={state.form.defectAcknowledgments.has(d.id)}
                  onToggle={() => dispatch({ type: 'TOGGLE_DEFECT_ACK', payload: { defectId: d.id } })}
                />
              ))}
            </div>
          </div>
          <Footer>
            <PrimaryCTA
              label={allAcked ? 'Confirm & continue' : `Acknowledge ${defects.length - countAcked(defects, state.form.defectAcknowledgments)} more`}
              disabled={!allAcked}
              onClick={() => {
                if (!allAcked) return
                dispatch({ type: 'ACK_PREVIOUS_DVIR' })
                dispatch({ type: 'GO_TO', payload: { step: nextAfterReview(state.form) } })
              }}
            />
          </Footer>
        </Shell>
      )
    }
    case 'towing': {
      // Tap-to-advance: each option immediately writes towing + routes to
      // checklist. No separate Continue CTA — binary high-impact question with
      // visually distinct cards is hard to mis-tap, and the back arrow lets a
      // driver correct course before signing in Screen 6.
      const chooseTowing = (towing: boolean) => {
        dispatch({ type: 'SET_TOWING', payload: { towing } })
        dispatch({ type: 'GO_TO',      payload: { step: 'checklist' } })
      }
      return (
        <Shell>
          <Hero
            eyebrow="Trailer"
            title="Are you towing today?"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
            progress={{ total: progressTotal(state.form), index: progressIndex('towing', state.form) }}
          />
          <div style={{ flex: 1, padding: '20px 18px 0', overflowY: 'auto' }}>
            <div style={{
              padding: '4px 4px 16px',
              fontSize: 13, color: C.muted, lineHeight: 1.45,
            }}>
              This truck only triggers a federal DVIR when towing pushes the
              combined weight over 10,001 lbs. Pick the answer that matches
              today.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Yes — towing. Gold-accent (the heavier consequence path) */}
              <button
                onClick={() => chooseTowing(true)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: C.goldSoft,
                  border: `1.5px solid ${C.gold}`,
                  borderRadius: 18,
                  padding: '18px 20px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: `4px 4px 0 ${C.gold}`,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: C.gold,
                  border: `2px solid ${C.ink}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 18, color: C.ink,
                }}>
                  Y
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 18, fontWeight: 900, color: C.ink,
                    lineHeight: 1.15, letterSpacing: '-0.01em',
                  }}>
                    Yes — towing today
                  </div>
                  <div style={{
                    marginTop: 4,
                    fontSize: 12.5, color: C.goldDeep, lineHeight: 1.35,
                  }}>
                    Full 12-item DVIR · trailer brakes + coupling devices included
                  </div>
                </div>
                <ArrowIcon size={18} color={C.ink}/>
              </button>

              {/* No — not towing. Neutral paper, lighter weight */}
              <button
                onClick={() => chooseTowing(false)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: C.paper,
                  border: `1.5px solid rgba(10,11,20,0.12)`,
                  borderRadius: 18,
                  padding: '18px 20px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: `4px 4px 0 rgba(10,11,20,0.10)`,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: C.paper,
                  border: `2px solid ${C.ink}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 18, color: C.ink,
                }}>
                  N
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: 18, fontWeight: 900, color: C.ink,
                    lineHeight: 1.15, letterSpacing: '-0.01em',
                  }}>
                    No — no trailer today
                  </div>
                  <div style={{
                    marginTop: 4,
                    fontSize: 12.5, color: C.muted, lineHeight: 1.35,
                  }}>
                    10-item checklist · trailer-specific rows hidden
                  </div>
                </div>
                <ArrowIcon size={18} color={C.ink}/>
              </button>
            </div>
          </div>
        </Shell>
      )
    }
    case 'checklist': {
      // Hide trailer-specific rows when the driver answered "no" on Screen 4.
      // For dvir_requirement = 'always' / 'never' trucks (no Screen 4 rendered),
      // towingTrailer stays null — those trucks render the full 12 rows since
      // we don't know they're not towing. Acceptable conservative default.
      const towing = state.form.towingTrailer !== false
      const visible = ALL_CATEGORIES.filter((k) => towing || !TRAILER_CATEGORIES.has(k))

      // CTA enabled when every visible row has a complete record. Pass = always
      // complete; fail requires non-empty description (severity is always set
      // because tapping Fail prefills the OOS-default).
      const canAdvance = visible.every((k) => {
        const item = state.form.checklist[k]
        if (item.state === 'pass') return true
        if (item.state === 'fail') return item.description.trim().length > 0
        return false
      })

      const failCount = visible.filter((k) => state.form.checklist[k].state === 'fail').length

      return (
        <Shell>
          <Hero
            eyebrow="Checklist"
            title="Pre-trip checklist"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
            progress={{ total: progressTotal(state.form), index: progressIndex('checklist', state.form) }}
          />
          <div style={{ flex: 1, padding: '18px 18px 24px', overflowY: 'auto' }}>
            <div style={{
              padding: '4px 4px 16px',
              fontSize: 13, color: C.muted, lineHeight: 1.45,
            }}>
              {visible.length} categor{visible.length === 1 ? 'y' : 'ies'} ·
              default <strong style={{ color: C.green }}>Pass</strong>.
              Tap <strong style={{ color: C.red }}>Fail</strong> if anything is wrong —
              severity and notes appear inline.
              {failCount > 0 && (
                <> <span style={{ color: C.ink, fontWeight: 800 }}>{failCount} flagged.</span></>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map((k) => (
                <ChecklistRow
                  key={k}
                  category={k}
                  item={state.form.checklist[k]}
                  onSet={(item) => dispatch({ type: 'SET_CHECKLIST_ITEM', payload: { category: k, item } })}
                />
              ))}
            </div>
          </div>
          <Footer>
            <PrimaryCTA
              label={canAdvance ? 'Review & sign' : 'Add description to flagged items'}
              disabled={!canAdvance}
              onClick={() => dispatch({ type: 'GO_TO', payload: { step: 'sign_submit' } })}
            />
          </Footer>
        </Shell>
      )
    }
    case 'sign_submit': {
      const towing = state.form.towingTrailer !== false
      const visible = ALL_CATEGORIES.filter((k) => towing || !TRAILER_CATEGORIES.has(k))
      const passed  = visible.filter((k) => state.form.checklist[k].state === 'pass').length
      const flagged = visible.filter((k) => state.form.checklist[k].state === 'fail')

      // Odometer is required. The input is digit-sanitized on entry, so a
      // non-empty value is always a valid non-negative integer; the server
      // re-validates as the authoritative check.
      const odometerValid = state.form.odometer.trim().length > 0

      const submit = async () => {
        if (!state.form.signed || !odometerValid || state.form.submitting) return
        dispatch({ type: 'SUBMIT_START' })
        try {
          const res = await fetch('/api/inspection/submit', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              route_id:                   state.form.routeId,
              truck_id:                   state.form.truckId,
              towing_trailer:             state.form.towingTrailer === true,
              previous_dvir_reviewed_id:  state.form.previousInspection?.id ?? null,
              previous_dvir_acknowledged: state.form.previousDvirAcknowledged,
              checklist:                  state.form.checklist,
              defect_acknowledgments:     Array.from(state.form.defectAcknowledgments),
              current_mileage:            Number(state.form.odometer),
            }),
          })
          const json = await res.json()
          if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
          dispatch({ type: 'SUBMIT_SUCCESS', payload: { id: json.id, outcome: json.outcome } })
          dispatch({ type: 'GO_TO',          payload: { step: 'complete' } })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[Inspection] submit failed:', message)
          dispatch({ type: 'SUBMIT_ERROR', payload: { error: message } })
        }
      }

      return (
        <Shell>
          <Hero
            eyebrow="Sign & submit"
            title="Review and submit"
            truckName={state.form.truckName}
            onBack={() => router.replace('/')}
            progress={{ total: progressTotal(state.form), index: progressIndex('sign_submit', state.form) }}
          />
          <div style={{ flex: 1, padding: '18px 18px 24px', overflowY: 'auto' }}>

            {/* Summary card */}
            <div style={{
              background: C.paper,
              border: `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 18,
              padding: '18px 18px 20px',
              boxShadow: '0 2px 8px -4px rgba(10,11,20,0.08)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: C.muted,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                Summary
              </div>
              <div style={{
                marginTop: 8,
                fontFamily: FONT_DISPLAY,
                fontSize: 22, fontWeight: 900, color: C.ink,
                lineHeight: 1.15, letterSpacing: '-0.02em',
              }}>
                {state.form.truckName ?? 'Truck'}
              </div>
              <div style={{
                marginTop: 4,
                fontSize: 13, color: C.muted,
                fontVariantNumeric: 'tabular-nums',
              }}>
                Pre-trip · {formatPriorDate(todayDateStr())}
                {state.form.towingTrailer !== null && (
                  <> · {state.form.towingTrailer ? 'Towing' : 'Not towing'}</>
                )}
              </div>

              {/* Pass/fail counts */}
              <div style={{
                marginTop: 14,
                display: 'flex', gap: 10, flexWrap: 'wrap',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: passed > 0 ? C.green : C.off,
                  color:      passed > 0 ? '#fff'   : C.muted,
                  padding: '4px 10px', borderRadius: 999,
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {passed} passed
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: flagged.length > 0 ? C.red : C.off,
                  color:      flagged.length > 0 ? '#fff' : C.muted,
                  padding: '4px 10px', borderRadius: 999,
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {flagged.length} flagged
                </span>
              </div>

              {/* Flagged defects list */}
              {flagged.length > 0 && (
                <div style={{
                  marginTop: 16,
                  borderTop: '1px solid rgba(10,11,20,0.08)',
                  paddingTop: 14,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  {flagged.map((k) => {
                    const item = state.form.checklist[k]
                    if (item.state !== 'fail') return null
                    const isOos = item.severity === 'oos'
                    return (
                      <div key={k} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{
                          flexShrink: 0,
                          marginTop: 2,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: isOos ? C.red : C.amber,
                          color:      isOos ? '#fff' : C.ink,
                          padding: '3px 8px', borderRadius: 999,
                          fontSize: 9.5, fontWeight: 900, letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                        }}>
                          {isOos && <AlertIcon size={10} color="#fff"/>}
                          {isOos ? 'OOS' : 'NON-OOS'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: FONT_DISPLAY,
                            fontSize: 14, fontWeight: 800, color: C.ink,
                            lineHeight: 1.25,
                          }}>
                            {CATEGORY_LABELS[k]}
                          </div>
                          <div style={{
                            marginTop: 2,
                            fontSize: 12.5, color: C.ink, opacity: 0.78, lineHeight: 1.4,
                          }}>
                            {item.description}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Odometer reading — required. Feeds trucks.current_mileage on
                submit, which activates mileage-based PM flagging fleet-wide.
                Placed above the certify checkbox so the "information above is
                accurate" attestation covers the reading. */}
            <div style={{
              marginTop: 14,
              background: C.paper,
              border: `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 18,
              padding: '18px 18px 20px',
              boxShadow: '0 2px 8px -4px rgba(10,11,20,0.08)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: C.muted,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                Odometer
              </div>
              <label
                htmlFor="odometer-input"
                style={{
                  display: 'block',
                  marginTop: 8,
                  fontFamily: FONT_DISPLAY,
                  fontSize: 17, fontWeight: 900, color: C.ink,
                  lineHeight: 1.2, letterSpacing: '-0.01em',
                }}
              >
                Current odometer reading (miles)
              </label>
              <div style={{
                marginTop: 4,
                fontSize: 12.5, color: C.muted, lineHeight: 1.4,
              }}>
                Enter the number shown on the truck&apos;s dashboard.
              </div>
              <input
                id="odometer-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={state.form.odometer}
                onChange={(e) => dispatch({
                  type: 'SET_ODOMETER',
                  payload: { value: e.target.value.replace(/[^0-9]/g, '').slice(0, 7) },
                })}
                placeholder="e.g. 84120"
                aria-label="Current odometer reading in miles"
                aria-required="true"
                aria-invalid={!odometerValid}
                style={{
                  marginTop: 12,
                  width: '100%',
                  background: C.paper,
                  border: `1.5px solid ${odometerValid ? 'rgba(10,11,20,0.16)' : C.gold}`,
                  borderRadius: 12,
                  padding: '14px 14px',
                  fontFamily: FONT_DISPLAY,
                  fontSize: 22, fontWeight: 900,
                  letterSpacing: '0.01em',
                  color: C.ink,
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              {!odometerValid && (
                <div style={{
                  marginTop: 6,
                  fontSize: 11.5, color: C.red, fontWeight: 700,
                }}>
                  Odometer reading required.
                </div>
              )}
            </div>

            {/* Certify checkbox */}
            <button
              onClick={() => dispatch({ type: 'SET_SIGNED', payload: { signed: !state.form.signed } })}
              aria-pressed={state.form.signed}
              style={{
                marginTop: 14,
                width: '100%', textAlign: 'left',
                background: state.form.signed ? C.ink : C.paper,
                color:      state.form.signed ? '#fff' : C.ink,
                border: `1.5px solid ${state.form.signed ? C.ink : 'rgba(10,11,20,0.16)'}`,
                borderRadius: 18,
                padding: '14px 16px',
                display: 'flex', gap: 12, alignItems: 'flex-start',
                cursor: 'pointer',
                fontFamily: 'inherit',
                boxShadow: state.form.signed ? `4px 4px 0 ${C.gold}` : '0 2px 8px -4px rgba(10,11,20,0.08)',
                transition: 'background 120ms ease, color 120ms ease, box-shadow 150ms ease',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: `2px solid ${state.form.signed ? C.gold : 'rgba(10,11,20,0.30)'}`,
                  background: state.form.signed ? C.gold : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {state.form.signed && <CheckIcon size={14} color={C.ink}/>}
              </div>
              <div style={{
                flex: 1,
                fontSize: 13.5, lineHeight: 1.45,
                fontWeight: 600,
              }}>
                By submitting, I certify this vehicle is in safe operating
                condition and that the information above is accurate.
              </div>
            </button>

            {/* Submit error banner */}
            {state.form.submitError && (
              <div style={{
                marginTop: 14,
                background: C.paper,
                border: `1.5px solid ${C.red}`,
                borderRadius: 14,
                padding: '12px 14px',
                boxShadow: `4px 4px 0 ${C.red}`,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, color: C.red,
                  letterSpacing: '0.16em', textTransform: 'uppercase',
                }}>
                  Submit failed
                </div>
                <div style={{
                  marginTop: 4,
                  fontSize: 13, color: C.ink, lineHeight: 1.4,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  wordBreak: 'break-all',
                }}>
                  {state.form.submitError}
                </div>
              </div>
            )}
          </div>
          <Footer>
            <PrimaryCTA
              label={state.form.submitting ? 'Submitting…' : 'Submit Inspection'}
              disabled={!state.form.signed || !odometerValid || state.form.submitting}
              onClick={submit}
            />
          </Footer>
        </Shell>
      )
    }
    case 'complete': {
      const result = state.form.submitResult
      // Defensive: complete should only be reached via SUBMIT_SUCCESS, but if
      // the user deep-links or the state desyncs, route home cleanly.
      if (!result) {
        router.replace('/')
        return null
      }

      const towing = state.form.towingTrailer !== false
      const visible = ALL_CATEGORIES.filter((k) => towing || !TRAILER_CATEGORIES.has(k))
      const flagged = visible.filter((k) => state.form.checklist[k].state === 'fail')
      const oosDefects = flagged.filter((k) => {
        const it = state.form.checklist[k]
        return it.state === 'fail' && it.severity === 'oos'
      })
      const nonOosDefects = flagged.filter((k) => {
        const it = state.form.checklist[k]
        return it.state === 'fail' && it.severity === 'non_oos'
      })

      // Outcome-driven content. Hero/body/CTA all derive from a single shape
      // so the JSX below stays a flat render, not a nested switch.
      type OutcomeUi = {
        eyebrow:    string
        title:      string
        accent:     string             // status color used for badge + accent shadow
        badge:      { label: string; bg: string; fg: string; icon: 'check' | 'alert' }
        bodyTitle:  string
        copy:       string
        ctaLabel:   string
        ctaVariant: 'gold' | 'neutral'
      }

      const ui: OutcomeUi =
        result.outcome === 'clear' ? {
          eyebrow:    'Inspection complete',
          title:      'Truck is road-ready.',
          accent:     C.green,
          badge:      { label: 'All clear', bg: C.green, fg: '#fff', icon: 'check' },
          bodyTitle:  'Truck is road-ready.',
          copy:       'Every category passed. Have a safe day on the road.',
          ctaLabel:   'Return to home',
          ctaVariant: 'gold',
        }
        : result.outcome === 'non_oos' ? {
          eyebrow:    'Inspection complete',
          title:      'Truck can operate — defects logged.',
          accent:     C.amber,
          badge:      { label: 'Defects logged', bg: C.amber, fg: C.ink, icon: 'alert' },
          bodyTitle:  'Defects logged for maintenance.',
          copy:       `${nonOosDefects.length} drivable defect${nonOosDefects.length === 1 ? '' : 's'} flagged. The truck is safe to drive today; the dashboard fleet view shows an amber warning until repaired.`,
          ctaLabel:   'Return to home',
          ctaVariant: 'gold',
        }
        : {
          eyebrow:    'Out of service',
          title:      'Truck cannot be dispatched.',
          accent:     C.red,
          badge:      { label: 'Out of service', bg: C.red, fg: '#fff', icon: 'alert' },
          bodyTitle:  'Truck is out of service.',
          copy:       `${oosDefects.length} out-of-service defect${oosDefects.length === 1 ? '' : 's'} detected. This truck is hard-blocked from new assignments until cleared by a maintenance manager.`,
          ctaLabel:   'Return to home',
          ctaVariant: 'neutral',
        }

      return (
        <Shell>
          <Hero
            eyebrow={ui.eyebrow}
            title={ui.title}
            truckName={state.form.truckName}
          />
          <div style={{ flex: 1, padding: '24px 22px 0', overflowY: 'auto' }}>

            {/* Outcome card */}
            <div style={{
              background: C.paper,
              border: `1.5px solid ${ui.accent}`,
              borderRadius: 18,
              padding: '22px 20px',
              boxShadow: `4px 4px 0 ${ui.accent}`,
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: ui.badge.bg, color: ui.badge.fg,
                padding: '5px 12px', borderRadius: 999,
                fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}>
                {ui.badge.icon === 'check'
                  ? <CheckCircleIcon size={14} color={ui.badge.fg}/>
                  : <AlertIcon size={12} color={ui.badge.fg}/>}
                {ui.badge.label}
              </div>
              <div style={{
                marginTop: 12,
                fontFamily: FONT_DISPLAY,
                fontSize: 24, fontWeight: 900, color: C.ink,
                lineHeight: 1.1, letterSpacing: '-0.02em',
              }}>
                {ui.bodyTitle}
              </div>
              <div style={{
                marginTop: 10,
                fontSize: 14, color: C.ink, lineHeight: 1.5,
              }}>
                {ui.copy}
              </div>

              {/* Defects list (non_oos + oos only) */}
              {result.outcome !== 'clear' && flagged.length > 0 && (
                <div style={{
                  marginTop: 14,
                  borderTop: '1px solid rgba(10,11,20,0.08)',
                  paddingTop: 14,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {flagged.map((k) => {
                    const item = state.form.checklist[k]
                    if (item.state !== 'fail') return null
                    const isOos = item.severity === 'oos'
                    return (
                      <div key={k} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{
                          flexShrink: 0,
                          marginTop: 2,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: isOos ? C.red : C.amber,
                          color:      isOos ? '#fff' : C.ink,
                          padding: '3px 8px', borderRadius: 999,
                          fontSize: 9.5, fontWeight: 900, letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                        }}>
                          {isOos && <AlertIcon size={10} color="#fff"/>}
                          {isOos ? 'OOS' : 'NON-OOS'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontFamily: FONT_DISPLAY,
                            fontSize: 14, fontWeight: 800, color: C.ink,
                            lineHeight: 1.25,
                          }}>
                            {CATEGORY_LABELS[k]}
                          </div>
                          <div style={{
                            marginTop: 2,
                            fontSize: 12.5, color: C.ink, opacity: 0.78, lineHeight: 1.4,
                          }}>
                            {item.description}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Quiet auto-notify confirmation — OOS only.
                The actual SMS/email auto-notify is a Phase 2 feature (see
                Notion DVIR spec). Today the dispatcher learns via the fleet
                board's red banner on the OOS truck. The line below is the
                user-facing promise; wire to a real notify when Phase 2 lands. */}
            {result.outcome === 'oos' && (
              <div style={{
                marginTop: 14,
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: 'rgba(31,191,107,0.08)',
                border: `1px solid rgba(31,191,107,0.30)`,
                borderRadius: 12,
              }}>
                <CheckCircleIcon size={16} color={C.green}/>
                <div style={{
                  fontSize: 12.5, color: C.ink, lineHeight: 1.35,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  Dispatcher has been notified · {formatNowTime()}
                </div>
              </div>
            )}
          </div>
          <Footer>
            <PrimaryCTA
              label={ui.ctaLabel}
              variant={ui.ctaVariant}
              onClick={() => router.replace('/')}
            />
          </Footer>
        </Shell>
      )
    }
  }
}

// ─── Placeholder (used by the still-stubbed screens until each pass lands) ──
function Placeholder({ title, onAdvance, advanceLabel }: { title: string; onAdvance?: () => void; advanceLabel?: string }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 24,
      background: C.cream, color: C.ink,
      fontFamily: FONT_BODY,
    }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      {onAdvance && (
        <button
          onClick={onAdvance}
          style={{
            background: C.gold, color: C.ink,
            border: 0, padding: '12px 22px', borderRadius: 999,
            fontSize: 14, fontWeight: 800, cursor: 'pointer',
            fontFamily: FONT_DISPLAY,
          }}
        >
          {advanceLabel ?? 'Advance →'}
        </button>
      )}
    </div>
  )
}

// ─── Shared chrome ────────────────────────────────────────────────────────────

// Full-height column with cream surface; every screen renders inside one.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="screen" style={{
      background: C.cream, fontFamily: FONT_BODY, color: C.ink,
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
    }}>
      {children}
    </div>
  )
}

interface HeroProps {
  eyebrow:    string
  title:      string
  truckName?: string | null
  onBack?:    () => void
  /** Progress dots — omit for non-working steps (loading/never_prompt/complete) */
  progress?:  { total: number; index: number }
}

function Hero({ eyebrow, title, truckName, onBack, progress }: HeroProps) {
  return (
    <div style={{
      background: C.blue, color: '#fff',
      padding: '32px 22px 22px',
      position: 'relative', overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Decorative tilted gold star — same accent as Home/RouteList */}
      <svg
        aria-hidden="true"
        width={160} height={160} viewBox="0 0 100 100"
        style={{
          position: 'absolute', right: -14, top: -8,
          opacity: 0.20,
          transform: 'rotate(25deg)', transformOrigin: 'center',
          pointerEvents: 'none',
        }}
      >
        <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
      </svg>

      {/* Top row: back button + brand mark */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'relative',
      }}>
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back to home"
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: 'rgba(255,255,255,0.16)',
              border: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BackIcon size={18} color="#fff"/>
          </button>
        ) : <div style={{ width: 38, height: 38 }}/>}
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: C.paper,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/ptr-mark.png"
            alt="PartyTime Rentals"
            style={{ width: '74%', height: '74%', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* Eyebrow */}
      <div style={{
        marginTop: 18, position: 'relative',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
        color: C.gold, textTransform: 'uppercase',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {eyebrow}
      </div>

      {/* Headline */}
      <div style={{
        marginTop: 6, position: 'relative',
        fontFamily: FONT_DISPLAY,
        fontSize: 30, fontWeight: 900,
        lineHeight: 0.95, letterSpacing: '-0.03em',
        color: '#fff',
      }}>
        {title}
      </div>

      {/* Truck pill */}
      {truckName && (
        <div style={{
          marginTop: 12, position: 'relative',
          fontSize: 13, color: 'rgba(255,255,255,0.85)',
          letterSpacing: '-0.005em',
        }}>
          {truckName}
        </div>
      )}

      {/* Progress dots — dynamic count, locked May 8 design (see Notion §Design Decisions) */}
      {progress && (
        <div style={{
          marginTop: 16, position: 'relative',
          display: 'flex', gap: 6, alignItems: 'center',
        }} aria-hidden="true">
          {Array.from({ length: progress.total }).map((_, i) => {
            const done = i <  progress.index
            const live = i === progress.index
            return (
              <span
                key={i}
                style={{
                  width:  live ? 26 : 8,
                  height: 8, borderRadius: 999,
                  background: done ? C.gold : live ? C.gold : 'transparent',
                  border: done || live ? 'none' : '1.5px solid rgba(255,255,255,0.45)',
                  transition: 'width 200ms ease',
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// Sticky bottom CTA container. Matches Home's gold-CTA layout (60px pill).
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      flexShrink: 0,
      padding: '18px 18px calc(18px + env(safe-area-inset-bottom))',
      background: C.cream,
    }}>
      {children}
    </div>
  )
}

interface PrimaryCTAProps {
  label:     string
  onClick:   () => void
  disabled?: boolean
  /** Override the gold pill — used by Screen 7 OOS state for a quieter neutral */
  variant?:  'gold' | 'neutral'
}

function PrimaryCTA({ label, onClick, disabled, variant = 'gold' }: PrimaryCTAProps) {
  const bg    = variant === 'neutral' ? C.ink   : C.gold
  const fg    = variant === 'neutral' ? '#fff'  : C.ink
  const arrowFg = variant === 'neutral' ? C.ink : '#fff'
  const arrowBg = variant === 'neutral' ? '#fff' : C.ink
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', height: 60, borderRadius: 999,
        background: bg, color: fg,
        border: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: 16, fontWeight: 900, fontFamily: FONT_DISPLAY,
        letterSpacing: '-0.01em',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 8px 0 22px',
        boxShadow: variant === 'gold' ? '0 14px 30px -10px rgba(255,184,0,0.55)' : 'none',
      }}
    >
      <span>{label}</span>
      <span style={{
        width: 44, height: 44, borderRadius: '50%',
        background: arrowBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <ArrowIcon size={18} color={arrowFg}/>
      </span>
    </button>
  )
}

// ─── Inline icons ─────────────────────────────────────────────────────────────
type IconProps = { size?: number; color?: string }

function BackIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}

function ArrowIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  )
}

function CheckIcon({ size = 14, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6"/>
    </svg>
  )
}

function CheckCircleIcon({ size = 16, color = C.green }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 12l3 3 5-6"/>
    </svg>
  )
}

function AlertIcon({ size = 16, color = C.red }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L2 22h20L12 2z"/>
      <line x1="12" y1="10" x2="12" y2="14"/>
      <circle cx="12" cy="17.5" r="0.6" fill={color} stroke="none"/>
    </svg>
  )
}

// ─── Date + label helpers ─────────────────────────────────────────────────────

// "Wed, May 8" — used in review screen eyebrows. Treats input as a local
// date (not UTC) since vehicle_inspections.inspection_date is a DATE column,
// not timestamptz. Avoids the off-by-one TZ shift on YYYY-MM-DD parsing.
function formatPriorDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Today as YYYY-MM-DD (local, not UTC) — feeds formatPriorDate on Screen 6.
function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// "7:42 PM" — used by Screen 7's OOS auto-notify confirmation. Mirrors the
// formatSignedAt helper on DayRouteSelectorScreen.
function formatNowTime(): string {
  const d = new Date()
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as CategoryKey] ?? category
}

function categoryCfr(category: string): string {
  return CFR_SECTIONS[category as CategoryKey] ?? ''
}

function countAcked(defects: OpenDefect[], acked: ReadonlySet<string>): number {
  let n = 0
  for (const d of defects) if (acked.has(d.id)) n++
  return n
}

// ─── Defect card (Screen 3) ───────────────────────────────────────────────────

function DefectCard({ defect, acknowledged, onToggle }:
  { defect: OpenDefect; acknowledged: boolean; onToggle: () => void }) {

  const isOos       = defect.severity === 'oos'
  const accent      = isOos ? C.red : C.amber
  const badgeBg     = isOos ? C.red : C.amber
  const badgeFg     = isOos ? '#fff' : C.ink
  const badgeLabel  = isOos ? 'OOS' : 'NON-OOS'
  const cfr         = categoryCfr(defect.category)

  return (
    <button
      onClick={onToggle}
      aria-pressed={acknowledged}
      style={{
        width: '100%', textAlign: 'left',
        background: C.paper,
        border: `1.5px solid ${acknowledged ? C.ink : accent}`,
        borderRadius: 18,
        padding: '14px 16px',
        display: 'flex', gap: 14, alignItems: 'flex-start',
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: acknowledged ? `4px 4px 0 ${C.ink}` : `4px 4px 0 ${accent}`,
        transition: 'box-shadow 150ms ease, border-color 150ms ease',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Severity badge + CFR ref */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: badgeBg, color: badgeFg,
            padding: '3px 9px', borderRadius: 999,
            fontSize: 10, fontWeight: 900, letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}>
            {isOos && <AlertIcon size={11} color="#fff"/>}
            {badgeLabel}
          </span>
          {cfr && (
            <span style={{
              fontSize: 10.5, fontWeight: 800, color: C.muted,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {cfr}
            </span>
          )}
        </div>
        {/* Category + description */}
        <div style={{
          marginTop: 8,
          fontFamily: FONT_DISPLAY,
          fontSize: 16, fontWeight: 800, color: C.ink,
          lineHeight: 1.2, letterSpacing: '-0.01em',
        }}>
          {categoryLabel(defect.category)}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 13.5, color: C.ink, lineHeight: 1.45,
          opacity: 0.85,
        }}>
          {defect.description}
        </div>
      </div>

      {/* Ack indicator — outline circle when unacked, filled ink with check when acked */}
      <div
        aria-hidden="true"
        style={{
          width: 28, height: 28, borderRadius: '50%',
          border: `2px solid ${acknowledged ? C.ink : 'rgba(10,11,20,0.20)'}`,
          background: acknowledged ? C.ink : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {acknowledged && <CheckIcon size={14} color={C.gold}/>}
      </div>
    </button>
  )
}

// ─── Checklist row (Screen 5) ────────────────────────────────────────────────

// Compose a fail state with the locked OOS-default applied + a sensible
// description prefill that the driver can edit. Tapping FAIL skips the
// "fail_pending_severity" intermediate and lands directly on a complete
// record — the severity prompt is still visible so the driver can flip
// the choice without ceremony.
function defaultFailState(category: CategoryKey): ChecklistItem {
  const severity: 'oos' | 'non_oos' = OOS_DEFAULT_CATEGORIES.has(category) ? 'oos' : 'non_oos'
  const description = `${CATEGORY_LABELS[category]} issue noted during pre-trip inspection.`
  return { state: 'fail', severity, description }
}

function ChecklistRow({ category, item, onSet }:
  { category: CategoryKey; item: ChecklistItem; onSet: (item: ChecklistItem) => void }) {

  const isPass = item.state === 'pass'
  const isFail = item.state === 'fail'

  return (
    <div style={{
      background: C.paper,
      border: `1.5px solid ${isFail ? C.red : 'rgba(10,11,20,0.10)'}`,
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: isFail ? `4px 4px 0 ${C.red}` : '0 2px 8px -4px rgba(10,11,20,0.08)',
      transition: 'border-color 150ms ease, box-shadow 150ms ease',
    }}>
      {/* Row header: label + pass/fail toggle */}
      <div style={{
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 800, color: C.muted,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {CFR_SECTIONS[category]}
          </div>
          <div style={{
            marginTop: 2,
            fontFamily: FONT_DISPLAY,
            fontSize: 16, fontWeight: 800, color: C.ink,
            lineHeight: 1.2, letterSpacing: '-0.01em',
          }}>
            {CATEGORY_LABELS[category]}
          </div>
        </div>
        {/* Pass/Fail toggle — paired buttons. Active = filled status color. */}
        <div style={{
          display: 'inline-flex',
          background: C.off,
          border: `1px solid rgba(10,11,20,0.08)`,
          borderRadius: 999,
          padding: 3,
          flexShrink: 0,
        }}>
          <button
            onClick={() => onSet({ state: 'pass' })}
            aria-pressed={isPass}
            style={{
              background: isPass ? C.green : 'transparent',
              color:      isPass ? '#fff'  : C.muted,
              border: 0,
              padding: '8px 14px', borderRadius: 999,
              fontSize: 11.5, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: FONT_DISPLAY,
            }}
          >
            Pass
          </button>
          <button
            onClick={() => onSet(defaultFailState(category))}
            aria-pressed={isFail}
            style={{
              background: isFail ? C.red : 'transparent',
              color:      isFail ? '#fff' : C.muted,
              border: 0,
              padding: '8px 14px', borderRadius: 999,
              fontSize: 11.5, fontWeight: 900,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: FONT_DISPLAY,
            }}
          >
            Fail
          </button>
        </div>
      </div>

      {/* Severity panel + description — inline expansion below the header.
          Renders only when the row is in 'fail' state. */}
      {isFail && item.state === 'fail' && (
        <div style={{
          borderTop: `1px solid rgba(220,38,38,0.20)`,
          background: 'rgba(220,38,38,0.04)',
          padding: '14px 16px 16px',
        }}>
          <div style={{
            fontSize: 12, fontWeight: 800, color: C.ink,
            letterSpacing: '0.04em',
          }}>
            Is the truck safe to drive?
          </div>

          <div style={{
            marginTop: 8,
            display: 'flex', gap: 8,
          }}>
            <SeverityButton
              label="Out of service"
              tone="oos"
              selected={item.severity === 'oos'}
              onClick={() => onSet({ ...item, severity: 'oos' })}
            />
            <SeverityButton
              label="Drivable defect"
              tone="non_oos"
              selected={item.severity === 'non_oos'}
              onClick={() => onSet({ ...item, severity: 'non_oos' })}
            />
          </div>

          <div style={{
            marginTop: 14,
            fontSize: 11, fontWeight: 800, color: C.muted,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            Description
          </div>
          <textarea
            value={item.description}
            onChange={(e) => onSet({ ...item, description: e.target.value })}
            rows={2}
            placeholder={`${CATEGORY_LABELS[category]} issue noted during pre-trip inspection.`}
            style={{
              marginTop: 6,
              width: '100%',
              background: C.paper,
              border: `1.5px solid ${C.red}`,
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13.5, lineHeight: 1.4,
              color: C.ink,
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 56,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {item.description.trim().length === 0 && (
            <div style={{
              marginTop: 6,
              fontSize: 11.5, color: C.red, fontWeight: 700,
            }}>
              Description required.
            </div>
          )}
        </div>
      )}

    </div>
  )
}

interface SeverityButtonProps {
  label:    string
  tone:     'oos' | 'non_oos'
  selected: boolean
  onClick:  () => void
}

function SeverityButton({ label, tone, selected, onClick }: SeverityButtonProps) {
  const accent  = tone === 'oos' ? C.red : C.amber
  const fg      = selected ? (tone === 'oos' ? '#fff' : C.ink) : accent
  const bg      = selected ? accent : C.paper
  const border  = `1.5px solid ${accent}`
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      style={{
        flex: 1,
        background: bg, color: fg, border,
        borderRadius: 12,
        padding: '10px 12px',
        fontSize: 12, fontWeight: 900,
        letterSpacing: '0.10em', textTransform: 'uppercase',
        cursor: 'pointer',
        fontFamily: FONT_DISPLAY,
        boxShadow: selected ? `2px 2px 0 ${C.ink}` : 'none',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      {label}
    </button>
  )
}
