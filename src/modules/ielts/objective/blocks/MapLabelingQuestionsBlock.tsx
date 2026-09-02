import React from "react";
import type { ObjectiveMapAnswerSlotElement } from "@/domain/objectiveContent";
import { useIsCompactExamLayout } from "@/hooks/useExamLayout";
import { DraggableItem } from "@/shared/ui/exam/DraggableItem";
import { DropZone } from "@/shared/ui/exam/DropZone";
import { InputAnswer } from "@/shared/ui/exam/InputAnswer";
import {
  canAssignDragOption,
  type DragOption,
} from "@/shared/ui/exam/dragOptions";
import { useExamProximityDropLayer } from "@/shared/ui/exam/examProximityDrop";
import type { ObjectiveBlockProps } from "@/modules/ielts/objective/types/ObjectiveRenderProps";
import { findCorrectAnswer } from "./helpers";
import { MapPrimitiveScene } from "./MapPrimitiveScene";
import {
  getFullMapViewBox,
  getMapTightViewBox,
  type MapViewBoxRect,
} from "./mapDisplayViewBox";

const DEFAULT_SLOT_WIDTH = 176;
const DEFAULT_SLOT_HEIGHT = 56;
/** Extra viewBox padding around each slot so the hit area extends past the visible box. */
const MAP_SLOT_HIT_PAD_VB = 32;
/** Cap map width on desktop — large enough to read, without dominating the page. */
const MAP_LAYOUT_MAX_WIDTH_PX = 760;
/** Touch sizing for map slots on compact layouts. */
const COMPACT_SLOT_SCALE = 1.12;
const COMPACT_SLOT_HIT_PAD_VB = 34;
const COMPACT_MAP_MIN_HEIGHT_PX = 288;

function getChoiceDisplay(
  choices: Array<{ id: string; label: string }>,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const choice = choices.find((item) => item.id === value);
  if (!choice) return value;
  return `${choice.id}. ${choice.label}`;
}

function getSlotMetrics(slot: ObjectiveMapAnswerSlotElement, compact = false) {
  const scale = compact ? COMPACT_SLOT_SCALE : 1;
  const hitPad = compact ? COMPACT_SLOT_HIT_PAD_VB : MAP_SLOT_HIT_PAD_VB;
  const slotWidth = (slot.w ?? DEFAULT_SLOT_WIDTH) * scale;
  const slotHeight = (slot.h ?? DEFAULT_SLOT_HEIGHT) * scale;
  const hitWidth = slotWidth + hitPad * 2;
  const hitHeight = slotHeight + hitPad * 2;

  return { slotWidth, slotHeight, hitWidth, hitHeight };
}

function getSlotHitAreaStyle(
  slot: ObjectiveMapAnswerSlotElement,
  viewBox: MapViewBoxRect,
  compact = false,
): React.CSSProperties {
  const { hitWidth, hitHeight } = getSlotMetrics(slot, compact);

  return {
    left: `${((slot.x - hitWidth / 2 - viewBox.x) / viewBox.width) * 100}%`,
    top: `${((slot.y - hitHeight / 2 - viewBox.y) / viewBox.height) * 100}%`,
    width: `${(hitWidth / viewBox.width) * 100}%`,
    height: `${(hitHeight / viewBox.height) * 100}%`,
  };
}

function getSlotVisualStyle(
  slot: ObjectiveMapAnswerSlotElement,
  compact = false,
): React.CSSProperties {
  const { slotWidth, slotHeight, hitWidth, hitHeight } = getSlotMetrics(
    slot,
    compact,
  );

  return {
    width: `${(slotWidth / hitWidth) * 100}%`,
    height: `${(slotHeight / hitHeight) * 100}%`,
  };
}

function getMapFrameStyle(
  map: ObjectiveBlockProps<"map_labeling_questions">["block"]["map"],
  displayViewBox: MapViewBoxRect,
  compact = false,
): React.CSSProperties {
  return {
    aspectRatio: `${displayViewBox.width} / ${displayViewBox.height}`,
    width: "100%",
    minHeight: compact ? COMPACT_MAP_MIN_HEIGHT_PX : undefined,
    borderColor: compact
      ? undefined
      : map.border
        ? map.palette?.[map.border]
        : undefined,
    borderWidth: compact ? undefined : map.borderWidth,
    borderRadius: compact ? undefined : map.borderRadius,
  };
}

function AnswerSlot({
  options,
  slot,
  block,
  ctx,
  groupId,
  proximityActive = false,
  mapInteraction = "drag",
}: {
  options: readonly DragOption[];
  slot: ObjectiveMapAnswerSlotElement;
  block: ObjectiveBlockProps<"map_labeling_questions">["block"];
  ctx: ObjectiveBlockProps<"map_labeling_questions">["ctx"];
  groupId: string;
  proximityActive?: boolean;
  mapInteraction?: "drag" | "tap";
}) {
  const value = ctx.answers[slot.questionId] ?? "";
  const correctAnswer = ctx.isReviewMode
    ? findCorrectAnswer(block.questions, slot.questionId)
    : undefined;

  if (block.response.type === "text") {
    return (
      <InputAnswer
        questionNumber={slot.questionId}
        value={value}
        onChange={(nextValue) => ctx.onAnswerChange(slot.questionId, nextValue)}
        width="w-full"
        className={
          mapInteraction === "tap"
            ? "w-full [&_.exam-answer-number-label]:text-[10px] [&_input]:h-7 [&_input]:px-1.5 [&_input]:text-xs"
            : "w-full"
        }
        showQuestionNumberLabel
        isReviewMode={ctx.isReviewMode}
        correctAnswer={correctAnswer}
      />
    );
  }

  return (
    <DropZone
      options={options}
      id={slot.questionId}
      groupId={groupId}
      value={value}
      displayValue={getChoiceDisplay(block.response.choices, value)}
      onDrop={(nextValue) => ctx.onAnswerChange(slot.questionId, nextValue)}
      onClear={() => ctx.onAnswerChange(slot.questionId, "")}
      placeholder={slot.label ?? String(slot.questionId)}
      isReviewMode={ctx.isReviewMode}
      correctAnswer={correctAnswer}
      variant="mapSlot"
      proximityActive={proximityActive}
      mapInteraction={mapInteraction}
    />
  );
}

export function MapLabelingQuestionsBlock({
  block,
  ctx,
  index,
}: ObjectiveBlockProps<"map_labeling_questions">) {
  const isCompactLayout = useIsCompactExamLayout();
  const mapInteraction = isCompactLayout ? "tap" : "drag";
  const groupId = `map-${index}`;
  const answerSlots = block.map.elements.filter(
    (element): element is ObjectiveMapAnswerSlotElement =>
      element.type === "answerSlot",
  );
  const usedAnswers = React.useMemo(
    () =>
      new Set(
        block.questions
          .map((question) => ctx.answers[question.questionId])
          .filter(Boolean),
      ),
    [block.questions, ctx.answers],
  );
  const displayViewBox = React.useMemo(
    () =>
      isCompactLayout
        ? getMapTightViewBox(block.map)
        : getFullMapViewBox(block.map),
    [block.map, isCompactLayout],
  );
  const mapFrameStyle = React.useMemo(
    () => getMapFrameStyle(block.map, displayViewBox, isCompactLayout),
    [block.map, displayViewBox, isCompactLayout],
  );
  const mapFrameRef = React.useRef<HTMLDivElement>(null);
  const slotHostRefs = React.useRef(new Map<number, HTMLDivElement>());
  const dragMapEnabled = mapInteraction === "drag";

  const dragOptions = React.useMemo(() => {
    if (block.response.type !== "choice") return [];
    return block.response.choices.map((choice) => ({
      value: choice.id,
      label: `${choice.id}. ${choice.label}`,
      isUsed: usedAnswers.has(choice.id),
      isReviewMode: ctx.isReviewMode === true,
    }));
  }, [block.response, ctx.isReviewMode, usedAnswers]);

  const canAssignToSlot = React.useCallback(
    (questionId: number, value: string) => {
      const currentValue = ctx.answers[questionId] ?? "";
      return canAssignDragOption(dragOptions, value, currentValue);
    },
    [ctx.answers, dragOptions],
  );

  const { proximitySlotId, registerSlotHost, dropFrameHandlers } =
    useExamProximityDropLayer({
      groupId,
      dragEnabled:
        dragMapEnabled && block.response.type === "choice" && !ctx.isReviewMode,
      dropFrameRef: mapFrameRef,
      slotHostRefs,
      canAssignToSlot,
      onAssign: ctx.onAnswerChange,
    });

  return (
    <div className="mb-8 flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <div
        className="min-w-0 w-full shrink-0"
        style={
          isCompactLayout ? undefined : { maxWidth: MAP_LAYOUT_MAX_WIDTH_PX }
        }
      >
        {block.title ? (
          <p className="mb-3 text-sm font-bold text-gray-900">{block.title}</p>
        ) : null}
        {isCompactLayout &&
        block.response.type === "choice" &&
        !ctx.isReviewMode ? (
          <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium leading-5 text-slate-600">
            Tap a numbered spot on the map, then choose an answer from the list.
          </p>
        ) : null}
        <div
          ref={mapFrameRef}
          className={
            isCompactLayout
              ? "relative w-full overflow-hidden rounded-lg border border-slate-200/80 bg-white"
              : "relative mx-auto w-full max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/40 shadow-sm"
          }
          style={mapFrameStyle}
          {...(dragMapEnabled ? dropFrameHandlers : {})}
        >
          <MapPrimitiveScene map={block.map} viewBox={displayViewBox} />
          {answerSlots.map((slot) => (
            <div
              key={slot.id ?? `slot-${slot.questionId}`}
              ref={
                dragMapEnabled ? registerSlotHost(slot.questionId) : undefined
              }
              className="absolute flex items-center justify-center"
              style={getSlotHitAreaStyle(slot, displayViewBox, isCompactLayout)}
            >
              <div
                className="min-h-0 min-w-0"
                style={getSlotVisualStyle(slot, isCompactLayout)}
              >
                <AnswerSlot
                  options={dragOptions}
                  slot={slot}
                  block={block}
                  ctx={ctx}
                  groupId={groupId}
                  proximityActive={
                    dragMapEnabled && proximitySlotId === slot.questionId
                  }
                  mapInteraction={mapInteraction}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {block.response.type === "choice" ? (
        <>
          {isCompactLayout ? null : (
            <div className="hidden w-full shrink-0 space-y-2 sm:max-w-[240px] lg:block lg:w-[240px] lg:flex-none lg:sticky lg:top-6">
              {block.response.choices.map((choice) => (
                <DraggableItem
                  key={choice.id}
                  text={`${choice.id}. ${choice.label}`}
                  value={choice.id}
                  groupId={groupId}
                  isUsed={usedAnswers.has(choice.id)}
                  isReviewMode={ctx.isReviewMode === true}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
