import WillCallGate from '@/components/willCall/WillCallGate'
import WillCallCheckoffScreen from '@/screens/willCall/WillCallCheckoffScreen'

export default function WillCallStagingPage({ params }: { params: { id: string } }) {
  return (
    <WillCallGate>
      <WillCallCheckoffScreen orderId={params.id} mode="staging" />
    </WillCallGate>
  )
}
