import { useEffect, useRef } from "react";
import type { ExamApplicationCommands } from "@/application/commands";
import type { AssessmentApplicationCommands } from "@/application/useAssessmentApplication";
import { reportWebHandledProductFailure } from "@/shared/observability/report-error";
import { createHomeAuthoringToolDefinitions } from "./homeAuthoringTools";
import { createWritingToolDefinitions } from "./writingTools";
import type { WritingToolSurface } from "./writingTools";
import { createSpeakingToolDefinitions } from "./speakingTools";
import type { SpeakingToolSurface } from "./speakingTools";
import { createAssessmentToolDefinitions } from "./assessmentTools";
import type { AssessmentToolSurface } from "./assessmentTools";

type WebMcpToolOptions = {
  commands: ExamApplicationCommands;
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

async function registerTools(
  modelContext: WebMCP.ModelContext,
  tools: WebMCP.ModelContextTool[],
  signal: AbortSignal,
): Promise<void> {
  await Promise.all(tools.map((tool) => modelContext.registerTool(tool, { signal })));
}

function reportRegistrationFailure(error: unknown, signal: AbortSignal): void {
  if (!signal.aborted) {
    reportWebHandledProductFailure(error, { feature: "webmcp-tools" });
  }
}

export function useWebMcpTools({
  commands,
  assessmentCommands,
  currentWritingAttemptId,
  currentSpeakingAttemptId,
  currentAssessmentAttemptId,
  assessmentToolSurface,
  nativeAuthoringEnabled,
  writingToolSurface,
  speakingToolSurface,
  enabled,
}: WebMcpToolOptions): void {
  const installContentRef = useRef(commands.installContent);
  const attachWritingEvaluationRef = useRef(commands.attachWritingEvaluation);
  const currentWritingAttemptIdRef = useRef(currentWritingAttemptId);
  const attachSpeakingEvaluationRef = useRef(commands.attachSpeakingEvaluation);
  const currentSpeakingAttemptIdRef = useRef(currentSpeakingAttemptId);
  const installAssessmentRef = useRef(assessmentCommands.installAssessment);
  const attachAssessmentEvaluationRef = useRef(assessmentCommands.attachEvaluation);
  const currentAssessmentAttemptIdRef = useRef(currentAssessmentAttemptId);

  useEffect(() => {
    installContentRef.current = commands.installContent;
    attachWritingEvaluationRef.current = commands.attachWritingEvaluation;
    currentWritingAttemptIdRef.current = currentWritingAttemptId;
    attachSpeakingEvaluationRef.current = commands.attachSpeakingEvaluation;
    currentSpeakingAttemptIdRef.current = currentSpeakingAttemptId;
    installAssessmentRef.current = assessmentCommands.installAssessment;
    attachAssessmentEvaluationRef.current = assessmentCommands.attachEvaluation;
    currentAssessmentAttemptIdRef.current = currentAssessmentAttemptId;
  }, [
    commands.installContent,
    commands.attachWritingEvaluation,
    commands.attachSpeakingEvaluation,
    currentWritingAttemptId,
    currentSpeakingAttemptId,
    assessmentCommands.installAssessment,
    assessmentCommands.attachEvaluation,
    currentAssessmentAttemptId,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      (!nativeAuthoringEnabled && writingToolSurface === "none" && speakingToolSurface === "none")
    )
      return;
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const register = async () => {
      const readWritingAttempt = async (attemptId?: string) => {
        const [{ getLocalDatabase }, repository] = await Promise.all([
          import("@/infrastructure/database/client"),
          import("@/infrastructure/database/attemptRepository"),
        ]);
        return repository.readWritingAttempt(await getLocalDatabase(), attemptId);
      };
      const nativeTools: WebMCP.ModelContextTool[] = [];
      if (nativeAuthoringEnabled && assessmentToolSurface === "authoring") {
        nativeTools.push(
          ...createHomeAuthoringToolDefinitions({
            installContent: (input) => installContentRef.current(input),
            installAssessment: (input) => installAssessmentRef.current(input),
            readLearningSummary: async (recentLimit) => {
              const [{ getLocalDatabase }, repository] = await Promise.all([
                import("@/infrastructure/database/client"),
                import("@/infrastructure/database/attemptRepository"),
              ]);
              return repository.readLearningSummary(await getLocalDatabase(), recentLimit);
            },
          }),
        );
      }
      nativeTools.push(
        ...createWritingToolDefinitions(
          {
            readWritingAttempt,
            attachWritingEvaluation: (input) => attachWritingEvaluationRef.current(input),
            getCurrentWritingAttemptId: () => currentWritingAttemptIdRef.current,
          },
          writingToolSurface,
        ),
      );
      nativeTools.push(
        ...createSpeakingToolDefinitions(
          {
            readSpeakingAttempt: async (attemptId) => {
              const [{ getLocalDatabase }, repository] = await Promise.all([
                import("@/infrastructure/database/client"),
                import("@/infrastructure/database/speakingRepository"),
              ]);
              return repository.readSpeakingAttempt(await getLocalDatabase(), attemptId);
            },
            attachSpeakingEvaluation: (input) => attachSpeakingEvaluationRef.current(input),
            getCurrentSpeakingAttemptId: () => currentSpeakingAttemptIdRef.current,
          },
          speakingToolSurface,
        ),
      );
      await registerTools(modelContext, nativeTools, controller.signal);
    };

    void register().catch((error) => reportRegistrationFailure(error, controller.signal));

    return () => controller.abort();
  }, [
    assessmentToolSurface,
    enabled,
    nativeAuthoringEnabled,
    speakingToolSurface,
    writingToolSurface,
  ]);

  useEffect(() => {
    if (
      !enabled ||
      assessmentToolSurface === "none" ||
      assessmentToolSurface === "authoring"
    )
      return;
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const register = async () => {
      const assessmentTools = createAssessmentToolDefinitions(
        {
          installAssessment: (input) => installAssessmentRef.current(input),
          readAssessmentAttempt: async (attemptId) => {
            const [{ getLocalDatabase }, repository] = await Promise.all([
              import("@/infrastructure/database/client"),
              import("@/infrastructure/database/assessmentRepository"),
            ]);
            return repository.readAssessmentAttempt(await getLocalDatabase(), attemptId);
          },
          attachEvaluation: (input) => attachAssessmentEvaluationRef.current(input),
          getCurrentAttemptId: () => currentAssessmentAttemptIdRef.current,
        },
        assessmentToolSurface,
      );
      await registerTools(modelContext, assessmentTools, controller.signal);
    };

    void register().catch((error) => reportRegistrationFailure(error, controller.signal));
    return () => controller.abort();
  }, [assessmentToolSurface, enabled]);
}
