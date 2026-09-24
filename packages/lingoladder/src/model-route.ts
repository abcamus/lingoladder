/**
 * Settings-route materialization for dashboard-added model providers.
 *
 * The dashboard's model settings page adds models for a provider; the pi-ai
 * adapter only registers routes a stored `llm-pi-ai.providers.*` profile
 * names, so adding a model must also materialize its route and connect it to
 * the credential reference the dashboard-stored key resolves through.
 *
 * @module @deepseek-ai/dsh-lingoladder/model-route
 */

import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'

/** One settings path op that materializes or extends a provider route. */
export type RouteOp = Extract<SettingsPathOp, { op: 'set' }>

/** The credential reference name a provider's dashboard-stored key resolves through. */
export function deriveKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`
}

/**
 * Compute the settings ops that materialize a pi-ai route for one provider,
 * from the namespace's stored user section. An absent profile is created
 * (naming the credential reference only when a key accompanies it); a present
 * profile that names no reference gains `apiKeyEnv` only when a key is being
 * stored, so user-customized profiles (models, user agent) are never clobbered.
 * @param user - the llm-pi-ai raw user section, when one is stored.
 * @param provider - the provider route key to materialize.
 * @param ref - the credential reference the route resolves keys through.
 * @param hasKey - whether a key accompanies this call and must be stored.
 * @returns the path ops, empty when the stored section already serves the call.
 */
export function piAiRouteOps(user: unknown, provider: string, ref: string, hasKey: boolean): RouteOp[] {
  const providers = (user as { providers?: Record<string, unknown> } | undefined)?.providers
  const existing = providers?.[provider]
  if (existing === undefined) {
    return [{ op: 'set', path: ['providers', provider], value: hasKey ? { apiKeyEnv: ref } : {} }]
  }
  const namedRef = (existing as { apiKeyEnv?: unknown }).apiKeyEnv
  if (hasKey && !(typeof namedRef === 'string' && namedRef.length > 0)) {
    return [{ op: 'set', path: ['providers', provider, 'apiKeyEnv'], value: ref }]
  }
  return []
}
