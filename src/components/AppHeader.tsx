'use client'

interface AppHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
}

export default function AppHeader({ title, subtitle, onBack }: AppHeaderProps) {
  return (
    <div className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 min-h-[52px] flex-shrink-0">
      {onBack && (
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-2xl leading-none
                     text-white active:bg-gray-700 transition-colors flex-shrink-0"
          aria-label="Go back"
        >
          ‹
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold leading-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
