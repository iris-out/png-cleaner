interface DuplicateModalProps {
  conflictNames: string[]
  onRename: () => void
  onCancel: () => void
}

export function DuplicateModal({ conflictNames, onRename, onCancel }: DuplicateModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-icon">
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <div className="modal-body">
          <h2 className="modal-title">중복 파일명 감지</h2>
          <p className="modal-desc">
            이미 목록에 있는 파일과 이름이 겹칩니다. 어떻게 처리할까요?
          </p>

          <ul className="modal-conflict-list">
            {conflictNames.map(name => (
              <li key={name} className="modal-conflict-item">
                <svg width="12" height="12" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                {name}
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onCancel}>
            취소하기
          </button>
          <button className="btn btn-primary" onClick={onRename}>
            이름에 (1), (2) 추가하기
          </button>
        </div>
      </div>
    </div>
  )
}
