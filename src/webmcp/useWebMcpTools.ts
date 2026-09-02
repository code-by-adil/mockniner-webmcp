import { useEffect, useLayoutEffect, useRef } from "react";
import type { IeltsCommands } from "@/application/ieltsCommands";
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import { reportHandledError } from "@/shared/reportHandledError";
import { createHomeToolDefinitions } from "./homeTools";
import {
  createWritingToolDefinitions,
  type WritingToolSurface,
} from "./writingTools";
import {
  createSpeakingToolDefinitions,
  type SpeakingToolSurface,
} from "./speakingTools";
import {
  createAssessmentToolDefinitions,
  type AssessmentToolSurface,
} from "./assessmentTools";

type WebMcpToolOptions = {
  commands: IeltsCommands;
  assessmentCommands: AssessmentApplicationCommands;
  currentWritingAttemptId?: string;
  currentSpeakingAttemptId?: string;
  currentAssessmentAttemptId?: string;
  assessmentToolSurface: AssessmentToolSurface;
  nativeAuthoringEnabled: boolean;
  writingToolSurface: WritingToolSurface;
  speakingToolSurface: SpeakingToolSurface;
  enabled: boolean;
};

const getIeltsRepository = async () =>
  (
    await import("@/infrastructure/database/ieltsRepository")
  ).getIeltsRepository();
const getAssessmentRepository = async () =>
  (
    await import("@/infrastructure/database/assessmentRepository")
  ).getAssessmentRepository();

export function useWebMcpTools(options: WebMcpToolOptions): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  }, [options]);
  const {
    enabled,
    nativeAuthoringEnabled,
    assessmentToolSurface,
    writingToolSurface,
    speakingToolSurface,
  } = options;
  useEffect(() => {
    if (!enabled || !document.modelContext) return;
    const modelContext = document.modelContext;
    const controller = new AbortController();
    const tools: WebMCP.ModelContextTool[] = [];
    if (nativeAuthoringEnabled && assessmentToolSurface === "authoring") {
      tools.push(
        ...createHomeToolDefinitions({
          installContent: (input) =>
            latest.current.commands.installContent(input),
          installAssessment: (input) =>
            latest.current.assessmentCommands.installAssessment(input),
          readLearningSummary: async (limit) =>
            (await getIeltsRepository()).readLearningSummary(limit),
        }),
      );
    }
    tools.push(
      ...createWritingToolDefinitions(
        {
          readWritingAttempt: async (id) =>
            (await getIeltsRepository()).readWritingAttempt(id),
          attachWritingEvaluation: (input) =>
            latest.current.commands.attachWritingEvaluation(input),
          getCurrentWritingAttemptId: () =>
            latest.current.currentWritingAttemptId,
        },
        writingToolSurface,
      ),
    );
    tools.push(
      ...createSpeakingToolDefinitions(
        {
          readSpeakingAttempt: async (id) =>
            (await getIeltsRepository()).readSpeakingAttempt(id),
          attachSpeakingEvaluation: (input) =>
            latest.current.commands.attachSpeakingEvaluation(input),
          getCurrentSpeakingAttemptId: () =>
            latest.current.currentSpeakingAttemptId,
        },
        speakingToolSurface,
      ),
    );
    if (
      assessmentToolSurface === "results" ||
      assessmentToolSurface === "evaluation"
    ) {
      tools.push(
        ...createAssessmentToolDefinitions(
          {
            installAssessment: (input) =>
              latest.current.assessmentCommands.installAssessment(input),
            readAssessmentAttempt: async (id) =>
              (await getAssessmentRepository()).readAttempt(id),
            attachEvaluation: (input) =>
              latest.current.assessmentCommands.attachEvaluation(input),
            getCurrentAttemptId: () =>
              latest.current.currentAssessmentAttemptId,
          },
          assessmentToolSurface,
        ),
      );
    }
    void Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool, { signal: controller.signal }),
      ),
    ).catch((error) => {
      if (!controller.signal.aborted)
        reportHandledError(error, { feature: "webmcp-tools" });
    });
    return () => controller.abort();
  }, [
    enabled,
    nativeAuthoringEnabled,
    assessmentToolSurface,
    writingToolSurface,
    speakingToolSurface,
  ]);
}
