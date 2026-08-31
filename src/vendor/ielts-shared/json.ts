import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.record(
  z.string(),
  JsonValueSchema,
);

export function safeParseJson(value: string | null | undefined): JsonValue | null {
  if (!value) return null;
  try {
    return JsonValueSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseJsonObject(value: unknown): JsonObject | null {
  const result = JsonObjectSchema.safeParse(value);
  return result.success ? result.data : null;
}
