/**
 * @deepseek-ai/dsh-lingoladder — LingoLadder agent bundle
 *
 * Provides a complete agent composition for English learning:
 * - Core agent loop, session, LLM (DeepSeek)
 * - Web search (DeepSeek) and fetch for finding learning materials
 * - Skill system with filesystem discovery (loads preset skills)
 * - Filesystem tools for reading/writing materials
 * - Compaction for long sessions
 * - Web dashboard with LLM chat interface
 *
 * English learning skills (material-digest, knowledge-extractor, exercise-generator, material-search,
 * placement-assessment) are loaded from the preset's skills/ directory via skill-filesystem.
 *
 * @module @deepseek-ai/dsh-lingoladder
 */

import { exec } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-credentials'
import { deriveKeyRef, piAiRouteOps } from './model-route.ts'
import { FileSystemSkillProvider, type Config as FileSystemSkillConfig } from '@deepseek-ai/dsh-skill-filesystem'
import type { SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent'
import { ABILITY_IDS, CEFR_LEVELS, classifyPlacementWrite, parseLearnerProfile, parsePlacementProgress,
  type LearnerProfile,
  type PlacementWriteIntent } from './placement.ts'
import { classifyListeningWrite, parseListeningExercise,
  type ListeningWriteIntent } from './listening.ts'
import { classifyReadingWrite, parseReadingExercise,
  type ReadingWriteIntent } from './reading.ts'
import { classifySpeakingWrite, parseSpeakingExercise,
  type SpeakingWriteIntent } from './speaking.ts'
import { classifyWritingWrite, parseWritingDocument,
  type WritingWriteIntent } from './writing.ts'
import { isSkillName, mergeSkillInfos, parseSkillFrontmatter, toggleDisabledSkills,
  type SkillFrontmatter } from './skill-catalog.ts'
import { isTtsVoice, synthesizeSpeech, TTS_MAX_TEXT_LENGTH } from './tts.ts'
import { decodePdfBase64, extractPdfText, isPdfFileName, PdfExtractError } from './pdf-text.ts'

/** Stable Cordis plugin name. */
export const name = 'lingoladder'

/** Core services required by this bundle's plugin. */
export const inject = ['tools', 'skills', 'web', 'webServer', 'agents', 'llm', 'settings', 'agentDefaultModel'] as const

/** Settings namespace for the lingoladder model list and skill configuration. */
const NS = 'lingoladder'

/** Schema for the dashboard settings stored in settings.yaml: the added-models list and the disabled preset skills. */
const ADDED_MODELS_SCHEMA = z.object({
  addedModels: z.array(z.object({
    provider: z.string().required(),
    model: z.string().required(),
    name: z.string().required(),
    description: z.string(),
  })),
  disabledSkills: z.array(z.string()),
})

/** Shape of the lingoladder settings section. */
interface AddedModelsSettings {
  addedModels: Array<{ provider: string; model: string; name: string; description?: string }>
  disabledSkills: string[]
}

/** Settings namespace owned by the llm-pi-ai adapter plugin; routes live here. */
const PI_AI_NS = 'llm-pi-ai'

/**
 * Ensure the dashboard-added provider has a pi-ai route and store a supplied
 * key under the route's reference. A route another adapter family already owns
 * fails the settings write and surfaces to the caller; a write with a key but
 * no credentials seam fails loud for the same reason.
 * @param ctx - the plugin context (settings and credentials services).
 * @param provider - the provider route key (a pi-ai catalog id or declared route).
 * @param apiKey - the key to store, when the caller supplied one.
 */
async function ensurePiAiRoute(ctx: Context, provider: string, apiKey?: string): Promise<void> {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(provider)) {
    throw new Error(`invalid provider name ${JSON.stringify(provider)}`)
  }
  const ref = deriveKeyRef(provider)
  const descriptor = ctx.settings.describe().find(d => d.ns === PI_AI_NS)
  const ops = piAiRouteOps(descriptor?.user, provider, ref, apiKey !== undefined)
  if (ops.length > 0) await ctx.settings.mutate(PI_AI_NS, ops)
  if (apiKey !== undefined) {
    const credentials = ctx.get('credentials')
    if (credentials === undefined) {
      throw new Error('the composition provides no credentials seam; the API key cannot be stored')
    }
    await credentials.set(credentialRef(ref), apiKey)
  }
}

/** Persistent agent handle for the chat session. */
interface ChatAgent {
  readonly sessionId: string
  readonly agentId: string
  readonly followup: (message: ReturnType<typeof createUserMessage>) => void
  readonly dispose: () => Promise<void>
}

/** Resolve the absolute path to the built web frontend dist/index.html. */
function resolveDistIndex(): string {
  const require = createRequire(import.meta.url)
  return join(
    dirname(require.resolve('@deepseek-ai/dsh-lingoladder-web/package.json')),
    'dist', 'index.html',
  )
}

/** Resolve the absolute path to this bundle's own shipped skills directory. */
function resolvePresetSkillsDir(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve('@deepseek-ai/dsh-lingoladder/package.json')), 'skills')
}

/** Directory under the launch workspace where learning materials are stored as Markdown files. */
const MATERIALS_DIR = join(process.cwd(), '.lingoladder', 'materials')

/** Directory under the launch workspace where the agent writes one learning record per JSON file. */
const PROGRESS_DIR = join(process.cwd(), '.lingoladder', 'progress')

/** Directory under the launch workspace where digested vocabulary is banked, one file per material. */
const VOCABULARY_DIR = join(process.cwd(), '.lingoladder', 'vocabulary')

/** Learner placement record under the launch workspace: agent-written during an assessment, dashboard-written for a manual level pick. */
const PROFILE_PATH = join(process.cwd(), '.lingoladder', 'profile.json')

/** In-flight assessment stage document the placement skill rewrites at every stage transition. */
const PLACEMENT_PROGRESS_PATH = join(process.cwd(), '.lingoladder', 'placement-progress.json')

/** In-flight listening exercise document the exercise-generator skill writes for the listening page. */
const LISTENING_SESSION_PATH = join(process.cwd(), '.lingoladder', 'listening-session.json')

/** In-flight reading exercise document the exercise-generator skill writes for the reading page. */
const READING_SESSION_PATH = join(process.cwd(), '.lingoladder', 'reading-session.json')

/** In-flight writing session document the exercise-generator skill writes and rewrites (task, then graded result). */
const WRITING_SESSION_PATH = join(process.cwd(), '.lingoladder', 'writing-session.json')

/** In-flight speaking exercise document the exercise-generator skill writes for the speaking page. */
const SPEAKING_SESSION_PATH = join(process.cwd(), '.lingoladder', 'speaking-session.json')

/** Disk cache for synthesized listening-passage audio, keyed by text+voice. */
const TTS_CACHE_DIR = join(process.cwd(), '.lingoladder', 'tts-cache')

/** One learning material registered by the dashboard. */
interface MaterialEntry {
  id: string
  name: string
  path: string
  bytes: number
  updatedAt: number
}

/** One learning activity record written by the agent's skills. */
interface ProgressRecord {
  time: number
  kind: 'digest' | 'exercise'
  skill: 'listening' | 'speaking' | 'reading' | 'writing'
  material?: string
  level?: string
  vocabulary?: number
  count?: number
  correct?: number
}

/** One vocabulary bank entry: the words extracted from one material. */
interface VocabularyEntry {
  time: number
  material?: string
  level?: string
  words: Array<{ word: string; definition: string; example?: string }>
}

/** XP awarded per learning record kind. */
const XP_PER_DIGEST = 40
const XP_PER_EXERCISE = 20
const XP_PER_VOCABULARY_WORD = 5

/** Parse one progress file; returns undefined for malformed or non-conforming content. */
function parseProgressRecord(content: string): ProgressRecord | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  if (typeof record.time !== 'number' || !Number.isFinite(record.time)) return undefined
  if (record.kind !== 'digest' && record.kind !== 'exercise') return undefined
  if (typeof record.skill !== 'string' || !(ABILITY_IDS as readonly string[]).includes(record.skill)) return undefined
  const entry: Record<string, unknown> = { time: record.time, kind: record.kind, skill: record.skill }
  if (typeof record.material === 'string') entry.material = record.material
  if (typeof record.level === 'string') entry.level = record.level
  if (typeof record.vocabulary === 'number') entry.vocabulary = record.vocabulary
  if (typeof record.count === 'number') entry.count = record.count
  if (typeof record.correct === 'number') entry.correct = record.correct
  return entry as unknown as ProgressRecord
}

/** Read every agent-written progress record sorted oldest first; unreadable files are skipped. */
async function readProgressRecords(): Promise<ProgressRecord[]> {
  let names: string[]
  try {
    names = await readdir(PROGRESS_DIR)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
  const records: ProgressRecord[] = []
  for (const fileName of names) {
    if (!fileName.endsWith('.json')) continue
    const content = await readFile(join(PROGRESS_DIR, fileName), 'utf8').catch(() => undefined)
    if (content === undefined) continue
    const record = parseProgressRecord(content)
    if (record !== undefined) records.push(record)
  }
  return records.sort((a, b) => a.time - b.time)
}

/** Read every vocabulary bank file sorted newest first; unreadable files are skipped. */
async function readVocabularyEntries(): Promise<VocabularyEntry[]> {
  let names: string[]
  try {
    names = await readdir(VOCABULARY_DIR)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
  const entries: VocabularyEntry[] = []
  for (const fileName of names) {
    if (!fileName.endsWith('.json')) continue
    const content = await readFile(join(VOCABULARY_DIR, fileName), 'utf8').catch(() => undefined)
    if (content === undefined) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) continue
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.words)) continue
    const words = record.words.filter((word): word is { word: string; definition: string; example?: string } => {
      if (typeof word !== 'object' || word === null) return false
      const candidate = word as Record<string, unknown>
      return typeof candidate.word === 'string' && typeof candidate.definition === 'string'
    }).map(word => ({
      word: word.word,
      definition: word.definition,
      ...(typeof word.example === 'string' ? { example: word.example } : {}),
    }))
    if (words.length === 0) continue
    entries.push({
      time: typeof record.time === 'number' ? record.time : 0,
      ...(typeof record.material === 'string' ? { material: record.material } : {}),
      ...(typeof record.level === 'string' ? { level: record.level } : {}),
      words,
    })
  }
  return entries.sort((a, b) => b.time - a.time)
}

/** Read the learner placement record; a missing or malformed file reads as no profile. */
async function readLearnerProfile(): Promise<LearnerProfile | undefined> {
  const content = await readFile(PROFILE_PATH, 'utf8').catch(() => undefined)
  if (content === undefined) return undefined
  return parseLearnerProfile(content)
}

/** Count consecutive learning days ending today (or yesterday when today has no record yet). */
function countStreakDays(records: readonly ProgressRecord[]): number {
  if (records.length === 0) return 0
  const dayKey = (time: number): string => {
    const date = new Date(time)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const days = new Set(records.map(record => dayKey(record.time)))
  const cursor = new Date()
  let streak = 0
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

/** Strip filesystem-hostile characters and bound the length of a user-supplied material name. */
function sanitizeMaterialName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '').trim()
  const bounded = cleaned.length > 0 ? cleaned.slice(0, 60) : 'material'
  return bounded
}

/** Read the materials directory into entries; a missing directory lists as empty. */
async function listMaterials(): Promise<MaterialEntry[]> {
  let names: string[]
  try {
    names = await readdir(MATERIALS_DIR)
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return []
    throw error
  }
  const entries: MaterialEntry[] = []
  for (const fileName of names) {
    if (!fileName.endsWith('.md')) continue
    const path = join(MATERIALS_DIR, fileName)
    const info = await stat(path).then(
      info => ({ bytes: info.size, updatedAt: info.mtimeMs }),
      () => undefined,
    )
    if (info === undefined) continue
    entries.push({
      id: fileName.replace(/\.md$/, ''),
      name: fileName.replace(/\.md$/, '').replace(/^\d+-/, ''),
      path,
      ...info,
    })
  }
  return entries.sort((a, b) => b.id.localeCompare(a.id))
}

/** MIME types for static assets. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** Open a URL in the default browser using platform-specific commands. */
function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform
    const cmd =
      platform === 'darwin' ? 'open'
        : platform === 'win32' ? 'start ""'
          : 'xdg-open'
    exec(`${cmd} "${url}"`, (error) => {
      if (error !== null) reject(error)
      else resolve()
    })
  })
}

/** Read the full body of an incoming HTTP request as a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

/**
 * LingoLadder agent bundle plugin.
 * The bundle's composition is defined in cordis.patch.yml.
 * Registers a web dashboard with LLM chat and opens the browser on startup.
 */
export function apply(ctx: Context): void {
  console.log('[lingoladder] LingoLadder agent bundle loaded')

  // Resolve the dist directory at load time
  const distIndex = resolveDistIndex()
  const distRoot = dirname(distIndex)

  // Register the preset's skills (material-digest, knowledge-extractor, exercise-generator,
  // material-search, placement-assessment) as an extra skill root so chat agents see them
  // in the catalog. A thin wrapper provider filters out the skills the learner disabled in
  // the dashboard; toggling a skill invalidates the registration so the catalog republishes
  // on the tutor's next turn.
  let presetSkillProvider: FileSystemSkillProvider | undefined
  let presetSkillControl: SkillProviderControl | undefined
  const presetSkillConfig: FileSystemSkillConfig = {
    providerName: 'lingoladder',
    includeDefaultRoots: false,
    customSkillDirs: [resolvePresetSkillsDir()],
    watch: false,
  }
  ctx.skills.registerProvider((control) => {
    presetSkillControl = control
    presetSkillProvider = new FileSystemSkillProvider(ctx, control, presetSkillConfig)
    const provider: SkillProvider = {
      name: 'lingoladder',
      async list(options: SkillLookupOptions) {
        const inner = presetSkillProvider
        if (inner === undefined) return []
        const result = await inner.list(options)
        if (!Array.isArray(result)) return result
        const disabled = addedModelsSource.disabledSkills
        return result.filter(candidate => !disabled.includes(candidate.name))
      },
      async get(candidate, options) {
        const inner = presetSkillProvider
        if (inner === undefined) return undefined
        return inner.get(candidate, options)
      },
    }
    return provider
  })
  ctx.effect(function* () {
    yield async () => { await presetSkillProvider?.dispose() }
  }, 'lingoladder: preset skills provider')

  // Persistent agent for the chat session
  let chatAgent: ChatAgent | undefined

  // SSE clients
  const sseClients = new Set<ServerResponse>()

  /** Broadcast an SSE event to all connected clients. */
  function broadcast(event: string, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of sseClients) {
      if (!client.destroyed) client.write(payload)
    }
  }

  // Register the added-models settings section.
  const defaultAddedModels: AddedModelsSettings = { addedModels: [], disabledSkills: [] }
  let addedModelsSource: AddedModelsSettings = defaultAddedModels

  // Capture webServer reference before inject (sctx may not have it)
  const webServerRef = ctx.webServer

  const scope = ctx.settings.register(NS, ADDED_MODELS_SCHEMA, { base: { addedModels: [], disabledSkills: [] } })

  function syncSource(): void {
    const models = scope.get()
    addedModelsSource = { addedModels: models.addedModels, disabledSkills: models.disabledSkills }
  }
  syncSource()
  ctx.effect(() => () => { addedModelsSource = defaultAddedModels })
  scope.watch(() => {
    syncSource()
    // Skill toggles re-publish the catalog on the tutor's next turn.
    presetSkillControl?.invalidate()
  })

  // Settings model endpoint: saves the user's active model selection
  ctx.effect(() => webServerRef.register({
    kind: 'exact',
    path: '/api/settings/model',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { provider?: string; model?: string }
        if (typeof body.provider !== 'string' || typeof body.model !== 'string') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing provider or model' }))
          return
        }
        // Activating a model added before route materialization existed still
        // needs its pi-ai route; a stored key needs no rewrite.
        await ensurePiAiRoute(ctx, body.provider)
        await ctx.agentDefaultModel.saveSelection({ provider: body.provider, model: body.model })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, selection: { provider: body.provider, model: body.model } }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: settings model error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: settings model endpoint')

  // Added models endpoint: GET reads, POST adds, DELETE removes
  ctx.effect(() => webServerRef.register({
    kind: 'exact',
    path: '/api/models/added',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method === 'GET') {
          const addedModels = addedModelsSource.addedModels
          const sel = ctx.agentDefaultModel.currentSelection()
          const activeModel = (sel.provider && sel.model) ? { provider: sel.provider, model: sel.model } : undefined
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ addedModels, activeModel }))
          return
        }
        if (req.method === 'POST') {
          const body = JSON.parse(await readBody(req)) as {
            provider?: string
            model?: string
            name?: string
            description?: string
            apiKey?: string
          }
          if (typeof body.provider !== 'string' || typeof body.model !== 'string' || typeof body.name !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing provider, model, or name' }))
            return
          }
          const apiKey = typeof body.apiKey === 'string' && body.apiKey.trim().length > 0
            ? body.apiKey.trim()
            : undefined
          // The route and credential exist before the model is listed, so an
          // added model can serve its first message.
          await ensurePiAiRoute(ctx, body.provider, apiKey)
          const current = addedModelsSource
          const exists = current.addedModels.some(m => m.provider === body.provider && m.model === body.model)
          const nextModels = exists
            ? current.addedModels
            : [...current.addedModels, {
              provider: body.provider,
              model: body.model,
              name: body.name,
              ...body.description === undefined ? {} : { description: body.description },
            }]
          await scope.update({ addedModels: nextModels })
          if (!exists) await ctx.agentDefaultModel.saveSelection({ provider: body.provider, model: body.model })
          const sel = ctx.agentDefaultModel.currentSelection()
          const nextActive = exists ? { provider: sel.provider, model: sel.model } : { provider: body.provider, model: body.model }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, addedModels: nextModels, activeModel: nextActive }))
          return
        }
        if (req.method === 'DELETE') {
          const body = JSON.parse(await readBody(req)) as { provider?: string; model?: string }
          if (typeof body.provider !== 'string' || typeof body.model !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing provider or model' }))
            return
          }
          const current = addedModelsSource
          const nextModels = current.addedModels.filter(m => !(m.provider === body.provider && m.model === body.model))
          const sel = ctx.agentDefaultModel.currentSelection()
          const wasActive = sel.provider === body.provider && sel.model === body.model
          await scope.update({ addedModels: nextModels })
          if (wasActive) await ctx.agentDefaultModel.saveSelection({ provider: '', model: '' })
          const nextActive = wasActive ? undefined : { provider: sel.provider, model: sel.model }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, addedModels: nextModels, activeModel: nextActive }))
          return
        }
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: added models error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: added models endpoint')

  // Provider key endpoint: stores one provider's API key and materializes its
  // pi-ai route, so a provider can be configured before (or without) adding a model.
  ctx.effect(() => webServerRef.register({
    kind: 'exact',
    path: '/api/models/key',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { provider?: string; apiKey?: string }
        if (typeof body.provider !== 'string' || typeof body.apiKey !== 'string' || body.apiKey.trim().length === 0) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing provider or apiKey' }))
          return
        }
        await ensurePiAiRoute(ctx, body.provider, body.apiKey.trim())
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: provider key error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: provider key endpoint')

  /** Read the active model selection from agent-default-model. */
  function getActiveModel(): { provider: string; model: string } | undefined {
    const sel = ctx.agentDefaultModel.currentSelection()
    return (sel.provider && sel.model) ? { provider: sel.provider, model: sel.model } : undefined
  }

  /** Serve a static file from the dist directory. */
  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    // Block path traversal
    if (pathname.includes('..')) {
      res.writeHead(403)
      res.end()
      return
    }

    // Root serves index.html
    const file = pathname === '/' || pathname === '' ? distIndex : join(distRoot, pathname)

    try {
      const data = await readFile(file)
      const ext = '.' + (file.split('.').pop() ?? '')
      const mime = MIME[ext] ?? 'application/octet-stream'
      res.writeHead(200, { 'content-type': mime })
      res.end(data)
    } catch {
      // SPA fallback: serve index.html for any non-file path
      if (!pathname.includes('.')) {
        const data = await readFile(distIndex)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(data)
      } else {
        res.writeHead(404)
        res.end()
      }
    }
  }

  // Placement tracking state: stage transitions and completion are read out of the
  // chat agent's `write` calls to the placement files, broadcast only after the
  // write's tool result confirms it landed on disk.
  const pendingPlacementWrites = new Map<string, PlacementWriteIntent>()
  let placementActive = false

  // Listening practice state: the exercise-generator skill writes the full exercise
  // (passage, questions, answer key) to the listening session file when the request
  // comes from the listening page; the page grades and reports the score itself.
  const pendingListeningWrites = new Map<string, ListeningWriteIntent>()

  // Speaking practice state mirrors the listening pipeline: the skill writes the
  // sentence list to the speaking session file, the page records and scores each
  // line client-side, then reports the outcome.
  const pendingSpeakingWrites = new Map<string, SpeakingWriteIntent>()

  // Reading practice state mirrors the listening pipeline: the skill writes the
  // quiz document (passage, questions, answer key) to the reading session file,
  // the page grades against the key, then reports the outcome.
  const pendingReadingWrites = new Map<string, ReadingWriteIntent>()

  // Writing practice state: the session file carries two phases — the assignment,
  // then the skill's graded outcome after it critiques the essay the page submits
  // through the chat. The page shows the outcome and reports the score itself.
  const pendingWritingWrites = new Map<string, WritingWriteIntent>()

  // Live text deltas reach the page through the process-local
  // `agent/assistant-stream` frames; the durable SessionEventMap carries only
  // the settled `assistant/attempt` / `assistant/message` rows.
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (chatAgent === undefined) return
    if (String(agent.session.id) !== chatAgent.sessionId) return
    if (frame.type === 'chunk' && frame.chunk.type === 'text-delta') {
      broadcast('chunk', { text: frame.chunk.text })
    }
  })

  // Subscribe to session events and forward to SSE clients
  ctx.on('session/event', (session, event) => {
    if (chatAgent === undefined) return
    if (String(session.id) !== chatAgent.sessionId) return
    switch (event.type) {
      case 'assistant/message': {
        const content = event.data.message.content
        const text = content
          .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
          .map(b => b.text)
          .join('')
        if (text !== '') {
          broadcast('message', { text })
        }
        break
      }
      case 'tool/call': {
        const intent = classifyPlacementWrite(event.data)
        if (intent.kind !== 'none') {
          pendingPlacementWrites.set(event.data.callId, intent)
        }
        const listeningIntent = classifyListeningWrite(event.data)
        if (listeningIntent.kind !== 'none') {
          pendingListeningWrites.set(event.data.callId, listeningIntent)
        }
        const speakingIntent = classifySpeakingWrite(event.data)
        if (speakingIntent.kind !== 'none') {
          pendingSpeakingWrites.set(event.data.callId, speakingIntent)
        }
        const readingIntent = classifyReadingWrite(event.data)
        if (readingIntent.kind !== 'none') {
          pendingReadingWrites.set(event.data.callId, readingIntent)
        }
        const writingIntent = classifyWritingWrite(event.data)
        if (writingIntent.kind !== 'none') {
          pendingWritingWrites.set(event.data.callId, writingIntent)
        }
        break
      }
      case 'tool/result': {
        const callId = event.data.message.content[0].toolCallId
        const failed = event.data.error !== undefined || event.data.message.content[0].isError === true
        const intent = pendingPlacementWrites.get(callId)
        pendingPlacementWrites.delete(callId)
        if (intent !== undefined && !failed) {
          if (intent.kind === 'progress') {
            placementActive = true
            broadcast('placement', {
              stage: intent.progress.stage,
              round: intent.progress.round,
              totalRounds: intent.progress.totalRounds,
              time: intent.progress.time,
            })
          } else if (intent.kind === 'profile' && placementActive) {
            placementActive = false
            broadcast('placementComplete', { profile: intent.profile })
            void unlink(PLACEMENT_PROGRESS_PATH).catch(() => {
              // The next assessment overwrites the leftover progress file, so a failed
              // cleanup only risks a stale UI hint, nothing the agent reads.
            })
          }
        }
        const listeningIntent = pendingListeningWrites.get(callId)
        pendingListeningWrites.delete(callId)
        if (listeningIntent !== undefined && listeningIntent.kind === 'exercise' && !failed) {
          broadcast('listeningExercise', { exercise: listeningIntent.exercise })
        }
        const speakingIntent = pendingSpeakingWrites.get(callId)
        pendingSpeakingWrites.delete(callId)
        if (speakingIntent !== undefined && speakingIntent.kind === 'exercise' && !failed) {
          broadcast('speakingExercise', { exercise: speakingIntent.exercise })
        }
        const readingIntent = pendingReadingWrites.get(callId)
        pendingReadingWrites.delete(callId)
        if (readingIntent !== undefined && readingIntent.kind === 'exercise' && !failed) {
          broadcast('readingExercise', { exercise: readingIntent.exercise })
        }
        const writingIntent = pendingWritingWrites.get(callId)
        pendingWritingWrites.delete(callId)
        if (writingIntent !== undefined && !failed) {
          if (writingIntent.kind === 'task') {
            broadcast('writingExercise', { exercise: writingIntent.task })
          } else if (writingIntent.kind === 'result') {
            broadcast('writingResult', { result: writingIntent.result })
          }
        }
        break
      }
      case 'turn/end': {
        broadcast('done', {})
        break
      }
      default:
        break
    }
  })

  // Forward agent status to SSE clients
  ctx.on('agent/status', ({ agent, status }) => {
    if (chatAgent === undefined) return
    const agentId = (agent as { id: string }).id
    if (agentId !== chatAgent.agentId) return
    broadcast('status', { status })
  })

  // Forward agent errors to SSE clients and console
  ctx.on('agent/error', ({ agent, error }) => {
    if (chatAgent === undefined) return
    const agentId = (agent as { id: string }).id
    if (agentId !== chatAgent.agentId) return
    const reason = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error(`lingoladder: agent error: ${reason}`)
    if (stack !== undefined) console.error(stack)
    broadcast('error', { error: reason })
  })

  // SSE endpoint for streaming events to the browser
  const webServerForSse = ctx.webServer
  ctx.effect(() => webServerForSse.register({
    kind: 'exact',
    path: '/api/events',
    handler: (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      })
      res.write(':ok\n\n')
      sseClients.add(res)
      req.on('close', () => { sseClients.delete(res) })
    },
  }), 'lingoladder: SSE endpoint')

  // Progress endpoint: aggregates the agent-written learning records into per-ability
  // activity counts, XP, streak days, and the latest records for the dashboard.
  const webServerForProgress = ctx.webServer
  ctx.effect(() => webServerForProgress.register({
    kind: 'exact',
    path: '/api/progress',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const records = await readProgressRecords()
        const skills = Object.fromEntries(ABILITY_IDS.map(id => [id, {
          exercises: 0, digests: 0, vocabulary: 0, activities: 0, correct: 0, answered: 0,
        }])) as Record<(typeof ABILITY_IDS)[number], {
          exercises: number
          digests: number
          vocabulary: number
          activities: number
          correct: number
          answered: number
        }>
        let digests = 0
        let exercises = 0
        let vocabulary = 0
        for (const record of records) {
          const stat = skills[record.skill]
          stat.activities += 1
          if (record.kind === 'digest') {
            digests += 1
            stat.digests += 1
            if (typeof record.vocabulary === 'number') {
              vocabulary += record.vocabulary
              stat.vocabulary += record.vocabulary
            }
          } else {
            exercises += 1
            stat.exercises += 1
            if (typeof record.correct === 'number' && typeof record.count === 'number' && record.count > 0) {
              stat.correct += record.correct
              stat.answered += record.count
            }
          }
        }
        const xp = digests * XP_PER_DIGEST + exercises * XP_PER_EXERCISE + vocabulary * XP_PER_VOCABULARY_WORD
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          skills,
          totals: { digests, exercises, vocabulary },
          xp,
          streakDays: countStreakDays(records),
          recent: records.slice(-8).reverse(),
        }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: progress error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: progress endpoint')

  // Vocabulary endpoint: the bank of extracted words, newest material first.
  const webServerForVocabulary = ctx.webServer
  ctx.effect(() => webServerForVocabulary.register({
    kind: 'exact',
    path: '/api/vocabulary',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const entries = await readVocabularyEntries()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ entries }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: vocabulary error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: vocabulary endpoint')

  // Profile endpoint: GET reads the learner placement record, POST records a manual level pick.
  const webServerForProfile = ctx.webServer
  ctx.effect(() => webServerForProfile.register({
    kind: 'exact',
    path: '/api/profile',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method === 'GET') {
          const profile = await readLearnerProfile()
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ profile: profile ?? null }))
          return
        }
        if (req.method === 'POST') {
          const body = JSON.parse(await readBody(req)) as { currentLevel?: string }
          if (typeof body.currentLevel !== 'string' || !(CEFR_LEVELS as readonly string[]).includes(body.currentLevel)) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing or invalid currentLevel' }))
            return
          }
          const profile: LearnerProfile = {
            time: Date.now(),
            kind: 'placement',
            source: 'manual',
            currentLevel: body.currentLevel,
          }
          await mkdir(dirname(PROFILE_PATH), { recursive: true })
          await writeFile(PROFILE_PATH, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, profile }))
          return
        }
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: profile error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: profile endpoint')

  // Placement progress endpoint: the in-flight assessment stage the agent reports at
  // each stage transition, or null when no assessment is running. Lets a freshly
  // reloaded dashboard restore the assessment view without waiting for the next write.
  const webServerForPlacement = ctx.webServer
  ctx.effect(() => webServerForPlacement.register({
    kind: 'exact',
    path: '/api/placement',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const content = await readFile(PLACEMENT_PROGRESS_PATH, 'utf8').catch(() => undefined)
        const progress = content === undefined ? undefined : parsePlacementProgress(content)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ progress: progress ?? null }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: placement error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: placement progress endpoint')

  // Listening session endpoint: GET returns the pending listening exercise the
  // exercise-generator skill wrote for the listening page, or null when none is
  // pending. Lets a freshly reloaded page restore the practice without waiting for
  // the next generation.
  const webServerForListening = ctx.webServer
  ctx.effect(() => webServerForListening.register({
    kind: 'exact',
    path: '/api/listening',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const content = await readFile(LISTENING_SESSION_PATH, 'utf8').catch(() => undefined)
        const exercise = content === undefined ? undefined : parseListeningExercise(content)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ exercise: exercise ?? null }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: listening error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: listening session endpoint')

  // Speaking session endpoint: GET returns the pending speaking exercise the
  // exercise-generator skill wrote for the speaking page, or null when none is
  // pending, so a reloaded page restores the round.
  const webServerForSpeaking = ctx.webServer
  ctx.effect(() => webServerForSpeaking.register({
    kind: 'exact',
    path: '/api/speaking',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const content = await readFile(SPEAKING_SESSION_PATH, 'utf8').catch(() => undefined)
        const exercise = content === undefined ? undefined : parseSpeakingExercise(content)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ exercise: exercise ?? null }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: speaking error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: speaking session endpoint')

  // Speaking result endpoint: the speaking page scores each recorded line
  // client-side and reports the outcome here. The backend turns it into the same
  // progress record shape the exercise-generator skill writes for chat-graded
  // rounds, then retires the session document.
  const webServerForSpeakingResult = ctx.webServer
  ctx.effect(() => webServerForSpeakingResult.register({
    kind: 'exact',
    path: '/api/speaking/result',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const body = JSON.parse(await readBody(req)) as { count?: number; correct?: number }
        if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 1
          || typeof body.correct !== 'number' || !Number.isInteger(body.correct)
          || body.correct < 0 || body.correct > body.count) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing or invalid count/correct' }))
          return
        }
        const content = await readFile(SPEAKING_SESSION_PATH, 'utf8').catch(() => undefined)
        const exercise = content === undefined ? undefined : parseSpeakingExercise(content)
        if (exercise === undefined) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'No speaking session is pending' }))
          return
        }
        const record: ProgressRecord = {
          time: Date.now(),
          kind: 'exercise',
          skill: 'speaking',
          count: body.count,
          correct: body.correct,
        }
        if (exercise.material !== undefined) record.material = exercise.material
        if (exercise.level !== undefined) record.level = exercise.level
        await mkdir(PROGRESS_DIR, { recursive: true })
        await writeFile(join(PROGRESS_DIR, `${String(record.time)}-exercise.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        await unlink(SPEAKING_SESSION_PATH).catch(() => {
          // A leftover session document only risks the page offering a finished round
          // again; the next generation overwrites it.
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, record }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: speaking result error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: speaking result endpoint')

  // Reading session endpoint: GET returns the pending reading exercise the
  // exercise-generator skill wrote for the reading page, or null when none is
  // pending, so a reloaded page restores the round.
  const webServerForReading = ctx.webServer
  ctx.effect(() => webServerForReading.register({
    kind: 'exact',
    path: '/api/reading',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const content = await readFile(READING_SESSION_PATH, 'utf8').catch(() => undefined)
        const exercise = content === undefined ? undefined : parseReadingExercise(content)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ exercise: exercise ?? null }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: reading error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: reading session endpoint')

  // Reading result endpoint: the reading page grades client-side against the
  // answer key and reports the outcome here. The backend turns it into the same
  // progress record shape the exercise-generator skill writes for chat-graded
  // rounds, then retires the session document.
  const webServerForReadingResult = ctx.webServer
  ctx.effect(() => webServerForReadingResult.register({
    kind: 'exact',
    path: '/api/reading/result',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const body = JSON.parse(await readBody(req)) as { count?: number; correct?: number }
        if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 1
          || typeof body.correct !== 'number' || !Number.isInteger(body.correct)
          || body.correct < 0 || body.correct > body.count) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing or invalid count/correct' }))
          return
        }
        const content = await readFile(READING_SESSION_PATH, 'utf8').catch(() => undefined)
        const exercise = content === undefined ? undefined : parseReadingExercise(content)
        if (exercise === undefined) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'No reading session is pending' }))
          return
        }
        const record: ProgressRecord = {
          time: Date.now(),
          kind: 'exercise',
          skill: 'reading',
          count: body.count,
          correct: body.correct,
        }
        if (exercise.material !== undefined) record.material = exercise.material
        if (exercise.level !== undefined) record.level = exercise.level
        await mkdir(PROGRESS_DIR, { recursive: true })
        await writeFile(join(PROGRESS_DIR, `${String(record.time)}-exercise.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        await unlink(READING_SESSION_PATH).catch(() => {
          // A leftover session document only risks the page offering a finished round
          // again; the next generation overwrites it.
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, record }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: reading result error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: reading result endpoint')

  // Writing session endpoint: GET returns the pending writing session document —
  // the assignment while the learner writes, the graded outcome after the skill
  // critiques the essay — or null when none is pending, so a reloaded page
  // restores the round at the right phase.
  const webServerForWriting = ctx.webServer
  ctx.effect(() => webServerForWriting.register({
    kind: 'exact',
    path: '/api/writing',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      try {
        const content = await readFile(WRITING_SESSION_PATH, 'utf8').catch(() => undefined)
        const document = content === undefined ? undefined : parseWritingDocument(content)
        const doc = document === undefined ? null : document.kind === 'task' ? document.task : document.result
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ doc }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: writing error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: writing session endpoint')

  // Writing result endpoint: the LLM grades the essay and writes the outcome into
  // the session file; the page reports the score here so it lands as the same
  // progress record shape the exercise-generator skill writes for chat-graded
  // rounds (one essay counts as one question, correct at 60 or above), and the
  // session document is retired.
  const webServerForWritingResult = ctx.webServer
  ctx.effect(() => webServerForWritingResult.register({
    kind: 'exact',
    path: '/api/writing/result',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const body = JSON.parse(await readBody(req)) as { score?: number }
        if (typeof body.score !== 'number' || !Number.isInteger(body.score) || body.score < 0 || body.score > 100) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing or invalid score' }))
          return
        }
        const content = await readFile(WRITING_SESSION_PATH, 'utf8').catch(() => undefined)
        const document = content === undefined ? undefined : parseWritingDocument(content)
        if (document === undefined) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'No writing session is pending' }))
          return
        }
        const source = document.kind === 'task' ? document.task : document.result
        const record: ProgressRecord = {
          time: Date.now(),
          kind: 'exercise',
          skill: 'writing',
          count: 1,
          correct: body.score >= 60 ? 1 : 0,
        }
        if (source.material !== undefined) record.material = source.material
        if (source.level !== undefined) record.level = source.level
        await mkdir(PROGRESS_DIR, { recursive: true })
        await writeFile(join(PROGRESS_DIR, `${String(record.time)}-exercise.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        await unlink(WRITING_SESSION_PATH).catch(() => {
          // A leftover session document only risks the page offering a finished round
          // again; the next generation overwrites it.
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, record }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: writing result error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: writing result endpoint')

  // Skills endpoint: GET lists the preset skills with their frontmatter routing
  // metadata and the enabled flags from the settings; POST toggles one skill and
  // persists the disabled list. The provider wrapper and the settings watch pick
  // the change up, and the tutor's catalog republishes on the next turn.
  const webServerForSkills = ctx.webServer
  ctx.effect(() => webServerForSkills.register({
    kind: 'exact',
    path: '/api/skills',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method === 'GET') {
          const dir = resolvePresetSkillsDir()
          const entries = await readdir(dir, { withFileTypes: true })
          const candidates: SkillFrontmatter[] = []
          for (const entry of entries) {
            if (!entry.isDirectory()) continue
            const skillContent = await readFile(join(dir, entry.name, 'SKILL.md'), 'utf8').catch(() => undefined)
            if (skillContent === undefined) continue
            candidates.push(parseSkillFrontmatter(skillContent))
          }
          const skills = mergeSkillInfos(candidates, addedModelsSource.disabledSkills)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ skills }))
          return
        }
        if (req.method === 'POST') {
          const body = JSON.parse(await readBody(req)) as { name?: unknown; enabled?: unknown }
          if (!isSkillName(body.name) || typeof body.enabled !== 'boolean') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing or invalid name/enabled' }))
            return
          }
          const disabledSkills = toggleDisabledSkills(addedModelsSource.disabledSkills, body.name, body.enabled)
          await scope.update({ disabledSkills })
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, disabledSkills }))
          return
        }
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: skills error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: skills endpoint')

  // Text-to-speech endpoint: synthesizes any passage with an Edge neural voice for
  // the listening and speaking pages' players. Upstream failures surface as 502 so
  // the pages can fall back to browser speech synthesis.
  const webServerForTts = ctx.webServer
  ctx.effect(() => webServerForTts.register({
    kind: 'exact',
    path: '/api/tts',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const body = JSON.parse(await readBody(req)) as { text?: string; voice?: string }
        if (typeof body.text !== 'string' || body.text.trim() === '' || body.text.length > TTS_MAX_TEXT_LENGTH) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing, empty, or oversized text' }))
          return
        }
        if (!isTtsVoice(body.voice)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing or invalid voice' }))
          return
        }
        const { audio, contentType } = await synthesizeSpeech(body.text, body.voice, TTS_CACHE_DIR)
        res.writeHead(200, {
          'content-type': contentType,
          'content-length': String(audio.length),
          'cache-control': 'private, max-age=86400',
        })
        res.end(audio)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: listening audio error: ${reason}`)
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: tts endpoint')

  // Listening result endpoint: the listening page grades client-side against the
  // answer key and reports the outcome here. The backend turns it into the same
  // progress record shape the exercise-generator skill writes for chat-graded
  // rounds, then retires the session document.
  const webServerForListeningResult = ctx.webServer
  ctx.effect(() => webServerForListeningResult.register({
    kind: 'exact',
    path: '/api/listening/result',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const body = JSON.parse(await readBody(req)) as { count?: number; correct?: number }
        if (typeof body.count !== 'number' || !Number.isInteger(body.count) || body.count < 1
          || typeof body.correct !== 'number' || !Number.isInteger(body.correct)
          || body.correct < 0 || body.correct > body.count) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing or invalid count/correct' }))
          return
        }
        const content = await readFile(LISTENING_SESSION_PATH, 'utf8').catch(() => undefined)
        const exercise = content === undefined ? undefined : parseListeningExercise(content)
        if (exercise === undefined) {
          res.writeHead(409, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'No listening session is pending' }))
          return
        }
        const record: ProgressRecord = {
          time: Date.now(),
          kind: 'exercise',
          skill: 'listening',
          count: body.count,
          correct: body.correct,
        }
        if (exercise.material !== undefined) record.material = exercise.material
        if (exercise.level !== undefined) record.level = exercise.level
        await mkdir(PROGRESS_DIR, { recursive: true })
        await writeFile(join(PROGRESS_DIR, `${String(record.time)}-exercise.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
        await unlink(LISTENING_SESSION_PATH).catch(() => {
          // A leftover session document only risks the page offering a finished round
          // again; the next generation overwrites it.
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, record }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: listening result error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: listening result endpoint')

  // Materials endpoints: GET lists, POST adds, DELETE removes. Materials are Markdown
  // files under the launch workspace so chat agents can read them with the read tool.
  const webServerForMaterials = ctx.webServer
  ctx.effect(() => webServerForMaterials.register({
    kind: 'exact',
    path: '/api/materials',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method === 'GET') {
          const materials = await listMaterials()
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ materials }))
          return
        }
        if (req.method === 'POST') {
          const body = JSON.parse(await readBody(req)) as { name?: string; content?: string }
          if (typeof body.name !== 'string' || body.name.trim() === ''
            || typeof body.content !== 'string' || body.content.trim() === '') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing name or content' }))
            return
          }
          await mkdir(MATERIALS_DIR, { recursive: true })
          const id = `${String(Date.now())}-${sanitizeMaterialName(body.name)}`
          const path = join(MATERIALS_DIR, `${id}.md`)
          await writeFile(path, body.content, 'utf8')
          const info = await stat(path)
          const entry: MaterialEntry = {
            id,
            name: sanitizeMaterialName(body.name),
            path,
            bytes: info.size,
            updatedAt: info.mtimeMs,
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, material: entry }))
          return
        }
        if (req.method === 'DELETE') {
          const body = JSON.parse(await readBody(req)) as { id?: string }
          if (typeof body.id !== 'string' || body.id === ''
            || body.id.includes('/') || body.id.includes('\\') || body.id.includes('..')) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing or invalid id' }))
            return
          }
          await unlink(join(MATERIALS_DIR, `${body.id}.md`))
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
          return
        }
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: materials error: ${reason}`)
        res.writeHead((error as { code?: string }).code === 'ENOENT' ? 404 : 500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: materials endpoint')

  // PDF extract endpoint: turns an uploaded PDF into the plain text the materials
  // POST flow stores. The dashboard reads the file in the browser and sends it
  // base64-encoded; no binary or multipart channel exists on the web server.
  const webServerForPdfExtract = ctx.webServer
  ctx.effect(() => webServerForPdfExtract.register({
    kind: 'exact',
    path: '/api/materials/extract',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }
        const body = JSON.parse(await readBody(req)) as { filename?: string; dataBase64?: string }
        if (typeof body.filename !== 'string' || !isPdfFileName(body.filename)) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: '只能提取 PDF 文件（.pdf 扩展名）' }))
          return
        }
        if (typeof body.dataBase64 !== 'string' || body.dataBase64 === '') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: '缺少 PDF 文件内容' }))
          return
        }
        const result = await extractPdfText(decodePdfBase64(body.dataBase64))
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, text: result.text, pages: result.pages }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: pdf extract error: ${reason}`)
        const status = error instanceof PdfExtractError ? 400 : 500
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: pdf extract endpoint')

  // Chat endpoint: receives a user message and forwards to the agent
  const webServerForChat = ctx.webServer
  ctx.effect(() => webServerForChat.register({
    kind: 'exact',
    path: '/api/chat',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { message?: string }
        const text = body.message
        if (typeof text !== 'string' || text.trim() === '') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing message' }))
          return
        }

        // Create agent on first message
        if (chatAgent === undefined) {
          // Read model from agent-default-model settings
          const activeModel = getActiveModel()
          if (activeModel === undefined) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'No model selected. Please add and select a model in Settings.' }))
            return
          }
          console.log(`lingoladder: using model ${activeModel.provider}/${activeModel.model}`)
          const sessionId = SessionId(`lingoladder-chat-${Date.now()}`)
          const handle = await ctx.agents.create({
            sessionId,
            meta: { cwd: process.cwd() },
            agentOptions: {
              provider: activeModel.provider,
              model: activeModel.model,
            },
          })
          chatAgent = {
            sessionId: String(sessionId),
            agentId: handle.agent.id,
            followup: (msg) => { handle.agent.followup(msg) },
            dispose: () => handle.dispose(),
          }
        }

        const message = createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        })
        chatAgent.followup(message)

        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: chat error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: chat endpoint')

  // Available models endpoint: returns all models from all registered adapters
  const webServerForAvailable = ctx.webServer
  ctx.effect(() => webServerForAvailable.register({
    kind: 'exact',
    path: '/api/models/available',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const entries = ctx.llm.listConfigurableProviders()
        const results: Array<{
          provider: string
          displayName: string
          models: Array<{ id: string; name: string; description?: string }>
        }> = []
        for (const entry of entries) {
          try {
            const models = await ctx.llm.listModels(entry.provider)
            if (models.length > 0) {
              results.push({
                provider: entry.provider,
                displayName: entry.displayName,
                models: models.map((m: { id: string; name: string; description?: string }) => ({
                  id: m.id,
                  name: m.name,
                  ...m.description === undefined ? {} : { description: m.description },
                })),
              })
            }
          } catch {
            // Skip providers that fail to list models
          }
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ providers: results }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: available models error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: available models endpoint')

  // Providers endpoint: lists all configurable LLM providers
  const webServerForProviders = ctx.webServer
  ctx.effect(() => webServerForProviders.register({
    kind: 'exact',
    path: '/api/models/providers',
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const entries = ctx.llm.listConfigurableProviders()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ providers: entries }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: providers error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: providers endpoint')

  // Model discovery endpoint: interrogates a provider for available models
  const webServerForDiscover = ctx.webServer
  ctx.effect(() => webServerForDiscover.register({
    kind: 'exact',
    path: '/api/models/discover',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { provider?: string; baseURL?: string; api?: string; apiKey?: string }
        const request: { provider?: string; baseURL?: string; api?: string; apiKey?: string } = {}
        if (typeof body.provider === 'string' && body.provider.length > 0) request.provider = body.provider
        if (typeof body.baseURL === 'string' && body.baseURL.length > 0) request.baseURL = body.baseURL
        if (typeof body.api === 'string' && body.api.length > 0) request.api = body.api
        if (typeof body.apiKey === 'string' && body.apiKey.length > 0) request.apiKey = body.apiKey

        const llmEntries = ctx.llm.listConfigurableProviders()

        // Helper: discover models for one provider
        type DiscoveredModelEntry = { id: string; name?: string; description?: string; contextWindow?: number; maxTokens?: number }
        const discoverOne = async (providerId: string): Promise<DiscoveredModelEntry[]> => {
          const entry = llmEntries.find(e => e.provider === providerId)
          if (entry?.settingsNs !== undefined) {
            try {
              return await ctx.llm.discoverModels(entry.settingsNs, { ...request, provider: providerId })
            } catch {
              // Discovery not registered; fall back to listModels
            }
          }
          try {
            const listed = await ctx.llm.listModels(providerId)
            return listed.map(m => ({
              id: m.id,
              name: m.name,
              ...m.description === undefined ? {} : { description: m.description },
            }))
          } catch {
            return []
          }
        }

        if (request.provider !== undefined) {
          // Single provider discovery
          const models = await discoverOne(request.provider)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ providers: [{ provider: request.provider, models }] }))
        } else {
          // Discover from ALL providers
          type ProviderResult = { provider: string; displayName: string; models: DiscoveredModelEntry[] }
          const results: ProviderResult[] = []
          for (const entry of llmEntries) {
            const models = await discoverOne(entry.provider)
            if (models.length > 0) {
              results.push({ provider: entry.provider, displayName: entry.displayName, models })
            }
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ providers: results }))
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: model discovery error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'lingoladder: model discovery endpoint')

  // Claim the webserver fallback seat to serve the React app dist
  console.log('[lingoladder] registering fallback handler')
  const webServerForFallback = ctx.webServer
  ctx.effect(() => webServerForFallback.registerFallback(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }

    const pathname = new URL(req.url ?? '/', 'http://x').pathname

    // Handle DSH authentication flow for the root path only
    // The connection plugin requires browser cookie authentication
    if (pathname === '/' || pathname === '') {
      const connection = ctx.get('connection') as { authorizeIndex?: (req: IncomingMessage, res: ServerResponse) => boolean } | undefined
      if (connection?.authorizeIndex !== undefined) {
        const authorized = connection.authorizeIndex(req, res)
        if (!authorized) return
      }
    }

    await serveStatic(pathname, res)
  }), 'lingoladder: fallback seat')

  // After the Loader settles, print the URL and open the browser
  let announced = false
  ctx.inject(['webServer', 'connection'], (wsCtx) => {
    const announce = (): void => {
      if (announced) return
      announced = true
      const ws = wsCtx.webServer as { port: number }
      const port = ws.port
      const webUrl = `http://127.0.0.1:${String(port)}`
      const connection = ctx.get('connection') as { authenticatedUrl?: (url: string) => string } | undefined
      const authenticatedUrl = connection?.authenticatedUrl?.(webUrl) ?? webUrl
      console.log(`dsh lingoladder: ${authenticatedUrl}`)
      const startup = ctx.get('webStartup') as { openBrowser?: boolean } | undefined
      if (startup?.openBrowser === false) {
        console.log('dsh lingoladder: --no-open is set; open the URL manually')
        return
      }
      console.log('dsh lingoladder: opening the default browser; pass --no-open to disable')
      void openBrowser(authenticatedUrl).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`lingoladder: could not open the default browser because ${reason}; open ${authenticatedUrl} manually`)
      })
    }
    const settled = (wsCtx.get('loader') as { await?: () => Promise<void> } | undefined)?.await?.()
    if (settled === undefined) announce()
    else {
      void settled.then(() => {
        if (wsCtx.get('webServer') !== undefined) announce()
      }, () => {})
    }
  })
}
