import { z } from "zod";
import {
  objectiveContentDocumentSchema,
  parseObjectiveContentDocument,
  type ListeningContentDocument,
  type ObjectiveContentDocument,
  type ReadingContentDocument,
} from "./objectiveContent";
import {
  writingContentDocumentSchema,
  parseWritingContentDocument,
  type WritingContentDocument,
} from "./writingContent";

export type ContentSection = "listening" | "reading" | "writing";
export type PracticeContentDocument =
  | ObjectiveContentDocument
  | WritingContentDocument;

export type ActiveContentDocuments = {
  listening: ListeningContentDocument;
  reading: ReadingContentDocument;
  writing: WritingContentDocument;
};

const practiceContentDocumentSchema = z.union([
  objectiveContentDocumentSchema,
  writingContentDocumentSchema,
]);

const contentSectionSchema = z.object({
  section: z.enum(["listening", "reading", "writing"]),
});

export function parsePracticeContentDocument(
  input: unknown,
): PracticeContentDocument {
  const { section } = contentSectionSchema.parse(input);
  return section === "writing"
    ? parseWritingContentDocument(input)
    : parseObjectiveContentDocument(input);
}

export function getPracticeContentJsonSchema() {
  return z.toJSONSchema(practiceContentDocumentSchema, { target: "draft-07" });
}

export function replaceActiveContent(
  documents: ActiveContentDocuments,
  document: PracticeContentDocument,
): ActiveContentDocuments {
  if (document.section === "writing") {
    return { ...documents, writing: document };
  }
  return document.section === "listening"
    ? { ...documents, listening: document }
    : { ...documents, reading: document };
}

export function requireActiveObjectiveContent(
  documents: ActiveContentDocuments,
  section: "listening" | "reading",
): ObjectiveContentDocument {
  const document = documents[section];
  if (document.section !== section) {
    throw new Error(`The active ${section} content has the wrong section.`);
  }
  return document;
}
