import { useCallback, useEffect, useState } from 'react'
import type { SkillInfo } from '../types'
import { fetchSkills, updateSkillConfig } from '../lib/skills'

/** Warnings for skills whose disablement removes more than the tutor's routing entry. */
const SKILL_IMPACTS: Record<string, string> = {
  'exercise-generator': '停用后，听力/口语/阅读/写作四个练习页面将无法生成新练习。',
  'placement-assessment': '停用后，无法发起或重新进行定级测评。',
}

/** The 技能配置 tab: toggle the preset agent skills the tutor sees; changes apply to the next turn. */
export function SkillsPanel() {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyName, setBusyName] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchSkills().then(
      (list) => { setSkills(list); setLoadError(null) },
      (err: unknown) => {
        console.error('failed to load skills:', err)
        setLoadError(err instanceof Error ? err.message : String(err))
      },
    )
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = useCallback((skill: SkillInfo) => {
    if (busyName !== null) return
    setBusyName(skill.name)
    // Optimistic flip; reload from the server when it settles.
    setSkills(prev => prev?.map(s => s.name === skill.name ? { ...s, enabled: !s.enabled } : s) ?? prev)
    updateSkillConfig(skill.name, !skill.enabled).then(
      () => { load(); setBusyName(null) },
      (err: unknown) => {
        console.error('failed to update skill config:', err)
        load()
        setBusyName(null)
      },
    )
  }, [busyName, load])

  return (
    <>
      <h3 className="settings-section-title">技能配置</h3>
      <p className="settings-section-desc">控制 AI 导师可以使用的技能；停用后在下一轮对话生效。练习页面和定级测评依赖对应技能，请谨慎停用。</p>
      {skills === null && loadError === null && <div className="settings-hint">加载中…</div>}
      {loadError !== null && (
        <div className="settings-hint">
          技能列表加载失败：{loadError} <button className="settings-btn" onClick={load}>重试</button>
        </div>
      )}
      {skills !== null && (
        <div className="settings-skills">
          {skills.map(skill => (
            <div className={`settings-skill ${skill.enabled ? '' : 'disabled'}`} key={skill.name}>
              <div className="settings-skill-info">
                <div className="settings-skill-name">{skill.name}</div>
                <div className="settings-skill-desc">{skill.description}</div>
                {skill.whenToUse !== undefined && <div className="settings-skill-when">触发：{skill.whenToUse}</div>}
                {SKILL_IMPACTS[skill.name] !== undefined && (
                  <div className="settings-skill-impact">{SKILL_IMPACTS[skill.name]}</div>
                )}
              </div>
              <button
                className={`settings-switch ${skill.enabled ? 'on' : ''}`}
                disabled={busyName === skill.name}
                title={skill.enabled ? '停用' : '启用'}
                onClick={() => { toggle(skill) }}
              ><span className="settings-switch-knob" /></button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
