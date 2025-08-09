import { Application, Middleware, Router } from "@oak/oak"
import { oakCors } from "jsr:@tajpouria/cors@^1.2.1"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { oakJsonError, oakLoadCounter, oakLogger, oakResponseTime } from "./oak-helpers.ts"

export type HttpServerConfig = {
  development?: boolean
  host: string
  port: number
  behindProxy: boolean
  https?: {
    key: string
    cert: string
  }
  staticDir: string
  static404File: string
  staticVolatileFilesMap: Record<string, boolean>
  prefix?: string
  sendSecurityHeaders?: boolean
}

const httpsConfig = (config: HttpServerConfig) => {
  if (!config.https) {
    return undefined
  }

  const httpsConfig = {
    key: Deno.readTextFileSync(config.https.key),
    cert: Deno.readTextFileSync(config.https.cert),
  }

  return httpsConfig
}

export type ApplicationState = {
  [k: string]: any
}

export const createApplication = (config: HttpServerConfig, middlewares: (Router | Middleware | undefined)[]) => {
  const app = new Application<ApplicationState>({
    proxy: config.behindProxy,
    // logErrors: false,
  })

  app.use(oakLogger(config.development ? "full" : "simple"))
  app.use(oakLoadCounter())

  if (config.development) {
    app.use(oakResponseTime())
  }

  app.use(oakCors({
    origin: "*",
    allowedHeaders: ["Content-Type", "Authorization"],
  }))

  app.use(oakJsonError({
    pretty: config.development,
    stacktrace: config.development,
  }))

  if (config.behindProxy) {
    app.use(async (ctx, next) => {
      ctx.response.headers.set("Keep-Alive", "timeout=60")

      await next()
    })
  }
  if (!config.behindProxy || config.sendSecurityHeaders) {
    app.use(async (ctx, next) => {
      // form-action 'self';
      ctx.response.headers.set("Content-Security-Policy", "script-src 'self'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'; worker-src 'self' blob:; trusted-types *;")

      ctx.response.headers.set("X-Frame-Options", "SAMEORIGIN")
      ctx.response.headers.set("X-Content-Type-Options", "nosniff")
      ctx.response.headers.set("X-XSS-Protection", "1; mode=block;")
      ctx.response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains;")
      ctx.response.headers.set("Referrer-Policy", "no-referrer")

      await next()
    })
  }

  const router = new Router({ prefix: config.prefix || undefined })

  for (const middleware of middlewares) {
    if (!middleware) {
      continue
    }

    if (middleware instanceof Router) {
      router.use(middleware.routes())
      router.use(middleware.allowedMethods())
    } else {
      router.use(middleware)
    }
  }

  app.use(router.routes())
  app.use(router.allowedMethods())

  if (config.staticDir && existsSync(config.staticDir)) {
    app.use(async (ctx, next) => {
      let path = ctx.request.url.pathname
      if (config.prefix) {
        if (!path.startsWith(config.prefix)) {
          await next()
          return
        }
        path = path.replace(config.prefix, "")
        if (!path) {
          path = "/"
        }
      }
      if (path.endsWith("/")) {
        path = config.static404File
      }
      if (!existsSync(join(config.staticDir, path))) {
        path = config.static404File
      }

      await ctx.send({
        path,
        root: config.staticDir,
        immutable: !config.staticVolatileFilesMap[path],
      })
    })
  }

  return app
}

export const createHttpRedirectServer = (config: { host: string, port: number }) => {
  return new Promise(resolve => {
    Deno.serve({
      hostname: config.host,
      port: 80,
      handler: request => {
        const redirectUrl = new URL(request.url)
        redirectUrl.protocol = "https:"
        redirectUrl.port = String(config.port)

        const response = Response.redirect(redirectUrl, 301)
        return response
      },
      onListen: resolve,
    })
  })
}

export const listen = (config: HttpServerConfig, middlewares: (Router | Middleware | undefined)[]) => {
  const app = createApplication(config, middlewares)
  app.listen({
    hostname: config.host,
    port: config.port,
    ...httpsConfig(config),
  })

  const listeners = [
    new Promise(r => app.addEventListener("listen", r)),
  ]

  if (config.https && !config.behindProxy && config.port === 443) {
    listeners.push(createHttpRedirectServer(config))
  }

  return Object.assign(app, {
    url: new URL(`${config.https ? "https" : "http"}://${config.host}:${config.port}`),
    onListen: Promise.all(listeners),
  })
}
