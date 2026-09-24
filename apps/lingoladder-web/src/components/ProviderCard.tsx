import { useState } from 'react'
import type { DiscoveredModel, AddedModel } from '../types'

interface ProviderCardProps {
  provider: string
  displayName: string
  models: DiscoveredModel[]
  addedModels: AddedModel[]
  activeModel: { provider: string; model: string } | null
  onAddModel: (provider: string, model: DiscoveredModel, apiKey?: string) => Promise<void>
  onSaveKey: (provider: string, apiKey: string) => Promise<void>
  onRemoveModel: (provider: string, model: string) => void
  onSelectModel: (provider: string, model: string) => void
}

export function ProviderCard({
  provider,
  displayName,
  models,
  addedModels,
  activeModel,
  onAddModel,
  onSaveKey,
  onRemoveModel,
  onSelectModel,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)

  const addedIds = new Set(addedModels.filter(m => m.provider === provider).map(m => m.model))
  const isCurrentProvider = activeModel?.provider === provider

  /** Run one action that may carry the typed key; a success clears the draft. */
  const runWithKey = async (run: (apiKey?: string) => Promise<void>): Promise<void> => {
    const apiKey = keyDraft.trim().length > 0 ? keyDraft.trim() : undefined
    setKeyBusy(true)
    setCardError(null)
    try {
      await run(apiKey)
      setKeyDraft('')
    } catch (error) {
      setCardError(error instanceof Error ? error.message : String(error))
    } finally {
      setKeyBusy(false)
    }
  }

  return (
    <div className={`provider-card-outer ${isCurrentProvider ? 'active' : ''}`}>
      <button className="provider-card-header" onClick={() => { setExpanded(!expanded) }}>
        <div className="provider-card-left">
          <span className={`provider-status-dot ${isCurrentProvider ? 'active' : ''}`} />
          <span className="provider-card-name">{displayName}</span>
          <span className="provider-card-model-count">{models.length} 个模型</span>
        </div>
        <span className={`provider-card-chevron ${expanded ? 'open' : ''}`}>▾</span>
      </button>

      {expanded && (
        <div className="provider-card-body">
          <div className="provider-key-row">
            <input
              type="password"
              className="provider-key-input"
              placeholder="API Key（未配置时填写，保存后自动关联到该提供方）"
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setCardError(null) }}
            />
            <button
              className="settings-btn-sm"
              disabled={keyBusy || keyDraft.trim().length === 0}
              onClick={() => { void runWithKey(apiKey => onSaveKey(provider, apiKey ?? '')) }}
            >
              {keyBusy ? '保存中…' : '保存密钥'}
            </button>
          </div>
          {cardError !== null && <div className="provider-key-error">{cardError}</div>}
          {models.map((m) => {
            const isAdded = addedIds.has(m.id)
            const isActive = isCurrentProvider && activeModel.model === m.id

            return (
              <div key={m.id} className={`provider-model-row ${isActive ? 'active' : ''}`}>
                <div className="provider-model-info">
                  <span className="provider-model-name">{m.name ?? m.id}</span>
                  <span className="provider-model-meta">
                    {m.id}
                    {m.contextWindow !== undefined && <span> · 上下文 {Math.round(m.contextWindow / 1000)}K</span>}
                    {m.maxTokens !== undefined && <span> · 输出 {Math.round(m.maxTokens / 1000)}K</span>}
                  </span>
                  {m.description !== undefined && (
                    <span className="provider-model-desc">{m.description}</span>
                  )}
                </div>
                <div className="provider-model-actions">
                  {isActive && <span className="provider-model-active-badge">使用中</span>}
                  {isAdded && !isActive && (
                    <button
                      className="settings-btn-sm"
                      onClick={() => { onSelectModel(provider, m.id) }}
                    >
                      选为当前
                    </button>
                  )}
                  {isAdded ? (
                    <button
                      className="settings-btn-sm danger"
                      onClick={() => { onRemoveModel(provider, m.id) }}
                    >
                      移除
                    </button>
                  ) : (
                    <button
                      className="settings-btn-sm primary"
                      disabled={keyBusy}
                      onClick={() => { void runWithKey(apiKey => onAddModel(provider, m, apiKey)) }}
                    >
                      添加
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {models.length === 0 && (
            <div className="provider-card-empty">暂无可用模型</div>
          )}
        </div>
      )}
    </div>
  )
}
