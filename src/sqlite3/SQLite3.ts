import { existsSync, PathLike } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync, StatementSync } from "node:sqlite"
import { appdataDir } from "../appinfo.ts"
import libsqlitezatu_so from "./libsqlitezatu.so" with { type: "bytes" }

export const DENO_SQLITEZATU_PATH = `${appdataDir}/libsqlitezatu.so`

const sqlitezatuStats = await (async () => {
  try {
    return await Deno.stat(DENO_SQLITEZATU_PATH)
  } catch {
    return undefined
  }
})()

if (sqlitezatuStats?.size !== libsqlitezatu_so.byteLength) {
  await Deno.mkdir(dirname(DENO_SQLITEZATU_PATH), { recursive: true })
  await Deno.writeFile(DENO_SQLITEZATU_PATH, libsqlitezatu_so)
}

export class SQLite3 extends DatabaseSync {
  private _optimizer = setInterval(() => this.optimize(), 1000 * 60 * 60 * 1)

  private _selectEncoded: StatementSync

  private constructor(path?: PathLike, opts?: { readonly?: boolean }) {
    if (!path) {
      path = `${appdataDir}/database.sqlite3`
    }

    super(path, {
      open: true,
      allowExtension: true,
      readOnly: opts?.readonly,
    })

    this.exec("PRAGMA trusted_schema = ON")
    this.exec("PRAGMA foreign_keys = ON")

    if (path !== ":memory:") {
      this.exec("PRAGMA journal_mode = wal")
      this.exec("PRAGMA wal_autocheckpoint = 512")
      this.exec("PRAGMA synchronous = normal")
    }

    this.loadExtension(DENO_SQLITEZATU_PATH)
    this._selectEncoded = this.prepare("SELECT __select_encoded(?, ?)")
  }

  static async open(path?: PathLike, opts?: { readonly?: boolean }) {
    const db = new this(path, opts)
    await db.loadBundledFunctions()
    return db
  }

  override close(): void {
    clearInterval(this._optimizer)
    super.close()
  }

  private optimize() {
    try {
      this.exec("PRAGMA optimize")
      this.exec("PRAGMA wal_checkpoint")
    } catch {
      // ignore
    }
  }

  private async loadBundledFunctions() {
    const functionsPath = new URL(import.meta.resolve("~/bundled/database-functions.js"))
    if (existsSync(functionsPath)) {
      const functionsSource = await Deno.readTextFile(functionsPath)
      const functionsModule = await import(`data:text/javascript,${encodeURIComponent(functionsSource)}`)
      for (const [name, func] of Object.entries(functionsModule)) {
        if (typeof func === "function") {
          this.function(name, (func as any).options ?? {}, func as any)
        }
      }
    }
  }

  selectEncoded(inputPtr: bigint, outputPtr: bigint) {
    this._selectEncoded.all(inputPtr, outputPtr)
  }

  transaction(transaction: () => void) {
    this.exec("BEGIN")
    try {
      transaction()
      this.exec("COMMIT")
    } catch (error) {
      this.exec("ROLLBACK")
      throw error
    }
  }

  get libversion() {
    const stmt = this.prepare(`SELECT __library_version_string()`)
    return Object.values(stmt.get() ?? {})[0] as string
  }

  get libversion_number() {
    const stmt = this.prepare(`SELECT __library_version_number()`)
    return Object.values(stmt.get() ?? {})[0] as number
  }

  get user_version() {
    const stmt = this.prepare(`PRAGMA user_version`)
    return Object.values(stmt.get() ?? {})[0] as number
  }

  set user_version(value) {
    this.exec(`PRAGMA user_version = ${value}`)
  }
}
