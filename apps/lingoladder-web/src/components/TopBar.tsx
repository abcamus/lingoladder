import { Link } from 'react-router'
import { CEFR_LABELS } from '../lib/abilities'

interface TopBarProps {
  /** Total XP earned from real learning records. */
  xp: number
  /** XP accumulated inside the current level. */
  xpIntoLevel: number
  /** XP required to advance one level. */
  xpPerLevel: number
  /** The learner's current CEFR level from settings. */
  cefr: string
  /** Consecutive learning days derived from learning records. */
  streakDays: number
}

export function TopBar({ xp, xpIntoLevel, xpPerLevel, cefr, streakDays }: TopBarProps) {
  const fillPercent = Math.min(100, Math.round((xpIntoLevel / xpPerLevel) * 100))
  return (
    <div className="topbar">
      <div className="tb-left">
        <Link to="/" className="tb-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="tb-logo-ic">LL</div>
          <div className="tb-logo-tx">LingoLadder</div>
        </Link>
      </div>
      <div className="tb-center">
        <div className="tb-level">
          <span className="tb-level-ic">🎓</span>
          <span>{(CEFR_LABELS as Record<string, string>)[cefr] ?? cefr}</span>
        </div>
        <div className="tb-xp">
          <div className="tb-xp-bar"><div className="tb-xp-fill" style={{ width: `${fillPercent}%` }} /></div>
          <div className="tb-xp-num" title={`累计 ${String(xp)} XP`}>{xpIntoLevel}/{xpPerLevel} XP</div>
        </div>
      </div>
      <div className="tb-right">
        <div className="tb-stat tb-fire">🔥 {streakDays}天</div>
        {/* <button className="tb-btn" title="上传资料">📁</button> */}
        <Link to="/listening" className="tb-btn" title="听力练习" style={{ textDecoration: 'none' }}>🎧</Link>
        <Link to="/speaking" className="tb-btn" title="口语练习" style={{ textDecoration: 'none' }}>🗣️</Link>
        <Link to="/reading" className="tb-btn" title="阅读理解" style={{ textDecoration: 'none' }}>📖</Link>
        <Link to="/writing" className="tb-btn" title="写作练习" style={{ textDecoration: 'none' }}>✍️</Link>
        <Link to="/settings" className="tb-btn" title="设置" style={{ textDecoration: 'none' }}>⚙️</Link>
      </div>
    </div>
  )
}
