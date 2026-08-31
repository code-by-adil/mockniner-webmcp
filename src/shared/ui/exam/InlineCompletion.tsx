import React from "react";
import { InputAnswer } from "./InputAnswer";

/** List-layout completion: question number, prefix, blank, suffix in one flowing line. */
type InlineCompletionTextItem = {
  kind: "text";
  text: string;
  className?: string | undefined;
  fontWeight?: number | string | undefined;
};

type InlineCompletionAnswerItem = {
  kind: "answer";
  questionNumber: number;
  value: string;
  onChange: (value: string) => void;
  className?: string | undefined;
  isReviewMode?: boolean | undefined;
  correctAnswer?: string | string[] | undefined;
};

export type InlineCompletionItem =
  | string
  | InlineCompletionTextItem
  | InlineCompletionAnswerItem;

type InlineCompletionProps = {
  items: InlineCompletionItem[];
  className?: string | undefined;
};

type LayoutItem = InlineCompletionTextItem | InlineCompletionAnswerItem;

function normalizeItems(items: InlineCompletionItem[]): LayoutItem[] {
  return items.map((item): LayoutItem =>
    typeof item === "string" ? { kind: "text", text: item } : item,
  );
}

function parseLine(items: LayoutItem[]) {
  const answerIndex = items.findIndex((item) => item.kind === "answer");
  if (answerIndex < 0) {
    return {
      lead: items.filter(
        (item): item is InlineCompletionTextItem => item.kind === "text",
      ),
      answer: null as InlineCompletionAnswerItem | null,
      trail: [] as InlineCompletionTextItem[],
    };
  }

  return {
    lead: items
      .slice(0, answerIndex)
      .filter((item): item is InlineCompletionTextItem => item.kind === "text"),
    answer: items[answerIndex] as InlineCompletionAnswerItem,
    trail: items
      .slice(answerIndex + 1)
      .filter((item): item is InlineCompletionTextItem => item.kind === "text"),
  };
}

function withQuestionMarker(
  lead: InlineCompletionTextItem[],
  questionNumber: number,
): InlineCompletionTextItem[] {
  return [
    {
      kind: "text",
      text: `${questionNumber}.`,
      className:
        "exam-inline-question-number exam-inline-question-number--in-flow",
      fontWeight: 800,
    },
    ...lead,
  ];
}

function blankInputSize(item: InlineCompletionAnswerItem): number {
  const display =
    item.value.trim().length > 0
      ? item.value.trim()
      : item.questionNumber.toString();
  return Math.min(28, Math.max(8, (display.length + 1) * 2));
}

function renderTextPart(item: InlineCompletionTextItem, key: React.Key) {
  return (
    <span key={key} className={item.className} style={textStyle(item)}>
      {item.text}
    </span>
  );
}

function textStyle(item: InlineCompletionTextItem): React.CSSProperties | undefined {
  if (item.fontWeight == null) return undefined;
  return { fontWeight: item.fontWeight };
}

export const InlineCompletion: React.FC<InlineCompletionProps> = ({
  items,
  className = "",
}) => {
  const normalizedItems = React.useMemo(() => normalizeItems(items), [items]);
  const { lead, answer, trail } = React.useMemo(
    () => parseLine(normalizedItems),
    [normalizedItems],
  );

  if (!answer) {
    return (
      <p className={`exam-inline-completion ${className}`}>
        {normalizedItems.map((item, index) =>
          item.kind === "text" ? renderTextPart(item, index) : null,
        )}
      </p>
    );
  }

  const leadParts = withQuestionMarker(lead, answer.questionNumber);

  return (
    <p className={`exam-inline-completion ${className}`}>
      {leadParts.map((item, index) => renderTextPart(item, `lead-${index}`))}
      <InputAnswer
        questionNumber={answer.questionNumber}
        value={answer.value}
        onChange={answer.onChange}
        width=""
        inputSize={blankInputSize(answer)}
        className={`exam-inline-completion-answer ${answer.className ?? ""}`}
        isReviewMode={answer.isReviewMode}
        correctAnswer={answer.correctAnswer}
      />
      {trail.map((item, index) => renderTextPart(item, `trail-${index}`))}
    </p>
  );
};
