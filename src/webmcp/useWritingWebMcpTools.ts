import { useEffect, useRef } from "react";
import type { ExamApplicationCommands } from "@/application/commands";
import { reportWebHandledProductFailure } from "@/shared/observability/report-error";
import { createWritingToolDefinitions } from "./writingTools";

export function useWritingWebMcpTools(commands: ExamApplicationCommands): void {
  const attachWritingEvaluationRef = useRef(commands.attachWritingEvaluation);
  useEffect(() => {
    attachWritingEvaluationRef.current = commands.attachWritingEvaluation;
  }, [commands.attachWritingEvaluation]);

  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const register = async () => {
      const tools = createWritingToolDefinitions({
        readWritingAttempt: async (attemptId) => {
          const [{ getLocalDatabase }, { readWritingAttempt }] = await Promise.all([
            import("@/infrastructure/database/client"),
            import("@/infrastructure/database/attemptRepository"),
          ]);
          return readWritingAttempt(await getLocalDatabase(), attemptId);
        },
        attachWritingEvaluation: (input) => attachWritingEvaluationRef.current(input),
      });
      await Promise.all(tools.map((tool) =>
        modelContext.registerTool(tool, { signal: controller.signal }),
      ));
    };

    void register().catch((error) => {
      if (!controller.signal.aborted) {
        reportWebHandledProductFailure(error, { feature: "webmcp-writing-tools" });
      }
    });

    return () => controller.abort();
  }, []);
}
