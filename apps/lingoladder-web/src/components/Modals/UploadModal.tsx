import { useRef, useState } from 'react'
import { extractPdfText } from '../../lib/materials'

interface UploadModalProps {
  onClose: () => void
  onAdd: (name: string, content: string) => void
}

const UPLOAD_ACCEPT = '.txt,.md,.srt,.vtt,.csv,.json,.html,.htm,.pdf'

/** Whether the selected file is a PDF; those extract their text on the server. */
function isPdfFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
}

/** Derive a material name from a selected file name by stripping the extension. */
function nameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot > 0 ? fileName.slice(0, dot) : fileName
  return base.trim()
}

export function UploadModal({ onClose, onAdd }: UploadModalProps) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFiles = async (files: FileList | null): Promise<void> => {
    const file = files?.[0]
    if (file === undefined) return
    if (isPdfFile(file.name)) {
      setExtracting(true)
      setError(null)
      try {
        const { text } = await extractPdfText(file)
        setContent(text)
        if (name.trim() === '') setName(nameFromFile(file.name))
      } catch (error) {
        setError(error instanceof Error ? error.message : 'PDF 文本提取失败，请重试')
      } finally {
        setExtracting(false)
      }
      return
    }
    try {
      const text = await file.text()
      setContent(text)
      setError(null)
      if (name.trim() === '') setName(nameFromFile(file.name))
    } catch {
      setError('无法读取该文件，请换用文本格式（TXT / MD / SRT 等）')
    }
  }

  const submit = (): void => {
    if (name.trim() === '' || content.trim() === '') {
      setError('请填写资料名称并导入内容')
      return
    }
    onAdd(name.trim(), content)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-title">📁 添加学习资料</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => { void readFiles(e.target.files) }}
          />
          <div className="upload-zone" onClick={() => { fileInputRef.current?.click() }}>
            <div className="upload-zone-icon">📁</div>
            <div className="upload-zone-text">{extracting ? '正在提取 PDF 文本…' : '点击选择文件，或直接在下方粘贴文本'}</div>
            <div className="upload-zone-sub">支持 TXT / MD / SRT / VTT / PDF 等格式</div>
            <div className="upload-formats">
              <span className="upload-format">TXT</span>
              <span className="upload-format">MD</span>
              <span className="upload-format">SRT</span>
              <span className="upload-format">VTT</span>
              <span className="upload-format">PDF</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">资料名称</label>
            <input
              className="form-input"
              type="text"
              placeholder="例如：BBC 6min English - Social media"
              value={name}
              onChange={(e) => { setName(e.target.value) }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">资料内容</label>
            <textarea
              className="form-input"
              rows={8}
              placeholder="选择文件后自动导入，或直接粘贴英语文章 / 字幕 / 转录文本…"
              value={content}
              onChange={(e) => { setContent(e.target.value) }}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>
          {error !== null && (
            <div style={{ fontSize: 12, color: 'var(--bad, #e05252)', marginTop: 8 }}>{error}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>取消</button>
          <button className="modal-btn pr" onClick={submit}>添加资料</button>
        </div>
      </div>
    </div>
  )
}
