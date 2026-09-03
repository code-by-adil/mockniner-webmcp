// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebMcpHelpDialog } from "./WebMcpHelpDialog";

describe("WebMCP help dialog", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves copy feedback across close and reopen until its original timeout", async () => {
    const onClose = vi.fn();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const render = async (open: boolean) => {
      await act(async () => root.render(<WebMcpHelpDialog open={open} onClose={onClose} />));
    };
    await render(false);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    await render(true);
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
    expect(container.textContent).toContain("Practice with your agent");
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Copy prompt:"]');
    expect(buttons).toHaveLength(4);
    await act(async () => buttons[0].click());
    expect(writeText).toHaveBeenCalledWith("Create a short SAT-style practice test focused on algebra and inference.");
    expect(buttons[0].textContent).toBe("Copied");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click());
    expect(onClose).toHaveBeenCalledOnce();
    await render(false);
    await render(true);
    expect(container.textContent).toContain("Copied");
    await act(async () => vi.advanceTimersByTime(2000));
    expect(container.textContent).not.toContain("Copied");
  });
});
