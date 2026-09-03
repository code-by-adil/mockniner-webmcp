import type { WritingTask } from '@/domain/writingContent'
import { WritingBarChart } from './WritingBarChart'

export function WritingTaskDisclosure({ task }: { task: WritingTask }) {
  return <details className="min-w-0 border-b border-neutral-200 px-5 sm:px-6">
    <summary className="cursor-pointer py-4 text-sm font-semibold text-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2">{task.type === 'academic_task_1_bar_chart' ? 'View task and chart' : 'View task'}</summary>
    <div className="space-y-3 pb-5 text-sm leading-6 [overflow-wrap:anywhere]">
      <h3 className="font-semibold">{task.title}</h3>
      <p className="text-neutral-600">{task.instruction} Write at least {task.minimumWords} words.</p>
      <p>{task.lead}</p>
      <p className="whitespace-pre-wrap font-medium">{task.prompt}</p>
      {task.type === 'academic_task_1_bar_chart' ? <p className="text-xs text-neutral-600 sm:hidden">Scroll horizontally to see the full chart.</p> : null}
      {task.type === 'academic_task_1_bar_chart'
        ? <div role="region" aria-label="Task 1 chart" tabIndex={0} className="overflow-x-auto"><div className="min-w-[540px] pr-12"><WritingBarChart chart={task.chart} /></div></div>
        : <p>{task.guidance}</p>}
    </div>
  </details>
}
