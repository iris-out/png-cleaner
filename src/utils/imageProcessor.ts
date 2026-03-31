import type { ConvertOptions } from '../types'
import { removeWebpMetadata, removePngMetadata, removeJpegMetadata } from './metadata'

const MIME: Record<string, string> = {
  png:  'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Process (strip metadata + optionally convert/resize) a single image.
 */
export async function processImage(file: File, options: ConvertOptions): Promise<Blob> {
  const extIn = file.name.toLowerCase().split('.').pop()
  const isWebpIn = file.type === 'image/webp' || extIn === 'webp'
  const isPngIn  = file.type === 'image/png'  || extIn === 'png'
  const isJpegIn = file.type === 'image/jpeg' || extIn === 'jpg' || extIn === 'jpeg'

  const isSameFormat =
    (isWebpIn && options.format === 'webp') ||
    (isPngIn  && options.format === 'png') ||
    (isJpegIn && options.format === 'jpeg')

  const noResize = options.resize === 'original'
  const maxQual  = options.quality >= 100

  // ── Optimization: Manual Chunk Stripping (Bit-exact pixels, fast, 100% metadata removal) ──
  if (isSameFormat && noResize && maxQual) {
    const buf = await file.arrayBuffer()
    let cleaned: ArrayBuffer
    let type = file.type

    if (isWebpIn) {
      cleaned = removeWebpMetadata(buf)
      type = 'image/webp'
    } else if (isPngIn) {
      cleaned = removePngMetadata(buf)
      type = 'image/png'
    } else if (isJpegIn) {
      cleaned = removeJpegMetadata(buf)
      type = 'image/jpeg'
    } else {
      return convertViaCanvas(file, options)
    }

    return new Blob([cleaned], { type })
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
    
    // Transparent -> White for JPEG
    if (options.format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    return canvas.convertToBlob({ type: mime, quality })
  }

  // Fallback
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
