import { useState, useCallback } from 'react'
import type { FileState, BatchSettings } from '../types'
import { readMetadata }   from '../utils/metadata'
import { createThumbnail } from '../utils/thumbnail'
import { processImage } from '../utils/imageProcessor'
import { downloadSingle, downloadZip } from '../utils/downloader'

function newId(): string {
  return Math.random().toString(36).slice(2)
}

function outputExt(format: string): string {
  return format === 'jpeg' ? 'jpg' : format
}

const DEFAULT_SETTINGS: BatchSettings = {
  format: 'png',
  quality: 100,
  resize: 'original',
  deepClean: false,
}

export function useFileQueue() {
  const [files, setFiles]           = useState<FileState[]>([])
  const [settings, setSettings]     = useState<BatchSettings>(DEFAULT_SETTINGS)
  const [processing, setProcessing] = useState(false)

  /** nameMap: optional override of file.name per File (for duplicate rename) */
  const addFiles = useCallback(async (newFiles: File[], nameMap?: Map<File, string>) => {
    const pending: FileState[] = newFiles.map(f => ({
      id: newId(),
      file: f,
      objectUrl: URL.createObjectURL(f),
      metadata: null,
      status: 'reading' as const,
      outputName: nameMap?.get(f),
    }))

    setFiles(prev => [...prev, ...pending])

    for (const state of pending) {
      try {
        const [meta, thumbUrl] = await Promise.all([
          readMetadata(state.file),
          createThumbnail(state.file).catch(() => undefined),
        ])
        setFiles(prev =>
          prev.map(f =>
            f.id === state.id
              ? { ...f, metadata: meta, status: meta ? 'dirty' : 'clean', thumbnailUrl: thumbUrl }
              : f
          )
        )
      } catch {
        setFiles(prev =>
          prev.map(f => f.id === state.id ? { ...f, status: 'error' } : f)
        )
      }
    }
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id)
      if (target) {
        URL.revokeObjectURL(target.objectUrl)
        if (target.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl)
      }
      return prev.filter(f => f.id !== id)
    })
  }, [])

  const reset = useCallback(() => {
    setFiles(prev => {
      prev.forEach(f => {
        URL.revokeObjectURL(f.objectUrl)
        if (f.thumbnailUrl) URL.revokeObjectURL(f.thumbnailUrl)
      })
      return []
    })
  }, [])

  const downloadOne = useCallback(async (id: string) => {
    const target = files.find(f => f.id === id)
    if (!target) return
    const blob = await processImage(target.file, settings)
    const ext  = outputExt(settings.format)
    const base = (target.outputName ?? target.file.name).replace(/\.[^.]+$/, '')
    downloadSingle(blob, `${base}.${ext}`)
  }, [files, settings])

  const processAll = useCallback(async () => {
    if (files.length === 0 || processing) return
    setProcessing(true)
    try {
      const ext     = outputExt(settings.format)
      const results: Array<{ blob: Blob; filename: string }> = []

      for (const f of files) {
        const blob = await processImage(f.file, settings)
        const base = (f.outputName ?? f.file.name).replace(/\.[^.]+$/, '')
        results.push({ blob, filename: `${base}.${ext}` })
      }

      if (results.length === 1) {
        downloadSingle(results[0].blob, results[0].filename)
      } else {
        await downloadZip(results)
      }
    } catch (e) {
      setProcessing(false)
      throw e
    }
    setProcessing(false)
  }, [files, settings, processing])

  return {
    files,
    settings,
    setSettings,
    addFiles,
    removeFile,
    reset,
    downloadOne,
    processAll,
    processing,
  }
}
