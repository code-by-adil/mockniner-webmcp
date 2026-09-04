import type { SQLocal } from 'sqlocal';
import type { AttemptReader } from '@/application/attemptReader';
import { getIeltsDrafts, getResumableSection, initialSession, type IeltsSession } from '@/domain/session';
import { initialAssessmentSession, type AssessmentSession } from '@/domain/assessmentSession';
import { snapshotAssessment } from '../assessmentDraftCodec';
import { parsePracticeContentDocument, type ActiveContentDocuments, type PracticeContentDocument } from '@/domain/contentDocument';
import { attemptSnapshotSchema, snapshotAttempt, restoreAttempt } from '../ieltsDraftCodec';
import type { SectionKey } from '@/domain/types';
import { storageHealth } from '../storageHealth';
import { defaultSpeakingPlan } from '@/domain/speakingPlan';

type Connection = Pick<SQLocal, 'sql'>;
type DraftRow = { id: string; stateJson: string };
type Snapshot = ReturnType<typeof attemptSnapshotSchema.parse>;

export async function pinContent(db: Connection, document: PracticeContentDocument) {
  const json = JSON.stringify(document);
  const [existing] = await db.sql<{ json: string }>`SELECT document_json AS json FROM content_documents WHERE content_key = ${document.contentKey}`;
  if (existing && existing.json !== json) throw new Error(`Content ${document.contentKey} has changed. The original draft has been kept.`);
  await db.sql`INSERT OR IGNORE INTO content_documents (content_key, section, schema_version, document_json, installed_at)
    VALUES (${document.contentKey}, ${document.section}, ${document.schemaVersion}, ${json}, ${new Date().toISOString()})`;
}

async function completedSnapshot(db: Connection, snapshot: Snapshot): Promise<Snapshot | null> {
  const { draft } = snapshot;
  if (!draft.attemptId) return null;
  const [submitted] = await db.sql<{ section: SectionKey }>`SELECT section FROM attempts WHERE id = ${draft.attemptId}`;
  if (submitted) {
    if (submitted.section !== draft.currentSection) throw new Error('Draft and submission section identities do not match.');
    snapshot.resultAttemptIds[submitted.section] = draft.attemptId;
    if (!draft.completedSections.includes(submitted.section)) draft.completedSections.push(submitted.section);
    if (submitted.section === 'listening' || submitted.section === 'reading') draft.answers[submitted.section] = {};
    if (submitted.section === 'writing') draft.writingDrafts = { 1: '', 2: '' };
    draft.view = 'home';
  }
  return getResumableSection({ ...initialSession, ...draft }) ? snapshot : null;
}

/** Called inside the submission transaction: full exams retain the next section. */
export async function completeDraft(db: Connection, id: string) {
  const [row] = await db.sql<{ family: string; stateJson: string }>`SELECT family, state_json AS stateJson FROM practice_drafts WHERE id = ${id}`;
  if (!row) return;
  if (row.family === 'ielts') {
    const next = await completedSnapshot(db, attemptSnapshotSchema.parse(JSON.parse(row.stateJson)));
    if (next) {
      await db.sql`UPDATE practice_drafts SET state_json = ${JSON.stringify(next)} WHERE id = ${id}`;
      await db.sql`DELETE FROM draft_recordings WHERE attempt_id = ${id}`;
      return;
    }
  }
  await db.sql`DELETE FROM practice_drafts WHERE id = ${id}`;
}

export function createDraftRepository(database: SQLocal) {
  const known = { ielts: new Set<string>(), assessment: new Set<string>() };
  const unavailable = (id: string, error: unknown) => {
    const message = error instanceof Error && (error.name === 'ZodError' || error instanceof SyntaxError)
      ? 'This saved draft could not be read. Its original data is included in local exports.'
      : (error instanceof Error ? error.message : String(error)).slice(0, 240);
    storageHealth.report(`${id}: ${message}`);
  };
  const write = async (db: Connection, family: 'ielts' | 'assessment', rows: DraftRow[]) => {
    for (const [position, row] of rows.entries()) await db.sql`
      INSERT INTO practice_drafts (id, family, position, state_json, updated_at)
      VALUES (${row.id}, ${family}, ${position}, ${row.stateJson}, ${new Date().toISOString()})
      ON CONFLICT(id) DO UPDATE SET position = excluded.position, state_json = excluded.state_json, updated_at = excluded.updated_at`;
    for (const id of known[family]) if (!rows.some(row => row.id === id)) await db.sql`DELETE FROM practice_drafts WHERE id = ${id} AND family = ${family}`;
  };
  const nativeRows = async (db: Connection, session: IeltsSession, content: ActiveContentDocuments) => {
    const rows: DraftRow[] = [];
    for (const attempt of getIeltsDrafts(session)) {
      const snapshot = snapshotAttempt(attempt);
      if (attempt.mode === 'full' || attempt.currentSection === 'speaking') snapshot.draft.speakingPlan ??= defaultSpeakingPlan;
      snapshot.draft.contentKeys ??= Object.fromEntries(Object.values(content).filter(doc => attempt.mode === 'full' || doc.section === attempt.currentSection).map(doc => [doc.section, doc.contentKey]));
      for (const [section, key] of Object.entries(snapshot.draft.contentKeys)) {
        const document = content[section as keyof ActiveContentDocuments];
        if (document.contentKey === key) await pinContent(db, document);
        else {
          const [stored] = await db.sql<{ key: string }>`SELECT content_key AS key FROM content_documents WHERE content_key = ${key}`;
          if (!stored) throw new Error(`Original content ${key} is unavailable. The draft has been kept.`);
        }
      }
      const next = await completedSnapshot(db, snapshot);
      if (next) rows.push({ id: attempt.attemptId!, stateJson: JSON.stringify(next) });
    }
    return rows;
  };
  return {
    async loadIelts(reader: AttemptReader) {
      const rows = await database.sql<DraftRow>`SELECT id, state_json AS stateJson FROM practice_drafts WHERE family = 'ielts' ORDER BY position, updated_at DESC`;
      const attempts = [];
      const documents: PracticeContentDocument[] = [];
      for (const row of rows) {
        try {
          const snapshot = attemptSnapshotSchema.parse(JSON.parse(row.stateJson));
          if (snapshot.draft.attemptId !== row.id) throw new Error('Draft identity does not match its index.');
          const next = await completedSnapshot(database, snapshot);
          if (!next) { known.ielts.add(row.id); continue; }
          const pinned: PracticeContentDocument[] = [];
          for (const [section, key] of Object.entries(next.draft.contentKeys ?? {})) {
            const [stored] = await database.sql<{ json: string }>`SELECT document_json AS json FROM content_documents WHERE content_key = ${key}`;
            if (!stored) throw new Error(`Original content ${key} is unavailable.`);
            const doc = parsePracticeContentDocument(JSON.parse(stored.json));
            if (doc.contentKey !== key || doc.section !== section) throw new Error('Pinned content identity does not match.');
            pinned.push(doc);
          }
          const attempt = await restoreAttempt(next, reader);
          attempts.push({ ...attempt, view: 'home' as const });
          documents.push(...pinned);
          known.ielts.add(row.id);
        } catch (error) { unavailable(row.id, error); }
      }
      return { session: attempts.length ? { ...attempts[0]!, pausedDrafts: attempts.slice(1) } : initialSession, documents };
    },
    async saveIelts(session: IeltsSession, content: ActiveContentDocuments, removedContentKey?: string) {
      const rows = await database.transaction(async tx => {
        const rows = await nativeRows(tx, session, content);
        await write(tx, 'ielts', rows);
        if (removedContentKey) {
          // Keep immutable question data for submitted objective reviews.
          await tx.sql`UPDATE content_documents SET archived = 1 WHERE content_key = ${removedContentKey}`;
          await tx.sql`DELETE FROM active_content WHERE content_key = ${removedContentKey}`;
          await tx.sql`DELETE FROM listening_audio_chunks WHERE content_key = ${removedContentKey}`;
        }
        return rows;
      });
      known.ielts = new Set(rows.map(row => row.id));
    },
    async loadAssessment(): Promise<AssessmentSession> {
      const rows = await database.sql<DraftRow>`SELECT id, state_json AS stateJson FROM practice_drafts WHERE family = 'assessment' ORDER BY position, updated_at DESC`;
      let result = initialAssessmentSession;
      for (const row of rows) {
        try {
          const raw = JSON.parse(row.stateJson);
          const parsed = snapshotAssessment({ ...initialAssessmentSession, ...raw.draft, packageSnapshot: raw.assessment });
          if (parsed.draft.attemptId !== row.id) throw new Error('Assessment draft identity does not match its index.');
          const [submitted] = await database.sql`SELECT id FROM assessment_attempts WHERE id = ${row.id}`;
          if (submitted) { known.assessment.add(row.id); continue; }
          if (result.attemptId) throw new Error('An additional draft is preserved for recovery.');
          result = { ...initialAssessmentSession, ...parsed.draft, packageSnapshot: parsed.assessment };
          known.assessment.add(row.id);
        } catch (error) { unavailable(row.id, error); }
      }
      return result;
    },
    async saveAssessment(session: AssessmentSession) {
      const rows: DraftRow[] = [];
      await database.transaction(async tx => {
        if (session.attemptId) {
          const snapshot = snapshotAssessment(session);
          const [submitted] = await tx.sql`SELECT id FROM assessment_attempts WHERE id = ${session.attemptId}`;
          if (!submitted) rows.push({ id: session.attemptId, stateJson: JSON.stringify(snapshot) });
        }
        await write(tx, 'assessment', rows);
      });
      known.assessment = new Set(rows.map(row => row.id));
    },
  };
}

let repository: Promise<ReturnType<typeof createDraftRepository>> | undefined;
export function getDraftRepository() {
  return repository ??= import('./client').then(async ({ getLocalDatabase }) => createDraftRepository(await getLocalDatabase()));
}
