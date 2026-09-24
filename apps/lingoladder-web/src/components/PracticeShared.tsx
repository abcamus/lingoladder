import { useState } from 'react'
import type { ExerciseSource, MaterialEntry, QuizQuestion, SSEStatus } from '../types'

/** Letter key for an option; falls back to the 1-based number if a question ever ships more than six options. */
export function optionKey(index: number): string {
  return 'ABCDEF'[index] ?? String(index + 1)
}

interface PracticeHeaderProps {
  icon: string
  title: string
  subtitle: string
  levelLabel: string
  /** Whether the round is finished; the exit button reads 完成 instead of 退出. */
  done: boolean
  onExit: () => void
}

/** The gradient header shared by the practice pages. */
export function PracticeHeader({ icon, title, subtitle, levelLabel, done, onExit }: PracticeHeaderProps) {
  return (
    <div className="listen-header">
      <div className="listen-title">
        <span className="listen-title-icon">{icon}</span>
        <div>
          <div className="listen-title-main">{title}</div>
          <div className="listen-title-sub">{subtitle}</div>
        </div>
      </div>
      <span className="listen-level">{levelLabel}</span>
      <button className="listen-exit" onClick={onExit}>{done ? '完成' : '退出'}</button>
    </div>
  )
}

interface PracticeIntroProps {
  materials: MaterialEntry[]
  topicSuggestions: string[]
  /** The how-to-practice line under the source picker; omitted when the page has none. */
  introNote?: string
  startLabel?: string
  onStart: (source: ExerciseSource) => void
}

/** The source picker shared by the practice pages: an uploaded material or a free topic. */
export function PracticeIntro({ materials, topicSuggestions, introNote, startLabel = '开始练习', onStart }: PracticeIntroProps) {
  const [sourceTab, setSourceTab] = useState<'material' | 'topic'>(materials.length > 0 ? 'material' : 'topic')
  const [materialId, setMaterialId] = useState<string | null>(null)
  const [topic, setTopic] = useState('')
  const canStart = sourceTab === 'material' ? materialId !== null : true
  const handleStart = () => {
    if (sourceTab === 'material') {
      const entry = materials.find(m => m.id === materialId)
      if (entry === undefined) return
      onStart({ kind: 'material', material: entry })
      return
    }
    onStart({ kind: 'topic', topic })
  }
  return (
    <div className="listen-intro">
      <div className="listen-tabs">
        <button className={`listen-tab ${sourceTab === 'material' ? 'active' : ''}`} onClick={() => { setSourceTab('material') }}>📄 基于资料</button>
        <button className={`listen-tab ${sourceTab === 'topic' ? 'active' : ''}`} onClick={() => { setSourceTab('topic') }}>💬 自由话题</button>
      </div>
      {sourceTab === 'material' ? (
        materials.length === 0 ? (
          <div className="listen-empty">还没有学习资料。先在首页上传一份，或切换到「自由话题」。</div>
        ) : (
          <div className="listen-materials">
            {materials.map(m => (
              <button
                key={m.id}
                className={`listen-material ${materialId === m.id ? 'active' : ''}`}
                onClick={() => { setMaterialId(m.id) }}
              >
                <span className="listen-material-name">{m.name}</span>
                <span className="listen-material-meta">{String(Math.max(1, Math.round(m.bytes / 1024)))} KB</span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="listen-topic">
          <input
            value={topic}
            onChange={(e) => { setTopic(e.target.value) }}
            placeholder="想练什么话题？留空由 AI 按你的水平决定"
          />
          <div className="listen-sugs">
            {topicSuggestions.map(s => (
              <button key={s} className="listen-sug" onClick={() => { setTopic(s) }}>{s}</button>
            ))}
          </div>
        </div>
      )}
      {introNote !== undefined && <div className="listen-intro-note">{introNote}</div>}
      <button className="listen-start" disabled={!canStart} onClick={handleStart}>{startLabel}</button>
    </div>
  )
}

interface PracticeGeneratingProps {
  status: SSEStatus
  loadingText: string
  waitingText: string
  onCancel: () => void
}

/** The spinner panel shown while the agent writes the exercise. */
export function PracticeGenerating({ status, loadingText, waitingText, onCancel }: PracticeGeneratingProps) {
  return (
    <div className="listen-generating">
      <div className="listen-spin" />
      <div className="listen-generating-main">{loadingText}</div>
      <div className="listen-generating-sub">
        {status === 'disconnected' ? '与服务的连接已断开，正在重试…' : waitingText}
      </div>
      <button className="modal-btn" onClick={onCancel}>取消等待</button>
    </div>
  )
}

interface PracticeScoreCardProps {
  correct: number
  total: number
  saved: boolean
  onAgain: () => void
  /** Present the critique action; omitted when the page has nothing to discuss. */
  onDiscuss?: (() => void) | undefined
  discussLabel?: string
  onExit: () => void
}

/** The score summary with the follow-up actions, shown once a round is graded. */
export function PracticeScoreCard({ correct, total, saved, onAgain, onDiscuss, discussLabel = '💬 讨论错题', onExit }: PracticeScoreCardProps) {
  return (
    <div className="listen-score">
      <div className="listen-score-num">{String(correct)}<span>/{String(total)}</span></div>
      <div className={`listen-score-xp ${saved ? '' : 'failed'}`}>
        {saved ? '+20 XP 已记入进度' : '⚠️ 成绩提交失败，本轮未计入记录'}
      </div>
      <div className="listen-actions">
        <button className="modal-btn pr" onClick={onAgain}>再来一组</button>
        {onDiscuss !== undefined && <button className="modal-btn" onClick={onDiscuss}>{discussLabel}</button>}
        <button className="modal-btn" onClick={onExit}>返回首页</button>
      </div>
    </div>
  )
}

interface QuizQuestionCardsProps {
  questions: QuizQuestion[]
  selections: Record<number, number>
  /** Reveals the correct/wrong coloring, disables picking, and shows explanations. */
  graded: boolean
  /** Extra lock (e.g. while submitting) that disables picking without revealing answers. */
  locked?: boolean
  docTime: number
  onPick: (questionIndex: number, optionIndex: number) => void
}

/** The four-option question cards shared by the listening and reading pages. */
export function QuizQuestionCards({ questions, selections, graded, locked = false, docTime, onPick }: QuizQuestionCardsProps) {
  return (
    <div className="listen-questions">
      {questions.map((q, i) => (
        <div className="listen-q" key={`${docTime}-${String(i)}`}>
          <div className="listen-q-head">{String(i + 1)}. {q.prompt}</div>
          <div className="listen-opts">
            {q.options.map((opt, oi) => {
              const selected = selections[i] === oi
              const state = graded ? (oi === q.answer ? 'correct' : selected ? 'wrong' : '') : ''
              return (
                <button
                  key={oi}
                  className={`listen-opt ${selected ? 'selected' : ''} ${state}`}
                  disabled={graded || locked}
                  onClick={() => { onPick(i, oi) }}
                >
                  <span className="listen-opt-key">{optionKey(oi)}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
          {graded && q.explanation !== undefined && (
            <div className="listen-explain">💡 {q.explanation}</div>
          )}
        </div>
      ))}
    </div>
  )
}
