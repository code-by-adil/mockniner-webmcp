import { Check, X } from 'lucide-react';
import type { AssessmentItem, AssessmentResponse } from '@/domain/assessment';

type Option = { id: string; label: string };

function ChoiceAnswers({ options, selected, correct }: { options: Option[]; selected: string[]; correct?: string[] }) {
  return <ol className="space-y-2" aria-label="Answer choices">
    {options.map((option, index) => {
      const chosen = selected.includes(option.id);
      const right = correct?.includes(option.id);
      const wrong = chosen && correct !== undefined && !right;
      return <li key={option.id} className={`flex items-start gap-3 rounded-md border px-3 py-3 text-sm leading-6 ${right ? 'border-emerald-300 bg-emerald-50/60' : wrong ? 'border-red-300 bg-red-50/60' : chosen ? 'border-neutral-500 bg-neutral-50' : 'border-neutral-200'}`}>
        <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-current/20 text-xs font-semibold text-neutral-600">{String.fromCharCode(65 + index)}</span>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span>{option.label}</span>
          {chosen || right ? <span className={`mt-1 flex items-center gap-1 text-xs font-medium ${right ? 'text-emerald-800' : wrong ? 'text-red-800' : 'text-neutral-700'}`}>
            {right ? <Check size={13} aria-hidden="true" /> : wrong ? <X size={13} aria-hidden="true" /> : null}
            {chosen ? right ? 'Your answer · Correct' : 'Your answer' : 'Correct answer'}
          </span> : null}
        </div>
      </li>;
    })}
  </ol>;
}

function WrittenAnswer({ response, expected }: { response: string | undefined; expected?: string }) {
  return <dl className="space-y-5">
    <div>
      <dt className="mb-2 text-sm font-medium text-neutral-600">Your response</dt>
      <dd className="whitespace-pre-wrap rounded-md bg-neutral-50 px-4 py-3 text-base leading-7 text-neutral-900 [overflow-wrap:anywhere]">{response?.trim() ? response : 'No answer'}</dd>
    </div>
    {expected !== undefined ? <div>
      <dt className="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-800"><Check size={15} aria-hidden="true" />Correct answer</dt>
      <dd className="text-base leading-7 text-neutral-900 [overflow-wrap:anywhere]">{expected}</dd>
    </div> : null}
  </dl>;
}

export function AssessmentReviewAnswer({ item, response, showAnswers, correct }: {
  item: AssessmentItem; response: AssessmentResponse | undefined; showAnswers: boolean; correct: boolean | null;
}) {
  const { interaction, scoring } = item;
  if (interaction.type === 'single_choice' || interaction.type === 'multiple_choice') {
    const selected = Array.isArray(response) ? response : typeof response === 'string' && response ? [response] : [];
    const key = showAnswers ? scoring.type === 'exact' ? [scoring.answer] : scoring.type === 'set' ? scoring.answers : undefined : undefined;
    return <ChoiceAnswers options={interaction.options} selected={selected} correct={key} />;
  }
  if (interaction.type === 'grouped_choice' || interaction.type === 'matching') {
    const saved = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
    const key = showAnswers && scoring.type === 'mapping' ? scoring.answers : undefined;
    const groups = interaction.type === 'grouped_choice' ? interaction.groups : interaction.prompts.map(prompt => ({ ...prompt, options: interaction.options }));
    return <div className="space-y-6">{groups.map(group => <section key={group.id} aria-label={group.label}>
      <h4 className="mb-2 text-sm font-semibold">{group.label}</h4>
      <ChoiceAnswers options={group.options} selected={saved[group.id] ? [saved[group.id]] : []} correct={key ? [key[group.id]] : undefined} />
    </section>)}</div>;
  }
  const expected = showAnswers && correct === false
    ? scoring.type === 'numeric' ? String(scoring.answer)
      : scoring.type === 'aliases' ? scoring.answers.join(' / ')
        : scoring.type === 'exact' ? scoring.answer : undefined
    : undefined;
  return <WrittenAnswer response={typeof response === 'string' ? response : undefined} expected={expected} />;
}
