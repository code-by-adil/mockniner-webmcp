import { InputAnswer } from "./InputAnswer";

type Props = {
  questionNumber: number;
  prefix: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
  isReviewMode: boolean;
  correctAnswer?: string | string[];
  className?: string;
};

export function InlineCompletion({
  questionNumber,
  prefix,
  suffix,
  value,
  onChange,
  isReviewMode,
  correctAnswer,
  className = "",
}: Props) {
  const display = value.trim() || String(questionNumber);
  const inputSize = Math.min(28, Math.max(8, (display.length + 1) * 2));
  return (
    <p className={`exam-inline-completion ${className}`}>
      <span
        className="exam-inline-question-number exam-inline-question-number--in-flow"
        style={{ fontWeight: 800 }}
      >
        {questionNumber}.
      </span>
      <span>{prefix}</span>
      <InputAnswer
        questionNumber={questionNumber}
        value={value}
        onChange={onChange}
        width=""
        inputSize={inputSize}
        className="exam-inline-completion-answer"
        isReviewMode={isReviewMode}
        correctAnswer={correctAnswer}
      />
      {suffix ? <span>{suffix}</span> : null}
    </p>
  );
}
