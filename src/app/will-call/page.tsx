import WillCallGate from '@/components/willCall/WillCallGate'
import WillCallListScreen from '@/screens/willCall/WillCallListScreen'

export default function WillCallPage() {
  return (
    <WillCallGate>
      <WillCallListScreen />
    </WillCallGate>
  )
}
