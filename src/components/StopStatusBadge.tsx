import { StopStatus } from '@/types'

interface StopStatusBadgeProps {
  status: StopStatus
  className?: string
}

const STATUS_CONFIG: Record<StopStatus, { label: string; classes: string }> = {
  pending: {
    label: 'Pending',
    classes: 'bg-gray-100 text-gray-500 border-gray-300',
  },
  on_the_way_sent: {
    label: 'OTW ✓',
    classes: 'bg-gray-200 text-gray-700 border-gray-400',
  },
  completed: {
    label: 'Done',
    classes: 'bg-gray-900 text-white border-gray-900',
  },
}

export default function StopStatusBadge({
  status,
  className = '',
}: StopStatusBadgeProps) {
  const { label, classes } = STATUS_CONFIG[status]
  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-1 rounded
        text-[10px] font-bold uppercase tracking-wider border
        ${classes} ${className}
      `}
    >
      {label}
    </span>
  )
}
