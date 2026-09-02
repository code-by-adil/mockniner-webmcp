import type { IeltsCommands } from "@/application/ieltsCommands";
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import type { LearningSummary } from "@/domain/learningSummary";
import { createAssessmentAuthoringToolDefinitions } from "./assessmentTools";
import { createLearningToolDefinitions } from "./learningTools";
import { createIeltsAuthoringToolDefinitions } from "./ieltsAuthoringTools";
import type { ListeningAudioStatus } from '@/application/listeningAudioStatus';

type HomeAuthoringToolDependencies = {
  installContent: IeltsCommands["installContent"];
  installAssessment: AssessmentApplicationCommands["installAssessment"];
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>;
  readListeningAudio: () => ListeningAudioStatus;
};

export function createHomeToolDefinitions({
  installContent,
  installAssessment,
  readLearningSummary,
  readListeningAudio,
}: HomeAuthoringToolDependencies): WebMCP.ModelContextTool[] {
  return [
    ...createIeltsAuthoringToolDefinitions({ installContent, readListeningAudio }),
    ...createLearningToolDefinitions({ readLearningSummary }),
    ...createAssessmentAuthoringToolDefinitions({ installAssessment }),
  ];
}
