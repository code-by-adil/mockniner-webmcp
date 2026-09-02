import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { listeningDocument } from "@/content/objective";
import { ObjectivePartView } from "./ObjectivePartView";

describe("objective JSON renderer", () => {
  it("renders a canonical part directly without a component factory", () => {
    const html = renderToStaticMarkup(
      <ObjectivePartView
        part={listeningDocument.parts[0]}
        section="listening"
        answers={{}}
        onAnswerChange={() => undefined}
        isReviewMode={false}
      />,
    );
    expect(html).toContain("Questions 1–10");
    expect(html).toContain("question-1");
  });
});
