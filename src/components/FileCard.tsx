import { useState } from 'react'
import type { FileState } from '../types'

interface FileCardProps {
  file: FileState
  onRemove: (id: string) => void
  onDownload: (id: string) => void
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024)        return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const PRIMARY_LABELS: Record<string, string> = {
  prompt:  '프롬프트',
  uc:      '네거티브',
  seed:    '시드',
  steps:   '스텝',
  sampler: '샘플러',
  scale:   'CFG 스케일',
  width:   '너비',
  height:  '높이',
}

const SECONDARY_LABELS: Record<string, string> = {
  noise_schedule:                  '노이즈 스케줄',
  uncond_scale:                    'Uncond 스케일',
  cfg_rescale:                     'CFG 리스케일',
  sm:                              'SMEA',
  sm_dyn:                          'SMEA DYN',
  dynamic_thresholding:            'Dyn. 스레숄딩',
  dynamic_thresholding_percentile: 'DT 퍼센타일',
  prefer_brownian:                 'Prefer Brownian',
  skip_cfg_above_sigma:            'Skip CFG Above σ',
  skip_cfg_below_sigma:            'Skip CFG Below σ',
  controlnet_strength:             'ControlNet 강도',
  controlnet_model:                'ControlNet 모델',
  lora_unet_weights:               'LoRA UNet',
  lora_clip_weights:               'LoRA CLIP',
  n_samples:                       '샘플 수',
  legacy_v3_extend:                'Legacy V3 확장',
}

function renderValue(key: string, val: unknown): string {
  if (typeof val === 'boolean') return val ? '✓' : '–'
  if (val === null || val === undefined) return '–'
  if (typeof val === 'object') return JSON.stringify(val)
  if ((key === 'scale' || key === 'cfg_rescale') && typeof val === 'number') return val.toFixed(1)
  return String(val)
}

/** "IFD0::Software" → "Software",  "Exif::UserComment" → "UserComment" 등 접두사 제거 */
function cleanKey(key: string): string {
  const idx = key.indexOf('::')
  return idx >= 0 ? key.slice(idx + 2) : key
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td className="metadata-key">{label}</td>
      <td className={`metadata-value${mono ? ' metadata-mono' : ''}`}>{value}</td>
    </tr>
  )
}

export function FileCard({ file, onRemove, onDownload }: FileCardProps) {
  const [expanded, setExpanded] = useState(false)

  const isReading = file.status === 'reading'
  const isDirty   = file.status === 'dirty'
  const isError   = file.status === 'error'

  const nai = file.metadata?.nai
  const raw = file.metadata?.raw

  return (
    <div className={`file-card${expanded ? ' expanded' : ''}`}>
      <div
        className="file-header"
        onClick={() => !isReading && setExpanded(p => !p)}
        style={{ cursor: isReading ? 'default' : 'pointer' }}
      >
        <div className="file-info-main">
          <div className="file-thumb-wrap">
            {file.thumbnailUrl ? (
              <img className="file-thumb" src={file.thumbnailUrl} alt="" />
            ) : (
              <div className="file-thumb file-thumb--placeholder">
                <svg width="14" height="14" viewBox="0 0 24 24" opacity="0.4">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
            )}
          </div>

          <div className="file-details">
            <span className="file-name">{file.outputName ?? file.file.name}</span>
            <div className="file-meta-row">
              {!isReading && <span className="file-size">{formatSize(file.file.size)}</span>}
              {isReading ? (
                <span className="status-pill status-pill--reading" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>분석 중…</span>
              ) : isError ? (
                <span className="status-pill status-pill--error" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>오류</span>
              ) : isDirty ? (
                <span className="status-pill status-pill--dirty" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>데이터 존재함</span>
              ) : (
                <span className="status-pill status-pill--clean" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>데이터 없음</span>
              )}
            </div>
          </div>
        </div>

        <div className="file-actions">
          {!isReading && (
            <button
              className="file-action-btn"
              onClick={e => { e.stopPropagation(); onDownload(file.id) }}
              title="정리 후 저장"
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              지금 설정대로 저장
            </button>
          )}
          <button
            className="icon-btn"
            onClick={e => { e.stopPropagation(); onRemove(file.id) }}
            title="삭제"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {!isReading && (
            <svg className="chevron" width="20" height="20" viewBox="0 0 24 24">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      <div className="file-content">
        {isDirty && nai ? (
          <div>
            {nai.software && (
              <div className="nai-software-badge">{nai.software}</div>
            )}
            <table className="metadata-table">
              <tbody>
                {Object.entries(nai.primary).map(([k, v]) => (
                  <MetaRow key={k} label={PRIMARY_LABELS[k] ?? k} value={renderValue(k, v)} mono={k === 'seed'} />
                ))}
              </tbody>
            </table>

            {nai.charCaptions && nai.charCaptions.length > 0 && (
              <div className="metadata-section">
                <div className="metadata-section-title">캐릭터 프롬프트</div>
                {nai.charCaptions.map((cc, i) => (
                  <div key={i} className="char-caption">
                    <span className="char-caption-pos">
                      ({Math.round(cc.x * 100)}%, {Math.round(cc.y * 100)}%)
                    </span>
                    <span className="char-caption-text">{cc.caption}</span>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(nai.secondary).length > 0 && (
              <details className="metadata-advanced">
                <summary className="metadata-advanced-toggle">
                  고급 설정 ({Object.keys(nai.secondary).length}개 항목)
                </summary>
                <table className="metadata-table">
                  <tbody>
                    {Object.entries(nai.secondary).map(([k, v]) => (
                      <MetaRow key={k} label={SECONDARY_LABELS[k] ?? k} value={renderValue(k, v)} />
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        ) : isDirty && raw ? (
          <table className="metadata-table">
            <tbody>
              {Object.entries(raw)
                .filter(([, v]) => v !== null && v !== undefined)
                .slice(0, 30)
                .map(([k, v]) => (
                  <MetaRow key={k} label={cleanKey(k)} value={renderValue(k, v)} />
                ))}
            </tbody>
          </table>
        ) : (
          <div className="no-metadata">
            <svg width="14" height="14" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            메타데이터 없음. 클린한 파일입니다.
          </div>
        )}
      </div>
    </div>
  )
}
