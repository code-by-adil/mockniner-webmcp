import { z } from "zod";
import { readSelectedSubmission, submissionSelectionSchema } from './submissionSelection';
import type { IeltsCommands } from "@/application/ieltsCommands";
import { speakingPlanSchema, type SpeakingPlan } from "@/domain/speakingPlan";
import type { SpeakingEvaluation, SpeakingSubmission } from "@/domain/types";
import { speakingEvaluationInputSchema } from "@/domain/speakingEvaluation";
import {
  applicationFailure,
  getToolExecutionSignal,
  throwIfCancelled,
  toolFailure,
  zodIssues,
} from "./toolResult";

type SpeakingToolDependencies = {
  readSpeakingAttempt: (attemptId?: string) => Promise<{
    submission: SpeakingSubmission;
    evaluation: SpeakingEvaluation | null;
  } | null>;
  attachSpeakingEvaluation: IeltsCommands["attachSpeakingEvaluation"];
  getCurrentSpeakingAttemptId: () => string | undefined;
};

export function createSpeakingInterviewToolDefinition(configure: (input: SpeakingPlan) => unknown): WebMCP.ModelContextTool {
  return {
    name: 'set_ielts_speaking_interview',
    title: 'Set the complete Speaking interview',
    description: 'Save all 10–12 original questions with the visible Speaking draft before reporting success; the plan survives reload and section switching. Include Parts 1 and 3 and one Part 2 long turn with 60s preparation, 120s speaking and 3–4 cue points. Questions lock when the learner starts. Audio and progression run locally. Retrieve transcripts only after submission.',
    inputSchema: z.toJSONSchema(speakingPlanSchema, { target: 'draft-07' }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options));
      const parsed = speakingPlanSchema.safeParse(input);
      if (!parsed.success) return toolFailure('INVALID_SPEAKING_PLAN', 'The interview plan is invalid.', true, zodIssues(parsed.error));
      try {
        return { ok: true, data: await configure(parsed.data), sideEffect: { type: 'speaking_interview_configured', visibleView: 'speaking_setup' } };
      } catch (error) { return applicationFailure(error); }
    },
  };
}

export function createSpeakingProgressToolDefinition(readProgress: () => unknown): WebMCP.ModelContextTool {
  return {
    name: 'get_ielts_speaking_progress',
    title: 'Read Speaking interview progress',
    description: 'Read the configured title, content key, phase, question position and answered/skipped counts without transcripts. Includes preparationStage (saving_plan, microphone_access, voice_and_recognition, or null), error and recoveryAction. Preparation may need a browser permission response or a model download. Empty setup can be paused through open_practice. After submission use get_ielts_speaking_submission.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options));
      const parsed = z.strictObject({}).safeParse(input);
      if (!parsed.success) return toolFailure('INVALID_INPUT', 'Speaking progress takes no parameters.', true, zodIssues(parsed.error));
      return { ok: true, data: readProgress() };
    },
  };
}

export function createSpeakingToolDefinitions(
  {
    readSpeakingAttempt,
    attachSpeakingEvaluation,
    getCurrentSpeakingAttemptId,
  }: SpeakingToolDependencies,
): WebMCP.ModelContextTool[] {
  const submissionTool: WebMCP.ModelContextTool = {
    name: "get_ielts_speaking_submission",
    title: "Read IELTS Speaking transcript",
    description:
      "For evaluation use begin_submission_evaluation first to show progress. Read the visible Speaking submission, all prompts, transcripts, durations and attached evaluation. Audio stays private. No parameters means the submission on screen. Use latest: true for the newest saved Speaking attempt, or attemptId for an exact historical attempt. Reading never changes the visible page.",
    inputSchema: submissionSelectionSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
      throwIfCancelled(signal);
      const selected = await readSelectedSubmission(input, readSpeakingAttempt, getCurrentSpeakingAttemptId, signal);
      if (!selected.ok) return selected;
      const { stored, requestedId, selection } = selected;
      if (!stored) {
        return toolFailure(
          "SPEAKING_SUBMISSION_NOT_FOUND",
          requestedId
            ? `Speaking attempt ${requestedId} was not found.`
            : "No submitted Speaking attempt is available yet.",
          true,
        );
      }
      return {
        ok: true,
        data: {
          selection,
          evaluation: stored.evaluation,
          submission: stored.submission,
          scoringScope: {
            supported: [
              "overall estimated band",
              "fluency and coherence",
              "lexical resource",
              "grammatical range and accuracy",
            ],
            excluded: ["pronunciation: audio is not exposed to the agent"],
          },
          evaluationGuidance: [
            "Read the complete transcript and base feedback on evidence in the submitted responses.",
            "Assess coherence, vocabulary and grammar. Text does not establish pronunciation or spoken delivery.",
            "Treat blank or skipped answers as missing evidence and allow for likely transcription errors.",
            "When the transcript provides insufficient evidence for band scores, use status insufficient_evidence and explain what further practice is needed.",
            "Attach the evaluation to this submission's attemptId so feedback appears with the saved interview.",
          ],
          evaluationStatus: stored.evaluation
            ? stored.evaluation.status === 'insufficient_evidence' ? 'insufficient_evidence' : 'evaluated'
            : "awaiting_evaluation",
          canAttachEvaluation:
            !stored.evaluation &&
            stored.submission.attemptId === getCurrentSpeakingAttemptId(),
        },
      };
    },
  };
  const evaluationTool: WebMCP.ModelContextTool = {
    name: "attach_ielts_speaking_evaluation",
    title: "Attach IELTS Speaking evaluation",
    description:
      "Attach feedback to the visible submitted Speaking attempt. Use status scored with whole/half bands 0–9 for overall and three criteria, or status insufficient_evidence with reason, summary, strengths (may be empty) and improvements, and omit all bands. Pronunciation is never scored from transcripts. Feedback is saved once and opens the review.",
    inputSchema: z.toJSONSchema(speakingEvaluationInputSchema, {
      target: "draft-07",
    }),
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input, options) => {
      const signal = getToolExecutionSignal(options);
      throwIfCancelled(signal);
      const parsed = speakingEvaluationInputSchema.safeParse(input);
      if (!parsed.success) {
        return toolFailure(
          "INVALID_EVALUATION",
          "The Speaking evaluation does not satisfy the transcript-based scoring contract.",
          true,
          zodIssues(parsed.error),
        );
      }
      try {
        const evaluation = await attachSpeakingEvaluation(parsed.data);
        return {
          ok: true,
          data: {
            status: "attached",
            attemptId: evaluation.attemptId,
            evaluationStatus: evaluation.status === 'insufficient_evidence' ? 'insufficient_evidence' : 'evaluated',
            ...(evaluation.status !== 'insufficient_evidence' ? { overallBand: evaluation.overallBand } : {}),
            evaluatedAt: evaluation.evaluatedAt,
          },
          sideEffect: {
            type: "speaking_evaluation_attached",
            visibleView: "speaking_review",
          },
        };
      } catch (error) {
        return applicationFailure(error);
      }
    },
  };
  return [submissionTool, evaluationTool];
}
