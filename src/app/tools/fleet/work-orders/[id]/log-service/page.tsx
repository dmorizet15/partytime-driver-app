import FleetGate from '@/components/fleet/FleetGate'
import LogServiceEntryScreen from '@/screens/fleet/LogServiceEntryScreen'

export default function LogServicePage({ params }: { params: { id: string } }) {
  return (
    <FleetGate>
      <LogServiceEntryScreen workOrderId={params.id} />
    </FleetGate>
  )
}
