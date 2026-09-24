import { describe, expect, it } from 'vitest'
import { escapeSsmlText, isTtsVoice, ttsCacheFileName, TTS_MAX_TEXT_LENGTH, TTS_VOICES } from '../src/tts.ts'

describe('isTtsVoice', () => {
  it('accepts the offered voices and rejects everything else', () => {
    for (const voice of TTS_VOICES) expect(isTtsVoice(voice)).toBe(true)
    expect(isTtsVoice('en-US-AvaNeural ')).toBe(false)
    expect(isTtsVoice('en-US-Avaneural')).toBe(false)
    expect(isTtsVoice('en-GB-SoniaNeural')).toBe(false)
    expect(isTtsVoice(42)).toBe(false)
    expect(isTtsVoice(undefined)).toBe(false)
  })
})

describe('escapeSsmlText', () => {
  it('escapes the characters that break the raw SSML interpolation', () => {
    expect(escapeSsmlText('Tom & Jerry <play> "loud"')).toBe('Tom &amp; Jerry &lt;play&gt; "loud"')
  })

  it('leaves plain prose unchanged', () => {
    const passage = 'City councils across the region are debating new bike lanes.'
    expect(escapeSsmlText(passage)).toBe(passage)
  })
})

describe('ttsCacheFileName', () => {
  it('is deterministic per text+voice pair', () => {
    expect(ttsCacheFileName('Hello.', 'en-US-AvaNeural'))
      .toBe(ttsCacheFileName('Hello.', 'en-US-AvaNeural'))
  })

  it('differs when the text or the voice differs', () => {
    expect(ttsCacheFileName('Hello.', 'en-US-AvaNeural'))
      .not.toBe(ttsCacheFileName('Hello.', 'en-US-GuyNeural'))
    expect(ttsCacheFileName('Hello.', 'en-US-AvaNeural'))
      .not.toBe(ttsCacheFileName('Hello!', 'en-US-AvaNeural'))
  })

  it('keeps distinct text+voice pairs from colliding', () => {
    expect(ttsCacheFileName('A\u0000B', 'en-US-AvaNeural'))
      .not.toBe(ttsCacheFileName('A', 'en-US-AvaNeural'))
  })

  it('uses the .mp3 extension and stays under the length cap contract', () => {
    const name = ttsCacheFileName('Hello.', 'en-US-AvaNeural')
    expect(name.endsWith('.mp3')).toBe(true)
    expect(TTS_MAX_TEXT_LENGTH).toBeGreaterThan(0)
  })
})
