import { walk } from "jsr:@std/fs@^1.0.19/walk"
import { ulid } from "jsr:@std/ulid@^1.0.0"
import fastq from "npm:fastq@^1.19.1"
import DatabaseWorker, { DatabaseError, SQLQuery, openDatabase } from "./DatabaseWorker.ts"
import { PubSub } from "./graphql/graphql-subscriptions.ts"
import { SqliteQueryCompiler } from "./sql-sqlite-adapter.ts"
import { DatabaseAccess } from "./sql.ts"
import { registerAuditLogFunctions } from "./sqlite3/sqlite-auditlogfuncs.ts"
import { registerFTSSyncFunctions } from "./sqlite3/sqlite-ftssyncfuncs.ts"
import { registerMiscFunctions } from "./sqlite3/sqlite-misc.ts"
import { registerN2MFunctions } from "./sqlite3/sqlite-n2mfuncs.ts"

const setupDatabase = async () => {
  using database = await openDatabase()
  console.log(`using SQLite version ${database.libversion}`)

  if (database.libversion_number < 3038000) {
    throw new Error("minimum required SQLite version is 3.38.0")
  }

  registerAuditLogFunctions(database)
  registerFTSSyncFunctions(database)
  registerMiscFunctions(database)
  registerN2MFunctions(database)

  const sqlDir = "~/src/bundled/sql"
  const sqlDirUrl = new URL(import.meta.resolve(sqlDir))

  const upgradeScripts = []
  for await (const dirEntry of walk(sqlDirUrl)) {
    if (!dirEntry.isFile) {
      continue
    }

    const match = /v(\d+).sql$/.exec(dirEntry.name)
    if (!match) {
      continue
    }

    upgradeScripts.push({
      version: Number(match[1]),
      url: new URL(import.meta.resolve(dirEntry.path)),
    })
    upgradeScripts.sort((a, b) => a.version - b.version)
  }

  const initialVersion = database.user_version
  let version = initialVersion
  try {
    for (const upgradeScript of upgradeScripts) {
      if (upgradeScript.version <= version) {
        continue
      }

      if (version === initialVersion) {
        console.log(`updating database...`)
      }

      try {
        const script = await Deno.readTextFile(upgradeScript.url)

        database.transaction(() => {
          database.execute(script)
          database.user_version = (version = upgradeScript.version)
        })
      } catch (error) {
        console.error(`error while trying to update database to v${upgradeScript.version}`)
        throw error
      }
    }
  } finally {
    if (version !== initialVersion) {
      console.log(`updated database from v${initialVersion} to v${version}`)
    }
  }

  database.execute("PRAGMA optimize")
  database.execute("PRAGMA wal_checkpoint(TRUNCATE)")
}

const createEnqueFunction = (queue: fastq.queueAsPromised<SQLQuery, any[]>) => {
  return async (...task: SQLQuery) => {
    try {
      return await queue.push(task)
    } catch (cause: any) {
      const error = new DatabaseError(cause.message, { cause })
      if (cause instanceof DatabaseError) {
        error.offset = cause.offset
      }
      throw error
    }
  }
}

const createReader = async () => {
  const readerConcurrency = 2
  const readers = [] as DatabaseWorker[]

  while (readers.length < readerConcurrency) {
    const reader = new DatabaseWorker({ readonly: true })
    await reader.ready
    readers.push(reader)
  }

  const readWork = (task: SQLQuery) => {
    const worker = readers.find(w => w.idle)
    if (!worker) {
      throw new Error("No unused DatabaseWorker found")
    }

    return worker.all(...task)
  }

  const readQueue = fastq.promise(readWork, readerConcurrency)
  const readAll = createEnqueFunction(readQueue)

  return readAll
}

const createWriter = async () => {
  const writerConcurrency = 1
  const writer = new DatabaseWorker()
  await writer.ready

  writer.onchange = payload => {
    database.clearCache(...payload.tables)
    setTimeout(() => {
      databaseHooks.publish("change", payload)
    })
  }

  const writeWork = (task: SQLQuery) => {
    return writer.all(...task)
  }

  const writeQueue = fastq.promise(writeWork, writerConcurrency)
  const writeAll = createEnqueFunction(writeQueue)

  return writeAll
}

export const database = new DatabaseAccess({
  compiler: new SqliteQueryCompiler(),
  createReader: async () => {
    await setupDatabase()
    return await createReader()
  },
  createWriter,
  newid: ulid,
  enableCache: true,
})

export const databaseHooks = new PubSub<{
  "change": { tables: string[] }
}>()
