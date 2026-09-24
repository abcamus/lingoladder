/**
 * Shared parsing and write-call classification for quiz-shaped practice documents —
 * a passage plus four-option questions with an answer key — currently the listening
 * and reading sessions.
 *
 * Zero-dependency module: the tolerant parser mirrors the on-disk contracts the
 * exercise-generator skill writes, and `classifyQuizWrite` maps a `write` tool call
 * onto those documents. Keeping this logic here lets the wire behavior be
 * unit-tested without loading the plugin composition.
 *
 * @module
 */

/** One four-option comprehension question over the passage. */
export interface QuizQuestion {
  prompt: string
  options: string[]
  /** Zero-based index of the correct option; the page grades against it. */
  answer: number
  explanation?: string
}

/** One quiz session document: the passage, its questions, and the answer key. */
export interface QuizExercise<K extends string = string> {
  time: number
  kind: K
  material?: string
  topic?: string
  level?: string
  passage: string
  questions: QuizQuestion[]
}

/** Parse a JSON object record; returns undefined for malformed or non-object content. */
export function parseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** Whether the value is a usable comprehension passage: multi-word text, not a stub. */
function isPassage(value: unknown): value is string {
  return typeof value === 'string' && /\s/.test(value.trim())
}

/** Parse one quiz session file of the given kind; returns undefined for malformed or non-conforming content. */
export function parseQuizExercise<K extends string>(content: string, kind: K): QuizExercise<K> | undefined {
  const record = parseJsonObject(content)
  if (record === undefined) return undefined
  if (typeof record.time !== 'number' || !Number.isFinite(record.time)) return undefined
  if (record.kind !== kind) return undefined
  if (!isPassage(record.passage)) return undefined
  if (!Array.isArray(record.questions) || record.questions.length === 0) return undefined
  const questions: QuizQuestion[] = []
  for (const candidate of record.questions) {
    if (typeof candidate !== 'object' || candidate === null) return undefined
    const question = candidate as Record<string, unknown>
    if (typeof question.prompt !== 'string' || question.prompt.trim() === '') return undefined
    if (!Array.isArray(question.options) || question.options.length < 2) return undefined
    const options = question.options.filter((option): option is string =>
      typeof option === 'string' && option.trim() !== '')
    if (options.length !== question.options.length) return undefined
    if (typeof question.answer !== 'number' || !Number.isInteger(question.answer)
      || question.answer < 0 || question.answer >= options.length) return undefined
    const parsedQuestion: QuizQuestion = {
      prompt: question.prompt,
      options,
      answer: question.answer,
    }
    if (typeof question.explanation === 'string' && question.explanation.trim() !== '') {
      parsedQuestion.explanation = question.explanation
    }
    questions.push(parsedQuestion)
  }
  const exercise: Record<string, unknown> = {
    time: record.time,
    kind,
    passage: record.passage,
    questions,
  }
  if (typeof record.material === 'string' && record.material !== '') exercise.material = record.material
  if (typeof record.topic === 'string' && record.topic !== '') exercise.topic = record.topic
  if (typeof record.level === 'string' && record.level !== '') exercise.level = record.level
  return exercise as unknown as QuizExercise<K>
}

/**
 * Whether a write target resolves to `<workspace>/.lingoladder/<fileName>`.
 * Accepts relative and absolute launch-workspace forms by matching the final path
 * segments, so the launch cwd never leaks into the classification.
 * @param filePath - the `write` call's target path as the model produced it.
 * @param fileName - the session file's base name.
 */
export function isSessionFile(filePath: string, fileName: string): boolean {
  const segments = filePath.replaceAll('\\', '/').split('/')
  return segments.length >= 2
    && segments[segments.length - 1] === fileName
    && segments[segments.length - 2] === '.lingoladder'
}

/** What a completed `write` tool call contributes to quiz practice tracking. */
export type QuizWriteIntent<K extends string> =
  | { kind: 'none' }
  | { kind: 'exercise'; exercise: QuizExercise<K> }

/** Parse the raw `write` tool-call arguments JSON; returns undefined for malformed or non-object content. */
export function parseWriteArguments(call: { name: string; arguments: string }): Record<string, unknown> | undefined {
  if (call.name !== 'write') return undefined
  try {
    const args: unknown = JSON.parse(call.arguments)
    return typeof args === 'object' && args !== null ? args as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * Classify a `write` tool call for one quiz session file. Only calls targeting the
 * file with a conforming document classify as tracked writes.
 * @param call - the raw `tool/call` event data: tool name and the arguments JSON string.
 * @param fileName - the session file's base name.
 * @param kind - the document kind the file must carry.
 * @returns the parsed quiz exercise the call writes, or none for unrelated calls.
 */
export function classifyQuizWrite<K extends string>(
  call: { name: string; arguments: string },
  fileName: string,
  kind: K,
): QuizWriteIntent<K> {
  const record = parseWriteArguments(call)
  if (record === undefined) return { kind: 'none' }
  if (typeof record.file_path !== 'string' || typeof record.content !== 'string') return { kind: 'none' }
  if (!isSessionFile(record.file_path, fileName)) return { kind: 'none' }
  const exercise = parseQuizExercise(record.content, kind)
  return exercise === undefined ? { kind: 'none' } : { kind: 'exercise', exercise }
}
