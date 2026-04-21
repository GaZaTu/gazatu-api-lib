export type Constructor<T = unknown> = abstract new (...args: any[]) => T
export type ConstructorType<C> =
  // deno-lint-ignore ban-types
  C extends String ? string :
  // deno-lint-ignore ban-types
  C extends Number ? number :
  // deno-lint-ignore ban-types
  C extends Boolean ? boolean :
  C extends Constructor<infer T> ? ConstructorType<T> :
  C

export type Simplify<T> =
  T extends object ? T extends File | Uint8Array ? T : { [K in keyof T]: Simplify<T[K]> } :
  T

export type AllKeys<T> = T extends any ? keyof T : never

export type PickType<T, K extends AllKeys<T>> = T extends { [k in K]?: any } ? T[K] : never

export type PickTypeOf<T, K extends string | number | symbol> = K extends AllKeys<T> ? PickType<T, K> : never

export type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends ((x: infer I) => void) ? I : never

export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof A ? K extends keyof B ? A[K] | B[K] : A[K] : K extends keyof B ? B[K] : never
}

// deno-lint-ignore no-empty-interface
export interface ReflectableFieldMetadata {}

export interface ReflectableFieldInfo {
  readonly type: Constructor
  readonly metadata?: ReflectableFieldMetadata
}

const reflectableFieldsSymbol = Symbol()
const reflectableFieldsMap = (metadata: DecoratorMetadataObject) => {
  return (metadata[reflectableFieldsSymbol] ??= new Map()) as Map<PropertyKey, ReflectableFieldInfo>
}

const decorateField = (type?: Constructor, metadata?: ReflectableFieldMetadata) => {
  if (!type) {
    type = Unknown
  }

  return (unknown: unknown, context: ClassFieldDecoratorContext) => {
    reflectableFieldsMap(context.metadata)
      .set(context.name, { type, metadata })
  }
}

export interface InternalScalarConstructorRef<T> {
  readonly __ref: T
}

export class Void implements InternalScalarConstructorRef<void> {
  static readonly isVoid = true
  readonly __ref!: void
}

export class Unknown implements InternalScalarConstructorRef<unknown> {
  static readonly isUnknown = true
  readonly __ref!: unknown
}

export type UnpackAdvancedConstructorType<C> =
  ConstructorType<C> extends InternalScalarConstructorRef<infer T> ? T :
  ConstructorType<C>

type _Nullable<C extends Constructor = Constructor> = Constructor<UnpackAdvancedConstructorType<C> | null | undefined> & {
  readonly isNullable: true
  readonly ofType: C
}

class __Nullable {}
export const nullable = <C extends Constructor>(type: C): _Nullable<C> => {
  return class extends __Nullable {
    static readonly isNullable = true
    static readonly ofType = type
  } as any
}

const isNullableType = (type: Constructor): type is _Nullable => {
  return type.prototype instanceof __Nullable
}

type _ArrayOf<C extends Constructor = Constructor> = Constructor<Array<UnpackAdvancedConstructorType<C>>> & {
  readonly isArray: true
  readonly ofType: C
}

class __ArrayOf {}
export const arrayOf = <C extends Constructor>(type: C): _ArrayOf<C> => {
  return class extends __ArrayOf {
    static readonly isArray = true
    static readonly ofType = type
  } as any
}

const isArrayType = (type: Constructor): type is _ArrayOf => {
  return type.prototype instanceof __ArrayOf
}

type _RecordOf<C extends Constructor = Constructor> = Constructor<Record<string, UnpackAdvancedConstructorType<C>>> & {
  readonly isRecord: true
  readonly ofType: C
}

class __RecordOf {}
export const recordOf = <C extends Constructor>(type: C): _RecordOf<C> => {
  return class extends __RecordOf {
    static readonly isRecord = true
    static readonly ofType = type
  } as any
}

const isRecordType = (type: Constructor): type is _RecordOf => {
  return type.prototype instanceof __RecordOf
}

type _UnionOf<Cs extends Constructor[] = Constructor[]> = Constructor<UnpackAdvancedConstructorType<Cs[number]>> & {
  readonly isUnion: true
  readonly ofTypes: Cs
  publicName: string | undefined
}

class __UnionOf {}
export const unionOf = <Cs extends Constructor[]>(...types: Cs): _UnionOf<Cs> => {
  return class extends __UnionOf {
    static readonly isUnion = true
    static readonly ofTypes = types
    static publicName = undefined
  } as any
}

const isUnionType = (type: Constructor): type is _UnionOf => {
  return type.prototype instanceof __UnionOf
}

const cachedFieldMappingsSymbol = Symbol()

export class RunTyped {
  static readonly field = decorateField

  static getFields(type: Constructor) {
    const metadata = type[Symbol.metadata] as DecoratorMetadataObject | undefined
    if (!metadata) {
      return undefined
    }
    const fields = reflectableFieldsMap(metadata)
    return fields
  }

  static getFieldsWithMetadataEntry<K extends keyof ReflectableFieldMetadata>(type: Constructor, mkey: K) {
    const metadata = type[Symbol.metadata] as DecoratorMetadataObject | undefined
    if (!metadata) {
      return undefined
    }

    const cache: Record<string, Map<PropertyKey, NonNullable<ReflectableFieldMetadata[K]>>> = (metadata[cachedFieldMappingsSymbol] ??= {}) as any

    let result = cache[mkey]
    if (result) {
      return result
    }

    result = metadata[cachedFieldMappingsSymbol] = new Map()
    for (const [field, info] of reflectableFieldsMap(metadata)) {
      const selected = info.metadata?.[mkey]
      if (selected) {
        result.set(field, selected)
      }
    }

    return result
  }

  static getField<T>(type: Constructor<T>, key: keyof T) {
    return this.getFields(type)?.get(key)
  }

  static getFieldType<T>(type: Constructor<T>, key: keyof T) {
    return this.getField(type, key)?.type
  }

  static getFieldMetadata<T>(type: Constructor<T>, key: keyof T) {
    return this.getField(type, key)?.metadata
  }

  static getFieldMetadataEntry<T, K extends keyof ReflectableFieldMetadata>(type: Constructor<T>, key: keyof T, mkey: K) {
    return this.getFieldMetadata(type, key)?.[mkey]
  }

  static readonly isNullable = isNullableType
  static readonly isArray = isArrayType
  static readonly isRecord = isRecordType
  static readonly isUnion = isUnionType
}
