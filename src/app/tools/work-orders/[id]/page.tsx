import WorkOrderGate from '@/components/workOrders/WorkOrderGate'
import WorkOrderDetailScreen from '@/screens/workOrders/WorkOrderDetailScreen'

interface Props {
  params: { id: string }
}

export default function WorkOrderDetailPage({ params }: Props) {
  return (
    <WorkOrderGate>
      <WorkOrderDetailScreen id={params.id} />
    </WorkOrderGate>
  )
}
