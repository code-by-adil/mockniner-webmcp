import { z } from "zod";

const timelineEventSchema = z.strictObject({
  type: z.string().min(1),
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  part: z.number().finite().nullable(),
  label: z.string().optional(),
});

export type ListeningAudioPersistedState = {
  currentTimeSec: number;
  volume: number;
};

export type NormalizedListeningTimeline = {
  events: Array<z.infer<typeof timelineEventSchema> & { part: number | null }>;
  silenceRanges: Array<{ start: number; end: number }>;
  partStarts: Record<number, number>;
};

export function parseListeningTimeline(
  input: unknown,
): NormalizedListeningTimeline | null {
  const envelope = z
    .strictObject({ events: z.array(z.unknown()) })
    .safeParse(input);
  if (!envelope.success) return null;

  const events = envelope.data.events
    .flatMap((entry) => {
      const result = timelineEventSchema.safeParse(entry);
      if (!result.success || result.data.end <= result.data.start) return [];
      return [{ ...result.data, part: result.data.part == null ? null : Math.floor(result.data.part) }];
    })
    .sort((left, right) => left.start - right.start);
  const silenceRanges = events
    .filter((event) => event.type === "silence")
    .map(({ start, end }) => ({ start, end }));
  const partStarts: Record<number, number> = {};

  for (const event of events) {
    if (!event.part || event.part < 1 || event.part > 4 || event.type === "silence") {
      continue;
    }
    const current = partStarts[event.part];
    if (current === undefined || event.start < current) {
      partStarts[event.part] = event.start;
    }
  }

  return {
    events,
    silenceRanges,
    partStarts,
  };
}
