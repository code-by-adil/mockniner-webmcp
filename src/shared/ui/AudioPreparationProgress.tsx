import { LoaderCircle } from 'lucide-react'
import type { AudioPreparation } from '@/infrastructure/media/audioAssets'

export function AudioPreparationProgress({ progress, retry }: { progress?: AudioPreparation | null; retry?: () => void }) {
  if (!progress) return null
  const complete = progress.stage === 'ready'
  const failed = progress.stage === 'error'
  const label = failed ? progress.error?.message ?? 'Audio preparation stopped.'
    : complete ? 'Practice voices are downloaded.'
    : progress.stage === 'initializing' ? 'Starting the practice voice…'
    : progress.stage === 'verifying' ? 'Checking the audio download…'
    : progress.stage === 'checking' ? 'Checking saved practice voices…'
    : 'Downloading practice voices…'
  return <div className="space-y-2 text-sm text-[var(--exam-text-muted)]" role="status">
    <div className="flex items-center gap-2">{!complete && !failed && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}<span>{label}</span></div>
    {!complete && !failed && progress.stage !== 'initializing' && <>
      <progress className="h-1.5 w-full accent-[var(--exam-accent)]" max={progress.totalBytes} value={progress.completedBytes} aria-label="Practice voice download" />
      <p className="text-xs">{(progress.completedBytes / 1_000_000).toFixed(1)} of {(progress.totalBytes / 1_000_000).toFixed(1)} MB · Saved for future practice{progress.attempt > 1 ? ` · Retry ${progress.attempt} of 3` : ''}</p>
    </>}
    {failed && retry && <button type="button" className="font-semibold text-[var(--exam-accent)] underline" onClick={retry}>Retry audio preparation</button>}
  </div>
}
