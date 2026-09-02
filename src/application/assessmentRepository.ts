import type {
  AssessmentEvaluation,
  AssessmentHistoryEntry,
  AssessmentPackage,
  AssessmentSubmission,
} from "@/domain/assessment";

export type InvalidAssessmentHandler = (
  error: Error,
  row: { kind: "package" | "attempt"; id: string },
) => void;
export type AssessmentRepository = {
  loadPackages: (
    onInvalid?: InvalidAssessmentHandler,
  ) => Promise<AssessmentPackage[]>;
  readHistory: (
    limit?: number,
    onInvalid?: InvalidAssessmentHandler,
  ) => Promise<AssessmentHistoryEntry[]>;
  savePackage: (assessment: AssessmentPackage) => Promise<void>;
  deletePackage: (packageId: string) => Promise<void>;
  saveAttempt: (
    submission: AssessmentSubmission,
  ) => Promise<AssessmentSubmission>;
  readAttempt: (
    attemptId?: string,
  ) => Promise<{
    submission: AssessmentSubmission;
    evaluation: AssessmentEvaluation | null;
  } | null>;
  saveEvaluation: (evaluation: AssessmentEvaluation) => Promise<void>;
};
