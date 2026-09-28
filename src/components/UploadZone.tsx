/**
 * UploadZone — drag-and-drop + click-to-browse file upload area.
 */

import { useRef, useState } from 'react'

/**
 * Text formats only. PDF and DOCX would need a parser dependency; the app
 * reads file contents directly so it can chunk and embed them locally.
 */
const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.tsv']
const ACCEPTED_TYPES = ['text/plain', 'text/markdown', 'text/csv', 'application/json']

interface UploadZoneProps {
  onUpload: (file: File) => void
  disabled?: boolean
}

export default function UploadZone({ onUpload, disabled = false }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      if (
        ACCEPTED_TYPES.includes(file.type) ||
        ACCEPTED_EXTENSIONS.some((ext) => file.name.endsWith(ext))
      ) {
        onUpload(file)
      }
    })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) handleFiles(e.dataTransfer.files)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="w-full rounded-xl border border-dashed py-4 flex flex-col items-center gap-1.5 text-xs transition-colors"
        style={{
          borderColor: dragging ? '#3f3f46' : '#1e1e22',
          color: dragging ? '#e4e4e7' : '#a1a1aa',
          backgroundColor: dragging ? 'rgba(255,255,255,0.04)' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span className="text-lg" style={{ color: dragging ? '#fafafa' : '#a1a1aa' }}>+</span>
        <span>{dragging ? 'Drop to upload' : 'Upload documents'}</span>
        <span style={{ color: '#52525b', fontSize: 10 }}>TXT · MD · CSV · JSON</span>
      </button>
    </>
  )
}
