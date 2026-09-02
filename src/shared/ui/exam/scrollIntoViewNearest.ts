/**
 * Exam UI helper: scroll a target into view using only the nearest scroll
 * container when the platform supports ScrollIntoViewOptions.container.
 *
 * Older browsers fall back to scrolling an explicit exam/scrollable ancestor
 * (preferring `[data-exam-scroll-container]`) so the page/viewport is not
 * yanked along with a split pane.
 */

type ScrollLogicalPosition = "start" | "center" | "end" | "nearest";

export type ScrollIntoViewNearestOptions = {
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
};

let containerSupportCache: boolean | undefined;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

async function awaitMaybePromise(value: unknown): Promise<void> {
  if (isThenable(value)) {
    await value;
  }
}

/**
 * Feature-detect `ScrollIntoViewOptions.container` via the IDL dictionary
 * getter probe: engines only read known members, so an accessor fires only
 * when `container` is implemented.
 */
function supportsScrollIntoViewContainer(): boolean {
  if (containerSupportCache !== undefined) {
    return containerSupportCache;
  }

  if (typeof document === "undefined" || typeof Element === "undefined") {
    containerSupportCache = false;
    return false;
  }

  let supported = false;
  const probe = document.createElement("div");
  try {
    probe.scrollIntoView({
      get container() {
        supported = true;
        return "nearest";
      },
    } as ScrollIntoViewOptions);
  } catch {
    supported = false;
  }

  containerSupportCache = supported;
  return supported;
}

function isScrollableElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const canScrollY =
    (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
    element.scrollHeight > element.clientHeight;
  const canScrollX =
    (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
    element.scrollWidth > element.clientWidth;
  return canScrollY || canScrollX;
}

/** Prefer exam-marked containers, then any scrollable ancestor. */
function findNearestExamScrollContainer(element: Element): HTMLElement | null {
  let current = element.parentElement;

  while (current && current !== document.body && current !== document.documentElement) {
    if (current.hasAttribute("data-exam-scroll-container") || isScrollableElement(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function alignAxis(
  containerScroll: number,
  elementStart: number,
  containerSize: number,
  elementSize: number,
  align: ScrollLogicalPosition,
): number {
  const start = containerScroll + elementStart;
  const end = start - (containerSize - elementSize);
  const center = start - (containerSize - elementSize) / 2;

  if (align === "start") return start;
  if (align === "end") return end;
  if (align === "center") return center;

  // nearest: leave alone when already fully visible; otherwise snap to closer edge
  const visibleStart = containerScroll;
  const visibleEnd = containerScroll + containerSize;
  const elementEnd = start + elementSize;
  if (start >= visibleStart && elementEnd <= visibleEnd) {
    return containerScroll;
  }
  const distanceToStart = Math.abs(start - visibleStart);
  const distanceToEnd = Math.abs(elementEnd - visibleEnd);
  return distanceToStart <= distanceToEnd ? start : end;
}

function scrollInsideContainer(
  element: Element,
  container: HTMLElement,
  options: Required<Pick<ScrollIntoViewNearestOptions, "behavior" | "block" | "inline">>,
): unknown {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const nextTop = alignAxis(
    container.scrollTop,
    elementRect.top - containerRect.top,
    container.clientHeight,
    elementRect.height,
    options.block,
  );
  const nextLeft = alignAxis(
    container.scrollLeft,
    elementRect.left - containerRect.left,
    container.clientWidth,
    elementRect.width,
    options.inline,
  );

  if (typeof container.scrollTo === "function") {
    return container.scrollTo({
      top: Math.max(0, nextTop),
      left: Math.max(0, nextLeft),
      behavior: options.behavior,
    });
  }

  // Very old / incomplete DOM environments (e.g. jsdom) may lack scrollTo.
  container.scrollTop = Math.max(0, nextTop);
  container.scrollLeft = Math.max(0, nextLeft);
  return undefined;
}

/**
 * Scroll `element` into view, limiting to the nearest scroll container when
 * supported. Always returns a Promise so callers may optionally await completion
 * on engines that expose scroll promises.
 */
export async function scrollIntoViewNearest(
  element: Element,
  options: ScrollIntoViewNearestOptions = {},
): Promise<void> {
  const behavior = options.behavior ?? "smooth";
  const block = options.block ?? "center";
  const inline = options.inline ?? "nearest";

  if (supportsScrollIntoViewContainer()) {
    const result = element.scrollIntoView({
      behavior,
      block,
      inline,
      container: "nearest",
    } as ScrollIntoViewOptions);
    await awaitMaybePromise(result);
    return;
  }

  const scrollContainer = findNearestExamScrollContainer(element);
  if (scrollContainer) {
    const result = scrollInsideContainer(element, scrollContainer, {
      behavior,
      block,
      inline,
    });
    await awaitMaybePromise(result);
    return;
  }

  // No nested container: viewport scroll is correct. Omit `container` so older
  // engines never see an unknown dictionary member.
  const result = element.scrollIntoView({ behavior, block, inline });
  await awaitMaybePromise(result);
}
