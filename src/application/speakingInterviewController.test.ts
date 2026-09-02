import { describe, expect, it, vi } from 'vitest'
import { createSpeakingInterviewController } from './speakingInterviewController'
import { defaultSpeakingPlan } from '@/domain/speakingPlan'

describe('Speaking plan command bridge', () => {
  it.each(['preparing', 'buffering', 'speaking', 'thinking', 'ready', 'starting', 'recording', 'stopping', 'saving', 'error', 'save-error'])(
    'protects the %s lifecycle from agent navigation', phase => {
      const controller = createSpeakingInterviewController();
      controller.bind({ configure: vi.fn(), read: () => ({ phase, currentQuestion: 1, totalQuestions: 10, recordedAnswers: 0, skippedAnswers: 0 }) });
      expect(controller.canLeave()).toBe(false);
    },
  );
  it('only leaves setup if it has no unsaved response records', () => {
    const controller = createSpeakingInterviewController();
    const progress = { phase: 'setup', currentQuestion: 1, totalQuestions: 10, recordedAnswers: 0, skippedAnswers: 0 };
    controller.bind({ configure: vi.fn(), read: () => progress });
    expect(controller.canLeave()).toBe(true);
    progress.skippedAnswers = 1;
    expect(controller.canLeave()).toBe(false);
  });
  it('uses the visible runner and exposes no live transcripts', () => {
    const controller = createSpeakingInterviewController()
    expect(() => controller.configure(defaultSpeakingPlan)).toThrow('Open Speaking')
    const configure = vi.fn()
    const unbind = controller.bind({ configure, read: () => ({ phase: 'recording', currentQuestion: 2, totalQuestions: 12, recordedAnswers: 1, skippedAnswers: 0 }) })
    expect(controller.configure(defaultSpeakingPlan)).toMatchObject({ status: 'ready', questions: 12 })
    expect(configure).toHaveBeenCalledOnce()
    expect(controller.read()).toEqual({ active: true, phase: 'recording', currentQuestion: 2, totalQuestions: 12, recordedAnswers: 1, skippedAnswers: 0 })
    unbind()
    expect(controller.read()).toEqual({ active: false, phase: 'closed' })
  })
  it('does not let stale cleanup unbind a newer interview', () => {
    const controller = createSpeakingInterviewController()
    const first = { configure: vi.fn(), read: vi.fn() }
    const second = { configure: vi.fn(), read: vi.fn() }
    const disposeFirst = controller.bind(first)
    controller.bind(second); disposeFirst()
    controller.configure(defaultSpeakingPlan)
    expect(first.configure).not.toHaveBeenCalled()
    expect(second.configure).toHaveBeenCalledOnce()
  })
})
