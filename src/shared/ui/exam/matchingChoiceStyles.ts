import type React from "react";
import { cn } from "@/lib/utils";
import type { MapSlotCatchState } from "./mapSlotDragUi";

export const MATCHING_CHOICE_WIDTH_PX = 320;
export const MATCHING_CHOICE_WIDTH_STYLE: React.CSSProperties = {
  width: `${MATCHING_CHOICE_WIDTH_PX}px`,
  maxWidth: "100%",
};
export const MATCHING_DROP_SNAP_PX = 12;
export const MATCHING_DROP_RELEASE_SNAP_PX = 28;
export const MATCHING_DROP_MAX_EDGE_PX = 12;

const MATCHING_CHOICE_SURFACE_BASE =
  "box-border flex w-full min-h-11 items-center rounded-md border px-2.5 py-2 text-left touch-manipulation transition-[border-color,background-color,box-shadow,transform] duration-100 ease-out";

export function matchingSlotSurfaceClass({
  isReviewMode,
  isCorrect,
  hasValue,
  catchState,
  tapHighlighted,
}: {
  isReviewMode: boolean;
  isCorrect: boolean;
  hasValue: boolean;
  catchState: MapSlotCatchState;
  tapHighlighted: boolean;
}): string {
  if (isReviewMode) {
    return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-default", isCorrect
      ? "border-[color:var(--exam-success-border)] bg-[color:var(--exam-success-bg)] text-[color:var(--exam-success-fg)]"
      : "border-[color:var(--exam-danger-border)] bg-[color:var(--exam-danger-bg)] text-[color:var(--exam-danger-fg)]");
  }
  if (catchState === "caught") return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-pointer scale-[1.01] border-2 border-solid border-sky-600 bg-sky-100 shadow-[0_0_0_3px_rgba(2,132,199,0.35)]");
  if (catchState === "targeted") return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-pointer border-2 border-dashed border-sky-500 bg-sky-50/95 shadow-[0_0_0_2px_rgba(14,165,233,0.28)]");
  if (catchState === "droppable") return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-pointer justify-center border border-dashed border-sky-300/90 bg-sky-50/40 text-[color:var(--exam-text-subtle)]");
  if (hasValue) return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-pointer border-[color:var(--exam-input-border-filled)] bg-[color:var(--exam-surface)] shadow-[var(--shadow-sm)]");
  if (tapHighlighted) return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-pointer justify-center border-[color:var(--exam-text)] bg-[color:var(--exam-control-hover-bg)] ring-2 ring-[color:var(--exam-highlight-ring)]");
  return cn(MATCHING_CHOICE_SURFACE_BASE, "cursor-pointer justify-center border-dashed border-[color:var(--exam-input-border-idle)] bg-[color:var(--exam-control-bg)] text-[color:var(--exam-text-subtle)]");
}

export function splitMatchingChoiceLabel(text: string): { letter: string; name: string } {
  const match = text.match(/^([A-Z])\.\s+(.+)$/i);
  return match?.[1] && match[2]
    ? { letter: match[1].toUpperCase(), name: match[2] }
    : { letter: "", name: text };
}

export function matchingDraggableSurfaceClass({ isUsed, isReviewMode, isSelected }: {
  isUsed: boolean;
  isReviewMode: boolean;
  isSelected: boolean;
}): string {
  return cn(
    MATCHING_CHOICE_SURFACE_BASE,
    "select-none",
    isReviewMode && "cursor-default text-[color:var(--exam-text-subtle)]",
    !isReviewMode && isUsed && "cursor-default border-[color:var(--exam-border-muted)]/50 bg-[color:var(--exam-surface-muted)] opacity-[0.38] shadow-none saturate-[0.2] contrast-[0.92]",
    !isReviewMode && !isUsed && isSelected && "cursor-grab border-sky-600 bg-sky-50 shadow-[0_0_0_2px_rgba(14,165,233,0.28)] active:cursor-grabbing",
    !isReviewMode && !isUsed && !isSelected && "cursor-grab border-[color:var(--exam-border-muted)] bg-[color:var(--exam-control-bg)] shadow-[var(--shadow-sm)] hover:border-sky-400 hover:bg-sky-50/60 active:cursor-grabbing",
  );
}

function readExamThemeToken(source: EventTarget & Element, token: string, fallback: string): string {
  const layer = source.closest(".ui-layer-exam") ?? source;
  return getComputedStyle(layer).getPropertyValue(token).trim() || fallback;
}

export function mountMatchingDragGhost(event: React.DragEvent, text: string, widthPx: number): void {
  if (typeof document === "undefined" || !(event.currentTarget instanceof Element)) return;
  const source = event.currentTarget;
  const surface = readExamThemeToken(source, "--exam-surface", "#ffffff");
  const textColor = readExamThemeToken(source, "--exam-text", "#0f172a");
  const mutedText = readExamThemeToken(source, "--exam-text-muted", "#475569");
  const border = readExamThemeToken(source, "--exam-info-fg", "#0284c7");
  const badgeBorder = readExamThemeToken(source, "--exam-border-muted", "#cbd5e1");
  const shadow = readExamThemeToken(source, "--shadow-lg", "0 6px 16px rgba(15,23,42,0.18)");
  const { letter, name } = splitMatchingChoiceLabel(text);
  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = `position:fixed;top:-9999px;left:-9999px;z-index:99999;pointer-events:none;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:${widthPx}px;min-height:44px;padding:8px 10px;border-radius:6px;border:2px solid ${border};background:${surface};color:${textColor};box-shadow:${shadow};opacity:1;filter:none;backdrop-filter:none;-webkit-backdrop-filter:none`;
  if (letter) {
    const badge = document.createElement("span");
    badge.textContent = letter;
    badge.style.cssText = `flex-shrink:0;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;border:1px solid ${badgeBorder};background:${surface};color:${mutedText};font-size:12px;font-weight:600;font-family:system-ui,sans-serif`;
    root.appendChild(badge);
  }
  const label = document.createElement("span");
  label.textContent = name;
  label.style.cssText = `flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:1.25;font-family:system-ui,sans-serif;color:${textColor}`;
  root.appendChild(label);
  document.body.appendChild(root);
  event.dataTransfer.setDragImage(root, widthPx / 2, 22);
  requestAnimationFrame(() => root.remove());
}
