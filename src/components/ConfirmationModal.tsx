'use client'

interface ConfirmationModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

export default function ConfirmationModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmationModalProps) {
  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Sheet — stop click propagation so tapping inside doesn't dismiss */}
      <div
        className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-5">
          <h2 id="modal-title" className="text-[17px] font-bold text-gray-900 mb-2">
            {title}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        </div>

        <div className="flex border-t border-gray-200">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 py-4 text-sm font-semibold text-gray-500
                       border-r border-gray-200 active:bg-gray-50
                       disabled:opacity-40 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 py-4 text-sm font-bold text-gray-900
                       active:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {isLoading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
