import React from 'react';

interface Props {
  children: React.ReactNode;
  className?: string;
}

export const QuestionLabel: React.FC<Props> = ({ children, className = "" }) => {
  return (
    <span className={`
      border border-black text-xs font-bold px-1 h-6 flex items-center justify-center min-w-[28px] mt-[2px] bg-white text-black select-none
      ${className}
    `}>
      {children}
    </span>
  );
};
