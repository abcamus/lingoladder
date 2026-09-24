import { useEffect, useState } from 'react'
import type { AbilityId, ChatMessage, LearnerProfile, PlacementProgress, PlacementStage, SSEStatus } from '../types'
import { fetchPlacementProgress } from '../lib/placement'
import { ABILITY_DEFS } from '../lib/abilities'
import { ChatInput } from './ChatInput'
import { ChatTranscript } from './ChatTranscript'
import { PlacementResult } from './PlacementResult'

interface AssessmentViewProps {
  /** Live progress from the placement SSE stream; null when nothing is streaming. */
  progress: PlacementProgress | null
  messages: ChatMessage[]
  status: SSEStatus
  /** The persisted placement record; undefined while the dashboard has not loaded it yet. */
  profile: LearnerProfile | null | undefined
  onSend: (text: string) => void | Promise<void>
  /** Send the fixed placement prompt; used by the start and retake CTAs. */
  onStart: () => void
  onExit: () => void
}

/** The five stepper stages in escalation order; the round table in the skill maps rounds onto these. */
const STAGE_STEPS: Array<{ stage: PlacementStage; label: string; icon: string }> = [
  { stage: 'background', label: '背景了解', icon: '👋' },
  { stage: 'reading', label: '阅读理解', icon: '📖' },
  { stage: 'writing', label: '写作表达', icon: '✍️' },
  { stage: 'speaking', label: '口语表达', icon: '🗣️' },
  { stage: 'scoring', label: '评估报告', icon: '📊' },
]

/** Which stage index actively assesses each dimension; listening is only ever estimated. */
const DIMENSION_STAGE: Record<AbilityId, number | undefined> = {
  listening: undefined,
  speaking: 3,
  reading: 1,
  writing: 2,
}

/** Full-screen placement assessment view: stage stepper, dimension indicators, and the embedded chat that drives the assessment. */
export function AssessmentView({ progress, messages, status, profile, onSend, onStart, onExit }: AssessmentViewProps) {
  // Restore an in-flight assessment after a reload; the live SSE progress takes precedence once it streams.
  const [restored, setRestored] = useState<PlacementProgress | null>(null)
  useEffect(() => {
    let mounted = true
    fetchPlacementProgress().then(
      (p) => { if (mounted) setRestored(p) },
      () => { if (mounted) setRestored(null) },
    )
    return () => { mounted = false }
  }, [])

  const completedResult = [...messages].reverse().find(m => m.placementResult !== undefined)?.placementResult
  const active = progress ?? restored
  const currentStep = active === null
    ? -1
    : STAGE_STEPS.findIndex(step => step.stage === active.stage)

  const roundLabel = active === null
    ? ''
    : active.stage === 'scoring'
      ? '评估中'
      : `第 ${String(Math.min(active.round, active.totalRounds))}/${String(active.totalRounds)} 轮`

  const dimensionState = (id: AbilityId): 'done' | 'active' | 'pending' => {
    if (completedResult !== undefined || currentStep >= STAGE_STEPS.length - 1) return 'done'
    const stageIndex = DIMENSION_STAGE[id]
    if (stageIndex === undefined) return 'pending'
    if (currentStep === stageIndex) return 'active'
    return currentStep > stageIndex ? 'done' : 'pending'
  }

  const emptyHint = active !== null
    ? '测评已开始，请在下方回答测评官的问题；全程约 5 分钟。'
    : undefined

  return (
    <div className="assessment">
      <div className="assess-panel">
        <div className="assess-header">
          <div className="assess-title">
            <span className="assess-title-icon">📐</span>
            <div>
              <div className="assess-title-main">英语能力定级测评</div>
              <div className="assess-title-sub">通过几轮对话评估你的 CEFR 水平（A1-C2）和薄弱维度</div>
            </div>
          </div>
          {active !== null && <span className="assess-round">{roundLabel}</span>}
          <button className="assess-exit" onClick={onExit}>{completedResult !== undefined ? '完成' : '退出'}</button>
        </div>

        <div className="assess-steps">
          {STAGE_STEPS.map((step, i) => {
            const state = completedResult !== undefined || i < currentStep
              ? 'done'
              : i === currentStep ? 'current' : 'locked'
            return (
              <div className="assess-segment" key={step.stage}>
                {i > 0 && <div className={`assess-line ${state === 'done' || state === 'current' ? 'done' : ''}`} />}
                <div className={`assess-node ${state}`}>{state === 'done' ? '✓' : step.icon}</div>
                <div className="assess-label">{step.label}</div>
              </div>
            )
          })}
        </div>

        {active !== null && (
          <div className="assess-dims">
            {ABILITY_DEFS.map((def) => {
              const state = dimensionState(def.id)
              const estimated = def.id === 'listening' || def.id === 'speaking'
              return (
                <div className={`assess-dim ${state}`} key={def.id}>
                  <span className="assess-dim-icon">{def.icon}</span>
                  <span className="assess-dim-name">{def.title.replace(/^.\s*/, '')}</span>
                  <span className="assess-dim-state">
                    {state === 'active' ? '进行中' : state === 'done' ? '已评估' : '待评估'}
                    {estimated && state !== 'pending' ? ' · 估算' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {completedResult !== undefined ? (
          <div className="assess-result">
            <PlacementResult profile={completedResult} />
            <div className="assess-result-hint">结果已保存，仪表盘的水平徽章和技能卡已更新；也可以在设置页重新测评。</div>
          </div>
        ) : active === null && profile ? (
          <div className="assess-result">
            <PlacementResult profile={profile} />
            <button className="assess-start" onClick={onStart}>重新测评</button>
          </div>
        ) : active === null ? (
          <div className="assess-intro">
            <div className="assess-intro-icon">📐</div>
            <div className="assess-intro-main">还没有测评记录</div>
            <div className="assess-intro-sub">测评通过与 AI 测评官对话完成：约 3-4 轮、全程 5 分钟，结果决定资料难度和练习起点。</div>
            <button className="assess-start" onClick={onStart}>开始测评</button>
          </div>
        ) : null}

        <ChatTranscript messages={messages} emptyHint={emptyHint} />
        <ChatInput status={status} onSend={onSend} placeholder={active !== null ? '回答测评官的问题...' : '输入消息...'} />
      </div>
    </div>
  )
}
