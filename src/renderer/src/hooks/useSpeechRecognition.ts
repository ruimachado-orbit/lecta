import { useEffect, useRef, useState } from 'react'

/**
 * Minimal wrapper around the Web Speech API (SpeechRecognition). Chromium
 * exposes it as `webkitSpeechRecognition`. No extra deps; the browser handles
 * transcription. Returns nothing useful on platforms without support.
 */
export interface SpeechRecognitionState {
  supported: boolean
  listening: boolean
  transcript: string
  error: string | null
  start: () => void
  stop: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Recognition = any

export function useSpeechRecognition(): SpeechRecognitionState {
  const [supported] = useState<boolean>(
    () => typeof window !== 'undefined' && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
  )
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.()
      } catch {
        /* noop */
      }
    }
  }, [])

  const start = (): void => {
    if (!supported) return
    const win = window as unknown as Record<string, unknown>
    const SR = (win.SpeechRecognition || win.webkitSpeechRecognition) as new () => Recognition
    const rec = new SR()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = false
    rec.interimResults = true

    rec.onresult = (event: Recognition): void => {
      let text = ''
      const results = event.results
      for (let i = event.resultIndex; i < results.length; i++) {
        text += results[i][0].transcript
      }
      setTranscript(text)
    }
    rec.onend = (): void => setListening(false)
    rec.onerror = (event: Recognition): void => {
      setError(event.error || 'Speech recognition failed.')
      setListening(false)
    }

    recognitionRef.current = rec
    try {
      rec.start()
      setTranscript('')
      setError(null)
      setListening(true)
    } catch {
      setError('Could not start speech recognition.')
    }
  }

  const stop = (): void => {
    try {
      recognitionRef.current?.stop?.()
    } catch {
      /* noop */
    }
    setListening(false)
  }

  return { supported, listening, transcript, error, start, stop }
}
