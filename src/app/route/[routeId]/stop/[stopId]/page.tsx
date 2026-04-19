import StopDetailScreen from '@/screens/StopDetailScreen'

interface Props {
  params: { routeId: string; stopId: string }
}

export default function StopDetailPage({ params }: Props) {
  return <StopDetailScreen routeId={params.routeId} stopId={params.stopId} />
}
