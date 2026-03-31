import type { FileState } from '../types'
import { FileCard } from './FileCard'

interface FileListProps {
  files: FileState[]
  onRemove: (id: string) => void
  onDownload: (id: string) => void
}

export function FileList({ files, onRemove, onDownload }: FileListProps) {
  return (
    <div className="controls-section file-list-section">
      <h3 className="subtitle">
        파일 목록{files.length > 0 ? ` (${files.length}개)` : ''}
      </h3>

      {files.length === 0 ? (
        <div className="file-list-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" opacity="0.3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p>파일을 드롭하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="file-list">
          {files.map(f => (
            <FileCard key={f.id} file={f} onRemove={onRemove} onDownload={onDownload} />
          ))}
        </div>
      )}
    </div>
  )
}
