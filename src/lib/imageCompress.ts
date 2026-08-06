// ─── Client-side image compression ───────────────────────────────────────────
// Extracted verbatim from the private `compressImage` closure that lived in
// StopDetailScreen (POD photo path) so the field-media capture can reuse it
// instead of forking a second implementation. Behaviour is unchanged: canvas
// downscale to MAX px on the longest edge, re-encode JPEG at 0.8.
//
// ⚠ It degrades gracefully rather than failing: if the browser can't decode
// the file (HEIC on Android, a corrupt capture) `img.onerror` fires and the
// ORIGINAL file is returned uncompressed. Callers that care about the output
// size must still check `.size` on the result — this is not a size guarantee.

const MAX = 1200

export async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
        else { width = Math.round((width * MAX) / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.8)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
