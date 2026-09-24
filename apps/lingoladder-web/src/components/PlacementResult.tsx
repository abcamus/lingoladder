import { ABILITY_DEFS, CEFR_LABELS } from '../lib/abilities'
import type { CEFRLevel, LearnerProfile } from '../types'

/** CEFR levels on the ordinal scale, low to high; fills are computed by index. */
const CEFR_ORDER: Array<CEFRLevel> = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

interface PlacementResultProps {
  profile: LearnerProfile
  /** Narrow rendering for the chat transcript; the assessment view and settings use the full panel. */
  compact?: boolean
}

/** The assessed placement record as a visual card: overall CEFR, per-dimension scale bars, weak dimensions, and the summary. */
export function PlacementResult({ profile, compact = false }: PlacementResultProps) {
  const weakSkills = profile.weakSkills ?? []
  const weakNames = ABILITY_DEFS
    .filter(def => weakSkills.includes(def.id))
    .map(def => def.title.replace(/^.\s*/, ''))
    .join(' · ')

  return (
    <div className={`placement-result ${compact ? 'compact' : ''}`}>
      <div className="pr-head">
        <span className="pr-title">{profile.source === 'manual' ? '📐 当前水平' : '📐 定级测评结果'}</span>
        <span className="pr-level-badge">{profile.currentLevel}</span>
        <span className="pr-level-label">{CEFR_LABELS[profile.currentLevel]}</span>
      </div>

      <div className="pr-dims">
        {ABILITY_DEFS.map((def) => {
          const level = profile.skills?.[def.id]
          const fillPercent = level === undefined ? 0 : Math.round(((CEFR_ORDER.indexOf(level) + 1) / CEFR_ORDER.length) * 100)
          const weak = weakSkills.includes(def.id)
          return (
            <div className="pr-dim" key={def.id}>
              <span className="pr-dim-icon">{def.icon}</span>
              <span className="pr-dim-name">{def.title.replace(/^.\s*/, '')}</span>
              <div className="pr-dim-bar">
                <div className="pr-dim-fill" style={{ width: `${fillPercent}%`, background: def.color }} />
              </div>
              <span className="pr-dim-meta">
                {weak && <span className="pr-dim-weak">薄弱</span>}
                <span className="pr-dim-level" style={level === undefined ? undefined : { color: def.color }}>
                  {level ?? '—'}
                </span>
              </span>
            </div>
          )
        })}
        {!compact && (
          <div className="pr-scale" aria-hidden>
            <span />
            <span />
            <span>{CEFR_ORDER.map(l => <span key={l}>{l}</span>)}</span>
            <span />
          </div>
        )}
      </div>

      {weakNames !== '' && <div className="pr-weak">⚠️ 薄弱维度：{weakNames}，后续学习会优先补</div>}
      {profile.summary !== undefined && <div className="pr-summary">「{profile.summary}」</div>}
      <div className="pr-note">* 听力 / 口语无法在文字对话中直接观测，为估算值</div>
    </div>
  )
}
