import { describe, expect, it } from 'vitest'
import { classifyWritingWrite, isWritingSessionFile, parseWritingDocument } from '../src/writing.ts'

describe('parseWritingDocument', () => {
  const task = {
    time: 1788567736316,
    kind: 'writing-exercise',
    material: 'daily-news.md',
    topic: 'social media',
    level: 'B1',
    title: 'Social media and teenagers',
    requirements: ['Use at least 5 words from the vocabulary bank', 'About 120 words'],
    hint: 'Think about benefits, risks, and your own habits.',
    targetWords: 120,
  }
  const result = {
    time: 1788567736999,
    kind: 'writing-result',
    level: 'B1',
    score: 78,
    summary: 'Clear structure with a few tense slips.',
    strengths: ['Good paragraph structure'],
    issues: ['Past tense mixed with present'],
    revised: 'Social media has a complicated effect on teenagers.',
  }

  it('parses a complete assignment and a complete result', () => {
    expect(parseWritingDocument(JSON.stringify(task))).toEqual({ kind: 'task', task })
    expect(parseWritingDocument(JSON.stringify(result))).toEqual({ kind: 'result', result })
  })

  it('parses minimal documents without optional fields', () => {
    expect(parseWritingDocument(JSON.stringify({
      time: 1, kind: 'writing-exercise', title: 'T', requirements: ['R'],
    }))).toEqual({ kind: 'task', task: { time: 1, kind: 'writing-exercise', title: 'T', requirements: ['R'] } })
    expect(parseWritingDocument(JSON.stringify({
      time: 1, kind: 'writing-result', score: 0,
    }))).toEqual({ kind: 'result', result: { time: 1, kind: 'writing-result', score: 0 } })
  })

  it('rejects malformed JSON and non-object content', () => {
    expect(parseWritingDocument('{not json')).toBeUndefined()
    expect(parseWritingDocument('"writing"')).toBeUndefined()
    expect(parseWritingDocument('null')).toBeUndefined()
  })

  it('rejects unknown kinds, bad times, and score values out of range', () => {
    expect(parseWritingDocument(JSON.stringify({ ...task, kind: 'reading-exercise' }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...task, time: 'now' }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...result, score: 101 }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...result, score: -1 }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...result, score: 7.5 }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...result, score: 'high' }))).toBeUndefined()
  })

  it('rejects assignments with an empty title or broken requirements', () => {
    expect(parseWritingDocument(JSON.stringify({ ...task, title: '   ' }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...task, requirements: [] }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...task, requirements: ['ok', ''] }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...task, requirements: 'write something' }))).toBeUndefined()
  })

  it('rejects a target word count that is not a positive integer', () => {
    expect(parseWritingDocument(JSON.stringify({ ...task, targetWords: 0 }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...task, targetWords: 12.5 }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...task, targetWords: 'many' }))).toBeUndefined()
  })

  it('rejects result lists containing non-string items', () => {
    expect(parseWritingDocument(JSON.stringify({ ...result, strengths: ['good', 5] }))).toBeUndefined()
    expect(parseWritingDocument(JSON.stringify({ ...result, issues: [null] }))).toBeUndefined()
  })

  it('drops empty optional strings instead of rejecting', () => {
    const parsed = parseWritingDocument(JSON.stringify({
      ...task, material: '', topic: '', level: '', hint: '  ',
    }))
    expect(parsed).toEqual({
      kind: 'task',
      task: {
        time: task.time, kind: 'writing-exercise', title: task.title, requirements: task.requirements, targetWords: 120,
      },
    })
  })
})

describe('isWritingSessionFile', () => {
  it('matches relative and absolute launch-workspace forms', () => {
    expect(isWritingSessionFile('.lingoladder/writing-session.json')).toBe(true)
    expect(isWritingSessionFile('/home/learner/ws/.lingoladder/writing-session.json')).toBe(true)
    expect(isWritingSessionFile('C:\\ws\\.lingoladder\\writing-session.json')).toBe(true)
  })

  it('rejects other files and look-alike directories', () => {
    expect(isWritingSessionFile('writing-session.json')).toBe(false)
    expect(isWritingSessionFile('.lingoladder/reading-session.json')).toBe(false)
    expect(isWritingSessionFile('.lingoladder/materials/writing-session.json')).toBe(false)
    expect(isWritingSessionFile('my.lingoladder/writing-session.json')).toBe(false)
  })
})

describe('classifyWritingWrite', () => {
  const taskDoc = { time: 1, kind: 'writing-exercise', title: 'T', requirements: ['R'] }
  const resultDoc = { time: 1, kind: 'writing-result', score: 90 }

  it('classifies a task write and a result write to the session file', () => {
    const write = (content: unknown): { name: string; arguments: string } => ({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/writing-session.json', content: JSON.stringify(content) }),
    })
    expect(classifyWritingWrite(write(taskDoc))).toEqual({ kind: 'task', task: taskDoc })
    expect(classifyWritingWrite(write(resultDoc))).toEqual({ kind: 'result', result: resultDoc })
  })

  it('classifies an absolute write target', () => {
    expect(classifyWritingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'C:\\ws\\.lingoladder\\writing-session.json', content: JSON.stringify(taskDoc) }),
    })).toEqual({ kind: 'task', task: taskDoc })
  })

  it('ignores a session-target write whose content does not parse', () => {
    expect(classifyWritingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/writing-session.json', content: '{oops' }),
    })).toEqual({ kind: 'none' })
  })

  it('ignores unrelated tools, paths, and argument shapes', () => {
    expect(classifyWritingWrite({ name: 'read', arguments: '{}' })).toEqual({ kind: 'none' })
    expect(classifyWritingWrite({ name: 'write', arguments: '{nope' })).toEqual({ kind: 'none' })
    expect(classifyWritingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'notes/todo.md', content: 'x' }),
    })).toEqual({ kind: 'none' })
    expect(classifyWritingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/reading-session.json', content: JSON.stringify(taskDoc) }),
    })).toEqual({ kind: 'none' })
    expect(classifyWritingWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/writing-session.json' }),
    })).toEqual({ kind: 'none' })
  })
})
