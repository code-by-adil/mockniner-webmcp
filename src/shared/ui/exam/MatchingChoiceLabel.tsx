import { cn } from "@/lib/utils";
import { splitMatchingChoiceLabel } from "./matchingChoiceStyles";

export function MatchingChoiceLabel({ text, muted = false, letterTone = "filled", clampName = false }: {
  text: string;
  muted?: boolean;
  letterTone?: "option" | "used" | "filled";
  clampName?: boolean;
}) {
  const { letter, name } = splitMatchingChoiceLabel(text);
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-2.5", muted && "opacity-70")} title={text}>
      {letter ? (
        <span className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          letterTone === "used" && "border border-[color:var(--exam-border-muted)]/80 bg-[color:var(--exam-surface-muted)] text-[color:var(--exam-text-subtle)]",
          letterTone === "option" && "border border-[color:var(--exam-border-muted)] bg-[color:var(--exam-surface)] text-[color:var(--exam-text-muted)]",
          letterTone === "filled" && (muted
            ? "bg-[color:var(--exam-chip-answered-bg)] text-[color:var(--exam-chip-answered-fg)]"
            : "border border-[color:var(--exam-border-muted)] bg-[color:var(--exam-surface)] text-[color:var(--exam-text)]"),
        )}>{letter}</span>
      ) : null}
      <span className={cn(
        "min-w-0 flex-1 text-sm leading-snug",
        clampName && "truncate",
        letterTone === "used" && "font-normal text-[color:var(--exam-text-subtle)]",
        letterTone === "option" && "font-normal text-[color:var(--exam-text)]",
        letterTone === "filled" && "font-medium",
      )}>{name}</span>
    </span>
  );
}
