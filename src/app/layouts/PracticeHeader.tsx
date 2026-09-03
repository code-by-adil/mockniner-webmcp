import { StorageButton } from '@/app/WorkspaceStorage'
import { BrandMark } from '@/shared/ui/global/BrandMark'

export function PracticeHeader({ canImport = false }: { canImport?: boolean }) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-neutral-200/80 bg-white">
      <div className="mx-auto flex h-[60px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
          <BrandMark />
          <div className="hidden h-8 min-w-0 flex-col justify-center border-l pl-6 text-xs sm:flex">
            <span className="font-bold leading-tight text-neutral-900">Practice</span>
            <span className="truncate text-[11px] leading-tight text-neutral-500">SAT, GRE, IELTS, and more</span>
          </div>
        </div>
        <StorageButton canImport={canImport} />
      </div>
    </header>
  )
}
