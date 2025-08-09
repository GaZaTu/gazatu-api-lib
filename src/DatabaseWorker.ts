declare const self: Worker

import { existsSync } from "node:fs"
import { dirname } from "node:path"
import { appdataDir } from "./appinfo.ts"
import { getStringSimilarity } from "./getStringSimilarity.ts"

export type SQLQuery = [
  sql: string,
  params: any[],
  env?: Record<string, string>,
]

type WorkerMessage = [
  sql: string,
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
  paramsBuffer: SharedArrayBuffer,
  resultBuffer: SharedArrayBuffer,
]

const createNewUUID = () => {
  return crypto.randomUUID().replaceAll("-", "")
}

export const openDatabase = async (options: { readonly?: boolean, memory?: boolean } = {}) => {
  const databaseFile = options.memory ? ":memory:" : `${appdataDir}/database.sqlite3`
  if (!options.memory) {
    await Deno.mkdir(dirname(databaseFile), { recursive: true })
  }

  const {
    SQLite3Ext,
  } = await import("./sqlite3/sqlite3-extra.ts")

  const db = SQLite3Ext.open(databaseFile, options)

  db.createFunction("new_uuid", {}, createNewUUID)
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
  const paramsBuffer = new SharedArrayBuffer(1024 * 1024 * 8)
  const paramsBytes = new Uint8Array(paramsBuffer)
  const resultBuffer = new SharedArrayBuffer(1024 * 1024 * 8)
  const resultBytes = new Uint8Array(resultBuffer)

  const url = new URL(import.meta.url)
  const database = await openDatabase({
    readonly: url.searchParams.get("readonly") === "true",
  })

  self.postMessage([paramsBuffer, resultBuffer] as WorkerInit)

  self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const [sql, env] = event.data
    const result: WorkerResult = []

    try {
      const statement = database.prepare(sql, { persistent: true })

      if (env) {
        for (const [key, value] of Object.entries(env)) {
          database.setenv(key, value)
        }
      }

      statement.allEncoded(paramsBytes, resultBytes)

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

  private _paramsBuffer = new SharedArrayBuffer(0)
  private _paramsView!: import("./sqlite3/sqlite3-extra.ts").CodedDataView
  private _resultBuffer = new SharedArrayBuffer(0)
  private _resultView!: import("./sqlite3/sqlite3-extra.ts").CodedDataView

  private _encodeParams!: typeof import("./sqlite3/sqlite3-extra.ts").sqlite3_encode_params
  private _decodeResult!: typeof import("./sqlite3/sqlite3-extra.ts").sqlite3_decode_result

  private _task?: PromiseWithResolvers<any[]>

  public onchange?: (event: { tables: string[] }) => void

  private _onConnect = async (event: MessageEvent<WorkerInit>) => {
    [this._paramsBuffer, this._resultBuffer] = event.data

    const {
      CodedDataView,
      sqlite3_encode_params,
      sqlite3_decode_result,
    } = await import("./sqlite3/sqlite3-extra.ts")
    this._paramsView = new CodedDataView(this._paramsBuffer)
    this._resultView = new CodedDataView(this._resultBuffer)
    this._encodeParams = sqlite3_encode_params
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
    this._encodeParams(this._paramsView, params)
    this.postMessage([sql, this._paramsBuffer, this._resultBuffer, env])
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
