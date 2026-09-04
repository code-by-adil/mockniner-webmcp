import type { IeltsCommands } from "@/application/ieltsCommands";
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import type { LearningSummary } from "@/domain/learningSummary";
import { createAssessmentAuthoringToolDefinitions } from "./assessmentTools";
import { createLearningToolDefinitions } from "./learningTools";
import { createIeltsAuthoringToolDefinitions } from "./ieltsAuthoringTools";
import type { ListeningAudioStatus } from '@/application/listeningAudioStatus';

type HomeAuthoringToolDependencies = {
  openPractice: import('./installedPractice').OpenInstalledPractice;
  installContent: IeltsCommands["installContent"];
  installAssessment: AssessmentApplicationCommands["installAssessment"];
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>;
  readListeningAudio: () => ListeningAudioStatus;
  includeAuthoringExamples?: (target: string) => boolean | Promise<boolean>;
};

export function createHomeToolDefinitions({
  installContent,
  openPractice,
  installAssessment,
  readLearningSummary,
  readListeningAudio,
  includeAuthoringExamples,
}: HomeAuthoringToolDependencies): WebMCP.ModelContextTool[] {
  return [
    ...createIeltsAuthoringToolDefinitions({ installContent, openPractice, readListeningAudio, includeAuthoringExamples }),
    ...createLearningToolDefinitions({ readLearningSummary }),
    ...createAssessmentAuthoringToolDefinitions({ installAssessment, openPractice, includeAuthoringExamples }),
  ];
}
