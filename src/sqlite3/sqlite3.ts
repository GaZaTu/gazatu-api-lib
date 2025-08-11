import { createHash } from "node:crypto"
import { CodedDataView, decodeCString, encodeCString, UnsafeOutParameter } from "../deno-ffi-utils.ts"
import { sqlite3 } from "./sqlite3-ffi.ts"

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
  sqlite3_unwrap(rc, db, sql)
}

export const SQLITE_STATIC = Deno.UnsafePointer.create(BigInt(0))
export const SQLITE_TRANSIENT = Deno.UnsafePointer.create(BigInt(-1))

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
      const argptr = new Deno.UnsafePointerView(pArgs!)
      const args: any[] = []
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
        sqlite3.sqlite3_result_text(ctx, buffer, buffer.byteLength, SQLITE_STATIC)
      } else if (result instanceof Uint8Array) {
        sqlite3.sqlite3_result_blob(ctx, result, result.length, SQLITE_TRANSIENT)
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

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const sqlite3_decode_result = (view: CodedDataView) => {
  const changes = view.decodeBigInt64()

  const updates = new Array<string>(view.decodeInt16())
  for (let u = 0; u < updates.length; u++) {
    const table = view.decodeText()
    updates[u] = table
  }

  const columns = new Array<string>(view.decodeInt16())
  for (let c = 0; c < columns.length; c++) {
    const column = view.decodeText().replaceAll("\"", "\\\"")
    columns[c] = column
  }

  const getColumnValue = () => {
    const type = view.decodeInt8()
    switch (type) {
    case SQLITE_NULL:
      return null
    case SQLITE_INTEGER:
      return view.decodeBigInt64()
    case SQLITE_FLOAT:
      return view.decodeFloat64()
    case SQLITE_TEXT:
      return view.decodeText()
    case SQLITE_BLOB:
      return view.decodeBlob()
    default:
      throw new Error()
    }
  }

  const getRowObject: (() => Record<string, any>) = new Function(
    "getColumnValue",
    `
    return () => {
      return {
        ${columns.map(n => `"${n}": getColumnValue()`).join(",")}
      }
    }
    `,
  )(getColumnValue)

  const rows = new Array<Record<string, any>>(view.decodeInt16())
  for (let r = 0; r < rows.length; r++) {
    rows[r] = getRowObject()
  }

  view.index = 0
  return {
    rows,
    updates,
    changes,
  }
}

type ClientData = {
  updates: Set<string>
  env: Map<string, string>
}

const DB_CLIENTDATA = new Map<bigint, ClientData>()

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

  protected bindParams(args: any[]) {
    for (let i = 0; i < args.length; i++) {
      const idx = i + 1
      const arg = args[i]
      if (arg === undefined || arg === null) {
        sqlite3.sqlite3_bind_null(this.handle, idx)
      } else if (typeof arg === "boolean") {
        sqlite3.sqlite3_bind_int(this.handle, idx, arg ? 1 : 0)
      } else if (typeof arg === "number") {
        if (Number.isSafeInteger(arg)) {
          sqlite3.sqlite3_bind_int64(this.handle, idx, BigInt(arg))
        } else {
          sqlite3.sqlite3_bind_double(this.handle, idx, arg)
        }
      } else if (typeof arg === "bigint") {
        sqlite3.sqlite3_bind_int64(this.handle, idx, arg)
      } else if (typeof arg === "string") {
        const buffer = textEncoder.encode(arg)
        sqlite3.sqlite3_bind_text(this.handle, idx, buffer, buffer.byteLength, SQLITE_STATIC)
      } else if (arg instanceof Uint8Array) {
        sqlite3.sqlite3_bind_blob(this.handle, idx, arg, arg.length, SQLITE_TRANSIENT)
      } else {
        throw new SQLite3Error(`Invalid param value: ${Deno.inspect(arg)}`)
      }
    }
  }

  all(params: any[] = []) {
    this._lastUsed = Date.now()

    this.bindParams(params)

    let status = sqlite3.sqlite3_step(this.handle)

    const columnCount = sqlite3.sqlite3_column_count(this.handle)
    const columns = new Array(columnCount)
    for (let col = 0; col < columnCount; col++) {
      columns[col] = decodeCString(sqlite3.sqlite3_column_name(this.handle, col))!
    }

    const getColumnValue = (idx: number) => {
      let blob: Deno.PointerValue
      let bloblen = 0
      const type = sqlite3.sqlite3_column_type(this.handle, idx)
      switch (type) {
      case SQLITE_NULL:
        return null
      case SQLITE_INTEGER:
        return Number(sqlite3.sqlite3_column_int64(this.handle, idx))
      case SQLITE_FLOAT:
        return sqlite3.sqlite3_column_double(this.handle, idx)
      case SQLITE_TEXT:
        blob = sqlite3.sqlite3_column_text(this.handle, idx)
        bloblen = sqlite3.sqlite3_column_bytes(this.handle, idx)
        return textDecoder.decode(Deno.UnsafePointerView.getArrayBuffer(blob!, bloblen))
      case SQLITE_BLOB:
        blob = sqlite3.sqlite3_column_blob(this.handle, idx)
        bloblen = sqlite3.sqlite3_column_bytes(this.handle, idx)
        return Deno.UnsafePointerView.getArrayBuffer(blob!, bloblen)
      default:
        throw new Error()
      }
    }

    const getRowObject: (() => Record<string, any>) = new Function(
      "getColumnValue",
      `
      return () => {
        return {
          ${columns.map((n, i) => `"${n}": getColumnValue(${i})`).join(",")}
        }
      }
    `)(getColumnValue)

    const rows: Record<string, any>[] = []
    while (status == SQLITE_ROW) {
      rows.push(getRowObject())
      status = sqlite3.sqlite3_step(this.handle)
    }

    sqlite3.sqlite3_reset(this.handle)
    if (params.length) {
      sqlite3.sqlite3_clear_bindings(this.handle)
    }

    return rows
  }

  allIntoBuffer(params: any[], result: ArrayBufferLike | CodedDataView) {
    if (!(result instanceof CodedDataView)) {
      result = new CodedDataView(result)
    }
    result.index = 0

    this._lastUsed = Date.now()

    this.bindParams(params)

    const dbhandle = sqlite3.sqlite3_db_handle(this.handle)
    const clientdata = DB_CLIENTDATA.get(Deno.UnsafePointer.value(dbhandle))!

    clientdata.updates.clear()

    let status = sqlite3.sqlite3_step(this.handle)

    result.encodeBigInt64(Number(sqlite3.sqlite3_changes64(dbhandle)))

    result.encodeInt16(clientdata.updates.size)
    for (const update of clientdata.updates) {
      result.encodeText(update)
    }

    const columnCount = sqlite3.sqlite3_column_count(this.handle)
    result.encodeInt16(columnCount)
    for (let col = 0; col < columnCount; col++) {
      const name = decodeCString(sqlite3.sqlite3_column_name(this.handle, col))!
      result.encodeText(name)
    }

    const rowCountIndex = result.index
    result.encodeInt16(0)

    let rowCount = 0
    while (status == SQLITE_ROW) {
      for (let col = 0; col < columnCount; col++) {
        let blob: Deno.PointerValue
        let bloblen = 0
        const type = sqlite3.sqlite3_column_type(this.handle, col)
        result.encodeInt8(type)
        switch (type) {
        case SQLITE_NULL:
          break
        case SQLITE_INTEGER:
          result.encodeBigInt64(Number(sqlite3.sqlite3_column_int64(this.handle, col)))
          break
        case SQLITE_FLOAT:
          result.encodeFloat64(sqlite3.sqlite3_column_double(this.handle, col))
          break
        case SQLITE_TEXT:
          blob = sqlite3.sqlite3_column_text(this.handle, col)
          bloblen = sqlite3.sqlite3_column_bytes(this.handle, col)
          result.encodeBlob(new Uint8Array(Deno.UnsafePointerView.getArrayBuffer(blob!, bloblen)))
          break
        case SQLITE_BLOB:
          blob = sqlite3.sqlite3_column_blob(this.handle, col)
          bloblen = sqlite3.sqlite3_column_bytes(this.handle, col)
          result.encodeBlob(new Uint8Array(Deno.UnsafePointerView.getArrayBuffer(blob!, bloblen)))
          break
        }
      }

      rowCount += 1
      status = sqlite3.sqlite3_step(this.handle)
    }

    result.setInt16(rowCountIndex, rowCount, result.littleEndian)

    sqlite3.sqlite3_reset(this.handle)
    if (params.length) {
      sqlite3.sqlite3_clear_bindings(this.handle)
    }

    sqlite3_unwrap(status, dbhandle)
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

  private _clientdata: ClientData = {
    updates: new Set(),
    env: new Map(),
  }

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

    DB_CLIENTDATA.set(Deno.UnsafePointer.value(this.handle), this._clientdata)

    const updateHook = new Deno.UnsafeCallback({
      result: "void",
      parameters: ["pointer", "i32", "buffer", "buffer", "i64"],
    }, (_0, op, _1, tbl, rowid) => {
      this._clientdata.updates.add(decodeCString(tbl)!)
    })

    sqlite3.sqlite3_update_hook(this.handle, updateHook.pointer, null)

    this.createFunction("getenv", {}, (name: string) => {
      return this.getenv(name)
    })
    this.createFunction("setenv", {}, (name: string, value: string | null) => {
      this.setenv(name, value)
    })
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

  getenv(name: string) {
    return this._clientdata.env.get(name)
  }

  setenv(name: string, value: string | null) {
    if (value === null) {
      this._clientdata.env.delete(name)
    } else {
      this._clientdata.env.set(name, value)
    }
  }
}
