// ─── Result shape ─────────────────────────────────────────────────────────────
export interface PhotoUploadResult {
  success: boolean
  url?: string    // public URL of the saved photo, e.g. /uploads/stop-a3-1713456789.jpg
  error?: string
}

// ─── Interface ────────────────────────────────────────────────────────────────
// Phase 2: replace with S3UploadService or similar — no screen changes needed.
export interface IPhotoUploadService {
  upload(file: File, stopId: string, routeId: string): Promise<PhotoUploadResult>
}

// ─── Implementation ───────────────────────────────────────────────────────────
// POSTs multipart/form-data to the Next.js API route at /api/upload-photo.
// The API route saves the file to public/uploads/ and returns the public URL.
export class ApiPhotoUploadService implements IPhotoUploadService {
  async upload(file: File, stopId: string, routeId: string): Promise<PhotoUploadResult> {
    console.log('[PhotoUploadService] Uploading photo for stop:', stopId)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('stop_id', stopId)
    formData.append('route_id', routeId)

    const response = await fetch('/api/upload-photo', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[PhotoUploadService] HTTP error:', response.status, text)
      try {
        const json = JSON.parse(text)
        if (json.error) return { success: false, error: json.error }
      } catch {}
      return { success: false, error: `Server error ${response.status}` }
    }

    const data = await response.json()

    if (data.success && data.url) {
      console.log('[PhotoUploadService] Upload success:', data.url)
      return { success: true, url: data.url }
    }

    console.error('[PhotoUploadService] Upload failed:', data.error)
    return { success: false, error: data.error ?? 'Unknown error' }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
export const photoUploadService: IPhotoUploadService = new ApiPhotoUploadService()
