import type { Skill } from '../types'

const SKILL_CIRCUMFERENCE = 389.56

interface SkillOrbProps {
  skill: Skill
  position: string
  onClick: (id: string) => void
}

function SkillOrb({ skill, position, onClick }: SkillOrbProps) {
  const offset = SKILL_CIRCUMFERENCE * (1 - skill.score / 100)

  return (
    <div className={`skill-orb ${position}`} onClick={() => { onClick(skill.id) }}>
      <svg viewBox="0 0 140 140" style={{ width: '100%', height: '100%' }}>
        <circle className="skill-ring-bg" cx="70" cy="70" r="62" />
        <circle
          className="skill-ring"
          cx="70"
          cy="70"
          r="62"
          stroke={skill.color}
          strokeDasharray={SKILL_CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${skill.color})` }}
        />
      </svg>
      <div className="skill-icon-wrap">
        <div className="skill-icon" style={{ background: skill.colorLight }}>{skill.icon}</div>
        <div className="skill-score" style={{ color: skill.color }}>{skill.score}</div>
        <div className="skill-sub">{skill.level}</div>
      </div>
    </div>
  )
}

interface SkillHubProps {
  skills: Skill[]
  onSkillClick: (id: string) => void
  onPractice: () => void
  onUpload: () => void
}

export function SkillHub({ skills, onSkillClick, onPractice, onUpload }: SkillHubProps) {
  const positions = ['orb-listening', 'orb-speaking', 'orb-reading', 'orb-writing']

  return (
    <div className="left">
      <div className="particles">
        <div className="pt pt1" /><div className="pt pt2" /><div className="pt pt3" />
        <div className="pt pt4" /><div className="pt pt5" />
      </div>

      <div className="skill-hub">
        <svg className="connections" viewBox="0 0 480 480">
          <line className="conn-line" x1="240" y1="100" x2="380" y2="240" />
          <line className="conn-line" x1="380" y1="240" x2="240" y2="380" />
          <line className="conn-line" x1="240" y1="380" x2="100" y2="240" />
          <line className="conn-line" x1="100" y1="240" x2="240" y2="100" />
        </svg>

        {skills.map((skill, i) => (
          <SkillOrb key={skill.id} skill={skill} position={positions[i] ?? ''} onClick={onSkillClick} />
        ))}

        <div className="center-badge">
          <div className="center-level">Level</div>
          <div className="center-num">12</div>
          <div className="center-title">Learner</div>
          <div className="center-stage">⬆ Stage 3/5</div>
        </div>
      </div>

      <div className="quick-actions" style={{ marginTop: 24 }}>
        <button className="qa-btn pr" onClick={onPractice}>🗣️ 开始练习</button>
        <button className="qa-btn" onClick={onUpload}>📁 上传资料</button>
      </div>
    </div>
  )
}
