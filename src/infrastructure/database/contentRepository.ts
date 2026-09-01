import type { SQLocal } from "sqlocal";
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

export async function saveAndActivateContent(
  database: SQLocal,
  document: PracticeContentDocument,
): Promise<void> {
  const documentJson = JSON.stringify(document);

  await database.transaction(async (transaction) => {
    const [existing] = await transaction.sql<{ documentJson: string }>`
      SELECT document_json AS documentJson
      FROM content_documents
      WHERE content_key = ${document.contentKey}
    `;
    if (existing && existing.documentJson !== documentJson) {
      throw new Error(
        `Content key ${document.contentKey} is already installed with different data.`,
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
    await transaction.sql`
      INSERT INTO active_content (section, content_key)
      VALUES (${document.section}, ${document.contentKey})
      ON CONFLICT(section) DO UPDATE SET content_key = excluded.content_key
    `;
    if (document.section === "listening") {
      await transaction.sql`
        DELETE FROM listening_audio_chunks
        WHERE content_key IN (
          SELECT content_key
          FROM content_documents
          WHERE section = 'listening' AND content_key <> ${document.contentKey}
        )
      `;
    }
  });
}

export function createContentStore(
  database: SQLocal,
  onInvalidContent?: InvalidStoredContentHandler,
): ContentStore {
  return {
    loadActive: () => loadActiveContent(database, onInvalidContent),
    saveAndActivate: (document) => saveAndActivateContent(database, document),
  };
}
