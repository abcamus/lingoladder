/**
 * Edge neural text-to-speech for listening practice playback.
 *
 * Wraps the msedge-tts client (Microsoft Edge Read Aloud service): passages are
 * synthesized on demand into MP3, escaped into the service's SSML template — the
 * template interpolates content raw, so `&`/`<`/`>` must be escaped here — and
 * cached on disk keyed by text+voice so replay and re-visits skip the network.
 *
 * @module
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { installResolutionGuard } from './resolution-guard.ts'

/** Neural voices the listening page offers, in picker order. */
export const TTS_VOICES = ['en-US-AvaNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural', 'en-US-GuyNeural'] as const

/** One offered Edge neural voice. */
export type TtsVoice = (typeof TTS_VOICES)[number]

/** Upper bound for one synthesized passage; a listening passage stays far below it. */
export const TTS_MAX_TEXT_LENGTH = 5000

/** Whether value is one of the offered voices. */
export function isTtsVoice(value: unknown): value is TtsVoice {
  return typeof value === 'string' && (TTS_VOICES as readonly string[]).includes(value)
}

/** Escape text for interpolation into the service's SSML template, which passes content through raw. */
export function escapeSsmlText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** The msedge-tts module, imported once through {@link loadMsEdgeTts}. */
let msedgeTts: Promise<typeof import('msedge-tts')> | undefined

/**
 * Import msedge-tts behind the resolution guard. The import is deferred rather
 * than static because the guard has to be installed before the module graph
 * reaches its CommonJS requires, which is still the import phase of whoever
 * imported this file statically.
 */
function loadMsEdgeTts(): Promise<typeof import('msedge-tts')> {
  installResolutionGuard()
  msedgeTts ??= import('msedge-tts')
  return msedgeTts
}

/** Deterministic cache file name for one text+voice pair. */
export function ttsCacheFileName(text: string, voice: TtsVoice): string {
  return `${createHash('sha256').update(text).update('\u0000').update(voice).digest('hex')}.mp3`
}

/** One synthesis result: the MP3 bytes and their content type. */
export interface SpeechAudio {
  audio: Buffer
  contentType: string
}

/**
 * Synthesize one passage with the given Edge neural voice, serving repeat
 * requests from the disk cache. Throws when the speech service fails or
 * returns no audio.
 * @param text the passage to speak; already length-checked by the caller.
 * @param voice one of the offered voices.
 * @param cacheDir the directory under which synthesized audio is cached.
 */
export async function synthesizeSpeech(text: string, voice: TtsVoice, cacheDir: string): Promise<SpeechAudio> {
  const cachePath = join(cacheDir, ttsCacheFileName(text, voice))
  const cached = await readFile(cachePath).catch(() => undefined)
  if (cached !== undefined) return { audio: cached, contentType: 'audio/mpeg' }
  const { MsEdgeTTS, OUTPUT_FORMAT } = await loadMsEdgeTts()
  const tts = new MsEdgeTTS()
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(escapeSsmlText(text))
    const chunks: Buffer[] = []
    for await (const chunk of audioStream) chunks.push(chunk as Buffer)
    const audio = Buffer.concat(chunks)
    if (audio.length === 0) throw new Error('the speech service returned no audio')
    await mkdir(cacheDir, { recursive: true })
    const tempPath = `${cachePath}.${String(process.pid)}.tmp`
    await writeFile(tempPath, audio)
    await rename(tempPath, cachePath)
    return { audio, contentType: 'audio/mpeg' }
  } finally {
    tts.close()
  }
}
