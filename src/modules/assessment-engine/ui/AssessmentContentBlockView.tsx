import type { ReactElement } from "react";
import type { AssessmentContentBlock } from "@/domain/assessment";

export function AssessmentContentBlockView({ block }: { block: AssessmentContentBlock }): ReactElement {
  switch (block.type) {
    case "text": {
      const classes = block.variant === "title"
        ? "text-xl font-bold text-neutral-950"
        : block.variant === "subtitle"
          ? "text-base font-semibold text-neutral-800"
          : block.variant === "muted"
            ? "text-sm leading-6 text-neutral-500"
            : "text-base leading-7 text-neutral-800";
      return <p className={classes}>{block.text}</p>;
    }
    case "passage":
      return (
        <article className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-5">
          {block.title ? <h3 className="mb-3 font-bold text-neutral-950">{block.title}</h3> : null}
          <div className="space-y-3 text-[15px] leading-7 text-neutral-800">
            {block.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </article>
      );
    case "math":
      return (
        <div
          aria-label={block.accessibleLabel ?? block.expression}
          className="whitespace-pre-line rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-center font-serif text-xl tracking-wide text-neutral-950"
        >
          {block.expression}
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full border-collapse text-left text-sm">
            {block.caption ? <caption className="bg-neutral-50 px-4 py-3 text-left font-semibold text-neutral-800">{block.caption}</caption> : null}
            <thead className="bg-neutral-100 text-neutral-700">
              <tr>{block.columns.map((column) => <th key={column} className="border-t border-neutral-200 px-4 py-2.5 font-semibold">{column}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-t border-neutral-200 bg-white">
                  {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-2.5 text-neutral-700">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "bar_chart": {
      const maximum = Math.max(...block.bars.map((bar) => Math.abs(bar.value)), 1);
      return (
        <figure className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-5">
          <figcaption className="mb-4 font-semibold text-neutral-900">{block.title}</figcaption>
          <div className="space-y-3">
            {block.bars.map((bar) => (
              <div key={bar.label} className="grid grid-cols-[80px_1fr_60px] items-center gap-3 text-sm">
                <span className="font-medium text-neutral-700">{bar.label}</span>
                <div className="h-5 overflow-hidden rounded-sm bg-neutral-200">
                  <div className="h-full bg-[var(--exam-accent)]" style={{ width: `${Math.abs(bar.value) / maximum * 100}%` }} />
                </div>
                <span className="text-right tabular-nums text-neutral-600">{bar.value}{block.unit ? ` ${block.unit}` : ""}</span>
              </div>
            ))}
          </div>
        </figure>
      );
    }
  }
}

