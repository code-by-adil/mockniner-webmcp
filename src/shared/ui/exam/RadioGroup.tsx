import React from 'react';
import { QuestionLabel } from './QuestionLabel';
import { Radio } from './Radio';

interface RadioOption {
    value: string;
    label: React.ReactNode;
}

interface RadioGroupProps {
    id: number | string;
    questionNumber?: string | number | undefined;
    questionText?: React.ReactNode | undefined;
    options: RadioOption[];
    value: string | undefined;
    onChange: (val: string) => void;
    layout?: 'vertical' | 'horizontal' | 'grid' | undefined;
    isReviewMode?: boolean | undefined;
    correctAnswer?: string | undefined;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
    id,
    questionNumber,
    questionText,
    options,
    value,
    onChange,
    layout = 'vertical',
    isReviewMode = false,
    correctAnswer
}) => {
    const containerClasses = {
        vertical: 'space-y-2',
        horizontal: 'flex flex-wrap gap-6',
        grid: 'grid grid-cols-1 md:grid-cols-2 gap-4'
    };

    return (
        <div id={`question-${id}`} className="mb-8 font-sans text-gray-900 text-sm">
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

            <div className={`ml-0 md:ml-10 ${containerClasses[layout]}`}>
                {options.map((option) => {
                    const isSelected = value === option.value;
                    const isCorrect = correctAnswer === option.value;

                    let cardStyle = 'border-transparent transition-colors';
                    let optionState = isSelected ? 'selected' : 'default';

                    if (isReviewMode) {
                        if (isCorrect) {
                            cardStyle = 'bg-green-50 border-green-500 font-bold text-green-800';
                            optionState = 'correct';
                        } else if (isSelected && !isCorrect) {
                            cardStyle = 'bg-red-50 border-red-500 opacity-80';
                            optionState = 'incorrect';
                        } else {
                            cardStyle = 'border-transparent opacity-50';
                            optionState = 'muted';
                        }
                    } else if (isSelected) {
                        cardStyle = 'border-transparent font-medium';
                    }

                    return (
                        <label
                            key={option.value}
                            data-state={optionState}
                            className={`
                exam-option-row flex items-start gap-3 cursor-pointer p-2 rounded-sm border
                ${cardStyle}
                ${layout === 'horizontal' ? 'min-w-[120px]' : ''}
              `}
                        >
                            <Radio
                                name={`q-${id}`}
                                value={option.value}
                                checked={isSelected}
                                onChange={() => !isReviewMode && onChange(option.value)}
                                disabled={isReviewMode}
                                isReviewMode={isReviewMode}
                                isCorrect={isCorrect}
                                isSelected={isSelected}
                                className="mt-0.5"
                            />
                            <span className="leading-snug">
                                {option.label}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};
