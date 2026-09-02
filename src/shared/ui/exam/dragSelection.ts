import { setExamDragSessionActive } from "./examDragDrop";

let selectedDragValue: string | null = null;
let activeDragGroupId: string | null = null;
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
