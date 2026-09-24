import { useState } from 'react'

interface AIFindModalProps {
  onClose: () => void
  onFind: (topic: string) => void
  /** The learner's current CEFR level, shown as the default difficulty. */
  currentLevel: string
}

export function AIFindModal({ onClose, onFind, currentLevel }: AIFindModalProps) {
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (): void => {
    if (topic.trim() === '') {
      setError('请填写感兴趣的主题')
      return
    }
    onFind(topic.trim())
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-title">🤖 AI 找资料</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">你想学什么？（可选）</label>
            <input
              className="form-input"
              placeholder="商务英语、日常对话、TED演讲… 留空则由 AI 根据你的能力决定"
              value={topic}
              onChange={(e) => { setTopic(e.target.value) }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6 }}>
            AI 会根据你的学习记录（当前 {currentLevel}，各维度练习情况）自动搜索、
            抓取并保存一份合适的学习资料，完成后出现在资料列表中。
          </div>
          {error !== null && (
            <div style={{ fontSize: 12, color: 'var(--bad, #e05252)', marginTop: 8 }}>{error}</div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>取消</button>
          <button className="modal-btn pr" onClick={submit}>开始获取</button>
        </div>
      </div>
    </div>
  )
}
