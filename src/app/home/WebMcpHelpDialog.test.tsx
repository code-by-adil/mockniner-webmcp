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
    expect(container.querySelector('dialog')?.open).toBe(false);
    await render(true);
    const dialog = container.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain('Practice with your agent');
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
    await act(async () => vi.advanceTimersByTime(2500));
    expect(container.textContent).not.toContain("Copied");
  });

  it('uses native modal opening and forwards Escape dismissal', async () => {
    const onClose = vi.fn();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    await act(async () => root.render(<WebMcpHelpDialog open onClose={onClose} />));
    expect(showModal).toHaveBeenCalledOnce();
    await act(async () => container.querySelector('dialog')!.dispatchEvent(new Event('cancel')));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => root.render(<WebMcpHelpDialog open={false} onClose={onClose} />));
    expect(container.querySelector('dialog')!.open).toBe(false);
  });

  it('keeps help text selectable and reports clipboard failure', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Denied'));
    await act(async () => root.render(<WebMcpHelpDialog open onClose={vi.fn()} />));
    const button = container.querySelector<HTMLButtonElement>('button[aria-label^="Copy prompt:"]')!;
    await act(async () => button.click());
    expect(button.textContent).toBe('Copy');
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Select and copy the text');
    expect(container.querySelector('.select-text')?.textContent).toContain('Create a short SAT-style practice test');
  });
});
