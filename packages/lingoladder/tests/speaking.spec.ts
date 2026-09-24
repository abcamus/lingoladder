import { describe, expect, it } from 'vitest'
import { classifySpeakingWrite, isSpeakingSessionFile, parseSpeakingExercise } from '../src/speaking.ts'

describe('parseSpeakingExercise', () => {
  const conforming = {
    time: 1788567736316,
    kind: 'speaking-exercise',
    material: 'daily-news.md',
    topic: '问路',
    level: 'A2',
    sentences: [
      { text: 'Could you tell me where the nearest station is?', note: '问路常用句' },
      { text: 'Sure, it is just around the corner.', role: 'A' },
      { text: 'Thank you so much!', role: 'B' },
    ],
  }

  it('parses a complete exercise with optional fields', () => {
    expect(parseSpeakingExercise(JSON.stringify(conforming))).toEqual(conforming)
  })

  it('parses a minimal exercise without optional fields', () => {
    const minimal = {
      time: 1,
      kind: 'speaking-exercise',
      sentences: [{ text: 'Nice to meet you.' }],
    }
    expect(parseSpeakingExercise(JSON.stringify(minimal))).toEqual(minimal)
  })

  it('rejects malformed JSON and non-object content', () => {
    expect(parseSpeakingExercise('{not json')).toBeUndefined()
    expect(parseSpeakingExercise('"speaking"')).toBeUndefined()
    expect(parseSpeakingExercise('null')).toBeUndefined()
  })

  it('rejects exercises with an invalid time, kind, or sentence list', () => {
    expect(parseSpeakingExercise(JSON.stringify({ ...conforming, time: 'now' }))).toBeUndefined()
    expect(parseSpeakingExercise(JSON.stringify({ ...conforming, kind: 'listening-exercise' }))).toBeUndefined()
    expect(parseSpeakingExercise(JSON.stringify({ ...conforming, sentences: [] }))).toBeUndefined()
    expect(parseSpeakingExercise(JSON.stringify({ ...conforming, sentences: 'three' }))).toBeUndefined()
    expect(parseSpeakingExercise(JSON.stringify({
      ...conforming, sentences: [{ text: '' }],
    }))).toBeUndefined()
    expect(parseSpeakingExercise(JSON.stringify({
      ...conforming, sentences: [{ note: 'no text' }],
    }))).toBeUndefined()
    expect(parseSpeakingExercise(JSON.stringify({
      ...conforming, sentences: ['a plain string'],
    }))).toBeUndefined()
  })

  it('rejects an unknown role but keeps A and B', () => {
    expect(parseSpeakingExercise(JSON.stringify({
      ...conforming, sentences: [{ text: 'Hi.', role: 'C' }],
    }))).toBeUndefined()
    const parsed = parseSpeakingExercise(JSON.stringify({
      ...conforming, sentences: [{ text: 'Hi.', role: 'B' }],
    }))
    expect(parsed?.sentences[0]).toEqual({ text: 'Hi.', role: 'B' })
  })

  it('drops empty notes and empty optional string fields instead of rejecting', () => {
    const exercise = parseSpeakingExercise(JSON.stringify({
      ...conforming,
      sentences: [{ text: 'Hi.', note: '   ' }],
      material: '', topic: '', level: '',
    }))
    expect(exercise).toEqual({
      time: conforming.time,
      kind: 'speaking-exercise',
      sentences: [{ text: 'Hi.' }],
    })
  })
})

describe('isSpeakingSessionFile', () => {
  it('matches relative and absolute launch-workspace forms', () => {
    expect(isSpeakingSessionFile('.lingoladder/speaking-session.json')).toBe(true)
    expect(isSpeakingSessionFile('/home/learner/ws/.lingoladder/speaking-session.json')).toBe(true)
    expect(isSpeakingSessionFile('C:\\ws\\.lingoladder\\speaking-session.json')).toBe(true)
  })

  it('rejects other files and look-alike directories', () => {
    expect(isSpeakingSessionFile('speaking-session.json')).toBe(false)
    expect(isSpeakingSessionFile('.lingoladder/listening-session.json')).toBe(false)
    expect(isSpeakingSessionFile('.lingoladder/materials/speaking-session.json')).toBe(false)
    expect(isSpeakingSessionFile('my.lingoladder/speaking-session.json')).toBe(false)
  })
})

describe('classifySpeakingWrite', () => {
  const exerciseDoc = {
    time: 1,
    kind: 'speaking-exercise',
    sentences: [{ text: 'Nice to meet you.' }],
  }

  it('classifies a write to the speaking session file', () => {
    expect(classifySpeakingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/speaking-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'exercise', exercise: exerciseDoc })
  })

  it('classifies an absolute write target', () => {
    expect(classifySpeakingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'C:\\ws\\.lingoladder\\speaking-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'exercise', exercise: exerciseDoc })
  })

  it('ignores a session-target write whose content does not parse', () => {
    expect(classifySpeakingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/speaking-session.json', content: '{oops' }),
    })).toEqual({ kind: 'none' })
  })

  it('ignores unrelated tools, paths, and argument shapes', () => {
    expect(classifySpeakingWrite({ name: 'read', arguments: '{}' })).toEqual({ kind: 'none' })
    expect(classifySpeakingWrite({ name: 'write', arguments: '{nope' })).toEqual({ kind: 'none' })
    expect(classifySpeakingWrite({ name: 'write', arguments: '"path"' })).toEqual({ kind: 'none' })
    expect(classifySpeakingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'notes/todo.md', content: 'x' }),
    })).toEqual({ kind: 'none' })
    expect(classifySpeakingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/listening-session.json', content: JSON.stringify(exerciseDoc) }),
    })).toEqual({ kind: 'none' })
    expect(classifySpeakingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/speaking-session.json' }),
    })).toEqual({ kind: 'none' })
  })
})
