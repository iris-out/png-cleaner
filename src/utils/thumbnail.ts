const THUMB_SIZE = 56   // px (max dimension)
const THUMB_QUALITY = 0.7

export async function createThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)

  const ratio = Math.min(THUMB_SIZE / bitmap.width, THUMB_SIZE / bitmap.height)
  const w = Math.max(1, Math.round(bitmap.width  * ratio))
  const h = Math.max(1, Math.round(bitmap.height * ratio))

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: THUMB_QUALITY })
    return URL.createObjectURL(blob)
  }

  // Safari fallback
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    canvas.toBlob(
      blob => blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed')),
      'image/jpeg',
      THUMB_QUALITY,
    )
  })
}
