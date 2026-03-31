import JSZip from 'jszip'
import { saveAs } from 'file-saver'

export function downloadSingle(blob: Blob, filename: string): void {
  saveAs(blob, filename)
}

export async function downloadZip(files: Array<{ blob: Blob; filename: string }>): Promise<void> {
  const zip = new JSZip()
  for (const { blob, filename } of files) {
    zip.file(filename, blob)
  }
  const out = await zip.generateAsync({ type: 'blob' })
  saveAs(out, 'cleaned-images.zip')
}
