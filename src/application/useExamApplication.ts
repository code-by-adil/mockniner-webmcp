import { useEffect, useMemo, useReducer, useState } from 'react'
import { loadSession, saveSession, sessionReducer } from '@/domain/session'
import { listeningDocument, readingDocument } from '@/content/objective'
import { writingDocument } from '@/content/writing'
import {
  replaceActiveContent,
  type ActiveContentDocuments,
} from '@/domain/contentDocument'
import {
  createExamApplicationCommands,
  type ExamApplicationCommands,
} from './commands'
import { reportWebHandledProductFailure } from '@/shared/observability/report-error'

export function useExamApplication(): {
  state: ReturnType<typeof loadSession>
  content: ActiveContentDocuments
  contentReady: boolean
  commands: ExamApplicationCommands
} {
  const [state, dispatch] = useReducer(sessionReducer, undefined, loadSession)
  const [content, setContent] = useState<ActiveContentDocuments>({
    listening: listeningDocument,
    reading: readingDocument,
    writing: writingDocument,
  })
  const [contentReady, setContentReady] = useState(false)
  useEffect(() => {
    saveSession(state)
  }, [state])

  useEffect(() => {
    let cancelled = false
    void import('@/infrastructure/database/client')
      .then(({ getLocalDatabase }) => getLocalDatabase())
      .then(async (database) => {
        const { createContentStore } = await import(
          '@/infrastructure/database/contentRepository'
        )
        return createContentStore(database).loadActive()
      })
      .then((storedDocuments) => {
        if (cancelled) return
        setContent((current) =>
          storedDocuments.reduce(replaceActiveContent, current),
        )
      })
      .catch((error) => {
        reportWebHandledProductFailure(error, { feature: 'content-catalog-load' })
      })
      .finally(() => {
        if (!cancelled) setContentReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const commands = useMemo(
    () =>
      createExamApplicationCommands({
        getState: () => state,
        dispatch,
        getContent: () => content,
        setContent,
        getAttemptWriter: async () =>
          (await import('@/infrastructure/database/attemptWriter')).getAttemptWriter(),
        getContentStore: async () => {
          const [{ getLocalDatabase }, { createContentStore }] = await Promise.all([
            import('@/infrastructure/database/client'),
            import('@/infrastructure/database/contentRepository'),
          ])
          return createContentStore(await getLocalDatabase())
        },
      }),
    [content, dispatch, state],
  )

  return { state, content, contentReady, commands }
}
