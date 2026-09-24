/**
 * Reading exercise document parsing and write-call classification for the English learning bundle.
 *
 * Thin specialization of the shared quiz module (`quiz.ts`): the reading session
 * document is the quiz shape — a passage plus four-option questions with an answer
 * key — written to `.lingoladder/reading-session.json`.
 *
 * @module
 */
import { classifyQuizWrite, isSessionFile, parseQuizExercise,
  type QuizExercise,
  type QuizQuestion,
  type QuizWriteIntent } from './quiz.ts'

/** One four-option reading comprehension question. */
export type ReadingQuestion = QuizQuestion

/** One reading session document: the passage, its questions, and the answer key. */
export type ReadingExercise = QuizExercise<'reading-exercise'>

/** Parse one reading session file; returns undefined for malformed or non-conforming content. */
export function parseReadingExercise(content: string): ReadingExercise | undefined {
  return parseQuizExercise(content, 'reading-exercise')
}

/**
 * Whether a write target resolves to the agent-written reading session file.
 * Accepts relative (`.lingoladder/reading-session.json`) and absolute
 * launch-workspace forms by matching the final path segments, so the launch cwd
 * never leaks into the classification.
 * @param filePath - the `write` call's target path as the model produced it.
 */
export function isReadingSessionFile(filePath: string): boolean {
  return isSessionFile(filePath, 'reading-session.json')
}

/** What a completed `write` tool call contributes to reading practice tracking. */
export type ReadingWriteIntent = QuizWriteIntent<'reading-exercise'>

/**
 * Classify a `write` tool call for reading practice tracking. Only calls targeting
 * the reading session file with a conforming document classify as tracked writes.
 * @param call - the raw `tool/call` event data: tool name and the arguments JSON string.
 * @returns the parsed reading exercise the call writes, or none for unrelated calls.
 */
export function classifyReadingWrite(call: { name: string; arguments: string }): ReadingWriteIntent {
  return classifyQuizWrite(call, 'reading-session.json', 'reading-exercise')
}
