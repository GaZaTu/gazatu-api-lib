import { createHash } from "node:crypto"
import { appdataDir } from "../appinfo.ts"
import { decodeCString, encodeCString, UnsafeOutParameter } from "../deno-ffi-utils.ts"
import libsqlite3_so from "./libsqlite3.so" with { type: "bytes" }

export const DENO_SQLITE_PATH = `${appdataDir}/libsqlite3.so`

const libsqliteStats = await (async () => {
  try {
    return await Deno.stat(DENO_SQLITE_PATH)
  } catch {
    return undefined
  }
})()

if (libsqliteStats?.size !== libsqlite3_so.byteLength) {
  await Deno.writeFile(DENO_SQLITE_PATH, libsqlite3_so)
}

const { symbols: sqlite3 } = Deno.dlopen(DENO_SQLITE_PATH, {
  sqlite3_open_v2: {
    parameters: [
      "buffer", // const char *filename
      "buffer", // sqlite3 **ppDb
      "i32", // int flags
      "pointer", // const char *zVfs
    ],
    result: "i32",
  },
  sqlite3_close_v2: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i32",
  },
  sqlite3_changes64: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i64",
  },
  sqlite3_total_changes: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i32",
  },
  sqlite3_last_insert_rowid: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i32",
  },
  sqlite3_get_autocommit: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i32",
  },
  sqlite3_prepare_v3: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *zSql
      "i32", // int nByte
      "u32", // unsigned int prepFlags
      "buffer", // sqlite3_stmt **ppStmt
      "buffer", // const char **pzTail
    ],
    result: "i32",
  },
  sqlite3_reset: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_clear_bindings: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_step: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_step_cb: {
    name: "sqlite3_step",
    callback: true,
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_column_count: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_column_type: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "i32",
  },
  sqlite3_column_text: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "pointer",
  },
  sqlite3_column_value: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "pointer",
  },
  sqlite3_finalize: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_exec: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *sql
      "pointer", // sqlite3_callback callback
      "pointer", // void *arg
      "buffer", // char **errmsg
    ],
    result: "i32",
  },
  sqlite3_free: {
    parameters: [
      "pointer", // void *p
    ],
    result: "void",
  },
  sqlite3_column_int: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "i32",
  },
  sqlite3_column_double: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "f64",
  },
  sqlite3_column_blob: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "pointer",
  },
  sqlite3_column_bytes: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "i32",
  },
  sqlite3_column_name: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "pointer",
  },
  sqlite3_column_decltype: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "u64",
  },
  sqlite3_bind_parameter_index: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "buffer", // const char *zName
    ],
    result: "i32",
  },
  sqlite3_bind_text: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
      "buffer", // const char *zData
      "i32", // int nData
      "pointer", // void (*xDel)(void*)
    ],
    result: "i32",
  },
  sqlite3_bind_blob: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
      "buffer", // const void *zData
      "i32", // int nData
      "pointer", // void (*xDel)(void*)
    ],
    result: "i32",
  },
  sqlite3_bind_double: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
      "f64", // double rValue
    ],
    result: "i32",
  },
  sqlite3_bind_int: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
      "i32", // int iValue
    ],
    result: "i32",
  },
  sqlite3_bind_int64: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
      "i64", // i64 iValue
    ],
    result: "i32",
  },
  sqlite3_bind_null: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "i32",
  },
  sqlite3_expanded_sql: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "pointer",
  },
  sqlite3_bind_parameter_count: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_complete: {
    parameters: [
      "buffer", // const char *sql
    ],
    result: "i32",
  },
  sqlite3_sourceid: {
    parameters: [],
    result: "pointer",
  },
  sqlite3_libversion: {
    parameters: [],
    result: "pointer",
  },
  sqlite3_libversion_number: {
    parameters: [],
    result: "i32",
  },
  sqlite3_blob_open: {
    parameters: [
      "pointer", /* sqlite3 *db */
      "buffer", /* const char *zDb */
      "buffer", /* const char *zTable */
      "buffer", /* const char *zColumn */
      "i64", /* sqlite3_int64 iRow */
      "i32", /* int flags */
      "buffer", /* sqlite3_blob **ppBlob */
    ],
    result: "i32",
  },
  sqlite3_blob_read: {
    parameters: [
      "pointer", /* sqlite3_blob *blob */
      "buffer", /* void *Z */
      "i32", /* int N */
      "i32", /* int iOffset */
    ],
    result: "i32",
  },
  sqlite3_blob_write: {
    parameters: [
      "pointer", /* sqlite3_blob *blob */
      "buffer", /* const void *z */
      "i32", /* int n */
      "i32", /* int iOffset */
    ],
    result: "i32",
  },
  sqlite3_blob_bytes: {
    parameters: ["pointer" /* sqlite3_blob *blob */],
    result: "i32",
  },
  sqlite3_blob_close: {
    parameters: ["pointer" /* sqlite3_blob *blob */],
    result: "i32",
  },
  sqlite3_sql: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "pointer",
  },
  sqlite3_stmt_readonly: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
    ],
    result: "i32",
  },
  sqlite3_bind_parameter_name: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "pointer",
  },
  sqlite3_errcode: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i32",
  },
  sqlite3_errmsg: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "pointer",
  },
  sqlite3_errstr: {
    parameters: [
      "i32", // int rc
    ],
    result: "pointer",
  },
  sqlite3_column_int64: {
    parameters: [
      "pointer", // sqlite3_stmt *pStmt
      "i32", // int iCol
    ],
    result: "i64",
  },
  sqlite3_backup_init: {
    parameters: [
      "pointer", // sqlite3 *pDest
      "buffer", // const char *zDestName
      "pointer", // sqlite3 *pSource
      "buffer", // const char *zSourceName
    ],
    result: "pointer",
  },
  sqlite3_backup_step: {
    parameters: [
      "pointer", // sqlite3_backup *p
      "i32", // int nPage
    ],
    result: "i32",
  },
  sqlite3_backup_finish: {
    parameters: [
      "pointer", // sqlite3_backup *p
    ],
    result: "i32",
  },
  sqlite3_backup_remaining: {
    parameters: [
      "pointer", // sqlite3_backup *p
    ],
    result: "i32",
  },
  sqlite3_backup_pagecount: {
    parameters: [
      "pointer", // sqlite3_backup *p
    ],
    result: "i32",
  },
  sqlite3_create_function: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *zFunctionName
      "i32", // int nArg
      "i32", // int eTextRep
      "pointer", // void *pApp
      "pointer", // void (*xFunc)(sqlite3_context*,int,sqlite3_value**)
      "pointer", // void (*xStep)(sqlite3_context*,int,sqlite3_value**)
      "pointer", // void (*xFinal)(sqlite3_context*)
    ],
    result: "i32",
  },
  sqlite3_result_blob: {
    parameters: [
      "pointer", // sqlite3_context *p
      "buffer", // const void *z
      "i32", // int n
      "isize", // void (*xDel)(void*)
    ],
    result: "void",
  },
  sqlite3_result_double: {
    parameters: [
      "pointer", // sqlite3_context *p
      "f64", // double rVal
    ],
    result: "void",
  },
  sqlite3_result_error: {
    parameters: [
      "pointer", // sqlite3_context *p
      "buffer", // const char *z
      "i32", // int n
    ],
    result: "void",
  },
  sqlite3_result_int: {
    parameters: [
      "pointer", // sqlite3_context *p
      "i32", // int iVal
    ],
    result: "void",
  },
  sqlite3_result_int64: {
    parameters: [
      "pointer", // sqlite3_context *p
      "i64", // sqlite3_int64 iVal
    ],
    result: "void",
  },
  sqlite3_result_null: {
    parameters: [
      "pointer", // sqlite3_context *p
    ],
    result: "void",
  },
  sqlite3_result_text: {
    parameters: [
      "pointer", // sqlite3_context *p
      "buffer", // const char *z
      "i32", // int n
      "isize", // void (*xDel)(void*)
    ],
    result: "void",
  },
  sqlite3_value_type: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "i32",
  },
  sqlite3_value_subtype: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "i32",
  },
  sqlite3_value_blob: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "pointer",
  },
  sqlite3_value_double: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "f64",
  },
  sqlite3_value_int: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "i32",
  },
  sqlite3_value_int64: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "i64",
  },
  sqlite3_value_text: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "pointer",
  },
  sqlite3_value_bytes: {
    parameters: [
      "pointer", // sqlite3_value *pVal
    ],
    result: "i32",
  },
  sqlite3_aggregate_context: {
    parameters: [
      "pointer", // sqlite3_context *p
      "i32", // int nBytes
    ],
    result: "pointer",
    optional: true,
  },
  sqlite3_enable_load_extension: {
    parameters: [
      "pointer", // sqlite3 *db
      "i32", // int onoff
    ],
    result: "i32",
    optional: true,
  },
  sqlite3_load_extension: {
    parameters: [
      "pointer", // sqlite3 *db
      "buffer", // const char *zFile
      "buffer", // const char *zProc
      "buffer", // const char **pzErrMsg
    ],
    result: "i32",
    optional: true,
  },
  sqlite3_initialize: {
    parameters: [],
    result: "i32",
  },
  sqlite3_db_handle: {
    parameters: [
      "pointer", // sqlite3_stmt *stmt
    ],
    result: "pointer",
  },
  sqlite3_error_offset: {
    parameters: [
      "pointer", // sqlite3 *db
    ],
    result: "i32",
  },
  sqlite3_update_hook: {
    parameters: [
      "pointer",  // sqlite3 *db
      "function", // void (*)(void *pApp, int op, const char *db, const char *tbl, int64_t rowid)
      "pointer",  // void *pApp
    ],
    result: "pointer",
  },
})

export const sqlite3_errmsg = (db: Deno.PointerValue) => {
  const ptr = sqlite3.sqlite3_errmsg(db)
  if (!ptr) {
    return null
  }
  const str = decodeCString(ptr)
  return str
}

export const sqlite3_errstr = (code: number) => {
  const ptr = sqlite3.sqlite3_errstr(code)
  if (!ptr) {
    return null
  }
  const str = decodeCString(ptr)
  return str
}

export const sqlite3_error_offset = sqlite3.sqlite3_error_offset

export class SQLite3Error extends Error {
  constructor(
    msg: string,
    public readonly code?: number,
    public readonly source?: string,
    public readonly offset?: number,
  ) {
    super(msg)
  }
}

export const SQLITE_OK = 0
export const SQLITE_ROW = 100
export const SQLITE_DONE = 101

export const sqlite3_unwrap = (code: number, db?: Deno.PointerValue, source?: string) => {
  if (code === SQLITE_OK || code === SQLITE_ROW || code === SQLITE_DONE) {
    return
  }

  if (db) {
    throw new SQLite3Error(sqlite3_errmsg(db) ?? "", code, source, sqlite3_error_offset(db))
  } else {
    throw new SQLite3Error(sqlite3_errstr(code) ?? "", code, source)
  }
}

export const SQLITE_OPEN_READONLY = 0x00000001
export const SQLITE_OPEN_READWRITE = 0x00000002
export const SQLITE_OPEN_CREATE = 0x00000004
export const SQLITE_OPEN_URI = 0x00000040
export const SQLITE_OPEN_MEMORY = 0x00000080

export const sqlite3_open_v2 = (path: string | URL, options: { readonly?: boolean, memory?: boolean }) => {
  if (path instanceof URL) {
    path = String(path)
  }

  let flags = SQLITE_OPEN_URI
  if (options.readonly) {
    flags |= SQLITE_OPEN_READONLY
  } else {
    flags |= SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
  }
  if (options.memory) {
    flags |= SQLITE_OPEN_MEMORY
  }

  const dbOut = new UnsafeOutParameter("pointer")
  const rc = sqlite3.sqlite3_open_v2(encodeCString(path), dbOut, flags, null)
  sqlite3_unwrap(rc)

  const db = dbOut.value!
  return db
}

export const sqlite3_close_v2 = (db: Deno.PointerObject) => {
  const rc = sqlite3.sqlite3_close_v2(db)
  sqlite3_unwrap(rc)
}

export const sqlite3_changes64 = (db: Deno.PointerObject) => {
  const changes = Number(sqlite3.sqlite3_changes64(db))
  return changes
}

export const sqlite3_exec = (db: Deno.PointerObject, sql: string) => {
  const rc = sqlite3.sqlite3_exec(db, encodeCString(sql), null, null, null)
  sqlite3_unwrap(rc, db)
}

export const SQLITE_STATIC = 0
export const SQLITE_TRANSIENT = -1

export const SQLITE_NULL = 5
export const SQLITE_INTEGER = 1
export const SQLITE_FLOAT = 2
export const SQLITE_TEXT = 3
export const SQLITE_BLOB = 4

export const SQLITE_PREPARE_PERSISTENT = 0x01

export const sqlite3_db_handle = sqlite3.sqlite3_db_handle

export const sqlite3_prepare_v3 = (db: Deno.PointerObject, sql: string, options?: { persistent?: boolean }) => {
  let flags = 0
  if (options?.persistent) {
    flags |= SQLITE_PREPARE_PERSISTENT
  }

  const stmtOut = new UnsafeOutParameter("pointer")
  const rc = sqlite3.sqlite3_prepare_v3(db, encodeCString(sql), sql.length, flags, stmtOut, null)
  sqlite3_unwrap(rc, db, sql)

  const stmt = stmtOut.value!
  return stmt
}

export const sqlite3_finalize = (stmt: Deno.PointerObject) => {
  const rc = sqlite3.sqlite3_finalize(stmt)
  sqlite3_unwrap(rc, sqlite3_db_handle(stmt))
}

export const SQLITE_DETERMINISTIC = 0x000000800
export const SQLITE_DIRECTONLY = 0x000080000

export const sqlite3_create_function = (db: Deno.PointerObject, name: string, options: { deterministic?: boolean, directonly?: boolean, varargs?: boolean }, handler: (...args: any[]) => any) => {
  let flags = 0
  if (options.deterministic) {
    flags |= SQLITE_DETERMINISTIC
  }
  if (options.directonly) {
    flags |= SQLITE_DIRECTONLY
  }

  const callback = new Deno.UnsafeCallback(
    {
      parameters: ["pointer", "i32", "buffer"],
      result: "void",
    },
    (ctx, nArgs, pArgs) => {
      const argptr = new Deno.UnsafePointerView(pArgs!);
      const args: any[] = [];
      for (let i = 0; i < nArgs; i++) {
        const arg = Deno.UnsafePointer.create(argptr.getBigUint64(i * 8))
        const type = sqlite3.sqlite3_value_type(arg)
        switch (type) {
        case SQLITE_INTEGER:
          args.push(sqlite3.sqlite3_value_int64(arg))
          break
        case SQLITE_FLOAT:
          args.push(sqlite3.sqlite3_value_double(arg))
          break
        case SQLITE_TEXT:
          args.push(
            new TextDecoder().decode(
              new Uint8Array(
                Deno.UnsafePointerView.getArrayBuffer(
                  sqlite3.sqlite3_value_text(arg)!,
                  sqlite3.sqlite3_value_bytes(arg),
                ),
              ),
            ),
          )
          break
        case SQLITE_BLOB:
          args.push(
            new Uint8Array(
              Deno.UnsafePointerView.getArrayBuffer(
                sqlite3.sqlite3_value_blob(arg)!,
                sqlite3.sqlite3_value_bytes(arg),
              ),
            ),
          )
          break;
        case SQLITE_NULL:
          args.push(null)
          break
        default:
          throw new Error(`Unknown type: ${type}`)
        }
      }

      let result: any
      try {
        result = handler(...args);
      } catch (error) {
        const buf = new TextEncoder().encode(String(error))
        sqlite3.sqlite3_result_error(ctx, buf, buf.byteLength)
        return
      }

      if (result === undefined || result === null) {
        sqlite3.sqlite3_result_null(ctx)
      } else if (typeof result === "boolean") {
        sqlite3.sqlite3_result_int(ctx, result ? 1 : 0)
      } else if (typeof result === "number") {
        if (Number.isSafeInteger(result)) {
          sqlite3.sqlite3_result_int64(ctx, BigInt(result))
        } else {
          sqlite3.sqlite3_result_double(ctx, result)
        }
      } else if (typeof result === "bigint") {
        sqlite3.sqlite3_result_int64(ctx, result)
      } else if (typeof result === "string") {
        const buffer = new TextEncoder().encode(result)
        sqlite3.sqlite3_result_text(ctx, buffer, buffer.byteLength, BigInt(SQLITE_STATIC))
      } else if (result instanceof Uint8Array) {
        sqlite3.sqlite3_result_blob(ctx, result, result.length, BigInt(SQLITE_TRANSIENT))
      } else {
        const buffer = new TextEncoder().encode(`Invalid return value: ${Deno.inspect(result)}`)
        sqlite3.sqlite3_result_error(ctx, buffer, buffer.byteLength)
      }
    },
  )

  const length = options.varargs ? -1 : handler.length

  const rc = sqlite3.sqlite3_create_function(db, encodeCString(name), length, flags, null, callback.pointer, null, null)
  sqlite3_unwrap(rc, db)
}

export class SQLite3Statement {
  protected _lastUsed = Date.now()

  constructor(
    public readonly handle: Deno.PointerObject,
    private readonly _removeFromCache: () => void,
  ) {}

  finalize() {
    this._removeFromCache()
    sqlite3_finalize(this.handle)
  }

  [Symbol.dispose]() {
    this.finalize()
  }

  all(params = [] as any[]): Record<string, any>[] {
    throw new Error("not implemented")
  }

  get lastUsed() {
    return this._lastUsed
  }
}

const minutes = (minutes: number) => 1000 * 60 * minutes
const hours = (hours: number) => minutes(60 * hours)
const days = (days: number) => hours(24 * days)

export class SQLite3<StatementType extends SQLite3Statement = SQLite3Statement> {
  public readonly Error = SQLite3Error

  private _statements = new Map<string, StatementType>()

  private _optimizer = setInterval(() => {
    this.optimize()
    this.finalizeUnusedStatements()
  }, hours(4))

  constructor(
    public readonly handle: Deno.PointerObject,
  ) {
    this.init()
  }

  static open(...args: Parameters<typeof sqlite3_open_v2>) {
    const ptr = sqlite3_open_v2(...args)
    return new SQLite3(ptr)
  }

  protected init() {
    this.execute("PRAGMA journal_mode = wal")
    this.execute("PRAGMA synchronous = normal")
    this.execute("PRAGMA wal_autocheckpoint = 512")
    this.execute("PRAGMA trusted_schema = ON")
    this.execute("PRAGMA foreign_keys = ON")
  }

  private optimize() {
    try {
      this.execute("PRAGMA optimize")
      this.execute("PRAGMA wal_checkpoint")
    } catch {
      // ignore
    }
  }

  private finalizeUnusedStatements() {
    const now = Date.now()
    for (const [, stmt] of this._statements) {
      if ((now - stmt.lastUsed) > days(3)) {
        continue
      }
      try {
        stmt.finalize()
      } catch {
        // ignore
      }
    }
  }

  close() {
    clearInterval(this._optimizer)
    for (const [, stmt] of this._statements) {
      stmt.finalize()
    }
    sqlite3_close_v2(this.handle)
  }

  [Symbol.dispose]() {
    this.close()
  }

  get changes() {
    return sqlite3_changes64(this.handle)
  }

  execute(sql: string): void
  execute(sql: string, params: any[]): Record<string, any>[]
  execute(sql: string, params?: any[]): Record<string, any>[] | void {
    if (params) {
      using stmt = this.prepare(sql)
      return stmt.all(params)
    } else {
      sqlite3_exec(this.handle, sql)
    }
  }

  protected get StatementConstructor(): (new (...args: ConstructorParameters<typeof SQLite3Statement>) => StatementType) {
    return SQLite3Statement as any
  }

  prepare(sql: string, options?: { persistent?: boolean }): StatementType {
    const cacheKey = createHash("sha1")
      .update(sql)
      .digest("hex")

    const existing = this._statements.get(cacheKey)
    if (existing) {
      return existing
    }

    const removeFromCache = () => {
      this._statements.delete(cacheKey)
    }

    const ptr = sqlite3_prepare_v3(this.handle, sql, options)
    const stmt = new this.StatementConstructor(ptr, removeFromCache)
    this._statements.set(cacheKey, stmt)
    return stmt
  }

  transaction(transaction: () => void) {
    this.execute("BEGIN")
    try {
      transaction()
      this.execute("COMMIT")
    } catch (error) {
      this.execute("ROLLBACK")
      throw error
    }
  }

  createFunction(name: string, options: { deterministic?: boolean, directonly?: boolean, varargs?: boolean }, handler: (...args: any[]) => any) {
    sqlite3_create_function(this.handle, name, options, handler)
  }

  pragma<T>(name: string): T
  pragma<T>(name: string, value: T): void
  pragma<T>(name: string, value?: T | undefined): T | void {
    if (value) {
      this.execute(`PRAGMA ${name} = ${value}`)
    } else {
      using stmt = this.prepare(`PRAGMA ${name}`)
      return Object.values(stmt.all()[0] ?? {})[0]
    }
  }

  get libversion() {
    return decodeCString(sqlite3.sqlite3_libversion())!
  }

  get libversion_number() {
    return sqlite3.sqlite3_libversion_number()
  }

  get user_version() {
    return this.pragma<number>("user_version")
  }

  set user_version(value) {
    this.pragma<number>("user_version", value)
  }
}
