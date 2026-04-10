import { GraphQLArgumentConfig, GraphQLBoolean, GraphQLEnumType, GraphQLEnumValueConfigMap, GraphQLFieldConfig, GraphQLFieldResolver, GraphQLFloat, GraphQLID, GraphQLInputFieldConfig, GraphQLInputObjectType, GraphQLInputType, GraphQLInterfaceType, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLOutputType, GraphQLScalarType, GraphQLSchema, GraphQLString, GraphQLUnionType } from "graphql"
import { Constructor, InternalScalarConstructorRef, nullable, RunTyped, Simplify, Unknown, UnpackAdvancedConstructorType, Void } from "../runtyped.ts"
import { extendGraphQLObjectType } from "./graphql-helpers.ts"

declare module "../runtyped.ts" {
  export interface ReflectableFieldMetadata {
    gql?: TypedFieldConfig
  }
}

export const GraphQLUnknown = new GraphQLScalarType<unknown>({
  name: Unknown.name,
})

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

export class ID implements InternalScalarConstructorRef<string> {
  static readonly isID = true
  readonly __ref!: string
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
  args?: TypedGraphQLFieldConfigArgumentMap
}

const convertTypedFieldConfigToFieldConfig = (path: string, name: string, constructor: Constructor, config: TypedFieldConfig): GraphQLFieldConfig<any, any, any> => {
  path = `${path}.${name}`

  const type = gqlclassUnwrapIntoGraphQLType(constructor, "output")
  if (!type) {
    throw new Error(`Missing GraphQL type for property '${path}' of type '${constructor.name}'`)
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

const convertTypedFieldConfigToInputFieldConfig = (path: string, name: string, constructor: Constructor, config: TypedFieldConfig): GraphQLInputFieldConfig => {
  path = `${path}.${name}`

  let type = gqlclassUnwrapIntoGraphQLType(constructor, "input")
  if (!type) {
    throw new Error(`Missing GraphQL type for property '${path}' of type '${constructor.name}'`)
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

const _gqlclass = (name?: string, options?: { only?: "output" | "input", isInterface?: true, implements?: Constructor[] }) => {
  return (target: Constructor<any>, context: ClassDecoratorContext) => {
    name ??= context.name

    context.addInitializer(function () {
      if (options?.isInterface) {
        const interfaceFields = {} as Record<string, GraphQLFieldConfig<any, any, any>>
        const interfaceType = new GraphQLInterfaceType({
          name: `${name}`,
          fields: () => outputFields,
        })

        gqlclassMap.set(this, { output: interfaceType })

        const metadata = RunTyped.getFieldsWithMetadataEntry(target, "gql")!
        for (const [key, config] of metadata) {
          const constructor = RunTyped.getFieldType(target, key)!
          if (config.only !== "input") {
            interfaceFields[String(key)] = convertTypedFieldConfigToFieldConfig(name!, String(key), constructor, config)
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

      const metadata = RunTyped.getFieldsWithMetadataEntry(target, "gql")!
      for (const [key, config] of metadata) {
        const constructor = RunTyped.getFieldType(target, key)!
        if (config.only !== "input") {
          outputFields[String(key)] = convertTypedFieldConfigToFieldConfig(name!, String(key), constructor, config)
        }
        if (config.only !== "output") {
          inputFields[String(key)] = convertTypedFieldConfigToInputFieldConfig(name!, String(key), constructor, config)
        }
      }
    })
  }
}

type Awaitable<T> = T | Promise<T>

type TypedGraphQLArgumentConfig<T> = Omit<GraphQLArgumentConfig, "type"> & { type: T }

type TypedGraphQLFieldConfigArgumentMap = Record<string, TypedGraphQLArgumentConfig<any>>

type InferedGraphQLFieldResolver<T, C, A, O> = GraphQLFieldResolver<T, C, A, Awaitable<UnpackAdvancedConstructorType<O>>>

type InferedGraphQLFieldSubscriptionResolver<T, C, A, O> = GraphQLFieldResolver<T, C, A, Awaitable<AsyncIterable<UnpackAdvancedConstructorType<O>>>>

type InferedGraphQLFieldConfigArgumentMap<A extends TypedGraphQLFieldConfigArgumentMap> = Simplify<{
  [P in keyof A]: UnpackAdvancedConstructorType<A[P]["type"]>
}>

type TypedGraphQLResolver<T, C, A extends TypedGraphQLFieldConfigArgumentMap, O extends Constructor> = Omit<GraphQLFieldConfig<T, C>, "type" | "args" | "resolve" | "astNode"> & {
  type: O
  args?: A
  resolve?: InferedGraphQLFieldResolver<T, C, InferedGraphQLFieldConfigArgumentMap<A>, O>
  subscribe?: InferedGraphQLFieldSubscriptionResolver<T, C, InferedGraphQLFieldConfigArgumentMap<A>, O>
}

export const gqlclass = Object.assign(_gqlclass, {
  resolver: <T, C, A extends TypedGraphQLFieldConfigArgumentMap, O extends Constructor>(config: TypedGraphQLResolver<T, C, A, O> & { allowInput?: boolean | "optional" }) => {
    return RunTyped.field(config.type, {
      gql: {
        ...config,
        only: config.allowInput ? undefined : "output",
        optional: config.allowInput === "optional" ? true : undefined,
      },
    })
  },
})

export const gqlResolver = <T, C, A extends TypedGraphQLFieldConfigArgumentMap, O extends Constructor>(config: TypedGraphQLResolver<T, C, A, O>) => {
  return convertTypedFieldConfigToFieldConfig("", "", config.type, config) as GraphQLFieldConfig<T, C, any>
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
    inputFields[String(key)] = convertTypedFieldConfigToInputFieldConfig(name!, String(key), config.type, config)
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

class __Enum {}
export const declareGraphQLEnum = <const O extends readonly string[]>(name: string, options: O): Constructor<O[number]> & { isEnum: true } => {
  class EnumClass extends __Enum {
    static readonly isEnum = true
  }

  const EnumObject = new GraphQLEnumType({
    name,
    values: options.reduce((r, o) => { r[o] = {}; return r; }, {} as GraphQLEnumValueConfigMap),
  })

  gqlclassMap.set(EnumClass, { output: EnumObject, input: EnumObject })

  return EnumClass as any
}

class __Union {}
export const declareGraphQLUnion = <const O extends readonly Constructor[]>(name: string, types: O): Constructor<O[number]> & { ofTypes: O } => {
  class UnionClass extends __Union {
    static readonly ofTypes = types
  }

  const UnionObject = new GraphQLUnionType({
    name,
    types: types.map(t => gqlclassUnwrapIntoGraphQLType(t, "output") as any),
  })

  gqlclassMap.set(UnionClass, { output: UnionObject })

  return UnionClass as any
}

export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "output"): GraphQLOutputType | undefined
export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "input"): GraphQLInputType | undefined
export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "output" | "input"): GraphQLOutputType | GraphQLInputType | undefined
export function gqlclassUnwrapIntoGraphQLType(type: Constructor, kind: "output" | "input"): GraphQLOutputType | GraphQLInputType | undefined {
  if (type === Void) {
    return GraphQLVoid
  }
  if (type === Unknown) {
    return GraphQLUnknown
  }

  if (RunTyped.isNullable(type)) {
    const result = gqlclassUnwrapIntoGraphQLType(type.ofType, kind)
    if (!result) {
      return undefined
    }

    if (result instanceof GraphQLNonNull) {
      return result.ofType
    } else {
      return result
    }
  }

  if (RunTyped.isArray(type)) {
    const result = gqlclassUnwrapIntoGraphQLType(type.ofType, kind)
    if (!result) {
      return undefined
    }

    return new GraphQLNonNull(new GraphQLList(result)) as any
  }

  if (RunTyped.isUnion(type)) {
    let output = gqlclassMap.get(type)?.output
    if (!output) {
      output = new GraphQLUnionType({
        name: type.publicName ?? `UnionOf_${type.ofTypes.map(t => t.name).join("_")}`,
        types: type.ofTypes
          .map(t => gqlclassUnwrapIntoGraphQLType(t, "output") as GraphQLObjectType)
          .map(t => t instanceof GraphQLNonNull ? t.ofType : t),
      })
      gqlclassMap.set(type, { output })
    }

    return new GraphQLNonNull(output) as any
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
