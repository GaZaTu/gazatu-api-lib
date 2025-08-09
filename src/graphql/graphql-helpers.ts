import { GraphQLFieldConfig, GraphQLFieldConfigArgumentMap, GraphQLObjectType, GraphQLSchema, ThunkObjMap } from "graphql"
import { stitchSchemas as _stitchSchemas } from "npm:@graphql-tools/stitch@9.4.27"

export type TypedGraphQLResolverMap<C> = {
  Query?: ThunkObjMap<GraphQLFieldConfig<Record<any, any>, C, any>>
  Mutation?: ThunkObjMap<GraphQLFieldConfig<Record<any, any>, C, any>>
  Subscription?: ThunkObjMap<GraphQLFieldConfig<Record<any, any>, C, any>>
  extend?: (schema: GraphQLSchema) => GraphQLSchema
}

const buildGraphQLOperationObject = <K extends keyof TypedGraphQLResolverMap<C>, C>(name: K, resolvers: TypedGraphQLResolverMap<C>[]) => {
  const fields = resolvers
    .filter(r => !!r[name])
    .flatMap(r => Object.entries(r[name]!))
  if (!fields.length) {
    return undefined
  }

  return new GraphQLObjectType({
    name,
    fields: Object.fromEntries(fields),
  })
}

export const buildGraphQLSchema = <C>(resolvers: TypedGraphQLResolverMap<C>[]) => {
  let schema = new GraphQLSchema({
    query: buildGraphQLOperationObject("Query", resolvers),
    mutation: buildGraphQLOperationObject("Mutation", resolvers),
    subscription: buildGraphQLOperationObject("Subscription", resolvers),
  })

  for (const { extend } of resolvers) {
    if (extend) {
      schema = extend(schema)
    }
  }

  return schema
}

export const stitchSchemas = _stitchSchemas

export const extendGraphQLObjectType = <T>(schema: GraphQLSchema, toExtend: GraphQLObjectType<T>, fields: Record<string, GraphQLFieldConfig<T, any, any>>) => {
  const argsToString = (args: GraphQLFieldConfigArgumentMap | undefined) => {
    if (!args?.length) {
      return ""
    }

    return `(${Object.entries(args).map(([a, c]) => `${a}: ${c.type}`)})`
  }

  const deprecationToString = (deprecation: string | undefined | null) => {
    if (!deprecation) {
      return ""
    }

    return `@deprecated(reason: "${deprecation}")`
  }

  return stitchSchemas({
    subschemas: [schema],
    typeDefs: `
      extend type ${toExtend.name} {
        ${Object.entries(fields)
          .map(([f, c]) => `${f}${argsToString(c.args)}: ${c.type} ${deprecationToString(c.deprecationReason)}`)
          .join("\n")
        }
      }
    `,
    resolvers: {
      [toExtend.name]: {
        ...Object.entries(fields)
          .reduce((r, [f, c]) => {
            r[f] = {
              ...c,
              args: [] as any,
            }

            return r
          }, {} as Record<string, GraphQLFieldConfig<T, any, any>>),
      },
    },
  })
}
