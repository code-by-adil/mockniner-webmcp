import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { GripVertical, GripHorizontal } from 'lucide-react';
import { scrollIntoViewNearest } from '@/shared/ui/exam/scrollIntoViewNearest';

const MOBILE_BREAKPOINT = 768;
const MobileTopPaneHeaderContext = React.createContext<React.ReactNode>(null);

export function ResizableSplitPaneMobileHeaderProvider({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <MobileTopPaneHeaderContext.Provider value={header}>
      {children}
    </MobileTopPaneHeaderContext.Provider>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

function isKeyboardFocusTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

interface Props {
  left: React.ReactNode;
  right: React.ReactNode;
  initialLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
  isRightScrollable?: boolean;
  /** Percent for the top pane in mobile stacked mode (default: 50) */
  mobileTopPercent?: number;
  mobileResizable?: boolean;
}

export const ResizableSplitPane: React.FC<Props> = ({
  left,
  right,
  initialLeftPercent = 50,
  minLeftPercent = 20,
  maxLeftPercent = 80,
  isRightScrollable = true,
  mobileTopPercent = 50,
  mobileResizable = true,
}) => {
  const isMobile = useIsMobile();
  const mobileTopPaneHeader = useContext(MobileTopPaneHeaderContext);
  const [leftWidthPercent, setLeftWidthPercent] = useState(initialLeftPercent);
  const [topHeightPercent, setTopHeightPercent] = useState(mobileTopPercent);
  const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMobileFocusTargetRef = useRef<HTMLElement | null>(null);
  const isDragging = useRef(false);
  const dragCleanup = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, []);

  // --- Desktop horizontal drag ---
  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - containerRect.left;
      const newPercent = (relativeX / containerRect.width) * 100;
      const clampedPercent = Math.min(Math.max(newPercent, minLeftPercent), maxLeftPercent);
      setLeftWidthPercent(clampedPercent);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', dragCleanup);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', dragCleanup);
      dragCleanup();
    };
  }, [dragCleanup, isMobile, minLeftPercent, maxLeftPercent]);

  // --- Mobile vertical drag (touch + mouse) ---
  useEffect(() => {
    if (!isMobile || !mobileResizable) return;

    const getY = (e: MouseEvent | TouchEvent): number => {
      if ('touches' in e) return e.touches[0]?.clientY ?? 0;
      return e.clientY;
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = getY(e) - rect.top;
      const newPercent = (relativeY / rect.height) * 100;
      const clamped = Math.min(Math.max(newPercent, 20), 80);
      setTopHeightPercent(clamped);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', dragCleanup);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', dragCleanup);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', dragCleanup);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', dragCleanup);
      dragCleanup();
    };
  }, [dragCleanup, isMobile, mobileResizable]);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = isMobile ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [isMobile]);

  const handleSeparatorKeyDown = useCallback((e: React.KeyboardEvent) => {
    const delta = e.shiftKey ? 10 : 5;

    if (isMobile) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      setTopHeightPercent((current) => {
        const next = e.key === 'ArrowUp' ? current - delta : current + delta;
        return Math.min(Math.max(next, 20), 80);
      });
      return;
    }

    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setLeftWidthPercent((current) => {
      const next = e.key === 'ArrowLeft' ? current - delta : current + delta;
      return Math.min(Math.max(next, minLeftPercent), maxLeftPercent);
    });
  }, [isMobile, maxLeftPercent, minLeftPercent]);

  const scrollActiveMobileFocusTargetIntoView = useCallback(() => {
    const target = activeMobileFocusTargetRef.current;
    if (!target || !containerRef.current?.contains(target)) return;
    void scrollIntoViewNearest(target, {
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });
  }, []);

  const handleMobileFocusCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!isKeyboardFocusTarget(event.target)) return;
    activeMobileFocusTargetRef.current = event.target;
    window.setTimeout(scrollActiveMobileFocusTargetIntoView, 80);
    window.setTimeout(scrollActiveMobileFocusTargetIntoView, 320);
  }, [scrollActiveMobileFocusTargetIntoView]);

  const handleMobileBlurCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (event.target === activeMobileFocusTargetRef.current) {
      activeMobileFocusTargetRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isMobile || mobileResizable || typeof window === 'undefined') {
      setMobileKeyboardInset(0);
      return;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const updateKeyboardInset = () => {
      const viewportBottom = visualViewport.offsetTop + visualViewport.height;
      const keyboardInset = Math.max(0, window.innerHeight - viewportBottom);
      setMobileKeyboardInset(keyboardInset > 80 ? keyboardInset : 0);

      if (keyboardInset > 80) {
        window.setTimeout(scrollActiveMobileFocusTargetIntoView, 40);
      }
    };

    updateKeyboardInset();
    visualViewport.addEventListener('resize', updateKeyboardInset);
    visualViewport.addEventListener('scroll', updateKeyboardInset);

    return () => {
      visualViewport.removeEventListener('resize', updateKeyboardInset);
      visualViewport.removeEventListener('scroll', updateKeyboardInset);
    };
  }, [isMobile, mobileResizable, scrollActiveMobileFocusTargetIntoView]);

  // --- Mobile: stacked vertical layout ---
  if (isMobile) {
    if (!mobileResizable) {
      return (
        <div
          data-exam-scroll-container
          ref={containerRef}
          className="w-full h-full bg-white overflow-y-auto custom-scrollbar"
          onFocusCapture={handleMobileFocusCapture}
          onBlurCapture={handleMobileBlurCapture}
          style={{
            paddingBottom: mobileKeyboardInset > 0 ? mobileKeyboardInset + 88 : undefined,
            scrollPaddingBottom: mobileKeyboardInset > 0 ? mobileKeyboardInset + 120 : undefined,
          }}
        >
          <div className="w-full bg-white">
            {mobileTopPaneHeader}
            {left}
          </div>
          <div className="w-full bg-white">
            {right}
          </div>
        </div>
      );
    }

    return (
      <div ref={containerRef} className="flex flex-col w-full h-full bg-white overflow-hidden">
        {/* TOP PANE */}
        <div
          data-exam-scroll-container
          className="w-full overflow-y-auto bg-white custom-scrollbar border-b border-gray-200"
          style={{ height: `${topHeightPercent}%` }}
        >
          {mobileTopPaneHeader}
          {left}
        </div>

        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuemin={20}
          aria-valuemax={80}
          aria-valuenow={Math.round(topHeightPercent)}
          tabIndex={0}
          className="h-[18px] bg-gray-100 border-t border-b border-gray-200 active:bg-gray-300 cursor-row-resize flex items-center justify-center shrink-0 z-20 transition-colors touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onKeyDown={handleSeparatorKeyDown}
        >
          <GripHorizontal size={16} className="text-gray-400" />
        </div>

        {/* BOTTOM PANE */}
        <div
          data-exam-scroll-container={isRightScrollable ? true : undefined}
          className={`w-full bg-white ${isRightScrollable ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
          style={{ height: `${100 - topHeightPercent}%`, flex: 1 }}
        >
          {right}
        </div>
      </div>
    );
  }

  // --- Desktop: side-by-side horizontal layout ---
  return (
    <div ref={containerRef} className="flex w-full h-full bg-white overflow-hidden">

      {/* LEFT PANE */}
      <div
        data-exam-scroll-container
        className="h-full overflow-y-auto bg-white custom-scrollbar border-r border-gray-200"
        style={{ width: `${leftWidthPercent}%` }}
      >
        {left}
      </div>

      {/* RESIZER */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={minLeftPercent}
        aria-valuemax={maxLeftPercent}
        aria-valuenow={Math.round(leftWidthPercent)}
        tabIndex={0}
        className="w-[16px] bg-gray-100 border-l border-r border-gray-200 hover:bg-gray-200 cursor-col-resize flex items-center justify-center shrink-0 z-20 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        onMouseDown={handleDragStart}
        onKeyDown={handleSeparatorKeyDown}
      >
        <GripVertical size={16} className="text-gray-400" />
      </div>

      {/* RIGHT PANE */}
      <div
        data-exam-scroll-container={isRightScrollable ? true : undefined}
        className={`h-full bg-white ${isRightScrollable ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}`}
        style={{ width: `${100 - leftWidthPercent}%`, flex: 1 }}
      >
        {right}
      </div>
    </div>
  );
};
