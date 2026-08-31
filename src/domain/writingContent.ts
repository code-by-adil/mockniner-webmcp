import { z } from "zod";

const text = z.string().trim().min(1).max(20_000);

export const writingBarChartSchema = z.strictObject({
  title: text,
  years: z.tuple([text, text]),
  unit: text,
  rows: z
    .array(
      z.strictObject({
        label: text,
        values: z.tuple([z.number().nonnegative(), z.number().nonnegative()]),
      }),
    )
    .min(1)
    .max(20),
});

export const writingTask1Schema = z.strictObject({
  type: z.literal("academic_task_1_bar_chart"),
  id: z.literal(1),
  title: text,
  instruction: text,
  lead: text,
  prompt: text,
  minimumWords: z.literal(150),
  chart: writingBarChartSchema,
});

export const writingTask2Schema = z.strictObject({
  type: z.literal("academic_task_2_essay"),
  id: z.literal(2),
  title: text,
  instruction: text,
  lead: text,
  prompt: text,
  guidance: text,
  minimumWords: z.literal(250),
});

export const writingContentDocumentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  contentKey: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  section: z.literal("writing"),
  name: text,
  tasks: z.tuple([writingTask1Schema, writingTask2Schema]),
});

export type WritingTask1 = z.infer<typeof writingTask1Schema>;
export type WritingTask2 = z.infer<typeof writingTask2Schema>;
export type WritingTask = WritingTask1 | WritingTask2;
export type WritingContentDocument = z.infer<typeof writingContentDocumentSchema>;

export function parseWritingContentDocument(input: unknown): WritingContentDocument {
  return writingContentDocumentSchema.parse(input);
}

export function getWritingContentJsonSchema() {
  return z.toJSONSchema(writingContentDocumentSchema, { target: "draft-07" });
}
