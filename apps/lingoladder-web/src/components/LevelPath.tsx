interface LevelPathProps {
  level: number
  currentStage: number
  totalStages: number
}

const STAGE_LABELS = ['入门', '基础', '进阶', '熟练', '精通']

export function LevelPath({ level, currentStage, totalStages }: LevelPathProps) {
  return (
    <div className="level-path">
      <div className="level-info">
        <span className="level-info-label">Level</span>
        <span className="level-info-num">{level}</span>
        <span className="level-info-stage">Stage {currentStage}/{totalStages}</span>
      </div>

      <div className="level-track">
        {Array.from({ length: totalStages }, (_, i) => {
          const stage = i + 1
          const state = stage < currentStage ? 'done' : stage === currentStage ? 'current' : 'locked'
          return (
            <div key={stage} className="level-segment">
              {i > 0 && <div className={`level-line ${stage <= currentStage ? 'done' : ''}`} />}
              <div className={`level-node ${state}`}>
                {state === 'done' ? '✓' : stage}
              </div>
              <div className="level-stage-label">{STAGE_LABELS[i]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
