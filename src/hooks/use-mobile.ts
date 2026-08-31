import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";
const TABLET_NAV_QUERY = "(min-width: 768px) and (max-width: 1023px)";
const COMPACT_EXAM_QUERY = "(max-width: 1023px)";

export type NavMenuSheetPresentation = "bottom" | "right";

function subscribeToMediaQuery(query: string, onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (typeof window.matchMedia !== "function") {
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }

  const mediaQuery = window.matchMedia(query);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function readMediaQuery(query: string, fallbackWidth: number): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.matchMedia === "function"
    ? window.matchMedia(query).matches
    : window.innerWidth < fallbackWidth;
}

function useMediaQuery(query: string, fallbackWidth: number): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeToMediaQuery(query, onChange),
    () => readMediaQuery(query, fallbackWidth),
    () => false,
  );
}

/** Bottom drawer on phones; right sheet on tablets; unused at lg+ (inline nav). */
export function useNavMenuSheetPresentation(): NavMenuSheetPresentation {
  const isTablet = useMediaQuery(TABLET_NAV_QUERY, 1024);
  const isMobile = useMediaQuery(MOBILE_QUERY, 768);
  return isTablet && !isMobile ? "right" : "bottom";
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY, 768);
}

export function readIsCompactExamLayout(): boolean {
  return readMediaQuery(COMPACT_EXAM_QUERY, 1024);
}

export function useIsCompactExamLayout(): boolean {
  return useMediaQuery(COMPACT_EXAM_QUERY, 1024);
}
