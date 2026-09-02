import type { ReactElement } from "react";
import { Slash, Undo2 } from "lucide-react";
import {
  getAssessmentResponseGuidance,
  hasAssessmentResponse,
  type AssessmentInteraction,
  type AssessmentItem,
  type AssessmentResponse,
} from "@/domain/assessment";

type ChoiceInteraction = Extract<
  AssessmentInteraction,
  { type: "single_choice" | "multiple_choice" }
>;
type ChoiceOption = ChoiceInteraction["options"][number];

function ChoiceOptions({
  itemId,
  options,
  inputType,
  selectedOptionIds,
  selectionLimitReached,
  eliminatedOptionIds,
  onToggleSelection,
  onToggleEliminateOption,
  optionLabels = "ids",
}: {
  itemId: string;
  options: ChoiceOption[];
  inputType: "radio" | "checkbox";
  selectedOptionIds: string[];
  selectionLimitReached: boolean;
  eliminatedOptionIds: string[];
  onToggleSelection: (optionId: string) => void;
  onToggleEliminateOption?: (optionId: string) => void;
  optionLabels?: "ids" | "alphabetic";
}): ReactElement {
  return (
    <div className="space-y-3">
      {options.map((option, optionIndex) => {
        const selected = selectedOptionIds.includes(option.id);
        const eliminated = eliminatedOptionIds.includes(option.id);
        const disabledByLimit = selectionLimitReached && !selected;
        const disabled = eliminated || disabledByLimit;
        const rowState = eliminated
          ? "border-neutral-200/60 bg-neutral-100/50 opacity-50"
          : selected
            ? "border-[var(--exam-accent)] bg-neutral-50 shadow-xs"
            : disabledByLimit
              ? "border-neutral-200 bg-neutral-50 opacity-60"
              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50/50";

        return (
          <div
            key={option.id}
            className={`group flex items-center justify-between gap-3 rounded-xl border p-4 transition-all ${rowState}`}
          >
            <label
              className={`flex flex-1 items-start gap-3 select-text ${
                eliminated ? "line-through text-neutral-400" : disabled ? "cursor-not-allowed" : "cursor-pointer"
              }`}
            >
              <input
                type={inputType}
                name={inputType === "radio" ? itemId : undefined}
                value={option.id}
                checked={selected && !eliminated}
                disabled={disabled}
                onChange={() => onToggleSelection(option.id)}
                className="mt-1 cursor-pointer accent-[var(--exam-accent)] disabled:cursor-not-allowed"
              />
              <span className={`text-sm leading-6 ${eliminated ? "text-neutral-400" : "text-neutral-900"}`}>
                <strong className="mr-2 font-mono font-bold uppercase text-neutral-800">
                  {optionLabels === "alphabetic" ? String.fromCharCode(65 + optionIndex) : option.id}.
                </strong>
                {option.label}
              </span>
            </label>

            {onToggleEliminateOption ? (
              <button
                type="button"
                onClick={() => onToggleEliminateOption(option.id)}
                title={eliminated ? "Restore option" : "Eliminate option"}
                aria-label={eliminated ? `Restore option ${option.id}` : `Eliminate option ${option.id}`}
                className={`shrink-0 cursor-pointer rounded-lg p-1.5 transition-colors ${
                  eliminated
                    ? "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                    : "text-neutral-400 opacity-0 hover:bg-neutral-100 hover:text-neutral-700 focus:opacity-100 group-hover:opacity-100"
                }`}
              >
                {eliminated ? <Undo2 size={15} /> : <Slash size={15} />}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Guidance({
  instruction,
  issue,
  showIssue,
}: {
  instruction: string;
  issue?: string;
  showIssue: boolean;
}): ReactElement {
  return (
    <p className={`text-xs ${showIssue && issue ? "font-semibold text-amber-700" : "text-neutral-500"}`}>
      {instruction}
      {showIssue && issue ? ` ${issue}` : ""}
    </p>
  );
}

export function AssessmentInteractionView({
  item,
  response,
  onChange,
  eliminatedOptionIds = [],
  onToggleEliminateOption,
}: {
  item: AssessmentItem;
  response?: AssessmentResponse;
  onChange: (response: AssessmentResponse) => void;
  eliminatedOptionIds?: string[];
  onToggleEliminateOption?: (optionId: string) => void;
}): ReactElement {
  const interaction = item.interaction;
  const guidance = getAssessmentResponseGuidance(item, response);
  const showIssue = hasAssessmentResponse(response);

  if (interaction.type === "single_choice") {
    return (
      <fieldset className="space-y-3">
        <legend className="mb-2">
          <Guidance {...guidance} showIssue={showIssue} />
        </legend>
        <ChoiceOptions
          itemId={item.id}
          options={interaction.options}
          inputType="radio"
          selectedOptionIds={typeof response === "string" ? [response] : []}
          selectionLimitReached={false}
          eliminatedOptionIds={eliminatedOptionIds}
          onToggleSelection={(optionId) => onChange(optionId)}
          onToggleEliminateOption={onToggleEliminateOption}
        />
      </fieldset>
    );
  }

  if (interaction.type === "multiple_choice") {
    const selected = Array.isArray(response) ? response : [];
    const selectionLimitReached = interaction.maximumSelections !== undefined &&
      selected.length >= interaction.maximumSelections;
    return (
      <fieldset className="space-y-3">
        <legend className="mb-2">
          <Guidance {...guidance} showIssue={showIssue} />
        </legend>
        <ChoiceOptions
          itemId={item.id}
          options={interaction.options}
          inputType="checkbox"
          selectedOptionIds={selected}
          selectionLimitReached={selectionLimitReached}
          eliminatedOptionIds={eliminatedOptionIds}
          onToggleSelection={(optionId) => {
            onChange(selected.includes(optionId)
              ? selected.filter((id) => id !== optionId)
              : [...selected, optionId]);
          }}
          onToggleEliminateOption={onToggleEliminateOption}
        />
      </fieldset>
    );
  }

  if (interaction.type === "text_entry" || interaction.type === "numeric_entry") {
    return (
      <div className="space-y-2">
        <input
          type="text"
          inputMode={interaction.type === "numeric_entry" ? "decimal" : "text"}
          value={typeof response === "string" ? response : ""}
          onChange={(event) => onChange(event.target.value)}
          maxLength={interaction.type === "text_entry" ? interaction.maximumCharacters : undefined}
          placeholder={interaction.placeholder ?? "Enter your answer"}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3.5 text-base font-medium text-neutral-900 outline-none transition-colors focus:border-[var(--exam-accent)] focus:ring-2 focus:ring-neutral-200"
        />
        <Guidance {...guidance} showIssue={showIssue} />
      </div>
    );
  }

  if (interaction.type === "extended_text") {
    const value = typeof response === "string" ? response : "";
    const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
    return (
      <div className="space-y-2">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={interaction.placeholder ?? "Write your response"}
          rows={12}
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base leading-7 text-neutral-900 outline-none focus:border-[var(--exam-accent)] focus:ring-2 focus:ring-neutral-200"
        />
        <div className="flex items-start justify-between gap-4">
          <Guidance {...guidance} showIssue={showIssue} />
          <span className="shrink-0 text-xs text-neutral-500">{wordCount} words</span>
        </div>
      </div>
    );
  }

  const mapping = response && !Array.isArray(response) && typeof response === "object" ? response : {};
  if (interaction.type === "grouped_choice") {
    return (
      <div className="space-y-4">
        <Guidance {...guidance} showIssue={showIssue} />
        {interaction.groups.map((group) => (
          <fieldset key={group.id} className="rounded-xl border border-neutral-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-neutral-900">{group.label}</legend>
            <div className="mt-2">
              <ChoiceOptions
                itemId={`${item.id}-${group.id}`}
                options={group.options}
                inputType="radio"
                selectedOptionIds={mapping[group.id] ? [mapping[group.id]] : []}
                selectionLimitReached={false}
                eliminatedOptionIds={eliminatedOptionIds}
                onToggleSelection={(optionId) => onChange({ ...mapping, [group.id]: optionId })}
                onToggleEliminateOption={onToggleEliminateOption}
                optionLabels="alphabetic"
              />
            </div>
          </fieldset>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Guidance {...guidance} showIssue={showIssue} />
      {interaction.prompts.map((prompt) => (
        <label
          key={prompt.id}
          className="grid gap-2 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-[1fr_220px] sm:items-center"
        >
          <span className="text-sm leading-6 text-neutral-800">{prompt.label}</span>
          <select
            value={mapping[prompt.id] ?? ""}
            onChange={(event) => onChange({ ...mapping, [prompt.id]: event.target.value })}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Choose an option</option>
            {interaction.options.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
