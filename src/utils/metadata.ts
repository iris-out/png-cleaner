import type { MetadataResult, NAIParsedResult } from '../types'

// ─── TIFF 파서 (test.html 검증 완료) ─────────────────────────────────────────

const TIFF_TAGS: Record<number, string> = {
  0x010D: 'DocumentName',  0x010E: 'ImageDescription', 0x0110: 'Make',
  0x0111: 'Model',         0x0112: 'Orientation',       0x011A: 'XResolution',
  0x011B: 'YResolution',   0x0128: 'ResolutionUnit',    0x0131: 'Software',
  0x0132: 'DateTime',      0x013B: 'Artist',            0x8298: 'Copyright',
  0x8769: 'ExifIFD',       0x8825: 'GPSIFD',
  0x829A: 'ExposureTime',  0x829D: 'FNumber',           0x8822: 'ExposureProgram',
  0x8827: 'ISO',           0x9000: 'ExifVersion',       0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9204: 'ExposureBiasValue',
  0x9207: 'MeteringMode',  0x9208: 'LightSource',       0x9209: 'Flash',
  0x920A: 'FocalLength',   0x927C: 'MakerNote',         0x9286: 'UserComment',
  0xA000: 'FlashPixVersion', 0xA001: 'ColorSpace',
  0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension',
  0xA402: 'ExposureMode',  0xA403: 'WhiteBalance',
  0xA405: 'FocalLengthIn35mmFilm', 0xA406: 'SceneCaptureType',
  0xA420: 'ImageUniqueID',
  // GPS
  0x0000: 'GPSVersionID',  0x0001: 'GPSLatitudeRef',  0x0002: 'GPSLatitude',
  0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude',  0x0005: 'GPSAltitudeRef',
  0x0006: 'GPSAltitude',   0x0007: 'GPSTimeStamp',    0x0012: 'GPSStatus',
  0x001D: 'GPSDateStamp',
}

interface UndefinedField { _raw: true; offset: number; count: number }
type RawVal = string | number | UndefinedField | undefined

function parseTiff(u8: Uint8Array): Record<string, unknown> {
  if (u8.length < 8) return {}
  const le   = u8[0] === 0x49  // 0x49='I' little-endian, 0x4D='M' big-endian
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const r16  = (o: number) => view.getUint16(o, le)
  const r32  = (o: number) => view.getUint32(o, le)
  if (r16(2) !== 42) return {}

  const results: Record<string, unknown> = {}
  const TYPE_SZ = [0, 1, 1, 2, 4, 8, 0, 1, 0, 4, 8]

  function readVal(type: number, count: number, fieldOff: number): RawVal {
    const sz     = (TYPE_SZ[type] || 1) * count
    const dataOff = sz > 4 ? r32(fieldOff) : fieldOff

    if (type === 2) { // ASCII
      return new TextDecoder('ascii')
        .decode(u8.slice(dataOff, dataOff + count))
        .replace(/\0+$/, '')
    }
    if (type === 7) return { _raw: true, offset: dataOff, count } // UNDEFINED
    if (type === 5 || type === 10) { // RATIONAL / SRATIONAL
      const vals: string[] = []
      for (let i = 0; i < Math.min(count, 6); i++) {
        const n = r32(dataOff + i * 8), d = r32(dataOff + i * 8 + 4)
        vals.push(d ? (n / d).toFixed(4) : `${n}/0`)
      }
      return count === 1 ? vals[0] : vals.join(', ')
    }
    if (type === 3) { // SHORT
      const vals: number[] = []
      for (let i = 0; i < Math.min(count, 8); i++) vals.push(r16(dataOff + i * 2))
      return count === 1 ? vals[0] : (vals.join(', ') as unknown as number)
    }
    if (type === 4) return r32(dataOff) // LONG (first value)
    if (type === 1) { // BYTE
      return count <= 8
        ? (Array.from(u8.slice(dataOff, dataOff + count)).join(' ') as unknown as number)
        : (`[${count} bytes]` as unknown as number)
    }
    return undefined
  }

  function parseIFD(ifdOff: number, prefix: string) {
    if (!ifdOff || ifdOff + 2 > u8.length) return
    const n = r16(ifdOff)
    for (let i = 0; i < n; i++) {
      const e = ifdOff + 2 + i * 12
      if (e + 12 > u8.length) break
      const tag   = r16(e)
      const type  = r16(e + 2)
      const count = r32(e + 4)

      if (tag === 0x8769) { parseIFD(r32(e + 8), 'Exif');    continue }
      if (tag === 0x8825) { parseIFD(r32(e + 8), 'GPS');     continue }
      if (tag === 0xA005) { parseIFD(r32(e + 8), 'Interop'); continue }

      const raw = readVal(type, count, e + 8)
      let value: unknown

      if (tag === 0x9286 && raw && typeof raw === 'object' && '_raw' in raw) {
        // UserComment: 8-byte charset prefix + actual text
        const r       = raw as UndefinedField
        const charset = new TextDecoder('ascii')
          .decode(u8.slice(r.offset, r.offset + 8)).replace(/\0/g, '').trim()
        const textBytes = u8.slice(r.offset + 8, r.offset + r.count)
        try {
          value = charset === 'UNICODE'
            ? new TextDecoder('utf-16le').decode(textBytes).replace(/\0+$/, '')
            : new TextDecoder('utf-8').decode(textBytes).replace(/\0+$/, '')
        } catch {
          value = `[UserComment ${r.count - 8}b charset=${charset}]`
        }
      } else if (raw && typeof raw === 'object' && '_raw' in raw) {
        const r = raw as UndefinedField
        const preview = Array.from(u8.slice(r.offset, r.offset + Math.min(r.count, 24)))
          .map(b => b.toString(16).padStart(2, '0')).join(' ')
        value = `[${r.count} bytes] ${preview}${r.count > 24 ? '…' : ''}`
      } else {
        value = raw
      }

      const name = TIFF_TAGS[tag] ?? `0x${tag.toString(16).toUpperCase().padStart(4, '0')}`
      results[`${prefix}::${name}`] = value
    }
  }

  parseIFD(r32(4), 'IFD0')
  return results
}

// ─── WebP RIFF 파서 ───────────────────────────────────────────────────────────

interface RiffChunk { fourcc: string; size: number; dataOffset: number }

function parseWebpChunks(buffer: ArrayBuffer): RiffChunk[] {
  const u8   = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const tag  = (o: number) => String.fromCharCode(u8[o], u8[o+1], u8[o+2], u8[o+3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return []

  const chunks: RiffChunk[] = []
  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const fourcc = tag(offset)
    const size   = view.getUint32(offset + 4, true)
    chunks.push({ fourcc, size, dataOffset: offset + 8 })
    offset += 8 + size + (size % 2)
  }
  return chunks
}

function parseWebpExif(buffer: ArrayBuffer): Record<string, unknown> {
  const chunks    = parseWebpChunks(buffer)
  const exifChunk = chunks.find(c => c.fourcc === 'EXIF')
  if (!exifChunk) return {}

  let raw = new Uint8Array(buffer, exifChunk.dataOffset, exifChunk.size)
  // Strip "Exif\0\0" header if present
  if (raw[0] === 0x45 && raw[1] === 0x78 && raw[2] === 0x69 && raw[3] === 0x66) raw = raw.slice(6)
  return parseTiff(raw)
}

/** WebP RIFF에서 필수 청크(VP8, VP8L, VP8X, ALPH, ANIM, ANMF)만 남기고 제거 */
export function removeWebpMetadata(buffer: ArrayBuffer): ArrayBuffer {
  const ESSENTIAL = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF'])
  const src       = new Uint8Array(buffer)
  const chunks    = parseWebpChunks(buffer)
  if (chunks.length === 0) return buffer

  const keep = chunks.filter(c => ESSENTIAL.has(c.fourcc))
  if (keep.length === chunks.length) return buffer // No metadata chunks to remove

  let bodySize = 4 // 'WEBP'
  for (const c of keep) bodySize += 8 + c.size + (c.size % 2)

  const out     = new Uint8Array(8 + bodySize)
  const outView = new DataView(out.buffer)
  out.set([0x52, 0x49, 0x46, 0x46]); outView.setUint32(4, bodySize, true)
  out.set([0x57, 0x45, 0x42, 0x50], 8)

  let off = 12
  for (const c of keep) {
    const len = 8 + c.size + (c.size % 2)
    out.set(src.slice(c.dataOffset - 8, c.dataOffset - 8 + len), off)
    // Clear EXIF/XMP/ICC flags in VP8X if it exists
    if (c.fourcc === 'VP8X') {
      out[off + 8] &= ~(0x08 | 0x10 | 0x02)
    }
    off += len
  }
  return out.buffer
}

// ─── JPEG EXIF 파서 ───────────────────────────────────────────────────────────

function parseJpegExif(buffer: ArrayBuffer): Record<string, unknown> {
  const u8 = new Uint8Array(buffer)
  if (u8[0] !== 0xFF || u8[1] !== 0xD8) return {}

  let offset = 2
  while (offset + 4 <= u8.length) {
    if (u8[offset] !== 0xFF) break
    const marker = u8[offset + 1]
    const length = (u8[offset + 2] << 8) | u8[offset + 3]

    if (marker === 0xE1 && offset + 9 < u8.length) {
      // APP1 — check for "Exif\0\0" (45 78 69 66 00 00)
      if (u8[offset+4] === 0x45 && u8[offset+5] === 0x78 &&
          u8[offset+6] === 0x69 && u8[offset+7] === 0x66) {
        const exifData = u8.slice(offset + 10, offset + 2 + length)
        return parseTiff(exifData)
      }
    }
    if (marker === 0xDA || marker === 0xD9) break // SOS / EOI
    offset += 2 + length
  }
  return {}
}

// ─── PNG tEXt / iTXt / zTXt / EXIf 파서 ────────────────────────────────────

const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]

async function parsePngMetadataChunks(file: File): Promise<Record<string, string>> {
  const buf      = await file.arrayBuffer()
  const bytes    = new Uint8Array(buf)
  const view     = new DataView(buf)
  const dec      = new TextDecoder('utf-8')
  const decLatin = new TextDecoder('latin1')
  const result: Record<string, string> = {}

  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return {}

  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false)
    const type   = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7])
    if (type === 'IEND') break

    const data = bytes.subarray(offset + 8, offset + 8 + length)

    if (type === 'tEXt' && length > 0) {
      const nullIdx = data.indexOf(0)
      if (nullIdx > 0) {
        result[decLatin.decode(data.subarray(0, nullIdx))] =
          decLatin.decode(data.subarray(nullIdx + 1))
      }
    } else if (type === 'iTXt' && length > 0) {
      const nullIdx = data.indexOf(0)
      if (nullIdx > 0) {
        const key        = dec.decode(data.subarray(0, nullIdx))
        const compressed = data[nullIdx + 1] !== 0
        // compressed iTXt is rare but possible; we don't fully decompress here for simplicity,
        // but we mark its existence.
        if (!compressed) {
          let p = nullIdx + 2
          while (p < data.length && data[p] !== 0) p++; p++ // skip language tag
          while (p < data.length && data[p] !== 0) p++; p++ // skip translated keyword
          if (p < data.length) result[key] = dec.decode(data.subarray(p))
        } else {
          result[key] = '[Compressed iTXt]'
        }
      }
    } else if (type === 'zTXt' && length > 0) {
      const nullIdx = data.indexOf(0)
      if (nullIdx > 0) {
        result[decLatin.decode(data.subarray(0, nullIdx))] = '[Compressed zTXt]'
      }
    } else if (type === 'EXIf') {
      result['EXIf'] = `[Exif Data ${length} bytes]`
    } else if (type === 'iCCP') {
      result['iCCP'] = `[ICC Profile ${length} bytes]`
    }
    offset += 12 + length
  }
  return result
}

/** PNG에서 중요 청크(IHDR, PLTE, IDAT, IEND, tRNS, acTL, fcTL, fdAT)만 남기고 제거 */
export function removePngMetadata(buffer: ArrayBuffer): ArrayBuffer {
  const CRITICAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'acTL', 'fcTL', 'fdAT'])
  const src      = new Uint8Array(buffer)
  const view     = new DataView(buffer)
  
  if (src[0] !== 0x89 || src[1] !== 0x50) return buffer

  const keptChunks: Uint8Array[] = [src.slice(0, 8)] // Signature
  let offset = 8
  let hasMeta = false

  while (offset + 12 <= src.length) {
    const length = view.getUint32(offset, false)
    const type   = String.fromCharCode(src[offset+4], src[offset+5], src[offset+6], src[offset+7])
    const fullLen = 12 + length

    if (CRITICAL.has(type)) {
      keptChunks.push(src.slice(offset, offset + fullLen))
    } else {
      hasMeta = true
    }
    if (type === 'IEND') break
    offset += fullLen
  }

  if (!hasMeta) return buffer

  const totalLen = keptChunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(totalLen)
  let off = 0
  for (const c of keptChunks) {
    out.set(c, off)
    off += c.length
  }
  return out.buffer
}

/** JPEG에서 APP0(JFIF)과 DQT, DHT, SOF, SOS 등을 제외한 APPn(Metadata) 제거 */
export function removeJpegMetadata(buffer: ArrayBuffer): ArrayBuffer {
  const src = new Uint8Array(buffer)
  if (src[0] !== 0xFF || src[1] !== 0xD8) return buffer

  const kept: Uint8Array[] = [src.slice(0, 2)] // SOI
  let offset = 2
  let hasMeta = false

  while (offset + 4 <= src.length) {
    if (src[offset] !== 0xFF) break
    const marker = src[offset + 1]
    if (marker === 0xD9) { // EOI
      kept.push(src.slice(offset, offset + 2))
      break
    }
    const length = (src[offset + 2] << 8) | src[offset + 3]
    const fullLen = 2 + length

    // APPn markers are 0xE0 ~ 0xEF
    // APP0 (0xE0) is JFIF (keep it)
    // APP1 (0xE1) is Exif/XMP (remove)
    // APP2-15 are usually metadata or color profiles (remove)
    // COM (0xFE) is comment (remove)
    const isMetadata = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE
    
    if (!isMetadata) {
      kept.push(src.slice(offset, offset + fullLen))
    } else {
      hasMeta = true
    }

    if (marker === 0xDA) { // SOS - rest is entropy data
      kept.push(src.slice(offset + fullLen))
      break
    }
    offset += fullLen
  }

  if (!hasMeta) return buffer

  const totalLen = kept.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(totalLen)
  let off = 0
  for (const c of kept) {
    out.set(c, off)
    off += c.length
  }
  return out.buffer
}

// ─── 메타데이터 있는지 여부 (RIFF 청크 수준) ──────────────────────────────────

function webpHasMetaChunks(buffer: ArrayBuffer): boolean {
  return parseWebpChunks(buffer).some(c => !['RIFF', 'WEBP', 'VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF'].includes(c.fourcc))
}

// ─── NAI 파싱 ─────────────────────────────────────────────────────────────────

const SAMPLER_LABELS: Record<string, string> = {
  k_euler:              'Euler',
  k_euler_ancestral:    'Euler Ancestral',
  k_dpmpp_2s_ancestral: 'DPM++ 2S Ancestral',
  k_dpmpp_2m:           'DPM++ 2M',
  k_dpmpp_sde:          'DPM++ SDE',
  k_dpm_2:              'DPM 2',
  k_dpm_2_ancestral:    'DPM 2 Ancestral',
  ddim_v3:              'DDIM V3',
}

const PRIMARY_FIELDS = ['prompt', 'uc', 'seed', 'steps', 'sampler', 'scale', 'width', 'height']
const SECONDARY_FIELDS = [
  'noise_schedule', 'uncond_scale', 'cfg_rescale', 'sm', 'sm_dyn',
  'dynamic_thresholding', 'dynamic_thresholding_percentile', 'prefer_brownian',
  'skip_cfg_above_sigma', 'skip_cfg_below_sigma',
  'controlnet_strength', 'controlnet_model',
  'lora_unet_weights', 'lora_clip_weights', 'n_samples', 'legacy_v3_extend',
]
const HIDDEN_FIELDS = new Set([
  'signed_hash', 'request_type', 'version', 'stream',
  'extra_passthrough_testing', 'v4_prompt', 'v4_negative_prompt',
  'reference_information_extracted_multiple', 'reference_strength_multiple',
])

function tryParseNAI(raw: Record<string, unknown>): NAIParsedResult | null {
  // UserComment는 TIFF 파서 경유시 "Exif::UserComment" 키로 들어옴
  // PNG tEXt 경유시 "Comment" 키로 들어옴
  const ucRaw = raw['Exif::UserComment'] ?? raw['UserComment'] ?? raw['Comment']
  let ucStr: string | null = null
  if (typeof ucRaw === 'string') ucStr = ucRaw.trim()

  if (!ucStr?.startsWith('{')) return null

  let outer: Record<string, unknown>
  try { outer = JSON.parse(ucStr) } catch { return null }
  if (!('Comment' in outer)) return null

  let params: Record<string, unknown>
  try { params = JSON.parse(outer['Comment'] as string) } catch { return null }
  if (!('prompt' in params) && !('steps' in params)) return null

  const primary: Record<string, unknown>   = {}
  const secondary: Record<string, unknown> = {}

  for (const key of PRIMARY_FIELDS) {
    if (!(key in params) || HIDDEN_FIELDS.has(key)) continue
    let val = params[key]
    if (key === 'sampler' && typeof val === 'string') val = SAMPLER_LABELS[val] ?? val
    primary[key] = val
  }
  for (const key of SECONDARY_FIELDS) {
    if (!(key in params) || HIDDEN_FIELDS.has(key)) continue
    secondary[key] = params[key]
  }

  const software =
    (raw['IFD0::Software'] as string | undefined) ??
    (outer['Software'] as string | undefined)

  let charCaptions: NAIParsedResult['charCaptions']
  const v4p = params['v4_prompt'] as {
    caption?: { char_captions?: Array<{ char_caption: string; centers?: Array<{ x: number; y: number }> }> }
  } | undefined
  if (v4p?.caption?.char_captions?.length) {
    charCaptions = v4p.caption.char_captions.map(cc => ({
      caption: cc.char_caption,
      x: cc.centers?.[0]?.x ?? 0,
      y: cc.centers?.[0]?.y ?? 0,
    }))
  }

  return { software, primary, secondary, charCaptions }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function readMetadata(file: File): Promise<MetadataResult | null> {
  const buf = await file.arrayBuffer()
  const ext = file.name.toLowerCase().split('.').pop() ?? ''

  try {
    let raw: Record<string, unknown> = {}
    let hasRealMeta = false

    // ── WebP ────────────────────────────────────────────────────────────────
    if (file.type === 'image/webp' || ext === 'webp') {
      if (webpHasMetaChunks(buf)) {
        hasRealMeta = true
        raw = { ...raw, ...parseWebpExif(buf) }
        // Mark which meta chunks exist
        const chunks = parseWebpChunks(buf)
        for (const c of chunks) {
          if (['XMP ', 'ICCP'].includes(c.fourcc)) raw[`Chunk::${c.fourcc.trim()}`] = `${c.size} bytes`
        }
      }
    }

    // ── JPEG ────────────────────────────────────────────────────────────────
    else if (file.type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg') {
      const exif = parseJpegExif(buf)
      if (Object.keys(exif).length > 0) { hasRealMeta = true; raw = { ...raw, ...exif } }
    }

    // ── PNG ─────────────────────────────────────────────────────────────────
    else if (file.type === 'image/png' || ext === 'png') {
      // PNG tEXt/iTXt chunks (NAI, SD, ComfyUI store metadata here)
      const textChunks = await parsePngMetadataChunks(file)
      if (Object.keys(textChunks).length > 0) { hasRealMeta = true; raw = { ...raw, ...textChunks } }
    }

    // ── 확장자 불명확한 경우: 모두 시도 ────────────────────────────────────
    else {
      const u8 = new Uint8Array(buf)
      if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) {
        // RIFF → WebP
        if (webpHasMetaChunks(buf)) { hasRealMeta = true; raw = { ...raw, ...parseWebpExif(buf) } }
      } else if (u8[0] === 0xFF && u8[1] === 0xD8) {
        // JPEG
        const exif = parseJpegExif(buf)
        if (Object.keys(exif).length > 0) { hasRealMeta = true; raw = { ...raw, ...exif } }
      } else if (u8[0] === 0x89 && u8[1] === 0x50) {
        // PNG
        const textChunks = await parsePngMetadataChunks(file)
        if (Object.keys(textChunks).length > 0) { hasRealMeta = true; raw = { ...raw, ...textChunks } }
      }
    }

    if (!hasRealMeta) return null

    const nai = tryParseNAI(raw)
    return { raw, nai }
  } catch {
    return null
  }
}
