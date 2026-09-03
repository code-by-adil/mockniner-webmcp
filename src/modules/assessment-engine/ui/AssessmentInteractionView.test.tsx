import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseAssessmentPackage } from "@/domain/assessment";
import { AssessmentInteractionView } from "./AssessmentInteractionView";

const assessment = parseAssessmentPackage({
  schemaVersion: 4,
  packageId: "interaction-rendering",
  revision: 1,
  title: "Interaction rendering",
  source: "built-in",
  parts: [{
    id: "part",
    title: "Part",
    items: [{
      id: "multiple",
      prompt: [{ type: "text", text: "Choose two." }],
      interaction: {
        type: "multiple_choice",
        minimumSelections: 2,
        maximumSelections: 2,
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
          { id: "c", label: "C" },
        ],
      },
      scoring: { type: "set", answers: ["a", "b"] },
    }, {
      id: "grouped",
      prompt: [{ type: "text", text: "Complete both blanks." }],
      interaction: {
        type: "grouped_choice",
        groups: [
          {
            id: "blank-1",
            label: "Blank 1",
            options: [{ id: "b1-a", label: "first" }, { id: "b1-b", label: "second" }],
          },
          {
            id: "blank-2",
            label: "Blank 2",
            options: [{ id: "b2-a", label: "third" }, { id: "b2-b", label: "fourth" }],
          },
        ],
      },
      scoring: { type: "mapping", answers: { "blank-1": "b1-b", "blank-2": "b2-a" } },
    }],
  }],
});

describe("universal assessment interactions", () => {
  it("renders selection limits and disables additional choices at the maximum", () => {
    const html = renderToStaticMarkup(
      <AssessmentInteractionView
        item={assessment.parts[0]!.items[0]!}
        response={["a", "b"]}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Choose exactly 2 answers.");
    expect(html).toMatch(/disabled=""[^>]*value="c"/);
  });

  it("renders a repairable message for a constrained partial response", () => {
    const html = renderToStaticMarkup(
      <AssessmentInteractionView
        item={assessment.parts[0]!.items[0]!}
        response={["a"]}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Select 1 more answer.");
  });

  it("renders independent choices for every grouped-choice group", () => {
    const html = renderToStaticMarkup(
      <AssessmentInteractionView
        item={assessment.parts[0]!.items[1]!}
        response={{ "blank-1": "b1-b" }}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Choose one answer for each group.");
    expect(html).toContain("Complete 1 more group.");
    expect(html).toContain("Blank 1");
    expect(html).toContain("Blank 2");
    expect(html).toMatch(/checked=""[^>]*value="b1-b"/);
    expect(html).toMatch(/>A\.<\/strong>/);
    expect(html).not.toContain(">B1-A.</strong>");
  });
});
