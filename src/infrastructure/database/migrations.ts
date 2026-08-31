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
] as const

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

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue

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
