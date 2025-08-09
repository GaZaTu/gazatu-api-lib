import { Context, HttpError, Request, Router, Status } from "@oak/oak"
import { ExecutionResult, GraphQLError } from "graphql"
import { appdataDir } from "../appinfo.ts"
import { JSONPath } from "../json-path.ts"
import { GraphQLCompiledExecutor, GraphQLCompiler, GraphQLCompilerConfig, GraphQLRequest } from "./graphql-jit.ts"

export type GraphQLRouterConfig<C extends Record<string, any> = any> = GraphQLCompilerConfig & {
  path: string
  createContext: (request: Request | undefined) => C | Promise<C>
}

export type GraphQLRouterContext = {
  readonly request?: Request
  readonly cache: {
    [key: string | symbol]: any
  }
}

export type GraphQLHttpRequest = GraphQLRequest & {
  readonly context: {
    readonly request: GraphQLRouterContext["request"]
    readonly ignoreComplexity?: boolean
    readonly throwErrors?: boolean
  }
}

const parseGraphQLFormData = (formdata: FormData) => {
  const graphqlJson = formdata.get("graphql")
  if (typeof graphqlJson !== "string") {
    throw new Error("Expected form value 'graphql' of type 'string'")
  }

  const body: GraphQLRequest = JSON.parse(graphqlJson)
  body.variables ??= {}

  for (const [partPath, partValue] of formdata) {
    if (!partPath.startsWith("$")) {
      continue
    }

    JSONPath.write(body.variables, partPath, partValue)
  }

  return body
}

const getHttpStatusFromGraphQLErrors = (errors?: readonly GraphQLError[]) => {
  if (!errors?.length) {
    return Status.OK
  }
  for (const error of errors) {
    let originalError = error.originalError
    while (originalError instanceof GraphQLError) {
      originalError = originalError.originalError
    }
    if (originalError instanceof HttpError) {
      return originalError.status
    }
  }
  return Status.InternalServerError
}

/**
 * mostly compatible with https://github.com/graphql/graphql-over-http/blob/main/spec/GraphQLOverHTTP.md
 */
export class GraphQLRouter<C extends Record<string, any> = any> extends Router {
  private _compiler: GraphQLCompiler

  constructor(
    private _config: GraphQLRouterConfig<C>,
  ) {
    super()
    this._compiler = new GraphQLCompiler(this._config)
    this.registerGraphQLRoutes()
  }

  async loadServerQueries(serverQueriesDir?: string) {
    await this._compiler.loadServerQueries(serverQueriesDir)
  }

  private async createGraphQLContext(context: GraphQLHttpRequest["context"]) {
    return Object.assign(await this._config.createContext(context.request), {
      request: context.request,
      cache: {},
      ignoreComplexity: context.ignoreComplexity,
    })
  }

  async execute<T = any>(request: GraphQLHttpRequest, query?: GraphQLCompiledExecutor<T>) {
    query ??= await this._compiler.compile<T>(request)

    const context = await this.createGraphQLContext(request.context)
    const variables = request.variables

    const result = await query.execute({}, context, variables)
    if (request.context?.throwErrors && result.errors?.length) {
      const cause = result.errors[0]!
      throw new Error(cause.message, { cause })
    }

    return result
  }

  async subscribe<T = any>(request: GraphQLHttpRequest, query?: GraphQLCompiledExecutor<T>) {
    query ??= await this._compiler.compile<T>(request)
    if (!query.subscribe) {
      throw new Error("cannot subscribe to query")
    }

    const context = await this.createGraphQLContext(request.context)
    const variables = request.variables

    const result = await query.subscribe({}, context, variables)
    const errors = (result as ExecutionResult).errors
    if (errors?.length) {
      const cause = errors[0]!
      throw new Error(cause.message, { cause })
    }

    const iterator = result as AsyncIterable<ExecutionResult<T, Record<string, unknown>>>
    return iterator
  }

  private registerGraphQLRoutes() {
    this.get(`${this._config.path}/schema.gql`, async ctx => {
      ctx.response.type = "application/graphql"
      ctx.response.body = await Deno.readTextFile(`${appdataDir}/schema.gql`)
    })

    this.get(`${this._config.path}/schema.gql.ts`, async ctx => {
      ctx.response.type = "application/typescript"
      ctx.response.body = await Deno.readTextFile(`${appdataDir}/schema.gql.ts`)
    })

    this.post(this._config.path, async ctx => {
      let body = null as GraphQLRequest | null
      switch (ctx.request.body.type()) {
      case "form-data":
        try {
          body = parseGraphQLFormData(await ctx.request.body.formData())
        } catch (error: any) {
          throw ctx.throw(Status.BadRequest, error.message)
        }
        break
      default:
        body = await ctx.request.body.json()
        break
      }

      await this.handleGraphQLRequest(ctx, body!)
    })

    this.get(this._config.path, async ctx => {
      const operationName = "GET" // MUST BE STATIC

      let query = ctx.request.url.searchParams.get("query")
      if (!query?.startsWith("{") || !query?.endsWith("}")) {
        throw ctx.throw(Status.BadRequest, "Expected parameter format: ?query={/* graphql */}")
      }
      query = `query ${operationName} ${query}`

      const variables = JSON.parse(ctx.request.url.searchParams.get("variables") ?? "{}")

      await this.handleGraphQLRequest(ctx, { query, variables, operationName })
    })
  }

  private async handleGraphQLRequest(ctx: Context, request: GraphQLRequest) {
    if (!request.query) {
      throw ctx.throw(Status.BadRequest, "GraphQLRequest.query is invalid")
    }

    let accept = ctx.request.accepts("application/graphql-response+json", "application/json", "text/event-stream")
    if (!accept) {
      accept = "application/json"
    }

    let charset = ctx.request.acceptsEncodings("utf-8")
    if (!charset) {
      charset = "utf-8"
    }

    let response: ExecutionResult<unknown, Record<string, unknown>> = {}
    try {
      const query = await this._compiler.compile(request)

      ctx.state._log ??= []
      ctx.state._log.push(
        ...query.operations
          .flatMap(o => o.selectionSet.map(f => `gql:${o.type} ${o.name ? `${o.name}/` : ""}${f}`))
      )

      if (accept === "text/event-stream") {
        await this.handleGraphQLSSE(ctx, request, query)
        return
      }

      response = await this.execute({
        ...request,
        context: ctx,
      }, query)
    } catch (error: any) {
      response = {
        errors: [error],
      }
    }

    ctx.response.status = Status.OK

    response.errors = response.errors?.slice(0, 3)
    if (accept === "application/graphql-response+json") {
      ctx.response.status = getHttpStatusFromGraphQLErrors(response.errors)
    }

    for (const error of (response.errors ?? [])) {
      console.error(error)
    }

    ctx.response.type = `${accept}; charset=${charset}`
    ctx.response.body = {
      ...response,
      errors: response.errors?.map(e => e.toJSON()),
    }
  }

  private async handleGraphQLSSE(ctx: Context, request: GraphQLRequest, query: GraphQLCompiledExecutor) {
    const stream = await ctx.sendEvents({ keepAlive: true })

    const iterable = await this.subscribe({
      ...request,
      context: ctx,
    }, query)

    for await (const result of iterable) {
      try {
        stream.dispatchMessage(JSON.stringify(result))
        if (stream.closed) {
          break
        }
      } catch (error) {
        console.error("GQL+SSE error", error)
        break
      }
    }

    try {
      await stream.close()
    } catch {
      // ignore
    }
  }
}
