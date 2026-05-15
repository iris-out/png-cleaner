import type { ConvertOptions } from '../types'
import { removeWebpMetadata, removePngMetadata, removeJpegMetadata } from './metadata'

const MIME: Record<string, string> = {
  png:  'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

/**
 * Process (strip metadata + optionally convert/resize) a single image.
 *
 * Pipeline summary:
 *  - WebP output: always re-encode through canvas, scrub alpha LSBs (kills NAI stealth-pnginfo),
 *    then chunk-strip. No bit-perfect fast path — NAI hides prompt data in alpha LSBs, so any
 *    pass-through of original alpha bytes leaks the metadata.
 *  - PNG / JPEG output: routed through a clean WebP intermediate. Decode → alpha-LSB-scrubbed
 *    WebP encode → chunk-strip → re-decode → final PNG/JPEG encode → chunk-strip. Guarantees
 *    no EXIF, no browser-injected metadata, and no alpha-channel stealth survives.
 */
export async function processImage(file: File, options: ConvertOptions): Promise<Blob> {
  const deepClean = !!options.deepClean

  // ── WebP output ────────────────────────────────────────────────────────────
  if (options.format === 'webp') {
    const blob = await canvasEncode(file, 'webp', options, { resize: true, fillWhite: deepClean })
    const stripped = removeWebpMetadata(await blob.arrayBuffer())
    return new Blob([stripped], { type: 'image/webp' })
  }

  // ── PNG / JPEG output ──────────────────────────────────────────────────────
  // Build a clean WebP intermediate first (resize + LSB scrub happen here), then transcode.
  const webpBlob = await canvasEncode(file, 'webp', options, { resize: true, fillWhite: deepClean })
  const cleanWebpBuf = removeWebpMetadata(await webpBlob.arrayBuffer())
  const cleanWebpFile = new File([cleanWebpBuf], 'intermediate.webp', { type: 'image/webp' })

  // JPEG has no alpha — always paint a white background on the second pass.
  const fillWhite = options.format === 'jpeg' || deepClean
  const finalBlob = await canvasEncode(cleanWebpFile, options.format, options, { resize: false, fillWhite })
  const finalBuf  = await finalBlob.arrayBuffer()

  const stripped = options.format === 'png'
    ? removePngMetadata(finalBuf)
    : removeJpegMetadata(finalBuf)

  return new Blob([stripped], { type: MIME[options.format] })
}

interface CanvasEncodeOpts {
  resize: boolean    // apply options.resize percent
  fillWhite: boolean // paint a white background before drawImage (kills alpha; deep clean only)
}

async function canvasEncode(
  file: File,
  outFormat: 'png' | 'jpeg' | 'webp',
  options: ConvertOptions,
  opts: CanvasEncodeOpts,
): Promise<Blob> {
  // premultiplyAlpha:'none' keeps raw alpha bytes intact so the LSB scrub below operates on
  // the actual stealth-bearing values, not on premultiplied approximations.
  const bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })

  let w = bitmap.width
  let h = bitmap.height
  if (opts.resize && options.resize !== 'original') {
    const pct = options.resize as number
    w = Math.round(w * pct / 100)
    h = Math.round(h * pct / 100)
  }

  const mime    = MIME[outFormat] ?? 'image/png'
  // PNG: lossless (quality ignored). WebP intermediate: quality=1 → Chromium uses VP8L lossless.
  // JPEG: user-controlled quality.
  const quality =
    outFormat === 'png' ? undefined
    : outFormat === 'webp' ? 1
    : options.quality / 100

  const drawAndExport = async (canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null)
    if (!ctx) throw new Error('Could not get 2D context')

    if (opts.fillWhite) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    // ── NAI stealth-pnginfo countermeasure ─────────────────────────────────
    // NAI embeds prompt/seed/etc. in the alpha-channel LSB (mostly opaque pixels at α=255 with
    // a sparse set at α=254 forming the payload bitstream). Force every alpha byte's LSB to 1
    // so the bitstream collapses into a uniform pattern. Visual change is null on already-
    // opaque pixels; on semi-transparent ones the opacity rises by ≤1/256 (imperceptible).
    // Only useful when the canvas still carries alpha — i.e., not after fillWhite (which has
    // already composited alpha away).
    if (!opts.fillWhite) {
      const imgData = ctx.getImageData(0, 0, w, h)
      const px = imgData.data
      for (let i = 3; i < px.length; i += 4) px[i] |= 0x01
      ctx.putImageData(imgData, 0, 0)
    }

    if ('convertToBlob' in canvas) {
      return (canvas as OffscreenCanvas).convertToBlob({ type: mime, quality })
    }
    return new Promise((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
        mime,
        quality,
      )
    })
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    return drawAndExport(new OffscreenCanvas(w, h))
  }
  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  return drawAndExport(canvas)
}
