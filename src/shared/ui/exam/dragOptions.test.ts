import { describe, expect, it } from "vitest";
import { canAssignDragOption, type DragOption } from "./dragOptions";

const options: DragOption[] = [
  { value: "a", label: "Available", isUsed: false, isReviewMode: false },
  { value: "b", label: "Used", isUsed: true, isReviewMode: false },
  { value: "c", label: "Review", isUsed: false, isReviewMode: true },
];

describe("explicit drag options", () => {
  it("accepts available options and the target's current value", () => {
    expect(canAssignDragOption(options, "a")).toBe(true);
    expect(canAssignDragOption(options, "b", "b")).toBe(true);
  });

  it("rejects unknown, used, and review-only options", () => {
    expect(canAssignDragOption(options, "unknown")).toBe(false);
    expect(canAssignDragOption(options, "b")).toBe(false);
    expect(canAssignDragOption(options, "c")).toBe(false);
    expect(canAssignDragOption(options, "c", "c")).toBe(false);
  });
});
