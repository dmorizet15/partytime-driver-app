import WillCallGate from '@/components/willCall/WillCallGate'
import WillCallPickupConfirmScreen from '@/screens/willCall/WillCallPickupConfirmScreen'

export default function WillCallPickupPage({ params }: { params: { id: string } }) {
  return (
    <WillCallGate>
      <WillCallPickupConfirmScreen orderId={params.id} />
    </WillCallGate>
  )
}
