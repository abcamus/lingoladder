export interface Skill {
  id: string
  title: string
  icon: string
  score: number
  color: string
  colorLight: string
  level: string
  tasks: string[]
  done: boolean[]
}

export interface Material {
  id: string
  name: string
  icon: string
  iconBg: string
  type: string
  meta: string
  badge: 'ready' | 'new'
}

/** One learning material registered on the DSH server. */
export interface MaterialEntry {
  id: string
  name: string
  path: string
  bytes: number
  updatedAt: number
}

export type AbilityId = 'listening' | 'speaking' | 'reading' | 'writing'

/** Real activity counts for one ability dimension. */
export interface SkillActivity {
  exercises: number
  digests: number
  vocabulary: number
  activities: number
  /** Graded answer totals across graded exercise rounds; accuracy = correct/answered. */
  correct: number
  answered: number
}

/** One agent-written learning record, as surfaced in the dashboard. */
export interface ProgressRecordView {
  time: number
  kind: 'digest' | 'exercise'
  skill: string
  material?: string
  level?: string
}

/** Aggregated learning progress served by GET /api/progress. */
export interface ProgressSummary {
  skills: Record<AbilityId, SkillActivity>
  totals: { digests: number; exercises: number; vocabulary: number }
  xp: number
  streakDays: number
  recent: ProgressRecordView[]
}

/** One vocabulary bank group: the words extracted from one material. */
export interface VocabularyGroup {
  time: number
  material?: string
  level?: string
  words: Array<{ word: string; definition: string; example?: string }>
}

export interface Mission {
  id: string
  name: string
  desc: string
  icon: string
  iconBg: string
  xp: number
  done: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  /** Set on the message the placementComplete SSE event appends; renders the result card instead of a chat bubble. */
  placementResult?: LearnerProfile
}

export type SSEStatus = 'connecting' | 'connected' | 'disconnected'

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/** Learner placement record served by GET /api/profile; null means not assessed yet. */
export interface LearnerProfile {
  time: number
  kind: 'placement'
  source: 'placement' | 'manual'
  currentLevel: CEFRLevel
  skills?: Partial<Record<AbilityId, CEFRLevel>>
  weakSkills?: AbilityId[]
  summary?: string
}

/** Assessment stages the placement skill reports while it progresses, in escalation order. */
export type PlacementStage = 'background' | 'reading' | 'writing' | 'speaking' | 'scoring'

/** In-flight assessment stage, pushed over SSE and served by GET /api/placement. */
export interface PlacementProgress {
  time: number
  kind: 'placement-progress'
  stage: PlacementStage
  /** The 1-based round the agent is about to run; scoring reports totalRounds + 1. */
  round: number
  totalRounds: number
}

/** One four-option comprehension question; `answer` is the zero-based correct option. Shared by the listening and reading quiz sessions. */
export interface QuizQuestion {
  prompt: string
  options: string[]
  answer: number
  explanation?: string
}

/** One listening practice round the agent writes to the listening session file; the page grades against `answer`. */
export interface ListeningExercise {
  time: number
  kind: 'listening-exercise'
  material?: string
  topic?: string
  level?: string
  passage: string
  questions: QuizQuestion[]
}

/** One reading practice round the agent writes to the reading session file; the page grades against `answer`. */
export interface ReadingExercise {
  time: number
  kind: 'reading-exercise'
  material?: string
  topic?: string
  level?: string
  passage: string
  questions: QuizQuestion[]
}

/** One writing assignment: the prompt, its requirements, and the suggested length. */
export interface WritingTask {
  time: number
  kind: 'writing-exercise'
  material?: string
  topic?: string
  level?: string
  title: string
  requirements: string[]
  hint?: string
  /** Suggested English word count for the essay; the page shows a counter against it. */
  targetWords?: number
}

/** One graded writing outcome the skill writes after critiquing the submitted essay. */
export interface WritingResult {
  time: number
  kind: 'writing-result'
  material?: string
  topic?: string
  level?: string
  /** Integer 0-100; the progress record counts the round correct at 60 or above. */
  score: number
  summary?: string
  strengths?: string[]
  issues?: string[]
  revised?: string
}

/** One writing session document: either phase of the round. */
export type WritingDoc = WritingTask | WritingResult

/** One preset agent skill as the settings page's skill configuration shows it. */
export interface SkillInfo {
  name: string
  description: string
  whenToUse?: string
  enabled: boolean
}

/** One practice line. Lines without a role are repeat-after sentences; `A` is the partner's given line, `B` is the learner's line. */
export interface SpeakingLine {
  text: string
  role?: 'A' | 'B'
  note?: string
}

/** One speaking practice round the agent writes to the speaking session file. */
export interface SpeakingExercise {
  time: number
  kind: 'speaking-exercise'
  material?: string
  topic?: string
  level?: string
  sentences: SpeakingLine[]
}

/** Where a listening or speaking exercise's content comes from. */
export type ExerciseSource =
  | { kind: 'material'; material: MaterialEntry }
  | { kind: 'topic'; topic: string }

export interface Settings {
  name: string
  currentLevel: CEFRLevel
  targetLevel: CEFRLevel
  dailyGoal: number
  responseLanguage: 'zh' | 'en' | 'mixed'
  responseStyle: 'concise' | 'detailed' | 'tutor'
  uiLanguage: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  provider: string
  model: string
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  currentLevel: 'B1',
  targetLevel: 'C1',
  dailyGoal: 30,
  responseLanguage: 'mixed',
  responseStyle: 'tutor',
  uiLanguage: 'zh',
  theme: 'light',
  provider: '',
  model: '',
}

export interface DiscoveredModel {
  id: string
  name?: string
  description?: string | undefined
  contextWindow?: number | undefined
  maxTokens?: number | undefined
}

export interface DiscoveredProvider {
  provider: string
  displayName: string
  models: DiscoveredModel[]
}

export interface AddedModel {
  provider: string
  model: string
  name: string
  description?: string | undefined
}

export interface ConfigurableProvider {
  provider: string
  displayName: string
  settingsNs?: string
}
