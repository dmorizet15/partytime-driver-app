import { Suspense } from 'react'
import RoutePreviewScreen from '@/screens/RoutePreviewScreen'

interface Props {
  params: { routeId: string }
}

export default function RoutePreviewPage({ params }: Props) {
  // useSearchParams() inside RoutePreviewScreen requires a Suspense boundary
  // (Next 14 App Router) — otherwise the page bails out of static prerender.
  return (
    <Suspense fallback={null}>
      <RoutePreviewScreen routeId={params.routeId} />
    </Suspense>
  )
}
