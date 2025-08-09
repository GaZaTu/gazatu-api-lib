import { encodeCString, LITTLE_ENDIAN, UnsafeOutParameter } from "../deno-ffi-utils.ts"
import { TCCWorker } from "../tcc/tcc-worker.ts"
import sqlite3_extra_c from "./sqlite3-extra.c" with { type: "bytes" }
import sqlite3_h from "./sqlite3.h" with { type: "bytes" }
import { DENO_SQLITE_PATH, SQLite3, sqlite3_db_handle, sqlite3_unwrap, SQLITE_BLOB, SQLITE_FLOAT, SQLITE_INTEGER, SQLITE_NULL, SQLITE_TEXT, SQLite3Statement, sqlite3_open_v2 } from "./sqlite3.ts"
import { appdataDir } from "../appinfo.ts"

const { symbols: sqlite3_extra } = await TCCWorker.dlopen({
  outputPath: `${appdataDir}/libsqlite3extra.so`,
  outputIfChanged: true,
  library: {
    [DENO_SQLITE_PATH]: null,
  },
  include: {
    "sqlite3.h": sqlite3_h,
  },
  sources: {
    "sqlite3_extra.c": sqlite3_extra_c,
  },
  stdout: "inherit",
  stderr: "inherit",
  symbols: {
    sqlite3_step_all: {
      parameters: ["pointer", "buffer", "buffer", "buffer"],
      result: "i32",
    },
    sqlite3_start_collecting_updated_tables: {
      parameters: ["pointer"],
      result: "void",
    },
    sqlite3_register_env: {
      parameters: ["pointer"],
      result: "void",
    },
    sqlite3_getenv_impl: {
      parameters: ["pointer", "buffer", "i64"],
      result: "pointer",
    },
    sqlite3_setenv_impl: {
      parameters: ["pointer", "buffer", "i64", "buffer", "i64"],
      result: "void",
    },
  },
})

export const sqlite3_step_all = (stmt: Deno.PointerObject, params: BufferSource, result: BufferSource) => {
  const resultLen = new UnsafeOutParameter("u32")
  resultLen.value = result.byteLength
  const rc = sqlite3_extra.sqlite3_step_all(stmt, params, result, resultLen)
  sqlite3_unwrap(rc, sqlite3_db_handle(stmt))
  return resultLen.value
}

export const sqlite3_start_collecting_updated_tables = (db: Deno.PointerObject) => {
  sqlite3_extra.sqlite3_start_collecting_updated_tables(db)
}

export const sqlite3_register_env = (db: Deno.PointerObject) => {
  sqlite3_extra.sqlite3_register_env(db)
}

export const sqlite3_getenv = (db: Deno.PointerObject, name: string) => {
  const ptr = sqlite3_extra.sqlite3_getenv_impl(db, encodeCString(name), BigInt(name.length))
  if (!ptr) {
    return null
  }
  const view = new Deno.UnsafePointerView(ptr)
  const strlen = Number(view.getBigInt64(0))
  const strptr = new Deno.UnsafePointerView(view.getPointer(8)!)
  const str = new TextDecoder().decode(strptr.getArrayBuffer(strlen))
  return str
}

export const sqlite3_setenv = (db: Deno.PointerObject, name: string, value: string | null) => {
  sqlite3_extra.sqlite3_setenv_impl(db, encodeCString(name), BigInt(name.length), encodeCString(value), BigInt(value?.length ?? 0))
}

export class CodedDataView<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> extends DataView<TArrayBuffer> {
  public index = 0

  private _littleEndian = LITTLE_ENDIAN

  public textEncoder = new TextEncoder()
  public textDecoder = new TextDecoder()

  encodeInt8(value: number) {
    this.setInt8(this.index, value)
    this.index += 1
  }

  encodeInt16(value: number) {
    this.setInt16(this.index, value, this._littleEndian)
    this.index += 2
  }

  encodeInt32(value: number) {
    this.setInt32(this.index, value, this._littleEndian)
    this.index += 4
  }

  encodeBigInt64(value: number) {
    this.setBigInt64(this.index, BigInt(value), this._littleEndian)
    this.index += 8
  }

  encodeFloat64(value: number) {
    this.setFloat64(this.index, value, this._littleEndian)
    this.index += 8
  }

  encodeText(value: string) {
    this.encodeInt32(value.length)
    this.textEncoder.encodeInto(value, new Uint8Array(this.buffer, this.index))
    this.index += value.length
  }

  encodeBlob(value: Uint8Array) {
    this.encodeInt32(value.length)
    new Uint8Array(this.buffer).set(value, this.index)
    this.index += value.length
  }

  encodePointer(value: Deno.PointerValue) {
    this.encodeBigInt64(Number(Deno.UnsafePointer.value(value)))
  }

  decodeInt8() {
    const value = this.getInt8(this.index)
    this.index += 1
    return value
  }

  decodeInt16() {
    const value = this.getInt16(this.index, this._littleEndian)
    this.index += 2
    return value
  }

  decodeInt32() {
    const value = this.getInt32(this.index, this._littleEndian)
    this.index += 4
    return value
  }

  decodeBigInt64() {
    const value = this.getBigInt64(this.index, this._littleEndian)
    this.index += 8
    return Number(value)
  }

  decodeFloat64() {
    const value = this.getFloat64(this.index, this._littleEndian)
    this.index += 8
    return value
  }

  decodeText() {
    const length = this.decodeInt32()
    const value = this.textDecoder.decode(new Uint8Array(this.buffer, this.index, length))
    this.index += length
    return value
  }

  decodeBlob() {
    const length = this.decodeInt32()
    const value = new Uint8Array(this.buffer, this.index, length)
    this.index += length
    return value
  }

  decodePointer() {
    return Deno.UnsafePointer.create(BigInt(this.decodeBigInt64()))
  }
}

export const sqlite3_encode_params = (view: CodedDataView, params: any[]) => {
  view.encodeInt16(params.length)
  for (let param of params) {
    if (param === null) {
      view.encodeInt8(SQLITE_NULL)
      continue
    }
    if (param instanceof Date) {
      param = param.toISOString()
    }
    if (param instanceof URL) {
      param = String(param)
    }
    switch (typeof param) {
    case "boolean":
      view.encodeInt8(SQLITE_INTEGER)
      view.encodeBigInt64(Number(param))
      continue
    case "number":
      if (Number.isSafeInteger(param)) {
        view.encodeInt8(SQLITE_INTEGER)
        view.encodeBigInt64(param)
      } else {
        view.encodeInt8(SQLITE_FLOAT)
        view.encodeFloat64(param)
      }
      continue
    case "string":
      view.encodeInt8(SQLITE_TEXT)
      view.encodeText(param)
      continue
    }
    if (param instanceof Uint8Array) {
      view.encodeInt8(SQLITE_BLOB)
      view.encodeBlob(param)
      continue
    }
  }
  const length = view.index
  view.index = 0
  return length
}

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

  const getColumnValue = (col: string) => {
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
        ${columns.map(n => `"${n}": getColumnValue("${n}")`).join(",")}
      };
    };
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

export class SQLite3StatementExt extends SQLite3Statement {
  override all(params = [] as any[]) {
    const paramsBuffer = new ArrayBuffer(1024 * 1024 * 8)
    const resultBuffer = new ArrayBuffer(1024 * 1024 * 8)
    sqlite3_encode_params(new CodedDataView(paramsBuffer), params)
    this.allEncoded(paramsBuffer, resultBuffer)
    const { rows } = sqlite3_decode_result(new CodedDataView(resultBuffer))
    return rows
  }

  allEncoded(params: BufferSource, result: BufferSource) {
    this._lastUsed = Date.now()
    return sqlite3_step_all(this.handle, params, result)
  }
}

export class SQLite3Ext extends SQLite3<SQLite3StatementExt> {
  static override open(...args: Parameters<typeof sqlite3_open_v2>) {
    const ptr = sqlite3_open_v2(...args)
    return new SQLite3Ext(ptr)
  }

  protected override init() {
    super.init()

    sqlite3_register_env(this.handle)
    sqlite3_start_collecting_updated_tables(this.handle)
  }

  protected override get StatementConstructor() {
    return SQLite3StatementExt
  }

  getenv(name: string) {
    return sqlite3_getenv(this.handle, name)
  }

  setenv(name: string, value: string | null) {
    sqlite3_setenv(this.handle, name, value)
  }
}
