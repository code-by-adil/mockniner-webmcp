import { useEffect, useMemo, useReducer } from 'react'
import { loadSession, saveSession, sessionReducer } from '@/domain/session'
import {
  createExamApplicationCommands,
  type ExamApplicationCommands,
} from './commands'

export function useExamApplication(): {
  state: ReturnType<typeof loadSession>
  commands: ExamApplicationCommands
} {
  const [state, dispatch] = useReducer(sessionReducer, undefined, loadSession)

  useEffect(() => {
    saveSession(state)
  }, [state])

  const commands = useMemo(
    () =>
      createExamApplicationCommands({
        getState: () => state,
        dispatch,
        getAttemptWriter: async () =>
          (await import('@/infrastructure/database/attemptWriter')).getAttemptWriter(),
      }),
    [dispatch, state],
  )

  return { state, commands }
}
