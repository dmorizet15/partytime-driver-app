import WillCallGate from '@/components/willCall/WillCallGate'
import WillCallDetailScreen from '@/screens/willCall/WillCallDetailScreen'

export default function WillCallDetailPage({ params }: { params: { id: string } }) {
  return (
    <WillCallGate>
      <WillCallDetailScreen orderId={params.id} />
    </WillCallGate>
  )
}
