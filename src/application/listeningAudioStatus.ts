import type { ListeningContentDocument } from '@/domain/objectiveContent'
import type { ListeningAudioSession } from './useListeningAudio'

export type ListeningAudioStatus = {
  contentKey: string
  source: 'bundled' | 'kokoro'
  phase: 'loading' | 'generating' | 'ready' | 'error'
  readyToPlay: boolean
  completedChunks: number
  totalChunks: number | null
  error: string | null
  canRetry: boolean
}

// Public metadata only. No scripts, answer keys, audio blobs or cache paths.
export function getListeningAudioStatus(document: ListeningContentDocument, audio: ListeningAudioSession): ListeningAudioStatus {
  return { contentKey: document.contentKey, source: document.audio.type, phase: audio.phase,
    readyToPlay: audio.readyToPlay, completedChunks: audio.completedChunks, totalChunks: audio.totalChunks,
    error: audio.error, canRetry: document.audio.type === 'kokoro' && audio.phase === 'error' }
}
