import writingJson from "./writing.json";
import { parseWritingContentDocument } from "@/domain/writingContent";

export const writingDocument = parseWritingContentDocument(writingJson);
