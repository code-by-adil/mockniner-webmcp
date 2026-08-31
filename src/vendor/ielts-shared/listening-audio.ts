import { parseJsonObject, type JsonObject } from "./json";

type ListeningTimelineEvent = {
  type: string;
  start: number;
  end: number;
  part: number | null;
  label?: string | undefined;
};

type ListeningTimelineSilenceRange = {
  start: number;
  end: number;
};

export type NormalizedListeningTimeline = {
  events: ListeningTimelineEvent[];
  eventStarts: number[];
  silenceRanges: ListeningTimelineSilenceRange[];
  silenceStarts: number[];
  partStarts: Record<number, number>;
};

export type ListeningAudioPersistedState = {
  currentTimeSec: number;
  volume: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readFiniteNumber(record: JsonObject, key: string): number | null {
  const value = record[key];
  return isFiniteNumber(value) ? value : null;
}

function readObjectArray(record: JsonObject, key: string): JsonObject[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const parsedEntry = parseJsonObject(entry);
    return parsedEntry ? [parsedEntry] : [];
  });
}

export function parseListeningTimeline(
  value: unknown,
): NormalizedListeningTimeline | null {
  const record = parseJsonObject(value);
  if (!record) {
    return null;
  }

  const events: ListeningTimelineEvent[] = [];
  for (const eventRecord of readObjectArray(record, "events")) {
    const type = eventRecord.type;
    const start = readFiniteNumber(eventRecord, "start");
    const end = readFiniteNumber(eventRecord, "end");

    if (
      typeof type !== "string" ||
      !type ||
      start == null ||
      end == null ||
      end <= start
    ) {
      continue;
    }

    const rawPart = readFiniteNumber(eventRecord, "part");
    const part = rawPart == null ? null : Math.floor(rawPart);
    const label =
      typeof eventRecord.label === "string" ? eventRecord.label : undefined;
    events.push({
      type,
      start,
      end,
      part,
      ...(label !== undefined ? { label } : {}),
    });
  }

  events.sort((left, right) => left.start - right.start);

  const eventStarts = events.map((event) => event.start);
  const silenceRanges = events
    .filter((event) => event.type === "silence")
    .map((event) => ({ start: event.start, end: event.end }))
    .sort((left, right) => left.start - right.start);
  const silenceStarts = silenceRanges.map((range) => range.start);

  const partStarts: Record<number, number> = {};
  for (const event of events) {
    if (!event.part || event.part < 1 || event.part > 4 || event.type === "silence") {
      continue;
    }

    const existing = partStarts[event.part];
    if (!isFiniteNumber(existing) || event.start < existing) {
      partStarts[event.part] = event.start;
    }
  }

  return {
    events,
    eventStarts,
    silenceRanges,
    silenceStarts,
    partStarts,
  };
}
