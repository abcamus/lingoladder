import { useState } from 'react'
import type { DiscoveredProvider } from '../types'

interface ModelPickerModalProps {
  providers: DiscoveredProvider[]
  currentProvider: string
  currentModel: string
  onConfirm: (provider: string, model: string, name: string, description?: string) => void
  onClose: () => void
}

export function ModelPickerModal({ providers, currentProvider, currentModel, onConfirm, onClose }: ModelPickerModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(
    () => providers.find(p => p.provider === currentProvider)?.provider ?? null,
  )
  const [selectedModel, setSelectedModel] = useState<string>(currentModel)

  const activeProvider = providers.find(p => p.provider === selectedProvider)

  const confirm = () => {
    if (selectedProvider === null || selectedModel.length === 0 || activeProvider === undefined) return
    const model = activeProvider.models.find(m => m.id === selectedModel)
    if (model === undefined) return
    onConfirm(selectedProvider, model.id, model.name ?? model.id, model.description)
  }

  // Step 1: provider selection
  if (selectedProvider === null || activeProvider === undefined) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal--compact" onClick={(e) => { e.stopPropagation() }}>
          <div className="modal-header">
            <h3 className="modal-title">选择提供方</h3>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
          <div className="modal-body">
            <div className="provider-list">
              {providers.map(p => (
                <button
                  key={p.provider}
                  className="provider-card"
                  onClick={() => { setSelectedProvider(p.provider) }}
                >
                  <div className="provider-card-name">{p.displayName}</div>
                  <div className="provider-card-count">{p.models.length} 个模型</div>
                  <div className="provider-card-arrow">→</div>
                </button>
              ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="settings-btn" onClick={onClose}>取消</button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: model selection within provider
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-header-left">
            <button className="modal-back" onClick={() => { setSelectedProvider(null) }}>←</button>
            <h3 className="modal-title">{activeProvider.displayName}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="model-picker-list">
            {activeProvider.models.map(m => (
              <label
                key={`${activeProvider.provider}/${m.id}`}
                className={`model-picker-item ${selectedModel === m.id ? 'checked' : ''}`}
              >
                <input
                  type="radio"
                  name="model"
                  checked={selectedModel === m.id}
                  onChange={() => { setSelectedModel(m.id) }}
                />
                <div className="model-picker-info">
                  <div className="model-picker-name">{m.name ?? m.id}</div>
                  <div className="model-picker-meta">
                    {m.id}
                    {m.description !== undefined && <span> — {m.description}</span>}
                    {m.contextWindow !== undefined && <span> · 上下文 {Math.round(m.contextWindow / 1000)}K</span>}
                    {m.maxTokens !== undefined && <span> · 输出 {Math.round(m.maxTokens / 1000)}K</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="settings-btn" onClick={onClose}>取消</button>
          <button className="settings-btn primary" disabled={selectedModel.length === 0} onClick={confirm}>
            添加
          </button>
        </div>
      </div>
    </div>
  )
}
