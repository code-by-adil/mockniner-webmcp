import type { SpeakingSubmission } from '@/domain/types'

export type AgentSpeakingTurnInput =
  | {
      examinerText: string
      part: 1 | 2 | 3
      responseTimeSeconds: number
      finishInterview: false
    }
  | {
      examinerText: string
      finishInterview: true
    }

export type AgentSpeakingTurnResult =
  | {
      status: 'answer_received'
      turnNumber: number
      part: 1 | 2 | 3
      transcript: string
      durationMs: number
    }
  | {
      status: 'interview_completed'
      submission: SpeakingSubmission
    }

export type AgentSpeakingTurnHandler = (
  input: AgentSpeakingTurnInput,
  signal: AbortSignal,
) => Promise<AgentSpeakingTurnResult>

export type AgentSpeakingTurnErrorCode =
  | 'SPEAKING_AUDIO_NOT_PREPARED'
  | 'SPEAKING_TURN_IN_PROGRESS'
  | 'SPEAKING_NO_RESPONSES'

export class AgentSpeakingTurnError extends Error {
  readonly code: AgentSpeakingTurnErrorCode

  constructor(
    code: AgentSpeakingTurnErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AgentSpeakingTurnError'
    this.code = code
  }
}
