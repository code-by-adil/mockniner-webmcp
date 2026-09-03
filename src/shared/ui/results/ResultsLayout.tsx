import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { BrandMark } from '@/shared/ui/global/BrandMark';
import { StorageButton } from '@/app/WorkspaceStorage';
import './results.css';

// Adapted from MockNiner's result shell, score summary and part breakdown.
// Scores and labels belong to the caller so this layout is independent of exam type.
export function ResultsLayout({ title, subtitle, onBack, backLabel = 'Back to practice', children, style, footer, compactHeading = false }: {
  title: string; subtitle?: ReactNode; onBack: () => void; backLabel?: string;
  children: ReactNode; style?: CSSProperties; footer?: ReactNode;
  compactHeading?: boolean;
}) {
  return <div className="results-page min-h-screen bg-white text-neutral-950" style={style}>
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-8">
        <BrandMark /><StorageButton />
      </div>
    </header>
    <main className="mx-auto max-w-[1280px] px-4 pb-12 pt-5 sm:px-8 sm:pt-7">
      {compactHeading ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 pb-4">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <h1 className="text-lg font-semibold leading-6 tracking-tight">{title}</h1>
          {subtitle ? <div className="mt-1 text-xs text-neutral-600">{subtitle}</div> : null}
        </div>
        <button type="button" onClick={onBack} className="result-back inline-flex min-h-10 items-center gap-2 text-sm text-neutral-600 hover:text-neutral-950"><ArrowLeft size={16} aria-hidden="true" />{backLabel}</button>
      </div> : <>
      <button type="button" onClick={onBack} className="result-back mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-neutral-600 hover:text-neutral-950">
        <ArrowLeft size={16} aria-hidden="true" />{backLabel}
      </button>
      <div className="mb-7 [overflow-wrap:anywhere]">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {subtitle ? <div className="mt-2 text-sm leading-6 text-neutral-600">{subtitle}</div> : null}
      </div>
      </>}
      {children}
      {footer ? <footer className="mt-10 border-t border-neutral-200 pt-5 text-xs leading-5 text-neutral-600">{footer}</footer> : null}
    </main>
  </div>;
}

export function ResultScore({ label, score, maximum, detail, metrics, actions }: {
  label: string; score: ReactNode; maximum?: number; detail?: string;
  metrics: { label: string; value: ReactNode }[]; actions?: ReactNode;
}) {
  return <section aria-label="Result summary" className="grid gap-6 border-y border-neutral-200 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-10 sm:py-8">
    <div>
      <h2 className="text-sm font-medium text-neutral-600">{label}</h2>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">
        {score}{maximum !== undefined ? <span className="text-2xl font-normal text-neutral-500">/ {maximum}</span> : null}
      </p>
      {detail ? <p className="mt-3 text-sm leading-6 text-neutral-600">{detail}</p> : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
    <div className="flex flex-col justify-center">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-5">
        {metrics.map(metric => <div key={metric.label}>
          <dt className="text-sm text-neutral-600">{metric.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{metric.value}</dd>
        </div>)}
      </dl>
      <p className="mt-5 flex items-center gap-1.5 text-xs text-neutral-600"><Check size={14} aria-hidden="true" />Saved in this browser</p>
    </div>
  </section>;
}

export function ResultAction({ children, onClick, secondary = false }: { children: ReactNode; onClick: () => void; secondary?: boolean }) {
  return <button type="button" onClick={onClick} className={`result-action inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${secondary ? 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50' : 'bg-[var(--exam-accent,#b91c1c)] text-white hover:bg-[var(--exam-accent-hover,#991b1b)]'}`}>
    {children}<ArrowRight size={16} aria-hidden="true" />
  </button>;
}

export type ResultBreakdownRow = { id: string; label: string; detail?: string; correct?: number; total: number; unanswered: number; unscored?: number; pending?: number; onReview?: () => void };

export function ResultBreakdown({ title, rows }: { title: string; rows: ResultBreakdownRow[] }) {
  return <section aria-label={title} className="mt-8 min-w-0">
    <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
    <div className="divide-y divide-neutral-200 border-y border-neutral-200">
      {rows.map(row => {
        const scoredTotal = row.total - (row.unscored ?? 0);
        const showScore = row.correct !== undefined && scoredTotal > 0;
        return <div key={row.id} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-6">
        <div className="min-w-0 [overflow-wrap:anywhere]"><h3 className="text-sm font-semibold">{row.label}</h3>{row.detail ? <p className="mt-1 text-xs leading-5 text-neutral-600">{row.detail}</p> : null}</div>
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-neutral-600">
            <span>{showScore ? `${row.correct} correct` : `${row.total - row.unanswered} answered`} · {row.unanswered} unanswered</span>
            <span>{row.pending ? `${row.pending} awaiting feedback` : showScore ? `${Math.round(row.correct! / scoredTotal * 100)}% correct` : 'Responses saved'}</span>
          </div>
          {showScore ? <div className="flex h-1.5 overflow-hidden rounded-sm bg-neutral-100" aria-hidden="true">
            <div className="bg-neutral-700" style={{ width: `${row.correct! / row.total * 100}%` }} />
            <div className="bg-red-300" style={{ width: `${Math.max(0, scoredTotal - row.correct! - row.unanswered) / row.total * 100}%` }} />
          </div> : null}
        </div>
        {row.onReview ? <button type="button" onClick={row.onReview} aria-label={`Review ${row.label}`} className="result-back inline-flex min-h-10 items-center gap-2 justify-self-start text-sm font-medium text-neutral-700 hover:text-neutral-950">Review<ArrowRight size={14} aria-hidden="true" /></button> : null}
      </div>; })}
    </div>
  </section>;
}
