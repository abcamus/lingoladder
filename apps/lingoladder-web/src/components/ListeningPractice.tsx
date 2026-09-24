import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExerciseSource, ListeningExercise, MaterialEntry, SSEStatus } from '../types'
import { CEFR_LABELS } from '../lib/abilities'
import { submitListeningResult } from '../lib/listening'
import { SPEECH_VOICES, useSpeech } from '../hooks/useSpeech'
import { optionKey, PracticeGenerating, PracticeHeader, PracticeIntro, PracticeScoreCard, QuizQuestionCards } from './PracticeShared'

interface ListeningPracticeProps {
  /** Registered materials offered as exercise sources. */
  materials: MaterialEntry[]
  /** The learner's current CEFR level, shown on the intro and the header. */
  level: string
  /** The pending exercise: live over SSE while a generation runs, restored from the server after a reload. */
  exercise: ListeningExercise | null
  status: SSEStatus
  /** Send the fixed generation prompt for the chosen source. */
  onStart: (source: ExerciseSource) => void
  /** The round was graded; the server recorded the outcome and the pending session is consumed. */
  onSubmitted: () => void
  /** Ask the tutor in the chat about the wrong answers. */
  onDiscuss: (message: string) => void
  onExit: () => void
}

/** One graded round kept locally so the score view survives the pending session being cleared. */
interface GradedRound {
  exercise: ListeningExercise
  correct: number
  saved: boolean
}

const TOPIC_SUGGESTIONS = ['日常生活', '旅行见闻', '科技资讯', '职场沟通']
const RATES = [0.75, 1, 1.25]

/** Full-screen listening practice view: pick a source, listen to the spoken passage, answer, and get graded inline. */
export function ListeningPractice({ materials, level, exercise, status, onStart, onSubmitted, onDiscuss, onExit }: ListeningPracticeProps) {
  const [generating, setGenerating] = useState(false)
  const [graded, setGraded] = useState<GradedRound | null>(null)
  const [selections, setSelections] = useState<Record<number, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [showPassage, setShowPassage] = useState(false)
  const lastSourceRef = useRef<ExerciseSource | null>(null)
  const {
    status: speechStatus, engine: speechEngine, rate: speechRate, voice: speechVoice, speak, pause, resume, stop, changeRate, changeVoice,
  } = useSpeech()

  // A newly arrived exercise (generation or reload restore) starts a fresh round; the document
  // time is the identity, because the 30-second dashboard poll re-serves the same document.
  const lastExerciseTimeRef = useRef<number | null>(null)
  useEffect(() => {
    if (exercise === null || lastExerciseTimeRef.current === exercise.time) return
    lastExerciseTimeRef.current = exercise.time
    setSelections({})
    setGraded(null)
    setGenerating(false)
    setShowPassage(false)
    stop()
  }, [exercise, stop])

  const round = exercise ?? graded?.exercise ?? null
  const phase = graded !== null
    ? 'graded'
    : generating ? 'generating' : exercise !== null ? 'practicing' : 'intro'

  const handleStart = useCallback((source: ExerciseSource) => {
    lastSourceRef.current = source
    setGenerating(true)
    onStart(source)
  }, [onStart])

  const answeredCount = round?.questions.filter((_, i) => selections[i] !== undefined).length ?? 0

  const handleSubmit = useCallback(async () => {
    if (round === null || submitting) return
    const count = round.questions.length
    const correct = round.questions.reduce((n, q, i) => n + (selections[i] === q.answer ? 1 : 0), 0)
    setSubmitting(true)
    let saved = true
    try {
      await submitListeningResult(count, correct)
    } catch (err) {
      saved = false
      console.error('failed to submit listening result:', err)
    }
    setGraded({ exercise: round, correct, saved })
    stop()
    onSubmitted()
    setSubmitting(false)
  }, [round, selections, submitting, onSubmitted, stop])

  const handleAgain = useCallback(() => {
    const source = lastSourceRef.current
    if (source === null) return
    setGraded(null)
    setGenerating(true)
    onStart(source)
  }, [onStart])

  const handleDiscuss = useCallback(() => {
    if (graded === null) return
    const wrong = graded.exercise.questions
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => selections[i] !== q.answer)
    if (wrong.length === 0) return
    const lines = wrong.map(({ q, i }) => {
      const picked = selections[i] === undefined ? '未作答' : optionKey(selections[i])
      return `${String(i + 1)}. ${q.prompt}（正确答案：${optionKey(q.answer)}，我的选择：${picked}）`
    })
    onDiscuss(`我刚在听力练习页完成了一组听力练习（答对 ${String(graded.correct)}/${String(graded.exercise.questions.length)}），请逐题讲解我做错的理解题，引用原文依据，并用英文给我一段针对这些错误的听力建议：\n${lines.join('\n')}`)
  }, [graded, selections, onDiscuss])

  const levelLabel = level in CEFR_LABELS ? CEFR_LABELS[level as keyof typeof CEFR_LABELS] : level

  if (phase === 'intro') {
    return (
      <div className="listening">
        <div className="listen-panel">
          <PracticeHeader icon="🎧" title="听力练习" subtitle="听一段 AI 生成的英文短文，检验你的理解" levelLabel={levelLabel} done={false} onExit={onExit} />
          <PracticeIntro materials={materials} topicSuggestions={TOPIC_SUGGESTIONS} onStart={handleStart} />
        </div>
      </div>
    )
  }

  if (phase === 'generating') {
    return (
      <div className="listening">
        <div className="listen-panel">
          <PracticeHeader icon="🎧" title="听力练习" subtitle="听一段 AI 生成的英文短文，检验你的理解" levelLabel={levelLabel} done={false} onExit={onExit} />
          <PracticeGenerating
            status={status}
            loadingText="正在生成听力练习…"
            waitingText="AI 正在按你的水平写短文和出题，通常需要十几秒。"
            onCancel={() => { setGenerating(false) }}
          />
        </div>
      </div>
    )
  }

  if (round === null) return null
  const total = round.questions.length
  const sourceLabel = round.material ?? round.topic

  const player = (
    <div className="listen-player">
      <button
        className="listen-play"
        onClick={() => {
          if (speechStatus === 'speaking') pause()
          else if (speechStatus === 'paused') resume()
          else if (speechStatus === 'idle') speak(round.passage)
        }}
        title={speechStatus === 'loading' ? '正在生成语音…' : speechStatus === 'speaking' ? '暂停' : speechStatus === 'paused' ? '继续' : '播放'}
      >{speechStatus === 'loading' ? '⏳' : speechStatus === 'speaking' ? '⏸' : '▶'}</button>
      <div className="listen-player-info">
        <div className="listen-player-title">原文朗读{sourceLabel !== undefined ? ` · ${sourceLabel}` : ''}</div>
        <div className="listen-player-hint">
          {speechEngine === 'local' && speechStatus !== 'idle'
            ? '⚠️ 在线语音不可用，已回退到浏览器语音，音质取决于系统'
            : '听不懂可以暂停或重听；建议先听完再作答'}
        </div>
      </div>
      <div className={`listen-eq ${speechStatus === 'speaking' ? 'on' : ''}`}><i /><i /><i /><i /></div>
      <div className="listen-rates">
        {RATES.map(r => (
          <button
            key={r}
            className={`listen-rate ${r === speechRate ? 'active' : ''}`}
            onClick={() => { changeRate(r) }}
          >{String(r)}×</button>
        ))}
      </div>
      <div className="listen-voices">
        <span className="listen-voices-label">发音人</span>
        {SPEECH_VOICES.map(v => (
          <button
            key={v.id}
            className={`listen-rate ${v.id === speechVoice ? 'active' : ''}`}
            onClick={() => { changeVoice(v.id) }}
          >{v.label}</button>
        ))}
      </div>
      <button className="listen-replay" onClick={() => { speak(round.passage) }}>↻ 重听</button>
    </div>
  )

  return (
    <div className="listening">
      <div className="listen-panel split">
        <PracticeHeader icon="🎧" title="听力练习" subtitle="听一段 AI 生成的英文短文，检验你的理解" levelLabel={levelLabel} done={graded !== null} onExit={onExit} />
        {graded !== null && (
          <PracticeScoreCard
            correct={graded.correct}
            total={total}
            saved={graded.saved}
            onAgain={handleAgain}
            onDiscuss={graded.correct < total ? handleDiscuss : undefined}
            onExit={onExit}
          />
        )}
        <div className="listen-cols">
          <div className="listen-col listen-col-material">
            {player}
            <div className="listen-transcript">
              <button className="listen-transcript-toggle" disabled={graded === null} onClick={() => { setShowPassage(v => !v) }}>
                {showPassage ? '隐藏原文' : '📄 查看原文'}
              </button>
              {graded === null && <span className="listen-transcript-hint">提交答案后可查看原文</span>}
              {showPassage && <div className="listen-transcript-text">{round.passage}</div>}
            </div>
          </div>
          <div className="listen-col listen-col-practice">
            <QuizQuestionCards
              questions={round.questions}
              selections={selections}
              graded={graded !== null}
              locked={submitting}
              docTime={round.time}
              onPick={(qi, oi) => { setSelections(prev => ({ ...prev, [qi]: oi })) }}
            />
            {graded === null && (
              <div className="listen-footer">
                <span className="listen-progress">已答 {String(answeredCount)}/{String(total)}</span>
                <button className="listen-submit" disabled={answeredCount < total || submitting} onClick={() => { void handleSubmit() }}>
                  {submitting ? '提交中…' : '提交答案'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
