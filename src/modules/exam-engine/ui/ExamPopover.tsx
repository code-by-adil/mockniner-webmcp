import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  examPopoverPositionArea,
  fixedPositionFromAnchorRect,
  supportsCssAnchorPositioning,
  supportsPopoverApi,
  type ExamPopoverAlign,
  type ExamPopoverSide,
} from "@/shared/ui/exam/cssAnchorPositioning";

type ExamPopoverContextValue = {
  contentId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLElement | null>;
  side: ExamPopoverSide;
  align: ExamPopoverAlign;
  sideOffset: number;
  useNativePopover: boolean;
  useAnchorPositioning: boolean;
};

const ExamPopoverContext = createContext<ExamPopoverContextValue | null>(null);

function useExamPopoverContext(component: string): ExamPopoverContextValue {
  const context = useContext(ExamPopoverContext);
  if (!context) {
    throw new Error(`${component} must be used within ExamPopover`);
  }
  return context;
}

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") ref(node);
      else (ref as { current: T | null }).current = node;
    }
  };
}

type ExamPopoverProps = {
  children: ReactNode;
  open?: boolean | undefined;
  defaultOpen?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  side?: ExamPopoverSide | undefined;
  align?: ExamPopoverAlign | undefined;
  sideOffset?: number | undefined;
};

export function ExamPopover({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  side = "bottom",
  align = "end",
  sideOffset = 8,
}: ExamPopoverProps): ReactElement {
  const reactId = useId().replace(/:/g, "");
  const triggerRef = useRef<HTMLElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? Boolean(openProp) : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const useNativePopover = supportsPopoverApi();
  const useAnchorPositioning = useNativePopover && supportsCssAnchorPositioning();

  const value = useMemo<ExamPopoverContextValue>(
    () => ({
      contentId: `exam-popover-${reactId}`,
      open,
      setOpen,
      triggerRef,
      side,
      align,
      sideOffset,
      useNativePopover,
      useAnchorPositioning,
    }),
    [
      align,
      open,
      reactId,
      setOpen,
      side,
      sideOffset,
      useAnchorPositioning,
      useNativePopover,
    ],
  );

  return (
    <ExamPopoverContext.Provider value={value}>
      <div className="exam-popover-root" data-exam-popover-root="">
        {children}
      </div>
    </ExamPopoverContext.Provider>
  );
}

type ExamPopoverTriggerProps = {
  asChild?: boolean | undefined;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  className?: string | undefined;
} & Omit<HTMLAttributes<HTMLElement>, "children">;

export function ExamPopoverTrigger({
  asChild = false,
  children,
  className,
  onClick,
  ...props
}: ExamPopoverTriggerProps): ReactElement {
  const { contentId, open, setOpen, triggerRef, useNativePopover } =
    useExamPopoverContext("ExamPopoverTrigger");

  const childRef = (children as { ref?: Ref<HTMLElement> }).ref;
  const composedRef = mergeRefs(triggerRef, childRef);

  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    onClick?.(event);
    (children.props as HTMLAttributes<HTMLElement>).onClick?.(event);
    if (event.defaultPrevented) return;
    if (!useNativePopover) setOpen(!open);
  };

  const shared = {
    ...props,
    className: [className, (children.props as { className?: string }).className]
      .filter(Boolean)
      .join(" "),
    "aria-expanded": open,
    "aria-haspopup": "dialog" as const,
    "data-exam-popover": "trigger",
    "data-state": open ? ("open" as const) : ("closed" as const),
    onClick: handleClick,
    ...(useNativePopover
      ? {
          popoverTarget: contentId,
          popoverTargetAction: "toggle" as const,
        }
      : {}),
  };

  if (asChild) {
    return cloneElement(children, {
      ...shared,
      ref: composedRef,
    } as HTMLAttributes<HTMLElement> & { ref: typeof composedRef });
  }

  return (
    <button type="button" ref={composedRef as Ref<HTMLButtonElement>} {...shared}>
      {children}
    </button>
  );
}

type ExamPopoverContentProps = {
  children?: ReactNode;
  className?: string | undefined;
  align?: ExamPopoverAlign | undefined;
  side?: ExamPopoverSide | undefined;
  sideOffset?: number | undefined;
  /** Retained for API parity with the previous Radix wrapper; unused with CSS anchors. */
  collisionPadding?: number | undefined;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

export function ExamPopoverContent({
  className = "",
  align: alignProp,
  side: sideProp,
  sideOffset: sideOffsetProp,
  collisionPadding: _collisionPadding,
  children,
  style,
  ...props
}: ExamPopoverContentProps): ReactElement | null {
  const {
    contentId,
    open,
    setOpen,
    triggerRef,
    side: contextSide,
    align: contextAlign,
    sideOffset: contextSideOffset,
    useNativePopover,
    useAnchorPositioning,
  } = useExamPopoverContext("ExamPopoverContent");

  const side = sideProp ?? contextSide;
  const align = alignProp ?? contextAlign;
  const sideOffset = sideOffsetProp ?? contextSideOffset;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [fallbackStyle, setFallbackStyle] = useState<CSSProperties | undefined>();

  const updateFallbackPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const next = fixedPositionFromAnchorRect(rect, side, align, sideOffset);
    setFallbackStyle({
      position: "fixed",
      top: next.top,
      left: next.left,
      transform: next.transform,
      margin: 0,
    });
  }, [align, side, sideOffset, triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    if (useAnchorPositioning) {
      setFallbackStyle(undefined);
      return;
    }
    updateFallbackPosition();
  }, [open, updateFallbackPosition, useAnchorPositioning]);

  useEffect(() => {
    if (!open || useAnchorPositioning) return;
    const onReposition = () => updateFallbackPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateFallbackPosition, useAnchorPositioning]);

  useEffect(() => {
    const node = contentRef.current;
    if (!node || !useNativePopover) return;

    const syncFromToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      setOpen(toggleEvent.newState === "open");
    };
    node.addEventListener("toggle", syncFromToggle);
    return () => node.removeEventListener("toggle", syncFromToggle);
  }, [setOpen, useNativePopover]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node || !useNativePopover) return;

    const isOpen =
      typeof node.matches === "function"
        ? node.matches(":popover-open")
        : node.hasAttribute("popover-open");

    if (open && !isOpen) {
      const source = triggerRef.current;
      try {
        if (source && "showPopover" in node) {
          (
            node as HTMLElement & {
              showPopover: (options?: { source?: Element }) => void;
            }
          ).showPopover({ source });
        } else {
          node.showPopover();
        }
      } catch {
        try {
          node.showPopover();
        } catch {
          /* ignore */
        }
      }
    } else if (!open && isOpen) {
      try {
        node.hidePopover();
      } catch {
        /* ignore */
      }
    }
  }, [open, triggerRef, useNativePopover]);

  useEffect(() => {
    if (!open || useNativePopover) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (contentRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen, triggerRef, useNativePopover]);

  if (!open && !useNativePopover) return null;

  const positionArea = examPopoverPositionArea(side, align);
  const anchoredVars: CSSProperties | undefined = useAnchorPositioning
    ? ({
        ["--exam-popover-position-area" as string]: positionArea,
        ["--exam-popover-offset" as string]: `${sideOffset}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      {...props}
      id={contentId}
      ref={contentRef}
      data-exam-popover="content"
      data-side={side}
      data-align={align}
      data-state={open ? "open" : "closed"}
      {...(useNativePopover ? { popover: "auto" as const } : { role: "dialog" })}
      className={[
        "exam-popover-content z-[60] outline-hidden",
        useAnchorPositioning ? "exam-popover-content--anchored" : "exam-popover-content--fixed",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ...anchoredVars, ...fallbackStyle, ...style }}
    >
      {children}
    </div>
  );
}
