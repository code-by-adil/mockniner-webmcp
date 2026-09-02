import { cn } from "@/lib/utils";
import { supportsNativeDialog } from "./cssAnchorPositioning";
import {
  handleExamDialogBackdropClick,
  useExamNativeDialog,
} from "./useExamNativeDialog";

const PICKER_SCROLL_AT_OPTION_COUNT = 9;

function pickerOptionsListClassName(optionCount: number, layout: "tap" | "drag") {
  if (optionCount < PICKER_SCROLL_AT_OPTION_COUNT) return "p-2";
  return cn(
    "max-h-[min(70svh,calc(100dvh-9rem))] overflow-y-auto p-2",
    layout === "tap" && "overscroll-y-contain",
  );
}

type AnswerPickerOption = {
  value: string;
  label: string;
  isUsed?: boolean;
};

type Props = {
  open: boolean;
  questionLabel: string | number;
  pickerSheetLayout: "tap" | "drag";
  availableOptions: AnswerPickerOption[];
  value?: string;
  selectedValue: string | null;
  selectedGroupId: string | null;
  groupId: string;
  mapDragEnabled: boolean;
  canAcceptSelection: boolean;
  variant?: "mapSlot" | "matching";
  onChoose: (nextValue: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export function AnswerPickerSheet({
  open,
  questionLabel,
  pickerSheetLayout,
  availableOptions,
  value,
  selectedValue,
  selectedGroupId,
  groupId,
  mapDragEnabled,
  canAcceptSelection,
  variant,
  onChoose,
  onClear,
  onClose,
}: Props) {
  const useNative = supportsNativeDialog();
  const dialogRef = useExamNativeDialog({
    open: useNative && open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
  });
  const sheetClassName = cn(
    "exam-answer-picker-sheet w-full border border-gray-200 bg-white shadow-2xl",
    pickerSheetLayout === "tap"
      ? "max-w-none rounded-t-2xl border-b-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      : "max-w-md rounded-lg",
  );
  const body = (
    <>
      <div className={cn(
        "flex items-center justify-between border-b border-gray-200 px-4 py-3",
        pickerSheetLayout === "tap" && "pt-4",
      )}>
        {pickerSheetLayout === "tap" ? (
          <div className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-gray-300" aria-hidden />
        ) : null}
        <div className={pickerSheetLayout === "tap" ? "pt-2" : undefined}>
          <p className="text-base font-bold text-gray-900">Question {questionLabel}</p>
          <p className="text-xs font-medium text-gray-500">
            {mapDragEnabled && canAcceptSelection
              ? "Click an option below or press Enter to place the selected answer"
              : variant === "matching"
                ? "Choose an option for this question"
                : "Choose an answer for this location"}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close answer selector"
          onClick={onClose}
          className="rounded px-2 py-1 text-xl leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
        >×</button>
      </div>
      <div className={pickerOptionsListClassName(availableOptions.length, pickerSheetLayout)}>
        {availableOptions.length > 0 ? availableOptions.map((option) => {
          const isCurrent = option.value === value;
          const isSelectedOption = selectedValue === option.value && selectedGroupId === groupId;
          const isUsedElsewhere = option.isUsed && option.value !== value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={isUsedElsewhere}
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => onChoose(option.value)}
              className={cn(
                "mb-2 flex w-full items-center justify-between rounded-xl border px-3 text-left font-semibold last:mb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30",
                pickerSheetLayout === "tap" ? "min-h-[52px] py-3.5 text-sm" : "py-3 text-sm",
                isCurrent
                  ? "border-slate-900 bg-slate-100 text-gray-950"
                  : isUsedElsewhere
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                    : isSelectedOption
                      ? "border-black bg-white text-gray-900 ring-2 ring-black/15"
                      : "border-gray-200 bg-white text-gray-900 hover:border-gray-400 hover:bg-gray-50",
              )}
            >
              <span>{option.label}</span>
              {isCurrent ? (
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Selected</span>
              ) : isUsedElsewhere ? (
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">Used</span>
              ) : isSelectedOption ? (
                <span className="text-xs text-gray-500">Ready</span>
              ) : null}
            </button>
          );
        }) : (
          <p className="px-3 py-6 text-center text-sm font-medium text-gray-500">No answers are available.</p>
        )}
      </div>
      {value ? (
        <div className="border-t border-gray-200 p-2">
          <button
            type="button"
            onClick={() => {
              onClear();
              onClose();
            }}
            className="w-full rounded border border-gray-200 px-3 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >Clear Answer</button>
        </div>
      ) : null}
    </>
  );

  if (useNative) {
    return (
      <dialog
        ref={dialogRef}
        className={cn(
          "exam-answer-picker-dialog exam-native-dialog",
          pickerSheetLayout === "tap" ? "exam-answer-picker-dialog--sheet" : "exam-answer-picker-dialog--centered",
          sheetClassName,
        )}
        aria-label={`Select answer for question ${questionLabel}`}
        onClick={handleExamDialogBackdropClick}
      >
        <div className="relative">{body}</div>
      </dialog>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[1400] flex bg-black/40",
        pickerSheetLayout === "tap"
          ? "items-end px-0 pb-0"
          : "items-end px-3 pb-3 sm:items-center sm:justify-center sm:pb-0",
      )}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Select answer for question ${questionLabel}`}
        className={cn("relative", sheetClassName)}
        onClick={(event) => event.stopPropagation()}
      >{body}</div>
    </div>
  );
}
