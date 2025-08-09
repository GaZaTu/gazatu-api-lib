import { GraphQLArgumentConfig, GraphQLBoolean, GraphQLEnumType, GraphQLEnumValueConfigMap, GraphQLFieldConfig, GraphQLFieldResolver, GraphQLFloat, GraphQLID, GraphQLInputFieldConfig, GraphQLInputObjectType, GraphQLInputType, GraphQLInterfaceType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType, GraphQLScalarType, GraphQLSchema, GraphQLString } from "graphql"
import { extendGraphQLObjectType } from "./graphql-helpers.ts"

type Constructor<T = any> = abstract new (...args: any) => T

type Simplify<T> = T extends object ? T extends File ? File : { [K in keyof T]: Simplify<T[K]> } : T

export class Unknown {
  readonly isUnknown = true
}
export const GraphQLUnknown = new GraphQLScalarType<unknown>({
  name: Unknown.name,
})

export class Void {
  readonly isVoid = true
}
export const GraphQLVoid = new GraphQLScalarType<void>({
  name: Void.name,
  parseLiteral: () => undefined,
  parseValue: () => undefined,
  serialize: () => undefined,
})

export class Node {
  id!: string
  __typename?: string
}
export const GraphQLNode = new GraphQLInterfaceType({
  name: Node.name,
  fields: {
    id: {
      type: new GraphQLNonNull(GraphQLString),
      args: {},
    },
  },
})

export class ID {
  readonly isID = true
}

const createGraphQLFileError = () => {
  return new Error("File is only valid as multipart/form-data upload")
}

export const GraphQLFile = new GraphQLScalarType<File>({
  name: File.name,
  parseLiteral: () => {
    throw createGraphQLFileError()
  },
  parseValue: (input) => {
    if (input instanceof File) {
      return input
    } else {
      throw createGraphQLFileError()
    }
  },
  serialize: () => {
    throw createGraphQLFileError()
  },
})

const gqlclassMap = new Map<Constructor, { output?: GraphQLOutputType, input?: GraphQLInputType }>([
  [String, { output: GraphQLString, input: GraphQLString }],
  [Number, { output: GraphQLFloat, input: GraphQLFloat }],
  [Boolean, { output: GraphQLBoolean, input: GraphQLBoolean }],
  [Unknown, { output: GraphQLUnknown, input: GraphQLUnknown }],
  [Void, { output: GraphQLVoid, input: GraphQLVoid }],
  [Node, { output: GraphQLNode }],
  [ID, { output: GraphQLID, input: GraphQLID }],
  [File, { input: GraphQLFile }],
  [Date, { output: GraphQLString, input: GraphQLString }],
])

type TypedFieldConfig = Omit<GraphQLFieldConfig<any, any, any> & GraphQLInputFieldConfig, "type" | "args" | "astNode"> & {
  only?: "output" | "input"
  optional?: true
  type: Constructor
  args?: TypedGraphQLFieldConfigArgumentMap
}

const gqlpropMapSymbol = Symbol()
const gqlpropMap = (metadata: DecoratorMetadataObject) => {
  return (metadata[gqlpropMapSymbol] ??= new Map()) as Map<PropertyKey, TypedFieldConfig>
}

const convertTypedFieldConfigToFieldConfig = (path: string, name: string, config: TypedFieldConfig): GraphQLFieldConfig<any, any, any> => {
  path = `${path}.${name}`

  const type = gqlclassUnwrapIntoGraphQLType(config.type, "output")
  if (!type) {
    throw new Error(`Missing GraphQL type for property '${path}' of type '${config.type.name}'`)
  }

  let args = undefined as GraphQLFieldConfig<any, any, any>["args"] | undefined
  if (config.args) {
    args = {}

    for (const [argName, argConfig] of Object.entries(config.args)) {
      const type = gqlclassUnwrapIntoGraphQLType(argConfig.type, "input")
      if (!type) {
        throw new Error(`Missing GraphQL type for argument '${path}.${String(argName)}' of type '${argConfig.type.name}'`)
      }

      const {
        description,
        defaultValue,
        deprecationReason,
        extensions,
      } = argConfig

      args[argName] = {
        description,
        type,
        defaultValue,
        deprecationReason,
        extensions,
      }
    }
  }

  const {
    description,
    resolve,
    subscribe,
    deprecationReason,
    extensions,
  } = config

  return {
    description,
    type,
    args,
    resolve,
    subscribe,
    deprecationReason,
    extensions,
  }
}

const convertTypedFieldConfigToInputFieldConfig = (path: string, name: string, config: TypedFieldConfig): GraphQLInputFieldConfig => {
  path = `${path}.${name}`

  let type = gqlclassUnwrapIntoGraphQLType(config.type, "input")
  if (!type) {
    throw new Error(`Missing GraphQL type for property '${path}' of type '${config.type.name}'`)
  }

  if (config.optional && type instanceof GraphQLNonNull) {
    type = type.ofType
  }

  const {
    description,
    defaultValue,
    deprecationReason,
    extensions,
  } = config

  return {
    description,
    type,
    defaultValue,
    deprecationReason,
    extensions,
  }
}

export const gqlclass = (name?: string, options?: { only?: "output" | "input", isInterface?: true, implements?: Constructor[] }) => {
  return (unknown: unknown, context: ClassDecoratorContext) => {
    name ??= context.name

    context.addInitializer(function () {
      if (options?.isInterface) {
        const interfaceFields = {} as Record<string, GraphQLFieldConfig<any, any, any>>
        const interfaceType = new GraphQLInterfaceType({
          name: `${name}`,
          fields: () => outputFields,
        })

        gqlclassMap.set(this, { output: interfaceType })

        for (const [key, config] of gqlpropMap(context.metadata)) {
          if (config.only !== "input") {
            interfaceFields[String(key)] = convertTypedFieldConfigToFieldConfig(name!, String(key), config)
          }
        }

        return
      }

      const outputFields = {} as Record<string, GraphQLFieldConfig<any, any, any>>
      const outputType = new GraphQLObjectType({
        name: `${name}`,
        fields: () => outputFields,
        interfaces: options?.implements?.map(i => {
          return gqlclassUnwrapIntoGraphQLType(nullable(i), "output") as GraphQLInterfaceType
        }),
      })

      const inputFields = {} as Record<string, GraphQLInputFieldConfig>
      const inputType = new GraphQLInputObjectType({
        name: options?.only === "input" ? name! : `${name}Input`,
        fields: () => inputFields,
      })

      gqlclassMap.set(this, { output: outputType, input: inputType })

      for (const [key, config] of gqlpropMap(context.metadata)) {
        if (config.only !== "input") {
          outputFields[String(key)] = convertTypedFieldConfigToFieldConfig(name!, String(key), config)
        }

        if (config.only !== "output") {
          inputFields[String(key)] = convertTypedFieldConfigToInputFieldConfig(name!, String(key), config)
        }
      }
    })
  }
}

export const gqlprop = (type: Constructor, options?: Omit<GraphQLFieldConfig<any, any, any> & GraphQLInputFieldConfig, "type" | "astNode"> & { only?: "output" | "input", optional?: true }) => {
  return (unknown: unknown, context: ClassFieldDecoratorContext) => {
    gqlpropMap(context.metadata).set(context.name, { ...options, type })
  }
}

type TypedGraphQLArgumentConfig<T> = Omit<GraphQLArgumentConfig, "type"> & { type: T }

type TypedGraphQLFieldConfigArgumentMap = Record<string, TypedGraphQLArgumentConfig<any>>

type InferScalarType<T> =
  T extends ID ? string :
  // deno-lint-ignore ban-types
  T extends String ? string :
  // deno-lint-ignore ban-types
  T extends Number ? number :
  // deno-lint-ignore ban-types
  T extends Boolean ? boolean :
  T extends Unknown ? unknown :
  T extends Void ? void : T

type InferGraphQLType<O> =
  O extends Constructor & { ofType: Constructor<infer T>, nullable: true } ? InferScalarType<T> | null | undefined :
  O extends Constructor & { ofType: Constructor<infer T>, list: true } ? InferScalarType<T>[] :
  O extends Constructor<infer T> ? InferScalarType<T> : O

type InferedGraphQLFieldResolver<T, C, A, O> = GraphQLFieldResolver<T, C, A, InferGraphQLType<O> | Promise<InferGraphQLType<O>>>

type InferedGraphQLFieldSubscriptionResolver<T, C, A, O> = GraphQLFieldResolver<T, C, A, AsyncIterable<InferGraphQLType<O>> | Promise<AsyncIterable<InferGraphQLType<O>>>>

type InferedGraphQLFieldConfigArgumentMap<A extends TypedGraphQLFieldConfigArgumentMap> = Simplify<{
  [P in keyof A]: InferGraphQLType<A[P]["type"]>
}>

type TypedGraphQLResolver<T, C, A extends TypedGraphQLFieldConfigArgumentMap, O extends Constructor> = Omit<GraphQLFieldConfig<T, C>, "type" | "args" | "resolve" | "astNode"> & { type: O, args?: A, resolve?: InferedGraphQLFieldResolver<T, C, InferedGraphQLFieldConfigArgumentMap<A>, O>, subscribe?: InferedGraphQLFieldSubscriptionResolver<T, C, InferedGraphQLFieldConfigArgumentMap<A>, O> }

export const gqlresolver = <T, C, A extends TypedGraphQLFieldConfigArgumentMap, O extends Constructor>(config: TypedGraphQLResolver<T, C, A, O> & { allowInput?: boolean | "optional" }) => {
  return (unknown: unknown, context: ClassFieldDecoratorContext) => {
    gqlpropMap(context.metadata).set(context.name, { ...config, only: config.allowInput ? undefined : "output", optional: config.allowInput === "optional" ? true : undefined })
  }
}

export const gqlResolver = <T, C, A extends TypedGraphQLFieldConfigArgumentMap, O extends Constructor>(config: TypedGraphQLResolver<T, C, A, O>) => {
  return convertTypedFieldConfigToFieldConfig("", "", config) as GraphQLFieldConfig<T, C, any>
}

export const gqlArgsObject = <A extends TypedGraphQLFieldConfigArgumentMap>(name: string, fields: A) => {
  const ArgsClass = class {}

  const inputFields = {} as Record<string, GraphQLInputFieldConfig>
  const inputType = new GraphQLInputObjectType({
    name,
    fields: () => inputFields,
  })

  gqlclassMap.set(ArgsClass, { input: inputType })

  for (const [key, config] of Object.entries(fields)) {
    inputFields[String(key)] = convertTypedFieldConfigToInputFieldConfig(name!, String(key), config)
  }

  if (!Object.keys(inputFields).length) {
    inputFields["_dummy"] = {
      type: GraphQLVoid,
    }
  }

  return {
    args: {
      type: nullable(ArgsClass as Constructor as Constructor<InferedGraphQLFieldConfigArgumentMap<A>>),
    },
  }
}

class Nullable_<T> {}
export const nullable = <T>(type: Constructor<T>): Constructor<T | null | undefined> & { ofType: Constructor<T>, nullable: true } => {
  return class extends Nullable_<T> {
    static readonly ofType = type
    static readonly nullable = true
  } as any
}

class ListOf_<T> {}
export const listOf = <T>(type: Constructor<T>): Constructor<T[]> & { ofType: Constructor<T>, list: true } => {
  return class extends ListOf_<T> {
    static readonly ofType = type
    static readonly list = true
  } as any
}

class Lazy_<T> {}
export const lazy = <T>(type: () => Constructor<T>): Constructor<T> & { ofType: Constructor<T>, lazy: true } => {
  return class extends Lazy_<T> {
    static readonly ofType = type
    static readonly lazy = true
  } as any
}

class Enum_<O> {}
export const defineGraphQLEnum = <O extends readonly string[]>(name: string, options: O): Constructor<O[number]> & { ofOptions: O[number] } => {
  class EnumClass extends Enum_<O> {
    static readonly ofOptions = options
  }

  const EnumObject = new GraphQLEnumType({
    name,
    values: options.reduce((r, o) => { r[o] = {}; return r; }, {} as GraphQLEnumValueConfigMap),
  })

  gqlclassMap.set(EnumClass, { output: EnumObject, input: EnumObject })

  return EnumClass as any
}

export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "output"): GraphQLOutputType | undefined
export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "input"): GraphQLInputType | undefined
export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "output" | "input"): GraphQLOutputType | GraphQLInputType | undefined {
  if (type === Void) {
    return GraphQLVoid
  }

  if (type.prototype instanceof Nullable_) {
    const result = gqlclassUnwrapIntoGraphQLType((type as any).ofType, kind as any)
    if (!result) {
      return undefined
    }

    if (result instanceof GraphQLNonNull) {
      return result.ofType
    } else {
      return result
    }
  }

  if (type.prototype instanceof ListOf_) {
    const result = gqlclassUnwrapIntoGraphQLType((type as any).ofType, kind as any)
    if (!result) {
      return undefined
    }

    return new GraphQLNonNull(new GraphQLList(result)) as any
  }

  if (type.prototype instanceof Lazy_) {
    const result = gqlclassUnwrapIntoGraphQLType((type as any).ofType(), kind as any)
    if (!result) {
      return undefined
    }

    return result
  }

  const result = gqlclassMap.get(type)?.[kind]
  if (!result) {
    return undefined
  }

  return new GraphQLNonNull(result) as any
}

export const extendGraphQLClass = <T>(schema: GraphQLSchema, toExtend: Constructor<T>, fields: Record<string, GraphQLFieldConfig<T, any, any>>) => {
  let outputType = gqlclassUnwrapIntoGraphQLType(toExtend, "output")! as GraphQLObjectType
  if (outputType instanceof GraphQLNonNull) {
    outputType = outputType.ofType as GraphQLObjectType
  }

  return extendGraphQLObjectType(schema, outputType, fields)
}
