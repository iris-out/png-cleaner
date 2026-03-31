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
  const deepClean = !!options.deepClean

  // ── Optimization: Manual Chunk Stripping (Bit-exact pixels, fast) ──
  // Deep Clean이 꺼져있을 때만 이 최적화를 사용 (스테가노그래피 파괴를 위해선 픽셀 재분해 필요)
  if (!deepClean && isSameFormat && noResize && maxQual) {
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

  const drawAndExport = async (canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> => {
    // 2D 컨텍스트 강제 캐스팅 (OffscreenCanvas도 2D 지원)
    const ctx = canvas.getContext('2d') as (CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null)
    if (!ctx) throw new Error('Could not get 2D context')
    
    // 1. 배경 처리
    if (options.format === 'jpeg' || (options.format === 'png' && options.deepClean)) {
      // JPEG는 투명도가 없으므로 흰색 배경. 
      // PNG Deep Clean 시에도 투명도를 제거(알파 채널 파괴)하여 스테가노그래피 완전 제거 유도.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    
    // 2. 이미지 그리기
    ctx.drawImage(bitmap, 0, 0, w, h)
    
    // 3. Pixel Washing (스테가노그래피 파괴를 위한 미세 변동)
    if (options.deepClean) {
      // 픽셀 하나만 미세하게 변경하여 데이터 재구성 유도
      const imageData = ctx.getImageData(0, 0, 1, 1)
      imageData.data[0] = (imageData.data[0] + 1) % 256 
      ctx.putImageData(imageData, 0, 0)
    }
    
    bitmap.close()
    
    if ('convertToBlob' in canvas) {
      return (canvas as OffscreenCanvas).convertToBlob({ type: mime, quality })
    } else {
      return new Promise((resolve, reject) => {
        (canvas as HTMLCanvasElement).toBlob(
          blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
          mime,
          quality,
        )
      })
    }
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h)
    return drawAndExport(canvas)
  } else {
    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    return drawAndExport(canvas)
  }
}
