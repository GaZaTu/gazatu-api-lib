declare const self: Worker

import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { appdataDir } from "./appinfo.ts"
import { getStringSimilarity } from "./getStringSimilarity.ts"
import { CodedDataView } from "./deno-ffi-utils.ts"
import { ulid } from "jsr:@std/ulid@^1.0.0"

export type SQLQuery = [
  sql: string,
  params: any[],
  env?: Record<string, string>,
]

type WorkerMessage = [
  sql: string,
  params: any[],
  env?: Record<string, string>,
]

type WorkerResult = [
  error?: [
    message: string,
    stack?: string,
    offset?: number,
  ],
]

type WorkerInit = [
  resultBuffer: SharedArrayBuffer,
]

const createNewUUID = () => {
  return crypto.randomUUID().replaceAll("-", "")
}

const createNewULID = () => {
  return ulid()
}

export const openDatabase = async (options: { readonly?: boolean, memory?: boolean } = {}) => {
  const databaseFile = options.memory ? ":memory:" : `${appdataDir}/database.sqlite3`
  if (!options.memory) {
    await Deno.mkdir(dirname(databaseFile), { recursive: true })
  }

  const {
    SQLite3,
  } = await import("./sqlite3/sqlite3.ts")

  const db = SQLite3.open(databaseFile, options)

  db.createFunction("new_uuid", {}, createNewUUID)
  db.createFunction("new_ulid", {}, createNewULID)
  db.createFunction("string_similarity", {}, getStringSimilarity)

  const pathToDatabaseFunctions = new URL(import.meta.resolve("~/src/bundled/database-functions.js"))
  if (existsSync(pathToDatabaseFunctions)) {
    const functionsModule = await Deno.readTextFile(pathToDatabaseFunctions)
    const functions = await import(`data:text/javascript,${encodeURIComponent(functionsModule)}`)
    for (const [name, func] of Object.entries(functions)) {
      if (typeof func === "function") {
        db.createFunction(name, {}, func as any)
      }
    }
  }

  return db
}

const WORKER_URL = new URL(import.meta.url)
if (WORKER_URL.searchParams.has("worker")) {
  const resultBuffer = new SharedArrayBuffer(1024 * 1024 * 8)
  const resultView = new CodedDataView(resultBuffer)

  const url = new URL(import.meta.url)
  const database = await openDatabase({
    readonly: url.searchParams.get("readonly") === "true",
  })

  self.postMessage([resultBuffer] as WorkerInit)

  self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const [sql, params, env] = event.data
    const result: WorkerResult = []

    try {
      const statement = database.prepare(sql, { persistent: true })

      if (env) {
        for (const [key, value] of Object.entries(env)) {
          database.setenv(key, value)
        }
      }

      statement.allIntoBuffer(params, resultView)

      if (env) {
        for (const [key] of Object.entries(env)) {
          database.setenv(key, null)
        }
      }
    } catch (error: any) {
      if (error instanceof database.Error) {
        result[0] = [
          error.message,
          error.stack,
          error.offset,
        ]
      } else if (error instanceof Error) {
        console.log(error)
        result[0] = [
          error.message,
          error.stack,
        ]
      } else {
        result[0] = [
          String(error),
        ]
      }
    } finally {
      self.postMessage(result)
    }
  }
}

export class DatabaseError extends Error {
  offset?: number
}

class DatabaseWorker extends Worker {
  private _ready = Promise.withResolvers<void>()

  private _resultBuffer = new SharedArrayBuffer(0)
  private _resultView = new CodedDataView(this._resultBuffer)

  private _decodeResult!: typeof import("./sqlite3/sqlite3.ts").sqlite3_decode_result

  private _task?: PromiseWithResolvers<any[]>

  public onchange?: (event: { tables: string[] }) => void

  private _onConnect = async (event: MessageEvent<WorkerInit>) => {
    [this._resultBuffer] = event.data

    const {
      sqlite3_decode_result,
    } = await import("./sqlite3/sqlite3.ts")
    this._resultView = new CodedDataView(this._resultBuffer)
    this._decodeResult = sqlite3_decode_result

    this.removeEventListener("message", this._onConnect)
    this.addEventListener("message", this._onMessage)
    this._ready.resolve()
  }

  private _onMessage = (event: MessageEvent<WorkerResult>) => {
    const [errorData] = event.data

    const { resolve, reject } = this._task!
    this._task = undefined

    if (errorData) {
      const cause = new DatabaseError(errorData[0])
      cause.stack = errorData[1]
      cause.offset = errorData[2]

      const error = new DatabaseError(cause.message, { cause })
      error.offset = cause.offset
      reject(error)
      return
    }

    const {
      rows,
      updates,
      changes,
    } = this._decodeResult(this._resultView)

    if (updates.length) {
      this.onchange?.({
        tables: [...new Set(updates)].filter(t => !t.startsWith("FTS_")),
      })
    }

    if (!rows.length && changes) {
      rows.push({ changes })
    }

    resolve(rows)
  }

  constructor(options?: { readonly?: boolean }) {
    const url = new URL(import.meta.url)
    url.searchParams.set("worker", String(true))
    url.searchParams.set("readonly", String(options?.readonly ?? false))
    super(url, {
      type: "module",
    })

    this.addEventListener("message", this._onConnect)
  }

  [Symbol.dispose]() {
    this.terminate()
  }

  async all(...[sql, params, env]: SQLQuery) {
    this._task = Promise.withResolvers()
    this.postMessage([sql, params, env] as WorkerMessage)
    const result = await this._task!.promise
    return result
  }

  get ready() {
    return this._ready.promise
  }

  get idle() {
    return !this._task
  }
}

export default DatabaseWorker
