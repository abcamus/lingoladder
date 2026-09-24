import type { VocabularyGroup } from '../types'

interface VocabularyTabProps {
  groups: VocabularyGroup[]
  onReview: () => void
}

export function VocabularyTab({ groups, onReview }: VocabularyTabProps) {
  const totalWords = groups.reduce((sum, g) => sum + g.words.length, 0)

  return (
    <>
      <div className="vocab-summary">
        <span>共 <b>{totalWords}</b> 个词汇 · {groups.length} 份资料</span>
        <button className="vocab-review-btn" onClick={onReview}>🔁 复习训练</button>
      </div>
      {groups.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'center', padding: '20px 0' }}>
          还没有词汇。分析一份资料后，提取的词汇会沉淀到这里。
        </div>
      )}
      {groups.map(g => (
        <div key={g.time} className="vocab-group">
          <div className="vocab-group-head">
            <span className="vocab-group-material">{g.material ?? '未命名资料'}</span>
            {g.level !== undefined && <span className="vocab-group-level">{g.level}</span>}
          </div>
          {g.words.map(w => (
            <div key={w.word} className="vocab-word" title={w.example ?? ''}>
              <span className="vocab-word-en">{w.word}</span>
              <span className="vocab-word-zh">{w.definition}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}
