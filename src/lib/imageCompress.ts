// ─── Client-side image compression ───────────────────────────────────────────
// Originally a private closure inside StopDetailScreen (POD photo path),
// extracted so field-media capture reuses one implementation. Same output
// shape as before: downscale to MAX px on the longest edge, re-encode JPEG 0.8.
//
// ORIENTATION (Phase 2). A photo picked from the camera roll is far more likely
// than a fresh capture to carry a non-default EXIF orientation — it may have
// been shot months ago on another device, or rotated since. Drawing such a file
// to a canvas via `new Image()` does not reliably bake that rotation into the
// pixels across browsers, which is how a portrait shot arrives at marketing on
// its side. `createImageBitmap(blob, { imageOrientation: 'from-image' })`
// resolves the rotation before we draw, so the output pixels are upright.
// Falls back to the original path where it isn't supported.
//
// ⚠ The canvas re-encode drops all other EXIF — including GPS. That is
// deliberate and worth keeping: these are photos of customers' homes, and the
// coordinates of a customer's property have no business travelling to a
// marketing library. Video is passed through untouched and keeps its metadata.
//
// It degrades rather than failing: if the browser can't decode the file (HEIC
// on Android, a corrupt capture) the ORIGINAL file is returned uncompressed.
// Callers that care about output size must still check `.size` on the result —
// this is not a size guarantee.

const MAX = 1200
const QUALITY = 0.8

function fitWithin(width: number, height: number): { w: number; h: number } {
  if (width <= MAX && height <= MAX) return { w: width, h: height }
  return width > height
    ? { w: MAX, h: Math.round((height * MAX) / width) }
    : { w: Math.round((width * MAX) / height), h: MAX }
}

function encode(
  source: CanvasImageSource,
  width: number,
  height: number,
  original: File,
): Promise<File> {
  const { w, h } = fitWithin(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(source, 0, 0, w, h)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(original); return }
      resolve(new File([blob], original.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
    }, 'image/jpeg', QUALITY)
  })
}

export async function compressImage(file: File): Promise<File> {
  // Preferred path — honours EXIF orientation before we rasterise.
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return await encode(bitmap, bitmap.width, bitmap.height, file)
    } catch {
      // Unsupported option, or a format this browser can't decode — fall
      // through to the <img> path rather than failing the capture.
    } finally {
      bitmap?.close()
    }
  }

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      void encode(img, img.width, img.height, file).then(resolve)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
