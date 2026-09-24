/**
 * Preset skill catalog for the dashboard's skill configuration.
 *
 * Zero-dependency module: parses the routing frontmatter from SKILL.md files and
 * merges it with the disabled-skills setting into the view the settings page shows.
 * Keeping this logic here lets the parse and merge behavior be unit-tested without
 * loading the plugin composition.
 *
 * @module
 */

/** One preset skill as the dashboard's skill configuration shows it. */
export interface SkillInfo {
  name: string
  description: string
  whenToUse?: string
  enabled: boolean
}

/** Routing fields parsed from a SKILL.md frontmatter block. */
export interface SkillFrontmatter {
  name?: string
  description?: string
  whenToUse?: string
}

/** Parse the routing fields from a SKILL.md frontmatter block; content without frontmatter yields empty fields. */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (block === null) return {}
  const fields: SkillFrontmatter = {}
  for (const line of (block[1] ?? '').split(/\r?\n/)) {
    const match = /^(name|description|whenToUse):\s*(.*)\s*$/.exec(line)
    if (match === null) continue
    const key = match[1]
    const raw = match[2]
    if (key === undefined || raw === undefined) continue
    const value = raw.trim().replace(/^['"]/, '').replace(/['"]$/, '').trim()
    if (value !== '') fields[key as keyof SkillFrontmatter] = value
  }
  return fields
}

/** Whether the value is a well-formed skill name usable as a settings key. */
export function isSkillName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value)
}

/** Compute the dashboard view of the catalog: discovery order plus enabled flags from the setting. Incomplete candidates are skipped. */
export function mergeSkillInfos(candidates: SkillFrontmatter[], disabled: string[]): SkillInfo[] {
  const disabledSet = new Set(disabled)
  const infos: SkillInfo[] = []
  for (const candidate of candidates) {
    if (candidate.name === undefined || candidate.description === undefined) continue
    infos.push({
      name: candidate.name,
      description: candidate.description,
      ...(candidate.whenToUse !== undefined ? { whenToUse: candidate.whenToUse } : {}),
      enabled: !disabledSet.has(candidate.name),
    })
  }
  return infos
}

/** Apply one toggle to the disabled list: enabling removes, disabling adds once. */
export function toggleDisabledSkills(disabled: string[], name: string, enabled: boolean): string[] {
  if (enabled) return disabled.filter(entry => entry !== name)
  return disabled.includes(name) ? disabled : [...disabled, name]
}
