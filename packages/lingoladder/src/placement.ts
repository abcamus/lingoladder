/**
 * Placement document parsing and write-call classification for the English learning bundle.
 *
 * Zero-dependency module: the tolerant parsers mirror the on-disk contracts the
 * placement-assessment skill writes (profile.json, placement-progress.json), and
 * `classifyPlacementWrite` maps a `write` tool call onto those documents. Keeping
 * this logic here lets the placement wire behavior be unit-tested without loading
 * the plugin composition.
 *
 * @module
 */

/** The four ability dimensions a placement record can score. */
export const ABILITY_IDS = ['listening', 'speaking', 'reading', 'writing'] as const

/** Valid CEFR levels for a placement record. */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/** Assessment stages the placement skill reports while it progresses. */
export const PLACEMENT_STAGES = ['background', 'reading', 'writing', 'speaking', 'scoring'] as const

/** Learner placement record: the assessed (source placement) or manually picked (source manual) CEFR level. */
export interface LearnerProfile {
  time: number
  kind: 'placement'
  source: 'placement' | 'manual'
  currentLevel: string
  skills?: Partial<Record<(typeof ABILITY_IDS)[number], string>>
  weakSkills?: Array<(typeof ABILITY_IDS)[number]>
  summary?: string
}

/** One placement progress document: the assessment stage reported at each stage transition. */
export interface PlacementProgress {
  time: number
  kind: 'placement-progress'
  stage: (typeof PLACEMENT_STAGES)[number]
  round: number
  totalRounds: number
}

/** Parse one placement file; returns undefined for malformed or non-conforming content. */
export function parseLearnerProfile(content: string): LearnerProfile | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (typeof record.time !== 'number' || !Number.isFinite(record.time)) return undefined
  if (record.kind !== 'placement') return undefined
  if (record.source !== 'placement' && record.source !== 'manual') return undefined
  if (typeof record.currentLevel !== 'string' || !(CEFR_LEVELS as readonly string[]).includes(record.currentLevel)) return undefined
  const profile: Record<string, unknown> = {
    time: record.time,
    kind: record.kind,
    source: record.source,
    currentLevel: record.currentLevel,
  }
  if (typeof record.summary === 'string') profile.summary = record.summary
  if (Array.isArray(record.weakSkills)) {
    const weak = record.weakSkills.filter((skill): skill is (typeof ABILITY_IDS)[number] =>
      typeof skill === 'string' && (ABILITY_IDS as readonly string[]).includes(skill))
    if (weak.length > 0) profile.weakSkills = weak
  }
  if (typeof record.skills === 'object' && record.skills !== null) {
    const levels = record.skills as Record<string, unknown>
    const perSkill: Partial<Record<(typeof ABILITY_IDS)[number], string>> = {}
    for (const id of ABILITY_IDS) {
      const level = levels[id]
      if (typeof level === 'string' && (CEFR_LEVELS as readonly string[]).includes(level)) perSkill[id] = level
    }
    if (Object.keys(perSkill).length > 0) profile.skills = perSkill
  }
  return profile as unknown as LearnerProfile
}

/** Parse one placement progress file; returns undefined for malformed or non-conforming content. */
export function parsePlacementProgress(content: string): PlacementProgress | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (typeof record.time !== 'number' || !Number.isFinite(record.time)) return undefined
  if (record.kind !== 'placement-progress') return undefined
  if (typeof record.stage !== 'string' || !(PLACEMENT_STAGES as readonly string[]).includes(record.stage)) return undefined
  if (typeof record.round !== 'number' || !Number.isInteger(record.round) || record.round < 1) return undefined
  if (typeof record.totalRounds !== 'number' || !Number.isInteger(record.totalRounds) || record.totalRounds < 1) return undefined
  return {
    time: record.time,
    kind: record.kind,
    stage: record.stage as PlacementProgress['stage'],
    round: record.round,
    totalRounds: record.totalRounds,
  }
}

/**
 * Whether a write target resolves to one of the agent-written placement files.
 * Accepts relative (`.lingoladder/profile.json`) and absolute launch-workspace
 * forms by matching the final path segments, so the launch cwd never leaks into
 * the classification.
 * @param filePath - the `write` call's target path as the model produced it.
 * @param fileName - the placement file's base name (`profile.json` or `placement-progress.json`).
 */
export function isPlacementFile(filePath: string, fileName: string): boolean {
  const segments = filePath.replaceAll('\\', '/').split('/')
  return segments.length >= 2
    && segments[segments.length - 1] === fileName
    && segments[segments.length - 2] === '.lingoladder'
}

/** What a completed `write` tool call contributes to placement tracking. */
export type PlacementWriteIntent =
  | { kind: 'none' }
  | { kind: 'progress'; progress: PlacementProgress }
  | { kind: 'profile'; profile: LearnerProfile }

/**
 * Classify a `write` tool call for placement tracking. Only calls targeting the
 * placement progress file or a placement-sourced profile document classify as
 * tracked writes; a manual-source profile document never counts, so a chat ask
 * to hand-edit the profile cannot fake an assessment completion.
 * @param call - the raw `tool/call` event data: tool name and the arguments JSON string.
 * @returns the parsed placement document the call writes, or none for unrelated calls.
 */
export function classifyPlacementWrite(call: { name: string; arguments: string }): PlacementWriteIntent {
  if (call.name !== 'write') return { kind: 'none' }
  let args: unknown
  try {
    args = JSON.parse(call.arguments)
  } catch {
    return { kind: 'none' }
  }
  if (typeof args !== 'object' || args === null) return { kind: 'none' }
  const record = args as Record<string, unknown>
  if (typeof record.file_path !== 'string' || typeof record.content !== 'string') return { kind: 'none' }
  if (isPlacementFile(record.file_path, 'placement-progress.json')) {
    const progress = parsePlacementProgress(record.content)
    return progress === undefined ? { kind: 'none' } : { kind: 'progress', progress }
  }
  if (isPlacementFile(record.file_path, 'profile.json')) {
    const profile = parseLearnerProfile(record.content)
    if (profile === undefined || profile.source !== 'placement') return { kind: 'none' }
    return { kind: 'profile', profile }
  }
  return { kind: 'none' }
}
