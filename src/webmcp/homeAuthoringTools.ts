import type { ExamApplicationCommands } from "@/application/commands";
import type { AssessmentApplicationCommands } from "@/application/useAssessmentApplication";
import type { LearningSummary } from "@/domain/learningSummary";
import { createAssessmentAuthoringToolDefinitions } from "./assessmentTools";
import { createLearningToolDefinitions } from "./learningTools";
import { createPracticeToolDefinitions } from "./practiceTools";

type HomeAuthoringToolDependencies = {
  installContent: ExamApplicationCommands["installContent"];
  installAssessment: AssessmentApplicationCommands["installAssessment"];
  readLearningSummary: (recentLimit: number) => Promise<LearningSummary>;
};

export function createHomeAuthoringToolDefinitions({
  installContent,
  installAssessment,
  readLearningSummary,
}: HomeAuthoringToolDependencies): WebMCP.ModelContextTool[] {
  return [
    ...createPracticeToolDefinitions({ installContent }),
    ...createLearningToolDefinitions({ readLearningSummary }),
    ...createAssessmentAuthoringToolDefinitions({ installAssessment }),
  ];
}
