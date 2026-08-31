import type { WritingTask1 } from "@/domain/writingContent";

type Props = {
  chart: WritingTask1["chart"];
};

export function WritingBarChart({ chart }: Props) {
  const largestValue = Math.max(...chart.rows.flatMap((row) => row.values));
  const tickStep = Math.max(1, Math.ceil(largestValue / 60) * 10);
  const axisMaximum = tickStep * 6;
  const ticks = Array.from({ length: 7 }, (_, index) => index * tickStep);

  return (
    <div className="mb-8 select-none pt-4">
      <h4 className="mb-10 text-center text-sm font-bold">
        {chart.title}
        <br />
        {chart.years.join(" and ")}
      </h4>

      <div className="relative mb-24 ml-8 mr-auto h-[220px] max-w-[500px] border-b border-l border-black sm:ml-12 sm:h-[320px]">
        <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-center text-[10px] font-bold sm:-left-12 sm:text-xs">
          {chart.unit}
        </div>

        <div className="pointer-events-none absolute inset-0">
          {ticks.map((value) => (
            <div
              key={value}
              className="absolute left-0 flex w-full items-center"
              style={{ bottom: `${(value / axisMaximum) * 100}%` }}
            >
              <span className="absolute right-full mr-1 translate-y-1/2 text-[10px] font-medium sm:mr-2 sm:text-xs">
                {value}
              </span>
              <div className="absolute -left-1.5 w-1.5 border-t border-black" />
              {value > 0 ? <div className="z-0 w-full border-t border-gray-400" /> : null}
            </div>
          ))}
        </div>

        <div className="absolute inset-0 z-10 flex items-end gap-2 px-2 sm:gap-6 sm:px-4">
          {chart.rows.map((row) => (
            <div
              key={row.label}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              {row.values.map((value, seriesIndex) => (
                <div
                  key={`${row.label}-${chart.years[seriesIndex]}`}
                  className={seriesIndex === 0 ? "relative w-full bg-[#333]" : "relative w-full bg-[#999]"}
                  style={{ height: `${(value / axisMaximum) * 100}%` }}
                >
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-black px-1 text-[10px] text-white opacity-0 shadow-sm group-hover:opacity-100">
                    {chart.years[seriesIndex]}: {value}
                  </div>
                </div>
              ))}
              <div className="absolute left-1/2 top-full h-0 w-0 overflow-visible">
                <span className="absolute left-0 top-2 origin-top-left rotate-45 whitespace-nowrap text-[11px] font-medium text-gray-800">
                  {row.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ml-8 mr-auto max-w-[500px] text-center sm:ml-12">
        <div className="mb-6 text-xs font-bold">Category</div>
        <div className="flex justify-center gap-8">
          {chart.years.map((year, index) => (
            <div key={year} className="flex items-center gap-2 text-xs font-bold">
              <div className={index === 0 ? "h-4 w-4 bg-[#333]" : "h-4 w-4 bg-[#999]"} />
              {year}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
