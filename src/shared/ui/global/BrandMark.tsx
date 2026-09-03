import type { ReactElement } from "react";

export function BrandMark({ compact = false }: { compact?: boolean }): ReactElement {
  return (
    <div role="img" aria-label="MockNiner" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <img
        src="/mockniner-logo.svg"
        alt=""
        width="520"
        height="360"
        className="h-8 w-[46px] sm:h-9 sm:w-[52px]"
      />
      <div className={`${compact ? 'hidden sm:flex' : 'flex'} flex-col justify-center leading-none`}>
        <span className="-ml-0.5 inline-flex whitespace-nowrap text-[1.15rem] tracking-[-0.075em] text-neutral-950 antialiased sm:text-[1.55rem]">
          <span className="font-light">Mock</span><span className="font-medium text-[#c1121f]">Niner</span>
        </span>
        <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-500 sm:text-[9px]">
          Practice with your agent
        </span>
      </div>
    </div>
  );
}
