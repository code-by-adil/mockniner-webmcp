import { describe, expect, it, vi } from "vitest";
import { compileSmokeTests, runSmokeTest } from "webmcp-evals/dist/evaluator/smokeEvaluator.js";
import { assertSmokeResult, checkedSmokeRegistry } from "./smoke.mjs";

describe("application smoke assertions", () => {
  it.each([
    { ok: false, error: { code: "INVALID_ASSESSMENT", message: "Rejected", retryable: true } },
    { success: true },
    null,
    "not JSON",
  ])("rejects a non-success application result: %j", result => {
    expect(() => assertSmokeResult(result)).toThrow();
  });

  it("checks persisted content and accepts serialized application success", () => {
    const expected = { ok: true, data: { package: { packageId: "saved", revision: 1 } } };
    expect(assertSmokeResult(JSON.stringify(expected), expected)).toEqual(expected);
    expect(() => assertSmokeResult({ ok: true, data: { package: { packageId: "other", revision: 1 } } }, expected)).toThrow("readback mismatch");
  });

  it("stops the pinned upstream runner when the application rejects a call", async () => {
    const fixture = { name: "checked authoring", messages: [], expectedCall: [
      { functionName: "install_assessment", arguments: {} },
      { functionName: "get_assessment_content", arguments: { packageId: "missing" } },
    ] };
    const executeToolChecked = vi.fn(async () => ({ success: true,
      result: { ok: false, error: { code: "INVALID_ASSESSMENT", message: "Rejected", retryable: true } } }));
    const registry = checkedSmokeRegistry({
      getCurrentTools: () => fixture.expectedCall.map(call => ({ functionName: call.functionName })),
      executeToolChecked,
    }, fixture);
    const results = await runSmokeTest(compileSmokeTests([fixture])[0], registry);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ outcome: "error", error: expect.stringContaining("INVALID_ASSESSMENT") });
    expect(executeToolChecked).toHaveBeenCalledOnce();
  });

  it("rejects a successful read with missing persisted data", async () => {
    const fixture = { name: "saved practice", messages: [], expectedCall: [
      { functionName: "get_practice_library", arguments: { kind: "writing" },
        result: { ok: true, data: { items: [{ contentKey: "saved-writing" }] } } },
    ] };
    const registry = checkedSmokeRegistry({
      getCurrentTools: () => [{ functionName: "get_practice_library" }],
      executeToolChecked: async () => ({ success: true, result: { ok: true, data: { items: [] } } }),
    }, fixture);
    const results = await runSmokeTest(compileSmokeTests([fixture])[0], registry);
    expect(results[0]).toMatchObject({ outcome: "error", error: expect.stringContaining("readback mismatch") });
  });
});
