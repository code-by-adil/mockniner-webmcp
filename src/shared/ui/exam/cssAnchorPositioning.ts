/** Feature detection + shared tokens for exam CSS Anchor Positioning / Popover. */

export const EXAM_HIGHLIGHT_MENU_ANCHOR_NAME = "--exam-highlight-menu-anchor";

export function supportsPopoverApi(): boolean {
  return (
    typeof HTMLElement !== "undefined" &&
    typeof HTMLElement.prototype.showPopover === "function"
  );
}

export function supportsCssAnchorPositioning(): boolean {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }

  return (
    CSS.supports("anchor-name: --exam-anchor") ||
    CSS.supports("position-anchor: --exam-anchor")
  );
}

export function supportsNativeDialog(): boolean {
  return (
    typeof HTMLDialogElement !== "undefined" &&
    typeof HTMLDialogElement.prototype.showModal === "function"
  );
}

export function supportsDialogClosedBy(): boolean {
  if (typeof HTMLDialogElement === "undefined") return false;
  return (
    "closedBy" in HTMLDialogElement.prototype ||
    // Attribute reflection may exist before the IDL property in some engines.
    typeof document !== "undefined" &&
      "closedBy" in document.createElement("dialog")
  );
}

export type ExamPopoverSide = "top" | "right" | "bottom" | "left";
export type ExamPopoverAlign = "start" | "center" | "end";

/** Map ExamPopover side/align to a CSS `position-area` value. */
export function examPopoverPositionArea(
  side: ExamPopoverSide = "bottom",
  align: ExamPopoverAlign = "end",
): string {
  const block =
    side === "top" ? "top" : side === "bottom" ? "bottom" : side === "left" ? "left" : "right";

  if (side === "top" || side === "bottom") {
    if (align === "start") return `${block} span-right`;
    if (align === "center") return `${block}`;
    return `${block} span-left`;
  }

  if (align === "start") return `${block} span-bottom`;
  if (align === "center") return `${block}`;
  return `${block} span-top`;
}

/** Manual fixed coords when CSS anchor positioning is unavailable. */
export function fixedPositionFromAnchorRect(
  rect: DOMRectReadOnly,
  side: ExamPopoverSide = "bottom",
  align: ExamPopoverAlign = "end",
  offsetPx = 8,
): { top: number; left: number; transform: string } {
  let top = rect.bottom + offsetPx;
  let left = rect.right;
  let transform = "translateX(-100%)";

  if (side === "top") {
    top = rect.top - offsetPx;
    transform =
      align === "start"
        ? "translateY(-100%)"
        : align === "center"
          ? "translate(-50%, -100%)"
          : "translate(-100%, -100%)";
    left = align === "start" ? rect.left : align === "center" ? rect.left + rect.width / 2 : rect.right;
  } else if (side === "bottom") {
    top = rect.bottom + offsetPx;
    transform =
      align === "start" ? "none" : align === "center" ? "translateX(-50%)" : "translateX(-100%)";
    left = align === "start" ? rect.left : align === "center" ? rect.left + rect.width / 2 : rect.right;
  } else if (side === "left") {
    top = align === "start" ? rect.top : align === "center" ? rect.top + rect.height / 2 : rect.bottom;
    left = rect.left - offsetPx;
    transform =
      align === "start"
        ? "translateX(-100%)"
        : align === "center"
          ? "translate(-100%, -50%)"
          : "translate(-100%, -100%)";
  } else {
    top = align === "start" ? rect.top : align === "center" ? rect.top + rect.height / 2 : rect.bottom;
    left = rect.right + offsetPx;
    transform =
      align === "start" ? "none" : align === "center" ? "translateY(-50%)" : "translateY(-100%)";
  }

  return { top, left, transform };
}
