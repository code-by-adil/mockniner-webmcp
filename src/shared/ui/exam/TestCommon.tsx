import React from 'react';
import { ArrowDown } from 'lucide-react';

export const FlowBox: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`border border-black p-4 bg-white text-sm font-medium shadow-sm w-full relative leading-relaxed ${className}`}>
    {children}
  </div>
);

export const FlowArrow: React.FC = () => (
  <div className="flex justify-center my-2">
    <ArrowDown size={24} strokeWidth={2} className="text-black" />
  </div>
);

export const Bullet: React.FC = () => (
  <span className="w-1.5 h-1.5 bg-black rounded-full shrink-0 mt-2"></span>
);
