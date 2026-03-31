import { useState } from 'react'
import type { BatchSettings as BatchSettingsType, ImageFormat } from '../types'

interface BatchSettingsProps {
  settings: BatchSettingsType
  onChange: (s: BatchSettingsType) => void
}

const ChevronIcon = () => (
  <svg className="select-icon" width="16" height="16" viewBox="0 0 24 24">
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export function BatchSettings({ settings, onChange }: BatchSettingsProps) {
  const [customPct, setCustomPct] = useState('75')
  const isPng = settings.format === 'png'
  const isCustom =
    typeof settings.resize === 'number' &&
    settings.resize !== 80 &&
    settings.resize !== 50

  function handleResizeChange(val: string) {
    if (val === 'original') {
      onChange({ ...settings, resize: 'original' })
    } else if (val === '80') {
      onChange({ ...settings, resize: 80 })
    } else if (val === '50') {
      onChange({ ...settings, resize: 50 })
    } else if (val === 'custom') {
      const pct = Math.min(99, Math.max(1, parseInt(customPct, 10) || 75))
      onChange({ ...settings, resize: pct })
    }
  }

  function handleCustomPctChange(raw: string) {
    setCustomPct(raw)
    const n = parseInt(raw, 10)
    if (!isNaN(n)) {
      const clamped = Math.min(99, Math.max(1, n))
      onChange({ ...settings, resize: clamped })
    }
  }

  const resizeSelectValue =
    settings.resize === 'original' ? 'original'
    : settings.resize === 80 ? '80'
    : settings.resize === 50 ? '50'
    : 'custom'

  return (
    <div className="controls-section">
      <h3 className="subtitle">일괄 설정</h3>

      <div className="control-group">
        <label className="control-label">출력 형식</label>
        <div className="select-wrapper">
          <select
            value={settings.format}
            onChange={e => onChange({ ...settings, format: e.target.value as ImageFormat })}
          >
            <option value="png">PNG (무손실)</option>
            <option value="webp">WebP</option>
            <option value="jpeg">JPEG</option>
          </select>
          <ChevronIcon />
        </div>
      </div>

      <div className="settings-row">
        <div className="control-group">
          <label className="control-label">화질</label>
          <div className="select-wrapper">
            <select
              value={isPng ? 'lossless' : settings.quality}
              disabled={isPng}
              onChange={e => onChange({ ...settings, quality: Number(e.target.value) })}
            >
              {isPng ? (
                <option value="lossless">무손실 (PNG)</option>
              ) : (
                <>
                  <option value={100}>100%</option>
                  <option value={90}>90%</option>
                  <option value={80}>80%</option>
                  <option value={70}>70%</option>
                  <option value={60}>60%</option>
                  <option value={50}>50%</option>
                </>
              )}
            </select>
            <ChevronIcon />
          </div>
        </div>

        <div className="control-group">
          <label className="control-label">크기</label>
          <div className="select-wrapper">
            <select
              value={resizeSelectValue}
              onChange={e => handleResizeChange(e.target.value)}
            >
              <option value="original">원본 유지</option>
              <option value="80">원본의 80%</option>
              <option value="50">원본의 50%</option>
              <option value="custom">사용자 지정</option>
            </select>
            <ChevronIcon />
          </div>
          {isCustom && (
            <div className="custom-input-row">
              <input
                className="custom-input"
                type="number"
                min={1}
                max={99}
                value={customPct}
                onChange={e => handleCustomPctChange(e.target.value)}
                onBlur={() => {
                  const clamped = Math.min(99, Math.max(1, parseInt(customPct, 10) || 75))
                  setCustomPct(String(clamped))
                  onChange({ ...settings, resize: clamped })
                }}
              />
              <span className="custom-input-unit">%</span>
            </div>
          )}
        </div>
      </div>

      <div className="control-group" style={{ marginTop: '1rem' }}>
        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', gap: '8px' }}>
          <input
            type="checkbox"
            checked={!!settings.deepClean}
            onChange={e => onChange({ ...settings, deepClean: e.target.checked })}
            style={{ marginTop: '3px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>딥 클린 (Deep Clean)</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.7, lineHeight: 1.4 }}>
              NovelAI 등에서 숨겨놓은 "보이지 않는 메타데이터"(스테가노그래피)까지 픽셀 단위로 파괴합니다.
              알파 채널이 제거되며 미세한 픽셀 변동이 발생할 수 있습니다.
            </span>
          </div>
        </label>
      </div>
    </div>
  )
}
