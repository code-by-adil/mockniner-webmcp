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

export type SpeakingToolSurface = "results" | "evaluation" | "none";

export function createSpeakingInterviewToolDefinition(configure: (input: SpeakingPlan) => unknown): WebMCP.ModelContextTool {
  return {
    name: 'set_ielts_speaking_interview',
    title: 'Set the complete Speaking interview',
    description: 'Install all 10–12 original questions at once in the visible Speaking setup screen. Include Parts 1 and 3 and exactly one Part 2 long turn with 60s preparation, 120s speaking and 3–4 cue points. The learner starts, records and submits each answer; audio and progression run locally without agent calls. Questions lock on start. Retrieve the complete transcript only after submission.',
    inputSchema: z.toJSONSchema(speakingPlanSchema, { target: 'draft-07' }),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input, options) => {
      throwIfCancelled(getToolExecutionSignal(options));
      const parsed = speakingPlanSchema.safeParse(input);
      if (!parsed.success) return toolFailure('INVALID_SPEAKING_PLAN', 'The interview plan is invalid.', true, zodIssues(parsed.error));
      try {
        return { ok: true, data: configure(parsed.data), sideEffect: { type: 'speaking_interview_configured', visibleView: 'speaking_setup' } };
      } catch (error) { return applicationFailure(error); }
    },
  };
}

export function createSpeakingProgressToolDefinition(readProgress: () => unknown): WebMCP.ModelContextTool {
  return {
    name: 'get_ielts_speaking_progress',
    title: 'Read Speaking interview progress',
    description: 'Read phase, question position and answered/skipped counts without transcripts. Optional observation only: the complete interview runs locally and never waits for polling or another agent question. After submission use get_ielts_speaking_submission.',
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
  surface: SpeakingToolSurface = "evaluation",
): WebMCP.ModelContextTool[] {
  const submissionTool: WebMCP.ModelContextTool = {
    name: "get_ielts_speaking_submission",
    title: "Read IELTS Speaking transcript",
    description:
      "Read the visible Speaking submission, all prompts, transcripts, durations and attached evaluation. Audio stays private. No parameters means the submission on screen. Use latest: true for the newest saved Speaking attempt, or attemptId for an exact historical attempt. Reading never changes the visible page.",
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
          evaluationStatus: stored.evaluation
            ? "evaluated"
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
      "Attach one structured transcript-based IELTS Speaking evaluation to the current immutable attempt. Use whole or half bands from 0 to 9 for overall, fluency/coherence, lexical resource, and grammatical range/accuracy. Pronunciation stays unscored because the agent receives transcripts, not audio. On success the application opens the Speaking review.",
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
        throwIfCancelled(signal);
        return {
          ok: true,
          data: {
            status: "attached",
            attemptId: evaluation.attemptId,
            overallBand: evaluation.overallBand,
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
  if (surface === "results") return [submissionTool];
  if (surface === "evaluation") return [submissionTool, evaluationTool];
  return [];
}
