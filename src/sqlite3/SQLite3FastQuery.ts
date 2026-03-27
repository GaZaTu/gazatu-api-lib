import type { SQLInputValue, SQLOutputValue } from "node:sqlite"
import { CodedDataView } from "../ffi-utils.ts"

export type SQLQuery = [
  sql: string,
  args: (SQLInputValue | boolean)[],
  env?: Record<string, string>,
]

const SQLITE_NULL = 5
const SQLITE_INTEGER = 1
const SQLITE_FLOAT = 2
const SQLITE_TEXT = 3
const SQLITE_BLOB = 4

export class SQLite3FastQuery {
  static readonly INTERNAL_SQL = "SELECT __select_encoded(?, ?)"

  private _inputBuffer = new ArrayBuffer(1024 * 1024 * 2)
  private _inputView = new CodedDataView(this._inputBuffer)
  readonly inputPtr = Deno.UnsafePointer.value(Deno.UnsafePointer.of(this._inputBuffer))

  private _outputBuffer = new ArrayBuffer(1024 * 1024 * 8)
  private _outputView = new CodedDataView(this._outputBuffer)
  readonly outputPtr = Deno.UnsafePointer.value(Deno.UnsafePointer.of(this._outputBuffer))

  encodeInput(...[sql, args, env]: SQLQuery) {
    this._inputView.index = 0

    this._inputView.encodeText(sql)

    this._inputView.encodeInt16(args.length)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (arg === undefined || arg === null) {
        this._inputView.encodeInt8(SQLITE_NULL)
      } else if (typeof arg === "boolean") {
        this._inputView.encodeInt8(SQLITE_INTEGER)
        this._inputView.encodeBigInt64(BigInt(arg ? 1 : 0))
      } else if (typeof arg === "number") {
        if (Number.isSafeInteger(arg)) {
          this._inputView.encodeInt8(SQLITE_INTEGER)
          this._inputView.encodeBigInt64(BigInt(arg))
        } else {
          this._inputView.encodeInt8(SQLITE_FLOAT)
          this._inputView.encodeFloat64(arg)
        }
      } else if (typeof arg === "bigint") {
        this._inputView.encodeInt8(SQLITE_INTEGER)
        this._inputView.encodeBigInt64(BigInt(arg))
      } else if (typeof arg === "string") {
        this._inputView.encodeInt8(SQLITE_TEXT)
        this._inputView.encodeText(arg)
      } else if (arg instanceof Uint8Array) {
        this._inputView.encodeInt8(SQLITE_BLOB)
        this._inputView.encodeBlob(arg)
      } else {
        throw new Error(`Invalid param value: ${Deno.inspect(arg)}`)
      }
    }

    const envEntries = Object.entries(env ?? {})
    this._inputView.encodeInt16(envEntries.length)
    for (const [name, value] of envEntries) {
      this._inputView.encodeText(name)
      this._inputView.encodeText(value)
    }
  }

  decodeOutput() {
    this._outputView.index = 0

    const updatedTables = this._outputView.decodeText().split(",")
      .filter(t => !!t)

    const columns = new Array<string>(this._outputView.decodeInt16())
    for (let c = 0; c < columns.length; c++) {
      columns[c] = this._outputView.decodeText().replaceAll("\"", "\\\"")
    }

    const getColumnValue = () => {
      const type = this._outputView.decodeInt8()
      switch (type) {
      case SQLITE_NULL:
        return null
      case SQLITE_INTEGER:
        return Number(this._outputView.decodeBigInt64())
      case SQLITE_FLOAT:
        return Number(this._outputView.decodeFloat64())
      case SQLITE_TEXT:
        return this._outputView.decodeText()
      case SQLITE_BLOB:
        return this._outputView.decodeBlob()
      default:
        throw new Error()
      }
    }

    const getRowObject: (() => Record<string, SQLOutputValue>) = new Function(
      "getColumnValue",
      `
        return () => {
          return {
            ${columns.map(n => `"${n}": getColumnValue()`).join(",")}
          }
        }
      `,
    )(getColumnValue)

    const rows = new Array<Record<string, SQLOutputValue>>(this._outputView.decodeInt16())
    for (let r = 0; r < rows.length; r++) {
      rows[r] = getRowObject()
    }

    return {
      rows,
      updatedTables,
    }
  }
}
