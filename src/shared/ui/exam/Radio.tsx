import React from 'react';

interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
    isReviewMode?: boolean;
    isCorrect?: boolean;
    isSelected?: boolean; // explicit override if needed, otherwise derived from checked
}

export const Radio: React.FC<RadioProps> = ({
    isReviewMode,
    isCorrect,
    isSelected,
    className,
    ...props
}) => {
    // If not passed explicitly, isSelected is true if checked is true
    const selected = isSelected ?? props.checked;

    return (
        <div className={`relative flex items-center justify-center shrink-0 ${className || ''}`}>
            <input
                type="radio"
                className="peer appearance-none w-4 h-4 rounded-full border border-gray-600 checked:border-black checked:bg-white bg-white disabled:cursor-not-allowed"
                {...props}
            />
            <div
                className={`absolute w-2 h-2 rounded-full scale-0 peer-checked:scale-100 transition-transform ${isReviewMode && !isCorrect && selected ? 'bg-red-600' : 'bg-black'
                    }`}
            />
        </div>
    );
};
