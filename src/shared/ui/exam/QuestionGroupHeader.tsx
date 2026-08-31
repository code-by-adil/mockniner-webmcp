import React from 'react';

interface Props {
  title: string;
  instruction?: React.ReactNode;
  className?: string;
}

export const QuestionGroupHeader: React.FC<Props> = ({
  title,
  instruction,
  className = ''
}) => {
  return (
    <div className={`bg-[#f0f0f0] p-4 mb-6 rounded-sm border border-gray-200 ${className}`}>
      <h4 className="font-bold text-sm mb-2 text-gray-900">{title}</h4>
      {instruction && (
        <div className="text-sm text-gray-800 leading-relaxed">
          {instruction}
        </div>
      )}
    </div>
  );
};
