import {
  useCallback,
  useEffect,
  useMemo,
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

const defaultPersistence = { getRepository, getContentStore, getDraftRepository };

export function useIeltsApplication(persistence = defaultPersistence) {
  const [state, setState] = useState(initialSession);
  const [content, setContent] = useState<ActiveContentDocuments>({
    listening: listeningDocument,
    reading: readingDocument,
    writing: writingDocument,
  });
  const [contentReady, setContentReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const current = useRef({ state, content });
  const getState = useCallback(() => current.current.state, []);
  const getContent = useCallback(() => current.current.content, []);
  const publishSession = useCallback((session: typeof state) => {
    current.current.state = session;
    flushSync(() => setState(session));
  }, []);
  const publishContent = useCallback((documents: ActiveContentDocuments) => {
    current.current.content = documents;
    flushSync(() => setContent(documents));
  }, []);
  const save = useCallback((session: typeof state) => {
    const documents = getContent();
    draftSaves.enqueue('ielts', async () => (await persistence.getDraftRepository()).saveIelts(session, documents));
  }, [getContent, persistence]);
  const dispatchAndSave = useCallback((action: SessionAction) => {
    const next = sessionReducer(getState(), action);
    if (action.type === 'SET_ANSWER' || action.type === 'SET_WRITING' || action.type === 'SET_LISTENING_PLAYBACK' || action.type === 'TICK') {
      current.current.state = next;
      setState(next);
    } else publishSession(next);
    save(next);
  }, [getState, publishSession, save]);
  // The factory stores these getters. It only reads them when a command runs after commit.
  const commands = useMemo(
    () =>
      // oxlint-disable-next-line react/refs
      createIeltsCommands({
        getState,
        getContent,
        dispatch: dispatchAndSave,
        publishSession,
        persistSession: async session => {
          await draftSaves.flush();
          await (await persistence.getDraftRepository()).saveIelts(session, getContent());
          draftSaves.clearError();
        },
        flushDrafts: draftSaves.flush,
        // External installation callers must observe the new content and its
        // derived audio status before the installation promise resolves.
        setContent: publishContent,
        getRepository: persistence.getRepository,
        getContentStore: persistence.getContentStore,
      }),
    [getState, getContent, persistence, dispatchAndSave, publishSession, publishContent],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      persistence.getContentStore().then((store) => store.loadActive()),
      persistence.getRepository(),
    ])
      .then(async ([documents, reader]) => {
        const active = documents.reduce(replaceActiveContent, { listening: listeningDocument, reading: readingDocument, writing: writingDocument });
        const drafts = await persistence.getDraftRepository();
        const restored = await drafts.loadIelts(reader);
        if (cancelled) return;
        publishContent(restored.documents.reduce(replaceActiveContent, active));
        publishSession(sessionReducer(getState(), { type: 'RESTORE', session: restored.session }));
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
  }, [persistence, getState, publishSession, publishContent]);
  const loadPracticeContent = useCallback(async (key: string) => (await persistence.getContentStore()).loadByKey(key), [persistence]);
  return { state, content, contentReady, loadError, commands, loadPracticeContent };
}
