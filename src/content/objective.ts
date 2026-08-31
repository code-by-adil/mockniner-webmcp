import listeningJson from "./listening.json";
import readingJson from "./reading.json";
import { parseObjectiveContentDocument } from "@/domain/objectiveContent";

const parsedListeningDocument = parseObjectiveContentDocument(listeningJson);
const parsedReadingDocument = parseObjectiveContentDocument(readingJson);
if (parsedListeningDocument.section !== "listening") {
  throw new Error("The built-in Listening document has the wrong section.");
}
if (parsedReadingDocument.section !== "reading") {
  throw new Error("The built-in Reading document has the wrong section.");
}

export const listeningDocument = parsedListeningDocument;
export const readingDocument = parsedReadingDocument;
