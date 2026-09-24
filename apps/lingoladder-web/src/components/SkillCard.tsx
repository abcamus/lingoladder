import { useEffect, useRef } from 'react'
import type { Skill } from '../types'

const RING_R = 34
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R
const ANIM_DURATION = 1000

interface SkillCardProps {
  skill: Skill
  onClick: (id: string) => void
}

export function SkillCard({ skill, onClick }: SkillCardProps) {
  const ringRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const el = ringRef.current
    if (el === null) return

    const offset = RING_CIRCUMFERENCE * (1 - skill.score / 100)
    el.style.strokeDasharray = String(RING_CIRCUMFERENCE)
    el.style.strokeDashoffset = String(RING_CIRCUMFERENCE)

    let raf: number
    const start = performance.now()

    const animate = (now: number) => {
      const t = Math.min((now - start) / ANIM_DURATION, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      el.style.strokeDashoffset = String(RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE - offset) * ease)
      if (t < 1) raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(raf) }
  }, [skill.score])

  const doneCount = skill.done.filter(Boolean).length

  return (
    <div className="skill-card" onClick={() => { onClick(skill.id) }}>
      <div className="skill-card-top">
        <div className="skill-ring-wrap">
          <svg viewBox="0 0 80 80" className="skill-ring-svg">
            <circle cx="40" cy="40" r={RING_R} className="skill-ring-bg" />
            <circle
              ref={ringRef}
              cx="40"
              cy="40"
              r={RING_R}
              className="skill-ring"
              style={{ stroke: skill.color, transform: 'rotate(-90deg)', transformOrigin: 'center' }}
            />
          </svg>
          <div className="skill-ring-icon">{skill.icon}</div>
        </div>
        <div className="skill-card-info">
          <div className="skill-card-name">{skill.title.replace(/^.\s*/, '')}</div>
          <span className="skill-cefr" style={{ background: skill.colorLight, color: skill.color }}>{skill.level}</span>
        </div>
      </div>

      <div className="skill-score-row">
        <span className="skill-score-num" style={{ color: skill.color }}>{skill.score}</span>
        <span className="skill-score-label">/ 100</span>
        <span className="skill-task-count">{doneCount}/{skill.tasks.length}</span>
      </div>

      <div className="skill-tasks">
        {skill.tasks.map((task, i) => (
          <div key={task} className="skill-task">
            <span className="skill-task-check" style={{
              borderColor: skill.done[i] ? skill.color : 'var(--bd)',
              background: skill.done[i] ? skill.color : 'transparent',
              color: skill.done[i] ? '#fff' : 'transparent',
            }}>{skill.done[i] ? '✓' : ''}</span>
            <span className="skill-task-text" style={{ color: skill.done[i] ? 'var(--tx)' : 'var(--tx3)' }}>{task}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
