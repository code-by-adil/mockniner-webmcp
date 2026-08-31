import React from 'react';
import { QuestionLabel } from './QuestionLabel';

interface CheckboxOption {
    value: string;
    label: string;
}

interface CheckboxGroupProps {
    id: number | string; // Base ID for group? Or handle onChange specially
    questionNumber?: string | number | undefined;
    questionText?: React.ReactNode | undefined;
    options: CheckboxOption[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    maxSelections?: number | undefined;
    isReviewMode?: boolean | undefined;
    correctAnswers?: string[] | undefined; // Array of correct values (e.g. ['A', 'D'])
}

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({
    id,
    questionNumber,
    questionText,
    options,
    selectedValues = [],
    onChange,
    maxSelections,
    isReviewMode = false,
    correctAnswers
}) => {
    const groupName = `q-${id}`;

    const toggleValue = (val: string) => {
        if (isReviewMode) return;

        if (selectedValues.includes(val)) {
            onChange(selectedValues.filter(v => v !== val));
        } else {
            if (maxSelections && selectedValues.length >= maxSelections) return;
            onChange([...selectedValues, val]);
        }
    };

    return (
        <div id={`q-group-${id}`} className="mb-8 font-sans text-gray-900 text-sm">
            {(questionNumber || questionText) && (
                <div className="flex items-start gap-3 mb-3">
                    {questionNumber && <QuestionLabel>{questionNumber}</QuestionLabel>}
                    {questionText && (
                        <div className="font-medium leading-7 pt-0.5">
                            {questionText}
                        </div>
                    )}
                </div>
            )}

            <div className="ml-0 md:ml-10 space-y-2">
                {options.map((option) => {
                    const optionId = `${groupName}-${option.value}`;
                    const isSelected = selectedValues.includes(option.value);
                    const isCorrect = correctAnswers?.includes(option.value);

                    let cardStyle = 'border-transparent transition-colors';
                    let optionState = isSelected ? 'selected' : 'default';

                    if (isReviewMode) {
                        if (isCorrect) {
                            // It's a correct option
                            cardStyle = 'bg-green-50 border-green-500 font-bold text-green-800';
                            optionState = 'correct';
                        } else if (isSelected && !isCorrect) {
                            // User selected it but it's wrong
                            cardStyle = 'bg-red-50 border-red-500 opacity-80';
                            optionState = 'incorrect';
                        } else {
                            // Not selected, not correct
                            cardStyle = 'border-transparent opacity-50';
                            optionState = 'muted';
                        }
                    } else if (isSelected) {
                        cardStyle = 'border-transparent font-medium';
                    }

                    return (
                        <label
                            key={option.value}
                            htmlFor={optionId}
                            data-state={optionState}
                            className={`exam-option-row flex items-center gap-3 cursor-pointer p-2 rounded-sm border ${cardStyle}`}
                        >
                            <div className="relative flex items-center justify-center shrink-0">
                                <input
                                    id={optionId}
                                    name={groupName}
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleValue(option.value)}
                                    disabled={isReviewMode}
                                    className="peer appearance-none w-4 h-4 border border-gray-600 rounded-sm checked:bg-black checked:border-black bg-white disabled:cursor-not-allowed"
                                />
	                                <svg aria-hidden="true" className="absolute w-3 h-3 text-white pointer-events-none hidden peer-checked:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
	                                    <polyline points="20 6 9 17 4 12" />
	                                </svg>
                            </div>
                            <span className="leading-snug">{option.label}</span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};
