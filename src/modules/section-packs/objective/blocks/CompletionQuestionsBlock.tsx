import {
  normalizeObjectiveCompletionBlock,
} from "../ui/objectiveRendering";
import { FlowchartCompletion } from "@/shared/ui/exam/FlowchartCompletion";
import { InlineCompletion, type InlineCompletionItem } from "@/shared/ui/exam/InlineCompletion";
import { InputAnswer } from "@/shared/ui/exam/InputAnswer";
import type {
  ObjectiveWebBlockRendererProps,
} from "@/modules/section-packs/objective/types/ObjectiveWebRenderContext";

export function CompletionQuestionsBlock({
  block,
  ctx,
}: ObjectiveWebBlockRendererProps<"completion_questions">) {
  const completion = normalizeObjectiveCompletionBlock(block);
  const rowGap = completion.density === "compact" ? "gap-2" : "gap-3";
  const renderInput = (
    questionId: number,
    answer: string | string[],
    width?: number,
  ) => (
    <InputAnswer
      questionNumber={questionId}
      value={ctx.answers[questionId] ?? ""}
      onChange={(value) => ctx.onAnswerChange(questionId, value)}
      widthPx={width}
      showQuestionNumberLabel
      isReviewMode={ctx.isReviewMode}
      correctAnswer={ctx.isReviewMode ? answer : undefined}
    />
  );

  if (completion.layout === "table") {
    const [prefixHeader, answerHeader, suffixHeader] = completion.columns;
    return (
      <div className="mb-8 overflow-x-auto rounded-sm border border-gray-300 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead className="bg-gray-100 text-left text-xs font-bold uppercase text-gray-600">
            <tr>
              <th className="border-b border-gray-300 px-4 py-3">{prefixHeader}</th>
              <th className="border-b border-gray-300 px-4 py-3">{answerHeader}</th>
              <th className="border-b border-gray-300 px-4 py-3">{suffixHeader}</th>
            </tr>
          </thead>
          <tbody>
            {block.items.map((item) => (
              <tr key={item.questionId} className="border-b border-gray-200 last:border-b-0">
                <td className="px-4 py-3 leading-6 text-gray-900">{item.prefix}</td>
                <td className="px-4 py-3">{renderInput(item.questionId, item.answer, item.width)}</td>
                <td className="px-4 py-3 leading-6 text-gray-700">{item.suffix ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (completion.layout === "flowchart") {
    return (
      <FlowchartCompletion
        title={block.title}
        items={block.items}
        density={completion.density}
        renderGap={(questionId, width) => {
          const item = block.items.find((candidate) => candidate.questionId === questionId);
          return item ? renderInput(questionId, item.answer, width) : null;
        }}
      />
    );
  }

  return (
    <div className={`mb-8 flex flex-col ${rowGap}`}>
      {block.items.map((item) => {
        const inlineItems: InlineCompletionItem[] = [
          item.prefix,
          {
            kind: "answer",
            questionNumber: item.questionId,
            value: ctx.answers[item.questionId] ?? "",
            onChange: (value) => ctx.onAnswerChange(item.questionId, value),
            isReviewMode: ctx.isReviewMode,
            correctAnswer: ctx.isReviewMode ? item.answer : undefined,
          },
          ...(item.suffix ? [item.suffix] : []),
        ];
        return (
          <InlineCompletion
            key={item.questionId}
            items={inlineItems}
            className="text-sm text-gray-900"
          />
        );
      })}
    </div>
  );
}
