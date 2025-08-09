import { endianness } from "node:os"

export const LITTLE_ENDIAN = endianness() === "LE"

const textEncoder = new TextEncoder()
export const encodeCString = (str: string | null | undefined) => {
  if (!str) {
    return null
  }
  return textEncoder.encode(str + "\0")
}

export const decodeCString = (ptr: Deno.PointerValue, offset?: number) => {
  if (!ptr) {
    return null
  }
  return Deno.UnsafePointerView.getCString(ptr, offset)
}

export const encodeNativeTypeToBytes = <T extends Deno.NativeType>(type: T, bytes: Uint8Array, value: Deno.FromNativeType<T>, littleEndian = false) => {
  const view = new DataView(bytes.buffer)
  switch (type) {
  case "i8":
    return view.setInt8(0, value as any)
  case "u8":
    return view.setUint8(0, value as any)
  case "i16":
    return view.setInt16(0, value as any, littleEndian)
  case "u16":
    return view.setUint16(0, value as any, littleEndian)
  case "i32":
    return view.setInt32(0, value as any, littleEndian)
  case "u32":
    return view.setUint32(0, value as any, littleEndian)
  case "i64":
    return view.setBigInt64(0, value as any, littleEndian)
  case "u64":
    return view.setBigUint64(0, value as any, littleEndian)
  case "f32":
    return view.setFloat32(0, value as any, littleEndian)
  case "f64":
    return view.setFloat64(0, value as any, littleEndian)
  case "pointer":
    return view.setBigUint64(0, Deno.UnsafePointer.value(value as any), littleEndian)
  default:
    throw new Error()
  }
}

export const decodeNativeTypeFromBytes = <T extends Deno.NativeType>(type: T, bytes: Uint8Array, littleEndian = false): Deno.FromNativeType<T> => {
  const view = new DataView(bytes.buffer)
  switch (type) {
  case "i8":
    return view.getInt8(0) as any
  case "u8":
    return view.getUint8(0) as any
  case "i16":
    return view.getInt16(0, littleEndian) as any
  case "u16":
    return view.getUint16(0, littleEndian) as any
  case "i32":
    return view.getInt32(0, littleEndian) as any
  case "u32":
    return view.getUint32(0, littleEndian) as any
  case "i64":
    return view.getBigInt64(0, littleEndian) as any
  case "u64":
    return view.getBigUint64(0, littleEndian) as any
  case "f32":
    return view.getFloat32(0, littleEndian) as any
  case "f64":
    return view.getFloat64(0, littleEndian) as any
  case "pointer":
    return Deno.UnsafePointer.create(view.getBigUint64(0, littleEndian)) as any
  default:
    throw new Error()
  }
}

export const sizeofNativeType = (type: Deno.NativeType) => {
  switch (type) {
  case "i8":
  case "u8":
    return 1
  case "i16":
  case "u16":
    return 2
  case "i32":
  case "u32":
    return 4
  case "i64":
  case "u64":
    return 8
  case "f32":
    return 4
  case "f64":
    return 8
  case "pointer":
    return 8
  default:
    throw new Error()
  }
}

export class UnsafeOutParameter<T extends Deno.NativeType> extends Uint8Array {
  constructor(
    private _type: T,
    private _littleEndian = LITTLE_ENDIAN,
  ) {
    super(sizeofNativeType(_type))
  }

  get pointer() {
    return Deno.UnsafePointer.of(this)
  }

  get value() {
    return decodeNativeTypeFromBytes(this._type, this, this._littleEndian)
  }

  set value(value) {
    encodeNativeTypeToBytes(this._type, this, value, this._littleEndian)
  }
}
