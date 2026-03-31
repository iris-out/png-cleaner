interface BottomBarProps {
  onReset: () => void
  onProcessAll: () => void
  disabled: boolean
  processing: boolean
}

export function BottomBar({ onReset, onProcessAll, disabled, processing }: BottomBarProps) {
  return (
    <div className="bottom-bar">
      <div className="bottom-bar-inner">
        <button className="btn btn-outline btn-reset" onClick={onReset} disabled={disabled}>
          초기화
        </button>
        <button
          className="btn btn-primary"
          onClick={onProcessAll}
          disabled={disabled || processing}
        >
          {processing ? (
            <>
              <svg className="spin" width="16" height="16" viewBox="0 0 24 24">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              처리 중…
            </>
          ) : (
            '정리 후 전체 다운로드'
          )}
        </button>
      </div>
    </div>
  )
}
