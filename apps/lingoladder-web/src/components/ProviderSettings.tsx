import { useState } from 'react'
import type { AddedModel, DiscoveredProvider, DiscoveredModel } from '../types'
import { useModels } from '../hooks/useModels'
import { ProviderCard } from './ProviderCard'

interface ProviderSettingsProps {
  currentProvider: string
  currentModel: string
  onSelectModel: (provider: string, model: string) => void
}

/** Merge added models into discovered providers, creating stub entries for orphan added models. */
function mergeProviders(
  discovered: DiscoveredProvider[],
  added: AddedModel[],
): Array<{ provider: string; displayName: string; models: Array<DiscoveredModel & { added?: boolean }> }> {
  const byProvider = new Map<string, { displayName: string; models: Map<string, DiscoveredModel & { added?: boolean }> }>()

  for (const d of discovered) {
    const models = new Map<string, DiscoveredModel & { added?: boolean }>()
    for (const m of d.models) models.set(m.id, { ...m })
    byProvider.set(d.provider, { displayName: d.displayName, models })
  }

  // Ensure every added model has a provider entry and mark it as added
  for (const a of added) {
    let entry = byProvider.get(a.provider)
    if (entry === undefined) {
      entry = { displayName: a.provider, models: new Map() }
      byProvider.set(a.provider, entry)
    }
    if (!entry.models.has(a.model)) {
      entry.models.set(a.model, { id: a.model, name: a.name, description: a.description })
    }
    const m = entry.models.get(a.model)
    if (m !== undefined) m.added = true
  }

  return Array.from(byProvider.entries()).map(([provider, { displayName, models }]) => ({
    provider,
    displayName,
    models: Array.from(models.values()),
  }))
}

export function ProviderSettings({ onSelectModel }: ProviderSettingsProps) {
  const { addedModels, activeModel, addModel, saveApiKey, removeModel, setActiveModel, discover, discovering, discoverError } = useModels()
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProvider[]>([])
  const [fetched, setFetched] = useState(false)

  const merged = mergeProviders(discoveredProviders, addedModels)

  const activeAddedModel = activeModel !== null
    ? addedModels.find(m => m.provider === activeModel.provider && m.model === activeModel.model)
    : undefined

  const handleFetch = async () => {
    const result = await discover()
    if (result.length > 0) {
      setDiscoveredProviders(result)
    }
    setFetched(true)
  }

  const handleAddModel = async (
    provider: string,
    model: DiscoveredModel,
    apiKey?: string,
  ) => {
    await addModel({
      provider,
      model: model.id,
      name: model.name ?? model.id,
      description: model.description,
    }, apiKey)
  }

  const handleSaveKey = async (provider: string, apiKey: string) => {
    await saveApiKey(provider, apiKey)
  }

  const handleRemoveModel = async (provider: string, model: string) => {
    await removeModel(provider, model)
  }

  const handleSelectModel = async (provider: string, model: string) => {
    await setActiveModel(provider, model)
    onSelectModel(provider, model)
  }

  return (
    <div className="provider-settings">
      <div className="provider-settings-header">
        <div>
          <h3 className="settings-section-title">模型配置</h3>
          <p className="settings-section-desc">管理 AI 模型提供方和选择当前使用的模型</p>
        </div>
        <button
          className="settings-btn primary"
          disabled={discovering}
          onClick={() => { void handleFetch() }}
        >
          {discovering ? '发现中…' : fetched ? '刷新模型列表' : '发现可用模型'}
        </button>
      </div>

      <div className="current-model-card">
        <div className="current-model-label">当前模型</div>
        {activeModel !== null ? (
          <div className="current-model-detail">
            <span className="current-model-name">{activeAddedModel?.name ?? activeModel.model}</span>
            <span className="current-model-meta">{activeModel.provider} / {activeModel.model}</span>
          </div>
        ) : (
          <div className="current-model-detail current-model-empty">
            尚未选择模型，请在下方添加并选择
          </div>
        )}
      </div>

      {discoverError !== null && (
        <div className="settings-error">模型发现失败：{discoverError}</div>
      )}

      {merged.length > 0 && (
        <div className="provider-list">
          {merged.map(p => (
            <ProviderCard
              key={p.provider}
              provider={p.provider}
              displayName={p.displayName}
              models={p.models}
              addedModels={addedModels}
              activeModel={activeModel}
              onAddModel={(prov, model, apiKey) => handleAddModel(prov, model, apiKey)}
              onSaveKey={(prov, key) => handleSaveKey(prov, key)}
              onRemoveModel={(prov, model) => { void handleRemoveModel(prov, model) }}
              onSelectModel={(prov, model) => { void handleSelectModel(prov, model) }}
            />
          ))}
        </div>
      )}

      {merged.length === 0 && (
        <div className="provider-settings-empty">
          <p>暂无已添加的模型</p>
          <p className="settings-hint">点击「发现可用模型」扫描所有已配置的 Provider</p>
        </div>
      )}
    </div>
  )
}
