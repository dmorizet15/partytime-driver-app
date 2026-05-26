import WorkOrderGate from '@/components/workOrders/WorkOrderGate'
import WorkOrdersListScreen from '@/screens/workOrders/WorkOrdersListScreen'

export default function WorkOrdersListPage() {
  return (
    <WorkOrderGate>
      <WorkOrdersListScreen />
    </WorkOrderGate>
  )
}
