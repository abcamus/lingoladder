import type { Mission } from '../types'

interface MissionsTabProps {
  missions: Mission[]
}

export function MissionsTab({ missions }: MissionsTabProps) {
  return (
    <>
      {missions.map(m => (
        <div key={m.id} className={`mission-item ${m.done ? 'done' : ''}`}>
          <div className="mission-icon" style={{ background: m.iconBg }}>{m.icon}</div>
          <div className="mission-info">
            <div className="mission-name">{m.name}</div>
            <div className="mission-desc">{m.desc}</div>
          </div>
          <div className="mission-xp">+{m.xp} XP</div>
        </div>
      ))}
    </>
  )
}
