/**
 * Writing exercise document parsing and write-call classification for the English learning bundle.
 *
 * Zero-dependency module. Writing is the one ability the page cannot grade against an
 * answer key, so the session file carries two phases discriminated by the document kind:
 * the skill writes the assignment (`writing-exercise`) when the round starts, and after
 * grading the chat essay it rewrites the same file with the outcome (`writing-result`).
 * The tolerant parsers mirror those on-disk contracts and `classifyWritingWrite` maps a
 * `write` tool call onto either phase. Keeping this logic here lets the wire behavior be
 * unit-tested without loading the plugin composition.
 *
 * @module
 */
import { parseJsonObject, parseWriteArguments } from './quiz.ts'

/** One writing assignment: the prompt, its requirements, and the room the learner writes in. */
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

/** One graded outcome the skill writes after critiquing the submitted essay. */
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

/** What a parsed session document contributes. */
export type WritingDocument =
  | { kind: 'task'; task: WritingTask }
  | { kind: 'result'; result: WritingResult }

/** Parse the shared string fields both phases carry; returns undefined for a malformed value. */
function parseSharedFields(record: Record<string, unknown>, doc: Record<string, unknown>): boolean {
  if (typeof record.material === 'string' && record.material !== '') doc.material = record.material
  if (typeof record.topic === 'string' && record.topic !== '') doc.topic = record.topic
  if (typeof record.level === 'string' && record.level !== '') doc.level = record.level
  return true
}

/** Parse one writing session file; returns undefined for malformed or non-conforming content. */
export function parseWritingDocument(content: string): WritingDocument | undefined {
  const record = parseJsonObject(content)
  if (record === undefined) return undefined
  if (typeof record.time !== 'number' || !Number.isFinite(record.time)) return undefined

  if (record.kind === 'writing-exercise') {
    if (typeof record.title !== 'string' || record.title.trim() === '') return undefined
    if (!Array.isArray(record.requirements) || record.requirements.length === 0) return undefined
    const requirements = record.requirements.filter((item): item is string =>
      typeof item === 'string' && item.trim() !== '')
    if (requirements.length !== record.requirements.length) return undefined
    const task: Record<string, unknown> = {
      time: record.time,
      kind: record.kind,
      title: record.title,
      requirements,
    }
    parseSharedFields(record, task)
    if (typeof record.hint === 'string' && record.hint.trim() !== '') task.hint = record.hint
    if (record.targetWords !== undefined) {
      if (typeof record.targetWords !== 'number' || !Number.isInteger(record.targetWords) || record.targetWords <= 0) {
        return undefined
      }
      task.targetWords = record.targetWords
    }
    return { kind: 'task', task: task as unknown as WritingTask }
  }

  if (record.kind === 'writing-result') {
    if (typeof record.score !== 'number' || !Number.isInteger(record.score)
      || record.score < 0 || record.score > 100) return undefined
    const result: Record<string, unknown> = {
      time: record.time,
      kind: record.kind,
      score: record.score,
    }
    parseSharedFields(record, result)
    if (typeof record.summary === 'string' && record.summary.trim() !== '') result.summary = record.summary
    for (const field of ['strengths', 'issues'] as const) {
      const value = record[field]
      if (Array.isArray(value)) {
        const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
        if (items.length !== value.length) return undefined
        if (items.length > 0) result[field] = items
      }
    }
    if (typeof record.revised === 'string' && record.revised.trim() !== '') result.revised = record.revised
    return { kind: 'result', result: result as unknown as WritingResult }
  }

  return undefined
}

/**
 * Whether a write target resolves to the agent-written writing session file.
 * Accepts relative (`.lingoladder/writing-session.json`) and absolute
 * launch-workspace forms by matching the final path segments, so the launch cwd
 * never leaks into the classification.
 * @param filePath - the `write` call's target path as the model produced it.
 */
export function isWritingSessionFile(filePath: string): boolean {
  const segments = filePath.replaceAll('\\', '/').split('/')
  return segments.length >= 2
    && segments[segments.length - 1] === 'writing-session.json'
    && segments[segments.length - 2] === '.lingoladder'
}

/** What a completed `write` tool call contributes to writing practice tracking. */
export type WritingWriteIntent =
  | { kind: 'none' }
  | { kind: 'task'; task: WritingTask }
  | { kind: 'result'; result: WritingResult }

/**
 * Classify a `write` tool call for writing practice tracking. Only calls targeting
 * the writing session file with a conforming task or result document classify as
 * tracked writes.
 * @param call - the raw `tool/call` event data: tool name and the arguments JSON string.
 * @returns the parsed writing document the call writes, or none for unrelated calls.
 */
export function classifyWritingWrite(call: { name: string; arguments: string }): WritingWriteIntent {
  const record = parseWriteArguments(call)
  if (record === undefined) return { kind: 'none' }
  if (typeof record.file_path !== 'string' || typeof record.content !== 'string') return { kind: 'none' }
  if (!isWritingSessionFile(record.file_path)) return { kind: 'none' }
  const document = parseWritingDocument(record.content)
  if (document === undefined) return { kind: 'none' }
  return document.kind === 'task' ? { kind: 'task', task: document.task } : { kind: 'result', result: document.result }
}
