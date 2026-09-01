import type { ReactElement } from "react";
import { Check, ClipboardCheck, X } from "lucide-react";
import type {
  AssessmentItem,
  AssessmentResponse,
  AssessmentSubmission,
} from "@/domain/assessment";

function displayResponse(response: AssessmentResponse | undefined): string {
  if (response === undefined) return "No answer";
  if (typeof response === "string") return response || "No answer";
  if (Array.isArray(response)) return response.length ? response.join(", ") : "No answer";

  const entries = Object.entries(response);
  return entries.length
    ? entries.map(([key, value]) => `${key}: ${value}`).join(" · ")
    : "No answer";
}

function displayCorrectAnswer(item: AssessmentItem): string {
  switch (item.scoring.type) {
    case "exact":
      return item.scoring.answer;
    case "aliases":
      return item.scoring.answers.join(" / ");
    case "set":
      return item.scoring.answers.join(", ");
    case "numeric":
      return String(item.scoring.answer);
    case "mapping":
      return Object.entries(item.scoring.answers)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" · ");
    case "agent":
      return "Agent evaluation required";
  }
}

function resultIconClass(correct: boolean | null): string {
  if (correct === null) return "bg-amber-100 text-amber-700";
  return correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";
}

function ResultIcon({ correct }: { correct: boolean | null }): ReactElement {
  if (correct === null) return <ClipboardCheck size={16} />;
  return correct ? <Check size={16} /> : <X size={16} />;
}

export function AssessmentAnswerReview({
  submission,
}: {
  submission: AssessmentSubmission;
}): ReactElement {
  const itemById = new Map(
    submission.package.sections
      .flatMap((section) => section.modules.flatMap((module) => module.items))
      .map((item) => [item.id, item] as const),
  );

  return (
    <section className="mt-8 space-y-3">
      <h2 className="text-lg font-bold">Answer review</h2>
      {submission.result.itemResults.map((itemResult, index) => {
        const item = itemById.get(itemResult.itemId);
        if (!item) return null;

        const expectedAnswer = itemResult.correct === null && !itemResult.answered
          ? "No response to evaluate"
          : displayCorrectAnswer(item);

        return (
          <article
            key={itemResult.itemId}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                  Question {index + 1} · {itemResult.domain ?? "General"}
                </div>
                <div className="mt-2 text-sm text-neutral-700">
                  Your response:{" "}
                  <strong>{displayResponse(submission.responses[item.id])}</strong>
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                  Expected: {expectedAnswer}
                </div>
              </div>
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${resultIconClass(itemResult.correct)}`}
              >
                <ResultIcon correct={itemResult.correct} />
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
