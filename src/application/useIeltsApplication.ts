import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { initialSession, sessionReducer, type SessionAction } from "@/domain/session";
import { getDraftRepository } from '@/infrastructure/database/draftRepository';
import { draftSaves } from '@/infrastructure/saveCoordinator';
import { listeningDocument, readingDocument } from "@/content/objective";
import { writingDocument } from "@/content/writing";
import {
  replaceActiveContent,
  type ActiveContentDocuments,
} from "@/domain/contentDocument";
import { createIeltsCommands } from "./ieltsCommands";
import { reportHandledError } from "@/shared/reportHandledError";
import type { LearningSummary } from "@/domain/learningSummary";
import { flushSync } from 'react-dom';

const bundledContent = [listeningDocument, readingDocument, writingDocument];
const getRepository = async () =>
  (
    await import("@/infrastructure/database/ieltsRepository")
  ).getIeltsRepository();
async function getContentStore() {
  const [{ getLocalDatabase }, { createContentStore }] = await Promise.all([
    import("@/infrastructure/database/client"),
    import("@/infrastructure/database/contentRepository"),
  ]);
  return createContentStore(
    await getLocalDatabase(),
    (error, row) => {
      reportHandledError(error, {
        feature: "content-catalog-row-load",
        ...row,
      });
    },
    bundledContent,
  );
}

const defaultPersistence = { getRepository, getContentStore };

export function useIeltsApplication(persistence = defaultPersistence) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const [content, setContent] = useState<ActiveContentDocuments>({
    listening: listeningDocument,
    reading: readingDocument,
    writing: writingDocument,
  });
  const [contentReady, setContentReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [learningSummary, setLearningSummary] =
    useState<LearningSummary | null>(null);
  const current = useRef({ state, content });
  useLayoutEffect(() => {
    current.current = { state, content };
  }, [state, content]);
  const getState = useCallback(() => current.current.state, []);
  const getContent = useCallback(() => current.current.content, []);
  const save = useCallback((session: typeof state) => {
    const documents = getContent();
    draftSaves.enqueue('ielts', async () => (await getDraftRepository()).saveIelts(session, documents));
  }, [getContent]);
  const dispatchAndSave = useCallback((action: SessionAction) => {
    const next = sessionReducer(getState(), action);
    flushSync(() => dispatch(action));
    save(next);
  }, [getState, save]);
  // The factory stores these getters. It only reads them when a command runs after commit.
  const commands = useMemo(
    () =>
      // oxlint-disable-next-line react/refs
      createIeltsCommands({
        getState,
        getContent,
        dispatch: dispatchAndSave,
        persistSession: async session => {
          await draftSaves.flush();
          await (await getDraftRepository()).saveIelts(session, getContent());
        },
        flushDrafts: draftSaves.flush,
        // External installation callers must observe the new content and its
        // derived audio status before the installation promise resolves.
        setContent: documents => flushSync(() => setContent(documents)),
        getRepository: persistence.getRepository,
        getContentStore: persistence.getContentStore,
      }),
    [getState, getContent, persistence, dispatchAndSave],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      persistence.getContentStore().then((store) => store.loadActive()),
      persistence.getRepository(),
    ])
      .then(async ([documents, reader]) => {
        const active = documents.reduce(replaceActiveContent, { listening: listeningDocument, reading: readingDocument, writing: writingDocument });
        const drafts = await getDraftRepository();
        const restored = await drafts.loadIelts(reader, active);
        if (cancelled) return;
        setContent(restored.documents.reduce(replaceActiveContent, active));
        dispatch({ type: "RESTORE", session: restored.session });
        setContentReady(true);
      })
      .catch((error) => {
        reportHandledError(error, { feature: "content-catalog-load" });
        if (!cancelled)
          setLoadError(
            "Your saved work could not be loaded. It has not been overwritten.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [persistence]);
  useEffect(() => {
    if (state.view !== "home") return;
    let cancelled = false;
    void persistence
      .getRepository()
      .then((repository) => repository.readLearningSummary(5))
      .then((summary) => {
        if (!cancelled) setLearningSummary(summary);
      })
      .catch((error) =>
        reportHandledError(error, { feature: "attempt-history-load" }),
      );
    return () => {
      cancelled = true;
    };
  }, [
    state.view,
    state.completedSections,
    state.writingEvaluation,
    state.speakingEvaluation,
    persistence,
  ]);
  const loadPracticeContent = useCallback(async (key: string) => (await persistence.getContentStore()).loadByKey(key), [persistence]);
  return { state, content, contentReady, loadError, learningSummary, commands, loadPracticeContent };
}
