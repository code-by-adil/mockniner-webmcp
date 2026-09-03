import { examProfiles, authoringWorkflow } from '@/content/examProfiles';
import { z } from "zod";
import {
  KOKORO_LISTENING_AUTHORING_GUIDANCE,
  listeningContentDocumentSchema,
  readingContentDocumentSchema,
} from "@/domain/objectiveContent";
import { writingContentDocumentSchema } from "@/domain/writingContent";
import { getIeltsExample } from '@/content/ieltsExamples';

export const IELTS_AUTHORING_SECTIONS = ["listening", "reading", "writing"] as const;

export type IeltsAuthoringSection = (typeof IELTS_AUTHORING_SECTIONS)[number];

const schemas = {
  listening: listeningContentDocumentSchema,
  reading: readingContentDocumentSchema,
  writing: writingContentDocumentSchema,
} as const;

const rules: Record<IeltsAuthoringSection, string[]> = {
  listening: [
    "Create four ordered parts with exactly ten answer slots each and question IDs 1 through 40.",
    "Use audio.type=kokoro for agent-created audio. The application generates and stores the speech locally.",
    KOKORO_LISTENING_AUTHORING_GUIDANCE,
    "Place every answer in its question block. The candidate interface hides answers until submission.",
  ],
  reading: [
    "Create three ordered passages with exactly 40 answer slots in total and question IDs 1 through 40.",
    "Use passage blocks for source text and the declared question block types for responses.",
    "Place every answer in its question block. The candidate interface hides answers until submission.",
  ],
  writing: [
    "Create exactly two Academic Writing tasks in order: Task 1 bar chart and Task 2 essay.",
    "Keep minimumWords at 150 for Task 1 and 250 for Task 2.",
    "The agent evaluates the immutable submission after the learner completes both tasks.",
  ],
};

export function getIeltsAuthoringKit(section: IeltsAuthoringSection, includeExamples = true, includeSchema = true) {
  return {
    section,
    examFormat: examProfiles[section],
    workflow: authoringWorkflow,
    rules: rules[section],
    schemaIncluded: includeSchema || !includeExamples,
    ...((includeSchema || !includeExamples) ? { documentSchema: z.toJSONSchema(schemas[section], { target: "draft-07" }) } : {}),
    examplesIncluded: includeExamples,
    ...(includeExamples ? { exampleDocument: getIeltsExample(section) } : {}),
    nextAction: includeExamples ?
      "Use the complete exampleDocument directly for example practice, or replace its content for new practice. Choose a fresh contentKey and call install_ielts_practice_set. Installation opens the exam, including Listening preparation. The returned opened flag confirms the handoff. The application validates the document; repair returned paths if needed."
      : "Examples are omitted while unfinished practice exists to protect answer keys. Create original content using the rules and documentSchema, with a fresh contentKey. Open the library before installing; content used by an unfinished attempt cannot be replaced.",
  };
}
