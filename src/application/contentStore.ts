import type {
  PracticeContentDocument,
} from "@/domain/contentDocument";

export type ContentStore = {
  loadActive: () => Promise<PracticeContentDocument[]>;
  loadByKey: (contentKey: string) => Promise<PracticeContentDocument | null>;
  saveAndActivate: (document: PracticeContentDocument) => Promise<void>;
};
