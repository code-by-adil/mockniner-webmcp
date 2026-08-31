import React from "react";
import { registerDragOption } from "./dragSelection";

type RegistryOption = {
  value: string;
  label: string;
  isUsed: boolean;
  isReviewMode: boolean;
};

/** Registers drag-group options for pickers without rendering draggable chips. */
export function DragOptionRegistry({
  groupId,
  options,
}: {
  groupId: string;
  options: RegistryOption[];
}) {
  const optionsKey = React.useMemo(
    () =>
      options
        .map((option) => `${option.value}\u0001${option.label}\u0001${option.isUsed}\u0001${option.isReviewMode}`)
        .join("\u0002"),
    [options],
  );

  React.useEffect(() => {
    const cleanups = options.map((option) =>
      registerDragOption({
        groupId,
        value: option.value,
        label: option.label,
        isUsed: option.isUsed,
        isReviewMode: option.isReviewMode,
      }),
    );
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [groupId, options, optionsKey]);

  return null;
}
