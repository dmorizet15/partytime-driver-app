import FleetGate from '@/components/fleet/FleetGate'
import LogServiceEntryScreen from '@/screens/fleet/LogServiceEntryScreen'

export default function AssetLogServicePage({ params }: { params: { type: string; id: string } }) {
  return (
    <FleetGate>
      <LogServiceEntryScreen assetType={params.type} assetId={params.id} />
    </FleetGate>
  )
}
