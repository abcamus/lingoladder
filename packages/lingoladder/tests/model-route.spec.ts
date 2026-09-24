import { describe, expect, it } from 'vitest'
import { deriveKeyRef, piAiRouteOps } from '../src/model-route.ts'

describe('deriveKeyRef', () => {
  it('maps a provider id to its conventional environment reference', () => {
    expect(deriveKeyRef('opencode')).toBe('OPENCODE_API_KEY')
  })

  it('normalizes separators and case into the reference name', () => {
    expect(deriveKeyRef('open-router')).toBe('OPEN_ROUTER_API_KEY')
  })
})

describe('piAiRouteOps', () => {
  it('creates an empty profile for an absent route without a key', () => {
    expect(piAiRouteOps(undefined, 'opencode', 'OPENCODE_API_KEY', false))
      .toEqual([{ op: 'set', path: ['providers', 'opencode'], value: {} }])
  })

  it('names the credential reference when a key accompanies an absent route', () => {
    expect(piAiRouteOps(undefined, 'opencode', 'OPENCODE_API_KEY', true))
      .toEqual([{ op: 'set', path: ['providers', 'opencode'], value: { apiKeyEnv: 'OPENCODE_API_KEY' } }])
  })

  it('creates the profile inside an existing user section', () => {
    const user = { providers: { other: {} } }
    expect(piAiRouteOps(user, 'opencode', 'OPENCODE_API_KEY', false))
      .toEqual([{ op: 'set', path: ['providers', 'opencode'], value: {} }])
  })

  it('adds apiKeyEnv to a present profile only when it names none and a key is stored', () => {
    const user = { providers: { opencode: { customUserAgent: 'opencode/1.18.0' } } }
    expect(piAiRouteOps(user, 'opencode', 'OPENCODE_API_KEY', true))
      .toEqual([{ op: 'set', path: ['providers', 'opencode', 'apiKeyEnv'], value: 'OPENCODE_API_KEY' }])
    expect(piAiRouteOps(user, 'opencode', 'OPENCODE_API_KEY', false)).toEqual([])
  })

  it('leaves a profile that already names its own reference untouched', () => {
    const user = { providers: { opencode: { apiKeyEnv: 'MY_OPENER_KEY' } } }
    expect(piAiRouteOps(user, 'opencode', 'OPENCODE_API_KEY', true)).toEqual([])
    expect(piAiRouteOps(user, 'opencode', 'OPENCODE_API_KEY', false)).toEqual([])
  })
})
