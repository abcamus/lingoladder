import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExerciseSource, MaterialEntry, SSEStatus, WritingDoc, WritingResult, WritingTask } from '../types'
import { CEFR_LABELS } from '../lib/abilities'
import { submitWritingResult } from '../lib/writing'
import { PracticeGenerating, PracticeHeader, PracticeIntro } from './PracticeShared'

interface WritingPracticeProps {
  /** Registered materials offered as exercise sources. */
  materials: MaterialEntry[]
  /** The learner's current CEFR level, shown on the intro and the header. */
  level: string
  /** The pending session document: the assignment, or the graded outcome after the tutor critiques the essay. */
  doc: WritingDoc | null
  status: SSEStatus
  /** Send the fixed generation prompt for the chosen source. */
  onStart: (source: ExerciseSource) => void
  /** The essay is ready; hand it to the tutor for grading. */
  onSubmitEssay: (task: WritingTask, essay: string) => void
  /** The score was recorded; the server retired the session. */
  onSubmitted: () => void
  onExit: () => void
}

const TOPIC_SUGGESTIONS = ['日常生活', '旅行见闻', '科技资讯', '职场沟通']
const MIN_WORDS = 10

/** Full-screen writing practice view: pick a source, write to the prompt, and get the tutor's graded feedback. */
export function WritingPractice({ materials, level, doc, status, onStart, onSubmitEssay, onSubmitted, onExit }: WritingPracticeProps) {
  const [generating, setGenerating] = useState(false)
  const [essay, setEssay] = useState('')
  const [essaySubmitted, setEssaySubmitted] = useState(false)
  const [graded, setGraded] = useState<{ result: WritingResult; saved: boolean } | null>(null)
  const lastSourceRef = useRef<ExerciseSource | null>(null)
  const handledResultRef = useRef<string | null>(null)

  // A newly arrived document (generation, grade, or reload restore) syncs the page; the
  // kind+time pair is the identity, because the 30-second dashboard poll re-serves the file.
  const lastDocRef = useRef<string | null>(null)
  useEffect(() => {
    const id = doc === null ? null : `${doc.kind}:${String(doc.time)}`
    if (lastDocRef.current === id) return
    lastDocRef.current = id
    if (doc === null) return
    setEssay('')
    setEssaySubmitted(false)
    setGenerating(false)
  }, [doc])

  const recordResult = useCallback((result: WritingResult) => {
    submitWritingResult(result.score).then(() => {
      setGraded(prev => prev === null ? null : { ...prev, saved: true })
      onSubmitted()
    }, (err: unknown) => {
      console.error('failed to submit writing result:', err)
      setGraded(prev => prev === null ? null : { ...prev, saved: false })
    })
  }, [onSubmitted])

  // A graded outcome records itself exactly once, then the server retires the session.
  useEffect(() => {
    if (doc === null || doc.kind !== 'writing-result') return
    const id = `${doc.kind}:${String(doc.time)}`
    if (handledResultRef.current === id) return
    handledResultRef.current = id
    setGraded({ result: doc, saved: true })
    recordResult(doc)
  }, [doc, recordResult])

  const task = doc !== null && doc.kind === 'writing-exercise' ? doc : null
  const isResult = graded !== null || (doc !== null && doc.kind === 'writing-result')
  const phase: 'intro' | 'generating' | 'writing' | 'grading' | 'result' = isResult
    ? 'result'
    : essaySubmitted && task !== null ? 'grading' : task !== null ? 'writing' : generating ? 'generating' : 'intro'

  const handleStart = useCallback((source: ExerciseSource) => {
    lastSourceRef.current = source
    setGenerating(true)
    onStart(source)
  }, [onStart])

  const handleAgain = useCallback(() => {
    const source = lastSourceRef.current
    if (source === null) return
    setGraded(null)
    setGenerating(true)
    onStart(source)
  }, [onStart])

  const wordCount = essay.trim() === '' ? 0 : essay.trim().split(/\s+/).length

  const handleSubmitEssay = useCallback(() => {
    if (task === null || wordCount < MIN_WORDS) return
    setEssaySubmitted(true)
    onSubmitEssay(task, essay.trim())
  }, [task, wordCount, essay, onSubmitEssay])

  const levelLabel = level in CEFR_LABELS ? CEFR_LABELS[level as keyof typeof CEFR_LABELS] : level

  if (phase === 'intro') {
    return (
      <div className="listening writing">
        <div className="listen-panel">
          <PracticeHeader icon="✍️" title="写作练习" subtitle="围绕题目写一篇短文，AI 批改语法、词汇和逻辑" levelLabel={levelLabel} done={false} onExit={onExit} />
          <PracticeIntro materials={materials} topicSuggestions={TOPIC_SUGGESTIONS} onStart={handleStart} />
        </div>
      </div>
    )
  }

  if (phase === 'generating') {
    return (
      <div className="listening writing">
        <div className="listen-panel">
          <PracticeHeader icon="✍️" title="写作练习" subtitle="围绕题目写一篇短文，AI 批改语法、词汇和逻辑" levelLabel={levelLabel} done={false} onExit={onExit} />
          <PracticeGenerating
            status={status}
            loadingText="正在生成写作练习…"
            waitingText="AI 正在按你的水平准备写作题目，通常需要十几秒。"
            onCancel={() => { setGenerating(false) }}
          />
        </div>
      </div>
    )
  }

  if (phase === 'result' && graded !== null) {
    const { result } = graded
    return (
      <div className="listening writing">
        <div className="listen-panel">
          <PracticeHeader icon="✍️" title="写作练习" subtitle="围绕题目写一篇短文，AI 批改语法、词汇和逻辑" levelLabel={levelLabel} done onExit={onExit} />
          <div className="listen-score">
            <div className="write-score">{String(result.score)}<span>/100</span></div>
            <div className={`listen-score-xp ${graded.saved ? '' : 'failed'}`}>
              {graded.saved ? '+20 XP 已记入进度' : '⚠️ 成绩提交失败，本轮未计入记录'}
            </div>
            {graded.saved ? null : (
              <button className="modal-btn" onClick={() => { recordResult(result) }}>重试记分</button>
            )}
            <div className="listen-actions">
              <button className="modal-btn pr" onClick={handleAgain}>再来一篇</button>
              <button className="modal-btn" onClick={onExit}>返回首页</button>
            </div>
          </div>
          <div className="write-result-hint">逐条的语法和用词批改见聊天记录；这里只展示结构化点评。</div>
          {result.summary !== undefined && <div className="write-summary">{result.summary}</div>}
          {result.strengths !== undefined && result.strengths.length > 0 && (
            <div className="write-list good">
              <div className="write-list-title">👍 做得好</div>
              <ul>{result.strengths.map(s => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {result.issues !== undefined && result.issues.length > 0 && (
            <div className="write-list bad">
              <div className="write-list-title">✏️ 待改进</div>
              <ul>{result.issues.map(s => <li key={s}>{s}</li>)}</ul>
            </div>
          )}
          {result.revised !== undefined && (
            <div className="write-revised">
              <div className="write-list-title">✨ 参考修改</div>
              <p>{result.revised}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (task === null) return null

  if (phase === 'grading') {
    return (
      <div className="listening writing">
        <div className="listen-panel">
          <PracticeHeader icon="✍️" title="写作练习" subtitle="围绕题目写一篇短文，AI 批改语法、词汇和逻辑" levelLabel={levelLabel} done={false} onExit={onExit} />
          <PracticeGenerating
            status={status}
            loadingText="正在批改作文…"
            waitingText="AI 正在逐项点评语法、词汇和逻辑，通常需要十几秒；详细批改会同时出现在聊天里。"
            onCancel={() => { setEssaySubmitted(false) }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="listening writing">
      <div className="listen-panel split">
        <PracticeHeader icon="✍️" title="写作练习" subtitle="围绕题目写一篇短文，AI 批改语法、词汇和逻辑" levelLabel={levelLabel} done={false} onExit={onExit} />
        <div className="listen-cols">
          <div className="listen-col listen-col-material">
            <div className="write-task">
              <div className="write-task-title">{task.title}</div>
              <ul className="write-reqs">
                {task.requirements.map(r => <li key={r}>{r}</li>)}
              </ul>
              {task.hint !== undefined && <div className="write-hint">💡 {task.hint}</div>}
            </div>
          </div>
          <div className="listen-col listen-col-practice">
            <div className="write-editor">
              <textarea
                value={essay}
                onChange={(e) => { setEssay(e.target.value) }}
                placeholder="Write your essay here…"
                rows={12}
              />
              <div className="write-counter">
                <span>
                  {String(wordCount)} 词{task.targetWords !== undefined ? ` / 建议 ${String(task.targetWords)} 词` : ''}
                  {essay.trim() !== '' && wordCount < MIN_WORDS ? `（至少 ${String(MIN_WORDS)} 词）` : ''}
                </span>
                <button className="listen-submit" disabled={wordCount < MIN_WORDS} onClick={handleSubmitEssay}>提交批改</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
