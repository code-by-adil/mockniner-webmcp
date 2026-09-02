import type { CSSProperties } from "react";
import type { AssessmentPackage } from "@/domain/assessment";

const accentColors: Record<
  AssessmentPackage["presentation"]["accent"],
  { base: string; hover: string }
> = {
  red: { base: "#b42318", hover: "#912018" },
  blue: { base: "#175cd3", hover: "#1849a9" },
  green: { base: "#067647", hover: "#05603a" },
  violet: { base: "#6938ef", hover: "#5925dc" },
};

type AssessmentThemeStyle = CSSProperties & {
  "--exam-accent": string;
  "--exam-accent-hover": string;
};

export function getAssessmentThemeStyle(
  accent: AssessmentPackage["presentation"]["accent"],
): AssessmentThemeStyle {
  const colors = accentColors[accent];
  return {
    "--exam-accent": colors.base,
    "--exam-accent-hover": colors.hover,
  };
}
