import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import type { Settings, CEFRLevel, LearnerProfile } from '../types'
import { saveManualProfile } from '../lib/profile'
import { useModels } from '../hooks/useModels'
import { PlacementResult } from './PlacementResult'
import { ProviderSettings } from './ProviderSettings'
import { SkillsPanel } from './SkillsPanel'
import { TrajectoryPanel } from './TrajectoryPanel'

interface SettingsPageProps {
  settings: Settings
  profile: LearnerProfile | null
  onSave: (s: Settings) => void
  onProfileSaved: (p: LearnerProfile) => void
  onRetakeAssessment: () => void
}

const CEFR_OPTIONS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DAILY_GOALS = [15, 30, 45, 60, 90]

type Tab = 'profile' | 'ai' | 'skills' | 'display' | 'trajectory'

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'profile', icon: '👤', label: '个人资料' },
  { id: 'ai', icon: '🤖', label: '模型设置' },
  { id: 'skills', icon: '🧩', label: '技能配置' },
  { id: 'display', icon: '🎨', label: '显示设置' },
  { id: 'trajectory', icon: '📈', label: '轨迹' },
]

export function SettingsPage({ settings, profile, onSave, onProfileSaved, onRetakeAssessment }: SettingsPageProps) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (searchParams.get('tab') ?? 'profile') as Tab
  const setTab = (t: Tab) => { setSearchParams({ tab: t }) }
  const [draft, setDraft] = useState<Settings>({ ...settings })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { setActiveModel } = useModels()

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    if (draft.provider.length > 0 && draft.model.length > 0) {
      await setActiveModel(draft.provider, draft.model)
    }
    // A changed level pick becomes the learner placement record so the agent sees it too.
    if (draft.currentLevel !== profile?.currentLevel) {
      try {
        onProfileSaved(await saveManualProfile(draft.currentLevel))
      } catch (err) {
        console.error('failed to save profile:', err)
      }
    }
    onSave(draft)
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false) }, 2000)
  }

  const handleSelectModel = async (provider: string, model: string) => {
    console.log('Select model:', model)
    await setActiveModel(provider, model)
    update('provider', provider)
    update('model', model)
  }

  return (
    <div className="settings-page">
      <div className="settings-sidebar">
        <div className="settings-sidebar-header">
          <button className="settings-back" onClick={() => { void navigate('/') }}>
            <span className="settings-back-arrow">←</span>
            <span>返回</span>
          </button>
          <h2 className="settings-sidebar-title">设置</h2>
        </div>
        <nav className="settings-nav">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`settings-nav-item ${tab === t.id ? 'active' : ''}`}
              onClick={() => { setTab(t.id) }}
            >
              <span className="settings-nav-icon">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="settings-content">
        <div className="settings-content-inner">
          {tab === 'profile' && (
            <>
              <h3 className="settings-section-title">个人资料</h3>
              <p className="settings-section-desc">管理你的学习档案和目标</p>

              <div className="settings-group">
                <label className="settings-label" htmlFor="settings-name">昵称</label>
                <input
                  id="settings-name"
                  className="settings-input"
                  type="text"
                  value={draft.name}
                  onChange={(e) => { update('name', e.target.value) }}
                  placeholder="你的名字"
                />
              </div>

              <div className="settings-row">
                <div className="settings-group settings-col">
                  <label className="settings-label" htmlFor="settings-current-level">当前水平</label>
                  <select
                    id="settings-current-level"
                    className="settings-select"
                    value={draft.currentLevel}
                    onChange={(e) => { update('currentLevel', e.target.value as CEFRLevel) }}
                  >
                    {CEFR_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="settings-group settings-col">
                  <label className="settings-label" htmlFor="settings-target-level">目标水平</label>
                  <select
                    id="settings-target-level"
                    className="settings-select"
                    value={draft.targetLevel}
                    onChange={(e) => { update('targetLevel', e.target.value as CEFRLevel) }}
                  >
                    {CEFR_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">每日学习目标</label>
                <div className="settings-chips">
                  {DAILY_GOALS.map(m => (
                    <button
                      key={m}
                      className={`settings-chip ${draft.dailyGoal === m ? 'active' : ''}`}
                      onClick={() => { update('dailyGoal', m) }}
                    >
                      {m} 分钟
                    </button>
                  ))}
                </div>
                <div className="settings-hint">系统会根据你的目标推荐每日学习任务</div>
              </div>

              <div className="settings-group">
                <label className="settings-label">初始定级测评</label>
                {profile !== null && <PlacementResult profile={profile} />}
                <div className="settings-hint">测评通过与 AI 助手对话完成，结果决定资料难度和练习起点</div>
                <button className="settings-btn" onClick={onRetakeAssessment}>
                  {profile === null ? '开始定级测评' : '重新测评'}
                </button>
              </div>
            </>
          )}

          {tab === 'ai' && (
            <ProviderSettings
              currentProvider={draft.provider}
              currentModel={draft.model}
              onSelectModel={(p, m) => { void handleSelectModel(p, m) }}
            />
          )}

          {tab === 'skills' && <SkillsPanel />}

          {tab === 'display' && (
            <>
              <h3 className="settings-section-title">显示设置</h3>
              <p className="settings-section-desc">调整界面语言和主题</p>

              <div className="settings-group">
                <label className="settings-label">界面语言</label>
                <div className="settings-options settings-options-row">
                  {([
                    ['zh', '中文'],
                    ['en', 'English'],
                  ] as const).map(([val, label]) => (
                    <label key={val} className={`settings-option settings-option-inline ${draft.uiLanguage === val ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="uiLanguage"
                        value={val}
                        checked={draft.uiLanguage === val}
                        onChange={() => { update('uiLanguage', val) }}
                      />
                      <span className="settings-option-indicator" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="settings-group">
                <label className="settings-label">主题</label>
                <div className="settings-options settings-options-row">
                  {([
                    ['light', '☀️ 浅色'],
                    ['dark', '🌙 深色'],
                    ['system', '💻 跟随系统'],
                  ] as const).map(([val, label]) => (
                    <label key={val} className={`settings-option settings-option-inline ${draft.theme === val ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="theme"
                        value={val}
                        checked={draft.theme === val}
                        onChange={() => { update('theme', val) }}
                      />
                      <span className="settings-option-indicator" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div className="settings-hint">深色模式和跟随系统将在后续版本支持</div>
              </div>
            </>
          )}

          {tab === 'trajectory' && <TrajectoryPanel />}
        </div>

        <div className="settings-footer">
          <button className="settings-btn" onClick={() => { void navigate('/') }}>取消</button>
          <button className="settings-btn primary" disabled={saving} onClick={() => { void handleSave() }}>
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>

        {saved && <div className="settings-toast">✓ 设置已保存</div>}
      </div>
    </div>
  )
}
