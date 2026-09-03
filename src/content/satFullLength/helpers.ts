import type { AssessmentContentBlock, AssessmentItem } from '@/domain/assessment';

export function choice(id: string, domain: string, skill: string, passage: string, question: string, options: [string, string, string, string], answer: 'a' | 'b' | 'c' | 'd', extra: AssessmentContentBlock[] = []): AssessmentItem {
  return { id, domain, skill, stimulus: [...(passage ? [{ type: 'passage' as const, paragraphs: passage.split('\n\n') }] : []), ...extra],
    prompt: [{ type: 'text', text: question }], interaction: { type: 'single_choice', options: options.map((label, i) => ({ id: String.fromCharCode(97 + i), label })) }, scoring: { type: 'exact', answer } };
}
export function numeric(id: string, domain: string, skill: string, question: string, answer: number, stimulus: AssessmentContentBlock[] = []): AssessmentItem {
  return { id, domain, skill, stimulus, prompt: [{ type: 'text', text: question }], interaction: { type: 'numeric_entry' }, scoring: { type: 'numeric', answer } };
}
