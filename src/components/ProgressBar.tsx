interface ProgressBarProps {
  total: number
  completed: number
}

export default function ProgressBar({ total, completed }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0

  return (
    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex-shrink-0">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Progress
        </span>
        <span className="text-[10px] font-semibold text-gray-500">
          {completed} of {total} complete
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-900 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}
