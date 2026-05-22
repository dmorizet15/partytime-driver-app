'use client'

import { useEffect, useRef, useState } from 'react'
import { FC, FONT_BODY } from '@/lib/fleet/theme'
import { CameraIcon, CloseIcon, FileIcon } from './fleetIcons'

/**
 * Optional invoice attachment — Camera (photo) + File/PDF picker.
 * Controlled: holds no upload logic, just surfaces the chosen File.
 */
export default function InvoiceUpload({
  value,
  onChange,
  disabled = false,
}: {
  value: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (value && value.type.startsWith('image/')) {
      const url = URL.createObjectURL(value)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
    return undefined
  }, [value])

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (file) onChange(file)
    e.target.value = '' // let the same file be re-picked after a remove
  }

  if (value) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: FC.cardRaised,
          border: `0.5px solid ${FC.cardBorder}`,
          borderRadius: 12, padding: 10,
        }}
      >
        <div
          style={{
            width: 48, height: 48, borderRadius: 8, flexShrink: 0,
            background: FC.bg, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Invoice preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <FileIcon size={22} color={FC.muted} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13, fontWeight: 700, color: FC.white,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {value.name}
          </div>
          <div style={{ fontSize: 11, color: FC.muted, marginTop: 2 }}>
            {(value.size / 1024).toFixed(0)} KB · attached
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Remove invoice"
          style={{
            background: 'transparent', border: 0, cursor: 'pointer',
            padding: 6, flexShrink: 0, display: 'flex',
          }}
        >
          <CloseIcon size={18} color={FC.muted} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 10, fontFamily: FONT_BODY }}>
      <input
        ref={cameraRef} type="file" accept="image/*" capture="environment"
        onChange={handlePick} style={{ display: 'none' }}
      />
      <input
        ref={fileRef} type="file" accept="image/*,application/pdf"
        onChange={handlePick} style={{ display: 'none' }}
      />
      <UploadButton
        label="Take photo"
        disabled={disabled}
        onClick={() => cameraRef.current?.click()}
        icon={<CameraIcon size={18} color={FC.white} />}
      />
      <UploadButton
        label="Choose file"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        icon={<FileIcon size={18} color={FC.white} />}
      />
    </div>
  )
}

function UploadButton({
  label, icon, onClick, disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: FC.cardRaised,
        border: `0.5px solid ${FC.cardBorder}`,
        borderRadius: 12, padding: '12px 10px',
        color: FC.white, fontSize: 13, fontWeight: 700,
        fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  )
}
