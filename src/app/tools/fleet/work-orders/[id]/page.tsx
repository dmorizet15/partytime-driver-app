import FleetGate from '@/components/fleet/FleetGate'
import WorkOrderDetailScreen from '@/screens/fleet/WorkOrderDetailScreen'

export default function WorkOrderPage({ params }: { params: { id: string } }) {
  return (
    <FleetGate>
      <WorkOrderDetailScreen workOrderId={params.id} />
    </FleetGate>
  )
}
