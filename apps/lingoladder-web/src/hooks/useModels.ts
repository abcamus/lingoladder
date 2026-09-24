import { useCallback, useEffect, useState } from 'react'
import type { AddedModel, ConfigurableProvider, DiscoveredProvider } from '../types'

interface ActiveModel {
  provider: string
  model: string
}

interface UseModelsResult {
  providers: ConfigurableProvider[]
  providersLoading: boolean
  providersError: string | null
  addedModels: AddedModel[]
  addedLoading: boolean
  activeModel: ActiveModel | null
  addModel: (model: AddedModel, apiKey?: string) => Promise<void>
  saveApiKey: (provider: string, apiKey: string) => Promise<void>
  removeModel: (provider: string, model: string) => Promise<void>
  setActiveModel: (provider: string, model: string) => Promise<void>
  refreshAdded: () => void
  discover: () => Promise<DiscoveredProvider[]>
  discovering: boolean
  discoverError: string | null
}

/** Extract the error message a dashboard endpoint responded with. */
function readErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const message = (body as { error?: unknown }).error
    if (typeof message === 'string' && message.length > 0) return message
  }
  return `HTTP ${status}`
}

export function useModels(): UseModelsResult {
  const [providers, setProviders] = useState<ConfigurableProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)
  const [providersError, setProvidersError] = useState<string | null>(null)
  const [addedModels, setAddedModels] = useState<AddedModel[]>([])
  const [addedLoading, setAddedLoading] = useState(true)
  const [activeModel, setActiveModelState] = useState<ActiveModel | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/models/providers')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ providers: ConfigurableProvider[] }>
      })
      .then((data) => {
        if (!cancelled) {
          setProviders(data.providers)
          setProvidersLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProvidersError(err instanceof Error ? err.message : 'Failed to load providers')
          setProvidersLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  const fetchAdded = useCallback(() => {
    setAddedLoading(true)
    fetch('/api/models/added')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ addedModels: AddedModel[]; activeModel?: ActiveModel }>
      })
      .then((data) => {
        setAddedModels(data.addedModels)
        setActiveModelState(data.activeModel ?? null)
        setAddedLoading(false)
      })
      .catch(() => {
        setAddedLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchAdded()
  }, [fetchAdded])

  const addModel = useCallback(async (model: AddedModel, apiKey?: string): Promise<void> => {
    const res = await fetch('/api/models/added', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...model,
        ...(apiKey !== undefined && apiKey.trim().length > 0 ? { apiKey: apiKey.trim() } : {}),
      }),
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => undefined)
      throw new Error(readErrorMessage(body, res.status))
    }
    const data = await res.json() as { addedModels: AddedModel[]; activeModel?: ActiveModel }
    setAddedModels(data.addedModels)
    setActiveModelState(data.activeModel ?? null)
  }, [])

  const saveApiKey = useCallback(async (provider: string, apiKey: string): Promise<void> => {
    const res = await fetch('/api/models/key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, apiKey: apiKey.trim() }),
    })
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => undefined)
      throw new Error(readErrorMessage(body, res.status))
    }
  }, [])

  const removeModel = useCallback(async (provider: string, model: string): Promise<void> => {
    const res = await fetch('/api/models/added', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    })
    if (res.ok) {
      const data = await res.json() as { addedModels: AddedModel[]; activeModel?: ActiveModel }
      setAddedModels(data.addedModels)
      setActiveModelState(data.activeModel ?? null)
    }
  }, [])

  const setActiveModel = useCallback(async (provider: string, model: string): Promise<void> => {
    const res = await fetch('/api/settings/model', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, model }),
    })
    if (res.ok) {
      setActiveModelState({ provider, model })
    }
  }, [])

  const discover = useCallback(async (): Promise<DiscoveredProvider[]> => {
    setDiscovering(true)
    setDiscoverError(null)
    try {
      const res = await fetch('/api/models/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { providers: DiscoveredProvider[] }
      return data.providers
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Model discovery failed'
      setDiscoverError(message)
      return []
    } finally {
      setDiscovering(false)
    }
  }, [])

  return {
    providers, providersLoading, providersError,
    addedModels, addedLoading, activeModel,
    addModel, saveApiKey, removeModel, setActiveModel, refreshAdded: fetchAdded,
    discover, discovering, discoverError,
  }
}
