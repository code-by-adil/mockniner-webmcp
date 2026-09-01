import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLocal } from "sqlocal";
import { writingDocument } from "@/content/writing";
import { migrateDatabase } from "./migrations";
import { loadActiveContent, saveAndActivateContent } from "./contentRepository";

let database: SQLocal;

beforeAll(() => {
  vi.stubGlobal("Worker", class TestWorker {});
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  let resolveConnected!: () => void;
  const connected = new Promise<void>((resolve) => {
    resolveConnected = resolve;
  });
  database = new SQLocal({
    databasePath: ":memory:",
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
    onConnect: resolveConnected,
  });
  await connected;
  await migrateDatabase(database);
});

afterEach(async () => {
  await database.destroy(true);
});

describe("local content repository", () => {
  it("stores and reloads the active validated document", async () => {
    await saveAndActivateContent(database, writingDocument);
    await expect(loadActiveContent(database)).resolves.toEqual([writingDocument]);
  });

  it("does not allow a content key to silently change meaning", async () => {
    await saveAndActivateContent(database, writingDocument);
    await expect(
      saveAndActivateContent(database, {
        ...writingDocument,
        name: "Different content with the same key",
      }),
    ).rejects.toThrow("already installed with different data");
  });

  it("loads valid sections even when an older active document no longer validates", async () => {
    const onInvalidContent = vi.fn();
    await saveAndActivateContent(database, writingDocument);
    await database.sql`
      INSERT INTO content_documents (
        content_key, section, schema_version, document_json, installed_at
      ) VALUES (
        'legacy-reading', 'reading', 1, '{"section":"reading"}',
        '2026-09-02T10:00:00.000Z'
      )
    `;
    await database.sql`
      INSERT INTO active_content (section, content_key)
      VALUES ('reading', 'legacy-reading')
    `;

    await expect(loadActiveContent(database, onInvalidContent)).resolves.toEqual([writingDocument]);
    expect(onInvalidContent).toHaveBeenCalledWith(
      expect.any(Error),
      { contentKey: "legacy-reading", section: "reading" },
    );
  });
});
