import { ExecutionResult, GraphQLError, GraphQLSchema, Kind, parse, validate } from "graphql"
import { walk } from "jsr:@std/fs@^1.0.19/walk"
import { createHash } from "node:crypto"
import { compileQuery, isCompiledQuery } from "npm:graphql-jit@^0.8.7"
import { createGraphQLVariablesPruner } from "./createGraphQLVariablesPruner.ts"
import { Complexity, COMPLEXITY_ESTIMATORS, getComplexity } from "./graphql-complexity.ts"

export type GraphQLCompilerConfig = {
  schema: GraphQLSchema
  development?: boolean
}

export type GraphQLRequest = {
  query: string
  variables?: Record<string, any> | null | undefined
  operationName?: string | null | undefined
  extensions?: Record<string, any> | null | undefined
}

export type GraphQLCompiledExecutor<T = any, C extends Record<string, any> = any> = {
  operations: { name: string | undefined, type: string, selectionSet: string[] }[]
  execute: (root: unknown, context: C, variables: Record<string, unknown> | null | undefined) => Promise<ExecutionResult<T>>
  subscribe?: (root: unknown, context: C, variables: Record<string, unknown> | null | undefined) => Promise<ExecutionResult<T>> | AsyncIterableIterator<ExecutionResult<T>>
}

export class GraphQLCompiler {
  private readonly _queryCache = new Map<string, GraphQLCompiledExecutor>()

  private readonly _serverQueries = new Map<string, URL>()

  constructor(
    private _config: GraphQLCompilerConfig,
  ) {}

  async loadServerQueries(serverQueriesDir = "~/bundled/gql") {
    try {
      const serverQueriesDirUrl = new URL(import.meta.resolve(serverQueriesDir))
      for await (const serverQuery of walk(serverQueriesDirUrl)) {
        if (serverQuery.isFile) {
          const serverQueryUrl = new URL(import.meta.resolve(serverQuery.path))
          const serverQueryKey = "$" + String(serverQueryUrl).replace(String(serverQueriesDirUrl), "")
          this._serverQueries.set(serverQueryKey, serverQueryUrl)
        }
      }
    } catch {
      // ignore
    }
    for (const [query] of this._serverQueries) {
      try {
        await this.compile({ query })
      } catch (cause) {
        throw new Error(`Cannot compile query '${query}'`, { cause })
      }
    }
  }

  async compile<T>(request: Omit<GraphQLRequest, "variables">) {
    let {
      query,
      operationName,
    } = request

    const cacheKey = createHash("sha1")
      .update(`${operationName}|${query}`)
      .digest("hex")

    const existing = this._queryCache.get(cacheKey) as GraphQLCompiledExecutor<T> | undefined
    if (existing) {
      return existing
    }

    if (query.startsWith("$/")) {
      const queryUrl = this._serverQueries.get(query)
      if (!queryUrl) {
        throw new GraphQLError(`server query '${query}' does not exist`)
      }

      query = await Deno.readTextFile(queryUrl)
    }

    const document = parse(query, {
      maxTokens: 512,
      noLocation: !this._config.development,
    })

    const validationErrors = validate(this._config.schema, document, undefined, { maxErrors: 1 })
    if (validationErrors[0]) {
      throw validationErrors[0]
    }

    const compiledQuery = compileQuery(this._config.schema, document, operationName ?? undefined)
    if (!isCompiledQuery(compiledQuery)) {
      const error = compiledQuery.errors?.[0]

      if (error) {
        throw error
      } else {
        console.error(compiledQuery)
        throw new GraphQLError("Unexpected")
      }
    }

    const pruneVariables = createGraphQLVariablesPruner(this._config.schema, document)

    const validateComplexity = (variables: Record<string | symbol, unknown> | null | undefined, context: Record<string, any> | null | undefined) => {
      if (context?.ignoreComplexity) {
        return
      }

      const complexityValue = getComplexity({
        schema: this._config.schema,
        estimators: COMPLEXITY_ESTIMATORS,
        query: document,
        variables: variables ?? undefined,
        operationName: operationName ?? undefined,
      })

      if (complexityValue > Complexity.MAXIMUM) {
        throw new GraphQLError(`Query is too complex: ${complexityValue} / ${Complexity.MAXIMUM}`)
      }
    }

    const result: GraphQLCompiledExecutor<T> = {
      operations: document.definitions
        .filter(n => n.kind === Kind.OPERATION_DEFINITION)
        .filter(n => !operationName || n.name?.value === operationName)
        .map(n => ({
          name: n.name?.value,
          type: String(n.operation),
          selectionSet: n.selectionSet.selections
            .filter(s => s.kind === Kind.FIELD)
            .map(s => s.name.value),
        })),
      execute: async (root, context, variables) => {
        pruneVariables(variables)
        validateComplexity(variables, context)

        const result = await compiledQuery.query(root, context, variables)
        return result as any
      },
    }

    if (compiledQuery.subscribe) {
      result.subscribe = async (root, context, variables) => {
        pruneVariables(variables)
        validateComplexity(variables, context)

        const result = await compiledQuery.subscribe!(root, context, variables)
        return result as any
      }
    }

    this._queryCache.set(cacheKey, result)
    return result
  }

  get serverQueries() {
    return [...this._serverQueries.keys()]
  }
}
