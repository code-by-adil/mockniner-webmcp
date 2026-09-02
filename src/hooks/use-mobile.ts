import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767px)";
const COMPACT_EXAM_QUERY = "(max-width: 1023px)";

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

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY, 768);
}

export function useIsCompactExamLayout(): boolean {
  return useMediaQuery(COMPACT_EXAM_QUERY, 1024);
}
