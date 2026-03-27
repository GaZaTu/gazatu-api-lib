import { walk } from "jsr:@std/fs@^1.0.19/walk"
import { ulid } from "jsr:@std/ulid@^1.0.0"
import fastq from "npm:fastq@^1.19.1"
import { DatabaseWorker } from "./DatabaseWorker.ts"
import { PubSub } from "./graphql/graphql-subscriptions.ts"
import { SQLite3QueryCompiler } from "./sql-sqlite-adapter.ts"
import { DatabaseAccess } from "./sql.ts"
import { SQLite3 } from "./sqlite3/SQLite3.ts"
import { SQLQuery } from "./sqlite3/SQLite3FastQuery.ts"

const setupDatabase = async () => {
  using database = await SQLite3.open()
  console.log(`using SQLite version ${database.libversion}`)

  if (database.libversion_number < 3038000) {
    throw new Error("minimum required SQLite version is 3.38.0")
  }

  const sqlDir = "~/bundled/sql"
  const sqlDirUrl = new URL(import.meta.resolve(sqlDir))

  const upgradeScripts = []
  for await (const dirEntry of walk(sqlDirUrl)) {
    if (!dirEntry.isFile) {
      continue
    }

    const match = /^v(\d+).sql$/.exec(dirEntry.name)
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
          database.exec(script)
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

  database.exec("PRAGMA optimize")
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)")
}

const createEnqueueFunction = (queue: fastq.queueAsPromised<SQLQuery, any[]>) => {
  return async (...task: SQLQuery) => {
    try {
      return await queue.push(task)
    } catch (cause: any) {
      const error = new Error(cause.message, { cause })
      // if (cause instanceof DatabaseError) {
      //   error.offset = cause.offset
      // }
      throw error
    }
  }
}

const createReader = async () => {
  const readerConcurrency = 3
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
  const readAll = createEnqueueFunction(readQueue)

  return readAll
}

const createWriter = async (onchange: (payload: { tables: string[] }) => void) => {
  const writerConcurrency = 1
  const writer = new DatabaseWorker()
  await writer.ready

  writer.onchange = onchange

  const writeWork = (task: SQLQuery) => {
    return writer.all(...task)
  }

  const writeQueue = fastq.promise(writeWork, writerConcurrency)
  const writeAll = createEnqueueFunction(writeQueue)

  return writeAll
}

export class LocalSQLite3DatabaseAccess extends DatabaseAccess {
  readonly hooks = new PubSub<{
    "change": { tables: string[] }
  }>()

  constructor() {
    super({
      compiler: new SQLite3QueryCompiler(),
      createReader: async () => {
        await setupDatabase()
        return await createReader()
      },
      createWriter: async () => {
        const onchange = (payload: { tables: string[] }) => {
          this.clearCache(...payload.tables)
          setTimeout(() => {
            this.hooks.publish("change", payload)
          })
        }
        return await createWriter(onchange)
      },
      newid: ulid,
      enableCache: true,
    })
  }
}
