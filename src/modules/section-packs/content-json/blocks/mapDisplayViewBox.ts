import type { ObjectiveMapElement, ObjectiveMapScene } from "@ielts/shared";

export type MapViewBoxRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function includeBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number; hasBounds: boolean },
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  bounds.hasBounds = true;
  bounds.minX = Math.min(bounds.minX, x1);
  bounds.minY = Math.min(bounds.minY, y1);
  bounds.maxX = Math.max(bounds.maxX, x2);
  bounds.maxY = Math.max(bounds.maxY, y2);
}

function includeElement(
  bounds: { minX: number; minY: number; maxX: number; maxY: number; hasBounds: boolean },
  element: ObjectiveMapElement,
) {
  switch (element.type) {
    case "rect":
      includeBounds(bounds, element.x, element.y, element.x + element.w, element.y + element.h);
      break;
    case "ellipse":
      includeBounds(
        bounds,
        element.cx - element.rx,
        element.cy - element.ry,
        element.cx + element.rx,
        element.cy + element.ry,
      );
      break;
    case "polygon":
    case "polyline":
      for (const [x, y] of element.points) {
        includeBounds(bounds, x, y, x, y);
      }
      break;
    case "label": {
      const fontSize = element.fontSize ?? 16;
      const lines = element.lines ?? (element.text ? [element.text] : []);
      const lineCount = Math.max(lines.length, 1);
      const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 1);
      const width = maxLineLength * fontSize * 0.55;
      const height = lineCount * fontSize * 1.2;
      includeBounds(
        bounds,
        element.x - width / 2,
        element.y - fontSize,
        element.x + width / 2,
        element.y + height,
      );
      break;
    }
    case "symbol": {
      const size = element.size ?? 28;
      includeBounds(bounds, element.x - size, element.y - size, element.x + size, element.y + size);
      break;
    }
    case "choiceMarker": {
      const radius = element.r ?? 18;
      includeBounds(
        bounds,
        element.x - radius,
        element.y - radius,
        element.x + radius,
        element.y + radius,
      );
      break;
    }
    case "answerSlot": {
      const slotWidth = element.w ?? 176;
      const slotHeight = element.h ?? 56;
      includeBounds(
        bounds,
        element.x - slotWidth / 2,
        element.y - slotHeight / 2,
        element.x + slotWidth / 2,
        element.y + slotHeight / 2,
      );
      break;
    }
    default:
      break;
  }
}

/** Crops empty viewBox margin around authored map content (used on compact web layouts). */
export function getMapTightViewBox(
  map: ObjectiveMapScene,
  paddingRatio = 0.035,
): MapViewBoxRect {
  const full = map.viewBox;
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    hasBounds: false,
  };

  for (const element of map.elements) {
    includeElement(bounds, element);
  }

  if (!bounds.hasBounds) {
    return { x: 0, y: 0, width: full.width, height: full.height };
  }

  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const padX = contentWidth * paddingRatio;
  const padY = contentHeight * paddingRatio;

  const x = Math.max(0, bounds.minX - padX);
  const y = Math.max(0, bounds.minY - padY);
  const right = Math.min(full.width, bounds.maxX + padX);
  const bottom = Math.min(full.height, bounds.maxY + padY);

  return {
    x,
    y,
    width: Math.max(right - x, 1),
    height: Math.max(bottom - y, 1),
  };
}

export function getFullMapViewBox(map: ObjectiveMapScene): MapViewBoxRect {
  return { x: 0, y: 0, width: map.viewBox.width, height: map.viewBox.height };
}
