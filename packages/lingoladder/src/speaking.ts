/**
 * Speaking exercise document parsing and write-call classification for the English learning bundle.
 *
 * Zero-dependency module: the tolerant parser mirrors the on-disk contract the
 * exercise-generator skill writes (speaking-session.json), and `classifySpeakingWrite`
 * maps a `write` tool call onto that document. Keeping this logic here lets the
 * speaking wire behavior be unit-tested without loading the plugin composition.
 *
 * @module
 */

/** One practice line. Lines without a role are plain repeat-after sentences; `A` lines
 * are the dialogue partner's given line (listen only) and `B` lines are the learner's
 * lines to read aloud. */
export interface SpeakingLine {
  text: string
  role?: 'A' | 'B'
  note?: string
}

/** One speaking session document: the lines the page plays and records against. */
export interface SpeakingExercise {
  time: number
  kind: 'speaking-exercise'
  material?: string
  topic?: string
  level?: string
  sentences: SpeakingLine[]
}

/** Parse one speaking session file; returns undefined for malformed or non-conforming content. */
export function parseSpeakingExercise(content: string): SpeakingExercise | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (typeof record.time !== 'number' || !Number.isFinite(record.time)) return undefined
  if (record.kind !== 'speaking-exercise') return undefined
  if (!Array.isArray(record.sentences) || record.sentences.length === 0) return undefined
  const sentences: SpeakingLine[] = []
  for (const candidate of record.sentences) {
    if (typeof candidate !== 'object' || candidate === null) return undefined
    const line = candidate as Record<string, unknown>
    if (typeof line.text !== 'string' || line.text.trim() === '') return undefined
    if (line.role !== undefined && line.role !== 'A' && line.role !== 'B') return undefined
    const parsedLine: SpeakingLine = { text: line.text }
    if (line.role === 'A' || line.role === 'B') parsedLine.role = line.role
    if (typeof line.note === 'string' && line.note.trim() !== '') parsedLine.note = line.note
    sentences.push(parsedLine)
  }
  const exercise: Record<string, unknown> = {
    time: record.time,
    kind: record.kind,
    sentences,
  }
  if (typeof record.material === 'string' && record.material !== '') exercise.material = record.material
  if (typeof record.topic === 'string' && record.topic !== '') exercise.topic = record.topic
  if (typeof record.level === 'string' && record.level !== '') exercise.level = record.level
  return exercise as unknown as SpeakingExercise
}

/**
 * Whether a write target resolves to the agent-written speaking session file.
 * Accepts relative (`.lingoladder/speaking-session.json`) and absolute
 * launch-workspace forms by matching the final path segments, so the launch cwd
 * never leaks into the classification.
 * @param filePath - the `write` call's target path as the model produced it.
 */
export function isSpeakingSessionFile(filePath: string): boolean {
  const segments = filePath.replaceAll('\\', '/').split('/')
  return segments.length >= 2
    && segments[segments.length - 1] === 'speaking-session.json'
    && segments[segments.length - 2] === '.lingoladder'
}

/** What a completed `write` tool call contributes to speaking practice tracking. */
export type SpeakingWriteIntent =
  | { kind: 'none' }
  | { kind: 'exercise'; exercise: SpeakingExercise }

/**
 * Classify a `write` tool call for speaking practice tracking. Only calls targeting
 * the speaking session file with a conforming document classify as tracked writes.
 * @param call - the raw `tool/call` event data: tool name and the arguments JSON string.
 * @returns the parsed speaking exercise the call writes, or none for unrelated calls.
 */
export function classifySpeakingWrite(call: { name: string; arguments: string }): SpeakingWriteIntent {
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
  if (!isSpeakingSessionFile(record.file_path)) return { kind: 'none' }
  const exercise = parseSpeakingExercise(record.content)
  return exercise === undefined ? { kind: 'none' } : { kind: 'exercise', exercise }
}
