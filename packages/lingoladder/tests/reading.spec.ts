import { describe, expect, it } from 'vitest'
import { classifyReadingWrite, isReadingSessionFile, parseReadingExercise } from '../src/reading.ts'

describe('parseReadingExercise', () => {
  const conforming = {
    time: 1788567736316,
    kind: 'reading-exercise',
    material: 'daily-news.md',
    topic: '城市交通',
    level: 'B1',
    passage: 'City councils across the region are debating new bike lanes.',
    questions: [
      { prompt: 'What are the councils debating?', options: ['Bike lanes', 'Bus fares', 'Parking fees', 'Speed cameras'], answer: 0, explanation: '原文首句直接说明。' },
      { prompt: 'Which detail is stated?', options: ['A report', 'A vote', 'A protest', 'A survey'], answer: 1 },
    ],
  }

  it('parses a complete exercise with optional fields', () => {
    expect(parseReadingExercise(JSON.stringify(conforming))).toEqual(conforming)
  })

  it('parses a minimal exercise without optional fields', () => {
    const minimal = {
      time: 1,
      kind: 'reading-exercise',
      passage: 'Short passage.',
      questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 1 }],
    }
    expect(parseReadingExercise(JSON.stringify(minimal))).toEqual(minimal)
  })

  it('rejects malformed JSON and non-object content', () => {
    expect(parseReadingExercise('{not json')).toBeUndefined()
    expect(parseReadingExercise('"exercise"')).toBeUndefined()
    expect(parseReadingExercise('null')).toBeUndefined()
  })

  it('rejects the listening kind and exercises with an invalid time or passage', () => {
    expect(parseReadingExercise(JSON.stringify({ ...conforming, kind: 'listening-exercise' }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({ ...conforming, time: 'now' }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({ ...conforming, passage: '' }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({ ...conforming, passage: 3 }))).toBeUndefined()
  })

  it('rejects empty or malformed question lists', () => {
    expect(parseReadingExercise(JSON.stringify({ ...conforming, questions: [] }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({
      ...conforming, questions: [{ prompt: 'Q?', options: ['only'], answer: 0 }],
    }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({
      ...conforming, questions: [{ prompt: 'Q?', options: ['A', '', 'C'], answer: 0 }],
    }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({
      ...conforming, questions: [{ options: ['A', 'B'], answer: 0 }],
    }))).toBeUndefined()
  })

  it('rejects an out-of-range or non-integer answer index', () => {
    const question = { prompt: 'Q?', options: ['A', 'B', 'C'], answer: 0 }
    expect(parseReadingExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: 3 }],
    }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: -1 }],
    }))).toBeUndefined()
    expect(parseReadingExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: 1.5 }],
    }))).toBeUndefined()
  })

  it('drops an empty explanation and empty optional fields instead of rejecting', () => {
    const exercise = parseReadingExercise(JSON.stringify({
      ...conforming,
      questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 0, explanation: '   ' }],
      material: '', topic: '', level: '',
    }))
    expect(exercise).toEqual({
      time: conforming.time,
      kind: 'reading-exercise',
      passage: conforming.passage,
      questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 0 }],
    })
  })
})

describe('isReadingSessionFile', () => {
  it('matches relative and absolute launch-workspace forms', () => {
    expect(isReadingSessionFile('.lingoladder/reading-session.json')).toBe(true)
    expect(isReadingSessionFile('/home/learner/ws/.lingoladder/reading-session.json')).toBe(true)
    expect(isReadingSessionFile('C:\\ws\\.lingoladder\\reading-session.json')).toBe(true)
  })

  it('rejects other files and look-alike directories', () => {
    expect(isReadingSessionFile('reading-session.json')).toBe(false)
    expect(isReadingSessionFile('.lingoladder/listening-session.json')).toBe(false)
    expect(isReadingSessionFile('.lingoladder/materials/reading-session.json')).toBe(false)
    expect(isReadingSessionFile('my.lingoladder/reading-session.json')).toBe(false)
  })
})

describe('classifyReadingWrite', () => {
  const exerciseDoc = {
    time: 1,
    kind: 'reading-exercise',
    passage: 'Short passage.',
    questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 1 }],
  }

  it('classifies a write to the reading session file', () => {
    expect(classifyReadingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/reading-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'exercise', exercise: exerciseDoc })
  })

  it('classifies an absolute write target', () => {
    expect(classifyReadingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'C:\\ws\\.lingoladder\\reading-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'exercise', exercise: exerciseDoc })
  })

  it('ignores a session-target write whose content does not parse', () => {
    expect(classifyReadingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/reading-session.json', content: '{oops' }),
    })).toEqual({ kind: 'none' })
  })

  it('ignores unrelated tools, paths, and argument shapes', () => {
    expect(classifyReadingWrite({ name: 'read', arguments: '{}' })).toEqual({ kind: 'none' })
    expect(classifyReadingWrite({ name: 'write', arguments: '{nope' })).toEqual({ kind: 'none' })
    expect(classifyReadingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'notes/todo.md', content: 'x' }),
    })).toEqual({ kind: 'none' })
    expect(classifyReadingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/listening-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'none' })
    expect(classifyReadingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/reading-session.json' }),
    })).toEqual({ kind: 'none' })
  })
})
