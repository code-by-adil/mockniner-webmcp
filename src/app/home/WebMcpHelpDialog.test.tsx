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
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain('How to use MockNiner');
    expect(container.textContent).toContain('Copy a prompt into your agent chat');
    const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Copy prompt:"]');
    expect(buttons).toHaveLength(4);
    await act(async () => buttons[0].click());
    expect(writeText).toHaveBeenCalledWith('Open https://assessment-lab.dgkhan08.workers.dev/ in your browser. Create a 20-minute GRE-style diagnostic with verbal and quantitative questions and add it to my practice library. Let me answer and submit it myself.');
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
    expect(container.querySelector('.select-text')?.textContent).toContain('20-minute GRE-style diagnostic');
  });

  it('explains agent-free practice, explicit feedback requests, and site-inclusive examples', async () => {
    await act(async () => root.render(<WebMcpHelpDialog open onClose={vi.fn()} />));
    expect(container.querySelectorAll('ol > li')).toHaveLength(3);
    expect(container.textContent).toContain('Ready-made tests work without an agent');
    expect(container.textContent).toContain('it does not arrive automatically');
    expect(container.textContent).toContain('not synced to an account');
    const prompts = [...container.querySelectorAll('.select-text')].map(element => element.textContent!);
    for (const text of prompts.slice(0, 3)) {
      expect(text).toContain('https://assessment-lab.dgkhan08.workers.dev/');
      expect(text).toContain('Let me answer and submit it myself');
    }
    expect(prompts[1]).toContain('IELTS Academic Reading');
    expect(prompts[2]).toContain('biology');
    expect(prompts[3]).toContain('completed attempt I have open');
  });
});
