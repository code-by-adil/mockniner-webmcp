import type { SQLocal } from 'sqlocal'

const migrations = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS attempts (
        id TEXT PRIMARY KEY,
        section TEXT NOT NULL CHECK (section IN ('listening', 'reading', 'writing', 'speaking')),
        content_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('submitted', 'evaluated')),
        started_at TEXT NOT NULL,
        submitted_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS speaking_responses (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        prompt_id INTEGER NOT NULL,
        part_label TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence >= 0),
        prompt_text TEXT NOT NULL,
        time_limit_seconds INTEGER NOT NULL CHECK (time_limit_seconds > 0),
        duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
        mime_type TEXT NOT NULL,
        byte_length INTEGER NOT NULL CHECK (byte_length > 0),
        audio BLOB NOT NULL,
        UNIQUE (attempt_id, prompt_id),
        UNIQUE (attempt_id, sequence),
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS speaking_responses_attempt_id
        ON speaking_responses(attempt_id)`,
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS objective_submissions (
        attempt_id TEXT PRIMARY KEY,
        answers_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS writing_submissions (
        attempt_id TEXT PRIMARY KEY,
        submission_json TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS writing_evaluations (
        attempt_id TEXT PRIMARY KEY,
        evaluation_json TEXT NOT NULL,
        evaluated_at TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS attempts_section_submitted_at
        ON attempts(section, submitted_at DESC)`,
    ],
  },
  {
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS content_documents (
        content_key TEXT PRIMARY KEY,
        section TEXT NOT NULL CHECK (section IN ('listening', 'reading', 'writing')),
        schema_version INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS active_content (
        section TEXT PRIMARY KEY CHECK (section IN ('listening', 'reading', 'writing')),
        content_key TEXT NOT NULL UNIQUE,
        FOREIGN KEY (content_key) REFERENCES content_documents(content_key)
      )`,
    ],
  },
  {
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS listening_audio_chunks (
        content_key TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence >= 0),
        part_id INTEGER NOT NULL CHECK (part_id BETWEEN 1 AND 4),
        segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
        kind TEXT NOT NULL CHECK (kind IN ('speech', 'silence')),
        duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
        mime_type TEXT,
        byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
        audio BLOB,
        created_at TEXT NOT NULL,
        PRIMARY KEY (content_key, sequence),
        FOREIGN KEY (content_key) REFERENCES content_documents(content_key) ON DELETE CASCADE,
        CHECK (
          (kind = 'speech' AND mime_type IS NOT NULL AND byte_length > 0 AND audio IS NOT NULL)
          OR
          (kind = 'silence' AND mime_type IS NULL AND byte_length = 0 AND audio IS NULL)
        )
      )`,
      `CREATE INDEX IF NOT EXISTS listening_audio_chunks_content_sequence
        ON listening_audio_chunks(content_key, sequence)`,
    ],
  },
  {
    version: 5,
    statements: [
      `ALTER TABLE listening_audio_chunks
        ADD COLUMN cache_version TEXT NOT NULL DEFAULT 'legacy-v1'`,
    ],
  },
  {
    version: 6,
    statements: [
      `ALTER TABLE speaking_responses
        ADD COLUMN transcript TEXT NOT NULL DEFAULT ''`,
      `CREATE TABLE IF NOT EXISTS speaking_evaluations (
        attempt_id TEXT PRIMARY KEY,
        evaluation_json TEXT NOT NULL,
        evaluated_at TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE
      )`,
    ],
  },
  {
    version: 9,
    statements: [
      `CREATE TABLE assessment_packages (
        package_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL CHECK (schema_version = 3),
        revision INTEGER NOT NULL CHECK (revision > 0),
        document_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      )`,
      `CREATE TABLE assessment_attempts (
        id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        package_snapshot_json TEXT NOT NULL,
        responses_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        submitted_at TEXT NOT NULL
      )`,
      `CREATE TABLE assessment_evaluations (
        attempt_id TEXT PRIMARY KEY,
        evaluation_json TEXT NOT NULL,
        evaluated_at TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX assessment_attempts_package_submitted_at
        ON assessment_attempts(package_id, submitted_at DESC)`,
    ],
  },
  {
    version: 10,
    statements: [
      `CREATE TABLE speaking_responses_new (
        id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, prompt_id INTEGER NOT NULL,
        part_label TEXT NOT NULL, sequence INTEGER NOT NULL CHECK (sequence >= 0),
        prompt_text TEXT NOT NULL, time_limit_seconds INTEGER NOT NULL CHECK (time_limit_seconds > 0),
        duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
        mime_type TEXT, byte_length INTEGER NOT NULL CHECK (byte_length >= 0), audio BLOB,
        transcript TEXT NOT NULL, response_status TEXT NOT NULL CHECK (response_status IN ('answered', 'skipped')),
        UNIQUE (attempt_id, prompt_id), UNIQUE (attempt_id, sequence),
        FOREIGN KEY (attempt_id) REFERENCES attempts(id) ON DELETE CASCADE,
        CHECK ((response_status = 'answered' AND audio IS NOT NULL AND byte_length > 0)
          OR (response_status = 'skipped' AND audio IS NULL AND byte_length = 0 AND duration_ms = 0 AND transcript = ''))
      )`,
      `INSERT INTO speaking_responses_new SELECT id, attempt_id, prompt_id, part_label, sequence,
        prompt_text, time_limit_seconds, duration_ms, mime_type, byte_length, audio, transcript, 'answered'
        FROM speaking_responses`,
      `DROP TABLE speaking_responses`,
      `ALTER TABLE speaking_responses_new RENAME TO speaking_responses`,
      `CREATE INDEX speaking_responses_attempt_id ON speaking_responses(attempt_id)`,
    ],
  },
  {
    version: 11,
    statements: [
      `CREATE TABLE practice_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recorded_at TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('practice_installed', 'practice_updated', 'attempt_submitted', 'feedback_attached')),
        kind TEXT NOT NULL CHECK (kind IN ('listening', 'reading', 'writing', 'speaking', 'assessment')),
        content_key TEXT,
        package_id TEXT,
        revision INTEGER CHECK (revision > 0),
        attempt_id TEXT,
        title TEXT CHECK (length(title) <= 160),
        outcome TEXT CHECK (outcome IN ('evaluated', 'insufficient_evidence')),
        CHECK ((kind = 'assessment' AND package_id IS NOT NULL AND revision IS NOT NULL AND content_key IS NULL)
          OR (kind <> 'assessment' AND content_key IS NOT NULL AND package_id IS NULL AND revision IS NULL)),
        CHECK ((event_type IN ('practice_installed', 'practice_updated') AND attempt_id IS NULL AND outcome IS NULL)
          OR (event_type = 'attempt_submitted' AND attempt_id IS NOT NULL AND outcome IS NULL)
          OR (event_type = 'feedback_attached' AND attempt_id IS NOT NULL AND outcome IS NOT NULL))
      )`,
    ],
  },
  {
    version: 12,
    statements: [
      `CREATE TABLE practice_drafts (
        id TEXT PRIMARY KEY NOT NULL,
        family TEXT NOT NULL CHECK (family IN ('ielts', 'assessment')),
        position INTEGER NOT NULL DEFAULT 0,
        state_json TEXT NOT NULL CHECK (json_valid(state_json)),
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE draft_recordings (
        attempt_id TEXT NOT NULL REFERENCES practice_drafts(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL CHECK (sequence >= 0),
        response_json TEXT NOT NULL CHECK (json_valid(response_json)),
        audio BLOB, mime_type TEXT,
        PRIMARY KEY (attempt_id, sequence)
      )`,
      `CREATE TABLE storage_imports (
        storage_key TEXT PRIMARY KEY NOT NULL, raw_value TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('imported', 'unavailable')),
        message TEXT, imported_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 13,
    statements: [
      `CREATE TABLE objective_explanations (
        attempt_id TEXT NOT NULL REFERENCES objective_submissions(attempt_id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL CHECK (question_id BETWEEN 1 AND 40),
        explanation_json TEXT NOT NULL CHECK (json_valid(explanation_json)),
        PRIMARY KEY (attempt_id, question_id)
      )`,
    ],
  },
] as const

export const DATABASE_VERSION = migrations.at(-1)!.version
export const DATABASE_MIGRATION_VERSIONS = migrations.map(migration => migration.version)

export async function migrateDatabase(database: SQLocal): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.sql(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`)

    const appliedRows = await transaction.sql<{ version: number }>(
      'SELECT version FROM app_schema_migrations',
    )
    const appliedVersions = new Set(appliedRows.map((row) => Number(row.version)))
    if (appliedRows.some(row => Number(row.version) > migrations.at(-1)!.version)) {
      throw new Error('This database was created by a newer app version. Update the app before opening it; your data has not been changed.')
    }

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue

      // Earlier universal schemas cannot be interpreted as version 3. Preserve
      // their tables for export/recovery instead of deleting the learner's work.
      if (migration.version === 9) {
        const existing = await transaction.sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'table'`
        for (const name of ['assessment_evaluations', 'assessment_attempts', 'assessment_packages']) {
          if (existing.some(table => table.name === name)) {
            await transaction.sql(`ALTER TABLE ${name} RENAME TO legacy_${name}_v8`)
          }
        }
        await transaction.sql('DROP INDEX IF EXISTS assessment_attempts_package_submitted_at')
      }

      for (const statement of migration.statements) {
        await transaction.sql(statement)
      }

      await transaction.sql`
        INSERT OR IGNORE INTO app_schema_migrations (version, applied_at)
        VALUES (${migration.version}, ${new Date().toISOString()})
      `
    }
  })
}
