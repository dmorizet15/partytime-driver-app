'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import ReportIssueForm, {
  type ReportIssueFormResult,
  type ReportIssueFormStopContext,
} from '@/components/workOrders/ReportIssueForm'
import { useAppState } from '@/context/AppStateContext'
import { WC, FONT_BODY, FONT_DISPLAY } from '@/lib/workOrders/theme'

// sessionStorage key — StopDetailScreen reads this on mount to show the
// post-submit "WO ### · {assignee} notified" green pill, then clears it.
// Key is per stop so multiple WO submissions don't collide across tabs.
export function reportIssueSuccessKey(stopId: string): string {
  return `wo-just-created:${stopId}`
}

export interface ReportIssueScreenProps {
  // Stop-context mode: caller passes routeId + stopId; screen hydrates stop
  // from AppStateContext. Standalone mode: leave undefined.
  routeId?: string
  stopId?:  string
}

export default function ReportIssueScreen({ routeId, stopId }: ReportIssueScreenProps) {
  const router = useRouter()
  const { getStop } = useAppState()

  const stop = stopId ? getStop(stopId) : null
  const stopContext: ReportIssueFormStopContext | undefined = stop
    ? {
        stop_id:       stop.stop_id,
        order_number:  stop.order_id,
        customer_name: (stop.company_name?.trim() || stop.customer_name).trim(),
        items:         stop.items ?? [],
      }
    : undefined

  const [done, setDone] = useState<ReportIssueFormResult | null>(null)

  // After a successful submission with no stop context, hold the screen on
  // a small confirmation panel for a beat, then bounce back to Tools.
  useEffect(() => {
    if (!done) return
    if (done.stopId) return  // stop-context path navigates immediately
    const t = setTimeout(() => router.replace('/tools'), 2400)
    return () => clearTimeout(t)
  }, [done, router])

  function handleBack() {
    if (routeId && stopId) {
      router.replace(`/route/${routeId}/stop/${stopId}`)
    } else {
      router.replace('/tools')
    }
  }

  function handleSuccess(result: ReportIssueFormResult) {
    setDone(result)
    // Stop-context: stash for the stop screen's pill, then nav back.
    if (result.stopId && routeId) {
      try {
        sessionStorage.setItem(
          reportIssueSuccessKey(result.stopId),
          JSON.stringify({
            workOrderNumber: result.workOrderNumber,
            assigneeName:    result.assigneeName,
            ts:              Date.now(),
          })
        )
      } catch {
        // sessionStorage write failure is non-fatal — the pill just won't show.
      }
      router.replace(`/route/${routeId}/stop/${result.stopId}`)
    }
  }

  return (
    // Natural-scroll wrapper. We intentionally do NOT use the global `.screen`
    // class here — that class locks height to 100svh + overflow:hidden, which
    // on tall viewports (desktop browser) traps the form's bottom action bar
    // below the fold with no way to scroll to it. Letting the document scroll
    // naturally reveals the Submit button as the user scrolls down.
    <div style={{
      background: WC.cream, fontFamily: FONT_BODY, color: WC.ink,
      minHeight: '100svh',
      display: 'flex', flexDirection: 'column',
    }}>
      <AppHeader
        title="Report an issue"
        subtitle={stop ? `#${stop.order_id} · ${stop.customer_name}` : 'New work order'}
        onBack={handleBack}
      />

      {done ? (
        <ConfirmationPanel result={done} />
      ) : (
        <ReportIssueForm
          stop={stopContext}
          onSuccess={handleSuccess}
          onCancel={handleBack}
        />
      )}
    </div>
  )
}

// ─── Confirmation panel — standalone-mode success state ───────────────────
function ConfirmationPanel({ result }: { result: ReportIssueFormResult }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 22px',
    }}>
      <div style={{
        background: WC.paper,
        border: `1.5px solid ${WC.ink}`,
        borderRadius: 18,
        padding: 24,
        textAlign: 'center',
        maxWidth: 420,
        boxShadow: `5px 5px 0 ${WC.green}`,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(31,191,107,0.15)',
          border: `1.5px solid ${WC.green}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={WC.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6"/>
          </svg>
        </div>
        <div style={{
          fontSize: 11, fontWeight: 800, color: WC.green,
          letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          Work order created
        </div>
        <div style={{
          marginTop: 6, fontSize: 22, fontWeight: 900, color: WC.ink,
          fontFamily: FONT_DISPLAY, letterSpacing: '-0.02em',
        }}>
          {result.workOrderNumber}
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: WC.muted, lineHeight: 1.4 }}>
          {result.assigneeName} notified.
        </div>
      </div>
    </div>
  )
}
