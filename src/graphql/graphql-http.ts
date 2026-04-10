import { ExecutionResult, GraphQLError } from "graphql"
import { JSONPath } from "../json-path.ts"
import { GraphQLCompiledExecutor, GraphQLCompiler, GraphQLCompilerConfig, GraphQLRequest } from "./graphql-jit.ts"
import { HTTPException } from "hono/http-exception"
import { Context, Hono, HonoRequest } from "hono"
import { accepts } from "hono/accepts"
import { streamSSE } from "hono/streaming"

export type GraphQLRouterConfig<C extends Record<string, any> = any> = GraphQLCompilerConfig & {
  path: string
  createContext: (request: HonoRequest | undefined) => C | Promise<C>
}

export type GraphQLRouterContext = {
  readonly req?: HonoRequest
  readonly cache: {
    [key: string | symbol]: any
  }
}

export type GraphQLHttpRequest = GraphQLRequest & {
  readonly context: {
    readonly req: GraphQLRouterContext["req"]
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
    return 200
  }
  for (const error of errors) {
    let originalError = error.originalError
    while (originalError instanceof GraphQLError) {
      originalError = originalError.originalError
    }
    if (originalError instanceof HTTPException) {
      return originalError.status
    }
  }
  return 500
}

/**
 * mostly compatible with https://github.com/graphql/graphql-over-http/blob/main/spec/GraphQLOverHTTP.md
 */
export class GraphQLRouter<C extends Record<string, any> = any> extends Hono {
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
    return Object.assign(await this._config.createContext(context.req), {
      req: context.req,
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
    // this.get(`${this._config.path}/schema.gql`, async ctx => {
    //   ctx.response.type = "application/graphql"
    //   ctx.response.body = await Deno.readTextFile(`${appdataDir}/schema.gql`)
    // })

    // this.get(`${this._config.path}/schema.gql.ts`, async ctx => {
    //   ctx.response.type = "application/typescript"
    //   ctx.response.body = await Deno.readTextFile(`${appdataDir}/schema.gql.ts`)
    // })

    this.post(this._config.path, async ctx => {
      const contentType = ctx.req.header("Content-Type")

      let body = null as GraphQLRequest | null
      try {
        if (contentType.startsWith("multipart/form-data")) {
          body = parseGraphQLFormData(await ctx.req.formData())
        } else {
          body = await ctx.req.json()
        }
      } catch (error: any) {
        throw new HTTPException(400, error)
      }

      return await this.handleGraphQLRequest(ctx, body!)
    })

    this.get(this._config.path, async ctx => {
      const operationName = "GET" // MUST BE STATIC

      let query = ctx.req.query("query")
      if (!query?.startsWith("{") || !query?.endsWith("}")) {
        throw new HTTPException(400, {
          message: "Expected parameter format: ?query={/* graphql */}",
        })
      }
      query = `query ${operationName} ${query}`

      const variables = JSON.parse(ctx.req.query("variables") ?? "{}")

      return await this.handleGraphQLRequest(ctx, { query, variables, operationName })
    })
  }

  private async handleGraphQLRequest(ctx: Context, request: GraphQLRequest) {
    if (!request.query) {
      throw new HTTPException(400, {
        message: "GraphQLRequest.query is invalid",
      })
    }

    const accept = accepts(ctx, {
      header: "Accept",
      default: "application/json",
      supports: ["application/json", "application/graphql-response+json", "text/event-stream"],
    })

    // const charset = accepts(ctx, {
    //   header: "Accept-Encoding",
    //   default: "utf-8",
    //   supports: ["utf-8"],
    // })

    let result: ExecutionResult<unknown, Record<string, unknown>> = {}
    try {
      const query = await this._compiler.compile(request)
      console.log(
        ...query.operations
          .flatMap(o => o.selectionSet.map(f => `gql:${o.type} ${o.name ? `${o.name}/` : ""}${f}`))
      )

      if (accept === "text/event-stream") {
        return this.handleGraphQLSSE(ctx, request, query)
      }

      result = await this.execute({
        ...request,
        context: {
          req: ctx.req,
        },
      }, query)
    } catch (error: any) {
      result = {
        errors: [error],
      }
    }

    let status: any = 200

    result.errors = result.errors?.slice(0, 3)
    if (accept === "application/graphql-response+json") {
      status = getHttpStatusFromGraphQLErrors(result.errors)
    }

    for (const error of (result.errors ?? [])) {
      console.error(error)
    }

    const body = JSON.stringify({
      ...result,
      errors: result.errors?.map(e => e.toJSON?.() ?? { message: e.message }),
    })

    return ctx.body(body, status, {
      "Content-Type": accept,
    })
  }

  private handleGraphQLSSE(ctx: Context, request: GraphQLRequest, query: GraphQLCompiledExecutor) {
    return streamSSE(ctx, async stream => {
      const iterable = await this.subscribe({
        ...request,
        context: {
          req: ctx.req,
        },
      }, query)

      for await (const result of iterable) {
        try {
          stream.writeSSE({ data: JSON.stringify(result) })
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
    })
  }
}
