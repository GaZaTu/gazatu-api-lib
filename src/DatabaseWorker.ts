declare const self: Worker

import { SQLOutputValue } from "node:sqlite"
import { SQLite3 } from "./sqlite3/SQLite3.ts"
import { SQLite3FastQuery, SQLQuery } from "./sqlite3/SQLite3FastQuery.ts"

type WorkerMessage = [
  inputPtr: bigint,
  outputPtr: bigint,
]

type WorkerResult = [
  error?: [
    message: string,
    stack?: string,
    offset?: number,
  ],
]

const WORKER_URL = new URL(import.meta.url)
if (WORKER_URL.searchParams.has("worker")) {
  const database = await SQLite3.open(undefined, {
    readonly: WORKER_URL.searchParams.get("readonly") === "true",
  })

  self.postMessage(null)

  self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const [inputPtr, outputPtr] = event.data
    const result: WorkerResult = []

    try {
      database.selectEncoded(inputPtr, outputPtr)
    } catch (error: any) {
      if (error instanceof Error) {
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

export class DatabaseWorker extends Worker implements Disposable {
  private _ready = Promise.withResolvers<void>()

  private _task?: PromiseWithResolvers<Record<string, SQLOutputValue>[]>

  private _query = new SQLite3FastQuery()

  public onchange?: (event: { tables: string[] }) => void

  private _onConnect = () => {
    this.removeEventListener("message", this._onConnect)
    this.addEventListener("message", this._onMessage)
    this._ready.resolve()
  }

  private _onMessage = (event: MessageEvent<WorkerResult>) => {
    const [errorData] = event.data

    const { resolve, reject } = this._task!
    this._task = undefined

    if (errorData) {
      const cause = new Error(errorData[0])
      cause.stack = errorData[1]

      const error = new Error(cause.message, { cause })
      reject(error)
      return
    }

    const {
      rows,
      updatedTables,
    } = this._query.decodeOutput()

    if (updatedTables.length) {
      this.onchange?.({
        tables: updatedTables,
      })
    }

    // if (!rows.length && changes) {
    //   rows.push({ changes })
    // }

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

  async all(...[sql, args, env]: SQLQuery) {
    this._query.encodeInput(sql, args, env)
    this.postMessage([this._query.inputPtr, this._query.outputPtr] as WorkerMessage)

    this._task = Promise.withResolvers()
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
