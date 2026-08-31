import React from "react";
import type { ObjectiveInputLine } from "@ielts/shared";

type FlowchartCompletionProps = {
  title?: string | undefined;
  items: ObjectiveInputLine[];
  density?: "comfortable" | "compact";
  renderGap: (questionId: number, width?: number) => React.ReactNode;
};

function FlowchartArrow() {
  return (
    <div className="exam-flowchart-arrow" aria-hidden="true">
      <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M9 3v9M5.5 10.5 9 14l3.5-3.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function FlowchartCompletion({
  title,
  items,
  density = "comfortable",
  renderGap,
}: FlowchartCompletionProps) {
  const stepPadding = density === "compact" ? "px-5 py-3" : "px-6 py-3.5";

  return (
    <div className="exam-flowchart mb-8">
      {title ? <h3 className="exam-flowchart-title">{title}</h3> : null}
      <div className="exam-flowchart-steps">
        {items.map((item, index) => (
          <div key={item.questionId} className="exam-flowchart-step-group">
            <div className={`exam-flowchart-step ${stepPadding}`}>
              <p className="exam-flowchart-step-text">
                <span>{item.prefix}</span> {renderGap(item.questionId, item.width)}
                {item.suffix ? <span> {item.suffix}</span> : null}
              </p>
            </div>
            {index < items.length - 1 ? <FlowchartArrow /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
