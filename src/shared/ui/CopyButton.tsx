import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ text, label = 'Copy', ariaLabel, className = '' }: {
  text: string
  label?: string
  ariaLabel?: string
  className?: string
}) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const requestId = useRef(0)
  const resetTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => {
    requestId.current += 1
    window.clearTimeout(resetTimer.current)
  }, [])

  async function copy() {
    const request = ++requestId.current
    window.clearTimeout(resetTimer.current)
    setStatus('copying')
    try {
      await navigator.clipboard.writeText(text)
      if (request !== requestId.current) return
      setStatus('copied')
      resetTimer.current = window.setTimeout(() => setStatus('idle'), 2_500)
    } catch {
      if (request === requestId.current) setStatus('failed')
    }
  }

  return <span className="inline-flex shrink-0 flex-col items-start gap-2">
    <button type="button" aria-label={ariaLabel} disabled={status === 'copying'} onClick={() => void copy()}
      className={`inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ${className}`}>
      {status === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {status === 'copied' ? 'Copied' : status === 'copying' ? 'Copying…' : label}
    </button>
    <span role="status" className="sr-only">{status === 'copied' ? 'Text copied to clipboard.' : ''}</span>
    {status === 'failed' ? <span role="alert" className="max-w-xs text-xs leading-5 text-red-700">Could not copy. Select and copy the text instead, or try again.</span> : null}
  </span>
}
