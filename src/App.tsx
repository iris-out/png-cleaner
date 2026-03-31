import { useState }          from 'react'
import { Header }            from './components/Header'
import { DropZone }          from './components/DropZone'
import { BatchSettings }     from './components/BatchSettings'
import { FileList }          from './components/FileList'
import { BottomBar }         from './components/BottomBar'
import { ToastContainer }    from './components/Toast'
import { DuplicateModal }    from './components/DuplicateModal'
import { useFileQueue }      from './hooks/useFileQueue'
import { useToast }          from './hooks/useToast'

function getBaseName(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

function getExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(idx) : ''
}

function App() {
  const {
    files,
    settings,
    setSettings,
    addFiles,
    removeFile,
    reset,
    downloadOne,
    processAll,
    processing,
  } = useFileQueue()

  const { toasts, showToast, dismissToast } = useToast()

  const [pendingFiles, setPendingFiles]     = useState<File[] | null>(null)
  const [conflictNames, setConflictNames]   = useState<string[]>([])

  // ── Duplicate detection ──────────────────────────────────────────────────

  function handleDropFiles(newFiles: File[]) {
    const existingBases = new Set(
      files.map(f => getBaseName(f.outputName ?? f.file.name))
    )
    const duplicates = newFiles.filter(f => existingBases.has(getBaseName(f.name)))

    if (duplicates.length > 0) {
      setPendingFiles(newFiles)
      setConflictNames(duplicates.map(f => f.name))
    } else {
      addFiles(newFiles)
    }
  }

  function handleRename() {
    if (!pendingFiles) return

    // Build taken base names from existing queue
    const taken = new Set(
      files.map(f => getBaseName(f.outputName ?? f.file.name))
    )
    const nameMap = new Map<File, string>()

    for (const f of pendingFiles) {
      const base = getBaseName(f.name)
      const ext  = getExt(f.name)
      if (taken.has(base)) {
        let n = 1
        while (taken.has(`${base} (${n})`)) n++
        const newName = `${base} (${n})${ext}`
        nameMap.set(f, newName)
        taken.add(`${base} (${n})`)
      } else {
        taken.add(base)
      }
    }

    addFiles(pendingFiles, nameMap)
    setPendingFiles(null)
    setConflictNames([])
  }

  function handleCancelDuplicates() {
    setPendingFiles(null)
    setConflictNames([])
  }

  // ── processAll with toast ────────────────────────────────────────────────

  async function handleProcessAll() {
    try {
      await processAll()
      const count = files.length
      if (count === 1) {
        showToast('success', '저장 완료', '파일이 저장되었습니다.')
      } else {
        showToast('success', '저장 완료', `${count}개 파일이 ZIP으로 저장되었습니다.`)
      }
    } catch (e) {
      showToast('error', '오류 발생', e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.')
    }
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {pendingFiles && (
        <DuplicateModal
          conflictNames={conflictNames}
          onRename={handleRename}
          onCancel={handleCancelDuplicates}
        />
      )}
      <div className="app-container">
        <Header />
        <div className="two-col">
          <div className="col-left">
            <DropZone onFiles={handleDropFiles} />
            <BatchSettings settings={settings} onChange={setSettings} />
          </div>
          <div className="col-right">
            <FileList files={files} onRemove={removeFile} onDownload={downloadOne} />
          </div>
        </div>
      </div>
      <BottomBar
        onReset={reset}
        onProcessAll={handleProcessAll}
        disabled={files.length === 0}
        processing={processing}
      />
    </>
  )
}

export default App
