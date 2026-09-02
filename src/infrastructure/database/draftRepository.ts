import type { SQLocal } from 'sqlocal';
import type { AttemptReader } from '@/application/attemptReader';
import { getIeltsDrafts, getResumableSection, initialSession, type IeltsSession } from '@/domain/session';
import { initialAssessmentSession, type AssessmentSession } from '@/domain/assessmentSession';
import { storedSessionSchema, ASSESSMENT_SESSION_STORAGE_KEY } from '../assessmentSessionStorage';
import { parseAssessmentPackage, type AssessmentPackage } from '@/domain/assessment';
import { parsePracticeContentDocument, type ActiveContentDocuments, type PracticeContentDocument } from '@/domain/contentDocument';
import { STORAGE_KEY, parseSnapshot, attemptSnapshotSchema, snapshotAttempt, restoreAttempt } from '../ieltsSessionStorage';
import type { SectionKey } from '@/domain/types';
import { storageHealth } from '../storageHealth';
import { defaultSpeakingPlan } from '@/domain/speakingPlan';

type Connection = Pick<SQLocal, 'sql'>;
type DraftRow = { id: string; stateJson: string };
type Snapshot = ReturnType<typeof attemptSnapshotSchema.parse>;
export type RecoveryIssue = { id: string; message: string };

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

function assessmentSnapshot(session: AssessmentSession) {
  const draft = storedSessionSchema.parse({
    attemptId: session.attemptId, packageId: session.packageId, partId: session.partId, itemId: session.itemId,
    secondsRemaining: session.secondsRemaining, deadlineAt: session.deadlineAt, responses: session.responses,
    workspace: session.workspace, startedAt: session.startedAt,
  });
  const assessment = parseAssessmentPackage(session.packageSnapshot);
  if (assessment.packageId !== draft.packageId) throw new Error('The assessment draft does not match its content.');
  const part = assessment.parts.find(part => part.id === draft.partId);
  if (!part?.items.some(item => item.id === draft.itemId)) throw new Error('The saved question does not exist in the pinned assessment.');
  const ids = new Set(assessment.parts.flatMap(part => part.items.map(item => item.id)));
  if (Object.keys(draft.responses).some(id => !ids.has(id))) throw new Error('Saved responses do not match the pinned assessment.');
  return { draft, assessment };
}

export function createDraftRepository(database: SQLocal, storage?: Pick<Storage, 'getItem' | 'removeItem'>) {
  const known = { ielts: new Set<string>(), assessment: new Set<string>() };
  const imports = new Map<string, Promise<void>>();
  const issues: RecoveryIssue[] = [];
  const unavailable = (id: string, error: unknown) => {
    const message = error instanceof Error && (error.name === 'ZodError' || error instanceof SyntaxError)
      ? 'This saved draft could not be read. Its original data is included in local exports.'
      : (error instanceof Error ? error.message : String(error)).slice(0, 240);
    if (!issues.some(issue => issue.id === id)) issues.push({ id, message });
    storageHealth.report(`${id}: ${message}`);
  };
  const write = async (db: Connection, family: 'ielts' | 'assessment', rows: DraftRow[]) => {
    for (const [position, row] of rows.entries()) await db.sql`
      INSERT INTO practice_drafts (id, family, position, state_json, updated_at)
      VALUES (${row.id}, ${family}, ${position}, ${row.stateJson}, ${new Date().toISOString()})
      ON CONFLICT(id) DO UPDATE SET position = excluded.position, state_json = excluded.state_json, updated_at = excluded.updated_at`;
    for (const id of known[family]) if (!rows.some(row => row.id === id)) await db.sql`DELETE FROM practice_drafts WHERE id = ${id} AND family = ${family}`;
  };
  const runImport = async (key: string, convert: (raw: string, tx: Connection) => Promise<void>) => {
    const raw = storage?.getItem(key);
    if (!raw) return;
    const [prior] = await database.sql<{ status: string; raw: string }>`SELECT status, raw_value AS raw FROM storage_imports WHERE storage_key = ${key}`;
    if (prior) {
      if (prior.raw !== raw) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
        const recoveryKey = `${key}:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
        await database.sql`INSERT OR IGNORE INTO storage_imports (storage_key, raw_value, status, message, imported_at)
          VALUES (${recoveryKey}, ${raw}, 'unavailable', 'An older app wrote a different legacy draft after import. It was preserved without replacing current work.', ${new Date().toISOString()})`;
        unavailable(key, 'A different legacy draft was found after import. Both copies were kept; export your data for recovery.');
        return;
      }
      if (prior.status === 'unavailable') unavailable(key, 'A legacy draft could not be imported. Its original data is included in local exports.');
      else storage?.removeItem(key);
      return;
    }
    try {
      await database.transaction(async tx => {
        await convert(raw, tx);
        await tx.sql`INSERT INTO storage_imports (storage_key, raw_value, status, imported_at) VALUES (${key}, ${raw}, 'imported', ${new Date().toISOString()})`;
      });
      storage?.removeItem(key);
    } catch {
      unavailable(key, 'A legacy draft could not be imported. Its original data is included in local exports.');
      await database.sql`INSERT OR IGNORE INTO storage_imports (storage_key, raw_value, status, message, imported_at)
        VALUES (${key}, ${raw}, 'unavailable', 'The legacy draft could not be imported. Its raw contents are included in local exports.', ${new Date().toISOString()})`;
    }
  };
  const importLegacy = (key: string, convert: (raw: string, tx: Connection) => Promise<void>) => {
    const pending = imports.get(key);
    if (pending) return pending;
    const importing = runImport(key, convert).finally(() => { imports.delete(key); });
    imports.set(key, importing);
    return importing;
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
    issues,
    async loadIelts(reader: AttemptReader, content: ActiveContentDocuments) {
      await importLegacy(STORAGE_KEY, async (raw, tx) => {
        const snapshot = parseSnapshot(raw);
        const rows: DraftRow[] = [];
        for (const value of [snapshot, ...snapshot.pausedDrafts]) {
          if (value.draft.mode && !value.draft.attemptId) value.draft.attemptId = crypto.randomUUID();
          if (value.draft.mode === 'full' || value.draft.currentSection === 'speaking') value.draft.speakingPlan ??= defaultSpeakingPlan;
          value.draft.contentKeys ??= Object.fromEntries(Object.values(content).filter(doc => value.draft.mode === 'full' || doc.section === value.draft.currentSection).map(doc => [doc.section, doc.contentKey]));
          for (const doc of Object.values(content)) if (value.draft.contentKeys[doc.section] === doc.contentKey) await pinContent(tx, doc);
          const next = await completedSnapshot(tx, value);
          if (next) rows.push({ id: next.draft.attemptId!, stateJson: JSON.stringify(next) });
        }
        await write(tx, 'ielts', rows);
      });
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
    async saveIelts(session: IeltsSession, content: ActiveContentDocuments) {
      const rows = await database.transaction(async tx => {
        const rows = await nativeRows(tx, session, content);
        await write(tx, 'ielts', rows);
        return rows;
      });
      known.ielts = new Set(rows.map(row => row.id));
    },
    async loadAssessment(packages: AssessmentPackage[]): Promise<AssessmentSession> {
      await importLegacy(ASSESSMENT_SESSION_STORAGE_KEY, async (raw, tx) => {
        const draft = storedSessionSchema.parse(JSON.parse(raw));
        const assessment = packages.find(pack => pack.packageId === draft.packageId);
        if (!assessment) throw new Error('The unfinished assessment package is unavailable.');
        const [submitted] = await tx.sql`SELECT id FROM assessment_attempts WHERE id = ${draft.attemptId}`;
        if (!submitted) await write(tx, 'assessment', [{ id: draft.attemptId, stateJson: JSON.stringify({ draft, assessment }) }]);
      });
      const rows = await database.sql<DraftRow>`SELECT id, state_json AS stateJson FROM practice_drafts WHERE family = 'assessment' ORDER BY position, updated_at DESC`;
      let result = initialAssessmentSession;
      for (const row of rows) {
        try {
          const raw = JSON.parse(row.stateJson);
          const parsed = assessmentSnapshot({ ...initialAssessmentSession, ...raw.draft, packageSnapshot: raw.assessment });
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
          const snapshot = assessmentSnapshot(session);
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
  return repository ??= import('./client').then(async ({ getLocalDatabase }) => createDraftRepository(await getLocalDatabase(), typeof localStorage === 'undefined' ? undefined : localStorage));
}
