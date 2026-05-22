import FleetGate from '@/components/fleet/FleetGate'
import AssetDetailScreen from '@/screens/fleet/AssetDetailScreen'

export default function AssetPage({ params }: { params: { type: string; id: string } }) {
  return (
    <FleetGate>
      <AssetDetailScreen assetType={params.type} assetId={params.id} />
    </FleetGate>
  )
}
