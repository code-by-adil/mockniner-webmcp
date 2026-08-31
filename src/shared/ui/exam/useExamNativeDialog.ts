import {
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import {
  supportsDialogClosedBy,
  supportsNativeDialog,
} from "./cssAnchorPositioning";

export type ExamDialogClosedBy = "any" | "closerequest" | "none";

export type UseExamNativeDialogOptions = {
  open: boolean;
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Prefer native light-dismiss when supported (Chrome 134+). */
  closedBy?: ExamDialogClosedBy | undefined;
};

/**
 * Syncs controlled `open` with `<dialog>.showModal()` / `.close()`.
 * Escape and (when supported) `closedby` dismissions call `onOpenChange(false)`.
 */
export function useExamNativeDialog({
  open,
  onOpenChange,
  closedBy = "any",
}: UseExamNativeDialogOptions): RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (supportsDialogClosedBy()) {
      dialog.setAttribute("closedby", closedBy);
    } else {
      dialog.removeAttribute("closedby");
    }
  }, [closedBy]);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      if (dialog.open) return;
      if (supportsNativeDialog()) {
        try {
          dialog.showModal();
        } catch {
          // Already open or not connected — keep attribute fallback.
          dialog.setAttribute("open", "");
        }
      } else {
        dialog.setAttribute("open", "");
      }
      return;
    }

    if (dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => {
      onOpenChangeRef.current?.(false);
    };

    const handleCancel = (event: Event) => {
      // Keep Escape working when we only mirror state; do not block native close.
      event.stopPropagation();
      onOpenChangeRef.current?.(false);
    };

    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, []);

  return ref;
}

/**
 * Backdrop click dismiss for engines without `closedby`.
 * Call from `onClick` on the `<dialog>` element.
 */
export function handleExamDialogBackdropClick(
  event: ReactMouseEvent<HTMLDialogElement>,
): void {
  if (event.target !== event.currentTarget) return;
  if (supportsDialogClosedBy()) return;
  event.currentTarget.close();
}
