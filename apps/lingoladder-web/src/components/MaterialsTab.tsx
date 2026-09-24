import type { Material } from '../types'

interface MaterialsTabProps {
  materials: Material[]
  onUpload: () => void
  onAiFind: () => void
  onDelete: (id: string) => void
  onAnalyze: (id: string) => void
  onPractice: (id: string) => void
}

export function MaterialsTab({ materials, onUpload, onAiFind, onDelete, onAnalyze, onPractice }: MaterialsTabProps) {
  return (
    <>
      {materials.map(m => (
        <div key={m.id} className="material-item" title={m.meta}>
          <div className="material-icon" style={{ background: m.iconBg }}>{m.icon}</div>
          <div className="material-info">
            <div className="material-name">{m.name}</div>
            <div className="material-meta">
              <span>{m.type}</span>
              <span className={`material-badge badge-${m.badge}`}>
                {m.badge === 'ready' ? '已分析' : '新'}
              </span>
            </div>
          </div>
          <div className="material-actions">
            <button
              className="material-action-btn"
              onClick={() => { onAnalyze(m.id) }}
              title="用 AI 分析这份资料"
            >🔍</button>
            <button
              className="material-action-btn"
              onClick={() => { onPractice(m.id) }}
              title="基于这份资料开始训练"
            >📝</button>
            <button
              className="material-action-btn"
              onClick={() => { onDelete(m.id) }}
              title="删除这份资料"
            >🗑️</button>
          </div>
        </div>
      ))}
      <div className="material-item" style={{ borderStyle: 'dashed', justifyContent: 'center' }} onClick={onAiFind}>
        <span style={{ fontSize: 24 }}>✨</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx3)' }}>AI 找资料</span>
      </div>
      <div className="material-item" style={{ borderStyle: 'dashed', justifyContent: 'center' }} onClick={onUpload}>
        <span style={{ fontSize: 24 }}>+</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx3)' }}>添加资料</span>
      </div>
    </>
  )
}
