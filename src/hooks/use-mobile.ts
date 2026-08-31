import * as React from "react"

const MOBILE_BREAKPOINT = 768
const DESKTOP_NAV_BREAKPOINT = 1024
/** Matches Tailwind `lg` — stacked exam layouts below this width. */
const COMPACT_EXAM_LAYOUT_BREAKPOINT = 1024

export type NavMenuSheetPresentation = "bottom" | "right"

/** Bottom drawer on phones; right sheet on tablets; unused at lg+ (inline nav). */
export function useNavMenuSheetPresentation(): NavMenuSheetPresentation {
  const [presentation, setPresentation] =
    React.useState<NavMenuSheetPresentation>("bottom")

  React.useEffect(() => {
    const tabletQuery = `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${
      DESKTOP_NAV_BREAKPOINT - 1
    }px)`

    const apply = (): void => {
      if (typeof window.matchMedia !== "function") {
        const width = window.innerWidth
        setPresentation(
          width >= MOBILE_BREAKPOINT && width < DESKTOP_NAV_BREAKPOINT
            ? "right"
            : "bottom",
        )
        return
      }

      setPresentation(
        window.matchMedia(tabletQuery).matches ? "right" : "bottom",
      )
    }

    apply()

    if (typeof window.matchMedia !== "function") {
      window.addEventListener("resize", apply)
      return () => window.removeEventListener("resize", apply)
    }

    const mql = window.matchMedia(tabletQuery)
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [])

  return presentation
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
      return
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function readIsCompactExamLayout(): boolean {
  if (typeof window === "undefined") return false
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(
      `(max-width: ${COMPACT_EXAM_LAYOUT_BREAKPOINT - 1}px)`,
    ).matches
  }
  return window.innerWidth < COMPACT_EXAM_LAYOUT_BREAKPOINT
}

export function useIsCompactExamLayout() {
  const [isCompact, setIsCompact] = React.useState(readIsCompactExamLayout)

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      const onResize = () => setIsCompact(readIsCompactExamLayout())
      window.addEventListener("resize", onResize)
      return () => window.removeEventListener("resize", onResize)
    }

    const mql = window.matchMedia(
      `(max-width: ${COMPACT_EXAM_LAYOUT_BREAKPOINT - 1}px)`,
    )
    const onChange = () => setIsCompact(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isCompact
}
