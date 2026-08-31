import type {
  PracticeContentDocument,
} from "@/domain/contentDocument";

export type ContentStore = {
  loadActive: () => Promise<PracticeContentDocument[]>;
  saveAndActivate: (document: PracticeContentDocument) => Promise<void>;
};
