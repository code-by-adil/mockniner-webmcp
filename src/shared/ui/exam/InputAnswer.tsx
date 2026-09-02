import React from 'react';
import { objectiveAnswerMatches } from '@/domain/objectiveScoring';

interface InputAnswerProps {
  questionNumber: number;
  value: string;
  onChange: (val: string) => void;
  width?: string | undefined;
  widthPx?: number | undefined;
  minWidthPx?: number | undefined;
  maxWidthPx?: number | undefined;
  /** Character width for inline blanks when `widthPx` is not set. */
  inputSize?: number | undefined;
  className?: string | undefined;
  showQuestionNumberLabel?: boolean | undefined;
  isReviewMode?: boolean | undefined;
  correctAnswer?: string | string[] | undefined;
}

export const InputAnswer: React.FC<InputAnswerProps> = ({
  questionNumber,
  value,
  onChange,
  width = "w-32",
  widthPx,
  minWidthPx,
  maxWidthPx,
  inputSize,
  className = "",
  showQuestionNumberLabel = false,
  isReviewMode = false,
  correctAnswer,
}) => {
  const fieldId = `question-input-${questionNumber}`;
  const fieldName = `question_${questionNumber}`;
  const hasValue = value.trim().length > 0;
  const isCorrect = isReviewMode && correctAnswer !== undefined && objectiveAnswerMatches(value, correctAnswer);
  const displayCorrect = isReviewMode ? (Array.isArray(correctAnswer) ? correctAnswer[0] : correctAnswer) : null;

  return (
    <span
      id={`question-${questionNumber}`}
      className={`inline-block relative align-middle ${className} group`}
    >
      {showQuestionNumberLabel ? (
        <span className="exam-answer-number-label" aria-hidden="true">
          {questionNumber}
        </span>
      ) : null}
      <input
        id={fieldId}
        name={fieldName}
        type="text"
        value={value}
        onChange={(e) => !isReviewMode && onChange(e.target.value)}
        disabled={isReviewMode}
        size={widthPx == null ? inputSize : undefined}
        style={
          widthPx == null
            ? undefined
            : {
                width: `${widthPx}px`,
                minWidth: minWidthPx == null ? undefined : `${minWidthPx}px`,
                maxWidth: maxWidthPx == null ? undefined : `${maxWidthPx}px`,
              }
        }
        className={`
          exam-answer-input ${widthPx == null && width ? width : ""} h-[30px] rounded-sm ${showQuestionNumberLabel ? "pl-7 pr-2" : "px-2"} text-center text-sm font-bold placeholder:text-gray-400
            ${isReviewMode
              ? isCorrect
                ? "is-review-correct border-2 border-green-600 bg-green-50 text-green-900 font-extrabold"
                : "is-review-incorrect border-2 border-red-500 bg-red-50 text-red-900 line-through decoration-red-500/50"
              : hasValue
                ? "is-filled"
                : "is-empty"}
          ${isReviewMode ? "cursor-default" : ""}
        `}
        placeholder={showQuestionNumberLabel ? "" : questionNumber.toString()}
        aria-label={`Question ${questionNumber}`}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
      />

      {isReviewMode && !isCorrect && displayCorrect ? (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg whitespace-nowrap font-medium flex items-center gap-2">
            <span className="text-red-300 font-bold">✓</span> {displayCorrect}
          </span>
          <span className="w-2 h-2 bg-gray-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
        </span>
      ) : null}

      {isReviewMode && isCorrect ? (
        <span className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 border border-green-200 shadow-sm z-10 pointer-events-none">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      ) : null}
    </span>
  );
};
