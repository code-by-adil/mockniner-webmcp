import { SQLocal } from 'sqlocal'
import { migrateDatabase } from './migrations'

const DATABASE_PATH = 'webmcp-ielts.sqlite3'

let databasePromise: Promise<SQLocal> | null = null

async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false

  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

async function initializeDatabase(): Promise<SQLocal> {
  const database = new SQLocal({
    databasePath: DATABASE_PATH,
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
  })

  try {
    await migrateDatabase(database)
    await requestPersistentStorage()

    const info = await database.getDatabaseInfo()
    if (info.storageType !== 'opfs') {
      throw new Error(
        'Persistent local storage is unavailable. Open this app in a browser with OPFS support and cross-origin isolation enabled.',
      )
    }

    return database
  } catch (error) {
    await database.destroy(true).catch(() => undefined)
    throw error
  }
}

export function getLocalDatabase(): Promise<SQLocal> {
  databasePromise ??= initializeDatabase().catch((error) => {
    databasePromise = null
    throw error
  })
  return databasePromise
}
