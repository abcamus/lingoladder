import { describe, expect, it } from 'vitest'
import { isSkillName, mergeSkillInfos, parseSkillFrontmatter, toggleDisabledSkills } from '../src/skill-catalog.ts'

describe('parseSkillFrontmatter', () => {
  it('parses the routing fields from a SKILL.md frontmatter block', () => {
    const content = '---\nname: exercise-generator\ndescription: 基于学习资料生成练习\nwhenToUse: 用户请求生成练习时\n---\n\n# 正文\n'
    expect(parseSkillFrontmatter(content)).toEqual({
      name: 'exercise-generator',
      description: '基于学习资料生成练习',
      whenToUse: '用户请求生成练习时',
    })
  })

  it('strips wrapping quotes and surrounding whitespace', () => {
    const content = "---\nname: 'material-digest'\ndescription:  \"Digests uploaded materials\"  \n---\n"
    expect(parseSkillFrontmatter(content)).toEqual({ name: 'material-digest', description: 'Digests uploaded materials' })
  })

  it('yields empty fields without frontmatter or without the routing keys', () => {
    expect(parseSkillFrontmatter('no frontmatter')).toEqual({})
    expect(parseSkillFrontmatter('---\nother: value\n---\n')).toEqual({})
    expect(parseSkillFrontmatter('---\nname:\ndescription:   \n---\n')).toEqual({})
  })
})

describe('isSkillName', () => {
  it('accepts kebab-case skill names and rejects everything else', () => {
    expect(isSkillName('exercise-generator')).toBe(true)
    expect(isSkillName('material-digest')).toBe(true)
    expect(isSkillName('Exercise-Generator')).toBe(false)
    expect(isSkillName('-leading')).toBe(false)
    expect(isSkillName('has space')).toBe(false)
    expect(isSkillName(42)).toBe(false)
    expect(isSkillName(undefined)).toBe(false)
  })
})

describe('mergeSkillInfos', () => {
  const candidates = [
    { name: 'exercise-generator', description: '生成练习' },
    { name: 'material-digest', description: '分析资料', whenToUse: '上传资料后' },
    { name: 'material-search', description: '搜索资料' },
  ]

  it('flags the disabled skills and keeps discovery order', () => {
    expect(mergeSkillInfos(candidates, ['material-search', 'exercise-generator'])).toEqual([
      { name: 'exercise-generator', description: '生成练习', enabled: false },
      { name: 'material-digest', description: '分析资料', whenToUse: '上传资料后', enabled: true },
      { name: 'material-search', description: '搜索资料', enabled: false },
    ])
  })

  it('skips incomplete candidates', () => {
    expect(mergeSkillInfos([{ name: 'no-description' }, { description: 'no name' }, ...candidates], [])).toHaveLength(3)
  })
})

describe('toggleDisabledSkills', () => {
  it('enabling removes the name; disabling adds it once', () => {
    expect(toggleDisabledSkills(['a', 'b'], 'a', true)).toEqual(['b'])
    expect(toggleDisabledSkills([], 'a', false)).toEqual(['a'])
    expect(toggleDisabledSkills(['a'], 'a', false)).toEqual(['a'])
  })
})
