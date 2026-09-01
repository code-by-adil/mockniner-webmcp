import type { ReactElement } from "react";
import { BrandLogo } from "./BrandLogo";

export function WorkspaceBrandMark(): ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-2" aria-label="Assessment Lab">
      <BrandLogo className="h-8 w-[46px] text-gray-950 sm:h-9 sm:w-[52px]" />
      <div className="flex flex-col justify-center leading-none">
        <span className="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
          Assessment<span className="text-[var(--exam-accent)]">Lab</span>
        </span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-500 sm:text-[9px]">
          Agent-native practice
        </span>
      </div>
    </div>
  );
}
