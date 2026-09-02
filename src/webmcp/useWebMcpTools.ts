import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from 'react-dom';
import { createPracticeNavigation, getResumablePractices, type PracticeWorkspace } from '@/application/practiceNavigation';
import type { PracticeContentDocument } from '@/domain/contentDocument';
import { createPracticeTools } from './practiceTools';
import { createPracticeActivityTool } from './practiceActivityTool';
import { createListeningAudioRetryTool } from './listeningAudioTool';
import { createSpeakingInterviewController } from "@/application/speakingInterviewController";
import type { PracticeContext, VisibleSubmission } from '@/application/practiceContext';
import { createPracticeContextTool } from './practiceContextTool';
import { getPracticeProgress } from '@/application/practiceProgress';
import { createObjectiveReviewTool } from './objectiveReviewTool';
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
  context: PracticeContext;
  workspace: PracticeWorkspace;
  loadPracticeContent: (key: string) => Promise<PracticeContentDocument | null>;
  retryListeningAudio: () => void;
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
    const visibleAttemptId = (kind: VisibleSubmission['kind']) => latest.current.context.submissions.find(submission => submission.kind === kind)?.attemptId;
    const readContext = () => {
      const speaking = interview.read();
      return { ...latest.current.context, listeningAudio: latest.current.workspace.listeningAudio,
        progress: getPracticeProgress(latest.current.workspace, 'currentQuestion' in speaking ? speaking : undefined) };
    };
    const readListeningAudio = () => latest.current.workspace.listeningAudio;
    tools.push(createPracticeContextTool(readContext), createListeningAudioRetryTool(readListeningAudio, () => flushSync(() => latest.current.retryListeningAudio())));
    tools.push(createPracticeActivityTool(async input => {
      const [{ getLocalDatabase }, { readPracticeActivity }] = await Promise.all([
        import('@/infrastructure/database/client'), import('@/infrastructure/database/practiceActivity'),
      ]);
      return readPracticeActivity(await getLocalDatabase(), input);
    }));
    tools.push(createObjectiveReviewTool({
      readAttempt: async (id, section) => (await getIeltsRepository()).readObjectiveAttempt(id, section),
      loadContent: key => latest.current.loadPracticeContent(key),
      visibleId: section => visibleAttemptId(section),
    }));
    const navigation = createPracticeNavigation({
      canLeaveSpeaking: interview.canLeave,
      getWorkspace: () => latest.current.workspace,
      native: {
        start: (...args) => flushSync(() => latest.current.commands.start(...args)),
        resume: (...args) => flushSync(() => latest.current.commands.resume(...args)),
        goHome: () => flushSync(() => latest.current.commands.goHome()),
        installContent: (input) => latest.current.commands.installContent(input),
        openAttempt: (...args) => latest.current.commands.openAttempt(...args),
      },
      assessment: {
        start: (...args) => flushSync(() => latest.current.assessmentCommands.start(...args)),
        resume: () => flushSync(() => latest.current.assessmentCommands.resume()),
        goHome: () => flushSync(() => latest.current.assessmentCommands.goHome()),
        openAttempt: (...args) => latest.current.assessmentCommands.openAttempt(...args),
      },
      loadContent: key => latest.current.loadPracticeContent(key),
    });
    tools.push(...createPracticeTools({
      readLibrary: async input => {
        const [{ getLocalDatabase }, { readPracticeLibrary }] = await Promise.all([import('@/infrastructure/database/client'), import('@/infrastructure/database/practiceDiscovery')]);
        return readPracticeLibrary(await getLocalDatabase(), { ...latest.current.workspace, canLeaveSpeaking: interview.canLeave() }, input);
      },
      readHistory: async input => {
        const [{ getLocalDatabase }, { readPracticeHistory }] = await Promise.all([import('@/infrastructure/database/client'), import('@/infrastructure/database/practiceDiscovery')]);
        return readPracticeHistory(await getLocalDatabase(), input);
      },
      navigate: async input => ({ ...await navigation(input), view: latest.current.context.view, context: readContext() }),
    }));
    // Register once per document. Repeated contextual registration exhausts the
    // in-app browser's change budget. Preserve state restrictions at execution.
    const guard = (tool: WebMCP.ModelContextTool, available: () => boolean, message: string): WebMCP.ModelContextTool => ({
      ...tool,
      execute: (input, executionOptions) => available()
        ? tool.execute(input, executionOptions)
        : Promise.resolve(toolFailure('TOOL_NOT_AVAILABLE', message, true)),
    });
    const homeAvailable = () => latest.current.nativeAuthoringEnabled && latest.current.assessmentToolSurface === 'authoring';
    // Kits include answer-bearing examples that agents can install verbatim.
    // Paused drafts and drafts hidden behind history need the same protection.
    const authoringKitAvailable = () => getResumablePractices(latest.current.workspace).length === 0;
      tools.push(
        ...createHomeToolDefinitions({
          installContent: (input) =>
            latest.current.commands.installContent(input),
          readListeningAudio,
          installAssessment: (input) =>
            latest.current.assessmentCommands.installAssessment(input),
          readLearningSummary: async (limit) =>
            (await getIeltsRepository()).readLearningSummary(limit),
        }).map((tool) => tool.name === 'get_ielts_authoring_kit' || tool.name === 'get_assessment_authoring_kit'
          ? guard(tool, authoringKitAvailable, 'Authoring examples contain answer keys and are unavailable while any unfinished practice exists, including paused drafts. Finish the practice, or let the learner discard it in the interface, before requesting an authoring kit. Library, history and submission readers remain available.')
          : tool.annotations?.readOnlyHint ? tool : guard(tool, homeAvailable, 'Use open_practice with action library before installing practice.')),
      );
    tools.push(
      ...createWritingToolDefinitions(
        {
          readWritingAttempt: async (id) =>
            (await getIeltsRepository()).readWritingAttempt(id),
          attachWritingEvaluation: (input) =>
            latest.current.commands.attachWritingEvaluation(input),
          getCurrentWritingAttemptId: () =>
            visibleAttemptId('writing'),
        },
        'evaluation',
      ).map((tool) => guard(tool, () => tool.name.startsWith('attach_')
        ? latest.current.writingToolSurface === 'evaluation'
        : true,
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
            visibleAttemptId('speaking'),
        },
        'evaluation',
      ).map((tool) => guard(tool, () => tool.name.startsWith('attach_')
        ? latest.current.speakingToolSurface === 'evaluation'
        : true,
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
              visibleAttemptId('assessment'),
          },
          'evaluation',
        ).map((tool) => guard(tool, () => tool.name.startsWith('attach_')
          ? latest.current.assessmentToolSurface === 'evaluation'
          : true,
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
  return { bindSpeakingInterview: interview.bind, canLeaveSpeaking: interview.canLeave, registrationStatus: enabled && !document.modelContext ? 'unavailable' as const : registrationStatus };
}
