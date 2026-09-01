import React from "react";

export function BrandLogo({
  className,
}: {
  className?: string;
}): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 520 360"
      aria-hidden="true"
      className={["text-[var(--exam-text)]", className].filter(Boolean).join(" ")}
      width="520"
      height="360"
    >
      <path
        d="M54 342V100C54 50 116 28 151 64L274 205C290 223 307 223 322 206L376 145M132 342V146L232 326"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M286 142C286 87 329 54 379 54C437 54 477 96 477 151C477 182 466 206 448 229L355 342"
        fill="none"
        stroke="var(--exam-accent, #c1121f)"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BrandWordmark({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}): React.ReactElement {
  return (
    <span
      aria-label="MockNiner"
      className={[
        "-ml-0.5 inline-flex whitespace-nowrap leading-none tracking-[-0.075em] text-[var(--exam-text)] antialiased",
        size === "sm" ? "text-[1rem]" : "text-[1.55rem]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span aria-hidden="true" className="inline-flex items-baseline">
        <span className="font-light">Mock</span>
        <span className="font-medium text-[var(--exam-accent)]">Niner</span>
      </span>
    </span>
  );
}
