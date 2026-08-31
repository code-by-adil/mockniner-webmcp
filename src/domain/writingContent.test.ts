import { describe, expect, it } from "vitest";
import writingJson from "@/content/writing.json";
import { writingDocument } from "@/content/writing";
import {
  getWritingContentJsonSchema,
  parseWritingContentDocument,
} from "./writingContent";

describe("canonical IELTS Writing JSON", () => {
  it("validates the built-in document without a TypeScript content mirror", () => {
    expect(parseWritingContentDocument(writingJson)).toEqual(writingDocument);
    expect(writingDocument.tasks.map((task) => task.type)).toEqual([
      "academic_task_1_bar_chart",
      "academic_task_2_essay",
    ]);
  });

  it("exports the renderer contract as JSON Schema", () => {
    const schema = getWritingContentJsonSchema();
    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(schema.properties).toHaveProperty("tasks");
    expect(schema.required).toEqual(
      expect.arrayContaining(["schemaVersion", "contentKey", "section", "tasks"]),
    );
  });
});
