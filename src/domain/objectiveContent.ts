// Stable public entry point for objective IELTS content. The contract is split
// by ownership so schema implementation details do not leak into consumers.
export {
  listeningContentDocumentSchema,
  readingContentDocumentSchema,
  type ListeningContentDocument,
  type ObjectiveBlockType,
  type ObjectiveCompletionType,
  type ObjectiveContentBlock,
  type ObjectiveContentDocument,
  type ObjectiveInputLine,
  type ReadingContentDocument,
} from "./objectiveCore";
export {
  KOKORO_LISTENING_AUTHORING_GUIDANCE,
  type KokoroListeningAudio,
  type KokoroVoice,
} from "./objectiveListeningAudio";
export {
  type ObjectiveMapAnswerSlotElement,
  type ObjectiveMapElement,
  type ObjectiveMapPoint,
  type ObjectiveMapScene,
  type ObjectiveMapSymbolElement,
} from "./objectiveMap";
export {
  getObjectiveBlockQuestionIds,
  objectiveContentDocumentSchema,
  parseObjectiveContentDocument,
} from "./objectiveContentValidation";
