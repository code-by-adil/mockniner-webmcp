import React from "react";
import { BrandLogo } from "@/shared/ui/global/BrandLogo";

export function ExamBrandMark(): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0" aria-label="MockNiner IELTS exam simulator">
      <BrandLogo className="h-8 w-[46px] text-gray-950 sm:h-9 sm:w-[52px]" />
      <div className="flex translate-y-[2px] flex-col justify-center leading-none sm:translate-y-0">
        <h1 className="leading-none">
          <span
            aria-label="MockNiner"
            className="-ml-0.5 inline-flex whitespace-nowrap text-[1.15rem] leading-none tracking-[-0.075em] text-gray-950 antialiased sm:text-[1.55rem]"
          >
            <span aria-hidden="true" className="inline-flex items-baseline">
              <span className="font-light">Mock</span>
              <span className="font-medium text-[#5a64ff]">Niner</span>
            </span>
          </span>
        </h1>
        <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-[#D40000] sm:text-[10px]">
          IELTS Mock Test
        </p>
      </div>
    </div>
  );
}
