import RouteListScreen from '@/screens/RouteListScreen'

interface Props {
  params: { routeId: string }
}

export default function RouteListPage({ params }: Props) {
  return <RouteListScreen routeId={params.routeId} />
}
