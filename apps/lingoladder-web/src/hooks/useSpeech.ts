import { useCallback, useEffect, useRef, useState } from 'react'

export type SpeechStatus = 'idle' | 'loading' | 'speaking' | 'paused'
/** Which engine produced the current or last playback: the Edge proxy or the browser fallback. */
export type SpeechEngine = 'edge' | 'local'

/** Neural voices the listening player offers, in chip order. Mirrors the backend's TTS_VOICES. */
export const SPEECH_VOICES: Array<{ id: string; label: string; male: boolean }> = [
  { id: 'en-US-AvaNeural', label: 'Ava', male: false },
  { id: 'en-US-EmmaNeural', label: 'Emma', male: false },
  { id: 'en-US-BrianNeural', label: 'Brian', male: true },
  { id: 'en-US-GuyNeural', label: 'Guy', male: true },
]

const VOICE_STORAGE_KEY = 'listening-voice'
const DEFAULT_VOICE = 'en-US-AvaNeural'

/** Name fragments of system voices known to sound better than the platform default, ranked most-specific first. */
const QUALITY_HINTS: Array<{ pattern: RegExp; bonus: number }> = [
  { pattern: /natural|online/, bonus: 50 },
  { pattern: /google/, bonus: 40 },
  { pattern: /enhanced|premium/, bonus: 30 },
  { pattern: /siri/, bonus: 25 },
]

/** Name fragments of system voices by gender, for matching the selected Edge voice's register. */
const FEMALE_HINTS = ['ava', 'samantha', 'allison', 'susan', 'zoe', 'karen', 'moira', 'tessa', 'victoria', 'female', 'google us english']
const MALE_HINTS = ['alex', 'daniel', 'tom', 'aaron', 'fred', 'male', 'david', 'mark']

/**
 * Score one system voice for the local fallback: English voices only, network and
 * enhanced voices over compact defaults, and a small gender preference so the
 * fallback roughly matches whichever Edge voice the learner picked. -1 means skip.
 */
function scoreLocalVoice(voice: SpeechSynthesisVoice, preferMale: boolean): number {
  if (!voice.lang.startsWith('en')) return -1
  const name = voice.name.toLowerCase()
  let score = 0
  if (voice.lang === 'en-US') score += 10
  for (const { pattern, bonus } of QUALITY_HINTS) {
    if (pattern.test(name)) score += bonus
  }
  if (!voice.localService) score += 10
  const genderHints = preferMale ? MALE_HINTS : FEMALE_HINTS
  if (genderHints.some(hint => name.includes(hint))) score += 5
  return score
}

/** Pick the highest-scored system voice for the local fallback; null keeps the platform default. */
function pickLocalVoice(preferMale: boolean): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  let best: SpeechSynthesisVoice | null = null
  let bestScore = 0
  for (const voice of voices) {
    const score = scoreLocalVoice(voice, preferMale)
    if (score > bestScore) {
      best = voice
      bestScore = score
    }
  }
  return best
}

/**
 * Play passages through the backend's Edge neural voices, with the browser's
 * speech synthesis as fallback when synthesis fails. The fallback picks the best
 * installed system voice (network/enhanced voices first, gender-matched to the
 * selected Edge voice) instead of the platform default. Audio blobs are cached
 * per text+voice for the hook's lifetime, so replay and re-picks skip the network
 * round trip; rate changes re-rate the playing audio instantly.
 */
export function useSpeech() {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [engine, setEngine] = useState<SpeechEngine>('edge')
  const [rate, setRate] = useState(1)
  const [voice, setVoice] = useState(() => {
    const stored = localStorage.getItem(VOICE_STORAGE_KEY)
    return stored !== null && SPEECH_VOICES.some(v => v.id === stored) ? stored : DEFAULT_VOICE
  })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCacheRef = useRef(new Map<string, string>())
  const lastSpokenRef = useRef<{ text: string; voice: string } | null>(null)
  const localSpeakingRef = useRef(false)
  const requestSeqRef = useRef(0)

  // Unmount: cancel the fallback speech and release every cached blob URL.
  useEffect(() => () => {
    requestSeqRef.current += 1
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    audioRef.current?.pause()
    for (const url of audioCacheRef.current.values()) URL.revokeObjectURL(url)
    audioCacheRef.current.clear()
  }, [])

  const stopLocal = useCallback(() => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    localSpeakingRef.current = false
  }, [])

  const speakLocal = useCallback((text: string, speakRate: number, preferMale: boolean) => {
    if (!('speechSynthesis' in window) || text.trim() === '') return
    const synth = window.speechSynthesis
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const localVoice = pickLocalVoice(preferMale)
    if (localVoice !== null) {
      utterance.voice = localVoice
      utterance.lang = localVoice.lang
    } else {
      utterance.lang = 'en-US'
    }
    utterance.rate = speakRate
    utterance.onend = () => {
      localSpeakingRef.current = false
      setStatus('idle')
    }
    utterance.onerror = () => {
      localSpeakingRef.current = false
      setStatus('idle')
    }
    localSpeakingRef.current = true
    setEngine('local')
    setStatus('speaking')
    synth.speak(utterance)
  }, [])

  const speakWith = useCallback(async (text: string, speakVoice: string, speakRate: number, preferMale: boolean) => {
    const seq = ++requestSeqRef.current
    stopLocal()
    audioRef.current?.pause()
    audioRef.current = null
    if (text.trim() === '') {
      lastSpokenRef.current = null
      setStatus('idle')
      return
    }
    lastSpokenRef.current = { text, voice: speakVoice }
    const key = `${speakVoice}\u0000${text}`
    let url = audioCacheRef.current.get(key) ?? null
    if (url === null) {
      setStatus('loading')
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, voice: speakVoice }),
        })
        if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
        url = URL.createObjectURL(await response.blob())
        audioCacheRef.current.set(key, url)
      } catch (err) {
        console.error('listening: Edge speech failed, falling back to browser synthesis:', err)
        if (seq === requestSeqRef.current) speakLocal(text, speakRate, preferMale)
        return
      }
    }
    if (seq !== requestSeqRef.current) return
    const element = new Audio(url)
    element.playbackRate = speakRate
    element.onended = () => {
      if (audioRef.current === element) setStatus('idle')
    }
    element.onerror = () => {
      if (audioRef.current === element) setStatus('idle')
    }
    audioRef.current = element
    setEngine('edge')
    setStatus('speaking')
    try {
      await element.play()
    } catch {
      setStatus('idle')
    }
  }, [stopLocal, speakLocal])

  const speak = useCallback((text: string) => {
    const selected = SPEECH_VOICES.find(v => v.id === voice)
    void speakWith(text, voice, rate, selected?.male ?? false)
  }, [speakWith, voice, rate])

  const pause = useCallback(() => {
    if (audioRef.current !== null) {
      audioRef.current.pause()
      setStatus('paused')
      return
    }
    if ('speechSynthesis' in window && localSpeakingRef.current) {
      window.speechSynthesis.pause()
      setStatus('paused')
    }
  }, [])

  const resume = useCallback(() => {
    if (audioRef.current !== null) {
      setStatus('speaking')
      void audioRef.current.play().catch(() => { setStatus('idle') })
      return
    }
    if ('speechSynthesis' in window && localSpeakingRef.current) {
      window.speechSynthesis.resume()
      setStatus('speaking')
    }
  }, [])

  const stop = useCallback(() => {
    requestSeqRef.current += 1
    stopLocal()
    audioRef.current?.pause()
    audioRef.current = null
    lastSpokenRef.current = null
    setStatus('idle')
  }, [stopLocal])

  /** Apply a new rate; Edge audio re-rates instantly, the local fallback restarts. */
  const changeRate = useCallback((next: number) => {
    setRate(next)
    const element = audioRef.current
    if (element !== null) {
      element.playbackRate = next
      return
    }
    if (localSpeakingRef.current && lastSpokenRef.current !== null) {
      const selected = SPEECH_VOICES.find(v => v.id === lastSpokenRef.current?.voice)
      speakLocal(lastSpokenRef.current.text, next, selected?.male ?? false)
    }
  }, [speakLocal])

  /** Switch the neural voice; an active utterance restarts from the beginning. */
  const changeVoice = useCallback((next: string) => {
    setVoice(next)
    localStorage.setItem(VOICE_STORAGE_KEY, next)
    const spoken = lastSpokenRef.current
    if (spoken === null) return
    const selected = SPEECH_VOICES.find(v => v.id === next)
    if (audioRef.current !== null) void speakWith(spoken.text, next, rate, selected?.male ?? false)
    else if (localSpeakingRef.current) speakLocal(spoken.text, rate, selected?.male ?? false)
  }, [speakWith, speakLocal, rate])

  return { status, engine, rate, voice, speak, pause, resume, stop, changeRate, changeVoice }
}
