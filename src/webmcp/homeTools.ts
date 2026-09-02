import type { IeltsCommands } from "@/application/ieltsCommands";
import type { AssessmentApplicationCommands } from "@/application/assessmentCommands";
import type { LearningSummary } from "@/domain/learningSummary";
import { createAssessmentAuthoringToolDefinitions } from "./assessmentTools";
import { createLearningToolDefinitions } from "./learningTools";
import { createIeltsAuthoringToolDefinitions } from "./ieltsAuthoringTools";

type HomeAuthoringToolDependencies = {
  installContent: IeltsCommands["installContent"];
  installAssessment: AssessmentApplicationCommands["installAssessment"];
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>;
};

export function createHomeToolDefinitions({
  installContent,
  installAssessment,
  readLearningSummary,
}: HomeAuthoringToolDependencies): WebMCP.ModelContextTool[] {
  return [
    ...createIeltsAuthoringToolDefinitions({ installContent }),
    ...createLearningToolDefinitions({ readLearningSummary }),
    ...createAssessmentAuthoringToolDefinitions({ installAssessment }),
  ];
}
