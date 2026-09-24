import { describe, expect, it } from 'vitest'
import { classifyPlacementWrite, isPlacementFile, parseLearnerProfile, parsePlacementProgress } from '../src/placement.ts'

describe('parseLearnerProfile', () => {
  it('parses a complete placement record', () => {
    const profile = parseLearnerProfile(JSON.stringify({
      time: 1788567736316,
      kind: 'placement',
      source: 'placement',
      currentLevel: 'B1',
      skills: { listening: 'A2', speaking: 'A2', reading: 'B1', writing: 'B1' },
      weakSkills: ['listening', 'speaking'],
      summary: '能进行日常交流',
    }))
    expect(profile).toEqual({
      time: 1788567736316,
      kind: 'placement',
      source: 'placement',
      currentLevel: 'B1',
      skills: { listening: 'A2', speaking: 'A2', reading: 'B1', writing: 'B1' },
      weakSkills: ['listening', 'speaking'],
      summary: '能进行日常交流',
    })
  })

  it('parses a minimal manual record without optional fields', () => {
    expect(parseLearnerProfile(JSON.stringify({
      time: 1788567736316, kind: 'placement', source: 'manual', currentLevel: 'A2',
    }))).toEqual({
      time: 1788567736316, kind: 'placement', source: 'manual', currentLevel: 'A2',
    })
  })

  it('rejects malformed JSON and non-object content', () => {
    expect(parseLearnerProfile('{not json')).toBeUndefined()
    expect(parseLearnerProfile('"placement"')).toBeUndefined()
    expect(parseLearnerProfile('null')).toBeUndefined()
  })

  it('rejects records with an invalid time, kind, source, or level', () => {
    const base = { time: 1, kind: 'placement', source: 'placement', currentLevel: 'A1' }
    expect(parseLearnerProfile(JSON.stringify({ ...base, time: 'late' }))).toBeUndefined()
    expect(parseLearnerProfile(JSON.stringify({ ...base, kind: 'progress' }))).toBeUndefined()
    expect(parseLearnerProfile(JSON.stringify({ ...base, source: 'agent' }))).toBeUndefined()
    expect(parseLearnerProfile(JSON.stringify({ ...base, currentLevel: 'Z9' }))).toBeUndefined()
    expect(parseLearnerProfile(JSON.stringify({ kind: 'placement' }))).toBeUndefined()
  })

  it('keeps only valid CEFR entries in skills and weakSkills', () => {
    const profile = parseLearnerProfile(JSON.stringify({
      time: 1,
      kind: 'placement',
      source: 'placement',
      currentLevel: 'B1',
      skills: { listening: 'A2', speaking: 'Z9', reading: 3 },
      weakSkills: ['reading', 'vocab', 42, 'reading'],
    }))
    expect(profile?.skills).toEqual({ listening: 'A2', reading: undefined })
    expect(profile?.skills).toHaveProperty('listening')
    expect(profile?.weakSkills).toEqual(['reading', 'reading'])
  })

  it('omits skills and weakSkills when nothing valid survives', () => {
    const profile = parseLearnerProfile(JSON.stringify({
      time: 1,
      kind: 'placement',
      source: 'placement',
      currentLevel: 'B1',
      skills: { listening: 'Z9' },
      weakSkills: [],
    }))
    expect(profile?.skills).toBeUndefined()
    expect(profile?.weakSkills).toBeUndefined()
  })
})

describe('parsePlacementProgress', () => {
  it('parses a conforming progress document', () => {
    expect(parsePlacementProgress(JSON.stringify({
      time: 1788567736316, kind: 'placement-progress', stage: 'reading', round: 2, totalRounds: 4,
    }))).toEqual({
      time: 1788567736316, kind: 'placement-progress', stage: 'reading', round: 2, totalRounds: 4,
    })
  })

  it('accepts the scoring stage reported before evaluation', () => {
    expect(parsePlacementProgress(JSON.stringify({
      time: 1, kind: 'placement-progress', stage: 'scoring', round: 5, totalRounds: 4,
    }))?.stage).toBe('scoring')
  })

  it('rejects malformed JSON and non-object content', () => {
    expect(parsePlacementProgress('[')).toBeUndefined()
    expect(parsePlacementProgress('42')).toBeUndefined()
  })

  it('rejects documents with an invalid field', () => {
    const base = { time: 1, kind: 'placement-progress', stage: 'reading', round: 2, totalRounds: 4 }
    expect(parsePlacementProgress(JSON.stringify({ ...base, time: 'now' }))).toBeUndefined()
    expect(parsePlacementProgress(JSON.stringify({ ...base, kind: 'placement' }))).toBeUndefined()
    expect(parsePlacementProgress(JSON.stringify({ ...base, stage: 'listening' }))).toBeUndefined()
    expect(parsePlacementProgress(JSON.stringify({ ...base, round: 0 }))).toBeUndefined()
    expect(parsePlacementProgress(JSON.stringify({ ...base, round: 1.5 }))).toBeUndefined()
    expect(parsePlacementProgress(JSON.stringify({ ...base, totalRounds: 0 }))).toBeUndefined()
    expect(parsePlacementProgress(JSON.stringify({ stage: 'reading' }))).toBeUndefined()
  })
})

describe('isPlacementFile', () => {
  it('matches relative and absolute launch-workspace forms of a placement file', () => {
    expect(isPlacementFile('.lingoladder/profile.json', 'profile.json')).toBe(true)
    expect(isPlacementFile('/home/learner/ws/.lingoladder/profile.json', 'profile.json')).toBe(true)
    expect(isPlacementFile('C:\\ws\\.lingoladder\\profile.json', 'profile.json')).toBe(true)
    expect(isPlacementFile('.lingoladder/placement-progress.json', 'placement-progress.json')).toBe(true)
  })

  it('rejects other files and look-alike directories', () => {
    expect(isPlacementFile('profile.json', 'profile.json')).toBe(false)
    expect(isPlacementFile('.lingoladder/materials/doc.md', 'profile.json')).toBe(false)
    expect(isPlacementFile('my.lingoladder/profile.json', 'profile.json')).toBe(false)
    expect(isPlacementFile('.lingoladder/profile.json', 'placement-progress.json')).toBe(false)
  })
})

describe('classifyPlacementWrite', () => {
  const progressDoc = { time: 1, kind: 'placement-progress', stage: 'background', round: 1, totalRounds: 4 }
  const profileDoc = { time: 1, kind: 'placement', source: 'placement', currentLevel: 'B1' }

  it('classifies a write to the placement progress file', () => {
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/placement-progress.json', content: JSON.stringify(progressDoc) }),
    })).toEqual({ kind: 'progress', progress: progressDoc })
  })

  it('classifies a write to the profile file as a completion candidate', () => {
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'C:\\ws\\.lingoladder\\profile.json', content: JSON.stringify(profileDoc) }),
    })).toEqual({ kind: 'profile', profile: profileDoc })
  })

  it('ignores a manual-source or malformed profile write so chat edits cannot fake completion', () => {
    const write = (content: unknown): string => JSON.stringify({ file_path: '.lingoladder/profile.json', content: JSON.stringify(content) })
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: write({ ...profileDoc, source: 'manual' }),
    })).toEqual({ kind: 'none' })
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: write({ kind: 'placement' }),
    })).toEqual({ kind: 'none' })
  })

  it('ignores a progress-target write whose content does not parse', () => {
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/placement-progress.json', content: '{oops' }),
    })).toEqual({ kind: 'none' })
  })

  it('ignores unrelated tools, paths, and argument shapes', () => {
    expect(classifyPlacementWrite({ name: 'read', arguments: '{}' })).toEqual({ kind: 'none' })
    expect(classifyPlacementWrite({ name: 'write', arguments: '{nope' })).toEqual({ kind: 'none' })
    expect(classifyPlacementWrite({ name: 'write', arguments: '"path"' })).toEqual({ kind: 'none' })
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: 'notes/todo.md', content: 'x' }),
    })).toEqual({ kind: 'none' })
    expect(classifyPlacementWrite({
      name: 'write',
      arguments: JSON.stringify({ file_path: '.lingoladder/profile.json' }),
    })).toEqual({ kind: 'none' })
  })
})
