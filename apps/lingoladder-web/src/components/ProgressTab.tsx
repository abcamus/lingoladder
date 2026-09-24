import type { Skill } from '../types'

interface ProgressTabProps {
  skills: Skill[]
  /** Consecutive learning days derived from real learning records. */
  streakDays: number
}

/** Short chip label for the first activity kind with a nonzero count. */
const ACTIVITY_SHORT: Record<string, string> = { 完成练习: '练习', 积累词汇: '词汇', 分析材料: '材料' }

export function ProgressTab({ skills, streakDays }: ProgressTabProps) {
  return (
    <>
      {skills.map((s) => {
        const active = s.tasks.find(task => !task.endsWith('×0'))
        const chip = active === undefined
          ? '—'
          : (ACTIVITY_SHORT[active.match(/^(完成练习|积累词汇|分析材料)/)?.[1] ?? ''] ?? '') + ' ' + (active.match(/×\d+$/)?.[0] ?? '')
        return (
          <div key={s.id} className="progress-stat">
            <div className="progress-icon" style={{ background: s.colorLight }}>{s.icon}</div>
            <div className="progress-info">
              <div className="progress-label">{s.title.replace(/^.\s*/, '')}</div>
              <div className="progress-val" style={{ color: s.color }}>{s.score}</div>
            </div>
            <div className="progress-change progress-up">{chip.trim()}</div>
          </div>
        )
      })}
      <div className="progress-stat">
        <div className="progress-icon" style={{ background: '#FEF3C7' }}>🔥</div>
        <div className="progress-info">
          <div className="progress-label">连续学习</div>
          <div className="progress-val" style={{ color: '#D97706' }}>{streakDays} 天</div>
        </div>
        <div className="progress-change progress-streak">{streakDays > 0 ? '保持!' : '开始!'}</div>
      </div>
    </>
  )
}
