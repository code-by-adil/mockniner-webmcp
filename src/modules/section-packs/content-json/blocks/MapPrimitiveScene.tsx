import React from "react";
import type {
  ObjectiveMapElement,
  ObjectiveMapPoint,
  ObjectiveMapScene,
  ObjectiveMapSymbolElement,
} from "@ielts/shared";
import type { MapViewBoxRect } from "./mapDisplayViewBox";

type MapPrimitiveSceneProps = {
  map: ObjectiveMapScene;
  viewBox?: MapViewBoxRect;
};

function mapColor(
  map: ObjectiveMapScene,
  colorRef: string | undefined,
  fallback: string,
): string {
  if (!colorRef) return fallback;
  return map.palette?.[colorRef] ?? fallback;
}

function pointsToAttribute(points: ObjectiveMapPoint[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function getDashArray(strokeWidth: number | undefined): string | undefined {
  if (!strokeWidth) return undefined;
  return `${strokeWidth * 2.2} ${strokeWidth * 1.6}`;
}

function getElementTransform(element: ObjectiveMapElement): string | undefined {
  if (element.rotate === undefined) return undefined;

  switch (element.type) {
    case "rect":
      return `rotate(${element.rotate} ${element.x + element.w / 2} ${element.y + element.h / 2})`;
    case "ellipse":
      return `rotate(${element.rotate} ${element.cx} ${element.cy})`;
    case "label":
    case "symbol":
    case "answerSlot":
    case "choiceMarker":
      return `rotate(${element.rotate} ${element.x} ${element.y})`;
    default:
      return undefined;
  }
}

function renderSymbol(element: ObjectiveMapSymbolElement, map: ObjectiveMapScene) {
  const size = element.size ?? 28;
  const half = size / 2;
  const fill = mapColor(map, element.fill, "#1f2937");
  const background = element.background
    ? mapColor(map, element.background, "transparent")
    : undefined;
  const label = element.label ?? getSymbolLabel(element.name);

  if (element.name === "tree") {
    return (
      <g transform={getElementTransform(element)}>
        <circle
          cx={element.x}
          cy={element.y - half * 0.2}
          r={half * 0.65}
          fill={background ?? "#dcfce7"}
          stroke={fill}
          strokeWidth={1.5}
        />
        <path
          d={`M ${element.x} ${element.y + half * 0.25} L ${element.x} ${element.y + half}`}
          stroke={fill}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    );
  }

  if (element.name === "north") {
    return (
      <g transform={getElementTransform(element)}>
        <path
          d={`M ${element.x} ${element.y - half} L ${element.x - half * 0.45} ${element.y + half * 0.35} L ${element.x} ${element.y + half * 0.1} L ${element.x + half * 0.45} ${element.y + half * 0.35} Z`}
          fill={fill}
        />
        <text
          x={element.x}
          y={element.y + half + 12}
          textAnchor="middle"
          fontSize={Math.max(10, size * 0.38)}
          fontWeight={700}
          fill={fill}
        >
          N
        </text>
      </g>
    );
  }

  if (element.name === "entrance") {
    return (
      <g transform={getElementTransform(element)}>
        <path
          d={`M ${element.x - half} ${element.y} H ${element.x + half * 0.45}`}
          stroke={fill}
          strokeWidth={Math.max(2, size * 0.12)}
          strokeLinecap="round"
        />
        <path
          d={`M ${element.x + half * 0.45} ${element.y} L ${element.x + half * 0.1} ${element.y - half * 0.32} M ${element.x + half * 0.45} ${element.y} L ${element.x + half * 0.1} ${element.y + half * 0.32}`}
          stroke={fill}
          strokeWidth={Math.max(2, size * 0.12)}
          strokeLinecap="round"
        />
      </g>
    );
  }

  return (
    <g transform={getElementTransform(element)}>
      <rect
        x={element.x - half}
        y={element.y - half}
        width={size}
        height={size}
        rx={Math.max(4, size * 0.2)}
        fill={background ?? "rgba(255,255,255,0.86)"}
        stroke={fill}
        strokeWidth={1}
      />
      <text
        x={element.x}
        y={element.y + size * 0.16}
        textAnchor="middle"
        fontSize={Math.max(9, size * 0.36)}
        fontWeight={700}
        fill={fill}
      >
        {label}
      </text>
    </g>
  );
}

function getSymbolLabel(name: ObjectiveMapSymbolElement["name"]): string {
  switch (name) {
    case "cafe":
      return "CA";
    case "toilet":
      return "WC";
    case "info":
      return "i";
    case "parking":
      return "P";
    case "stairs":
      return "ST";
    case "office":
      return "OF";
    case "door":
      return "D";
    case "bench":
      return "B";
    case "bridge":
      return "BR";
    case "water":
      return "W";
    default:
      return "";
  }
}

function renderElement(element: ObjectiveMapElement, map: ObjectiveMapScene) {
  switch (element.type) {
    case "rect":
      return (
        <rect
          key={element.id}
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          rx={element.rx}
          fill={mapColor(map, element.fill, "transparent")}
          stroke={mapColor(map, element.stroke, "none")}
          strokeWidth={element.strokeWidth}
          strokeDasharray={element.dashed ? getDashArray(element.strokeWidth ?? 2) : undefined}
          opacity={element.opacity}
          transform={getElementTransform(element)}
        />
      );
    case "ellipse":
      return (
        <ellipse
          key={element.id}
          cx={element.cx}
          cy={element.cy}
          rx={element.rx}
          ry={element.ry}
          fill={mapColor(map, element.fill, "transparent")}
          stroke={mapColor(map, element.stroke, "none")}
          strokeWidth={element.strokeWidth}
          strokeDasharray={element.dashed ? getDashArray(element.strokeWidth ?? 2) : undefined}
          opacity={element.opacity}
          transform={getElementTransform(element)}
        />
      );
    case "polygon":
      return (
        <polygon
          key={element.id}
          points={pointsToAttribute(element.points)}
          fill={mapColor(map, element.fill, "transparent")}
          stroke={mapColor(map, element.stroke, "none")}
          strokeWidth={element.strokeWidth}
          strokeDasharray={element.dashed ? getDashArray(element.strokeWidth ?? 2) : undefined}
          strokeLinejoin={element.lineJoin}
          opacity={element.opacity}
        />
      );
    case "polyline":
      return (
        <polyline
          key={element.id}
          points={pointsToAttribute(element.points)}
          fill="none"
          stroke={mapColor(map, element.stroke, "#64748b")}
          strokeWidth={element.strokeWidth}
          strokeDasharray={element.dashed ? getDashArray(element.strokeWidth ?? 2) : undefined}
          strokeLinecap={element.lineCap}
          strokeLinejoin={element.lineJoin}
          opacity={element.opacity}
        />
      );
    case "label": {
      const lines = element.lines ?? [element.text ?? ""];
      const fontSize = element.fontSize ?? 18;
      return (
        <text
          key={element.id}
          x={element.x}
          y={element.y}
          textAnchor={element.align ?? "middle"}
          fontSize={fontSize}
          fontWeight={element.fontWeight ?? "700"}
          fill={mapColor(map, element.fill, "#1f2937")}
          opacity={element.opacity}
          transform={getElementTransform(element)}
        >
          {lines.map((line, index) => (
            <tspan key={`${element.id ?? "label"}-${index}`} x={element.x} dy={index === 0 ? 0 : fontSize * 1.18}>
              {line}
            </tspan>
          ))}
        </text>
      );
    }
    case "symbol":
      return <React.Fragment key={element.id}>{renderSymbol(element, map)}</React.Fragment>;
    case "choiceMarker": {
      const radius = element.r ?? 18;
      return (
        <g key={element.id} opacity={element.opacity} transform={getElementTransform(element)}>
          <circle cx={element.x} cy={element.y} r={radius} fill="#fff" stroke="#111827" strokeWidth={2} />
          <text
            x={element.x}
            y={element.y + radius * 0.36}
            textAnchor="middle"
            fontSize={radius * 0.95}
            fontWeight={800}
            fill="#111827"
          >
            {element.label ?? element.choiceId}
          </text>
        </g>
      );
    }
    case "answerSlot":
      return null;
    default:
      return null;
  }
}

function renderGrid(map: ObjectiveMapScene) {
  if (!map.grid) return null;

  const { width, height } = map.viewBox;
  const vertical = [];
  for (let x = map.grid.xStep; x < width; x += map.grid.xStep) {
    vertical.push(
      <line
        key={`grid-v-${x}`}
        x1={x}
        x2={x}
        y1={0}
        y2={height}
        stroke={mapColor(map, map.grid.stroke, "#e5e7eb")}
        strokeWidth={map.grid.strokeWidth ?? 1}
      />,
    );
  }

  const horizontal = [];
  for (let y = map.grid.yStep; y < height; y += map.grid.yStep) {
    horizontal.push(
      <line
        key={`grid-h-${y}`}
        x1={0}
        x2={width}
        y1={y}
        y2={y}
        stroke={mapColor(map, map.grid.stroke, "#e5e7eb")}
        strokeWidth={map.grid.strokeWidth ?? 1}
      />,
    );
  }

  return (
    <g opacity={0.8}>
      {vertical}
      {horizontal}
    </g>
  );
}

export function MapPrimitiveScene({ map, viewBox }: MapPrimitiveSceneProps) {
  const displayViewBox = viewBox ?? {
    x: 0,
    y: 0,
    width: map.viewBox.width,
    height: map.viewBox.height,
  };

  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox={`${displayViewBox.x} ${displayViewBox.y} ${displayViewBox.width} ${displayViewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-hidden="true"
    >
      <rect
        x={displayViewBox.x}
        y={displayViewBox.y}
        width={displayViewBox.width}
        height={displayViewBox.height}
        fill={mapColor(map, map.background, "#fff")}
      />
      {renderGrid(map)}
      {map.elements.map((element, index) =>
        renderElement({ ...element, id: element.id ?? `${element.type}-${index}` }, map),
      )}
    </svg>
  );
}
