import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import { Highlighter, StickyNote, X, Trash2 } from "lucide-react";
import {
  EXAM_HIGHLIGHT_MENU_ANCHOR_NAME,
  supportsCssAnchorPositioning,
  supportsPopoverApi,
} from "./cssAnchorPositioning";

interface Props {
  position: { x: number; y: number } | null;
  mode: "selection" | "edit";
  onHighlight: () => void;
  onNote: () => void;
  onClear: () => void;
  onClearAll: () => void;
}

export const HighlightMenu: React.FC<Props> = ({
  position,
  mode,
  onHighlight,
  onNote,
  onClear,
  onClearAll,
}) => {
  const reactId = useId().replace(/:/g, "");
  const anchorName = `${EXAM_HIGHLIGHT_MENU_ANCHOR_NAME}-${reactId}`;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const useNativePopover = supportsPopoverApi();
  const useAnchor = useNativePopover && supportsCssAnchorPositioning();
  const open = Boolean(position);
  const displayPosition = position ?? { x: 0, y: 0 };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu || !useNativePopover) return;

    const isOpen =
      typeof menu.matches === "function"
        ? menu.matches(":popover-open")
        : false;

    if (open && !isOpen) {
      try {
        menu.showPopover();
      } catch {
        /* ignore */
      }
    } else if (!open && isOpen) {
      try {
        menu.hidePopover();
      } catch {
        /* ignore */
      }
    }
  }, [open, useNativePopover]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu || !useNativePopover || !open) return;

    const onToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      // Light-dismiss closed the popover; parent clears via outside click / actions.
      if (toggleEvent.newState === "closed") {
        menu.dispatchEvent(new CustomEvent("exam-highlight-menu-dismiss", { bubbles: true }));
      }
    };
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, [open, useNativePopover]);

  if (!useNativePopover && !open) return null;

  const fallbackStyle: React.CSSProperties | undefined = useAnchor
    ? undefined
    : {
        position: "fixed",
        left: displayPosition.x,
        top: displayPosition.y,
        transform: "translate(-50%, -100%) translateY(-10px)",
      };

  return (
    <>
      {useAnchor ? (
        <span
          aria-hidden="true"
          className="exam-highlight-menu-anchor"
          data-exam-highlight-anchor=""
          style={
            {
              position: "fixed",
              left: displayPosition.x,
              top: displayPosition.y,
              width: 0,
              height: 0,
              pointerEvents: "none",
              anchorName,
            } as React.CSSProperties
          }
        />
      ) : null}
      <div
        ref={menuRef}
        id={`exam-highlight-menu-${reactId}`}
        className={[
          "highlight-menu-container exam-highlight-menu z-[9999] flex flex-col bg-[#1a73e8] text-white rounded shadow-xl overflow-hidden text-xs font-medium select-none",
          useAnchor ? "exam-highlight-menu--anchored" : "exam-highlight-menu--fixed",
        ].join(" ")}
        style={
          {
            ...(useAnchor
              ? ({
                  positionAnchor: anchorName,
                  ["--exam-highlight-menu-offset" as string]: "10px",
                } as React.CSSProperties)
              : null),
            ...fallbackStyle,
          } as React.CSSProperties
        }
        {...(useNativePopover ? { popover: "manual" as const } : { role: "toolbar" })}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "selection" ? (
          <>
            <button
              type="button"
              onClick={onHighlight}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#1557b0] transition-colors border-b border-white/20 last:border-0"
            >
              <Highlighter size={14} aria-hidden="true" className="text-yellow-300 fill-current" />
              <span>Highlight</span>
            </button>
            <button
              type="button"
              onClick={onNote}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#1557b0] transition-colors"
            >
              <StickyNote size={14} aria-hidden="true" />
              <span>Notes</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onNote}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#1557b0] transition-colors border-b border-white/20"
            >
              <StickyNote size={14} aria-hidden="true" />
              <span>Notes</span>
            </button>
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#1557b0] transition-colors border-b border-white/20"
            >
              <X size={14} aria-hidden="true" />
              <span>Clear</span>
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-2 px-4 py-2 hover:bg-[#1557b0] transition-colors border-b border-white/20 bg-[#d93025] hover:bg-[#a50e0e]"
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Clear all</span>
            </button>
          </>
        )}

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-[#1a73e8]" />
      </div>
    </>
  );
};
