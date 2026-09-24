import { useCallback, useEffect, useRef, useState } from 'react'
import type { ExerciseSource, MaterialEntry, SpeakingExercise, SpeakingLine, SSEStatus } from '../types'
import { CEFR_LABELS } from '../lib/abilities'
import { submitSpeakingResult } from '../lib/speaking'
import { similarityScore, SPEAKING_PASS_SCORE } from '../lib/speaking-score'
import { useRecognition } from '../hooks/useRecognition'
import { useSpeech } from '../hooks/useSpeech'
import { PracticeGenerating, PracticeHeader, PracticeIntro, PracticeScoreCard } from './PracticeShared'

interface SpeakingPracticeProps {
  /** Registered materials offered as exercise sources. */
  materials: MaterialEntry[]
  /** The learner's current CEFR level, shown on the intro and the header. */
  level: string
  /** The pending exercise: live over SSE while a generation runs, restored from the server after a reload. */
  exercise: SpeakingExercise | null
  status: SSEStatus
  /** Send the fixed generation prompt for the chosen source. */
  onStart: (source: ExerciseSource) => void
  /** The round was scored; the server recorded the outcome and the pending session is consumed. */
  onSubmitted: () => void
  /** Ask the tutor in the chat to critique the transcripts. */
  onDiscuss: (message: string) => void
  onExit: () => void
}

/** One recorded line's outcome kept locally so the score view survives the session being cleared. */
interface LineAttempt {
  audioUrl: string | null
  transcript: string | null
  score: number | null
  manual: boolean
}

/** One scored round kept locally so the summary survives the pending session being cleared. */
interface GradedSpeakingRound {
  exercise: SpeakingExercise
  correct: number
  total: number
  saved: boolean
}

const TOPIC_SUGGESTIONS = ['日常生活', '旅行见闻', '点餐购物', '职场沟通']

const EMPTY_ATTEMPT: LineAttempt = { audioUrl: null, transcript: null, score: null, manual: false }

function isAttemptDone(attempt: LineAttempt | undefined): boolean {
  return attempt !== undefined && (attempt.score !== null || attempt.manual || attempt.audioUrl !== null)
}

/** Full-screen speaking practice view: pick a source, listen to each model line, record yourself, and get scored. */
export function SpeakingPractice({ materials, level, exercise, status, onStart, onSubmitted, onDiscuss, onExit }: SpeakingPracticeProps) {
  const [generating, setGenerating] = useState(false)
  const [graded, setGraded] = useState<GradedSpeakingRound | null>(null)
  const [attempts, setAttempts] = useState<Record<number, LineAttempt>>({})
  const [submitting, setSubmitting] = useState(false)
  const [recordingIndex, setRecordingIndex] = useState<number | null>(null)
  const [micError, setMicError] = useState<string | null>(null)
  const [speakingLine, setSpeakingLine] = useState<number | null>(null)
  const lastSourceRef = useRef<ExerciseSource | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const attemptIndexRef = useRef<number | null>(null)
  const mineAudioRef = useRef<HTMLAudioElement | null>(null)
  const [minePlaying, setMinePlaying] = useState<number | null>(null)
  const {
    status: speechStatus, speak, stop: stopSpeech,
  } = useSpeech()
  const {
    supported: recognitionSupported, interim, start: startRecognition, stop: stopRecognition,
  } = useRecognition()

  // A newly arrived exercise (generation or reload restore) starts a fresh round; the document
  // time is the identity, because the 30-second dashboard poll re-serves the same document.
  const lastExerciseTimeRef = useRef<number | null>(null)
  useEffect(() => {
    if (exercise === null || lastExerciseTimeRef.current === exercise.time) return
    lastExerciseTimeRef.current = exercise.time
    setAttempts({})
    setGraded(null)
    setGenerating(false)
    setRecordingIndex(null)
    setSpeakingLine(null)
    stopSpeech()
  }, [exercise, stopSpeech])

  const round = exercise ?? graded?.exercise ?? null
  const phase = graded !== null
    ? 'graded'
    : generating ? 'generating' : exercise !== null ? 'practicing' : 'intro'

  // The sample-play indicator tracks the global TTS status of the shared speech hook.
  useEffect(() => {
    if (speechStatus === 'idle') setSpeakingLine(null)
  }, [speechStatus])

  const handleStart = useCallback((source: ExerciseSource) => {
    lastSourceRef.current = source
    setGenerating(true)
    onStart(source)
  }, [onStart])

  const handlePlaySample = useCallback((index: number, text: string) => {
    setSpeakingLine(index)
    speak(text)
  }, [speak])

  const handlePlayMine = useCallback((index: number, audioUrl: string) => {
    if (audioUrl === '') return
    mineAudioRef.current?.pause()
    const element = new Audio(audioUrl)
    element.onended = () => { setMinePlaying(null) }
    mineAudioRef.current = element
    setMinePlaying(index)
    void element.play()
  }, [])

  const startAttempt = useCallback(async (index: number) => {
    if (recordingIndex !== null || submitting) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      console.error('speaking: microphone access failed:', err)
      setMicError('无法访问麦克风，请在浏览器提示中允许麦克风权限后重试。')
      return
    }
    setMicError(null)
    streamRef.current = stream
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
      setAttempts(prev => ({ ...prev, [index]: { ...(prev[index] ?? EMPTY_ATTEMPT), audioUrl: url } }))
      for (const track of stream.getTracks()) track.stop()
      streamRef.current = null
      mediaRecorderRef.current = null
      setRecordingIndex(null)
    }
    mediaRecorderRef.current = recorder
    attemptIndexRef.current = index
    setRecordingIndex(index)
    recorder.start()
    startRecognition()
  }, [recordingIndex, submitting, startRecognition])

  const stopAttempt = useCallback(async () => {
    const index = attemptIndexRef.current
    const recorder = mediaRecorderRef.current
    const line = round?.sentences[index ?? -1]
    if (index === null || recorder === null || line === undefined) return
    const transcriptPromise = stopRecognition()
    recorder.stop()
    const transcript = await transcriptPromise
    if (transcript === '') return
    const score = similarityScore(line.text, transcript)
    setAttempts(prev => ({ ...prev, [index]: { ...(prev[index] ?? EMPTY_ATTEMPT), transcript, score } }))
  }, [round, stopRecognition])

  const markManual = useCallback((index: number) => {
    setAttempts(prev => ({ ...prev, [index]: { ...(prev[index] ?? EMPTY_ATTEMPT), manual: true } }))
  }, [])

  const recordIndices = round?.sentences
    .map((line, i) => (line.role === 'A' ? -1 : i))
    .filter(i => i >= 0) ?? []
  const doneCount = recordIndices.filter(i => isAttemptDone(attempts[i])).length

  const handleSubmit = useCallback(async () => {
    if (round === null || submitting) return
    const total = recordIndices.length
    const correct = recordIndices.filter((i) => {
      const attempt = attempts[i]
      return attempt !== undefined && (attempt.manual || (attempt.score ?? 0) >= SPEAKING_PASS_SCORE)
    }).length
    setSubmitting(true)
    let saved = true
    try {
      await submitSpeakingResult(total, correct)
    } catch (err) {
      saved = false
      console.error('failed to submit speaking result:', err)
    }
    setGraded({ exercise: round, correct, total, saved })
    stopSpeech()
    onSubmitted()
    setSubmitting(false)
  }, [round, attempts, recordIndices, submitting, onSubmitted, stopSpeech])

  const handleAgain = useCallback(() => {
    const source = lastSourceRef.current
    if (source === null) return
    setGraded(null)
    setGenerating(true)
    onStart(source)
  }, [onStart])

  const handleDiscuss = useCallback(() => {
    if (graded === null) return
    const lines = graded.exercise.sentences
      .map((line, i) => ({ line, i }))
      .filter(({ line, i }) => line.role !== 'A' && attempts[i] !== undefined)
      .map(({ line, i }) => {
        const attempt = attempts[i]
        if (attempt === undefined) return ''
        const score = attempt.manual ? '自评通过' : String(attempt.score)
        return `${String(i + 1)}. 目标句：${line.text}\n   我的转写：${attempt.transcript ?? '（未识别到）'}（${score} 分）`
      })
    if (lines.length === 0) return
    onDiscuss(`我刚在口语练习页完成了一组跟读练习（通过 ${String(graded.correct)}/${String(graded.total)}）。请点评我的发音和表达，重点讲解得分低或转写偏差大的句子，并给出针对性练习建议：\n${lines.join('\n')}`)
  }, [graded, attempts, onDiscuss])

  const levelLabel = level in CEFR_LABELS ? CEFR_LABELS[level as keyof typeof CEFR_LABELS] : level

  const header = (
    <PracticeHeader icon="🗣️" title="口语练习" subtitle="听示范、跟读录音，语音识别帮你正音" levelLabel={levelLabel} done={phase === 'graded'} onExit={onExit} />
  )

  if (phase === 'intro') {
    return (
      <div className="listening speaking">
        <div className="listen-panel">
          {header}
          <PracticeIntro
            materials={materials}
            topicSuggestions={TOPIC_SUGGESTIONS}
            introNote={`练习方式：🔊 听示范 → 🎤 跟读录音 → 语音识别逐句评分${recognitionSupported ? '' : '（当前浏览器不支持识别，可录音自听后自评）'}`}
            onStart={handleStart}
          />
        </div>
      </div>
    )
  }

  if (phase === 'generating') {
    return (
      <div className="listening speaking">
        <div className="listen-panel">
          {header}
          <PracticeGenerating
            status={status}
            loadingText="正在生成口语练习…"
            waitingText="AI 正在按你的水平准备跟读句子，通常需要十几秒。"
            onCancel={() => { setGenerating(false) }}
          />
        </div>
      </div>
    )
  }

  if (round === null) return null
  const sourceLabel = round.material ?? round.topic

  const scoreBadge = (score: number | null) => {
    if (score === null) return <span className="sp-badge plain">自评通过</span>
    const tier = score >= 80 ? 'good' : score >= SPEAKING_PASS_SCORE ? 'mid' : 'bad'
    return <span className={`sp-badge ${tier}`}>{String(score)} 分</span>
  }

  /** The material half of one line: the sentence to hear and read, shown in the left column. */
  const scriptCard = (line: SpeakingLine, index: number) => (
    <div className="listen-q sp-line" key={`${round.time}-script-${String(index)}`}>
      <div className="listen-q-head">
        <span className="sp-num">{String(index + 1)}</span>
        <span className={`sp-role ${line.role === 'A' ? 'a' : line.role === 'B' ? 'b' : 'plain'}`}>
          {line.role === 'A' ? '对话 A' : line.role === 'B' ? '你读 B' : '跟读'}
        </span>
        {line.text}
      </div>
      {line.note !== undefined && <div className="sp-note">{line.note}</div>}
      <div className="sp-actions">
        <button
          className={`listen-rate sp-play ${speakingLine === index && speechStatus !== 'idle' ? 'active' : ''}`}
          onClick={() => { handlePlaySample(index, line.text) }}
        >🔊 听示范</button>
      </div>
    </div>
  )

  /** The practice half of one recordable line: record, replay, and score, shown in the right column. */
  const recordCard = (index: number) => {
    const attempt = attempts[index]
    const recording = recordingIndex === index
    return (
      <div className={`listen-q sp-line ${recording ? 'recording' : ''}`} key={`${round.time}-record-${String(index)}`}>
        <div className="sp-rec-label">第 {String(index + 1)} 句 · 跟读</div>
        <div className="sp-actions">
          {recording ? (
            <button className="sp-rec recording" onClick={() => { void stopAttempt() }}>⏹ 停止录音</button>
          ) : (
            <button className="sp-rec" onClick={() => { void startAttempt(index) }}>🎤 开始跟读</button>
          )}
          {attempt !== undefined && attempt.audioUrl !== null && (
            <button className="listen-rate" onClick={() => { handlePlayMine(index, attempt.audioUrl ?? '') }}>
              {minePlaying === index ? '🔈 播放中' : '▶ 我的录音'}
            </button>
          )}
          {!isAttemptDone(attempt) && (
            <button className="listen-rate" onClick={() => { markManual(index) }}>自评通过</button>
          )}
          {attempt !== undefined && attempt.score !== null && scoreBadge(attempt.score)}
          {attempt !== undefined && attempt.manual && <span className="sp-badge plain">自评通过</span>}
        </div>
        {recording && <div className="sp-interim">🎧 正在听你说：{interim === '' ? '…' : interim}</div>}
        {attempt !== undefined && attempt.transcript !== null && (
          <div className="sp-transcript">识别：{attempt.transcript}</div>
        )}
      </div>
    )
  }

  return (
    <div className="listening speaking">
      <div className="listen-panel split">
        {header}
        {graded !== null && (
          <PracticeScoreCard
            correct={graded.correct}
            total={graded.total}
            saved={graded.saved}
            onAgain={handleAgain}
            onDiscuss={handleDiscuss}
            discussLabel="💬 请 AI 点评"
            onExit={onExit}
          />
        )}
        <div className="listen-cols">
          <div className="listen-col listen-col-material">
            <div className="listen-player">
              <div className="listen-player-info">
                <div className="listen-player-title">跟读练习{sourceLabel !== undefined ? ` · ${sourceLabel}` : ''}</div>
                <div className="listen-player-hint">先听示范，再开始跟读；录完自动识别评分{recognitionSupported ? '' : '（本浏览器不支持识别，可自评）'}</div>
              </div>
              <div className="listen-progress-inline">已完成 {String(doneCount)}/{String(recordIndices.length)}</div>
            </div>
            <div className="listen-questions">
              {round.sentences.map((line, i) => scriptCard(line, i))}
            </div>
          </div>
          <div className="listen-col listen-col-practice">
            <div className="listen-questions">
              {recordIndices.map(i => recordCard(i))}
            </div>
            {micError !== null && <div className="sp-mic-error">{micError}</div>}
            {graded === null && (
              <div className="listen-footer">
                <span className="listen-progress">已完成 {String(doneCount)}/{String(recordIndices.length)}</span>
                <button className="listen-submit" disabled={doneCount < recordIndices.length || submitting} onClick={() => { void handleSubmit() }}>
                  {submitting ? '提交中…' : '提交成绩'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
