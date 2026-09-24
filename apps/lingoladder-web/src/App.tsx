import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router'
import type { Skill, Material, Mission, Settings, MaterialEntry, ProgressSummary, VocabularyGroup, LearnerProfile, ExerciseSource, WritingTask } from './types'
import { DEFAULT_SETTINGS } from './types'
import { useSSE } from './hooks/useSSE'
import { ABILITY_DEFS } from './lib/abilities'
import { addMaterial, deleteMaterial, listMaterials } from './lib/materials'
import { fetchProgress } from './lib/progress'
import { fetchProfile } from './lib/profile'
import { fetchVocabulary } from './lib/vocabulary'
import { fetchListeningSession } from './lib/listening'
import { fetchReadingSession } from './lib/reading'
import { fetchSpeakingSession } from './lib/speaking'
import { fetchWritingSession } from './lib/writing'
import { TopBar } from './components/TopBar'
import { LevelPath } from './components/LevelPath'
import { SkillCard } from './components/SkillCard'
import { RightPanel } from './components/RightPanel'
import { AIChat } from './components/AIChat'
import { AssessmentView } from './components/AssessmentView'
import { ListeningPractice } from './components/ListeningPractice'
import { ReadingPractice } from './components/ReadingPractice'
import { SpeakingPractice } from './components/SpeakingPractice'
import { WritingPractice } from './components/WritingPractice'
import { SettingsPage } from './components/SettingsPage'
import { SkillDetailModal } from './components/Modals/SkillDetailModal'
import { UploadModal } from './components/Modals/UploadModal'
import { AIFindModal } from './components/Modals/AIFindModal'
import { PlacementModal } from './components/Modals/PlacementModal'

/** XP needed for one learner level; a level is five stages. */
const XP_PER_LEVEL = 200

const MATERIALS_ICON = { icon: '📄', iconBg: 'var(--pu-l)' }

const MISSIONS: Mission[] = [
  { id: 'ms1', name: '学习 5 个新单词', desc: '词汇 · 3/5 完成', icon: '📚', iconBg: 'var(--accent-l)', xp: 20, done: false },
  { id: 'ms2', name: '完成听力练习', desc: '听力 · 0/1 完成', icon: '🎧', iconBg: 'var(--tl-l)', xp: 25, done: false },
  { id: 'ms3', name: '跟读一段材料', desc: '口语 · 0/1 完成', icon: '🗣️', iconBg: 'var(--secondary-l)', xp: 30, done: false },
  { id: 'ms4', name: '今日登录', desc: '每日 · 已完成', icon: '✅', iconBg: 'var(--primary-l)', xp: 10, done: true },
]

/** localStorage key marking that the user dismissed the placement onboarding modal. */
const PLACEMENT_DISMISSED_KEY = 'placement-modal-dismissed'

export function App() {
  const {
    messages, status, sendMessage, placementProgress,
    listeningExercise, setListeningExercise,
    speakingExercise, setSpeakingExercise,
    readingExercise, setReadingExercise,
    writingDoc, setWritingDoc,
  } = useSSE()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showAiFind, setShowAiFind] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [materials, setMaterials] = useState<MaterialEntry[]>([])
  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ProgressSummary | null>(null)
  const [vocabulary, setVocabulary] = useState<VocabularyGroup[]>([])
  const [profile, setProfile] = useState<LearnerProfile | null | undefined>(undefined)
  const [showPlacement, setShowPlacement] = useState(false)
  const handledResultIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    const load = () => {
      listMaterials().then(
        (entries) => { if (mounted) setMaterials(entries) },
        (err: unknown) => { console.error('failed to load materials:', err) },
      )
      fetchProgress().then(
        (summary) => { if (mounted) setProgress(summary) },
        (err: unknown) => { console.error('failed to load progress:', err) },
      )
      fetchVocabulary().then(
        (entries) => { if (mounted) setVocabulary(entries) },
        (err: unknown) => { console.error('failed to load vocabulary:', err) },
      )
      fetchProfile().then(
        (p) => { if (mounted) setProfile(p) },
        (err: unknown) => { console.error('failed to load profile:', err) },
      )
      // The pending listening exercise restores a half-finished practice round after a reload.
      fetchListeningSession().then(
        (exercise) => { if (mounted) setListeningExercise(exercise) },
        (err: unknown) => { console.error('failed to load listening session:', err) },
      )
      fetchSpeakingSession().then(
        (exercise) => { if (mounted) setSpeakingExercise(exercise) },
        (err: unknown) => { console.error('failed to load speaking session:', err) },
      )
      fetchReadingSession().then(
        (exercise) => { if (mounted) setReadingExercise(exercise) },
        (err: unknown) => { console.error('failed to load reading session:', err) },
      )
      fetchWritingSession().then(
        (doc) => { if (mounted) setWritingDoc(doc) },
        (err: unknown) => { console.error('failed to load writing session:', err) },
      )
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  // Onboarding: offer the placement assessment once, until it is done or dismissed.
  useEffect(() => {
    if (profile === null && localStorage.getItem(PLACEMENT_DISMISSED_KEY) === null) {
      setShowPlacement(true)
    }
  }, [profile])

  // A placement completion pushed over SSE refreshes the dashboard immediately instead
  // of waiting for the next 30-second poll.
  useEffect(() => {
    const resultMessage = [...messages].reverse().find(m => m.placementResult !== undefined)
    if (resultMessage === undefined || handledResultIdsRef.current.has(resultMessage.id)) return
    handledResultIdsRef.current.add(resultMessage.id)
    fetchProfile().then(
      (p) => { setProfile(p) },
      (err: unknown) => { console.error('failed to load profile:', err) },
    )
    fetchProgress().then(
      (summary) => { setProgress(summary) },
      (err: unknown) => { console.error('failed to load progress:', err) },
    )
  }, [messages])

  const handleAddMaterial = useCallback(async (name: string, content: string) => {
    const entry = await addMaterial(name, content)
    setMaterials(prev => [entry, ...prev.filter(m => m.id !== entry.id)])
  }, [])

  const handleDeleteMaterial = useCallback(async (id: string) => {
    await deleteMaterial(id)
    setMaterials(prev => prev.filter(m => m.id !== id))
  }, [])

  const handleAnalyzeMaterial = useCallback((entry: MaterialEntry) => {
    setAnalyzedIds(prev => new Set(prev).add(entry.id))
    void sendMessage(`请使用 material-digest 技能分析学习资料「${entry.name}」，用 read 工具读取文件：${entry.path}`)
    void navigate('/')
  }, [sendMessage, navigate])

  const handlePracticeMaterial = useCallback((entry: MaterialEntry) => {
    void sendMessage(`请使用 exercise-generator 技能，基于学习资料「${entry.name}」对我进行交互式训练（用 read 工具读取文件：${entry.path}）。先读取 .lingoladder/profile.json 里的定级结果判断我的水平和薄弱维度（没有档案再读 .lingoladder/progress/ 下的记录），从薄弱维度开始出题。`)
    void navigate('/')
  }, [sendMessage, navigate])

  const handleReviewVocabulary = useCallback(() => {
    void sendMessage('请使用 exercise-generator 技能对我进行词汇复习训练：读取 .lingoladder/vocabulary/ 词汇本，从中挑 5 个词出题（选择或填空），等我作答后批改并记录成绩。')
    void navigate('/')
  }, [sendMessage, navigate])

  const handleAiFind = useCallback((topic: string) => {
    const preference = topic.trim() === '' ? '主题由你根据我的薄弱维度决定' : `主题偏好：「${topic.trim()}」`
    void sendMessage(`请使用 material-search 技能，先读取 .lingoladder/profile.json 里的定级结果评估我的能力情况（当前水平和薄弱维度；没有档案再读 .lingoladder/progress/ 下的学习记录），然后自动搜索并抓取一份合适的英语学习资料，保存到 .lingoladder/materials/ 目录。${preference}。`)
    void navigate('/')
  }, [sendMessage, navigate])

  /** Send the placement assessment request through the chat and open the assessment view. */
  const startPlacement = useCallback(() => {
    setShowPlacement(false)
    void sendMessage('请使用 placement-assessment 技能对我进行初始定级测评，完成后把结果写入 .lingoladder/profile.json')
    void navigate('/assessment')
  }, [sendMessage, navigate])

  const dismissPlacement = useCallback(() => {
    localStorage.setItem(PLACEMENT_DISMISSED_KEY, '1')
    setShowPlacement(false)
  }, [])

  /** Send the page-driven listening generation prompt; the exercise lands over SSE. */
  const startListening = useCallback((source: ExerciseSource) => {
    const levelHint = '先读取 .lingoladder/profile.json 里的定级结果判断我的水平（没有档案再读 .lingoladder/progress/ 下的记录）'
    const origin = source.kind === 'material'
      ? `基于学习资料「${source.material.name}」出题（用 read 工具读取文件：${source.material.path}）`
      : source.topic.trim() === '' ? '话题由你按我的水平和薄弱维度决定' : `就话题「${source.topic.trim()}」出题`
    void sendMessage(`请使用 exercise-generator 技能生成一组听力练习（来自听力练习页）。${levelHint}，然后${origin}：写一段符合我水平的英文短文，出 3-5 道四选一理解题，把完整练习（含答案和解析）写入 .lingoladder/listening-session.json；聊天里只回复一句确认，不要输出原文和题目。`)
  }, [sendMessage])

  /** A graded listening round was reported: drop the pending session and refresh the dashboard immediately. */
  const handleListeningSubmitted = useCallback(() => {
    setListeningExercise(null)
    fetchProgress().then(
      (summary) => { setProgress(summary) },
      (err: unknown) => { console.error('failed to load progress:', err) },
    )
  }, [setListeningExercise])

  /** Send the page-driven speaking generation prompt; the exercise lands over SSE. */
  const startSpeaking = useCallback((source: ExerciseSource) => {
    const levelHint = '先读取 .lingoladder/profile.json 里的定级结果判断我的水平（没有档案再读 .lingoladder/progress/ 下的记录）'
    const origin = source.kind === 'material'
      ? `基于学习资料「${source.material.name}」出题（用 read 工具读取文件：${source.material.path}）`
      : source.topic.trim() === '' ? '话题由你按我的水平和薄弱维度决定' : `就话题「${source.topic.trim()}」出题`
    void sendMessage(`请使用 exercise-generator 技能生成一组口语练习（来自口语练习页）。${levelHint}，然后${origin}：出 5-8 句适合朗读的英文句子（可以是跟读句，或一组 A/B 情景对话，A 是对方的话、B 是我读的话），把完整练习（含 role 标注）写入 .lingoladder/speaking-session.json；聊天里只回复一句确认，不要输出练习内容。`)
  }, [sendMessage])

  /** A scored speaking round was reported: drop the pending session and refresh the dashboard immediately. */
  const handleSpeakingSubmitted = useCallback(() => {
    setSpeakingExercise(null)
    fetchProgress().then(
      (summary) => { setProgress(summary) },
      (err: unknown) => { console.error('failed to load progress:', err) },
    )
  }, [setSpeakingExercise])

  /** Send the page-driven reading generation prompt; the exercise lands over SSE. */
  const startReading = useCallback((source: ExerciseSource) => {
    const levelHint = '先读取 .lingoladder/profile.json 里的定级结果判断我的水平（没有档案再读 .lingoladder/progress/ 下的记录）'
    const origin = source.kind === 'material'
      ? `基于学习资料「${source.material.name}」出题（用 read 工具读取文件：${source.material.path}）`
      : source.topic.trim() === '' ? '话题由你按我的水平和薄弱维度决定' : `就话题「${source.topic.trim()}」出题`
    void sendMessage(`请使用 exercise-generator 技能生成一组阅读理解练习（来自阅读练习页）。${levelHint}，然后${origin}：写一段符合我水平的英文短文，出 3-5 道四选一理解题，把完整练习（含答案和解析）写入 .lingoladder/reading-session.json；聊天里只回复一句确认，不要输出原文和题目。`)
  }, [sendMessage])

  /** A graded reading round was reported: drop the pending session and refresh the dashboard immediately. */
  const handleReadingSubmitted = useCallback(() => {
    setReadingExercise(null)
    fetchProgress().then(
      (summary) => { setProgress(summary) },
      (err: unknown) => { console.error('failed to load progress:', err) },
    )
  }, [setReadingExercise])

  /** Send the page-driven writing generation prompt; the assignment lands over SSE. */
  const startWriting = useCallback((source: ExerciseSource) => {
    const levelHint = '先读取 .lingoladder/profile.json 里的定级结果判断我的水平（没有档案再读 .lingoladder/progress/ 下的记录）'
    const origin = source.kind === 'material'
      ? `基于学习资料「${source.material.name}」出题（用 read 工具读取文件：${source.material.path}）`
      : source.topic.trim() === '' ? '话题由你按我的水平和薄弱维度决定' : `就话题「${source.topic.trim()}」出题`
    void sendMessage(`请使用 exercise-generator 技能生成一篇写作练习（来自写作练习页）。${levelHint}，然后${origin}：出英文写作题目和具体要求（用词、字数、时态，targetWords 为建议词数），把写作任务写入 .lingoladder/writing-session.json；聊天里只回复一句确认，不要输出题目。`)
  }, [sendMessage])

  /** Hand the learner's essay to the tutor for grading; the outcome lands over SSE. */
  const submitWritingEssay = useCallback((task: WritingTask, essay: string) => {
    const requirements = task.requirements.join('；')
    void sendMessage(`请批改我写的作文（来自写作练习页，题目「${task.title}」，要求：${requirements}）。先读取 .lingoladder/writing-session.json 里我这份任务的定级信息，按写作练习页的批改流程批改正文，完成后把结构化结果（kind 为 writing-result）重写进同一文件。我的作文正文：\n${essay}`)
  }, [sendMessage])

  /** A scored writing round was reported: drop the pending session and refresh the dashboard immediately. */
  const handleWritingSubmitted = useCallback(() => {
    setWritingDoc(null)
    fetchProgress().then(
      (summary) => { setProgress(summary) },
      (err: unknown) => { console.error('failed to load progress:', err) },
    )
  }, [setWritingDoc])

  const displayMaterials: Material[] = materials.map(m => ({
    id: m.id,
    name: m.name,
    ...MATERIALS_ICON,
    type: `文本 · ${Math.max(1, Math.round(m.bytes / 1024))} KB`,
    meta: m.path,
    badge: analyzedIds.has(m.id) ? 'ready' : 'new',
  }))

  // The assessed placement is the authoritative current level; the settings pick only covers
  // the period before the first assessment.
  const effectiveLevel = profile?.currentLevel ?? settings.currentLevel

  // Ability dimensions derive from the agent's real learning records: score is activity
  // volume (each record is worth 20 points, capped at 100); graded rounds add an accuracy
  // read-out to the exercise task.
  const buildSkills = (): Skill[] => ABILITY_DEFS.map((def) => {
    const activity = progress?.skills[def.id] ?? {
      exercises: 0, digests: 0, vocabulary: 0, activities: 0, correct: 0, answered: 0,
    }
    const accuracy = activity.answered > 0
      ? ` · 正确${String(Math.round((activity.correct / activity.answered) * 100))}%`
      : ''
    const tasks = [
      { label: `完成练习 ×${activity.exercises}${accuracy}`, done: activity.exercises > 0 },
      { label: `积累词汇 ×${activity.vocabulary}`, done: activity.vocabulary > 0 },
      { label: `分析材料 ×${activity.digests}`, done: activity.digests > 0 },
    ]
    return {
      id: def.id,
      title: def.title,
      icon: def.icon,
      score: Math.min(100, activity.activities * 20),
      color: def.color,
      colorLight: def.colorLight,
      level: `${effectiveLevel} → ${settings.targetLevel}`,
      tasks: tasks.map(t => t.label),
      done: tasks.map(t => t.done),
    }
  })

  const xp = progress?.xp ?? 0
  const levelNumber = 1 + Math.floor(xp / XP_PER_LEVEL)
  const xpIntoLevel = xp % XP_PER_LEVEL
  const stage = Math.min(5, Math.floor(xpIntoLevel / (XP_PER_LEVEL / 5)) + 1)

  const handleSkillClick = (id: string) => {
    // The listening and speaking cards open their dedicated practice pages; the other abilities keep the detail modal.
    if (id === 'listening') {
      void navigate('/listening')
      return
    }
    if (id === 'speaking') {
      void navigate('/speaking')
      return
    }
    if (id === 'reading') {
      void navigate('/reading')
      return
    }
    if (id === 'writing') {
      void navigate('/writing')
      return
    }
    setSelectedSkill(buildSkills().find(s => s.id === id) ?? null)
  }

  return (
    <div className="app">
      <TopBar xp={xp} xpIntoLevel={xpIntoLevel} xpPerLevel={XP_PER_LEVEL} cefr={effectiveLevel} streakDays={progress?.streakDays ?? 0} />

      <Routes>
        <Route
          path="/"
          element={
            <div className="main">
              <div className="left">
                <LevelPath level={levelNumber} currentStage={stage} totalStages={5} />
                <div className="skill-grid">
                  {buildSkills().map(s => (
                    <SkillCard key={s.id} skill={s} onClick={handleSkillClick} />
                  ))}
                </div>
              </div>
              <RightPanel
                materials={displayMaterials}
                missions={MISSIONS}
                skills={buildSkills()}
                streakDays={progress?.streakDays ?? 0}
                vocabulary={vocabulary}
                onUpload={() => { setShowUpload(true) }}
                onAiFind={() => { setShowAiFind(true) }}
                onDeleteMaterial={(id) => { void handleDeleteMaterial(id) }}
                onAnalyzeMaterial={(id) => {
                  const entry = materials.find(m => m.id === id)
                  if (entry !== undefined) handleAnalyzeMaterial(entry)
                }}
                onPracticeMaterial={(id) => {
                  const entry = materials.find(m => m.id === id)
                  if (entry !== undefined) handlePracticeMaterial(entry)
                }}
                onReviewVocabulary={handleReviewVocabulary}
              />
            </div>
          }
        />
        <Route
          path="/assessment"
          element={
            <AssessmentView
              progress={placementProgress}
              messages={messages}
              status={status}
              profile={profile}
              onSend={(text) => { void sendMessage(text) }}
              onStart={startPlacement}
              onExit={() => { void navigate('/') }}
            />
          }
        />
        <Route
          path="/listening"
          element={
            <ListeningPractice
              materials={materials}
              level={effectiveLevel}
              exercise={listeningExercise}
              status={status}
              onStart={startListening}
              onSubmitted={handleListeningSubmitted}
              onDiscuss={(text) => {
                void sendMessage(text)
                void navigate('/')
              }}
              onExit={() => { void navigate('/') }}
            />
          }
        />
        <Route
          path="/speaking"
          element={
            <SpeakingPractice
              materials={materials}
              level={effectiveLevel}
              exercise={speakingExercise}
              status={status}
              onStart={startSpeaking}
              onSubmitted={handleSpeakingSubmitted}
              onDiscuss={(text) => {
                void sendMessage(text)
                void navigate('/')
              }}
              onExit={() => { void navigate('/') }}
            />
          }
        />
        <Route
          path="/reading"
          element={
            <ReadingPractice
              materials={materials}
              level={effectiveLevel}
              exercise={readingExercise}
              status={status}
              onStart={startReading}
              onSubmitted={handleReadingSubmitted}
              onDiscuss={(text) => {
                void sendMessage(text)
                void navigate('/')
              }}
              onExit={() => { void navigate('/') }}
            />
          }
        />
        <Route
          path="/writing"
          element={
            <WritingPractice
              materials={materials}
              level={effectiveLevel}
              doc={writingDoc}
              status={status}
              onStart={startWriting}
              onSubmitEssay={submitWritingEssay}
              onSubmitted={handleWritingSubmitted}
              onExit={() => { void navigate('/') }}
            />
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              settings={{ ...settings, currentLevel: effectiveLevel }}
              profile={profile ?? null}
              onSave={setSettings}
              onProfileSaved={setProfile}
              onRetakeAssessment={startPlacement}
            />
          }
        />
      </Routes>

      {location.pathname !== '/settings' && location.pathname !== '/assessment' && location.pathname !== '/listening' && location.pathname !== '/speaking' && location.pathname !== '/reading' && location.pathname !== '/writing' && (
        <AIChat
          messages={messages}
          status={status}
          placementActive={placementProgress !== null}
          onSend={(text) => { void sendMessage(text) }}
          onEnterAssessment={() => { void navigate('/assessment') }}
        />
      )}

      <SkillDetailModal skill={selectedSkill} onClose={() => { setSelectedSkill(null) }} />
      {showUpload && (
        <UploadModal
          onClose={() => { setShowUpload(false) }}
          onAdd={(name, content) => { void handleAddMaterial(name, content) }}
        />
      )}
      {showAiFind && (
        <AIFindModal
          currentLevel={effectiveLevel}
          onClose={() => { setShowAiFind(false) }}
          onFind={handleAiFind}
        />
      )}
      {showPlacement && (
        <PlacementModal
          onStart={startPlacement}
          onSkip={dismissPlacement}
        />
      )}
    </div>
  )
}
