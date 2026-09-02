import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createSpeakingInterviewController } from "@/application/speakingInterviewController";
import { toolFailure } from './toolResult';
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
  createSpeakingInterviewToolDefinition,
  createSpeakingProgressToolDefinition,
  type SpeakingToolSurface,
} from "./speakingTools";
import {
  createAssessmentToolDefinitions,
  type AssessmentToolSurface,
} from "./assessmentTools";

export type WebMcpToolOptions = {
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

export type WebMcpRegistrationStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export function useWebMcpTools(options: WebMcpToolOptions) {
  const [interview] = useState(createSpeakingInterviewController);
  const [registrationStatus, setRegistrationStatus] = useState<WebMcpRegistrationStatus>('loading');
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  }, [options]);
  const { enabled } = options;
  useEffect(() => {
    if (!enabled) return;
    if (!document.modelContext) return;
    const modelContext = document.modelContext;
    const controller = new AbortController();
    const tools: WebMCP.ModelContextTool[] = [];
    // Register once per document. Repeated contextual registration exhausts the
    // in-app browser's change budget. Preserve state restrictions at execution.
    const guard = (tool: WebMCP.ModelContextTool, available: () => boolean, message: string): WebMCP.ModelContextTool => ({
      ...tool,
      execute: (input, executionOptions) => available()
        ? tool.execute(input, executionOptions)
        : Promise.resolve(toolFailure('TOOL_NOT_AVAILABLE', message, true)),
    });
    const homeAvailable = () => latest.current.nativeAuthoringEnabled && latest.current.assessmentToolSurface === 'authoring';
      tools.push(
        ...createHomeToolDefinitions({
          installContent: (input) =>
            latest.current.commands.installContent(input),
          installAssessment: (input) =>
            latest.current.assessmentCommands.installAssessment(input),
          readLearningSummary: async (limit) =>
            (await getIeltsRepository()).readLearningSummary(limit),
        }).map((tool) => guard(tool, homeAvailable, 'Return to the practice home screen to author practice or read the learning summary.')),
      );
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
        'evaluation',
      ).map((tool) => guard(tool, () => tool.name.startsWith('attach_')
        ? latest.current.writingToolSurface === 'evaluation'
        : latest.current.writingToolSurface !== 'none',
      'Open a submitted IELTS Writing attempt. Evaluation attachment requires the visible attempt to be awaiting evaluation.')),
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
        'evaluation',
      ).map((tool) => guard(tool, () => tool.name.startsWith('attach_')
        ? latest.current.speakingToolSurface === 'evaluation'
        : latest.current.speakingToolSurface !== 'none',
      'Open a submitted IELTS Speaking attempt. Evaluation attachment requires the visible attempt to be awaiting evaluation.')),
    );
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
          'evaluation',
        ).map((tool) => guard(tool, () => tool.name.startsWith('attach_')
          ? latest.current.assessmentToolSurface === 'evaluation'
          : ['results', 'evaluation'].includes(latest.current.assessmentToolSurface),
        'Open a submitted universal assessment. Evaluation attachment requires the visible attempt to be awaiting evaluation.')),
      );
    tools.push(createSpeakingInterviewToolDefinition(interview.configure), createSpeakingProgressToolDefinition(interview.read));
    void Promise.all(
      tools.map((tool) =>
        modelContext.registerTool(tool, { signal: controller.signal }),
      ),
    ).then(() => {
      if (!controller.signal.aborted) setRegistrationStatus('ready');
    }).catch((error) => {
      if (!controller.signal.aborted) {
        controller.abort();
        setRegistrationStatus('error');
        reportHandledError(error, { feature: "webmcp-tools" });
      }
    });
    return () => controller.abort();
  }, [enabled, interview]);
  return { bindSpeakingInterview: interview.bind, registrationStatus: enabled && !document.modelContext ? 'unavailable' as const : registrationStatus };
}
