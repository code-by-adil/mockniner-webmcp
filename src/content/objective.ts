import listeningJson from "./listening.json";
import readingJson from "./reading.json";
import { parseObjectiveContentDocument } from "@/domain/objectiveContent";

export const listeningDocument = parseObjectiveContentDocument(listeningJson);
export const readingDocument = parseObjectiveContentDocument(readingJson);
