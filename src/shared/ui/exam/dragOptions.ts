export type DragOption = {
  value: string;
  label: string;
  isUsed: boolean;
  isReviewMode: boolean;
};

export function canAssignDragOption(
  options: readonly DragOption[],
  value: string,
  currentValue?: string,
): boolean {
  return options.some(
    (option) =>
      option.value === value &&
      !option.isReviewMode &&
      (!option.isUsed || option.value === currentValue),
  );
}
