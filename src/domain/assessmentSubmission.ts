import type { AssessmentPackage } from "./assessmentContract";
import type {
  AssessmentResponseMap,
  AssessmentResult,
} from "./assessmentScoring";

export type AssessmentSubmission = {
  attemptId: string;
  packageId: string;
  package: AssessmentPackage;
  responses: AssessmentResponseMap;
  result: AssessmentResult;
  startedAt: string;
  submittedAt: string;
};

export type AssessmentEvaluationStatus =
  | "not_required"
  | "awaiting_evaluation"
  | "evaluated";

export type AssessmentHistoryEntry = {
  attemptId: string;
  packageId: string;
  title: string;
  rawScore: number;
  maximumScore: number;
  evaluationStatus: AssessmentEvaluationStatus;
  submittedAt: string;
};
