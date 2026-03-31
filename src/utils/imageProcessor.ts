import type { ConvertOptions } from '../types'
import { removeWebpMetadata } from './metadata'

const MIME: Record<string, string> = {
  png:  'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Process (strip metadata + optionally convert/resize) a single image.
 *
 * WebP → WebP with no resize and max quality: RIFF chunk removal (lossless,
 * bit-exact pixel data). All other cases: OffscreenCanvas re-draw (strips
 * all metadata, handles format conversion and resizing).
 */
export async function processImage(file: File, options: ConvertOptions): Promise<Blob> {
  const isWebpIn  = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
  const isWebpOut = options.format === 'webp'
  const noResize  = options.resize === 'original'
  const maxQual   = options.quality >= 100

  if (isWebpIn && isWebpOut && noResize && maxQual) {
    const buf = await file.arrayBuffer()
    const cleaned = removeWebpMetadata(buf)
    return new Blob([cleaned], { type: 'image/webp' })
  }

  return convertViaCanvas(file, options)
}

async function convertViaCanvas(file: File, options: ConvertOptions): Promise<Blob> {
  const bitmap = await createImageBitmap(file)

  let w = bitmap.width
  let h = bitmap.height
  if (options.resize !== 'original') {
    const pct = options.resize as number
    w = Math.round(w * pct / 100)
    h = Math.round(h * pct / 100)
  }

  const mime    = MIME[options.format] ?? 'image/png'
  const quality = options.format === 'png' ? undefined : options.quality / 100

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    if (options.format === 'jpeg') {
      // Flatten transparency to white for JPEG
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    return canvas.convertToBlob({ type: mime, quality })
  }

  // Safari <16.4 fallback
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    if (options.format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob failed')),
      mime,
      quality,
    )
  })
}
