import type { ReactElement } from "react";

export function AssessmentLabBrand(): ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="h-8 w-8 sm:h-9 sm:w-9"
      >
        <rect width="64" height="64" rx="14" fill="var(--exam-accent, #c1121f)" />
        <path d="M18 17h28v7H18zm0 12h20v7H18zm0 12h28v7H18z" fill="white" />
      </svg>
      <div className="flex flex-col justify-center leading-none">
        <span className="text-lg font-semibold tracking-tight text-neutral-950 sm:text-xl">
          Assessment <span className="text-[var(--exam-accent)]">Lab</span>
        </span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-500 sm:text-[9px]">
          Practice with your agent
        </span>
      </div>
    </div>
  );
}
