import type { SQLocal } from 'sqlocal';
import { DATABASE_MIGRATION_VERSIONS, DATABASE_VERSION } from './migrations';

const tables = [
  'app_schema_migrations', 'attempts', 'speaking_responses', 'objective_submissions',
  'writing_submissions', 'writing_evaluations', 'content_documents', 'active_content',
  'listening_audio_chunks', 'speaking_evaluations', 'assessment_packages',
  'assessment_attempts', 'assessment_evaluations', 'practice_activity',
  'practice_drafts', 'draft_recordings', 'storage_imports',
] as const;
const archives = ['legacy_assessment_packages_v8', 'legacy_assessment_attempts_v8', 'legacy_assessment_evaluations_v8'];
type Connection = Pick<SQLocal, 'sql'>;
type Column = { name: string; type: string; hidden: number };
type Table = { name: string; columns: Column[] };
export type BackupSummary = { practices: number; drafts: number; submissions: number; recordings: number };
export class BackupValidationError extends Error {}

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const columns = (db: Connection, name: string) => db.sql<Column>(`PRAGMA table_xinfo(${quote(name)})`);

/** Inspect only ordinary tables. Never install SQL supplied by a backup file. */
async function inspectTables(source: Connection, destination: Connection): Promise<Table[]> {
  const objects = await source.sql<{ name: string; type: string; sql: string | null }>`SELECT name, type, sql FROM sqlite_master`;
  if (objects.some(object => object.type === 'trigger' || object.type === 'view'
    || (object.type === 'table' && !/^CREATE TABLE\s/i.test(object.sql ?? '')))) {
    throw new BackupValidationError('This file contains unsupported database objects. Choose an unmodified practice backup.');
  }
  const names = objects.filter(object => object.type === 'table').map(object => object.name);
  if (tables.some(name => !names.includes(name)) || names.some(name =>
    !tables.includes(name as typeof tables[number]) && !archives.includes(name) && name !== 'sqlite_sequence')) {
    throw new BackupValidationError('This is not a compatible practice backup. Export a new backup from the current app.');
  }
  const versions = await source.sql<{ version: number }>`SELECT version FROM app_schema_migrations`;
  if (versions.some(row => row.version > DATABASE_VERSION)) {
    throw new BackupValidationError('This backup is from a newer app version. Update the app before importing it.');
  }
  if (!versions.some(row => row.version === DATABASE_VERSION)) {
    throw new BackupValidationError('This backup uses an older storage format that this app cannot import.');
  }
  if (DATABASE_MIGRATION_VERSIONS.some(version => !versions.some(row => row.version === version))
    || versions.some(row => !Number.isInteger(row.version) || row.version < 1)) {
    throw new BackupValidationError('This backup has an incomplete version history. Choose an unmodified practice backup.');
  }
  const result: Table[] = [];
  for (const name of names.filter(name => name !== 'sqlite_sequence')) {
    const fields = await columns(source, name);
    if (!fields.length || fields.length > 40 || fields.some(field => field.hidden !== 0
      || !/^[a-z_][a-z_0-9]*$/i.test(field.name) || !['TEXT', 'INTEGER', 'BLOB', 'REAL', 'NUMERIC', ''].includes(field.type.toUpperCase()))) {
      throw new BackupValidationError('This backup has an unsupported table layout.');
    }
    if (!archives.includes(name)) {
      const expected = await columns(destination, name);
      if (JSON.stringify(fields.map(field => [field.name, field.type])) !== JSON.stringify(expected.map(field => [field.name, field.type]))) {
        throw new BackupValidationError('This backup has an incompatible table layout. Export a new backup from the current app.');
      }
    }
    result.push({ name, columns: fields });
  }
  return result;
}

export async function inspectBackup(source: Connection, destination: Connection): Promise<BackupSummary> {
  await inspectTables(source, destination);
  const integrity = await source.sql<{ quick_check: string }>`PRAGMA quick_check`;
  if (integrity.length !== 1 || integrity[0]?.quick_check !== 'ok'
    || (await source.sql`PRAGMA foreign_key_check`).length) {
    throw new BackupValidationError('This backup is damaged or incomplete. Your current data has not been changed.');
  }
  const count = async (name: string) => (await source.sql<{ count: number }>(`SELECT count(*) AS count FROM ${quote(name)}`))[0]!.count;
  return {
    practices: await count('content_documents') + await count('assessment_packages'),
    drafts: await count('practice_drafts'),
    submissions: await count('attempts') + await count('assessment_attempts'),
    recordings: (await source.sql<{ count: number }>`SELECT
      (SELECT count(*) FROM speaking_responses WHERE audio IS NOT NULL) +
      (SELECT count(*) FROM draft_recordings WHERE audio IS NOT NULL) AS count`)[0]!.count,
  };
}

/** The live database is changed only by this transaction, never by a file overwrite. */
export async function restoreBackup(source: Connection, destination: SQLocal): Promise<void> {
  await inspectBackup(source, destination);
  const imported = await inspectTables(source, destination);
  await destination.transaction(async tx => {
    await tx.sql`PRAGMA defer_foreign_keys = ON`;
    // Complete all deletes before inserting: parent deletion may cascade.
    for (const name of tables) await tx.sql(`DELETE FROM ${quote(name)}`);
    for (const name of archives.toReversed()) await tx.sql(`DROP TABLE IF EXISTS ${quote(name)}`);
    for (const table of imported) {
      if (archives.includes(table.name)) {
        // Archived records are inert recovery data, not executable imported DDL.
        await tx.sql(`CREATE TABLE ${quote(table.name)} (${table.columns.map(field => `${quote(field.name)} ${field.type}`).join(', ')})`);
      }
      const fields = table.columns.map(field => quote(field.name)).join(', ');
      for (let offset = 0; ; offset += 50) {
        const rows = await source.sql<Record<string, string | number | Uint8Array | null>>(`SELECT ${fields} FROM ${quote(table.name)} LIMIT 50 OFFSET ${offset}`);
        for (const row of rows) {
          await tx.sql(`INSERT INTO ${quote(table.name)} (${fields}) VALUES (${table.columns.map(() => '?').join(', ')})`,
            ...table.columns.map(field => row[field.name]!));
        }
        if (rows.length < 50) break;
      }
    }
    if ((await tx.sql`PRAGMA foreign_key_check`).length) throw new BackupValidationError('The backup contains broken record links. Import was cancelled.');
  });
}
