interface OTWSentBannerProps {
  sentAt: string   // ISO timestamp
  phone: string
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return '—'
  }
}

export default function OTWSentBanner({ sentAt, phone }: OTWSentBannerProps) {
  return (
    <div className="flex items-start gap-3 mx-4 my-3 p-3
                    bg-gray-100 border border-gray-300 rounded-xl">
      <span className="text-lg leading-none mt-0.5" aria-hidden="true">✅</span>
      <div>
        <div className="text-sm font-bold text-gray-800">On The Way text sent</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Sent at {formatTime(sentAt)} · {phone}
        </div>
      </div>
    </div>
  )
}
