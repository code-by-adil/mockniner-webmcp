import React from "react";

export const DRAG_GROUP_MIME = "application/x-mockniner-drag-group";
export const DRAG_VALUE_MIME = "application/x-mockniner-drag-value";

const PLAIN_PAYLOAD_PREFIX = "mockniner:";

export type ExamDragPayload = {
  groupId: string;
  value: string;
};

function encodePlainPayload(payload: ExamDragPayload): string {
  return `${PLAIN_PAYLOAD_PREFIX}${payload.groupId}\u0000${payload.value}`;
}

function decodePlainPayload(plain: string): ExamDragPayload | null {
  if (!plain.startsWith(PLAIN_PAYLOAD_PREFIX)) return null;
  const body = plain.slice(PLAIN_PAYLOAD_PREFIX.length);
  const separator = body.indexOf("\u0000");
  if (separator <= 0) return null;
  const groupId = body.slice(0, separator);
  const value = body.slice(separator + 1);
  if (!groupId || !value) return null;
  return { groupId, value };
}

export function configureExamDragDataTransfer(
  event: React.DragEvent,
  payload: ExamDragPayload,
): void {
  const { dataTransfer } = event;
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData("text/plain", encodePlainPayload(payload));
  dataTransfer.setData(DRAG_GROUP_MIME, payload.groupId);
  dataTransfer.setData(DRAG_VALUE_MIME, payload.value);
}

export type DropTargetRect = {
  id: string | number;
  centerX: number;
  centerY: number;
  halfW: number;
  halfH: number;
};

/** Distance from a point to the nearest edge of an axis-aligned rect (0 when inside). */
export function distanceToRectEdge(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  halfW: number,
  halfH: number,
): number {
  const dx = Math.max(0, Math.abs(px - centerX) - halfW);
  const dy = Math.max(0, Math.abs(py - centerY) - halfH);
  return Math.hypot(dx, dy);
}

/**
 * Picks the drop target whose box (optionally padded) is closest to the pointer.
 * Returns null when every target is farther than `maxEdgeDistancePx` from its box edge.
 */
export function findNearestDropTarget(
  clientX: number,
  clientY: number,
  targets: DropTargetRect[],
  maxEdgeDistancePx: number,
  preferredId?: string | number | null,
  preferredBiasPx = 0,
): string | number | null {
  let best: { id: string | number; score: number } | null = null;

  for (const target of targets) {
    const distance = distanceToRectEdge(
      clientX,
      clientY,
      target.centerX,
      target.centerY,
      target.halfW,
      target.halfH,
    );
    if (distance > maxEdgeDistancePx) continue;
    const score =
      preferredId != null && target.id === preferredId
        ? Math.max(0, distance - preferredBiasPx)
        : distance;

    if (!best || score < best.score) {
      best = { id: target.id, score };
    }
  }

  return best?.id ?? null;
}

/** Resolves a map/matching slot question id from pointer coordinates. */
export function resolveDropTargetId(
  clientX: number,
  clientY: number,
  targets: DropTargetRect[],
  maxEdgeDistancePx = 0,
  preferredId?: string | number | null,
  preferredBiasPx = 0,
): string | number | null {
  return findNearestDropTarget(
    clientX,
    clientY,
    targets,
    maxEdgeDistancePx,
    preferredId,
    preferredBiasPx,
  );
}

/** Nearest slot that passes eligibility (e.g. can receive the dragged option). */
export function resolveEligibleDropTargetId(
  clientX: number,
  clientY: number,
  targets: DropTargetRect[],
  isEligible: (id: string | number) => boolean,
  maxEdgeDistancePx = 0,
  preferredId?: string | number | null,
  preferredBiasPx = 0,
): string | number | null {
  const eligible = targets.filter((target) => isEligible(target.id));
  return findNearestDropTarget(
    clientX,
    clientY,
    eligible,
    maxEdgeDistancePx,
    preferredId,
    preferredBiasPx,
  );
}

export function hasExamDragPayload(types: readonly string[]): boolean {
  return types.includes(DRAG_GROUP_MIME) || types.includes(DRAG_VALUE_MIME);
}

export function measureDropTargetRects(
  elements: Map<string | number, HTMLElement>,
  extraSnapPx = 0,
): DropTargetRect[] {
  const targets: DropTargetRect[] = [];

  for (const [id, element] of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    targets.push({
      id,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      halfW: rect.width / 2 + extraSnapPx,
      halfH: rect.height / 2 + extraSnapPx,
    });
  }

  return targets;
}

export function readExamDragPayload(event: React.DragEvent): ExamDragPayload | null {
  const groupId = event.dataTransfer.getData(DRAG_GROUP_MIME);
  const value = event.dataTransfer.getData(DRAG_VALUE_MIME);

  if (groupId && value) {
    return { groupId, value };
  }

  const fromPlain = decodePlainPayload(event.dataTransfer.getData("text/plain"));
  if (fromPlain) return fromPlain;

  return null;
}

/** Resolves payload from dataTransfer, then encoded plain text, then active selection (same group). */
export function resolveExamDragPayload(
  event: React.DragEvent,
  fallback?: ExamDragPayload | null,
): ExamDragPayload | null {
  const fromTransfer = readExamDragPayload(event);
  if (fromTransfer) return fromTransfer;

  if (fallback?.groupId && fallback.value) return fallback;
  return null;
}

const EXAM_SCROLL_CONTAINER_SELECTOR = "[data-exam-scroll-container]";

function findExamScrollContainer(clientX: number, clientY: number): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const pointedContainers =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : [];

  for (const element of pointedContainers) {
    if (!(element instanceof HTMLElement)) continue;

    const container = element.matches(EXAM_SCROLL_CONTAINER_SELECTOR)
      ? element
      : element.closest(EXAM_SCROLL_CONTAINER_SELECTOR);

    if (container instanceof HTMLElement) return container;
  }

  const container = document.querySelector(EXAM_SCROLL_CONTAINER_SELECTOR);
  return container instanceof HTMLElement ? container : null;
}

/** Nudge the active exam scroll container when dragging near its top or bottom edge. */
export function autoScrollExamContainer(clientX: number, clientY: number): void {
  const container = findExamScrollContainer(clientX, clientY);
  if (!(container instanceof HTMLElement)) return;

  const rect = container.getBoundingClientRect();
  const edge = 80;
  const step = 18;

  if (clientY < rect.top + edge) {
    container.scrollTop -= step;
  } else if (clientY > rect.bottom - edge) {
    container.scrollTop += step;
  }
}

export function useDropZoneDragDepth() {
  const depthRef = React.useRef(0);
  const [isOver, setIsOver] = React.useState(false);

  const onDragEnter = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    depthRef.current += 1;
    setIsOver(true);
  }, []);

  const onDragLeave = React.useCallback((event: React.DragEvent) => {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related)) return;

    depthRef.current = Math.max(0, depthRef.current - 1);
    if (depthRef.current === 0) {
      setIsOver(false);
    }
  }, []);

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    autoScrollExamContainer(event.clientX, event.clientY);
    setIsOver(true);
  }, []);

  const reset = React.useCallback(() => {
    depthRef.current = 0;
    setIsOver(false);
  }, []);

  return { isOver, onDragEnter, onDragLeave, onDragOver, reset };
}

const EXAM_DRAG_SESSION_EVENT = "exam-drag-session-change";

/** True while an exam option is mid–HTML5 drag (map/matching drop targeting). */
export function isExamDragSessionActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.examDragActive === "true";
}

export function setExamDragSessionActive(active: boolean): void {
  if (typeof document === "undefined") return;

  if (active) {
    document.documentElement.dataset.examDragActive = "true";
  } else {
    delete document.documentElement.dataset.examDragActive;
  }

  window.dispatchEvent(new CustomEvent(EXAM_DRAG_SESSION_EVENT, { detail: { active } }));
}

export function subscribeExamDragSession(listener: (active: boolean) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ active: boolean }>).detail;
    listener(detail?.active ?? isExamDragSessionActive());
  };

  window.addEventListener(EXAM_DRAG_SESSION_EVENT, handler);
  return () => window.removeEventListener(EXAM_DRAG_SESSION_EVENT, handler);
}
