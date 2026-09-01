import type { ReactElement } from "react";
import type {
  AssessmentItem,
  AssessmentResponse,
} from "@/domain/assessment";

export function AssessmentInteractionView({
  item,
  response,
  onChange,
}: {
  item: AssessmentItem;
  response?: AssessmentResponse;
  onChange: (response: AssessmentResponse) => void;
}): ReactElement {
  const interaction = item.interaction;
  if (interaction.type === "single_choice") {
    return (
      <fieldset className="space-y-3">
        <legend className="sr-only">Choose one answer</legend>
        {interaction.options.map((option) => {
          const checked = response === option.id;
          return (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? "border-[var(--exam-accent)] bg-red-50/50" : "border-neutral-200 bg-white hover:bg-neutral-50"}`}>
              <input type="radio" name={item.id} value={option.id} checked={checked} onChange={() => onChange(option.id)} className="mt-1 accent-[var(--exam-accent)]" />
              <span className="text-sm leading-6 text-neutral-800"><strong className="mr-2 uppercase">{option.id}.</strong>{option.label}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (interaction.type === "multiple_choice") {
    const selected = Array.isArray(response) ? response : [];
    return (
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xs font-medium text-neutral-500">Select all that apply.</legend>
        {interaction.options.map((option) => {
          const checked = selected.includes(option.id);
          return (
            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${checked ? "border-[var(--exam-accent)] bg-red-50/50" : "border-neutral-200 bg-white"}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked
                    ? selected.filter((id) => id !== option.id)
                    : [...selected, option.id];
                  if (!checked && interaction.maximumSelections && next.length > interaction.maximumSelections) return;
                  onChange(next);
                }}
                className="mt-1 accent-[var(--exam-accent)]"
              />
              <span className="text-sm leading-6 text-neutral-800">{option.label}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (interaction.type === "text_entry" || interaction.type === "numeric_entry") {
    return (
      <input
        type="text"
        inputMode={interaction.type === "numeric_entry" ? "decimal" : "text"}
        value={typeof response === "string" ? response : ""}
        onChange={(event) => onChange(event.target.value)}
        maxLength={interaction.type === "text_entry" ? interaction.maximumCharacters : undefined}
        placeholder={interaction.placeholder ?? "Enter your answer"}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none focus:border-[var(--exam-accent)] focus:ring-2 focus:ring-red-100"
      />
    );
  }
  if (interaction.type === "extended_text") {
    const value = typeof response === "string" ? response : "";
    const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
    return (
      <div>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={interaction.placeholder ?? "Write your response"}
          rows={12}
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base leading-7 text-neutral-900 outline-none focus:border-[var(--exam-accent)] focus:ring-2 focus:ring-red-100"
        />
        <div className="mt-2 text-right text-xs text-neutral-500">{wordCount} words</div>
      </div>
    );
  }
  const mapping = response && !Array.isArray(response) && typeof response === "object" ? response : {};
  return (
    <div className="space-y-3">
      {interaction.prompts.map((prompt) => (
        <label key={prompt.id} className="grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[1fr_220px] sm:items-center">
          <span className="text-sm leading-6 text-neutral-800">{prompt.label}</span>
          <select
            value={mapping[prompt.id] ?? ""}
            onChange={(event) => onChange({ ...mapping, [prompt.id]: event.target.value })}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Choose an option</option>
            {interaction.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
