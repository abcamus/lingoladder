import type { Skill } from '../../types'

interface SkillDetailModalProps {
  skill: Skill | null
  onClose: () => void
}

export function SkillDetailModal({ skill, onClose }: SkillDetailModalProps) {
  if (skill === null) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-title">{skill.icon} {skill.title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-stat">
            <div className="modal-stat-icon" style={{ background: skill.colorLight }}>{skill.icon}</div>
            <div>
              <div className="modal-stat-val" style={{ color: skill.color }}>{skill.score}</div>
              <div className="modal-stat-label">当前分数</div>
            </div>
          </div>
          <div className="modal-progress">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>进度</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: skill.color }}>{skill.score}%</span>
            </div>
            <div className="modal-progress-bar">
              <div
                className="modal-progress-fill"
                style={{ width: `${skill.score}%`, background: skill.color }}
              />
            </div>
          </div>
          <ul className="modal-tasks">
            {skill.tasks.map((task, i) => (
              <li key={task} className={`modal-task ${skill.done[i] ? 'done' : ''}`}>
                <span className="modal-task-icon">{skill.done[i] ? '✓' : ''}</span>
                <span className="modal-task-text">{task}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>关闭</button>
          <button className="modal-btn pr" onClick={onClose}>开始练习</button>
        </div>
      </div>
    </div>
  )
}
