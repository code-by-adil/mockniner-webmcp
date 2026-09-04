import { useCallback, useEffect, useRef, useState } from 'react'
import { initialAudioPreparation, type AudioPreparation } from '@/infrastructure/media/audioAssets'

export function useAudioPreparation() {
  const [progress, setProgress] = useState<AudioPreparation | null>(null)
  const worker = useRef<Worker | null>(null)
  useEffect(() => () => { worker.current?.terminate(); worker.current = null }, [])
  const start = useCallback(() => {
    if (worker.current) return
    setProgress(initialAudioPreparation())
    const current = new Worker(new URL('../infrastructure/media/audioPreparation.worker.ts', import.meta.url), { type: 'module' })
    worker.current = current
    const finish = () => { current.terminate(); worker.current = null }
    current.addEventListener('message', (event: MessageEvent<AudioPreparation>) => {
      setProgress(event.data)
      if (event.data.stage === 'ready' || event.data.stage === 'error') finish()
    })
    current.addEventListener('error', () => {
      setProgress(value => ({ ...(value ?? initialAudioPreparation()), stage: 'error', error: { code: 'AUDIO_WORKER_FAILED', file: null, retryable: true, message: 'Audio preparation stopped. Try again.' } }))
      finish()
    })
  }, [])
  return { progress, start }
}
