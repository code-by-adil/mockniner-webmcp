export type SpeakingQuestion = {
  id: number;
  part: string;
  text: string;
  timeLimit: number;
};

export type SpeakingTestDefinition = {
  id: string;
  displayName: string;
  questions: SpeakingQuestion[];
};

export type SpeakingContentPackManifest = {
  id: string;
  key: string;
  section: "speaking";
  collectionId: "official" | "cambridge" | "curated";
  label: string;
  selectionVisible: boolean;
  standardPool: boolean;
  isDefault?: boolean;
  cambridge?: {
    bookNumber: number;
    testNumber: number;
  };
};
