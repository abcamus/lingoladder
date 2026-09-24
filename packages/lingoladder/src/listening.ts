/**
 * Listening exercise document parsing and write-call classification for the English learning bundle.
 *
 * Thin specialization of the shared quiz module (`quiz.ts`): the listening session
 * document is the quiz shape — a passage plus four-option questions with an answer
 * key — written to `.lingoladder/listening-session.json`.
 *
 * @module
 */
import { classifyQuizWrite, isSessionFile, parseQuizExercise,
  type QuizExercise,
  type QuizQuestion,
  type QuizWriteIntent } from './quiz.ts'

/** One four-option listening comprehension question. */
export type ListeningQuestion = QuizQuestion

/** One listening session document: the passage, its questions, and the answer key. */
export type ListeningExercise = QuizExercise<'listening-exercise'>

/** Parse one listening session file; returns undefined for malformed or non-conforming content. */
export function parseListeningExercise(content: string): ListeningExercise | undefined {
  return parseQuizExercise(content, 'listening-exercise')
}

/**
 * Whether a write target resolves to the agent-written listening session file.
 * Accepts relative (`.lingoladder/listening-session.json`) and absolute
 * launch-workspace forms by matching the final path segments, so the launch cwd
 * never leaks into the classification.
 * @param filePath - the `write` call's target path as the model produced it.
 */
export function isListeningSessionFile(filePath: string): boolean {
  return isSessionFile(filePath, 'listening-session.json')
}

/** What a completed `write` tool call contributes to listening practice tracking. */
export type ListeningWriteIntent = QuizWriteIntent<'listening-exercise'>

/**
 * Classify a `write` tool call for listening practice tracking. Only calls targeting
 * the listening session file with a conforming document classify as tracked writes.
 * @param call - the raw `tool/call` event data: tool name and the arguments JSON string.
 * @returns the parsed listening exercise the call writes, or none for unrelated calls.
 */
export function classifyListeningWrite(call: { name: string; arguments: string }): ListeningWriteIntent {
  return classifyQuizWrite(call, 'listening-session.json', 'listening-exercise')
}
