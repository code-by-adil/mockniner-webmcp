import { setExamDragSessionActive } from "./examDragDrop";

type DragOptionRecord = {
  groupId: string;
  value: string;
  label: string;
  isUsed: boolean;
  isReviewMode: boolean;
};

let selectedDragValue: string | null = null;
let activeDragGroupId: string | null = null;
const dragOptions = new Map<string, DragOptionRecord>();
let dragOptionsVersion = 0;

function getOptionKey(groupId: string, value: string): string {
  return `${groupId}\u0000${value}`;
}

function emitDragOptionsChange(): void {
  dragOptionsVersion += 1;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("exam-drag-options-change"));
}

function emitDragSelectionChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("exam-drag-selection-change", { detail: selectedDragValue }),
  );
}

function endDragSession(): void {
  setExamDragSessionActive(false);
  activeDragGroupId = null;
  selectedDragValue = null;
  emitDragSelectionChange();
}

export function getSelectedDragValue(): string | null {
  return selectedDragValue;
}

export function getActiveDragGroupId(): string | null {
  return activeDragGroupId;
}

export function setSelectedDragValue(value: string | null): void {
  selectedDragValue = value;
  emitDragSelectionChange();
}

export function selectDragOption(groupId: string, value: string): void {
  activeDragGroupId = groupId;
  selectedDragValue = value;
  emitDragSelectionChange();
}

export function clearDragSelection(): void {
  endDragSession();
}

export function toggleDragOption(groupId: string, value: string): void {
  if (selectedDragValue === value && activeDragGroupId === groupId) {
    clearDragSelection();
    return;
  }
  selectDragOption(groupId, value);
}

export function subscribeDragSelection(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener("exam-drag-selection-change", handler);
  return () => window.removeEventListener("exam-drag-selection-change", handler);
}

export function getDragOptions(groupId: string): DragOptionRecord[] {
  return Array.from(dragOptions.values()).filter(
    (option) => option.groupId === groupId,
  );
}

export function getDragOptionsVersion(): number {
  return dragOptionsVersion;
}

export function subscribeDragOptions(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("exam-drag-options-change", listener);
  return () => window.removeEventListener("exam-drag-options-change", listener);
}

export function canAssignDragOption(
  groupId: string,
  value: string,
  currentZoneValue?: string,
): boolean {
  const option = dragOptions.get(getOptionKey(groupId, value));
  if (!option || option.isReviewMode) return false;
  if (option.isUsed && option.value !== currentZoneValue) return false;
  return true;
}

/** Clears module-level drag state — for tests and hard resets between exam sections. */
export function resetExamDragState(): void {
  dragOptions.clear();
  endDragSession();
  emitDragOptionsChange();
}

export function registerDragOption(record: DragOptionRecord): () => void {
  const key = getOptionKey(record.groupId, record.value);
  dragOptions.set(key, record);
  emitDragOptionsChange();

  return () => {
    const current = dragOptions.get(key);
    if (current?.groupId !== record.groupId || current.value !== record.value) return;
    dragOptions.delete(key);
    emitDragOptionsChange();
    if (selectedDragValue === record.value && activeDragGroupId === record.groupId) {
      clearDragSelection();
    }
  };
}
