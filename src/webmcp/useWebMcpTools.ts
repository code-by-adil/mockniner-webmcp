import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from 'react-dom';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { createPracticeNavigation, type PracticeWorkspace } from '@/application/practiceNavigation';
import type { PracticeContentDocument } from '@/domain/contentDocument';
import { createPracticeTools } from './practiceTools';
import { createPracticeActivityTool } from './practiceActivityTool';
import { createListeningAudioRetryTool } from './listeningAudioTool';
import { createSpeakingInterviewController } from "@/application/speakingInterviewController";
import type { PracticeContext, VisibleSubmission } from '@/application/practiceContext';
import { createPracticeContextTool } from './practiceContextTool';
import { getPracticeProgress } from '@/application/practiceProgress';
import { createObjectiveReviewTool } from './objectiveReviewTool';
import { createObjectiveExplanationTool } from './objectiveExplanationTool';
import { createAssessmentContentTool } from './assessmentContentTool';
import { getToolExecutionSignal, throwIfCancelled, toolFailure } from './toolResult';
import { getToolAvailability, includeAuthoringExamples, summarizeToolAvailability } from './toolAvailability';
import type { IeltsCommands } from "@/application/ieltsCommands";
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import { reportHandledError } from "@/shared/reportHandledError";
import { createHomeToolDefinitions } from "./homeTools";
import {
  createWritingToolDefinitions,
} from "./writingTools";
import {
  createSpeakingToolDefinitions,
  createSpeakingInterviewToolDefinition,
  createSpeakingProgressToolDefinition,
} from "./speakingTools";
import {
  createAssessmentToolDefinitions,
} from "./assessmentTools";

export type WebMcpToolOptions = {
  commands: IeltsCommands;
  assessmentCommands: AssessmentApplicationCommands;
  context: PracticeContext;
  workspace: PracticeWorkspace;
  loadPracticeContent: (key: string) => Promise<PracticeContentDocument | null>;
  retryListeningAudio: () => void;
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
  // oxlint-disable-next-line react/refs -- The factory stores callbacks; refs are read only when a command runs.
  const [navigation] = useState(() => createPracticeNavigation({
    canLeaveSpeaking: interview.canLeave,
    getWorkspace: () => latest.current.workspace,
    native: {
      start: (...args) => latest.current.commands.start(...args),
      resume: (...args) => latest.current.commands.resume(...args),
      goHome: () => latest.current.commands.goHome(),
      installContent: input => latest.current.commands.installContent(input),
      openAttempt: (...args) => latest.current.commands.openAttempt(...args),
    },
    assessment: {
      start: (...args) => latest.current.assessmentCommands.start(...args),
      resume: () => latest.current.assessmentCommands.resume(),
      goHome: () => latest.current.assessmentCommands.goHome(),
      openAttempt: (...args) => latest.current.assessmentCommands.openAttempt(...args),
    },
    loadContent: key => latest.current.loadPracticeContent(key),
  }));
  const { enabled } = options;
  useEffect(() => {
    if (!enabled) return;
    if (typeof document.modelContext?.registerTool !== 'function') return;
    const modelContext = document.modelContext;
    const controller = new AbortController();
    const tools: WebMCP.ModelContextTool[] = [];
    const visibleAttemptId = (kind: VisibleSubmission['kind']) => latest.current.context.submissions.find(submission => submission.kind === kind)?.attemptId;
    const readAvailability = () => getToolAvailability(latest.current, interview.read(), interview.canLeave());
    const readContext = () => {
      const speaking = interview.read();
      return { ...latest.current.context, listeningAudio: latest.current.workspace.listeningAudio,
        capabilities: summarizeToolAvailability(readAvailability(), includeAuthoringExamples(latest.current.workspace)),
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
      readExplanations: async id => (await getIeltsRepository()).readObjectiveExplanations(id),
      readAttempt: async (id, section) => (await getIeltsRepository()).readObjectiveAttempt(id, section),
      loadContent: key => latest.current.loadPracticeContent(key),
      visibleId: section => visibleAttemptId(section),
    }));
    tools.push(createObjectiveExplanationTool(input => latest.current.commands.saveObjectiveExplanation(input)));
    tools.push(createAssessmentContentTool(() => latest.current.workspace));
    tools.push(...createPracticeTools({
      readLibrary: async input => {
        const [{ getLocalDatabase }, { readPracticeLibrary }] = await Promise.all([import('@/infrastructure/database/client'), import('@/infrastructure/database/practiceDiscovery')]);
        return readPracticeLibrary(await getLocalDatabase(), { ...latest.current.workspace, canLeaveSpeaking: interview.canLeave() }, input);
      },
      readHistory: async input => {
        const [{ getLocalDatabase }, { readPracticeHistory }] = await Promise.all([import('@/infrastructure/database/client'), import('@/infrastructure/database/practiceDiscovery')]);
        return readPracticeHistory(await getLocalDatabase(), input);
      },
      navigate: async (input, execution) => ({ ...await navigation(input, execution), view: latest.current.context.view, context: readContext() }),
    }));
    // Kits include answer-bearing examples that agents can install verbatim.
    // Paused drafts and drafts hidden behind history need the same protection.
    tools.push(
      ...createHomeToolDefinitions({
        openPractice: navigation,
        includeAuthoringExamples: () => includeAuthoringExamples(latest.current.workspace),
        installContent: (input) => latest.current.commands.installContent(input),
        readListeningAudio,
        installAssessment: (input) => latest.current.assessmentCommands.installAssessment(input),
        readLearningSummary: async (limit) => (await getIeltsRepository()).readLearningSummary(limit),
      }),
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
            visibleAttemptId('speaking'),
        },
      ),
    );
    tools.push(
      ...createAssessmentToolDefinitions(
        {
          readAssessmentAttempt: async (id) => (await getAssessmentRepository()).readAttempt(id),
          attachEvaluation: (input) => latest.current.assessmentCommands.attachEvaluation(input),
          getCurrentAttemptId: () => visibleAttemptId('assessment'),
        },
      ),
    );
    tools.push(createSpeakingInterviewToolDefinition(interview.configure), createSpeakingProgressToolDefinition(interview.read));
    // Register once per document. Repeated contextual registration exhausts the
    // in-app browser's change budget. Discovery and execution share live guards.
    void Promise.all(
      tools.map((tool) =>
        modelContext.registerTool({ ...tool, execute: async (input, options) => {
          const signal = getToolExecutionSignal(options);
          throwIfCancelled(signal);
          const checkAvailability = () => {
            const availability = readAvailability()[tool.name];
            if (!availability) throw new Error(`Missing availability policy for ${tool.name}.`);
            return availability.status === 'blocked' ? toolFailure(availability.code, availability.message, true) : null;
          };
          const blocked = checkAvailability();
          if (blocked) return blocked;
          if (tool.annotations?.readOnlyHint) return tool.execute(input, options);
          try {
            await draftSaves.flush();
            throwIfCancelled(signal);
            const blockedAfterSave = checkAvailability();
            if (blockedAfterSave) return blockedAfterSave;
            const result = await tool.execute(input, options);
            await draftSaves.flush();
            return result;
          } catch (error) {
            if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
            return toolFailure('SAVE_FAILED', error instanceof Error ? error.message : 'Changes could not be saved. Retry saving in the page.', true);
          }
        } }, { signal: controller.signal }),
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
  }, [enabled, interview, navigation]);
  const status: WebMcpRegistrationStatus = !enabled ? 'loading'
    : typeof document.modelContext?.registerTool !== 'function' ? 'unavailable' : registrationStatus;
  return { navigate: navigation, bindSpeakingInterview: interview.bind, canLeaveSpeaking: interview.canLeave, registrationStatus: status };
}
