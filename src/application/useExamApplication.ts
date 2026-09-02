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
import type { LearningSummary } from '@/domain/learningSummary'

const bundledContent = [listeningDocument, readingDocument, writingDocument]

export function useExamApplication(): {
  state: ReturnType<typeof loadSession>
  content: ActiveContentDocuments
  contentReady: boolean
  learningSummary: LearningSummary | null
  commands: ExamApplicationCommands
} {
  const [state, dispatch] = useReducer(sessionReducer, undefined, loadSession)
  const [content, setContent] = useState<ActiveContentDocuments>({
    listening: listeningDocument,
    reading: readingDocument,
    writing: writingDocument,
  })
  const [contentReady, setContentReady] = useState(false)
  const [learningSummary, setLearningSummary] = useState<LearningSummary | null>(null)
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
        return createContentStore(
          database,
          (error, row) => {
            reportWebHandledProductFailure(error, {
              feature: 'content-catalog-row-load',
              contentKey: row.contentKey,
              section: row.section,
            })
          },
          bundledContent,
        ).loadActive()
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

  useEffect(() => {
    if (state.view !== 'home') return
    let cancelled = false
    void Promise.all([
      import('@/infrastructure/database/client'),
      import('@/infrastructure/database/attemptReader'),
    ])
      .then(async ([{ getLocalDatabase }, { createAttemptReader }]) =>
        createAttemptReader(await getLocalDatabase()).readLearningSummary(5),
      )
      .then((summary) => {
        if (!cancelled) setLearningSummary(summary)
      })
      .catch((error) => {
        reportWebHandledProductFailure(error, { feature: 'attempt-history-load' })
      })
    return () => {
      cancelled = true
    }
  }, [state.view])

  const commands = useMemo(
    () =>
      createExamApplicationCommands({
        getState: () => state,
        dispatch,
        getContent: () => content,
        setContent,
        getAttemptWriter: async () =>
          (await import('@/infrastructure/database/attemptWriter')).getAttemptWriter(),
        getAttemptReader: async () => {
          const [{ getLocalDatabase }, { createAttemptReader }] = await Promise.all([
            import('@/infrastructure/database/client'),
            import('@/infrastructure/database/attemptReader'),
          ])
          return createAttemptReader(await getLocalDatabase())
        },
        getContentStore: async () => {
          const [{ getLocalDatabase }, { createContentStore }] = await Promise.all([
            import('@/infrastructure/database/client'),
            import('@/infrastructure/database/contentRepository'),
          ])
          return createContentStore(
            await getLocalDatabase(),
            undefined,
            bundledContent,
          )
        },
      }),
    [content, dispatch, state],
  )

  return { state, content, contentReady, learningSummary, commands }
}
