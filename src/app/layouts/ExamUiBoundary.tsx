import type { ReactNode } from "react";

export function ExamUiBoundary({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["ui-layer-exam", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
