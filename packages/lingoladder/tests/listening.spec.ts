import { describe, expect, it } from 'vitest'
import { classifyListeningWrite, isListeningSessionFile, parseListeningExercise } from '../src/listening.ts'

describe('parseListeningExercise', () => {
  const conforming = {
    time: 1788567736316,
    kind: 'listening-exercise',
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
    expect(parseListeningExercise(JSON.stringify(conforming))).toEqual(conforming)
  })

  it('parses a minimal exercise without optional fields', () => {
    const minimal = {
      time: 1,
      kind: 'listening-exercise',
      passage: 'Short passage.',
      questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 1 }],
    }
    expect(parseListeningExercise(JSON.stringify(minimal))).toEqual(minimal)
  })

  it('rejects malformed JSON and non-object content', () => {
    expect(parseListeningExercise('{not json')).toBeUndefined()
    expect(parseListeningExercise('"exercise"')).toBeUndefined()
    expect(parseListeningExercise('null')).toBeUndefined()
  })

  it('rejects exercises with an invalid time, kind, or passage', () => {
    expect(parseListeningExercise(JSON.stringify({ ...conforming, time: 'now' }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({ ...conforming, kind: 'exercise' }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({ ...conforming, passage: '' }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({ ...conforming, passage: 3 }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({ ...conforming, passage: 'x' }))).toBeUndefined()
  })

  it('rejects empty or malformed question lists', () => {
    expect(parseListeningExercise(JSON.stringify({ ...conforming, questions: [] }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({ ...conforming, questions: 'two' }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ prompt: '', options: ['A', 'B'], answer: 0 }],
    }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ prompt: 'Q?', options: ['only'], answer: 0 }],
    }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ prompt: 'Q?', options: ['A', '', 'C'], answer: 0 }],
    }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ options: ['A', 'B'], answer: 0 }],
    }))).toBeUndefined()
  })

  it('rejects an out-of-range or non-integer answer index', () => {
    const question = { prompt: 'Q?', options: ['A', 'B', 'C'], answer: 0 }
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: 3 }],
    }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: -1 }],
    }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: 1.5 }],
    }))).toBeUndefined()
    expect(parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ ...question, answer: 'A' }],
    }))).toBeUndefined()
  })

  it('drops an empty explanation instead of rejecting the question', () => {
    const exercise = parseListeningExercise(JSON.stringify({
      ...conforming, questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 0, explanation: '   ' }],
    }))
    expect(exercise?.questions[0]).toEqual({ prompt: 'Q?', options: ['A', 'B'], answer: 0 })
  })

  it('drops empty optional string fields instead of rejecting the exercise', () => {
    const exercise = parseListeningExercise(JSON.stringify({
      ...conforming, material: '', topic: '', level: '',
    }))
    expect(exercise).toEqual({
      time: conforming.time,
      kind: 'listening-exercise',
      passage: conforming.passage,
      questions: conforming.questions,
    })
  })
})

describe('isListeningSessionFile', () => {
  it('matches relative and absolute launch-workspace forms', () => {
    expect(isListeningSessionFile('.lingoladder/listening-session.json')).toBe(true)
    expect(isListeningSessionFile('/home/learner/ws/.lingoladder/listening-session.json')).toBe(true)
    expect(isListeningSessionFile('C:\\ws\\.lingoladder\\listening-session.json')).toBe(true)
  })

  it('rejects other files and look-alike directories', () => {
    expect(isListeningSessionFile('listening-session.json')).toBe(false)
    expect(isListeningSessionFile('.lingoladder/profile.json')).toBe(false)
    expect(isListeningSessionFile('.lingoladder/materials/listening-session.json')).toBe(false)
    expect(isListeningSessionFile('my.lingoladder/listening-session.json')).toBe(false)
  })
})

describe('classifyListeningWrite', () => {
  const exerciseDoc = {
    time: 1,
    kind: 'listening-exercise',
    passage: 'Short passage.',
    questions: [{ prompt: 'Q?', options: ['A', 'B'], answer: 1 }],
  }

  it('classifies a write to the listening session file', () => {
    expect(classifyListeningWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/listening-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'exercise', exercise: exerciseDoc })
  })

  it('classifies an absolute write target', () => {
    expect(classifyListeningWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'C:\\ws\\.lingoladder\\listening-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'exercise', exercise: exerciseDoc })
  })

  it('ignores a session-target write whose content does not parse', () => {
    expect(classifyListeningWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/listening-session.json', content: '{oops' }),
    })).toEqual({ kind: 'none' })
  })

  it('ignores unrelated tools, paths, and argument shapes', () => {
    expect(classifyListeningWrite({ name: 'read', arguments: '{}' })).toEqual({ kind: 'none' })
    expect(classifyListeningWrite({ name: 'write', arguments: '{nope' })).toEqual({ kind: 'none' })
    expect(classifyListeningWrite({ name: 'write', arguments: '"path"' })).toEqual({ kind: 'none' })
    expect(classifyListeningWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'notes/todo.md', content: 'x' }),
    })).toEqual({ kind: 'none' })
    expect(classifyListeningWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/listening-session.json' }),
    })).toEqual({ kind: 'none' })
  })
})
