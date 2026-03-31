export type ImageFormat = 'png' | 'jpeg' | 'webp'

export interface ConvertOptions {
  format: ImageFormat
  quality: number             // 0–100 (PNG는 무손실이므로 무시됨)
  resize: number | 'original' // 퍼센트 기준 (예: 80 = 원본의 80%), 'original' = 크기 유지
  deepClean?: boolean         // 메타데이터 완전 박멸 (알파 채널 제거 및 픽셀 미세 변동으로 스테가노그래피 파괴)
}

// BatchSettings aliases ConvertOptions
export type BatchSettings = ConvertOptions

// NAI parsed metadata (NovelAI / SD)
export interface NAIParsedResult {
  software?: string
  primary: Record<string, unknown>
  secondary: Record<string, unknown>
  charCaptions?: Array<{ caption: string; x: number; y: number }>
}

export interface MetadataResult {
  raw: Record<string, unknown>
  nai: NAIParsedResult | null
}

export interface FileState {
  id: string
  file: File
  objectUrl: string
  metadata: MetadataResult | null
  status: 'reading' | 'clean' | 'dirty' | 'error'
  outputName?: string    // overrides file.name when renamed due to duplicate
  thumbnailUrl?: string  // small resized blob URL for preview
}
