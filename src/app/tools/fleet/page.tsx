import FleetGate from '@/components/fleet/FleetGate'
import FleetOverviewScreen from '@/screens/fleet/FleetOverviewScreen'

export default function FleetPage() {
  return (
    <FleetGate>
      <FleetOverviewScreen />
    </FleetGate>
  )
}
