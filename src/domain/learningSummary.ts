type RecentObjectivePerformance = {
  attemptId: string
  contentKey: string
  band: number
  raw: number
  total: 40
  answered: number
  submittedAt: string
}

export type ObjectiveLearningSummary = {
  attemptCount: number
  recentAverageBand: number | null
  recent: RecentObjectivePerformance[]
}

export type WritingCriteriaSummary = {
  taskAchievement: number
  coherenceCohesion: number
  lexicalResource: number
  grammaticalRange: number
}

type RecentWritingPerformance = {
  attemptId: string
  contentKey: string
  status: 'submitted' | 'evaluated'
  overallBand?: number
  criteria?: WritingCriteriaSummary
  submittedAt: string
}

type WritingLearningSummary = {
  attemptCount: number
  evaluatedCount: number
  recentAverageOverallBand: number | null
  recentAverageCriteria: WritingCriteriaSummary | null
  recent: RecentWritingPerformance[]
}

export type LearningSummary = {
  totalAttempts: number
  sections: {
    listening: ObjectiveLearningSummary
    reading: ObjectiveLearningSummary
    writing: WritingLearningSummary
    speaking: {
      attemptCount: number
      recent?: { attemptId: string; submittedAt: string; overallBand?: number; evaluationStatus?: 'evaluated' | 'insufficient_evidence' | 'awaiting_evaluation' }[]
    }
  }
}
