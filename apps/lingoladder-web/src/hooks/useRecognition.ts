import { useCallback, useEffect, useRef, useState } from 'react'

/** Minimal structural types for the vendor-prefixed Web Speech recognition API. */
interface RecognitionAlternativeLike {
  transcript: string
}

interface RecognitionResultLike {
  readonly length: number
  isFinal: boolean
  [index: number]: RecognitionAlternativeLike | undefined
}

interface RecognitionEventLike {
  resultIndex: number
  results: { readonly length: number; [index: number]: RecognitionResultLike }
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | undefined {
  const holder = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition
}

/**
 * Live English speech recognition over the microphone for the speaking page.
 * `start()` begins listening; `stop()` resolves with the accumulated final
 * transcript once the recognizer finishes. `interim` carries the in-flight
 * words for live display. Empty support means the browser lacks the API and
 * the page should offer self-assessment instead.
 */
export function useRecognition() {
  const [interim, setInterim] = useState('')
  const [supported] = useState(() => recognitionCtor() !== undefined)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const finalRef = useRef('')
  const doneRef = useRef<((transcript: string) => void) | null>(null)

  useEffect(() => () => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (Ctor === undefined) return
    try {
      const recognition = new Ctor()
      recognition.lang = 'en-US'
      recognition.continuous = true
      recognition.interimResults = true
      finalRef.current = ''
      setInterim('')
      recognition.onresult = (event) => {
        let interimText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result === undefined) continue
          const text = result[0]?.transcript ?? ''
          if (result.isFinal) finalRef.current += `${text} `
          else interimText += text
        }
        setInterim(interimText.trim())
      }
      recognition.onerror = () => {
        // Errors (mic denied, no speech) also end the recognizer; onend resolves.
      }
      recognition.onend = () => {
        recognitionRef.current = null
        setInterim('')
        doneRef.current?.(finalRef.current.trim())
        doneRef.current = null
      }
      recognitionRef.current = recognition
      recognition.start()
    } catch {
      recognitionRef.current = null
    }
  }, [])

  const stop = useCallback(() => new Promise<string>((resolve) => {
    const recognition = recognitionRef.current
    if (recognition === null) {
      resolve('')
      return
    }
    doneRef.current = resolve
    recognition.stop()
  }), [])

  return { supported, interim, start, stop }
}
