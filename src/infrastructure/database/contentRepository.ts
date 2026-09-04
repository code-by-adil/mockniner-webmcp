import type { SQLocal } from "sqlocal";
import { recordPracticeActivity } from './practiceActivity';
import { ApplicationError } from '@/domain/errors';
import type { ContentStore } from "@/application/contentStore";
import {
  parsePracticeContentDocument,
  type PracticeContentDocument,
} from "@/domain/contentDocument";

type StoredContentRow = {
  contentKey: string;
  section: string;
  documentJson: string;
};

export type InvalidStoredContentHandler = (
  error: Error,
  row: Pick<StoredContentRow, "contentKey" | "section">,
) => void;

export async function loadActiveContent(
  database: SQLocal,
  onInvalidContent?: InvalidStoredContentHandler,
): Promise<PracticeContentDocument[]> {
  const rows = await database.sql<StoredContentRow>`
    SELECT
      content_documents.content_key AS contentKey,
      content_documents.section,
      content_documents.document_json AS documentJson
    FROM active_content
    INNER JOIN content_documents
      ON content_documents.content_key = active_content.content_key
    WHERE content_documents.archived = 0
    ORDER BY content_documents.section
  `;

  return rows.flatMap((row) => {
    try {
      const document = parsePracticeContentDocument(JSON.parse(row.documentJson));
      if (document.contentKey !== row.contentKey || document.section !== row.section) {
        throw new Error(`Stored content ${row.contentKey} does not match its index.`);
      }
      return [document];
    } catch (error) {
      // Persisted documents are an untrusted boundary. Keep the row for possible
      // future migration, but let the application use its bundled section fallback.
      onInvalidContent?.(
        error instanceof Error ? error : new Error(String(error)),
        { contentKey: row.contentKey, section: row.section },
      );
      return [];
    }
  });
}

export async function loadContentByKey(
  database: SQLocal,
  contentKey: string,
): Promise<PracticeContentDocument | null> {
  const [row] = await database.sql<StoredContentRow>`
    SELECT
      content_key AS contentKey,
      section,
      document_json AS documentJson
    FROM content_documents
    WHERE content_key = ${contentKey}
  `;
  if (!row) return null;

  const document = parsePracticeContentDocument(JSON.parse(row.documentJson));
  if (document.contentKey !== row.contentKey || document.section !== row.section) {
    throw new Error(`Stored content ${row.contentKey} does not match its index.`);
  }
  return document;
}

export async function saveAndActivateContent(
  database: SQLocal,
  document: PracticeContentDocument,
  options: { bundled?: boolean } = {},
): Promise<void> {
  const documentJson = JSON.stringify(document);

  await database.transaction(async (transaction) => {
    const [existing] = await transaction.sql<{ documentJson: string }>`
      SELECT document_json AS documentJson
      FROM content_documents
      WHERE content_key = ${document.contentKey}
    `;
    if (existing && existing.documentJson !== documentJson) {
      throw new ApplicationError('CONTENT_KEY_CONFLICT',
        `Content key ${document.contentKey} is already installed with different data.`,
        true,
      );
    }

    await transaction.sql`
      INSERT OR IGNORE INTO content_documents (
        content_key, section, schema_version, document_json, installed_at
      ) VALUES (
        ${document.contentKey}, ${document.section}, ${document.schemaVersion},
        ${documentJson}, ${new Date().toISOString()}
      )
    `;
    await transaction.sql`UPDATE content_documents SET archived = 0 WHERE content_key = ${document.contentKey}`;
    await transaction.sql`
      INSERT INTO active_content (section, content_key)
      VALUES (${document.section}, ${document.contentKey})
      ON CONFLICT(section) DO UPDATE SET content_key = excluded.content_key
    `;
    if (!existing && !options.bundled) await recordPracticeActivity(transaction, {
      type: 'practice_installed', kind: document.section,
      contentKey: document.contentKey, title: document.name,
    });
  });
}

export function createContentStore(
  database: SQLocal,
  onInvalidContent?: InvalidStoredContentHandler,
  bundledDocuments: PracticeContentDocument[] = [],
): ContentStore {
  return {
    loadLibrary: async () => {
      const rows = await database.sql<{ contentKey: string; section: string }>`SELECT content_key AS contentKey, section FROM content_documents WHERE archived = 0 ORDER BY installed_at DESC`;
      const documents = await Promise.all(rows.map(async row => {
        try { return await loadContentByKey(database, row.contentKey); }
        catch (error) { onInvalidContent?.(error instanceof Error ? error : new Error(String(error)), row); return null; }
      }));
      return [...new Map([...bundledDocuments, ...documents.filter(doc => doc !== null)].map(doc => [doc.contentKey, doc])).values()];
    },
    loadActive: () => loadActiveContent(database, onInvalidContent),
    loadByKey: async (contentKey) =>
      (await loadContentByKey(database, contentKey)) ??
      bundledDocuments.find((document) => document.contentKey === contentKey) ??
      null,
    saveAndActivate: (document) => saveAndActivateContent(database, document, {
      bundled: bundledDocuments.some(bundled => bundled.contentKey === document.contentKey &&
        JSON.stringify(bundled) === JSON.stringify(document)),
    }),
  };
}
