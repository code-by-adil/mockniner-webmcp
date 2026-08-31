import React from "react";
import {
  autoScrollExamContainer,
  hasExamDragPayload,
  isExamDragSessionActive,
  measureDropTargetRects,
  resolveEligibleDropTargetId,
  resolveExamDragPayload,
  subscribeExamDragSession,
  type DropTargetRect,
} from "./examDragDrop";
import { clearDragSelection, getSelectedDragValue } from "./dragSelection";

/** Extra snap padding when resolving nearest slot from pointer position (map + matching). */
export const EXAM_SLOT_DROP_SNAP_PX = 20;

/** Invisible hit-area padding around a slot surface (map + matching). */
export const EXAM_SLOT_HIT_INSET_PX = 14;

type SlotHostMap = Map<number, HTMLDivElement>;

const CATCH_FLASH_MS = 200;
const STICKY_TARGET_BIAS_PX = 10;

function resolveDropQuestionId({
  clientX,
  clientY,
  targets,
  dragValue,
  stickySlotId,
  canAssignToSlot,
  maxEdgePx,
}: {
  clientX: number;
  clientY: number;
  targets: DropTargetRect[];
  dragValue: string;
  stickySlotId: number | null;
  canAssignToSlot: (questionId: number, value: string) => boolean;
  maxEdgePx: number;
}): number | null {
  const isEligible = (slotId: string | number) => canAssignToSlot(Number(slotId), dragValue);

  const nearest = resolveEligibleDropTargetId(
    clientX,
    clientY,
    targets,
    isEligible,
    maxEdgePx,
    stickySlotId,
    STICKY_TARGET_BIAS_PX,
  );

  if (nearest != null) return Number(nearest);

  return null;
}

export function useExamProximityDropLayer({
  groupId,
  dragEnabled,
  dropFrameRef,
  slotHostRefs,
  canAssignToSlot,
  onAssign,
  dropSnapPx = EXAM_SLOT_DROP_SNAP_PX,
  dropReleaseSnapPx = dropSnapPx,
  dropMaxEdgePx = 0,
}: {
  groupId: string;
  dragEnabled: boolean;
  dropFrameRef: React.RefObject<HTMLElement | null>;
  slotHostRefs: React.MutableRefObject<SlotHostMap>;
  canAssignToSlot: (questionId: number, value: string) => boolean;
  onAssign: (questionId: number, value: string) => void;
  dropSnapPx?: number;
  /** Wider row boxes used only when resolving drop (ghost vs pointer offset). */
  dropReleaseSnapPx?: number;
  /** Allow release slightly outside the padded row rect. */
  dropMaxEdgePx?: number;
}) {
  const [proximitySlotId, setProximitySlotId] = React.useState<number | null>(null);
  const [caughtSlotId, setCaughtSlotId] = React.useState<number | null>(null);
  const stickySlotIdRef = React.useRef<number | null>(null);
  const dropHandledRef = React.useRef(false);
  const caughtTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const setProximityHighlight = React.useCallback((questionId: number | null) => {
    setProximitySlotId(questionId);
    if (questionId != null) stickySlotIdRef.current = questionId;
  }, []);

  const clearProximityHighlight = React.useCallback(() => {
    setProximitySlotId(null);
  }, []);

  const resetDropTargeting = React.useCallback(() => {
    stickySlotIdRef.current = null;
    setProximitySlotId(null);
  }, []);

  const flashCaughtSlot = React.useCallback((questionId: number) => {
    if (caughtTimerRef.current) clearTimeout(caughtTimerRef.current);
    setCaughtSlotId(questionId);
    caughtTimerRef.current = setTimeout(() => {
      setCaughtSlotId(null);
      caughtTimerRef.current = null;
    }, CATCH_FLASH_MS);
  }, []);

  React.useEffect(
    () => () => {
      if (caughtTimerRef.current) clearTimeout(caughtTimerRef.current);
    },
    [],
  );

  React.useEffect(
    () =>
      subscribeExamDragSession((active) => {
        if (active) {
          dropHandledRef.current = false;
          return;
        }
        resetDropTargeting();
      }),
    [resetDropTargeting],
  );

  React.useEffect(() => {
    if (!dragEnabled) return;

    const onDocumentDragOver = (event: DragEvent) => {
      if (!isExamDragSessionActive()) return;
      if (!hasExamDragPayload(event.dataTransfer?.types ?? [])) return;

      event.preventDefault();
      autoScrollExamContainer(event.clientX, event.clientY);

      const frame = dropFrameRef.current;
      if (!frame) return;

      const rect = frame.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!inside) clearProximityHighlight();
    };

    document.addEventListener("dragover", onDocumentDragOver);
    return () => document.removeEventListener("dragover", onDocumentDragOver);
  }, [clearProximityHighlight, dragEnabled, dropFrameRef]);

  const registerSlotHost = React.useCallback(
    (questionId: number) => (element: HTMLDivElement | null) => {
      if (element) {
        slotHostRefs.current.set(questionId, element);
        return;
      }
      slotHostRefs.current.delete(questionId);
    },
    [slotHostRefs],
  );

  const measureTargets = React.useCallback(
    (snapPx: number) => measureDropTargetRects(slotHostRefs.current, snapPx),
    [slotHostRefs],
  );

  const commitDrop = React.useCallback(
    (event: React.DragEvent | DragEvent) => {
      if (!dragEnabled || dropHandledRef.current) return;

      const payload = resolveExamDragPayload(event as React.DragEvent, {
        groupId,
        value: getSelectedDragValue() ?? "",
      });
      if (!payload || payload.groupId !== groupId || !payload.value) return;

      const questionId = resolveDropQuestionId({
        clientX: event.clientX,
        clientY: event.clientY,
        targets: measureTargets(dropReleaseSnapPx),
        dragValue: payload.value,
        stickySlotId: stickySlotIdRef.current,
        canAssignToSlot,
        maxEdgePx: dropMaxEdgePx,
      });
      if (questionId == null || !Number.isFinite(questionId)) return;

      dropHandledRef.current = true;
      event.preventDefault();
      event.stopPropagation();

      onAssign(questionId, payload.value);
      flashCaughtSlot(questionId);
      clearDragSelection();
      resetDropTargeting();
    },
    [
      canAssignToSlot,
      dragEnabled,
      dropMaxEdgePx,
      dropReleaseSnapPx,
      flashCaughtSlot,
      groupId,
      measureTargets,
      onAssign,
      resetDropTargeting,
    ],
  );

  const handleFrameDragOver = React.useCallback(
    (event: React.DragEvent) => {
      if (!dragEnabled) return;
      if (!hasExamDragPayload(event.dataTransfer.types)) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      autoScrollExamContainer(event.clientX, event.clientY);

      const dragValue = getSelectedDragValue();
      if (!dragValue) {
        clearProximityHighlight();
        return;
      }

      const nearest = resolveEligibleDropTargetId(
        event.clientX,
        event.clientY,
        measureTargets(dropSnapPx),
        (slotId) => canAssignToSlot(Number(slotId), dragValue),
        0,
        stickySlotIdRef.current,
        STICKY_TARGET_BIAS_PX,
      );
      setProximityHighlight(nearest == null ? null : Number(nearest));
    },
    [canAssignToSlot, clearProximityHighlight, dragEnabled, dropSnapPx, measureTargets, setProximityHighlight],
  );

  const handleFrameDrop = React.useCallback(
    (event: React.DragEvent) => {
      commitDrop(event);
    },
    [commitDrop],
  );

  React.useEffect(() => {
    if (!dragEnabled) return;

    const onDocumentDrop = (event: DragEvent) => {
      if (!isExamDragSessionActive()) return;
      if (!hasExamDragPayload(event.dataTransfer?.types ?? [])) return;
      commitDrop(event);
    };

    document.addEventListener("drop", onDocumentDrop, true);
    return () => document.removeEventListener("drop", onDocumentDrop, true);
  }, [commitDrop, dragEnabled]);

  const dropFrameHandlers = dragEnabled
    ? {
        onDragOverCapture: handleFrameDragOver,
        onDropCapture: handleFrameDrop,
      }
    : {};

  return {
    proximitySlotId,
    caughtSlotId,
    registerSlotHost,
    dropFrameHandlers,
    flashCaughtSlot,
  };
}
