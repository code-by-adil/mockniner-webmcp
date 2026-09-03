import { createAssessmentCommands } from "@/application/assessmentCommands";
import { assessmentSessionReducer, initialAssessmentSession, type AssessmentSession } from "@/domain/assessmentSession";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SQLocal } from "sqlocal";
import { greStyleAssessment } from "@/content/gre";
import {
  gradeAssessment,
  type AssessmentEvaluationInput,
  type AssessmentPackage,
} from "@/domain/assessment";
import {
  createAssessmentRepository,
  readAssessmentAttempt,
  saveAssessmentAttempt,
  saveAssessmentPackage,
} from "@/infrastructure/database/assessmentRepository";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import { readHistoryPage } from '@/infrastructure/database/historyRepository';
import { AssessmentResults } from "@/modules/assessment-engine/ui/AssessmentResults";
import { createAssessmentToolDefinitions } from "@/webmcp/assessmentTools";

const attemptId = "88888888-8888-4888-8888-888888888888";
const essay =
  "Public institutions should publish evidence before major decisions because people need to understand the reasons for policies that affect them. Early disclosure also lets independent experts identify weak assumptions. Emergency decisions may require temporary confidentiality, but the institution should explain that limit and publish the evidence as soon as the immediate risk passes.";

const responses = {
  "gre-v1-reading-1": "b",
  "gre-v1-completion-3": { "blank-1": "b1-b", "blank-2": "b2-a" },
  "gre-v1-equivalence-1": ["b", "d"],
  "gre-q1-compare-2": "d",
  "gre-q1-multiple-2": ["d", "e"],
  "gre-q1-numeric-1": "25",
  "gre-q2-choice-6": "b",
  "gre-issue": essay,
};

const evaluationInput: AssessmentEvaluationInput = {
  attemptId,
  criteria: [
    {
      criterionId: "reasoning",
      score: 4,
      feedback: "The position is clear and includes a useful exception.",
      evidence: ["Emergency decisions may require temporary confidentiality"],
    },
    {
      criterionId: "development",
      score: 4,
      feedback: "The response identifies two concrete benefits of disclosure.",
      evidence: ["independent experts identify weak assumptions"],
    },
    {
      criterionId: "communication",
      score: 4,
      feedback: "The response is concise and easy to follow.",
      evidence: ["publish the evidence as soon as the immediate risk passes"],
    },
  ],
  summary: "A focused argument with a relevant qualification and clear organization.",
  strengths: ["Clear position", "Relevant qualification"],
  improvements: ["Develop one example in more detail"],
  annotations: [
    {
      itemId: "gre-issue",
      originalText: "identify weak assumptions",
      suggestion: "identify weak assumptions before implementation",
      explanation: "This makes the practical benefit more explicit.",
    },
  ],
};

const toolOptions = () => ({ signal: new AbortController().signal });

let database: SQLocal;

beforeAll(() => {
  vi.stubGlobal("Worker", class TestWorker {});
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  let resolveConnected!: () => void;
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });
  database = new SQLocal({
    databasePath: ":memory:",
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
    onConnect: resolveConnected,
  });
  await connected;
  await migrateDatabase(database);
});

afterEach(async () => {
  await database.destroy(true);
});

describe("mixed universal assessment workflow", () => {
  it("preserves one submission from local grading through durable agent evaluation", async () => {
    const assessment: AssessmentPackage = { ...greStyleAssessment, source: "agent" };
    await saveAssessmentPackage(database, assessment);
    const submission = await saveAssessmentAttempt(database, {
      attemptId,
      assessment,
      responses,
      result: gradeAssessment(assessment, responses),
      startedAt: "2026-09-02T10:00:00.000Z",
      submittedAt: "2026-09-02T10:40:00.000Z",
    });

    let state: AssessmentSession = { ...initialAssessmentSession, view: "result", submission };
    const commands = createAssessmentCommands({
      getState: () => state, getAssessments: () => [assessment],
      dispatch: (action) => { state = assessmentSessionReducer(state, action); },
      setAssessments: vi.fn(),
      getRepository: async () => createAssessmentRepository(database),
    });
    const tools = createAssessmentToolDefinitions({
      readAssessmentAttempt: (id) => readAssessmentAttempt(database, id),
      attachEvaluation: commands.attachEvaluation,
      getCurrentAttemptId: () => attemptId,
    });
    const submissionTool = tools.find((tool) => tool.name === "get_assessment_submission")!;
    const evaluationTool = tools.find((tool) => tool.name === "attach_assessment_evaluation")!;

    const submissionResult = await submissionTool.execute({}, toolOptions()) as {
      ok: true;
      data: {
        submission: { responses: typeof responses; package: { rubric: unknown } };
        evaluationStatus: string;
        canAttachEvaluation: boolean;
      };
    };
    expect(submissionResult).toMatchObject({
      ok: true,
      data: {
        evaluationStatus: "awaiting_evaluation",
        canAttachEvaluation: true,
        submission: {
          responses: { "gre-issue": essay },
          package: { rubric: expect.objectContaining({ criteria: expect.any(Array) }) },
        },
      },
    });
    expect(submission.result).toMatchObject({
      rawScore: 7,
      maximumScore: 54,
      answeredCount: 8,
      awaitingEvaluationCount: 1,
    });
    expect(JSON.stringify(submissionResult)).toContain('"scoring"'); // This package permits answer review.

    const invalidEvaluation = await evaluationTool.execute({
      ...evaluationInput,
      criteria: evaluationInput.criteria.map((criterion) => ({
        ...criterion,
        evidence: ["text that was never submitted"],
      })),
    }, toolOptions());
    expect(invalidEvaluation).toMatchObject({
      ok: false,
      error: {
        code: "EVALUATION_CONTRACT_MISMATCH",
        message: expect.stringContaining("was not found in the submitted responses"),
        retryable: true,
      },
    });
    await expect(readAssessmentAttempt(database, attemptId)).resolves.toMatchObject({ evaluation: null });

    const attached = await evaluationTool.execute(evaluationInput, toolOptions());
    expect(attached).toMatchObject({
      ok: true,
      data: { status: "saved", attemptId, overallScore: 4 },
      sideEffect: { visibleView: "assessment_results" },
    });
    expect(attached).not.toHaveProperty('data.rubricId');

    const duplicate = await evaluationTool.execute(evaluationInput, toolOptions());
    expect(duplicate).toEqual(attached);

    const restored = await readAssessmentAttempt(database, attemptId);
    expect(restored?.submission.responses["gre-issue"]).toBe(essay);
    expect(restored?.evaluation).toMatchObject(evaluationInput);
    expect((await readHistoryPage(database, { kind: 'assessment', limit: 10, offset: 0 })).items).toEqual([
      expect.objectContaining({ attemptId, evaluationStatus: "evaluated" }),
    ]);

    await saveAssessmentPackage(database, {
      ...assessment,
      revision: 3,
      title: "Revised GRE-style diagnostic",
    });
    const immutableAttempt = await readAssessmentAttempt(database, attemptId);
    expect(immutableAttempt?.submission.package).toMatchObject({
      revision: 1,
      title: "GRE-style full practice example",
    });

    const html = renderToStaticMarkup(
      <AssessmentResults
        submission={immutableAttempt!.submission}
        evaluation={immutableAttempt!.evaluation ?? undefined}
        onHome={() => undefined}
        review={null}
        onReviewChange={() => undefined}
      />,
    );
    const renderedText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(renderedText).toContain('Correct answers 7 / 54');
    expect(renderedText).toContain('Evaluation score 4 / 6');
    expect(html).toContain('Agent evaluation');
    expect(html).toContain("A focused argument with a relevant qualification");
    expect(html).toContain("identify weak assumptions before implementation");
    expect(html).toContain("not ETS scores or percentiles");
  });
});
