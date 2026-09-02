import React from "react";
import { canAssignDragOption } from "@/shared/ui/exam/dragOptions";
import { useExamProximityDropLayer } from "@/shared/ui/exam/examProximityDrop";
import {
  MatchingAnswerSlot,
  MatchingDraggableOption,
  MatchingQuestionSet,
} from "@/shared/ui/exam/matchingChoice";
import type { ObjectiveBlockProps } from "@/modules/ielts/objective/types/ObjectiveRenderProps";
import { findCorrectAnswer } from "./helpers";

type MatchingBlockType =
  "feature_matching_questions" | "heading_matching_questions";
type MatchingBlock = ObjectiveBlockProps<MatchingBlockType>["block"];
type HeadingMatchingBlock =
  ObjectiveBlockProps<"heading_matching_questions">["block"];
type PassageBlock = ObjectiveBlockProps<"passage">["block"];

function matchingOptionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function getMatchingGroupId(block: MatchingBlock, index: number) {
  return `${block.type}-${index}`;
}

function formatOptionDisplay(option: string, index: number) {
  return `${matchingOptionLetter(index)}. ${option}`;
}

function getOptionDisplayByValue(block: MatchingBlock) {
  const map = new Map<string, string>();
  block.options.forEach((option, index) => {
    map.set(option, formatOptionDisplay(option, index));
  });
  return map;
}

function getUsedAnswers(
  block: MatchingBlock,
  answers: Record<number, string | undefined>,
) {
  return new Set(
    block.questions
      .map((question) => answers[question.questionId])
      .filter((answer): answer is string => Boolean(answer)),
  );
}

function MatchingQuestionsBlock({
  block,
  ctx,
  index,
}: {
  block: MatchingBlock;
  ctx: ObjectiveBlockProps<MatchingBlockType>["ctx"];
  index: number;
}) {
  const groupId = getMatchingGroupId(block, index);
  const usedAnswers = getUsedAnswers(block, ctx.answers);

  return (
    <div className="mb-8">
      <MatchingQuestionSet
        title={block.title}
        groupId={groupId}
        questions={block.questions}
        options={block.options}
        answers={ctx.answers}
        onAnswerChange={ctx.onAnswerChange}
        isReviewMode={ctx.isReviewMode}
        placeholder={block.placeholder}
        usedAnswers={usedAnswers}
        optionLabel={matchingOptionLetter}
        getCorrectAnswer={(questionId) =>
          ctx.isReviewMode
            ? findCorrectAnswer(block.questions, questionId)
            : undefined
        }
      />
    </div>
  );
}

export function HeadingMatchingPassageBlock({
  passage,
  headingBlock,
  headingBlockIndex,
  ctx,
}: {
  passage: PassageBlock;
  headingBlock: HeadingMatchingBlock;
  headingBlockIndex: number;
  ctx: ObjectiveBlockProps<"heading_matching_questions">["ctx"];
}) {
  const { onAnswerChange } = ctx;
  const groupId = getMatchingGroupId(headingBlock, headingBlockIndex);
  const optionDisplayByValue = React.useMemo(
    () => getOptionDisplayByValue(headingBlock),
    [headingBlock],
  );
  const slotsFrameRef = React.useRef<HTMLElement>(null);
  const slotHostRefs = React.useRef(new Map<number, HTMLDivElement>());
  const dragEnabled = ctx.isReviewMode !== true;
  const dragOptions = React.useMemo(() => {
    const used = getUsedAnswers(headingBlock, ctx.answers);
    return headingBlock.options.map((value, index) => ({
      value,
      label: formatOptionDisplay(value, index),
      isUsed: used.has(value),
      isReviewMode: ctx.isReviewMode,
    }));
  }, [headingBlock, ctx.answers, ctx.isReviewMode]);

  const canAssignToSlot = React.useCallback(
    (questionId: number, value: string) => {
      const currentValue = ctx.answers[questionId] ?? "";
      return canAssignDragOption(dragOptions, value, currentValue);
    },
    [ctx.answers, dragOptions],
  );

  const {
    proximitySlotId,
    caughtSlotId,
    registerSlotHost,
    dropFrameHandlers,
    flashCaughtSlot,
  } = useExamProximityDropLayer({
    groupId,
    dragEnabled,
    dropFrameRef: slotsFrameRef,
    slotHostRefs,
    canAssignToSlot,
    onAssign: onAnswerChange,
    dropSnapPx: 16,
    dropReleaseSnapPx: 30,
    dropMaxEdgePx: 14,
  });

  const handleSlotAssign = React.useCallback(
    (questionId: number, value: string) => {
      onAnswerChange(questionId, value);
      if (value) flashCaughtSlot(questionId);
    },
    [onAnswerChange, flashCaughtSlot],
  );

  return (
    <article
      ref={slotsFrameRef}
      className="space-y-5 text-sm leading-7 text-gray-900"
      {...dropFrameHandlers}
    >
      <h3 className="text-lg font-bold leading-7 text-gray-950">
        {passage.title}
      </h3>
      {passage.paragraphs.map((paragraph, paragraphIndex) => {
        const question = headingBlock.questions.find(
          (candidate) => candidate.paragraphIndex === paragraphIndex,
        );
        if (!question) {
          return <p key={paragraphIndex}>{paragraph}</p>;
        }

        const answerValue = ctx.answers[question.questionId];
        const displayValue = answerValue
          ? optionDisplayByValue.get(answerValue)
          : undefined;

        return (
          <section key={question.questionId} className="space-y-2.5">
            <div
              ref={registerSlotHost(question.questionId)}
              className="w-full max-w-[44rem]"
            >
              <MatchingAnswerSlot
                options={dragOptions}
                id={question.questionId}
                groupId={groupId}
                value={answerValue}
                displayValue={displayValue}
                onDrop={(value) => handleSlotAssign(question.questionId, value)}
                onClear={() => onAnswerChange(question.questionId, "")}
                placeholder={String(question.questionId)}
                isReviewMode={ctx.isReviewMode}
                correctAnswer={ctx.isReviewMode ? question.answer : undefined}
                proximityActive={proximitySlotId === question.questionId}
                catchFlash={caughtSlotId === question.questionId}
              />
            </div>
            <p>{paragraph}</p>
          </section>
        );
      })}
    </article>
  );
}

export function HeadingMatchingOptionsBlock({
  block,
  ctx,
  index,
}: ObjectiveBlockProps<"heading_matching_questions">) {
  const groupId = getMatchingGroupId(block, index);
  const usedAnswers = getUsedAnswers(block, ctx.answers);

  return (
    <section className="mb-8 min-w-0">
      {block.title ? (
        <p className="mb-2 min-h-[1.125rem] text-sm font-bold leading-snug text-[color:var(--exam-text)]">
          {block.title}
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {block.options.map((option, optionIndex) => (
          <li key={option}>
            <div className="w-full max-w-[42rem]">
              <MatchingDraggableOption
                text={formatOptionDisplay(option, optionIndex)}
                value={option}
                groupId={groupId}
                isUsed={usedAnswers.has(option)}
                isReviewMode={ctx.isReviewMode === true}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FeatureMatchingQuestionsBlock(
  props: ObjectiveBlockProps<"feature_matching_questions">,
) {
  return <MatchingQuestionsBlock {...props} />;
}

export function HeadingMatchingQuestionsBlock(
  props: ObjectiveBlockProps<"heading_matching_questions">,
) {
  return <MatchingQuestionsBlock {...props} />;
}
